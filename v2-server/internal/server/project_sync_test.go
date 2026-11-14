package server_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cgi"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/legacy"
	"github.com/wanglongan587/cloud/v2-server/internal/projectrepos"
	"github.com/wanglongan587/cloud/v2-server/internal/server"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
	"github.com/wanglongan587/cloud/v2-server/internal/store/storetest"
)

func TestProjectSyncAndRepositoryToken(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("v2 repository service requires Linux/WSL")
	}
	s := openStore(t)
	remote, bare, initial := serverGitRemote(t)
	root := t.TempDir()
	key := base64.StdEncoding.EncodeToString(make([]byte, 32))
	projects, err := projectrepos.New(s, projectrepos.Options{Root: root, AllowLoopbackHTTP: true, CredentialKey: key})
	if err != nil {
		t.Fatal(err)
	}
	serverOptions := server.Options{SessionTTL: time.Hour, Projects: projects}
	srv := httptest.NewServer(server.New(s, serverOptions))
	defer srv.Close()
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	doc, err := openapi3.NewLoader().LoadFromFile(filepath.Join("..", "projectrepos", "projects.openapi.json"))
	if err != nil {
		t.Fatal(err)
	}
	routes, err := legacy.NewRouter(doc)
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path string, input any) (int, map[string]any) {
		t.Helper()
		body, _ := json.Marshal(input)
		req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		if strings.HasPrefix(path, "/api/v2/") {
			route, params, err := routes.FindRoute(req)
			if err != nil {
				t.Fatal(err)
			}
			in := &openapi3filter.ResponseValidationInput{RequestValidationInput: &openapi3filter.RequestValidationInput{Request: req, PathParams: params, Route: route}, Status: res.StatusCode, Header: res.Header, Options: &openapi3filter.Options{IncludeResponseStatus: true}}
			in.SetBodyBytes(raw)
			if res.StatusCode < 500 {
				if err := openapi3filter.ValidateResponse(t.Context(), in); err != nil {
					t.Fatalf("%s %s: %v", method, path, err)
				}
			}
		}
		out := map[string]any{}
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatal(err)
		}
		return res.StatusCode, out
	}
	storetest.SignIn(t, s, "project-owner", "Owner", store.RoleOwner)
	call("POST", "/auth/login", map[string]string{"provider": "email", "email": storetest.Email("project-owner")})
	call("GET", "/api/v1/me", nil)
	_, tenants := call("GET", "/api/v1/me/tenants", nil)
	tenant := tenants["items"].([]any)[0].(map[string]any)["id"].(string)
	path := "/api/v2/tenants/" + tenant + "/projects"
	input := projectrepos.Input{Name: "Demo", RepositoryURL: remote.URL + "/repo.git", DefaultBranch: "main"}
	status, created := call("POST", path, input)
	if status != 201 || created["repositoryTokenConfigured"] != false {
		t.Fatalf("create: %d %v", status, created)
	}
	id := created["id"].(string)

	// Push a new commit, then sync through HTTP: the response advances the snapshot and clears errors.
	work := filepath.Join(t.TempDir(), "work")
	serverGit(t, filepath.Dir(work), "clone", "--quiet", bare, "work")
	serverGit(t, work, "-c", "user.name=F", "-c", "user.email=f@e.test", "commit", "--allow-empty", "-m", "second")
	next := serverGit(t, work, "rev-parse", "HEAD")
	serverGit(t, work, "push", "--quiet", "origin", "main")
	if status, synced := call("POST", path+"/"+id+"/sync", nil); status != 200 || synced["commitId"] != next || synced["syncAt"] == nil {
		t.Fatalf("sync: %d %v", status, synced)
	}
	if status, got := call("GET", path+"/"+id, nil); status != 200 || got["commitId"] != next {
		t.Fatalf("read after sync: %d %v", status, got)
	}

	// Delete the remote branch: sync fails, the snapshot stays, and the project page shows the reason.
	serverGit(t, work, "push", "--quiet", "origin", ":main")
	if status, _ := call("POST", path+"/"+id+"/sync", nil); status != 400 {
		t.Fatalf("failed sync status=%d", status)
	}
	if status, got := call("GET", path+"/"+id, nil); status != 200 || got["commitId"] != next || got["syncError"] == "" || got["syncRunning"] != nil {
		t.Fatalf("failed sync state: %d %v", status, got)
	}

	// Only the owner or creator may set the token; a member gets 403.
	memberToken := storetest.SignIn(t, s, "project-member", "Member", store.RoleMember)
	base, _ := http.NewRequest("GET", srv.URL, nil)
	jar.SetCookies(base.URL, []*http.Cookie{{Name: server.SessionCookie, Value: memberToken}})
	if status, _ := call("PUT", path+"/"+id+"/repository-token", map[string]string{"token": "s3cr3t"}); status != 403 {
		t.Fatalf("member token status=%d", status)
	}
	jar.SetCookies(base.URL, []*http.Cookie{{Name: server.SessionCookie, Value: storetest.SignIn(t, s, "project-owner", "Owner", store.RoleOwner)}})
	if status, got := call("PUT", path+"/"+id+"/repository-token", map[string]string{"token": "s3cr3t"}); status != 200 || got["repositoryTokenConfigured"] != true {
		t.Fatalf("set token: %d %v", status, got)
	} else if raw, _ := json.Marshal(got); strings.Contains(string(raw), "s3cr3t") {
		t.Fatal("token leaked into the API response")
	}
	if status, got := call("GET", path+"/"+id, nil); status != 200 || got["repositoryTokenConfigured"] != true || got["repositoryTokenSetAt"] == nil {
		t.Fatalf("read token state: %d %v", status, got)
	}
	if status, got := call("DELETE", path+"/"+id+"/repository-token", nil); status != 200 || got["repositoryTokenConfigured"] != false {
		t.Fatalf("clear token: %d %v", status, got)
	}
	_ = initial
}

func serverGitRemote(t *testing.T) (*httptest.Server, string, string) {
	t.Helper()
	root := t.TempDir()
	work := filepath.Join(root, "work")
	if err := os.Mkdir(work, 0700); err != nil {
		t.Fatal(err)
	}
	serverGit(t, work, "init", "-b", "main")
	serverGit(t, work, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "initial")
	commit := serverGit(t, work, "rev-parse", "HEAD")
	bare := filepath.Join(root, "repo.git")
	serverGit(t, root, "clone", "--bare", work, bare)
	serverGit(t, bare, "config", "receive.denyDeleteCurrent", "ignore")
	backend := filepath.Join(serverGit(t, root, "--exec-path"), "git-http-backend")
	cgiHandler := &cgi.Handler{Path: backend, Root: "/", Dir: root, Env: []string{"GIT_PROJECT_ROOT=" + root, "GIT_HTTP_EXPORT_ALL=1", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null"}}
	remote := httptest.NewServer(http.HandlerFunc(cgiHandler.ServeHTTP))
	t.Cleanup(remote.Close)
	return remote, bare, commit
}

func serverGit(t *testing.T, dir string, args ...string) string {
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
