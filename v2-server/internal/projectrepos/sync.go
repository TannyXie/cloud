package projectrepos

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
)

// ErrRepositoryAuth reports a pull rejected by the external repository's credentials.
var ErrRepositoryAuth = errors.New("project repository authentication failed")

// ErrRepositoryBranchGone reports a pull of a branch the external repository no longer has.
var ErrRepositoryBranchGone = errors.New("project repository branch missing")

// SyncResult carries the outcome of a successful manual sync.
type SyncResult struct {
	// Project is the stored project after the sync advanced its snapshot.
	Project store.Project
	// ForcePushed notes that the remote branch was rewritten and followed.
	ForcePushed bool
}

// Sync pulls the project's bound branch into its mirror, writes a new snapshot ref and advances
// the current snapshot, exactly once per project at a time. A second click shares the in-flight
// sync's outcome instead of fetching again. Failures leave the current snapshot untouched and are
// written to the project's SyncError for the project page.
func (s *Service) Sync(ctx context.Context, scope execution.Scope, id string) (SyncResult, error) {
	s.mu.Lock()
	if call, ok := s.inflight[id]; ok {
		s.mu.Unlock()
		select {
		case <-call.done:
			return call.result, call.err
		case <-ctx.Done():
			return SyncResult{}, ctx.Err()
		}
	}
	call := &syncCall{done: make(chan struct{})}
	s.inflight[id] = call
	s.mu.Unlock()
	// The pull belongs to the project, not to the first click: a client that disconnects must not
	// cancel the fetch other clicks are waiting on, or leave the record marked as running.
	call.result, call.err = s.syncOne(context.WithoutCancel(ctx), scope, id)
	close(call.done)
	s.mu.Lock()
	delete(s.inflight, id)
	s.mu.Unlock()
	return call.result, call.err
}

// syncOne performs the pull and advances the record. It holds the project's mutation lock so a
// token change cannot interleave with the snapshot update.
func (s *Service) syncOne(ctx context.Context, scope execution.Scope, id string) (SyncResult, error) {
	unlock, err := s.lockProject(id)
	if err != nil {
		return SyncResult{}, err
	}
	defer unlock()
	project, err := s.store.GetProject(ctx, scope, id)
	if err != nil {
		return SyncResult{}, err
	}
	auth, err := s.projectAuth(scope, project)
	if err != nil {
		return SyncResult{}, s.fail(ctx, scope, project, "令牌不可用：缺少加密密钥或密文无法打开。")
	}
	project.SyncRunning = true
	if _, err := s.store.UpdateProject(ctx, scope, project); err != nil {
		return SyncResult{}, err
	}
	pullCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	output, err := s.runAuth(pullCtx, project.MirrorPath, auth, "fetch", "--no-tags", "--", project.RepositoryURL, "refs/heads/"+project.Branch)
	if err != nil {
		reason := s.syncFailureReason(pullCtx, output)
		return SyncResult{}, s.fail(ctx, scope, project, reason)
	}
	commit, err := s.run(pullCtx, project.MirrorPath, "rev-parse", "--verify", "FETCH_HEAD^{commit}")
	if err != nil {
		reason := s.syncFailureReason(pullCtx, output+commit)
		return SyncResult{}, s.fail(ctx, scope, project, reason)
	}
	commit = strings.TrimSpace(commit)
	if len(commit) != 40 && len(commit) != 64 {
		return SyncResult{}, s.fail(ctx, scope, project, "同步结果异常，请重试。")
	}
	// A remote branch rewritten since the project's last snapshot is not an ancestor: note it, and
	// keep the old snapshot ref while following. A repeated pull of the same commit stays quiet.
	forcePushed := false
	if commit != project.Commit {
		if _, err := s.run(pullCtx, project.MirrorPath, "merge-base", "--is-ancestor", project.Commit, commit); err != nil {
			forcePushed = true
		}
	}
	snapshot := SnapshotRef(project.ID, commit)
	if _, err := s.run(pullCtx, project.MirrorPath, "update-ref", snapshot, commit); err != nil {
		return SyncResult{}, s.fail(ctx, scope, project, "快照写入失败，请重试。")
	}
	now := time.Now().UTC()
	project.Commit = commit
	project.SnapshotRef = snapshot
	project.SyncAt = &now
	project.SyncForcePushed = forcePushed
	project.SyncError = ""
	project.SyncRunning = false
	project, err = s.store.UpdateProject(ctx, scope, project)
	if err != nil {
		return SyncResult{}, err
	}
	return SyncResult{Project: project, ForcePushed: forcePushed}, nil
}

// fail records a sync failure against the project without touching the current snapshot and
// returns the sentinel the HTTP layer maps to a sync-failed response.
func (s *Service) fail(ctx context.Context, scope execution.Scope, project store.Project, reason string) error {
	project.SyncRunning = false
	project.SyncError = reason
	if _, err := s.store.UpdateProject(ctx, scope, project); err != nil && !errors.Is(err, execution.ErrNotFound) {
		return err
	}
	return ErrRepositoryUnavailable
}

// syncFailureReason maps a failed pull's context and Git output to a project-page reason.
func (s *Service) syncFailureReason(ctx context.Context, output string) string {
	if ctx.Err() == context.DeadlineExceeded {
		return "同步超时，请检查仓库地址和网络后重试。"
	}
	lower := strings.ToLower(output)
	for _, marker := range []string{"authentication failed", "could not read username", "could not read password",
		"unable to get password", "invalid username or password", "returned error: 401", "returned error: 403"} {
		if strings.Contains(lower, marker) {
			return "仓库认证失败，请检查项目令牌后重试。"
		}
	}
	if strings.Contains(lower, "couldn't find remote ref") || strings.Contains(lower, "remote branch") && strings.Contains(lower, "not found") {
		return "外部分支已删除或不可用，无法同步。"
	}
	return "同步失败，请检查仓库地址和网络后重试。"
}
