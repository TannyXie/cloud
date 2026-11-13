//go:build linux

package agentruntime

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
)

func TestAttachUserSkillsWritesBothDiscoveryRootsWithoutOverwriting(t *testing.T) {
	checkout := t.TempDir()
	if err := os.MkdirAll(filepath.Join(checkout, ".opencode", "skills", "owned"), 0700); err != nil {
		t.Fatal(err)
	}
	owned := filepath.Join(checkout, ".opencode", "skills", "owned", "SKILL.md")
	if err := os.WriteFile(owned, []byte("project-owned"), 0600); err != nil {
		t.Fatal(err)
	}
	p := &projectRuntime{driver: &Driver{opts: Options{
		UserSkills: func(context.Context, execution.Scope) ([]UserSkill, error) {
			return []UserSkill{
				{Name: "review", Description: "检查改动", Content: "# Review"},
				{Name: "owned", Description: "不得覆盖", Content: "# Owned"},
			}, nil
		},
	}}}
	if err := p.attachUserSkills(context.Background(), checkout, execution.Scope{TenantID: "tenant", UserID: "user"}); err != nil {
		t.Fatal(err)
	}
	for _, base := range []string{".opencode", ".claude"} {
		data, err := os.ReadFile(filepath.Join(checkout, base, "skills", "review", "SKILL.md"))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), "name: \"review\"") || !strings.Contains(string(data), "# Review") {
			t.Fatalf("%s user skill = %q", base, data)
		}
	}
	data, err := os.ReadFile(owned)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "project-owned" {
		t.Fatalf("project-owned skill overwritten: %q", data)
	}
}

func TestAttachUserSkillsReportsCatalogFailure(t *testing.T) {
	p := &projectRuntime{driver: &Driver{opts: Options{
		UserSkills: func(context.Context, execution.Scope) ([]UserSkill, error) {
			return nil, errors.New("database unavailable")
		},
	}}}
	err := p.attachUserSkills(context.Background(), t.TempDir(), execution.Scope{})
	if !errors.Is(err, execution.ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

// A user skill whose name a market-installed Skill already takes is skipped: the market version
// wins and the session still starts (it never fails on the name).
func TestAttachUserSkillsSkipsInstalledPluginNameConflict(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "market-skills.json"), []byte(
		`[{"ID":"official/mattpocock.skills","Version":"1.3.1","Name":"code-review"}]`,
	), 0600); err != nil {
		t.Fatal(err)
	}
	p := &projectRuntime{root: root, driver: &Driver{opts: Options{
		UserSkills: func(context.Context, execution.Scope) ([]UserSkill, error) {
			return []UserSkill{{Name: "code-review", Description: "mine", Content: "# Review"}}, nil
		},
	}}}
	checkout := t.TempDir()
	if err := p.attachUserSkills(context.Background(), checkout, execution.Scope{TenantID: "tenant", UserID: "user"}); err != nil {
		t.Fatalf("attachUserSkills = %v, want nil", err)
	}
	if _, err := os.Lstat(filepath.Join(checkout, ".opencode", "skills", "code-review")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("conflicting user skill was written: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(checkout, ".claude", "skills", "code-review")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("conflicting user skill was written to .claude: %v", err)
	}
}
