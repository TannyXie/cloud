//go:build linux

package node

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

// ErrRuntimeBusy means another supervisor still owns this Workspace runtime root.
var ErrRuntimeBusy = errors.New("workspace runtime already owned")

// Paths are private, short, stable locations within one Workspace's runtime root. HostHome is
// where the retired process host kept its state; Node deletes it once the old host has stopped.
type Paths struct{ Root, NodeHome, HostHome, Repositories, UserHome, Config, Socket string }

// ControlSocket is Node's control socket, the longest path the runtime binds under root.
func ControlSocket(root string) string { return filepath.Join(root, "n", "control.sock") }

// RuntimeOptions contains trusted deployment inputs, not HTTP request values. Configure must
// produce Node configuration using the supplied paths and the same identity/timing as IPC.
type RuntimeOptions struct {
	Root           string
	Node, Reaper   Asset
	IPC            Options
	Configure      func(Paths) ([]byte, error)
	StartupTimeout time.Duration
	StopGrace      time.Duration
}

type child struct {
	cmd  *exec.Cmd
	done chan struct{}
	err  error
}

// Runtime owns Node, its IPC client and a cross-process Workspace lock. Node starts the reaper
// itself; the reaper outlives a killed Node only briefly, and cleanup stops it by executable path.
// A process exit or IPC failure closes Done; consumers mark affected work interrupted, never
// replay it.
// Stop terminates the runtime, so callers normally EndSession first to retain its final events.
type Runtime struct {
	Client    *Client
	paths     Paths
	lock      *os.File
	node      *child
	grace     time.Duration
	mu        sync.Mutex
	stopped   bool
	done      chan struct{}
	watchStop chan struct{}
}

// StartRuntime recovers leftovers before spawning anything. A failed cleanup keeps the root
// unavailable; existing Node database and checkout contents are never deleted or edited.
func StartRuntime(ctx context.Context, opts RuntimeOptions) (_ *Runtime, resultErr error) {
	if opts.Configure == nil || opts.StartupTimeout <= 0 || opts.StopGrace <= 0 {
		return nil, errors.New("invalid runtime options")
	}
	paths, lock, err := claimRoot(opts.Root)
	if err != nil {
		return nil, err
	}
	r := &Runtime{paths: paths, lock: lock, grace: opts.StopGrace, done: make(chan struct{}), watchStop: make(chan struct{})}
	defer func() {
		if resultErr != nil {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), opts.StopGrace*3)
			defer cancel()
			resultErr = errors.Join(resultErr, r.stopProcesses(cleanupCtx))
			_ = lock.Close()
		}
	}()
	if err := cleanOwned(ctx, paths, opts.StopGrace); err != nil {
		return nil, err
	}
	for name, asset := range map[string]Asset{"nb": opts.Node, "rb": opts.Reaper} {
		if err := copyAsset(asset, filepath.Join(paths.Root, name)); err != nil {
			return nil, fmt.Errorf("prepare %s: %w", name, err)
		}
	}
	for _, path := range []string{paths.Repositories, paths.UserHome} {
		if err := os.MkdirAll(path, 0700); err != nil {
			return nil, err
		}
	}
	config, err := opts.Configure(paths)
	if err != nil {
		return nil, err
	}
	if err := writeConfig(paths.Config, config); err != nil {
		return nil, err
	}
	startup, cancel := context.WithTimeout(ctx, opts.StartupTimeout)
	defer cancel()
	r.node, err = startChild(filepath.Join(paths.Root, "nb"), paths, paths.Config)
	if err != nil {
		return nil, err
	}
	if err := waitSocket(startup, paths.Socket, r.node); err != nil {
		return nil, err
	}
	opts.IPC.SocketPath = paths.Socket
	r.Client, err = Dial(startup, opts.IPC)
	if err != nil {
		return nil, err
	}
	go func() {
		select {
		case <-r.node.done:
		case <-r.Client.done:
		case <-r.watchStop:
		}
		_ = r.Client.Close()
		close(r.done)
	}()
	return r, nil
}

// Done closes when Node exits, the IPC transport fails, or Stop completes its shutdown.
// A failed transport is never redialled; callers Stop and start the runtime again.
func (r *Runtime) Done() <-chan struct{} { return r.done }

// Stop is retryable after failure, and unlocks the Workspace only after owned processes have
// exited and stale control sockets have been removed. It never removes checkout or DB files.
func (r *Runtime) Stop(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stopped {
		return nil
	}
	if err := r.stopProcesses(ctx); err != nil {
		return err
	}
	close(r.watchStop)
	<-r.done
	r.stopped = true
	return r.lock.Close()
}

func (r *Runtime) stopProcesses(ctx context.Context) error {
	if r.Client != nil {
		_ = r.Client.Close()
	}
	if err := stopChild(ctx, r.node, r.grace); err != nil {
		return err
	}
	return cleanOwned(ctx, r.paths, r.grace)
}

func stopChild(ctx context.Context, p *child, grace time.Duration) error {
	if p == nil {
		return nil
	}
	select {
	case <-p.done:
		return nil
	default:
	}
	_ = p.cmd.Process.Signal(syscall.SIGTERM)
	timer := time.NewTimer(grace)
	defer timer.Stop()
	select {
	case <-p.done:
		return nil
	case <-timer.C:
		_ = p.cmd.Process.Kill()
		select {
		case <-p.done:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	case <-ctx.Done():
		return ctx.Err()
	}
}

func claimRoot(root string) (Paths, *os.File, error) {
	if !filepath.IsAbs(root) || filepath.Clean(root) != root || len(ControlSocket(root)) >= 108 {
		return Paths{}, nil, errors.New("runtime root must be absolute, clean and fit the Node control socket path")
	}
	if err := os.Mkdir(root, 0700); err != nil && !os.IsExist(err) {
		return Paths{}, nil, err
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil || resolved != root {
		return Paths{}, nil, errors.New("runtime root must not contain symlinks")
	}
	info, err := os.Stat(root)
	if err != nil {
		return Paths{}, nil, err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !info.IsDir() || info.Mode().Perm() != 0700 || !ok || stat.Uid != uint32(os.Geteuid()) {
		return Paths{}, nil, errors.New("runtime root must be private and owned by current uid")
	}
	fd, err := unix.Open(filepath.Join(root, "owner.lock"), unix.O_CREAT|unix.O_RDWR|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0600)
	if err != nil {
		return Paths{}, nil, err
	}
	lock := os.NewFile(uintptr(fd), "runtime lock")
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		lock.Close()
		if errors.Is(err, unix.EWOULDBLOCK) {
			return Paths{}, nil, ErrRuntimeBusy
		}
		return Paths{}, nil, err
	}
	// Never adopt an unrelated nonempty directory as a runtime and overwrite its files.
	marker := filepath.Join(root, "runtime-version")
	if info, err := os.Lstat(marker); os.IsNotExist(err) {
		entries, err := os.ReadDir(root)
		if err != nil {
			lock.Close()
			return Paths{}, nil, err
		}
		for _, entry := range entries {
			if entry.Name() != "owner.lock" {
				lock.Close()
				return Paths{}, nil, errors.New("runtime root contains unrecognized existing files")
			}
		}
		if err := os.WriteFile(marker, []byte("v2-node-runtime-1\n"), 0600); err != nil {
			lock.Close()
			return Paths{}, nil, err
		}
	} else if err != nil || !info.Mode().IsRegular() {
		lock.Close()
		return Paths{}, nil, errors.New("invalid runtime ownership marker")
	} else if data, err := os.ReadFile(marker); err != nil || string(data) != "v2-node-runtime-1\n" {
		lock.Close()
		return Paths{}, nil, errors.New("unsupported runtime ownership marker")
	}
	paths := Paths{Root: root, NodeHome: filepath.Join(root, "n"), HostHome: filepath.Join(root, "h"), Repositories: filepath.Join(root, "r"), UserHome: filepath.Join(root, "u"), Config: filepath.Join(root, "config.json"), Socket: ControlSocket(root)}
	return paths, lock, nil
}

func startChild(binary string, paths Paths, args ...string) (*child, error) {
	fd, err := unix.Open(binary+".log", unix.O_CREAT|unix.O_WRONLY|unix.O_APPEND|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, err
	}
	log := os.NewFile(uintptr(fd), binary+".log")
	cmd := exec.Command(binary, args...)
	cmd.Dir = paths.Root
	cmd.Env = []string{"PATH=/usr/bin:/bin", "HOME=" + paths.UserHome}
	cmd.Stdout = log
	cmd.Stderr = log
	if err := cmd.Start(); err != nil {
		log.Close()
		return nil, err
	}
	p := &child{cmd: cmd, done: make(chan struct{})}
	go func() { p.err = cmd.Wait(); log.Close(); close(p.done) }()
	return p, nil
}

func writeConfig(path string, data []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".config-")
	if err != nil {
		return err
	}
	defer file.Close()
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func waitSocket(ctx context.Context, path string, p *child) error {
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		if info, err := os.Lstat(path); err == nil {
			if info.Mode()&os.ModeSocket != 0 {
				return nil
			}
			return errors.New("control endpoint is not a socket")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-p.done:
			return fmt.Errorf("runtime process exited before ready: %w", p.err)
		case <-ticker.C:
		}
	}
}
