//go:build linux

package demo

import (
	"context"
	"crypto/rand"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
	"golang.org/x/sys/unix"
)

func TestResolveFollowsTheEnvironmentTable(t *testing.T) {
	env := map[string]string{"ORA_DEMO_DATA": "/srv/od"}
	getenv := func(k string) string { return env[k] }
	want := map[string]struct {
		db, dir     string
		server, web int
		mock        bool
		scenes      []string
	}{
		"newcomer": {"ora_v2_demo_newcomer", "a", 8191, 5191, true, []string{"newcomer"}},
		"lead":     {"ora_v2_demo_lead", "b", 8192, 5192, true, []string{"lead"}},
		"ops":      {"ora_v2_demo_ops", "c", 8193, 5193, true, []string{"ops"}},
		"all":      {"ora_v2_demo", "all", 8190, 5190, true, []string{"newcomer", "lead", "ops"}},
	}
	for name, w := range want {
		c, err := Resolve(name, getenv)
		if err != nil {
			t.Fatal(err)
		}
		if c.Database != w.db || c.ServerPort != w.server || c.WebPort != w.web || c.Mock != w.mock || !slices.Equal(c.Scenes, w.scenes) ||
			c.DataDir != "/srv/od/"+w.dir || c.UsersFile != c.DataDir+"/users.json" ||
			c.DatabaseURL != "postgres://ora:ora-local@127.0.0.1:55432/"+w.db+"?sslmode=disable" {
			t.Errorf("%s resolved to %+v", name, c)
		}
	}
	env["ORA_DEMO_WEB_PORT"] = "5290"
	if c, err := Resolve("all", getenv); err != nil || c.WebPort != 5290 || c.ServerPort != 8190 {
		t.Fatalf("web port override: %+v %v", c, err)
	}
	env["ORA_DEMO_WEB_PORT"] = "web"
	if _, err := Resolve("all", getenv); err == nil {
		t.Fatal("invalid port accepted")
	}
	if _, err := Resolve("ora_v2", getenv); err == nil {
		t.Fatal("unknown environment accepted")
	}
	if _, err := Resolve("newcomer", func(k string) string {
		return map[string]string{"ORA_DEMO_DATA": "/home/ubuntu/ora-demo/data/" + strings.Repeat("x", 40)}[k]
	}); err == nil {
		t.Fatal("accepted a data directory too long for the Node sockets")
	}
	c, _ := Resolve("lead", func(k string) string { return map[string]string{"ORA_DEMO_DATA": "/tmp/it's"}[k] })
	if shell := c.Shell(); !strings.Contains(shell, `export V2_DATA_DIR='/tmp/it'\''s/b'`) || !strings.Contains(shell, "export DEMO_MOCK='1'") ||
		!strings.Contains(shell, "export V2_ADDR='127.0.0.1:8192'") {
		t.Fatalf("shell exports:\n%s", shell)
	}
}

func TestSceneUsersStayApartAndMerge(t *testing.T) {
	all, err := SceneUsers([]string{"newcomer", "lead", "ops"})
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, u := range all.Users {
		names = append(names, u.DisplayName)
	}
	if !slices.Equal(names, []string{"林新", "陈默", "苏芮", "周衡", "许运", "林维"}) {
		t.Fatalf("merged accounts: %v", names)
	}
	// Each scene file is a valid preset on its own: v2-server refuses a file without an owner.
	for _, scene := range []string{"newcomer", "lead", "ops"} {
		if _, err := SceneUsers([]string{scene}); err != nil {
			t.Errorf("%s: %v", scene, err)
		}
	}
	if _, err := SceneUsers([]string{"lead", "lead"}); err == nil {
		t.Fatal("a scene listed twice merged duplicate accounts")
	}
}

func TestResetEmptiesTheEnvironment(t *testing.T) {
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	config, err := pgx.ParseConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	name := "reset" + strings.ToLower(rand.Text()[:8])
	config.Database = "ora_v2_demo_" + name
	dbURL := withDatabase(t, raw, config.Database)
	c := Config{Environment: Environment{Name: name, Dir: name, Database: config.Database, Scenes: []string{"newcomer", "ops"}}, DatabaseURL: dbURL, DataDir: filepath.Join(t.TempDir(), name)}
	c.UsersFile = filepath.Join(c.DataDir, "users.json")
	t.Cleanup(func() {
		admin := config.Copy()
		admin.Database = "postgres"
		if conn, err := pgx.ConnectConfig(ctx, admin); err == nil {
			_, _ = conn.Exec(ctx, "DROP DATABASE IF EXISTS "+config.Database+" WITH (FORCE)")
			conn.Close(ctx)
		}
	})
	if err := os.MkdirAll(filepath.Join(c.DataDir, "nodes", "old"), 0700); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := Reset(ctx, c); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(c.DataDir, "nodes")); !os.IsNotExist(err) {
			t.Fatalf("previous run's data survived: %v", err)
		}
		preset, err := store.LoadPreset(c.UsersFile)
		if err != nil || len(preset.Users) != 3 {
			t.Fatalf("users file: %+v %v", preset, err)
		}
		conn, err := pgx.Connect(ctx, dbURL)
		if err != nil {
			t.Fatal(err)
		}
		var tables int
		if err := conn.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE schemaname = 'public'`).Scan(&tables); err != nil || tables != 0 {
			t.Fatalf("recreated database has %d tables: %v", tables, err)
		}
		_, err = conn.Exec(ctx, `CREATE TABLE leftover (id int)`)
		conn.Close(ctx)
		if err != nil {
			t.Fatal(err)
		}
	}
	held, err := os.OpenFile(filepath.Join(c.DataDir, "server.lock"), os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if err := unix.Flock(int(held.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	if err := Reset(ctx, c); err == nil || !strings.Contains(err.Error(), "running v2-server") {
		t.Fatalf("reset a directory a server still holds: %v", err)
	}
	other := c
	other.Database = "ora_v2"
	if err := Reset(ctx, other); err == nil {
		t.Fatal("reset the everyday database")
	}
}

// withDatabase points a TEST_DATABASE_URL, in URL or keyword/value form, at another database.
func withDatabase(t *testing.T, raw, database string) string {
	t.Helper()
	if !strings.Contains(raw, "://") {
		// In keyword/value form the last occurrence of a keyword wins.
		return raw + " dbname=" + database
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + database
	return u.String()
}
