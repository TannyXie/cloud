package store_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
)

func TestProjectsSharedOnlyWithinTheirTenant(t *testing.T) {
	f := executionDatabase(t)
	ctx := t.Context()
	project, err := f.s.CreateProject(ctx, f.scope, store.Project{ID: "project", OwnerUserID: "forged-owner", Name: "Demo", RepositoryURL: "https://example.com/demo.git", Branch: "main", Commit: "fixed", MirrorPath: "/private/demo.git", SnapshotRef: "refs/ora/snapshots/fixed"})
	if err != nil || project.CreatedAt.IsZero() || project.OwnerUserID != f.scope.UserID || project.SnapshotRef != "refs/ora/snapshots/fixed" {
		t.Fatalf("project=%+v err=%v", project, err)
	}
	other := executionMember(t, f.s, "member")
	got, err := f.s.GetProject(ctx, other, project.ID)
	if err != nil || !reflect.DeepEqual(got, project) {
		t.Fatalf("tenant share=%+v err=%v", got, err)
	}
	items, err := f.s.ListProjects(ctx, other)
	if err != nil || len(items) != 1 || !reflect.DeepEqual(items[0], project) {
		t.Fatalf("projects=%+v err=%v", items, err)
	}
	if _, err := f.s.CreateProject(ctx, f.scope, project); !errors.Is(err, execution.ErrConflict) {
		t.Fatalf("duplicate project=%v", err)
	}
	var tenant string
	if err := f.admin.QueryRow(ctx, `INSERT INTO tenants(name) VALUES('other') RETURNING id`).Scan(&tenant); err != nil {
		t.Fatal(err)
	}
	if _, err := f.admin.Exec(ctx, `INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'member')`, tenant, other.UserID); err != nil {
		t.Fatal(err)
	}
	other.TenantID = tenant
	if _, err := f.s.GetProject(ctx, other, project.ID); !errors.Is(err, execution.ErrNotFound) {
		t.Fatalf("cross tenant project=%v", err)
	}
	if items, err := f.s.ListProjects(ctx, other); err != nil || len(items) != 0 {
		t.Fatalf("cross tenant projects=%+v err=%v", items, err)
	}
}
