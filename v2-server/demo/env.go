//go:build linux

package demo

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/projectrepos"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
	"golang.org/x/sys/unix"
)

// The recordings run the OpenCode Agent on the model scripts/deepseek.sh configures, which the
// execution catalog lists as "configured". The labelled Dashboard history uses "fixture" metadata
// without calling a provider; live tasks and workflow seeds use the configured model.
const (
	demoAgentCLI = "official/ora-space.opencode"
	demoModelID  = "configured"
)

//go:embed users/*.json
var userFiles embed.FS

//go:embed all:fixtures
var fixtures embed.FS

// Environment is one demo command's isolated stack: its own database, data directory and ports
// on the shared compose PostgreSQL, apart from the everyday `ora_v2` database and 8090/5173.
type Environment struct {
	Name     string
	Database string
	// Dir names the data directory under ~/.od: a, b and c for the scenes, all for the combination.
	Dir        string
	ServerPort int
	WebPort    int
	// Mock turns on frontend-v2's VITE_DEMO_MOCK for the scenes whose pages still use lib/demo.
	Mock bool
	// Scenes are seeded in order into the one environment; the combined command lists all three.
	Scenes []string
}

// nodeSocketSuffix is the longest path the Agent runtime puts under a data directory, a Node
// control socket (internal/agentruntime). A Unix socket path must stay under 108 bytes.
const nodeSocketSuffix = "/nodes/0000000000000000/w/n/control.sock"

// environments is the table of #882: one command per scene plus the combined `task v2:demo`.
var environments = map[string]Environment{
	"newcomer": {Name: "newcomer", Database: "ora_v2_demo_newcomer", Dir: "a", ServerPort: 8191, WebPort: 5191, Mock: true, Scenes: []string{"newcomer"}},
	"lead":     {Name: "lead", Database: "ora_v2_demo_lead", Dir: "b", ServerPort: 8192, WebPort: 5192, Mock: true, Scenes: []string{"lead"}},
	"ops":      {Name: "ops", Database: "ora_v2_demo_ops", Dir: "c", ServerPort: 8193, WebPort: 5193, Mock: true, Scenes: []string{"ops"}},
	"all":      {Name: "all", Database: "ora_v2_demo", Dir: "all", ServerPort: 8190, WebPort: 5190, Mock: true, Scenes: []string{"newcomer", "lead", "ops"}},
}

// Config is an environment resolved against the local machine.
type Config struct {
	Environment
	// DatabaseURL addresses Database on the compose PostgreSQL (127.0.0.1:55432).
	DatabaseURL string
	// DataDir is $ORA_DEMO_DATA/<dir>, ~/.od/<dir> by default.
	DataDir string
	// UsersFile is written by Reset from the scenes' user files.
	UsersFile string
}

// Resolve looks up an environment by name. ORA_DEMO_DATA moves the data directories (default ~/.od;
// keep it short); ORA_DEMO_WEB_PORT only moves the frontend when its port is already taken.
func Resolve(name string, getenv func(string) string) (Config, error) {
	env, ok := environments[name]
	if !ok {
		return Config{}, fmt.Errorf("unknown demo environment %q (want newcomer, lead, ops or all)", name)
	}
	root := getenv("ORA_DEMO_DATA")
	if root == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return Config{}, err
		}
		root = filepath.Join(home, ".od")
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return Config{}, err
	}
	if port := getenv("ORA_DEMO_WEB_PORT"); port != "" {
		if env.WebPort, err = strconv.Atoi(port); err != nil || env.WebPort <= 0 || env.WebPort > 65535 {
			return Config{}, fmt.Errorf("ORA_DEMO_WEB_PORT %q is not a port", port)
		}
	}
	dir := filepath.Join(root, env.Dir)
	if len(dir+nodeSocketSuffix) >= 108 {
		return Config{}, fmt.Errorf("data directory %s is too long for the Agent runtime's Unix sockets: set ORA_DEMO_DATA to a shorter directory", dir)
	}
	return Config{
		Environment: env,
		DatabaseURL: "postgres://ora:ora-local@127.0.0.1:55432/" + env.Database + "?sslmode=disable",
		DataDir:     dir,
		UsersFile:   filepath.Join(dir, "users.json"),
	}, nil
}

// Shell renders the variables scripts/demo.sh exports before starting v2-server and frontend-v2.
func (c Config) Shell() string {
	mock := ""
	if c.Mock {
		mock = "1"
	}
	vars := [][2]string{
		{"V2_DATABASE_URL", c.DatabaseURL},
		{"V2_DATA_DIR", c.DataDir},
		{"V2_ADDR", "127.0.0.1:" + strconv.Itoa(c.ServerPort)},
		{"V2_USERS_FILE", c.UsersFile},
		{"DEMO_WEB_PORT", strconv.Itoa(c.WebPort)},
		{"DEMO_MOCK", mock},
	}
	var b strings.Builder
	for _, v := range vars {
		fmt.Fprintf(&b, "export %s='%s'\n", v[0], strings.ReplaceAll(v[1], "'", `'\''`))
	}
	return b.String()
}

// SceneUsers merges the scenes' user files in order. Each scene presets only its own accounts, so
// a merge never overwrites another scene's account; a duplicate email is a mistake in the files.
func SceneUsers(scenes []string) (store.Preset, error) {
	var merged store.Preset
	for _, scene := range scenes {
		raw, err := userFiles.ReadFile("users/" + scene + ".json")
		if err != nil {
			return store.Preset{}, fmt.Errorf("scene %s has no user file: %w", scene, err)
		}
		preset, err := store.ParsePreset(raw)
		if err != nil {
			return store.Preset{}, fmt.Errorf("users/%s.json: %w", scene, err)
		}
		merged.Users = append(merged.Users, preset.Users...)
	}
	if err := merged.Validate(); err != nil {
		return store.Preset{}, err
	}
	return merged, nil
}

// Reset returns the environment to an empty state: it refuses while a server still holds the data
// directory, stops the Node processes a previous run left behind, empties the directory, recreates
// the database and writes the merged user file. v2-server then creates the schema and accounts.
func Reset(ctx context.Context, c Config) error {
	if !strings.HasPrefix(c.Database, "ora_v2_demo") || filepath.Base(c.DataDir) != c.Dir {
		return fmt.Errorf("refusing to reset %s / %s: not a demo environment", c.Database, c.DataDir)
	}
	users, err := SceneUsers(c.Scenes)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(c.DataDir, 0700); err != nil {
		return err
	}
	// The same lock v2-server holds while it serves this directory.
	lock, err := os.OpenFile(filepath.Join(c.DataDir, "server.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err := unix.Flock(int(lock.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return fmt.Errorf("%s is still served by a running v2-server: stop that demo command first", c.DataDir)
	}
	if err := stopLeftovers(c.DataDir); err != nil {
		return err
	}
	entries, err := os.ReadDir(c.DataDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.Name() == "server.lock" {
			continue
		}
		if err := os.RemoveAll(filepath.Join(c.DataDir, entry.Name())); err != nil {
			return err
		}
	}
	if err := recreateDatabase(ctx, c.DatabaseURL); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.UsersFile, append(raw, '\n'), 0600)
}

// stopLeftovers kills processes whose executable lives in the data directory. A stopped server
// can leave Node bootstrap processes behind, and they break the next run in a recreated directory.
// Matching the executable path, not the command line, never touches anything outside this demo.
func stopLeftovers(dir string) error {
	procs, err := os.ReadDir("/proc")
	if err != nil {
		return err
	}
	prefix := filepath.Clean(dir) + string(filepath.Separator)
	var pids []int
	for _, p := range procs {
		pid, err := strconv.Atoi(p.Name())
		if err != nil {
			continue
		}
		exe, err := os.Readlink(filepath.Join("/proc", p.Name(), "exe"))
		if err != nil || !strings.HasPrefix(exe, prefix) {
			continue
		}
		pids = append(pids, pid)
	}
	for _, pid := range pids {
		if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return fmt.Errorf("stop leftover process %d: %w", pid, err)
		}
	}
	deadline := time.Now().Add(5 * time.Second)
	for _, pid := range pids {
		for syscall.Kill(pid, 0) == nil && time.Now().Before(deadline) {
			time.Sleep(50 * time.Millisecond)
		}
	}
	return nil
}

func recreateDatabase(ctx context.Context, url string) error {
	config, err := pgx.ParseConfig(url)
	if err != nil {
		return err
	}
	name := config.Database
	config.Database = "postgres"
	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		return fmt.Errorf("connect to PostgreSQL (is `task v2:db` up?): %w", err)
	}
	defer conn.Close(ctx)
	ident := pgx.Identifier{name}.Sanitize()
	if _, err := conn.Exec(ctx, "DROP DATABASE IF EXISTS "+ident+" WITH (FORCE)"); err != nil {
		return fmt.Errorf("drop %s: %w", name, err)
	}
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+ident); err != nil {
		return fmt.Errorf("create %s: %w", name, err)
	}
	return nil
}

// Seeder writes the scenes' data into a running environment. Every scene finds its own accounts by
// email and prepares its own project, so the scenes compose in any order.
type Seeder struct {
	Store    *store.Store
	Pool     *pgxpool.Pool
	Projects *projectrepos.Service
	Now      time.Time
}

// OpenSeeder connects to the environment's database. v2-server has already applied the schema and
// written the accounts; the seed only adds rows, through the store wherever the store can.
func OpenSeeder(ctx context.Context, c Config) (*Seeder, error) {
	s, err := store.Open(ctx, c.DatabaseURL)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.New(ctx, c.DatabaseURL)
	if err != nil {
		s.Close()
		return nil, err
	}
	projects, err := projectrepos.New(s, projectrepos.Options{Root: filepath.Join(c.DataDir, "repositories")})
	if err != nil {
		pool.Close()
		s.Close()
		return nil, err
	}
	return &Seeder{Store: s, Pool: pool, Projects: projects, Now: time.Now()}, nil
}

// Close releases the database connections.
func (s *Seeder) Close() {
	s.Pool.Close()
	s.Store.Close()
}

// Seed runs the named scenes in order.
func (s *Seeder) Seed(ctx context.Context, scenes []string) error {
	for _, name := range scenes {
		i := slices.IndexFunc(sceneSeeds, func(sc scene) bool { return sc.name == name })
		if i < 0 {
			return fmt.Errorf("unknown scene %q", name)
		}
		if err := sceneSeeds[i].seed(ctx, s); err != nil {
			return fmt.Errorf("seed %s: %w", name, err)
		}
	}
	return nil
}

// Scope resolves a preset account to its membership of the demo team; it signs nobody in.
func (s *Seeder) Scope(ctx context.Context, email string) (execution.Scope, error) {
	user, err := s.Store.UserByEmail(ctx, email)
	if err != nil {
		return execution.Scope{}, fmt.Errorf("account %s: %w (is it in the scene's user file?)", email, err)
	}
	tenants, err := s.Store.Tenants(ctx, user.ID)
	if err != nil {
		return execution.Scope{}, err
	}
	for _, t := range tenants {
		if t.Name == store.DemoTenant {
			return execution.Scope{TenantID: t.ID, UserID: user.ID}, nil
		}
	}
	return execution.Scope{}, fmt.Errorf("account %s is not in %s", email, store.DemoTenant)
}

// Project prepares a scene's project from fixtures/<fixture> as one local Git commit, with the
// UUID identity and snapshot ref the Node clone protocol requires. No network is involved.
func (s *Seeder) Project(ctx context.Context, scope execution.Scope, name, fixture string) (store.Project, error) {
	files, err := fs.Sub(fixtures, "fixtures/"+fixture)
	if err != nil {
		return store.Project{}, err
	}
	if _, err := fs.Stat(files, "README.md"); err != nil {
		return store.Project{}, fmt.Errorf("fixture %s: %w", fixture, err)
	}
	return s.Projects.SeedLocal(ctx, scope, name, "fixture://demo/"+fixture, files)
}

// WorkflowSeed hands a scene's account and project to the workflow seeds.
func (s *Seeder) WorkflowSeed(scope execution.Scope, project store.Project) WorkflowSeed {
	return WorkflowSeed{Store: s.Store, Pool: s.Pool, Scope: scope, ProjectID: project.ID, AgentCLI: demoAgentCLI, ModelID: demoModelID, Now: s.Now}
}

// seedAccess authorizes a seeded user the way a request would, so store calls that apply business
// rules by role receive the same verified Access the HTTP routes hand them.
func seedAccess(ctx context.Context, s *store.Store, scope execution.Scope) (store.Access, error) {
	a, err := s.TenantAccess(ctx, scope.TenantID, scope.UserID)
	if err != nil {
		return store.Access{}, fmt.Errorf("seed access: %w", err)
	}
	return a, nil
}
