//go:build linux

// Package agentruntime adapts the fixed local Node to already-admitted execution sessions.
// Admission, permissions, public event sequence allocation and SQL belong to its caller.
package agentruntime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/node"
	"github.com/wanglongan587/cloud/v2-server/internal/nodeservices"
)

// Project contains trusted repository preparation outputs, never paths supplied by an Agent.
type Project struct {
	MirrorPath  string
	Commit      string
	SnapshotRef string
}

// UserSkill is one validated skill document materialized into a new checkout.
type UserSkill struct {
	Name        string
	Description string
	Content     string
}

// Options wires preverified local assets and frozen model bindings into the adapter.
// ResolveProject must check Scope access and return a prepared mirror and immutable snapshot.
type Options struct {
	Root            string
	AssetsDirectory string
	GitBackend      string
	Bindings        map[string]nodeservices.Binding
	ObserveProvider func(execution.Ref, nodeservices.Binding) nodeservices.Provider
	ResolveProject  func(context.Context, execution.Scope, string) (Project, error)
	// UserSkills returns the caller's live skill catalog. Nil skips user-skill projection.
	UserSkills func(context.Context, execution.Scope) ([]UserSkill, error)
	// RecordWorkspace remembers where a workspace's checkout is, once it is ready and before the
	// Agent starts, so pages can read its files later. Nil records nothing.
	RecordWorkspace func(ctx context.Context, workspaceID string, checkout Checkout) error
}

// Checkout is a workspace's directory on this host and the commit it was cloned at.
type Checkout struct {
	Path       string
	BaseCommit string
}

// Emit retains an event before its source Node envelope can be acknowledged. It must honor ctx.
// TurnEnded must atomically retain Result and the terminal turn event before returning nil.
type Emit func(context.Context, execution.Event) error

// Driver owns one Node per project and one physical Agent execution per logical session.
type Driver struct {
	opts           Options
	boot           string
	mu             sync.Mutex
	closed         bool
	projects       map[string]*projectRuntime
	sessions       map[string]*agentSession
	serial         atomic.Uint64
	controlTimeout time.Duration
	startProject   func(*projectRuntime) error
}

// New validates deployment wiring. Processes start lazily for an already-admitted project turn.
func New(opts Options) (*Driver, error) {
	if !filepath.IsAbs(opts.Root) || !filepath.IsAbs(opts.AssetsDirectory) || !filepath.IsAbs(opts.GitBackend) || opts.ResolveProject == nil || len(opts.Bindings) == 0 {
		return nil, errors.New("invalid Agent runtime configuration")
	}
	for _, plugin := range agentPlugins {
		if _, err := plugin.pkg(); err != nil {
			return nil, err
		}
	}
	// A project's runtime root is <Root>/<16 hex digits>/w; Node's control socket is its longest path.
	if filepath.Clean(opts.Root) != opts.Root || len(node.ControlSocket(filepath.Join(opts.Root, "0000000000000000", "w"))) >= 108 {
		return nil, errors.New("Agent runtime root exceeds the Unix socket path limit; choose a shorter, clean V2_DATA_DIR")
	}
	bindings := make(map[string]nodeservices.Binding, len(opts.Bindings))
	for id, binding := range opts.Bindings {
		if id == "" || binding.Provider == nil || binding.Model.ID == "" {
			return nil, errors.New("invalid Agent runtime binding")
		}
		bindings[id] = binding
	}
	opts.Bindings = bindings
	if err := os.MkdirAll(opts.Root, 0700); err != nil {
		return nil, execution.ErrUnavailable
	}
	recovery, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := Recover(recovery, opts.Root); err != nil {
		return nil, err
	}
	var nonce [8]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, execution.ErrUnavailable
	}
	return &Driver{opts: opts, boot: hex.EncodeToString(nonce[:]), projects: map[string]*projectRuntime{}, sessions: map[string]*agentSession{}, controlTimeout: 2 * time.Minute}, nil
}

// Run executes the admitted turn. Normal Append reuses its original live Agent conversation.
func (d *Driver) Run(ctx context.Context, scope execution.Scope, session execution.Session, turn execution.Turn, emit func(context.Context, execution.Event) error) (execution.Result, error) {
	if session.ID == "" || session.WorkspaceID == "" || session.Target == nil || session.Target.ProjectID == "" || session.Executor == nil || turn.Ref.SessionID != session.ID || turn.Ref.TurnID == "" || emit == nil {
		return failed("agent_request_invalid"), execution.ErrInvalidRequest
	}
	if session.EndedAt != nil {
		return failed("agent_session_ended"), execution.ErrSessionEnded
	}
	text, err := turn.Prompt.Text()
	if err != nil || len(text) > 64*1024 {
		return failed("agent_request_invalid"), execution.ErrInvalidRequest
	}
	plugin, ok := findPlugin(session.Executor.AgentID, session.Executor.PluginVersion)
	if !ok {
		return failed("agent_executor_unsupported"), execution.ErrUnsupported
	}
	binding, ok := d.opts.Bindings[session.Executor.Model.ID]
	if !ok {
		return failed("agent_model_unavailable"), execution.ErrUnavailable
	}
	if binding.Protocol != plugin.protocol {
		return failed("agent_executor_unsupported"), execution.ErrUnsupported
	}
	project, err := d.opts.ResolveProject(ctx, scope, session.Target.ProjectID)
	if err != nil {
		return failed("agent_project_unavailable"), execution.ErrUnavailable
	}
	timing := newPreparation(turn.Ref, emit)
	// A session that is already prepared never starts a stage, so later turns publish nothing.
	defer func() { timing.finish(time.Now()) }()
	a, err := d.session(ctx, scope, session, project, turn.Caller.Kind, timing)
	if err != nil {
		if ctx.Err() != nil {
			return d.cancelledRun(session.ID, ctx.Err())
		}
		if workflowSkillError(err) {
			return failed(err.Error()), err
		}
		return failed("agent_prepare_failed"), err
	}
	a.commandMu.Lock()
	call, fresh, err := a.begin(turn.Ref.TurnID, emit)
	if err != nil {
		a.commandMu.Unlock()
		return failed("agent_session_unavailable"), err
	}
	if fresh {
		timing.enter(stageAgent, time.Now())
		a.mu.Lock()
		a.timing = timing
		a.mu.Unlock()
	}
	err = a.submit(turn.Ref.TurnID, text, fresh)
	a.commandMu.Unlock()
	if err != nil {
		a.fail("agent_dispatch_failed", err)
		a.requestEnd()
	}
	select {
	case outcome := <-call.done:
		if turn.Caller.Kind == execution.CallerChat && outcome.err == nil {
			a.project.mu.Lock()
			a.project.fillSpareLocked(project)
			a.project.mu.Unlock()
		}
		return outcome.result, outcome.err
	case <-ctx.Done():
		result, err := d.cancelledRun(session.ID, ctx.Err())
		select {
		case outcome := <-call.done:
			return outcome.result, outcome.err
		default:
			return result, err
		}
	}
}

// End waits for the physical session to stop; it does not release the caller's SQL directory lock.
func (d *Driver) End(ctx context.Context, sid string) error {
	d.mu.Lock()
	a := d.sessions[sid]
	d.mu.Unlock()
	if a == nil {
		return nil
	}
	select {
	case <-a.ready:
	case <-ctx.Done():
		return execution.ErrStopUnconfirmed
	}
	select {
	case <-a.stopped:
		return nil
	default:
	}
	if a.prepareErr != nil && a.project != nil && a.project.initErr != nil {
		if err := a.project.close(ctx); err != nil {
			return err
		}
		a.markStopped()
		return nil
	}
	a.requestEnd()
	if a.project == nil {
		return nil
	}
	select {
	case <-a.stopped:
		return nil
	case <-ctx.Done():
		return execution.ErrStopUnconfirmed
	case <-a.project.dead:
		// A disconnected Node cannot acknowledge End. Retire its entire incarnation
		// and require the supervisor's process-tree proof before releasing any owner.
		if err := a.project.close(ctx); err != nil {
			return execution.ErrStopUnconfirmed
		}
		d.dropProject(a.project)
		return nil
	}
}

// Close stops all owned sessions and Nodes. A failed stop remains retryable.
func (d *Driver) Close(ctx context.Context) error {
	d.mu.Lock()
	d.closed = true
	projects := make([]*projectRuntime, 0, len(d.projects))
	for _, p := range d.projects {
		projects = append(projects, p)
	}
	d.mu.Unlock()
	var result error
	for _, p := range projects {
		if err := p.close(ctx); err != nil {
			result = errors.Join(result, execution.ErrStopUnconfirmed)
		}
	}
	if result == nil {
		d.mu.Lock()
		sessions := make([]*agentSession, 0, len(d.sessions))
		for _, session := range d.sessions {
			sessions = append(sessions, session)
		}
		d.mu.Unlock()
		for _, session := range sessions {
			select {
			case <-session.ready:
				session.markStopped()
			case <-ctx.Done():
				return execution.ErrStopUnconfirmed
			}
		}
	}
	return result
}

func (d *Driver) cancelledRun(sid string, reason error) (execution.Result, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := d.End(ctx, sid); err != nil {
		return failed("agent_stop_unconfirmed"), err
	}
	return execution.Result{Status: execution.StatusCancelled, StopReason: "cancelled"}, reason
}

func failed(code string) execution.Result {
	return execution.Result{Status: execution.StatusFailed, FailureCode: code}
}
