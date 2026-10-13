// Package routefs is the afero filesystem a library workspace's Pulse
// engine runs on: rooted at the workspace directory, with other
// directories mounted under reserved first path segments.
//
// A library mounts its global area under "_global", so a request in a
// workspace names a local cohort {"filename": "x.pulse", "data_dir":
// "cohorts"} and a global one {"filename": "x.pulse", "data_dir":
// "_global/cohorts"}. Pulse joins data_dir + "/" + filename (and a
// join's right side, a shard anchor's archive, a chain or compose
// slot's cohort the same way) and opens the result on its filesystem;
// this Fs routes that path by its first segment. Paths are cleaned
// first, so "cohorts/../_global/x" routes to the global area and a path
// can never climb out of the root it lands in (afero.BasePathFs refuses
// that).
//
// Every area is an afero.BasePathFs over the OS filesystem and its files
// are returned unwrapped, so Pulse keeps its fast paths: RealPath (the
// mmap probe) is forwarded, and an opened file is still an
// *afero.BasePathFile (positional ReadAt). The one difference from a
// plain BasePathFs is that a mounted file's Name() is relative to its
// mount, not to this Fs.
package routefs

import (
	"errors"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/afero"
)

// Fs routes paths to a base directory or to a mounted one.
type Fs struct {
	base   *afero.BasePathFs
	mounts map[string]mount
}

// Mount is a directory mounted under a first path segment. Deny lists
// first segments inside it that never resolve (the global area hides
// workspaces/, so one workspace cannot read another's files through it).
type Mount struct {
	Dir  string
	Deny []string
}

type mount struct {
	fs   *afero.BasePathFs
	deny map[string]bool
}

// denied is the Fs every denied path routes to: nothing exists there and
// nothing can be created.
var denied = afero.NewBasePathFs(afero.NewReadOnlyFs(afero.NewMemMapFs()), "/").(*afero.BasePathFs)

// ErrCrossMount is returned by Rename across areas.
var ErrCrossMount = errors.New("routefs: rename across mounts")

// New returns an Fs rooted at dir with mounts (first segment → mount).
func New(dir string, mounts map[string]Mount) *Fs {
	f := &Fs{base: afero.NewBasePathFs(afero.NewOsFs(), dir).(*afero.BasePathFs), mounts: map[string]mount{}}
	for name, m := range mounts {
		mm := mount{fs: afero.NewBasePathFs(afero.NewOsFs(), m.Dir).(*afero.BasePathFs), deny: map[string]bool{}}
		for _, d := range m.Deny {
			mm.deny[d] = true
		}
		f.mounts[name] = mm
	}
	return f
}

// route returns the area serving name and the path inside it.
func (f *Fs) route(name string) (*afero.BasePathFs, string) {
	clean := path.Clean("/" + filepath.ToSlash(name))
	if len(f.mounts) > 0 {
		first, rest, _ := strings.Cut(strings.TrimPrefix(clean, "/"), "/")
		if m, ok := f.mounts[first]; ok {
			inner, _, _ := strings.Cut(rest, "/")
			if m.deny[inner] {
				return denied, clean
			}
			return m.fs, "/" + rest
		}
	}
	return f.base, clean
}

func (f *Fs) Name() string { return "routefs" }

// RealPath forwards the mmap probe (pulse service.RealPather).
func (f *Fs) RealPath(name string) (string, error) {
	b, p := f.route(name)
	if b == denied {
		return "", os.ErrNotExist
	}
	return b.RealPath(p)
}

func (f *Fs) Create(name string) (afero.File, error) {
	b, p := f.route(name)
	return b.Create(p)
}

func (f *Fs) Mkdir(name string, perm os.FileMode) error {
	b, p := f.route(name)
	return b.Mkdir(p, perm)
}

func (f *Fs) MkdirAll(name string, perm os.FileMode) error {
	b, p := f.route(name)
	return b.MkdirAll(p, perm)
}

func (f *Fs) Open(name string) (afero.File, error) {
	b, p := f.route(name)
	return b.Open(p)
}

func (f *Fs) OpenFile(name string, flag int, perm os.FileMode) (afero.File, error) {
	b, p := f.route(name)
	return b.OpenFile(p, flag, perm)
}

func (f *Fs) Remove(name string) error {
	b, p := f.route(name)
	return b.Remove(p)
}

func (f *Fs) RemoveAll(name string) error {
	b, p := f.route(name)
	return b.RemoveAll(p)
}

func (f *Fs) Rename(oldname, newname string) error {
	bo, po := f.route(oldname)
	bn, pn := f.route(newname)
	if bo != bn {
		return &os.LinkError{Op: "rename", Old: oldname, New: newname, Err: ErrCrossMount}
	}
	return bo.Rename(po, pn)
}

func (f *Fs) Stat(name string) (os.FileInfo, error) {
	b, p := f.route(name)
	return b.Stat(p)
}

// LstatIfPossible implements afero.Lstater.
func (f *Fs) LstatIfPossible(name string) (os.FileInfo, bool, error) {
	b, p := f.route(name)
	return b.LstatIfPossible(p)
}

func (f *Fs) Chmod(name string, mode os.FileMode) error {
	b, p := f.route(name)
	return b.Chmod(p, mode)
}

func (f *Fs) Chown(name string, uid, gid int) error {
	b, p := f.route(name)
	return b.Chown(p, uid, gid)
}

func (f *Fs) Chtimes(name string, atime, mtime time.Time) error {
	b, p := f.route(name)
	return b.Chtimes(p, atime, mtime)
}

var (
	_ afero.Fs      = (*Fs)(nil)
	_ afero.Lstater = (*Fs)(nil)
)
