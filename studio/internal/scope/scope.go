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
type Root struct {
	dir string // absolute, symlinks evaluated
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
	return resolved, nil
}

func (r *Root) contains(p string) bool {
	if p == r.dir {
		return true
	}
	return strings.HasPrefix(p, r.dir+string(filepath.Separator))
}
