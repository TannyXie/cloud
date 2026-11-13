//go:build linux

package agentruntime

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/node"
	"github.com/wanglongan587/cloud/v2-server/internal/nodehistory"
	"github.com/wanglongan587/cloud/v2-server/internal/nodeservices"
)

type controlWait struct {
	kind string
	done chan node.Message
}

type checkout struct {
	workflow bool
	id, path string
	ready    chan struct{}
	err      error
}

// installation is one plugin's install on this Node incarnation, shared by its sessions.
type installation struct {
	ready chan struct{}
	err   error
}

// The dispatcher owns Receive; control and session workers may send concurrently.
type nodeClient interface {
	Identity() node.Identity
	Send(context.Context, node.Message) error
	Receive(context.Context) (node.Message, error)
	Ack(context.Context, node.Message) error
	Close() error
}

// One reader owns all projections. Control replies and sessions are dispatched by execution ID;
// no per-turn goroutine may call Client.Receive or close the project's shared transport.
type projectRuntime struct {
	warmDemo       bool
	spare          *checkout // Unclaimed Demo checkout, never contains user skills.
	skillsMu       sync.Mutex
	driver         *Driver
	id, root       string
	configuration  Project
	ready          chan struct{}
	initErr        error
	ctx            context.Context
	cancel         context.CancelFunc
	runtime        *node.Runtime
	client         nodeClient
	stop           func(context.Context) error
	receiveStarted bool
	services       *nodeservices.Service
	reader         *nodehistory.Reader
	journal        *os.File
	loopDone       chan struct{}
	dead           chan struct{}
	deadOnce       sync.Once
	closeGate      chan struct{}
	closeGateOnce  sync.Once
	closed         bool
	serviceClosed  bool
	readerClosed   bool
	journalClosed  bool
	registered     bool
	mu             sync.Mutex
	fatal          bool
	controls       map[string]*controlWait
	agents         map[string]*agentSession
	checkouts      map[string]*checkout
	installs       map[string]*installation
	owners         map[string]string
	acknowledged   map[string]uint64
}

func digest(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:16])
}

func (d *Driver) nextID(prefix string) string {
	return fmt.Sprintf("%s-%s-%x", prefix, d.boot, d.serial.Add(1))
}

func (d *Driver) dropProject(p *projectRuntime) {
	d.mu.Lock()
	if d.projects[p.id] == p {
		delete(d.projects, p.id)
	}
	d.mu.Unlock()
}

func (d *Driver) project(ctx context.Context, id string, config Project) (*projectRuntime, error) {
	for {
		d.mu.Lock()
		if d.closed {
			d.mu.Unlock()
			return nil, execution.ErrUnavailable
		}
		p := d.projects[id]
		if p == nil {
			lifetime, cancel := context.WithCancel(context.Background())
			p = &projectRuntime{driver: d, id: id, root: filepath.Join(d.opts.Root, digest(id)[:16]), configuration: config,
				ready: make(chan struct{}), ctx: lifetime, cancel: cancel, loopDone: make(chan struct{}), dead: make(chan struct{}),
				controls: map[string]*controlWait{}, agents: map[string]*agentSession{}, checkouts: map[string]*checkout{}, installs: map[string]*installation{}, owners: map[string]string{}, acknowledged: map[string]uint64{}}
			d.projects[id] = p
			go p.initialize()
		}
		d.mu.Unlock()
		select {
		case <-p.ready:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		if p.initErr != nil {
			// The failed initializer has already attempted cleanup. A later caller may retry
			// cleanup, but must never spawn another incarnation without stop confirmation.
			if p.close(ctx) == nil {
				d.dropProject(p)
			}
			return nil, execution.ErrUnavailable
		}
		p.mu.Lock()
		fatal := p.fatal
		p.mu.Unlock()
		if !fatal {
			return p, nil
		}
		if p.close(ctx) != nil {
			return nil, execution.ErrUnavailable
		}
		d.dropProject(p)
	}
}

func (p *projectRuntime) initialize() {
	start := p.driver.startProject
	if start == nil {
		start = (*projectRuntime).start
	}
	p.initErr = start(p)
	if p.initErr != nil {
		p.mu.Lock()
		p.fatal = true
		p.mu.Unlock()
		p.deadOnce.Do(func() { close(p.dead) })
		cleanup, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		if p.lockClose(cleanup) == nil {
			if p.closeResources(cleanup) == nil {
				p.driver.dropProject(p)
			}
			p.unlockClose()
		}
		cancel()
	}
	close(p.ready)
}

func (p *projectRuntime) start() error {
	opts := p.driver.opts
	if !filepath.IsAbs(p.configuration.MirrorPath) {
		return execution.ErrUnavailable
	}
	if err := p.register(); err != nil {
		return err
	}
	p.registered = true
	packages := make([]nodeservices.Package, len(agentPlugins))
	for i, plugin := range agentPlugins {
		pkg, err := plugin.pkg()
		if err != nil {
			return err
		}
		packages[i] = nodeservices.Package{Name: plugin.name, Path: filepath.Join(opts.AssetsDirectory, plugin.file), SHA256: pkg.SHA256}
	}
	var err error
	p.services, err = nodeservices.Start(nodeservices.Options{StateDirectory: p.root, Repository: p.configuration.MirrorPath, GitBackend: opts.GitBackend,
		Packages: packages, Bindings: opts.Bindings, ProviderFor: p.providerFor})
	if err != nil {
		return err
	}
	assets := make(map[string]node.Asset)
	for _, name := range []string{"ora-node", "ora-reaper"} {
		path := filepath.Join(opts.AssetsDirectory, "bin", name)
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, copyErr := io.Copy(hash, file)
		closeErr := file.Close()
		if err := errors.Join(copyErr, closeErr); err != nil {
			return err
		}
		assets[name] = node.Asset{Path: path, SHA256: hex.EncodeToString(hash.Sum(nil))}
	}
	ipc := node.Options{ControllerID: "v2-execution", ExpectedNodeID: "v2-" + digest(p.id), HeartbeatInterval: time.Second, FrameTimeout: 15 * time.Second, RequiredCapabilities: []string{"plugin_install", "agent_session"}, ThreadPreviews: true}
	p.runtime, err = node.StartRuntime(p.ctx, node.RuntimeOptions{Root: filepath.Join(p.root, "w"), Node: assets["ora-node"], Reaper: assets["ora-reaper"], IPC: ipc,
		StartupTimeout: 20 * time.Second, StopGrace: 3 * time.Second, Configure: func(paths node.Paths) ([]byte, error) {
			return p.services.NodeConfiguration(paths, ipc, filepath.Join(opts.AssetsDirectory, "bin", "deno"))
		}})
	if err != nil {
		return err
	}
	p.client, p.stop = p.runtime.Client, p.runtime.Stop
	// Start the receiver before any control wait. It also drains terminal events during cleanup.
	p.journal, err = os.OpenFile(filepath.Join(p.root, "node-events.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	p.reader, err = nodehistory.Open(filepath.Join(p.root, "w", "n"))
	if err != nil {
		return err
	}
	p.receiveStarted = true
	go p.receive()
	return nil
}

// providerFor binds each observed HTTP request to the current admitted turn, not a browser ID.
// Returning nil denies a request when its execution or active turn is no longer present.
// Every call of an active turn also passes the turn's retry guard.
func (p *projectRuntime) providerFor(id string, binding nodeservices.Binding) nodeservices.Provider {
	observe := p.driver.opts.ObserveProvider
	p.mu.Lock()
	a := p.agents[id]
	p.mu.Unlock()
	if a == nil {
		if observe == nil {
			return binding.Provider
		}
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.active == nil {
		if observe == nil || !a.observeRequests {
			return binding.Provider
		}
		return nil
	}
	provider := binding.Provider
	if observe != nil && a.observeRequests {
		provider = observe(execution.Ref{SessionID: a.frozen.ID, TurnID: a.active.id}, binding)
	}
	return a.active.guard.provider(provider, binding.Protocol)
}

func (p *projectRuntime) ipc() nodeClient {
	if p.client != nil {
		return p.client
	}
	return p.runtime.Client
}

func (p *projectRuntime) nodeID() string { return p.ipc().Identity().NodeID }

func (p *projectRuntime) send(kind, id string, payload any) error {
	return p.sendContext(p.ctx, kind, id, payload)
}

func (p *projectRuntime) sendContext(parent context.Context, kind, id string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return execution.ErrInvalidRequest
	}
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	if err := p.ipc().Send(ctx, node.Message{Type: kind, Version: 1, OperationID: "op-" + id, ExecutionID: id, Payload: data}); err != nil {
		return execution.ErrUnavailable
	}
	return nil
}

func (p *projectRuntime) control(ctx context.Context, id, command, expected string, payload any) (node.Message, error) {
	timeout := p.driver.controlTimeout
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	wait := &controlWait{kind: expected, done: make(chan node.Message, 1)}
	p.mu.Lock()
	p.controls[id] = wait
	p.mu.Unlock()
	defer func() { p.mu.Lock(); delete(p.controls, id); p.mu.Unlock() }()
	if err := p.sendContext(ctx, command, id, payload); err != nil {
		p.transportFailed()
		return node.Message{}, err
	}
	select {
	case message := <-wait.done:
		return message, nil
	case <-p.dead:
		return node.Message{}, execution.ErrUnavailable
	case <-ctx.Done():
		// Completion is ambiguous: a timed-out clone may still mutate its checkout.
		// Retire the entire incarnation before allowing another preparation attempt.
		p.transportFailed()
		return node.Message{}, execution.ErrUnavailable
	}
}

// install starts installing plugin on first use. A first Claude Code install unpacks a few
// hundred megabytes, so a project that only runs OpenCode never pays for it. Node keeps its
// installed plugins in the project's home, so a later incarnation reinstalls in about a second.
func (p *projectRuntime) install(plugin agentPlugin) *installation {
	p.mu.Lock()
	defer p.mu.Unlock()
	if entry := p.installs[plugin.name]; entry != nil {
		return entry
	}
	entry := &installation{ready: make(chan struct{})}
	p.installs[plugin.name] = entry
	go func() {
		defer func() {
			p.mu.Lock()
			if entry.err != nil && p.installs[plugin.name] == entry {
				delete(p.installs, plugin.name)
			}
			p.mu.Unlock()
			close(entry.ready)
		}()
		pkg, err := plugin.pkg()
		if err != nil {
			entry.err = execution.ErrUnavailable
			return
		}
		input := map[string]any{"spec": map[string]any{"node_id": p.nodeID(), "plugins": []any{plugin.installSpec(pkg, p.services.PackageURLs[plugin.name])}}}
		// A timeout inside control retires the incarnation: the install may still be running.
		message, err := p.control(p.ctx, p.driver.nextID("i"), "install_plugins", "plugins_result", input)
		if err != nil {
			entry.err = execution.ErrUnavailable
			return
		}
		var installed struct {
			Kind   string
			Result struct {
				Items []struct{ Outcome struct{ Kind string } }
			}
		}
		if json.Unmarshal(message.Payload, &installed) != nil || installed.Kind != "plugins_completed" || len(installed.Result.Items) != 1 || installed.Result.Items[0].Outcome.Kind != "installed" {
			entry.err = execution.ErrUnavailable
		}
	}()
	return entry
}

func (i *installation) wait(ctx context.Context, p *projectRuntime) error {
	select {
	case <-i.ready:
		return i.err
	case <-p.dead:
		return execution.ErrUnavailable
	case <-ctx.Done():
		return ctx.Err()
	}
}

// WarmDemo starts one pristine checkout for the bootstrapped Demo snapshot.
func (d *Driver) WarmDemo(ctx context.Context, id string, config Project) {
	p, err := d.project(ctx, id, config)
	if err != nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.configuration == config {
		p.warmDemo = true
		p.fillSpareLocked(config)
	}
}

func (p *projectRuntime) fillSpareLocked(config Project) {
	if !p.warmDemo || config != p.configuration || p.spare != nil || p.fatal || p.ctx.Err() != nil {
		return
	}
	spare := &checkout{id: p.driver.nextID("c"), ready: make(chan struct{})}
	p.spare = spare
	go func() {
		defer close(spare.ready)
		spare.path, spare.err = p.clonePath(p.ctx, spare.id, config, spare)
	}()
}

func (p *projectRuntime) clonePath(ctx context.Context, key string, config Project, entry *checkout) (string, error) {
	ref := digest(key)
	workspaceID := ref[:8] + "-" + ref[8:12] + "-4" + ref[13:16] + "-8" + ref[17:20] + "-" + ref[20:]
	message, err := p.control(ctx, entry.id, "clone_repository", "clone_result", map[string]any{"spec": map[string]any{"node_id": p.nodeID(), "repository_url": p.services.URL + "/repo.git", "snapshot_ref": config.SnapshotRef, "base_commit": config.Commit, "workspace_ref": "refs/heads/workspaces/" + workspaceID + "/main"}})
	if err != nil {
		return "", execution.ErrUnavailable
	}
	var cloned struct {
		Kind   string
		Result struct{ Path, Commit string }
	}
	if json.Unmarshal(message.Payload, &cloned) != nil || cloned.Kind != "clone_ready" || cloned.Result.Commit != config.Commit {
		return "", execution.ErrUnavailable
	}
	rel, err := filepath.Rel(filepath.Join(p.root, "w", "r"), cloned.Result.Path)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", execution.ErrUnavailable
	}
	return cloned.Result.Path, nil
}

// A failed speculative checkout has no workspace owner. Retry through normal admission.
func (p *projectRuntime) checkoutPath(ctx context.Context, workspace string, config Project, spare, entry *checkout, timing *preparation) (string, error) {
	if spare != nil {
		select {
		case <-spare.ready:
			if spare.err == nil {
				entry.id = spare.id
				timing.reused()
				return spare.path, nil
			}
		case <-ctx.Done():
			return "", ctx.Err()
		case <-p.dead:
			return "", execution.ErrUnavailable
		}
	}
	return p.clonePath(ctx, workspace, config, entry)
}

func (p *projectRuntime) prepareCheckout(ctx context.Context, scope execution.Scope, workspace string, config Project, caller execution.CallerKind, timing *preparation) (*checkout, error) {
	p.mu.Lock()
	entry := p.checkouts[workspace]
	if entry == nil {
		entry = &checkout{workflow: caller == execution.CallerWorkflow, id: p.driver.nextID("c") + "-" + digest(workspace), ready: make(chan struct{})}
		p.checkouts[workspace] = entry
		var spare *checkout
		if caller == execution.CallerChat && p.configuration == config && p.spare != nil {
			spare, p.spare = p.spare, nil
		}
		go func() {
			defer func() {
				p.mu.Lock()
				if entry.err != nil && p.checkouts[workspace] == entry {
					delete(p.checkouts, workspace)
				}
				p.mu.Unlock()
				close(entry.ready)
			}()
			path, err := p.checkoutPath(ctx, workspace, config, spare, entry, timing)
			if err != nil {
				entry.err = err
				return
			}
			if caller != execution.CallerWorkflow {
				if err := p.attachSkills(path); err != nil {
					entry.err = err
					return
				}
				if err := p.attachUserSkills(ctx, path, scope); err != nil {
					entry.err = err
					return
				}
			}
			if record := p.driver.opts.RecordWorkspace; record != nil {
				if err := record(ctx, workspace, Checkout{Path: path, BaseCommit: config.Commit}); err != nil {
					entry.err = err
					return
				}
			}
			entry.path = path
		}()
	}
	p.mu.Unlock()
	select {
	case <-entry.ready:
		return entry, entry.err
	case <-p.dead:
		return nil, execution.ErrUnavailable
	case <-ctx.Done():
		p.transportFailed()
		return nil, ctx.Err()
	}
}

// Every received durable envelope is first fsynced. Agent events additionally require the
// caller's successful SQL publication before ACK; the journal alone never proves a turn complete.
func (p *projectRuntime) receive() {
	defer close(p.loopDone)
	defer p.transportFailed()
	for {
		message, err := p.ipc().Receive(p.ctx)
		if err != nil {
			return
		}
		if message.Sequence != nil {
			if err := json.NewEncoder(p.journal).Encode(message); err != nil || p.journal.Sync() != nil {
				return
			}
			if last, exists := p.acknowledged[message.ExecutionID]; exists && *message.Sequence <= last {
				if p.ipc().Ack(p.ctx, message) != nil {
					return
				}
				continue
			}
		}
		p.mu.Lock()
		agent, control := p.agents[message.ExecutionID], p.controls[message.ExecutionID]
		p.mu.Unlock()
		var outcome *turnOutcome
		ack := true
		if agent != nil {
			outcome, ack = agent.observe(message)
		}
		if message.Sequence != nil && ack {
			if p.ipc().Ack(p.ctx, message) != nil {
				if outcome != nil {
					agent.complete(*outcome)
				}
				return
			}
			p.acknowledged[message.ExecutionID] = *message.Sequence
		}
		if outcome != nil {
			agent.complete(*outcome)
		}
		if control != nil && message.Type == control.kind {
			select {
			case control.done <- message:
			default:
			}
		}
	}
}

func (p *projectRuntime) transportFailed() {
	_ = p.ipc().Close()
	p.mu.Lock()
	p.fatal = true
	agents := make([]*agentSession, 0, len(p.agents))
	for _, a := range p.agents {
		agents = append(agents, a)
	}
	p.mu.Unlock()
	p.deadOnce.Do(func() { close(p.dead) })
	for _, a := range agents {
		a.fail("agent_transport_closed", execution.ErrUnavailable)
	}
}

func (p *projectRuntime) close(ctx context.Context) error {
	select {
	case <-p.ready:
	case <-ctx.Done():
		p.cancel()
		return execution.ErrStopUnconfirmed
	}
	if err := p.lockClose(ctx); err != nil {
		return err
	}
	defer p.unlockClose()
	return p.closeResources(ctx)
}

// A bounded caller must not wait indefinitely behind another shutdown attempt.
func (p *projectRuntime) lockClose(ctx context.Context) error {
	p.closeGateOnce.Do(func() {
		p.closeGate = make(chan struct{}, 1)
		p.closeGate <- struct{}{}
	})
	select {
	case <-ctx.Done():
		return execution.ErrStopUnconfirmed
	case <-p.closeGate:
		return nil
	}
}

func (p *projectRuntime) unlockClose() { p.closeGate <- struct{}{} }

// Caller holds closeGate. It may run before ready only in the initialization worker.
func (p *projectRuntime) closeResources(ctx context.Context) error {
	if p.closed {
		return nil
	}
	p.mu.Lock()
	agents := make([]*agentSession, 0, len(p.agents))
	for _, a := range p.agents {
		agents = append(agents, a)
	}
	p.mu.Unlock()
	for _, a := range agents {
		a.requestEnd()
	}
	// Stop supplies the final process-tree proof even when transport or cooperative End failed.
	if p.stop != nil {
		if p.stop(ctx) != nil {
			return execution.ErrStopUnconfirmed
		}
	} else if p.runtime != nil {
		if p.runtime.Stop(ctx) != nil {
			return execution.ErrStopUnconfirmed
		}
	} else if p.registered && node.RecoverRuntime(ctx, filepath.Join(p.root, "w"), 3*time.Second) != nil {
		return execution.ErrStopUnconfirmed
	}
	p.cancel()
	if p.receiveStarted {
		select {
		case <-p.loopDone:
		case <-ctx.Done():
			return execution.ErrStopUnconfirmed
		}
	}
	for _, a := range agents {
		a.markStopped()
	}
	if p.services != nil && !p.serviceClosed {
		if p.services.Close() != nil {
			return execution.ErrStopUnconfirmed
		}
		p.serviceClosed = true
	}
	var result error
	if p.reader != nil && !p.readerClosed {
		result = errors.Join(result, p.reader.Close())
		p.readerClosed = true
	}
	if p.journal != nil && !p.journalClosed {
		result = errors.Join(result, p.journal.Close())
		p.journalClosed = true
	}
	if result != nil {
		return execution.ErrStopUnconfirmed
	}
	p.closed = true
	return nil
}
