//go:build linux

package nodeservices

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"

	"github.com/wanglongan587/cloud/v2-server/internal/node"
)

// NodeConfiguration wires the local services into an unmodified Node. denoPath must refer to
// the deployment's prepared, verified Deno asset. p belongs to the locked runtime, not a caller.
func (s *Service) NodeConfiguration(p node.Paths, ipc node.Options, denoPath string) ([]byte, error) {
	if !filepath.IsAbs(denoPath) {
		return nil, errors.New("Deno path must be absolute")
	}
	gitconfig := filepath.Join(p.Root, "gitconfig")
	file, err := os.CreateTemp(p.Root, ".gitconfig-")
	if err != nil {
		return nil, err
	}
	defer os.Remove(file.Name())
	_, writeErr := file.WriteString("[http]\nsslCAInfo = " + strconv.Quote(s.TLS.CACert) + "\n")
	closeErr := file.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		return nil, err
	}
	if err := os.Rename(file.Name(), gitconfig); err != nil {
		return nil, err
	}
	// Node looks for a reaper named ora-reaper next to itself; the runtime root uses short names.
	// host_directory lets Node delete what the retired process host left in a root prepared
	// before the upgrade; expected_uid is still accepted and is dropped together with it.
	return json.Marshal(map[string]any{
		"node":       map[string]any{"home_directory": p.NodeHome, "identity": map[string]string{"Require": ipc.ExpectedNodeID}, "repositories": []any{}},
		"process":    map[string]any{"reaper_program": filepath.Join(p.Root, "rb"), "host_directory": p.HostHome, "expected_uid": os.Geteuid(), "git_program": "/usr/bin/git", "environment": map[string]string{"PATH": "/usr/bin:/bin", "HOME": p.UserHome}, "command_timeout_ms": 30000, "network_timeout_ms": 30000, "cleanup_timeout_ms": 3000, "shutdown_grace_ms": 2000},
		"clone":      map[string]any{"repository_root": p.Repositories, "git_config": gitconfig, "search_path": []string{"/usr/bin"}},
		"git_access": s.TLS,
		"agent":      map[string]any{"deno_path": denoPath, "ready_timeout_ms": 30000, "model_proxy": map[string]any{"gateway_url": s.URL, "ca_cert": s.TLS.CACert, "client_cert": s.TLS.ClientCert, "client_key": s.TLS.ClientKey}},
		"control":    map[string]any{"controller_id": ipc.ControllerID, "listen": map[string]string{"kind": "ipc", "path": p.Socket}, "heartbeat_ms": ipc.HeartbeatInterval.Milliseconds(), "frame_timeout_ms": ipc.FrameTimeout.Milliseconds()},
		"timezone":   "Asia/Shanghai", "recovery_interval_ms": 100,
	})
}
