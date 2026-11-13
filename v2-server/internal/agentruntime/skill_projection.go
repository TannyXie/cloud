//go:build linux

package agentruntime

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type skillLink struct{ ID, Version, Name string }

func (p *projectRuntime) linksPath() string { return filepath.Join(p.root, "market-skills.json") }
func (p *projectRuntime) links() ([]skillLink, error) {
	data, e := os.ReadFile(p.linksPath())
	if errors.Is(e, fs.ErrNotExist) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	var links []skillLink
	e = json.Unmarshal(data, &links)
	return links, e
}
func (p *projectRuntime) assetPath(l skillLink) string {
	return filepath.Join(p.root, "w", "n", "plugins", "installed", filepath.FromSlash(l.ID), l.Version, "assets", l.Name)
}
func (p *projectRuntime) discover(id, version string) ([]skillLink, error) {
	dir := filepath.Dir(p.assetPath(skillLink{id, version, "placeholder"}))
	entries, e := os.ReadDir(dir)
	if e != nil {
		return nil, e
	}
	var out []skillLink
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		l := skillLink{id, version, entry.Name()}
		info, e := os.Lstat(filepath.Join(p.assetPath(l), "SKILL.md"))
		if e == nil && info.Mode().IsRegular() {
			out = append(out, l)
		}
	}
	if len(out) == 0 {
		return nil, errors.New("archive has no discoverable skills")
	}
	return out, nil
}

type linkChange struct {
	root           *os.Root
	name, old, new string
	// replaceTree removes an existing real directory (a service-written user skill) before writing
	// the market symlink; `old` is empty in that case because there is no previous symlink target.
	replaceTree bool
}

// Only links owned by this service may be replaced. A project-authored skill, directory
// symlink, or duplicate skill name rejects the projection before any link is changed.
func (p *projectRuntime) projectSkills(checkouts []string, old, next []skillLink) error {
	before := map[string]string{}
	for _, l := range old {
		before[l.Name] = p.assetPath(l)
	}
	after := map[string]string{}
	for _, l := range next {
		if _, dup := after[l.Name]; dup {
			return errors.New("duplicate skill name")
		}
		after[l.Name] = p.assetPath(l)
	}
	names := map[string]bool{}
	for n := range before {
		names[n] = true
	}
	for n := range after {
		names[n] = true
	}
	if len(names) == 0 {
		return nil
	}
	var changes []linkChange
	// Every checkout's links this service owns after the change, to keep out of Git.
	owned := map[*os.Root][]string{}
	for _, checkout := range checkouts {
		root, e := os.OpenRoot(checkout)
		if e != nil {
			return e
		}
		defer root.Close()
		for _, base := range []string{".opencode", ".claude"} {
			if len(names) == 0 {
				continue
			}
			for _, dir := range []string{base, base + "/skills"} {
				info, e := root.Lstat(dir)
				if errors.Is(e, fs.ErrNotExist) {
					if e := root.Mkdir(dir, 0700); e != nil {
						return e
					}
				} else if e != nil || !info.IsDir() {
					return errors.New("unsafe project skill directory")
				}
			}
			for n := range names {
				name := base + "/skills/" + n
				target, e := root.Readlink(name)
				replacingTree := false
				if errors.Is(e, fs.ErrNotExist) {
					target = ""
				} else if e != nil {
					// The path exists but is not a service symlink (e.g. a real directory). Only a
					// path the service itself wrote — one listed under its own exclude header — may be
					// replaced by a market link; anything project-owned keeps the conflict, named so
					// the user can find the skill.
					if serviceExcludedPath(root, name) {
						target = ""
						replacingTree = true
					} else {
						return fmt.Errorf("project already owns skill path %s", n)
					}
				}
				if target != "" && target != before[n] && target != after[n] {
					return fmt.Errorf("project skill path conflict for %s", n)
				}
				if target != after[n] {
					changes = append(changes, linkChange{root, name, target, after[n], replacingTree})
				}
				if after[n] != "" {
					owned[root] = append(owned[root], name)
				}
			}
		}
	}
	for _, c := range changes {
		if c.replaceTree {
			// A service-written user skill directory yields to the market link; remove the tree
			// (not just the path) so the symlink below does not collide with a non-empty dir.
			if e := c.root.RemoveAll(c.name); e != nil {
				return e
			}
		} else if c.old != "" {
			if e := c.root.Remove(c.name); e != nil {
				return e
			}
		}
		if c.new != "" {
			if e := c.root.Symlink(c.new, c.name); e != nil {
				return e
			}
		}
	}
	for root, names := range owned {
		sort.Strings(names)
		if e := excludeFromGit(root, names); e != nil {
			return e
		}
	}
	return nil
}

// publishSkills is called by ApplySkill with skillsMu held; it also updates every prepared
// checkout after a market package changes.
func (p *projectRuntime) publishSkills(id, version string, remove bool) error {
	old, e := p.links()
	if e != nil {
		return e
	}
	next := []skillLink{}
	for _, l := range old {
		if l.ID != id {
			next = append(next, l)
		}
	}
	if !remove {
		entries, e := p.discover(id, version)
		if e != nil {
			return e
		}
		next = append(next, entries...)
	}
	// Recover all prepared workspace checkouts after a process restart, including ones
	// which have not yet acquired a new in-memory session.
	var paths []string
	p.mu.Lock()
	for _, c := range p.checkouts {
		if c.workflow {
			continue
		}
		select {
		case <-c.ready:
			if c.err == nil && c.path != "" {
				paths = append(paths, c.path)
			}
		default:
		}
	}
	p.mu.Unlock()
	saved, e := os.ReadFile(filepath.Join(p.root, "skill-checkouts.json"))
	if e != nil && !errors.Is(e, fs.ErrNotExist) {
		return e
	}
	var known []string
	if len(saved) > 0 {
		if e = json.Unmarshal(saved, &known); e != nil {
			return e
		}
	}
	for _, path := range known {
		if _, e := os.Stat(path); e == nil {
			paths = append(paths, path)
		}
	}
	sort.Strings(paths)
	unique := paths[:0]
	for _, path := range paths {
		if len(unique) == 0 || unique[len(unique)-1] != path {
			unique = append(unique, path)
		}
	}
	if e = p.projectSkills(unique, old, next); e != nil {
		return e
	}
	return writeSkillIndex(p.linksPath(), next)
}
func writeSkillIndex(path string, value any) error {
	raw, e := json.Marshal(value)
	if e != nil {
		return e
	}
	tmp, e := os.CreateTemp(filepath.Dir(path), ".skill-index-*")
	if e != nil {
		return e
	}
	defer os.Remove(tmp.Name())
	_, e = tmp.Write(raw)
	e = errors.Join(e, tmp.Close())
	if e != nil {
		return e
	}
	return os.Rename(tmp.Name(), path)
}
func (p *projectRuntime) attachSkills(checkout string) error {
	p.skillsMu.Lock()
	defer p.skillsMu.Unlock()
	root := filepath.Join(p.root, "w", "r")
	rel, e := filepath.Rel(root, checkout)
	if e != nil || rel == "." || strings.HasPrefix(rel, "..") {
		return errors.New("invalid checkout")
	}
	links, e := p.links()
	if e != nil {
		return e
	}
	if e = p.projectSkills([]string{checkout}, links, links); e != nil {
		return e
	}
	path := filepath.Join(p.root, "skill-checkouts.json")
	var known []string
	raw, e := os.ReadFile(path)
	if e == nil {
		if e = json.Unmarshal(raw, &known); e != nil {
			return e
		}
	} else if !errors.Is(e, fs.ErrNotExist) {
		return e
	}
	for _, k := range known {
		if k == checkout {
			return nil
		}
	}
	return writeSkillIndex(path, append(known, checkout))
}
