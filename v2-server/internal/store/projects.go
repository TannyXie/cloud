package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
)

// Project is a tenant-shared, prepared repository snapshot. MirrorPath is backend-only and
// must not be copied into public HTTP responses. Preparing the mirror belongs to the runtime.
type Project struct {
	SpaceID       string
	ID            string
	OwnerUserID   string
	Name          string
	RepositoryURL string
	Branch        string
	Commit        string
	MirrorPath    string
	SnapshotRef   string
	CreatedAt     time.Time
	// RepositoryTokenSealed is the AES-256-GCM ciphertext of the project's optional HTTPS token.
	// It is backend-only: the HTTP layer must never serialize it, and it is bound to the tenant,
	// project and repository URL so a copied ciphertext cannot be opened elsewhere.
	RepositoryTokenSealed []byte
	// RepositoryTokenSetAt records when the token was last set, replaced or cleared.
	RepositoryTokenSetAt *time.Time
	// SyncAt records the last successful manual sync.
	SyncAt *time.Time
	// SyncError is a user-facing reason when the last sync failed; empty means no failure.
	SyncError string
	// SyncForcePushed marks that the last successful sync followed a rewritten remote branch.
	SyncForcePushed bool
	// SyncRunning marks an in-flight manual sync. A restarted process resets stale flags.
	SyncRunning bool
}

// CreateProject retains a prepared project in the caller's tenant; tenant access is checked by the caller.
// Its ID must be a server-generated random identity, never a caller-selected ID.
func (s *Store) CreateProject(ctx context.Context, scope execution.Scope, project Project) (Project, error) {
	if project.ID == "" || project.Name == "" || project.RepositoryURL == "" || project.Commit == "" || project.MirrorPath == "" {
		return Project{}, execution.ErrInvalidRequest
	}
	if project.CreatedAt.IsZero() {
		if err := s.pool.QueryRow(ctx, `SELECT now()`).Scan(&project.CreatedAt); err != nil {
			return Project{}, err
		}
	}
	project.CreatedAt = project.CreatedAt.UTC()
	// The authenticated creator is authoritative even when a caller supplied another owner.
	project.OwnerUserID = scope.UserID
	if project.SpaceID != "" {
		if e := requireSpace(ctx, s.pool, scope.TenantID, project.SpaceID); e != nil {
			return Project{}, execution.ErrInvalidRequest
		}
	} else if e := s.pool.QueryRow(ctx, `select id from v2_spaces where tenant_id=$1 and slug=$2 and archived_at is null`, scope.TenantID, DemoSpaceSlug).Scan(&project.SpaceID); e != nil {
		return Project{}, executionError(e)
	}
	raw, err := json.Marshal(project)
	if err != nil {
		return Project{}, err
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO v2_projects(id,tenant_id,data,plugin_space_id) VALUES($1,$2,$3,$4)`, project.ID, scope.TenantID, raw, project.SpaceID)
	return project, executionError(err)
}

// UpdateProject replaces a project's stored record after the runtime advanced its snapshot, sync
// state or token. The caller serializes concurrent mutations of the same project.
func (s *Store) UpdateProject(ctx context.Context, scope execution.Scope, project Project) (Project, error) {
	if project.ID == "" {
		return Project{}, execution.ErrInvalidRequest
	}
	raw, err := json.Marshal(project)
	if err != nil {
		return Project{}, err
	}
	tag, err := s.pool.Exec(ctx, `UPDATE v2_projects SET data=$3 WHERE id=$1 AND tenant_id=$2::uuid`, project.ID, scope.TenantID, raw)
	if err != nil {
		return Project{}, executionError(err)
	}
	if tag.RowsAffected() == 0 {
		return Project{}, execution.ErrNotFound
	}
	return project, nil
}

func (s *Store) GetProject(ctx context.Context, scope execution.Scope, id string) (Project, error) {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM v2_projects WHERE id=$1 AND tenant_id=$2::uuid`, id, scope.TenantID).Scan(&raw); err != nil {
		return Project{}, executionError(err)
	}
	var project Project
	err := json.Unmarshal(raw, &project)
	return project, err
}

// ListProjects lists the tenant's prepared projects in stable name/identity order.
func (s *Store) ListProjects(ctx context.Context, scope execution.Scope) ([]Project, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM v2_projects WHERE tenant_id=$1::uuid ORDER BY data->>'Name',id`, scope.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := []Project{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var project Project
		if err := json.Unmarshal(raw, &project); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

// ClearStaleSyncs marks every project that a previous process left mid-sync as interrupted. It runs
// once at startup; mirrors may retain unreferenced objects, which are harmless.
func (s *Store) ClearStaleSyncs(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `UPDATE v2_projects SET data = data || jsonb_build_object('SyncRunning', false, 'SyncError', '上次同步被中断，请重新同步。') WHERE data->>'SyncRunning' = 'true'`)
	return executionError(err)
}
