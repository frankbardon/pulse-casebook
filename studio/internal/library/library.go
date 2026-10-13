// Package library is the on-disk model of a Studio library: the
// directory passed to `studio <dir>`, holding global cohorts and schemas
// and any number of workspaces, each with its own analyses and local
// cohorts and schemas.
//
//	<library>/
//	  .git/  .gitignore         global repository (managed block + /workspaces/)
//	  library.json              {"version": 1}: marks the layout
//	  cohorts/ schemas/ imports/ sources/      the global area
//	  workspaces/<slug>/
//	    .git/  .gitignore       the workspace's own repository
//	    workspace.json          {"name", "description"?, "created"}
//	    analyses/**.json        analyses (+ *.layout.json sidecars)
//	    cohorts/ schemas/ imports/ sources/    local equivalents
//
// A workspace sees the global area under the reserved first path segment
// GlobalPrefix ("_global/cohorts/x.pulse"): that is the only way out of
// a workspace (scope.Root mounts, routefs for the engine).
//
// An empty directory (hidden entries such as .git or .DS_Store aside)
// becomes a new, empty library. Any other directory without
// library.json is refused (ErrNotLibrary): Studio only serves libraries.
package library

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
)

// Layout names.
const (
	MarkerFile    = "library.json"
	WorkspacesDir = "workspaces"
	WorkspaceFile = "workspace.json"

	// GlobalPrefix is the reserved first path segment under which a
	// workspace sees the global area, and the workspace id of the global
	// area itself in the API (/api/w/_global/...). Slugs never start
	// with "_", so it cannot collide with a workspace.
	GlobalPrefix = "_global"

	AnalysesDir = "analyses"
	CohortsDir  = "cohorts"
	SchemasDir  = "schemas"
	ImportsDir  = "imports"
	SourcesDir  = "sources"

	// Version is the library.json layout version.
	Version = 1
)

// Errors.
var (
	ErrNotFound = errors.New("no such workspace")
	ErrBadName  = errors.New("workspace name must not be empty")
	// ErrNotLibrary: a non-empty directory without library.json.
	ErrNotLibrary  = errors.New("not a Pulse Studio library")
	ErrBadMetadata = errors.New("workspace.json is not a JSON object")
)

// Library is an opened library directory.
type Library struct {
	dir string     // absolute, symlinks evaluated
	mu  sync.Mutex // serializes workspace creation / metadata writes
}

// Workspace is one workspace's metadata. Dir is its absolute directory.
type Workspace struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Created     string `json:"created,omitempty"`
	Dir         string `json:"-"`
	// Invalid says why workspace.json could not be read (the workspace
	// is still listed, named after its slug).
	Invalid string `json:"invalid,omitempty"`
}

// Detect reports whether dir is a library (library.json present) or a
// fresh one to initialise (fresh: the directory is empty but for hidden
// entries). Anything else is ErrNotLibrary.
func Detect(dir string) (fresh bool, err error) {
	if _, err := os.Stat(filepath.Join(dir, MarkerFile)); err == nil {
		return false, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, err
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			return false, fmt.Errorf("%w: %s has files but no %s (create a library with `studio <new or empty dir>`)", ErrNotLibrary, dir, MarkerFile)
		}
	}
	return true, nil
}

// Open opens dir as a library. A fresh (empty) directory gets
// library.json; every library gets a workspaces/ directory. A non-empty
// directory without library.json is ErrNotLibrary.
func Open(dir string) (*Library, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	fresh, err := Detect(real)
	if err != nil {
		return nil, err
	}
	l := &Library{dir: real}
	if fresh {
		if err := writeFileAtomic(filepath.Join(real, MarkerFile), Marker()); err != nil {
			return nil, fmt.Errorf("initialise library: %w", err)
		}
	}
	if err := os.MkdirAll(filepath.Join(real, WorkspacesDir), 0o755); err != nil {
		return nil, fmt.Errorf("initialise library: %w", err)
	}
	return l, nil
}

// Marker is library.json's content.
func Marker() []byte { return []byte(fmt.Sprintf("{\"version\": %d}\n", Version)) }

// Dir is the library directory (absolute, symlinks evaluated).
func (l *Library) Dir() string { return l.dir }

// GlobalDir is the global area's directory (the library directory).
func (l *Library) GlobalDir() string { return l.dir }

// Workspaces lists the workspaces sorted by slug. A library with none is
// valid (an empty list).
func (l *Library) Workspaces() ([]Workspace, error) {
	entries, err := os.ReadDir(filepath.Join(l.dir, WorkspacesDir))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []Workspace{}, nil
		}
		return nil, err
	}
	out := []Workspace{}
	for _, e := range entries {
		if !e.IsDir() || !ValidSlug(e.Name()) {
			continue
		}
		out = append(out, l.read(e.Name()))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out, nil
}

// Workspace returns one workspace by slug.
func (l *Library) Workspace(slug string) (Workspace, error) {
	if !ValidSlug(slug) {
		return Workspace{}, ErrNotFound
	}
	info, err := os.Stat(filepath.Join(l.dir, WorkspacesDir, slug))
	if err != nil || !info.IsDir() {
		return Workspace{}, ErrNotFound
	}
	return l.read(slug), nil
}

// read loads workspace.json (best effort: a missing or broken file still
// lists the workspace under its slug).
func (l *Library) read(slug string) Workspace {
	dir := filepath.Join(l.dir, WorkspacesDir, slug)
	ws := Workspace{Slug: slug, Name: slug, Dir: dir}
	data, err := os.ReadFile(filepath.Join(dir, WorkspaceFile))
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			ws.Invalid = err.Error()
		}
		return ws
	}
	var meta struct {
		Name        *string `json:"name"`
		Description string  `json:"description"`
		Created     string  `json:"created"`
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		ws.Invalid = "workspace.json: " + err.Error()
		return ws
	}
	if meta.Name != nil && strings.TrimSpace(*meta.Name) != "" {
		ws.Name = *meta.Name
	}
	ws.Description, ws.Created = meta.Description, meta.Created
	return ws
}

// CreateWorkspace makes a new workspace named name: a slug derived from
// the name (deduplicated with -2, -3, ...), the layout directories and
// workspace.json. Its repository is the caller's business (history).
func (l *Library) CreateWorkspace(name, description string, now time.Time) (Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Workspace{}, ErrBadName
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	root := filepath.Join(l.dir, WorkspacesDir)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return Workspace{}, err
	}
	base := Slugify(name)
	slug := base
	for i := 2; ; i++ {
		err := os.Mkdir(filepath.Join(root, slug), 0o755)
		if err == nil {
			break
		}
		if !errors.Is(err, fs.ErrExist) {
			return Workspace{}, err
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	dir := filepath.Join(root, slug)
	for _, d := range []string{AnalysesDir, CohortsDir, SchemasDir, ImportsDir, SourcesDir} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			return Workspace{}, err
		}
	}
	ws := Workspace{Slug: slug, Name: name, Description: strings.TrimSpace(description), Created: now.UTC().Format(time.RFC3339), Dir: dir}
	doc := map[string]string{"name": ws.Name}
	keys := []string{"name"}
	if ws.Description != "" {
		doc["description"] = ws.Description
		keys = append(keys, "description")
	}
	doc["created"] = ws.Created
	keys = append(keys, "created")
	if err := writeFileAtomic(filepath.Join(dir, WorkspaceFile), orderedDoc(doc, keys)); err != nil {
		return Workspace{}, err
	}
	return ws, nil
}

// UpdateWorkspace changes a workspace's display name and/or description
// (nil leaves a field alone; an empty description removes it). The slug
// (directory) never changes. workspace.json is edited losslessly: other
// keys and their order are kept.
func (l *Library) UpdateWorkspace(slug string, name, description *string) (Workspace, error) {
	if name != nil && strings.TrimSpace(*name) == "" {
		return Workspace{}, ErrBadName
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	ws, err := l.Workspace(slug)
	if err != nil {
		return Workspace{}, err
	}
	file := filepath.Join(ws.Dir, WorkspaceFile)
	src, err := os.ReadFile(file)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return Workspace{}, err
	}
	root := &jsonfmt.Node{Kind: jsonfmt.Object}
	if len(src) > 0 {
		n, err := jsonfmt.Parse(src)
		if err != nil || n.Kind != jsonfmt.Object {
			return Workspace{}, ErrBadMetadata
		}
		root = n
	}
	if name != nil {
		setString(root, "name", strings.TrimSpace(*name))
	}
	if description != nil {
		if d := strings.TrimSpace(*description); d == "" {
			removeKey(root, "description")
		} else {
			setString(root, "description", d)
		}
	}
	if err := writeFileAtomic(file, jsonfmt.Format(root, jsonfmt.House)); err != nil {
		return Workspace{}, err
	}
	return l.read(slug), nil
}

func setString(obj *jsonfmt.Node, key, value string) {
	raw, _ := json.Marshal(value)
	qk, _ := json.Marshal(key)
	for i, m := range obj.Members {
		if unquote(m.Key) == key {
			obj.Members[i].Value = &jsonfmt.Node{Kind: jsonfmt.String, Raw: string(raw)}
			return
		}
	}
	obj.Members = append(obj.Members, jsonfmt.Member{Key: string(qk), Value: &jsonfmt.Node{Kind: jsonfmt.String, Raw: string(raw)}})
}

func removeKey(obj *jsonfmt.Node, key string) {
	out := obj.Members[:0]
	for _, m := range obj.Members {
		if unquote(m.Key) != key {
			out = append(out, m)
		}
	}
	obj.Members = out
}

func unquote(raw string) string {
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return raw
	}
	return s
}

func orderedDoc(doc map[string]string, keys []string) []byte {
	root := &jsonfmt.Node{Kind: jsonfmt.Object}
	for _, k := range keys {
		setString(root, k, doc[k])
	}
	return jsonfmt.Format(root, jsonfmt.House)
}

// Slugify derives a workspace slug from a display name: lower-case
// letters and digits, runs of anything else become "-", trimmed, at
// most 64 characters; "workspace" when nothing is left.
func Slugify(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		switch {
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			dash = false
		default:
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	s := strings.Trim(b.String(), "-")
	if len(s) > 64 {
		s = strings.TrimRight(s[:64], "-")
	}
	if s == "" {
		return "workspace"
	}
	return s
}

// ValidSlug reports whether s is a slug Slugify could produce (so it is
// never GlobalPrefix nor a hidden directory).
func ValidSlug(s string) bool {
	if s == "" || len(s) > 70 || s[0] == '-' || s[len(s)-1] == '-' {
		return false
	}
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			return false
		}
	}
	return true
}

func writeFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(name)
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		_ = tmp.Close()
		_ = os.Remove(name)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	if err := os.Rename(name, path); err != nil {
		_ = os.Remove(name)
		return err
	}
	return nil
}
