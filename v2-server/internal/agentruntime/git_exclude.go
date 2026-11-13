//go:build linux

package agentruntime

import (
	"errors"
	"io/fs"
	"os"
	"strings"
)

// excludeHeader introduces the rules Ora appends, so a person reading the file knows where they
// came from.
const excludeHeader = "# Skills Ora materialized for the Agent; not part of the project."

// excludeFromGit keeps paths Ora wrote into a checkout out of Git's untracked files, so an Agent's
// `git add -A` does not commit them and the workspace views show only the Agent's own changes.
// paths are slash-separated and relative to the checkout. The rules go to the checkout's own
// .git/info/exclude, never the project's .gitignore, and existing lines are kept; a path already
// listed is not added twice. A checkout whose .git is not a plain directory is left alone.
func excludeFromGit(root *os.Root, paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	if info, err := root.Lstat(".git"); err != nil || !info.IsDir() {
		return nil
	}
	const file = ".git/info/exclude"
	existing, err := root.ReadFile(file)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	have := map[string]bool{}
	for _, line := range strings.Split(string(existing), "\n") {
		have[line] = true
	}
	var add strings.Builder
	for _, p := range paths {
		rule := "/" + escapeGitPattern(p)
		if have[rule] {
			continue
		}
		have[rule] = true
		if add.Len() == 0 {
			if len(existing) > 0 && !strings.HasSuffix(string(existing), "\n") {
				add.WriteString("\n")
			}
			if !have[excludeHeader] {
				add.WriteString(excludeHeader + "\n")
			}
		}
		add.WriteString(rule + "\n")
	}
	if add.Len() == 0 {
		return nil
	}
	if err := root.MkdirAll(".git/info", 0o755); err != nil {
		return err
	}
	// One append per call: concurrent writers each add whole lines.
	f, err := root.OpenFile(file, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	_, writeErr := f.WriteString(add.String())
	return errors.Join(writeErr, f.Close())
}

// escapeGitPattern makes a path match itself literally in a gitignore rule.
func escapeGitPattern(p string) string {
	var b strings.Builder
	for _, r := range p {
		if strings.ContainsRune(`\*?[!# `, r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// serviceExcludedPath reports whether `path` is listed under the service's own header in the
// checkout's `.git/info/exclude`. A real directory that only the service wrote (a previously
// materialized user skill) lands here, so a later market install may replace it; a project-owned
// path never does.
func serviceExcludedPath(root *os.Root, path string) bool {
	existing, err := root.ReadFile(".git/info/exclude")
	if err != nil {
		return false
	}
	lines := strings.Split(string(existing), "\n")
	inside := false
	for _, line := range lines {
		if line == excludeHeader {
			inside = true
			continue
		}
		if !inside {
			continue
		}
		if strings.HasPrefix(line, "/") && strings.TrimSuffix(line, "\r") == "/"+escapeGitPattern(path) {
			return true
		}
	}
	return false
}
