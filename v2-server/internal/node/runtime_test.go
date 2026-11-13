//go:build linux

package node

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func testAsset(t *testing.T, path string) Asset {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	return Asset{Path: path, SHA256: hex.EncodeToString(sum[:])}
}

func TestAssetRejectsWrongDigestWithoutReplacingExecutable(t *testing.T) {
	root := socketDirectory(t)
	source := filepath.Join(root, "source")
	dest := filepath.Join(root, "dest")
	if err := os.WriteFile(source, []byte("new"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dest, []byte("old"), 0700); err != nil {
		t.Fatal(err)
	}
	asset := testAsset(t, source)
	asset.SHA256 = "0000000000000000000000000000000000000000000000000000000000000000"
	if err := copyAsset(asset, dest); err == nil {
		t.Fatal("accepted wrong digest")
	}
	if data, _ := os.ReadFile(dest); string(data) != "old" {
		t.Fatalf("changed executable: %q", data)
	}
}

func TestCleanupOnlyOwnedExecutablesAndSocketFiles(t *testing.T) {
	root := socketDirectory(t)
	paths, lock, err := claimRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	if _, _, err := claimRoot(root); !errors.Is(err, ErrRuntimeBusy) {
		t.Fatalf("second owner = %v", err)
	}
	for _, path := range []string{paths.HostHome, paths.NodeHome, paths.Repositories} {
		if err := os.MkdirAll(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	// The test binary stands in for a reaper that outlived a killed Node, and for a guardian left
	// by a root prepared before the upgrade: /usr/bin/sleep may be a symlink into a multi-call
	// coreutils, which copyAsset refuses and which dispatches on argv[0].
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"rb", "gb"} {
		if err := copyAsset(testAsset(t, self), filepath.Join(root, name)); err != nil {
			t.Fatal(err)
		}
		owned := exec.Command(filepath.Join(root, name), "-test.run=^TestSleepHelper$")
		owned.Env = append(os.Environ(), "V2_SLEEP_HELPER=1")
		owned.Dir = paths.Root
		if err := owned.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = owned.Process.Kill(); _ = owned.Wait() })
	}
	other := exec.Command("/usr/bin/sleep", "60")
	other.Dir = socketDirectory(t)
	if err := other.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = other.Process.Kill(); _ = other.Wait() })
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: paths.Socket, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	listener.SetUnlinkOnClose(false)
	listener.Close()
	database := filepath.Join(paths.NodeHome, "keep.sqlite")
	os.WriteFile(database, []byte("preserve"), 0600)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := cleanOwned(ctx, paths, 50*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(paths.Socket); !os.IsNotExist(err) {
		t.Fatalf("socket remains: %v", err)
	}
	if data, _ := os.ReadFile(database); string(data) != "preserve" {
		t.Fatal("changed database")
	}
	if err := other.Process.Signal(syscall.Signal(0)); err != nil {
		t.Fatalf("other workspace process affected: %v", err)
	}
}

// TestSleepHelper blocks when started as a stand-in runtime process.
func TestSleepHelper(t *testing.T) {
	if os.Getenv("V2_SLEEP_HELPER") == "" {
		return
	}
	time.Sleep(time.Minute)
}

func TestCleanupRefusesUnknownProcessInRoot(t *testing.T) {
	paths, lock, err := claimRoot(socketDirectory(t))
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	userShell := exec.Command("/usr/bin/sleep", "60")
	userShell.Dir = paths.Root
	if err := userShell.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = userShell.Process.Kill(); _ = userShell.Wait() })
	if err := cleanOwned(context.Background(), paths, time.Millisecond); err == nil {
		t.Fatal("claimed cleanup with unknown process")
	}
	if err := userShell.Process.Signal(syscall.Signal(0)); err != nil {
		t.Fatal("killed unclassified process")
	}
}

// An Agent that Node was stopping can still be exiting when Node itself has gone; cleanup
// waits for it within the grace instead of reporting a leftover.
func TestCleanupWaitsForExitingProcessInRoot(t *testing.T) {
	paths, lock, err := claimRoot(socketDirectory(t))
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	exiting := exec.Command("/usr/bin/sleep", "0.3")
	exiting.Dir = paths.Root
	if err := exiting.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = exiting.Wait(); close(done) }()
	t.Cleanup(func() { _ = exiting.Process.Kill(); <-done })
	started := time.Now()
	if err := cleanOwned(context.Background(), paths, 3*time.Second); err != nil {
		t.Fatalf("cleanup did not wait for an exiting process: %v", err)
	}
	if elapsed := time.Since(started); elapsed < 200*time.Millisecond {
		t.Fatalf("cleanup returned after %v, before the process exited", elapsed)
	}
}

func realRuntimeOptions(t *testing.T, root string) RuntimeOptions {
	t.Helper()
	bins := os.Getenv("V2_NODE_TEST_BIN_DIR")
	if bins == "" {
		t.Skip("set V2_NODE_TEST_BIN_DIR for real runtime tests")
	}
	return RuntimeOptions{Root: root, Node: testAsset(t, filepath.Join(bins, "ora-node")), Reaper: testAsset(t, filepath.Join(bins, "ora-reaper")), StartupTimeout: 10 * time.Second, StopGrace: 2 * time.Second,
		IPC: Options{ControllerID: "controller", ExpectedNodeID: "node", HeartbeatInterval: 100 * time.Millisecond, FrameTimeout: 3 * time.Second, RequiredCapabilities: []string{"plugin_install"}},
		Configure: func(p Paths) ([]byte, error) {
			gitconfig := filepath.Join(p.Root, "gitconfig")
			if err := os.WriteFile(gitconfig, nil, 0600); err != nil {
				return nil, err
			}
			return json.Marshal(map[string]any{
				"node":     map[string]any{"home_directory": p.NodeHome, "identity": map[string]string{"Require": "node"}, "repositories": []any{}},
				"process":  map[string]any{"reaper_program": filepath.Join(p.Root, "rb"), "host_directory": p.HostHome, "expected_uid": os.Geteuid(), "git_program": "/usr/bin/git", "environment": map[string]string{"PATH": "/usr/bin:/bin", "HOME": p.UserHome}, "command_timeout_ms": 30000, "network_timeout_ms": 30000, "cleanup_timeout_ms": 3000, "shutdown_grace_ms": 1000},
				"clone":    map[string]any{"repository_root": p.Repositories, "git_config": gitconfig, "search_path": []string{"/usr/bin"}},
				"control":  map[string]any{"controller_id": "controller", "listen": map[string]string{"kind": "ipc", "path": p.Socket}, "heartbeat_ms": 100, "frame_timeout_ms": 3000},
				"timezone": "Asia/Shanghai", "recovery_interval_ms": 100,
			})
		},
	}
}

func nativeRoot(t *testing.T) string {
	t.Helper()
	base, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	root, err := os.MkdirTemp(base, "vr-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	return root
}

func stopTestRuntime(t *testing.T, r *Runtime) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := r.Stop(ctx); err != nil {
		t.Errorf("stop runtime: %v", err)
	}
}

func TestRealRuntimeIsolationAndRestart(t *testing.T) {
	if os.Getenv("V2_NODE_TEST_BIN_DIR") == "" {
		t.Skip("set V2_NODE_TEST_BIN_DIR for real runtime tests")
	}
	firstOpts := realRuntimeOptions(t, nativeRoot(t))
	secondOpts := realRuntimeOptions(t, nativeRoot(t))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	first, err := StartRuntime(ctx, firstOpts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stopTestRuntime(t, first) })
	second, err := StartRuntime(ctx, secondOpts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stopTestRuntime(t, second) })
	if _, err := StartRuntime(ctx, firstOpts); !errors.Is(err, ErrRuntimeBusy) {
		t.Fatalf("duplicate supervisor = %v", err)
	}
	keep := filepath.Join(first.paths.Repositories, "keep.txt")
	if err := os.WriteFile(keep, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	stopTestRuntime(t, first)
	if msg, err := second.Client.read(ctx); err != nil || msg.Type != "heartbeat" {
		t.Fatalf("second runtime affected: %v %v", msg, err)
	}
	restarted, err := StartRuntime(ctx, firstOpts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stopTestRuntime(t, restarted) })
	if data, _ := os.ReadFile(keep); string(data) != "keep" {
		t.Fatal("restart erased checkout")
	}
	stopTestRuntime(t, restarted)
	stopTestRuntime(t, second)
}

// The helper is killed without cleanup to model a backend crash, including OS lock release.
func TestRuntimeCrashHelper(t *testing.T) {
	root := os.Getenv("V2_RUNTIME_CRASH_HELPER")
	if root == "" {
		return
	}
	r, err := StartRuntime(context.Background(), realRuntimeOptions(t, root))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "ready"), []byte("ready"), 0600); err != nil {
		t.Fatal(err)
	}
	<-r.Done()
}

func TestRealRuntimeCleansAfterSupervisorCrash(t *testing.T) {
	if os.Getenv("V2_NODE_TEST_BIN_DIR") == "" {
		t.Skip("set V2_NODE_TEST_BIN_DIR for real runtime tests")
	}
	root := nativeRoot(t)
	helper := exec.Command(os.Args[0], "-test.run=^TestRuntimeCrashHelper$")
	helper.Env = append(os.Environ(), "V2_RUNTIME_CRASH_HELPER="+root)
	if err := helper.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = helper.Process.Kill(); _ = helper.Wait() })
	deadline := time.Now().Add(15 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(root, "ready")); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("helper failed to start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	_ = helper.Process.Kill()
	_ = helper.Wait()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	recovered, err := StartRuntime(ctx, realRuntimeOptions(t, root))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stopTestRuntime(t, recovered) })
	if msg, err := recovered.Client.read(ctx); err != nil || msg.Type != "heartbeat" {
		t.Fatalf("recovery heartbeat: %v %v", msg, err)
	}
	stopTestRuntime(t, recovered)
}

// running counts processes whose executable is root/name.
func running(t *testing.T, root, name string) int {
	t.Helper()
	entries, err := os.ReadDir("/proc")
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, entry := range entries {
		if exe, err := os.Readlink(filepath.Join("/proc", entry.Name(), "exe")); err == nil && exe == filepath.Join(root, name) {
			n++
		}
	}
	return n
}

// A root prepared before Node ran Git itself holds the process host's state directory. Node
// deletes it on start once the host is gone, and runs with exactly one reaper of its own.
func TestRealRuntimeRemovesRetiredHostDirectory(t *testing.T) {
	if os.Getenv("V2_NODE_TEST_BIN_DIR") == "" {
		t.Skip("set V2_NODE_TEST_BIN_DIR for real runtime tests")
	}
	opts := realRuntimeOptions(t, nativeRoot(t))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	r, err := StartRuntime(ctx, opts)
	if err != nil {
		t.Fatal(err)
	}
	stopTestRuntime(t, r)
	host := r.paths.HostHome
	if err := os.MkdirAll(filepath.Join(host, "scopes"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"host.sqlite", "host.lock"} {
		if err := os.WriteFile(filepath.Join(host, name), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	r, err = StartRuntime(ctx, opts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stopTestRuntime(t, r) })
	if _, err := os.Stat(host); !os.IsNotExist(err) {
		t.Fatalf("retired host directory remains: %v", err)
	}
	if n := running(t, opts.Root, "rb"); n != 1 {
		t.Fatalf("reapers = %d, want 1", n)
	}
	stopTestRuntime(t, r)
	for _, name := range ownedExecutables {
		if n := running(t, opts.Root, name); n != 0 {
			t.Fatalf("%s still running after stop: %d", name, n)
		}
	}
}
