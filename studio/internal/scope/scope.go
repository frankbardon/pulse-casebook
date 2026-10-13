// Package scope confines file access to a single root directory.
//
// Every path the Studio API accepts is relative to the directory passed on
// the command line. Root.Resolve turns such a path into an absolute one and
// refuses anything that would land outside the root: absolute paths, ".."
// traversal, and symlinks whose target escapes.
package scope

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// ErrOutside is returned (wrapped) when a path escapes the root.
var ErrOutside = errors.New("path escapes the studio directory")

// Root is a directory that all resolved paths must stay inside.
//
// A Root may mount other roots under reserved first path segments
// (Mount): "<name>/rest" then resolves inside the mounted root, which is
// the only way a path leaves this root. Deny hides first segments (a
// library's global area hides its workspaces/ directory).
type Root struct {
	dir    string           // absolute, symlinks evaluated
	mounts map[string]*Root // first segment → mounted root
	deny   map[string]bool  // first segments that never resolve
}

// New returns a Root for dir, which must exist and be a directory.
func New(dir string) (*Root, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(real)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", dir)
	}
	return &Root{dir: real}, nil
}

// Dir returns the absolute, symlink-free root directory.
func (r *Root) Dir() string { return r.dir }

// WithMount returns a copy of r that resolves "<name>/..." inside sub.
// name is one path segment.
func (r *Root) WithMount(name string, sub *Root) *Root {
	c := r.clone()
	c.mounts[name] = sub
	return c
}

// WithDeny returns a copy of r that refuses paths whose first segment
// is one of names (ErrOutside).
func (r *Root) WithDeny(names ...string) *Root {
	c := r.clone()
	for _, n := range names {
		c.deny[n] = true
	}
	return c
}

// Mounted returns the root mounted under name, or nil.
func (r *Root) Mounted(name string) *Root { return r.mounts[name] }

func (r *Root) clone() *Root {
	c := &Root{dir: r.dir, mounts: map[string]*Root{}, deny: map[string]bool{}}
	for k, v := range r.mounts {
		c.mounts[k] = v
	}
	for k, v := range r.deny {
		c.deny[k] = v
	}
	return c
}

// Rel maps an absolute path that Resolve produced back to its
// slash-separated root-relative form: a path inside this root's own
// directory first, then one inside a mounted root, prefixed with the
// mount name. ok is false for a path outside both.
func (r *Root) Rel(abs string) (string, bool) {
	if r.contains(abs) {
		rel, err := filepath.Rel(r.dir, abs)
		if err == nil {
			rel = filepath.ToSlash(rel)
			first, _, _ := strings.Cut(rel, "/")
			if _, mounted := r.mounts[first]; !mounted && !r.deny[first] {
				return rel, true
			}
		}
	}
	for name, sub := range r.mounts {
		if rel, ok := sub.Rel(abs); ok {
			if rel == "." {
				return name, true
			}
			return name + "/" + rel, true
		}
	}
	return "", false
}

// Resolve maps a slash-separated path relative to the root onto an absolute
// filesystem path inside it. The empty path and "." resolve to the root
// itself. The target need not exist yet (so new files can be saved), but
// any existing prefix of it is symlink-evaluated and must stay inside the
// root.
func (r *Root) Resolve(rel string) (string, error) {
	if rel == "" || rel == "." {
		return r.dir, nil
	}
	if strings.ContainsRune(rel, 0) {
		return "", fmt.Errorf("%w: %q", ErrOutside, rel)
	}
	native := filepath.FromSlash(rel)
	if filepath.IsAbs(native) || strings.HasPrefix(rel, "/") || !filepath.IsLocal(native) {
		return "", fmt.Errorf("%w: %q", ErrOutside, rel)
	}
	if len(r.mounts) > 0 || len(r.deny) > 0 {
		clean := filepath.ToSlash(filepath.Clean(native))
		first, rest, _ := strings.Cut(clean, "/")
		if r.deny[first] {
			return "", fmt.Errorf("%w: %q", ErrOutside, rel)
		}
		if sub, ok := r.mounts[first]; ok {
			return sub.Resolve(rest)
		}
	}
	joined := filepath.Join(r.dir, native)

	// Evaluate symlinks on the longest existing prefix of the path.
	existing, rest := joined, ""
	for {
		real, err := filepath.EvalSymlinks(existing)
		if err == nil {
			existing = real
			break
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(existing)
		if parent == existing {
			return "", err
		}
		rest = filepath.Join(filepath.Base(existing), rest)
		existing = parent
	}
	resolved := existing
	if rest != "" {
		resolved = filepath.Join(existing, rest)
	}
	if !r.contains(resolved) {
		return "", fmt.Errorf("%w: %q", ErrOutside, rel)
	}
	// A symlink may not reach a mounted or denied area by the back door
	// (a mount inside this root's directory, say).
	if inner, err := filepath.Rel(r.dir, resolved); err == nil && inner != "." {
		first, _, _ := strings.Cut(filepath.ToSlash(inner), "/")
		if r.deny[first] {
			return "", fmt.Errorf("%w: %q", ErrOutside, rel)
		}
	}
	return resolved, nil
}

func (r *Root) contains(p string) bool {
	if p == r.dir {
		return true
	}
	return strings.HasPrefix(p, r.dir+string(filepath.Separator))
}
