//go:build linux

// Command v2-server is Cloud v2's temporary single-process backend; see README.md.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/agentruntime"
	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/executionruntime"
	"github.com/wanglongan587/cloud/v2-server/internal/nodeservices"
	"github.com/wanglongan587/cloud/v2-server/internal/pluginmarket"
	"github.com/wanglongan587/cloud/v2-server/internal/projectrepos"
	"github.com/wanglongan587/cloud/v2-server/internal/requestmetrics"
	"github.com/wanglongan587/cloud/v2-server/internal/scheduler"
	"github.com/wanglongan587/cloud/v2-server/internal/server"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
	"github.com/wanglongan587/cloud/v2-server/internal/taskdecomp"
	"github.com/wanglongan587/cloud/v2-server/internal/taskrun"
	"github.com/wanglongan587/cloud/v2-server/internal/workflowhost"
	"golang.org/x/sys/unix"
)

// defaultDatabase is the database v2-server uses on the repository's compose PostgreSQL.
const defaultDatabase = "postgres://ora:ora-local@127.0.0.1:55432/ora_v2?sslmode=disable"

func main() {
	addr := flag.String("addr", envOr("V2_ADDR", "127.0.0.1:8090"), "listen address")
	dbURL := flag.String("db", envOr("V2_DATABASE_URL", defaultDatabase), "PostgreSQL URL")
	cleanup := flag.Bool("cleanup", false, "stop and remove owned conversation directories; retain repository mirrors and database history")
	fixture := flag.Bool("fixture-check", false, "run the real Node fixture through the public execution service, then exit")
	testFixtures := flag.Bool("test-fixtures", false, "include deterministic fixture models for end-to-end tests")
	flag.Parse()

	if e := run(*addr, *dbURL, *cleanup, *fixture, *testFixtures); e != nil {
		slog.Error("v2-server", "error", e)
		os.Exit(1)
	}
}

func run(addr, dbURL string, cleanup, fixture, testFixtures bool) (resultErr error) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	base, e := dataDirectory()
	if e != nil {
		return e
	}
	lock, e := lockDirectory(base)
	if e != nil {
		return e
	}
	defer lock.Close()
	if cleanup {
		return agentruntime.Cleanup(ctx, filepath.Join(base, "nodes"))
	}

	db, e := store.Open(ctx, dbURL)
	if e != nil {
		return e
	}
	preset, e := store.LoadPreset(envOr("V2_USERS_FILE", "users.json"))
	if e != nil {
		db.Close()
		return e
	}
	if e := db.SeedUsers(ctx, preset); e != nil {
		db.Close()
		return e
	}
	if e := db.MigrateStarterSkillNames(ctx); e != nil {
		db.Close()
		return e
	}
	if e := db.RetireLegacyDemoUser(ctx); e != nil {
		db.Close()
		return e
	}
	if e := db.RetireUsers(ctx, preset.Retired); e != nil {
		db.Close()
		return e
	}
	if e := db.EndDeletedSquadMembers(ctx); e != nil {
		db.Close()
		return e
	}
	// The demo project is owned by the first preset owner; it seeds shared content, not a login.
	bootstrap := preset.Users[0].Email
	for _, u := range preset.Users {
		if u.Role == store.RoleOwner {
			bootstrap = u.Email
			break
		}
	}
	closeDatabase := true
	defer func() {
		if closeDatabase {
			db.Close()
		}
	}()
	projects, e := projectrepos.New(db, projectrepos.Options{Root: filepath.Join(base, "repositories")})
	if e != nil {
		return e
	}
	models, e := executionruntime.ModelsFromEnvironment(os.Getenv)
	if e != nil {
		return e
	}
	if fixture || testFixtures {
		models = executionruntime.WithFixtureModels(models)
	}
	var driver *agentruntime.Driver
	if assets := os.Getenv("V2_NODE_ASSETS_DIR"); assets != "" && len(models) > 0 {
		if e := checkReleaseNodeDataDirectory(assets, base); e != nil {
			return e
		}
		gitDir, e := exec.CommandContext(ctx, "git", "--exec-path").Output()
		if e != nil {
			return errors.New("git executable unavailable")
		}
		bindings := map[string]nodeservices.Binding{}
		for id, choice := range models {
			bindings[id] = choice.Binding
		}
		driver, e = agentruntime.New(agentruntime.Options{Root: filepath.Join(base, "nodes"), AssetsDirectory: assets, GitBackend: filepath.Join(strings.TrimSpace(string(gitDir)), "git-http-backend"), Bindings: bindings, ObserveProvider: func(ref execution.Ref, binding nodeservices.Binding) nodeservices.Provider {
			return requestmetrics.Wrap(db, ref, binding)
		}, ResolveProject: func(c context.Context, scope execution.Scope, id string) (agentruntime.Project, error) {
			p, e := db.GetProject(c, scope, id)
			return agentruntime.Project{MirrorPath: p.MirrorPath, Commit: p.Commit, SnapshotRef: p.SnapshotRef}, e
		}, UserSkills: func(c context.Context, scope execution.Scope) ([]agentruntime.UserSkill, error) {
			items, e := db.UserSkillDocuments(c, scope.TenantID, scope.UserID)
			if e != nil {
				return nil, e
			}
			skills := make([]agentruntime.UserSkill, len(items))
			for i, item := range items {
				skills[i] = agentruntime.UserSkill{Name: item.Name, Description: item.Description, Content: item.Content}
			}
			return skills, nil
		}, RecordWorkspace: func(c context.Context, id string, at agentruntime.Checkout) error {
			return db.RecordWorkspace(c, id, store.WorkspaceLocation{Path: at.Path, BaseCommit: at.BaseCommit})
		}})
		if e != nil {
			return e
		}
	} else if e := agentruntime.Recover(ctx, filepath.Join(base, "nodes")); e != nil {
		return e
	}
	var agent executionruntime.AgentDriver
	if driver != nil {
		agent = driver
	}
	runtime, e := executionruntime.New(ctx, executionruntime.Config{Store: db, Models: models, Agent: agent})
	if e != nil {
		if driver != nil {
			shutdown, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			stopErr := driver.Close(shutdown)
			cancel()
			e = errors.Join(e, stopErr)
		}
		return e
	}
	defer func() {
		shutdown, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := runtime.Close(shutdown); err != nil {
			// A worker may still be retaining its terminal result. Keep its database
			// handle until the failed process exits; next startup performs recovery.
			closeDatabase = false
			resultErr = errors.Join(resultErr, fmt.Errorf("execution shutdown unconfirmed: %w", err))
		}
	}()
	// Recovery above ended the previous process's sessions; show their conversations read-only now.
	if e := db.InterruptEndedChatSessions(ctx); e != nil {
		return e
	}
	scope, demo, e := prepareDemo(ctx, db, projects, bootstrap)
	if e != nil {
		return e
	}
	if fixture {
		if driver == nil {
			return errors.New("fixture-check requires V2_NODE_ASSETS_DIR; run task v2:node:prepare first")
		}
		return checkFixture(ctx, runtime, scope, demo.ID, filepath.Join(base, "nodes"))
	}
	if driver != nil {
		go driver.WarmDemo(ctx, demo.ID, agentruntime.Project{MirrorPath: demo.MirrorPath, Commit: demo.Commit, SnapshotRef: demo.SnapshotRef})
	}
	marketURL, e := pluginmarket.NormalizeSourceURL(envOr(
		"V2_PLUGIN_MARKETPLACE_URL",
		"https://github.com/ora-space/marketplace",
	))
	if e != nil {
		return e
	}
	marketBranch := envOr("V2_PLUGIN_MARKETPLACE_BRANCH", "main")
	if !pluginmarket.ValidBranch(marketBranch) {
		return fmt.Errorf("V2_PLUGIN_MARKETPLACE_BRANCH is not a supported Git branch")
	}
	marketInterval, e := time.ParseDuration(envOr("V2_PLUGIN_MARKETPLACE_INTERVAL", "5m"))
	if e != nil || marketInterval <= 0 {
		return fmt.Errorf("V2_PLUGIN_MARKETPLACE_INTERVAL must be a positive duration")
	}
	market := &pluginmarket.Syncer{
		Source: pluginmarket.Source{
			Namespace: "official", URL: marketURL, Branch: marketBranch,
		},
		WorkDir: filepath.Join(base, "marketplace"),
	}
	marketCtx, cancelMarket := context.WithCancel(ctx)
	marketDone := make(chan struct{})
	go func() {
		defer close(marketDone)
		if e := market.Sync(marketCtx, db, time.Now()); e != nil {
			slog.Warn("initial plugin marketplace sync failed; retaining previous snapshot", "error", e)
		}
		market.Loop(marketCtx, marketInterval, db)
	}()
	defer func() {
		cancelMarket()
		<-marketDone
	}()

	skillCtx, cancelSkills := context.WithCancel(ctx)
	skillDone := make(chan struct{})
	go func() { defer close(skillDone); runSkillReconciler(skillCtx, db, driver) }()
	defer func() { cancelSkills(); <-skillDone }()
	// Workflow runs never outlive the process: fail what the previous one left executing before
	// serving, and stop observing turns before the execution runtime closes (defers run LIFO).
	workflowRuns, e := workflowhost.NewHost(workflowhost.Config{Store: db, Execution: runtime, Catalog: runtime})
	if e != nil {
		return e
	}
	defer workflowRuns.Close()
	if e := workflowRuns.Interrupt(ctx); e != nil {
		return e
	}
	// Task runs, likewise, end what the previous process left live before serving.
	taskRuns := taskrun.New(db, runtime, runtime, nil)
	defer taskRuns.Close()
	if e := taskRuns.Interrupt(ctx); e != nil {
		return e
	}
	// Decompositions settle what the previous process left running, after its runs were interrupted.
	decompositions := taskdecomp.New(db, workflowRunStarter{workflowRuns}, nil)
	defer decompositions.Close()
	if e := decompositions.Recover(ctx); e != nil {
		return e
	}
	options := withWorkflowDomain(server.Options{
		RefreshOfficial:    func(ctx context.Context) error { return market.Refresh(ctx, db, time.Now()) },
		SessionTTL:         7 * 24 * time.Hour,
		Projects:           projects,
		Execution:          runtime,
		Catalog:            runtime,
		TaskRuns:           taskRuns,
		TaskDecompositions: decompositions,
	}, workflowRuns)
	coordinator, e := server.NewScheduleCoordinator(db, options, time.Now)
	if e != nil {
		return e
	}
	schedules, e := scheduler.NewHost(db, coordinator, options.Catalog)
	if e != nil {
		return e
	}
	scheduleCtx, cancelSchedules := context.WithCancel(ctx)
	ticks := time.NewTicker(time.Second)
	scheduleDone := make(chan error, 1)
	go func() { scheduleDone <- schedules.Run(scheduleCtx, ticks.C) }()
	defer func() {
		cancelSchedules()
		ticks.Stop()
		<-scheduleDone // Join scans and admitted HTTP commands before closing the execution runtime and database.
	}()
	<-schedules.Ready()
	options.Schedules = schedules
	srv := newHTTPServer(ctx, addr, server.New(db, options))
	errs := make(chan error, 1)
	go func() { errs <- srv.ListenAndServe() }()
	slog.Info("v2-server listening", "addr", addr)

	select {
	case e := <-errs:
		return e
	case <-ctx.Done():
	}
	// Cancel periodic scans and in-flight schedule commands before HTTP's 5s drain window.
	cancelSchedules()
	ticks.Stop()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if e := srv.Shutdown(shutdown); e != nil {
		// Cancelled handlers can still be blocked writing to a slow client. Release
		// their connections before closing the execution service and database.
		return errors.Join(e, srv.Close())
	}
	if e := <-errs; !errors.Is(e, http.ErrServerClosed) {
		return e
	}
	return nil
}

func dataDirectory() (string, error) {
	root := os.Getenv("V2_DATA_DIR")
	if root == "" {
		home, e := os.UserHomeDir()
		if e != nil {
			return "", e
		}
		root = filepath.Join(home, ".ora-v2")
	}
	root, e := filepath.Abs(root)
	if e != nil {
		return "", e
	}
	return root, os.MkdirAll(root, 0700)
}

// A release-built Node refuses its data below a directory that group or other users can write
// (debug builds skip that check). Without this, every conversation fails with agent_prepare_failed
// and nothing names the directory.
func checkReleaseNodeDataDirectory(assets, root string) error {
	var manifest struct {
		Profile string `json:"profile"`
	}
	raw, e := os.ReadFile(filepath.Join(assets, "assets.json"))
	if e != nil || json.Unmarshal(raw, &manifest) != nil || manifest.Profile != "release" {
		return nil
	}
	for dir := root; ; dir = filepath.Dir(dir) {
		info, e := os.Stat(dir)
		if e != nil {
			return e
		}
		if mode := info.Mode().Perm(); mode&0o022 != 0 {
			return fmt.Errorf("data directory %s: %s is writable by group or others (mode %04o), which a release-built Node refuses; run chmod go-w on it or choose another V2_DATA_DIR", root, dir, mode)
		}
		if dir == filepath.Dir(dir) {
			return nil
		}
	}
}

// One v2 process owns the data directory; cleanup cannot race an active server.
func lockDirectory(root string) (*os.File, error) {
	f, e := os.OpenFile(filepath.Join(root, "server.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if e != nil {
		return nil, e
	}
	if e := unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB); e != nil {
		f.Close()
		return nil, errors.New("v2 data directory is already in use")
	}
	return f, nil
}

// prepareDemo seeds the same real project used by browser selectors and the fixture command.
// Its temporary session only acts for one preset account; no token reaches a page.
func prepareDemo(ctx context.Context, db *store.Store, projects *projectrepos.Service, email string) (execution.Scope, store.Project, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	user, e := db.UserByEmail(ctx, email)
	if e != nil {
		return execution.Scope{}, store.Project{}, e
	}
	token, e := db.StartSession(ctx, user.ID, time.Hour)
	if e != nil {
		return execution.Scope{}, store.Project{}, e
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := db.Logout(cleanup, token); err != nil {
			slog.Warn("remove demo bootstrap session", "error", err)
		}
	}()
	user, e = db.SessionUser(ctx, token)
	if e != nil {
		return execution.Scope{}, store.Project{}, e
	}
	tenants, e := db.Tenants(ctx, user.ID)
	if e != nil {
		return execution.Scope{}, store.Project{}, e
	}
	for _, tenant := range tenants {
		if tenant.Name == store.DemoTenant {
			scope := execution.Scope{TenantID: tenant.ID, UserID: user.ID}
			project, err := projects.SeedDemo(ctx, scope)
			return scope, project, err
		}
	}
	return execution.Scope{}, store.Project{}, errors.New("demo tenant unavailable")
}

func checkFixture(ctx context.Context, runtime *executionruntime.Service, scope execution.Scope, projectID, nodeRoot string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	before, e := fixtureMarkers(nodeRoot)
	if e != nil {
		return e
	}
	started := time.Now()
	caller := execution.Caller{Kind: execution.CallerChat, ID: fmt.Sprintf("fixture-%d", started.UnixNano()), AttemptID: "first"}
	ref, e := runtime.Start(ctx, scope, execution.StartRequest{Caller: caller, Target: execution.Target{ProjectID: projectID}, ExecutorID: "opencode:fixture", Prompt: execution.TextPrompt("Inspect README and save the fixture result.")})
	if e != nil {
		return e
	}
	stream, e := runtime.Subscribe(ctx, scope, ref.SessionID, 0)
	if e != nil {
		return e
	}
	defer stream.Close()
	for {
		event, e := stream.Next(ctx)
		if e != nil {
			return e
		}
		if event.Kind == execution.EventTurnEnded && event.Ref == ref {
			if event.Result == nil || event.Result.Status != execution.StatusCompleted || !event.Result.AnswerComplete || event.Result.Answer != nodeservices.FixtureAnswer {
				return errors.New("fixture did not complete with the real shell-tool answer")
			}
			break
		}
	}
	if e := runtime.End(ctx, scope, ref.SessionID); e != nil {
		return e
	}
	turn, e := runtime.ReadAttempt(ctx, scope, caller)
	if e != nil {
		return e
	}
	if turn.Result == nil || turn.Result.Answer != nodeservices.FixtureAnswer {
		return errors.New("fixture result unavailable after End")
	}
	after, e := fixtureMarkers(nodeRoot)
	if e != nil {
		return e
	}
	verified := false
	for path, value := range after {
		if _, existed := before[path]; !existed && value == nodeservices.FixtureMarker {
			verified = true
		}
	}
	if !verified {
		return errors.New("fixture shell tool did not produce a new verified checkout marker")
	}
	slog.Info("real Node fixture passed through execution.Service", "session", ref.SessionID, "turn", ref.TurnID, "elapsed", time.Since(started))
	return nil
}

func fixtureMarkers(root string) (map[string]string, error) {
	markers := map[string]string{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if errors.Is(err, os.ErrNotExist) && path == root {
			return nil
		}
		if err != nil {
			return err
		}
		if entry.Type().IsRegular() && entry.Name() == "ora-v2-result.txt" {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if info.Size() > 4096 {
				return errors.New("oversized fixture marker")
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			markers[path] = string(data)
		}
		return nil
	})
	return markers, err
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// workflowRunStarter lets task decompositions start workflow runs as a person and watch them end.
type workflowRunStarter struct{ host *workflowhost.Host }

func (s workflowRunStarter) Start(ctx context.Context, tenant, user, runID string) error {
	_, e := s.host.StartRun(ctx, server.WorkflowRunScope{TenantID: tenant, UserID: user}, runID)
	return e
}

func (s workflowRunStarter) Subscribe(runID string) (<-chan struct{}, func()) {
	return s.host.Hub().Subscribe(runID)
}
