package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/projectrepos"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
)

// projectView is the v2 synchronous repository resource. It intentionally exposes no local
// mirror path, credential, execution Workspace or nonexistent Cloud Space/Operation. The token's
// ciphertext never leaves the backend; only whether one is configured and when it changed appear.
type projectView struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenantId"`
	OwnerUserID   string    `json:"ownerUserId"`
	Name          string    `json:"name"`
	RepositoryURL string    `json:"repositoryUrl"`
	DefaultBranch string    `json:"defaultBranch"`
	CommitID      string    `json:"commitId"`
	CreatedAt     time.Time `json:"createdAt"`
	// RepositoryTokenConfigured reports whether a private-repository token is set.
	RepositoryTokenConfigured bool `json:"repositoryTokenConfigured"`
	// RepositoryTokenSetAt is when the token was last set, replaced or cleared, if ever.
	RepositoryTokenSetAt *time.Time `json:"repositoryTokenSetAt,omitempty"`
	// SyncAt is when the last successful manual sync completed, if any.
	SyncAt *time.Time `json:"syncAt,omitempty"`
	// SyncError is a user-facing reason for the last failed or interrupted sync; empty means none.
	SyncError string `json:"syncError,omitempty"`
	// SyncForcePushed notes that the last successful sync followed a rewritten remote branch.
	SyncForcePushed bool `json:"syncForcePushed,omitempty"`
	// SyncRunning marks an in-flight manual sync.
	SyncRunning bool `json:"syncRunning,omitempty"`
}

func projectResponse(scope execution.Scope, p store.Project) projectView {
	return projectView{p.ID, scope.TenantID, p.OwnerUserID, p.Name, p.RepositoryURL, p.Branch, p.Commit, p.CreatedAt,
		len(p.RepositoryTokenSealed) > 0, p.RepositoryTokenSetAt, p.SyncAt, p.SyncError, p.SyncForcePushed, p.SyncRunning}
}

func (h *handler) projects(w http.ResponseWriter, r *http.Request, a access) {
	if h.opts.Projects == nil {
		fault(w, http.StatusServiceUnavailable, "projects_unavailable")
		return
	}
	tenant, id := a.TenantID, r.PathValue("pid")
	if id != "" && !scheduleUUID.MatchString(id) {
		fault(w, http.StatusNotFound, "not_found")
		return
	}
	scope := execution.Scope{TenantID: tenant, UserID: a.UserID}
	if r.Method == http.MethodPost {
		var in projectrepos.Input
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&in); err != nil {
			fault(w, http.StatusBadRequest, "invalid_json")
			return
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			fault(w, http.StatusBadRequest, "invalid_json")
			return
		}
		project, err := h.opts.Projects.Create(r.Context(), scope, in)
		if err != nil {
			projectFault(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, projectResponse(scope, project))
		return
	}
	if id != "" {
		project, err := h.opts.Projects.Get(r.Context(), scope, id)
		if err != nil {
			projectFault(w, err)
			return
		}
		writeJSON(w, http.StatusOK, projectResponse(scope, project))
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		var err error
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			fault(w, 400, "invalid_pagination")
			return
		}
	}
	after := r.URL.Query().Get("after")
	if after != "" && !scheduleUUID.MatchString(after) {
		fault(w, 400, "invalid_pagination")
		return
	}
	projects, err := h.opts.Projects.List(r.Context(), scope)
	if err != nil {
		projectFault(w, err)
		return
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].ID < projects[j].ID })
	items := make([]projectView, 0)
	next := ""
	for _, project := range projects {
		if project.ID <= after {
			continue
		}
		if len(items) == limit {
			next = items[len(items)-1].ID
			break
		}
		items = append(items, projectResponse(scope, project))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "nextCursor": next})
}

func projectFault(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, execution.ErrNotFound):
		fault(w, 404, "not_found")
	case errors.Is(err, execution.ErrInvalidRequest):
		fault(w, 400, "invalid_project")
	case errors.Is(err, projectrepos.ErrRepositoryUnavailable):
		fault(w, 400, "repository_unavailable")
	case errors.Is(err, projectrepos.ErrTokenUnavailable):
		fault(w, 400, "project_token_unavailable")
	case errors.Is(err, execution.ErrConflict):
		fault(w, 409, "project_conflict")
	default:
		internal(w, "project", err)
	}
}

// projectSync pulls the project's bound branch once. A second click during the pull shares the same
// in-flight sync. Failures leave the snapshot unchanged and are written to the project's SyncError.
func (h *handler) projectSync(w http.ResponseWriter, r *http.Request, a access) {
	if h.opts.Projects == nil {
		fault(w, http.StatusServiceUnavailable, "projects_unavailable")
		return
	}
	scope := a.scope()
	id := r.PathValue("pid")
	if !scheduleUUID.MatchString(id) {
		fault(w, http.StatusNotFound, "not_found")
		return
	}
	result, err := h.opts.Projects.Sync(r.Context(), scope, id)
	if err != nil {
		projectFault(w, err)
		return
	}
	writeJSON(w, http.StatusOK, projectResponse(scope, result.Project))
}

// projectToken sets or clears the project's private-repository token. Only the tenant owner or the
// project creator may change it; the token never appears in the response.
func (h *handler) projectToken(w http.ResponseWriter, r *http.Request, a access) {
	if h.opts.Projects == nil {
		fault(w, http.StatusServiceUnavailable, "projects_unavailable")
		return
	}
	scope := a.scope()
	id := r.PathValue("pid")
	if !scheduleUUID.MatchString(id) {
		fault(w, http.StatusNotFound, "not_found")
		return
	}
	project, err := h.opts.Projects.Get(r.Context(), scope, id)
	if err != nil {
		projectFault(w, err)
		return
	}
	if !a.Owner() && project.OwnerUserID != a.UserID {
		fault(w, http.StatusForbidden, "forbidden")
		return
	}
	var updated store.Project
	if r.Method == http.MethodDelete {
		updated, err = h.opts.Projects.ClearRepositoryToken(r.Context(), scope, id)
	} else {
		var body struct {
			Token string `json:"token"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			fault(w, http.StatusBadRequest, "invalid_json")
			return
		}
		updated, err = h.opts.Projects.SetRepositoryToken(r.Context(), scope, id, body.Token)
	}
	if err != nil {
		projectFault(w, err)
		return
	}
	writeJSON(w, http.StatusOK, projectResponse(scope, updated))
}
