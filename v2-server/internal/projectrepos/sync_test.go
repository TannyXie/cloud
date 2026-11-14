//go:build linux

package projectrepos

import (
	"encoding/base64"
	"net/http"
	"net/http/cgi"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
	"github.com/wanglongan587/cloud/v2-server/internal/store/storetest"
)

func projectGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.CommandContext(t.Context(), "git", args...)
	cmd.Dir = dir
	cmd.Env = []string{"PATH=/usr/bin:/bin", "HOME=/dev/null", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "GIT_TERMINAL_PROMPT=0"}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v %s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// syncGitRemote serves one bare repository over HTTP for reads and returns the bare path so tests can
// push new commits locally; it counts the info/refs probes so a test can assert how often Cloud
// contacted the remote.
func syncGitRemote(t *testing.T) (*httptest.Server, string, string, *atomic.Int64) {
	t.Helper()
	root := t.TempDir()
	work := filepath.Join(root, "work")
	if err := os.Mkdir(work, 0700); err != nil {
		t.Fatal(err)
	}
	projectGit(t, work, "init", "-b", "main")
	projectGit(t, work, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "initial")
	commit := projectGit(t, work, "rev-parse", "HEAD")
	bare := filepath.Join(root, "repo.git")
	projectGit(t, root, "clone", "--bare", work, bare)
	projectGit(t, bare, "config", "receive.denyDeleteCurrent", "ignore")
	backend := filepath.Join(projectGit(t, root, "--exec-path"), "git-http-backend")
	cgiHandler := &cgi.Handler{Path: backend, Root: "/", Dir: root, Env: []string{"GIT_PROJECT_ROOT=" + root, "GIT_HTTP_EXPORT_ALL=1", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null"}}
	probes := &atomic.Int64{}
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "info/refs") {
			probes.Add(1)
		}
		cgiHandler.ServeHTTP(w, r)
	}))
	t.Cleanup(remote.Close)
	return remote, bare, commit, probes
}

func syncService(t *testing.T) (*Service, *store.Store, execution.Scope) {
	t.Helper()
	s := storetest.Open(t)
	user, tenant := storetest.Login(t, s, "project-sync-owner")
	key := base64.StdEncoding.EncodeToString(make([]byte, 32))
	svc, err := New(s, Options{Root: t.TempDir(), AllowLoopbackHTTP: true, CredentialKey: key})
	if err != nil {
		t.Fatal(err)
	}
	return svc, s, execution.Scope{TenantID: tenant, UserID: user}
}

func TestSyncAdvancesCurrentSnapshotOnlyOnSuccess(t *testing.T) {
	remote, bare, initial, _ := syncGitRemote(t)
	svc, _, scope := syncService(t)
	project, err := svc.Create(t.Context(), scope, Input{Name: "Demo", RepositoryURL: remote.URL + "/repo.git", DefaultBranch: "main"})
	if err != nil {
		t.Fatal(err)
	}
	if project.Commit != initial {
		t.Fatalf("created at %s want %s", project.Commit, initial)
	}
	// Push a new commit on the remote, then sync.
	work := filepath.Join(t.TempDir(), "work")
	projectGit(t, filepath.Dir(work), "clone", "--quiet", bare, "work")
	projectGit(t, work, "-c", "user.name=F", "-c", "user.email=f@e.test", "commit", "--allow-empty", "-m", "second")
	next := projectGit(t, work, "rev-parse", "HEAD")
	projectGit(t, work, "push", "--quiet", "origin", "main")

	result, err := svc.Sync(t.Context(), scope, project.ID)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if result.ForcePushed || result.Project.Commit != next {
		t.Fatalf("sync result=%+v", result.Project)
	}
	oldSnapshot := SnapshotRef(project.ID, initial)
	if got := projectGit(t, result.Project.MirrorPath, "rev-parse", SnapshotRef(project.ID, next)); got != next {
		t.Fatalf("new snapshot=%q want %q", got, next)
	}
	if got := projectGit(t, result.Project.MirrorPath, "rev-parse", oldSnapshot); got != initial {
		t.Fatalf("old snapshot rewrote: %q", got)
	}
	if result.Project.SyncAt == nil || result.Project.SyncError != "" || result.Project.SyncRunning {
		t.Fatalf("sync state=%+v", result.Project)
	}
	// A repeated sync of the same commit stays quiet and keeps the snapshot.
	again, err := svc.Sync(t.Context(), scope, project.ID)
	if err != nil || again.Project.Commit != next || again.ForcePushed {
		t.Fatalf("repeat sync=%+v err=%v", again, err)
	}
}

func TestSyncFollowsForcePushedBranchAndKeepsOldSnapshot(t *testing.T) {
	remote, bare, initial, _ := syncGitRemote(t)
	svc, _, scope := syncService(t)
	project, err := svc.Create(t.Context(), scope, Input{Name: "Demo", RepositoryURL: remote.URL + "/repo.git", DefaultBranch: "main"})
	if err != nil {
		t.Fatal(err)
	}
	// Rewrite history: a fresh root commit, force-pushed over the branch.
	work := filepath.Join(t.TempDir(), "work")
	projectGit(t, filepath.Dir(work), "clone", "--quiet", bare, "work")
	projectGit(t, work, "checkout", "--orphan", "fresh")
	projectGit(t, work, "-c", "user.name=F", "-c", "user.email=f@e.test", "commit", "--allow-empty", "-m", "rewritten")
	rewritten := projectGit(t, work, "rev-parse", "HEAD")
	projectGit(t, work, "push", "--quiet", "--force", "origin", "fresh:main")

	result, err := svc.Sync(t.Context(), scope, project.ID)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if !result.ForcePushed || result.Project.Commit != rewritten {
		t.Fatalf("force-push sync=%+v", result.Project)
	}
	if got := projectGit(t, result.Project.MirrorPath, "rev-parse", SnapshotRef(project.ID, initial)); got != initial {
		t.Fatalf("old snapshot lost: %q", got)
	}
}

func TestSyncFailureKeepsCurrentSnapshotAndShowsReason(t *testing.T) {
	remote, bare, initial, _ := syncGitRemote(t)
	svc, _, scope := syncService(t)
	project, err := svc.Create(t.Context(), scope, Input{Name: "Demo", RepositoryURL: remote.URL + "/repo.git", DefaultBranch: "main"})
	if err != nil {
		t.Fatal(err)
	}
	// Delete the remote branch, then sync must fail and leave the snapshot.
	work := filepath.Join(t.TempDir(), "work")
	projectGit(t, filepath.Dir(work), "clone", "--quiet", bare, "work")
	projectGit(t, work, "push", "--quiet", "origin", ":main")

	if _, err := svc.Sync(t.Context(), scope, project.ID); err == nil {
		t.Fatal("sync of a deleted branch succeeded")
	}
	stored, err := svc.Get(t.Context(), scope, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Commit != initial || stored.SyncRunning || stored.SyncError == "" {
		t.Fatalf("failed sync state=%+v", stored)
	}
	if got := projectGit(t, stored.MirrorPath, "rev-parse", stored.SnapshotRef); got != initial {
		t.Fatalf("snapshot changed after failure: %q", got)
	}
}

func TestSyncRunsOncePerProject(t *testing.T) {
	remote, _, _, probes := syncGitRemote(t)
	svc, _, scope := syncService(t)
	project, err := svc.Create(t.Context(), scope, Input{Name: "Demo", RepositoryURL: remote.URL + "/repo.git", DefaultBranch: "main"})
	if err != nil {
		t.Fatal(err)
	}
	probes.Store(0)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.Sync(t.Context(), scope, project.ID)
			results <- err
		}()
	}
	wg.Wait()
	for range 2 {
		if err := <-results; err != nil {
			t.Fatalf("concurrent sync: %v", err)
		}
	}
	if got := probes.Load(); got != 1 {
		t.Fatalf("remote probed %d times, want 1", got)
	}
}

func TestRepositoryTokenSealsToBindingAndNeverLeaks(t *testing.T) {
	remote, _, _, _ := syncGitRemote(t)
	svc, _, scope := syncService(t)
	project, err := svc.Create(t.Context(), scope, Input{Name: "Demo", RepositoryURL: remote.URL + "/repo.git", DefaultBranch: "main"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetRepositoryToken(t.Context(), scope, project.ID, "secret"); err != nil {
		t.Fatal(err)
	}
	stored, err := svc.Get(t.Context(), scope, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored.RepositoryTokenSealed) == 0 || stored.RepositoryTokenSetAt == nil {
		t.Fatalf("token not stored: %+v", stored)
	}
	if strings.Contains(string(stored.RepositoryTokenSealed), "secret") {
		t.Fatal("token plaintext reached the record")
	}
	// Opening with the wrong binding (a copied ciphertext) must fail.
	if _, err := svc.openToken(stored.RepositoryTokenSealed, tokenBinding(scope.TenantID, "other", stored.RepositoryURL)); err == nil {
		t.Fatal("copied ciphertext opened for another project")
	}
	auth, err := svc.projectAuth(scope, stored)
	if err != nil || auth == "" || strings.Contains(auth, "secret") {
		t.Fatalf("auth header=%q err=%v (token must stay out of it)", auth, err)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(auth, "Authorization: Basic "))
	if err != nil || string(decoded) != projectTokenUsername+":secret" {
		t.Fatalf("auth payload=%q err=%v", decoded, err)
	}
	// Clear removes the token so later pulls are anonymous.
	cleared, err := svc.ClearRepositoryToken(t.Context(), scope, project.ID)
	if err != nil || len(cleared.RepositoryTokenSealed) != 0 || cleared.RepositoryTokenSetAt == nil {
		t.Fatalf("cleared=%+v err=%v", cleared, err)
	}
}
