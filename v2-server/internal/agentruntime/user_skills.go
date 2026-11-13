//go:build linux

package agentruntime

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"strings"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/skilldoc"
)

// attachUserSkills projects the session owner's catalog into the two discovery roots Agents read.
// A market-installed Skill with the same name takes precedence (project skills > market > user):
// the user skill is skipped so the session still starts, and only a log line carries its name.
func (p *projectRuntime) attachUserSkills(ctx context.Context, checkout string, scope execution.Scope) error {
	if p.driver.opts.UserSkills == nil {
		return nil
	}
	skills, err := p.driver.opts.UserSkills(ctx, scope)
	if err != nil {
		return execution.ErrUnavailable
	}
	if len(skills) == 0 {
		return nil
	}
	p.skillsMu.Lock()
	defer p.skillsMu.Unlock()
	links, err := p.links()
	if err != nil {
		return execution.ErrUnavailable
	}
	marketNames := make(map[string]bool, len(links))
	for _, link := range links {
		marketNames[link.Name] = true
	}
	projected := make([]UserSkill, 0, len(skills))
	for _, skill := range skills {
		if marketNames[skill.Name] {
			slog.Info("skip user skill: name is taken by an installed market Skill",
				"skill", skill.Name, "scope", fmt.Sprintf("%s:%s", scope.TenantID, scope.UserID))
			continue
		}
		projected = append(projected, skill)
	}
	root, err := os.OpenRoot(checkout)
	if err != nil {
		return execution.ErrUnavailable
	}
	defer root.Close()
	var created []string
	for _, base := range []string{".opencode", ".claude"} {
		if !ensureSkillDir(root, base) || !ensureSkillDir(root, base+"/skills") {
			continue
		}
		for _, skill := range projected {
			dir := base + "/skills/" + skill.Name
			wrote, err := writeUserSkill(root, dir, skill)
			if err != nil {
				return execution.ErrUnavailable
			}
			if wrote {
				created = append(created, dir)
			}
		}
	}
	if excludeFromGit(root, created) != nil {
		return execution.ErrUnavailable
	}
	return nil
}

// ensureSkillDir reports whether path is a directory after creating missing components.
func ensureSkillDir(root *os.Root, path string) bool {
	info, err := root.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		if err := root.Mkdir(path, 0700); err != nil {
			return false
		}
		return true
	}
	return err == nil && info.IsDir()
}

// writeUserSkill creates the skill's directory and SKILL.md, and reports whether it did: an existing
// path is left as it is.
func writeUserSkill(root *os.Root, dir string, skill UserSkill) (bool, error) {
	if err := skilldoc.ValidateName(skill.Name); err != nil {
		return false, err
	}
	_, err := root.Lstat(dir)
	switch {
	case err == nil:
		// Project-authored, market-linked, or duplicate catalog names are never overwritten.
		return false, nil
	case !errors.Is(err, fs.ErrNotExist):
		return false, err
	}
	if !strings.HasPrefix(dir, ".opencode/skills/") && !strings.HasPrefix(dir, ".claude/skills/") {
		return false, errors.New("invalid skill projection path")
	}
	if err := root.Mkdir(dir, 0700); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return false, nil
		}
		return false, err
	}
	content := skilldoc.Render(skilldoc.Document{
		Name: skill.Name, Description: skill.Description, Content: skill.Content,
	})
	file, err := root.OpenFile(dir+"/SKILL.md", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		if removeErr := root.Remove(dir); removeErr != nil {
			return false, errors.Join(err, removeErr)
		}
		return false, err
	}
	_, writeErr := file.WriteString(content)
	closeErr := file.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		_ = root.Remove(dir + "/SKILL.md")
		_ = root.Remove(dir)
		return false, err
	}
	return true, nil
}
