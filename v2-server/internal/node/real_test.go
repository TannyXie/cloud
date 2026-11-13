//go:build linux

package node

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// TestRealNodeHandshake uses unmodified pinned Node binaries. It verifies transport and clean
// idle process shutdown only; clone/install/Agent and reaper cleanup need the M2 integration.
// Node starts the ora-reaper installed next to it in V2_NODE_TEST_BIN_DIR.
func TestRealNodeHandshake(t *testing.T) {
	bins := os.Getenv("V2_NODE_TEST_BIN_DIR")
	if bins == "" {
		t.Skip("set V2_NODE_TEST_BIN_DIR for the real Node boundary test")
	}
	// A short native Linux home keeps the control socket under the Unix socket path limit.
	base, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	root, err := os.MkdirTemp(base, "vn-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	for _, name := range []string{"repositories", "user-home"} {
		if err := os.Mkdir(filepath.Join(root, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	gitconfig := filepath.Join(root, "gitconfig")
	if err := os.WriteFile(gitconfig, []byte(""), 0600); err != nil {
		t.Fatal(err)
	}
	start := func(name string, args ...string) func() {
		t.Helper()
		log, err := os.Create(filepath.Join(root, name+".log"))
		if err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(filepath.Join(bins, name), args...)
		cmd.Stdout = log
		cmd.Stderr = log
		if err := cmd.Start(); err != nil {
			log.Close()
			t.Fatal(err)
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		stopped := false
		stop := func() {
			if stopped {
				return
			}
			stopped = true
			_ = cmd.Process.Signal(syscall.SIGTERM)
			select {
			case err := <-done:
				if err != nil {
					t.Errorf("%s shutdown: %v (log %s)", name, err, log.Name())
				}
			case <-time.After(10 * time.Second):
				_ = cmd.Process.Kill()
				<-done
				t.Errorf("%s did not stop", name)
			}
			log.Close()
		}
		t.Cleanup(stop)
		return stop
	}
	waitSocket := func(path string) {
		t.Helper()
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			if _, err := os.Stat(path); err == nil {
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
		b, _ := os.ReadFile(filepath.Join(root, "ora-node.log"))
		t.Logf("ora-node: %s", b)
		t.Fatalf("socket not ready: %s", path)
	}
	socket := filepath.Join(root, "node", "control.sock")
	config := map[string]any{
		"node":     map[string]any{"home_directory": filepath.Join(root, "node"), "identity": map[string]string{"Require": "node"}, "repositories": []any{}},
		"process":  map[string]any{"git_program": "/usr/bin/git", "environment": map[string]string{"PATH": "/usr/bin:/bin", "HOME": filepath.Join(root, "user-home")}, "command_timeout_ms": 30000, "network_timeout_ms": 30000, "cleanup_timeout_ms": 3000, "shutdown_grace_ms": 2000},
		"clone":    map[string]any{"repository_root": filepath.Join(root, "repositories"), "git_config": gitconfig, "search_path": []string{"/usr/bin"}},
		"control":  map[string]any{"controller_id": "controller", "listen": map[string]string{"kind": "ipc", "path": socket}, "heartbeat_ms": 100, "frame_timeout_ms": 3000},
		"timezone": "Asia/Shanghai", "recovery_interval_ms": 100,
	}
	data, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(root, "config.json")
	if err = os.WriteFile(configPath, data, 0600); err != nil {
		t.Fatal(err)
	}
	stopNode := start("ora-node", configPath)
	waitSocket(socket)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client, err := Dial(ctx, Options{SocketPath: socket, ControllerID: "controller", ExpectedNodeID: "node", HeartbeatInterval: 100 * time.Millisecond, FrameTimeout: 3 * time.Second, RequiredCapabilities: []string{"plugin_install"}})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	for range 2 {
		m, err := client.read(ctx)
		if err != nil || m.Type != "heartbeat" {
			t.Fatalf("real heartbeat: %+v, %v", m, err)
		}
	}
	t.Logf("real Node identity: %+v", client.Identity())
	client.Close()
	stopNode()
}
