package server

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/migrate"
	"github.com/frankbardon/pulse-casebook/studio/internal/promote"
	"github.com/frankbardon/pulse-casebook/studio/internal/routefs"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// Library serves a whole library (internal/library): library-level
// endpoints plus one workspace-scoped Server per area, reached under
// /api/w/<ws>/..., where <ws> is a workspace slug or "_global" (the
// global area). Every workspace-scoped endpoint of Server (files, file,
// save, layout, create, cohort/inspect, preview, predict, explain, run,
// run/save, status, history, sources, import*, schemas*, export*) is
// served there with its usual shape, e.g. GET /api/w/sales/files or
// POST /api/w/_global/import.
//
// Library-level endpoints:
//
//	GET   /api/health               liveness, mode, Pulse version + feature_set_digest
//	GET   /api/catalog              the engine catalog (same for every area)
//	GET   /api/library              {mode, name, git?, workspaces, default?}
//	GET   /api/workspaces           {workspaces: [library.Workspace]}
//	POST  /api/workspaces           {name, description?} → 201 {workspace, git}
//	PATCH /api/workspaces/{slug}    {name?, description?} → {workspace, commit?}
//	GET   /api/cohorts              global + every workspace's cohorts, schemas, imports, sources
//	POST  /api/cohorts/promote      make a local cohort or schema global (promote.go; never back)
//	GET   /api/migration/plan       legacy folder → library: the plan (migration.go)
//	POST  /api/migration/apply      perform it; the server switches to the library without a restart
//
// Compatibility (removed by W4): any other /api/... path is served by
// the default workspace (the legacy folder itself, else the first
// workspace by slug; 404 no_workspace when the library has none), so the
// pre-library UI keeps working unchanged.
type Library struct {
	lib  *library.Library
	opts LibraryOptions
	ui   http.Handler
	mux  *http.ServeMux

	global     *history.Repo // library mode: the global repository
	globalRoot *scope.Root   // library mode: the global area (workspaces/ denied)
	base       *Server       // the global area (library) or the legacy folder's server

	mu    sync.Mutex
	areas map[string]*Server // workspace slug → server (opened lazily)

	// Migration (migration.go): uiFS/uiBuilt rebuild the handler after
	// a migration, which is then served by next; gate keeps every other
	// request out while a migration runs.
	uiFS    fs.FS
	uiBuilt bool
	gate    sync.RWMutex
	next    atomic.Pointer[Library]
}

// LibraryOptions configures NewLibrary. Config carries the runtime
// options shared by every area (PreviewTimeout, AutoPreviewRows,
// MaxUpload, NewEngine); the per-area fields are set by the library.
type LibraryOptions struct {
	Config
	// NoGit: no repositories (--no-git).
	NoGit bool
	// Git is the git executable ("" = PATH).
	Git string
	// Logf receives history events (nil: log.Printf).
	Logf func(string, ...any)
	// Now stamps created workspaces (nil: time.Now).
	Now func() time.Time
	// Recovered is what startup did with an interrupted migration
	// (migrate.Recover), reported by GET /api/migration/plan.
	Recovered *migrate.Outcome
}

// NewLibrary opens the library's repositories and the default area.
func NewLibrary(ctx context.Context, lib *library.Library, opts LibraryOptions, ui fs.FS, uiBuilt bool) (*Library, error) {
	if opts.Logf == nil {
		opts.Logf = log.Printf
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	l := &Library{lib: lib, opts: opts, mux: http.NewServeMux(), areas: map[string]*Server{}, uiFS: ui, uiBuilt: uiBuilt}
	root, err := scope.New(lib.Dir())
	if err != nil {
		return nil, err
	}
	engine, err := pulse.New(pulse.Options{DataDir: lib.Dir()})
	if err != nil {
		return nil, fmt.Errorf("start pulse engine: %w", err)
	}
	cfg := opts.Config
	if lib.Legacy() {
		// The flat folder itself, exactly as before the library layout.
		cfg.History = history.Open(ctx, lib.Dir(), history.Options{Disabled: opts.NoGit, Git: opts.Git}, opts.Logf)
		l.base = New(root, engine, cfg, ui, uiBuilt)
		ws, _ := lib.Workspaces()
		l.areas[ws[0].Slug] = l.base
	} else {
		// A promotion the last run did not finish is rolled back (or,
		// past its rewrites, committed) before anything is served.
		if out, err := promote.Recover(ctx, lib.Dir(), promote.RecoverOptions{NoGit: opts.NoGit, Git: opts.Git, Logf: opts.Logf}); err != nil {
			return nil, err
		} else if out != nil {
			opts.Logf("promote: interrupted promotion of %s (workspace %s): %s", out.Item.Path, out.Workspace, out.Action)
		}
		l.global = history.Open(ctx, lib.Dir(), history.Options{Disabled: opts.NoGit, Git: opts.Git, Standalone: true, Ignore: history.GlobalIgnorePatterns}, opts.Logf)
		l.globalRoot = root.WithDeny(library.WorkspacesDir)
		cfg.History, cfg.Library, cfg.ListSkip = l.global, true, []string{library.WorkspacesDir}
		l.base = New(l.globalRoot, engine, cfg, ui, uiBuilt)
	}
	l.ui = l.base.uiHandler()

	l.mux.HandleFunc("GET /api/health", l.handleHealth)
	l.mux.HandleFunc("GET /api/catalog", l.base.handleCatalog)
	l.mux.HandleFunc("GET /api/library", l.handleLibrary)
	l.mux.HandleFunc("GET /api/workspaces", l.handleWorkspaces)
	l.mux.HandleFunc("POST /api/workspaces", l.handleCreateWorkspace)
	l.mux.HandleFunc("PATCH /api/workspaces/{slug}", l.handleUpdateWorkspace)
	l.mux.HandleFunc("GET /api/cohorts", l.handleCohorts)
	l.mux.HandleFunc("POST "+promotePath, l.handlePromote)
	l.mux.HandleFunc("GET /api/migration/plan", l.handleMigrationPlan)
	l.mux.HandleFunc("POST /api/migration/apply", l.handleMigrationApply)
	l.mux.HandleFunc("/api/w/{ws}/{rest...}", l.handleScoped)
	l.mux.HandleFunc("/api/", l.handleCompat)
	l.mux.Handle("/", l.ui)
	return l, nil
}

// ServeHTTP serves the library. Once a migration has switched the
// folder to the library layout, the new handler serves everything.
// Requests wait while a migration runs (POST /api/migration/apply
// takes the gate itself).
func (l *Library) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if next := l.next.Load(); next != nil {
		next.ServeHTTP(w, r)
		return
	}
	if r.URL.Path == migrationApplyPath || r.URL.Path == promotePath {
		// These take the gate themselves.
		l.mux.ServeHTTP(w, r)
		return
	}
	l.gate.RLock()
	if next := l.next.Load(); next != nil {
		l.gate.RUnlock()
		next.ServeHTTP(w, r)
		return
	}
	defer l.gate.RUnlock()
	l.mux.ServeHTTP(w, r)
}

// Dir is the library directory.
func (l *Library) Dir() string { return l.lib.Dir() }

// area returns the server of a workspace slug or "_global" (nil, false
// when there is no such area).
func (l *Library) area(id string) (*Server, error) {
	if id == library.GlobalPrefix {
		if l.lib.Legacy() {
			return nil, library.ErrNotFound
		}
		return l.base, nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if s, ok := l.areas[id]; ok {
		return s, nil
	}
	ws, err := l.lib.Workspace(id)
	if err != nil {
		return nil, err
	}
	s, err := l.openWorkspace(ws)
	if err != nil {
		return nil, err
	}
	l.areas[id] = s
	return s, nil
}

// openWorkspace builds a workspace's server: its root mounts the global
// area under _global/, its engine runs on the matching routefs, and it
// has a repository of its own. Caller holds mu.
func (l *Library) openWorkspace(ws library.Workspace) (*Server, error) {
	root, err := scope.New(ws.Dir)
	if err != nil {
		return nil, err
	}
	root = root.WithMount(library.GlobalPrefix, l.globalRoot)
	fsys := routefs.New(root.Dir(), map[string]routefs.Mount{
		library.GlobalPrefix: {Dir: l.globalRoot.Dir(), Deny: []string{library.WorkspacesDir}},
	})
	engine, err := pulse.New(pulse.Options{FS: fsys})
	if err != nil {
		return nil, fmt.Errorf("start pulse engine for workspace %s: %w", ws.Slug, err)
	}
	cfg := l.opts.Config
	cfg.History = history.Open(context.Background(), root.Dir(), history.Options{Disabled: l.opts.NoGit, Git: l.opts.Git, Standalone: true}, l.opts.Logf)
	cfg.GlobalHistory = l.global
	cfg.Library = true
	cfg.FS = fsys
	return New(root, engine, cfg, nil, false), nil
}

// defaultArea is the compatibility layer's workspace.
func (l *Library) defaultArea() (*Server, string, error) {
	list, err := l.lib.Workspaces()
	if err != nil {
		return nil, "", err
	}
	if len(list) == 0 {
		return nil, "", library.ErrNotFound
	}
	s, err := l.area(list[0].Slug)
	return s, list[0].Slug, err
}

// handleScoped serves /api/w/{ws}/{rest...} by the area's server as
// /api/{rest...}.
func (l *Library) handleScoped(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("ws")
	s, err := l.area(id)
	if err != nil {
		writeAreaError(w, id, err)
		return
	}
	r2 := r.Clone(r.Context())
	r2.URL.Path = "/api/" + r.PathValue("rest")
	r2.URL.RawPath = ""
	s.ServeHTTP(w, r2)
}

// handleCompat serves a flat /api/... path by the default workspace.
func (l *Library) handleCompat(w http.ResponseWriter, r *http.Request) {
	s, _, err := l.defaultArea()
	if err != nil {
		if errors.Is(err, library.ErrNotFound) {
			WriteError(w, http.StatusNotFound, "no_workspace", "this library has no workspace yet: create one with POST /api/workspaces", nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "workspace_failed", err.Error(), nil)
		return
	}
	s.ServeHTTP(w, r)
}

func writeAreaError(w http.ResponseWriter, id string, err error) {
	if errors.Is(err, library.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "workspace_not_found", "no such workspace", map[string]any{"workspace": id})
		return
	}
	WriteError(w, http.StatusInternalServerError, "workspace_failed", err.Error(), map[string]any{"workspace": id})
}

// handleHealth is the library's liveness probe: the area-level fields of
// Server's /api/health plus the mode.
func (l *Library) handleHealth(w http.ResponseWriter, _ *http.Request) {
	body := map[string]any{
		"status":             "ok",
		"dir":                filepath.Base(l.lib.Dir()),
		"mode":               l.lib.Mode(),
		"preview_timeout_ms": l.opts.PreviewTimeout.Milliseconds(),
		"auto_preview_rows":  l.opts.AutoPreviewRows,
	}
	if l.base.engine != nil {
		body["pulse_version"] = pulse.Version()
		body["feature_set_digest"] = l.base.engine.FeatureSetDigest()
	}
	WriteJSON(w, http.StatusOK, body)
}

type libraryBody struct {
	Mode       library.Mode        `json:"mode"`
	Name       string              `json:"name"`
	Git        *history.Status     `json:"git,omitempty"`
	Workspaces []library.Workspace `json:"workspaces"`
	Default    string              `json:"default,omitempty"`
}

// handleLibrary is GET /api/library: the mode (library | legacy), the
// directory's name, the global repository's status (library mode), the
// workspaces and the compatibility layer's default workspace.
func (l *Library) handleLibrary(w http.ResponseWriter, _ *http.Request) {
	list, err := l.lib.Workspaces()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "list_failed", err.Error(), nil)
		return
	}
	body := libraryBody{Mode: l.lib.Mode(), Name: filepath.Base(l.lib.Dir()), Workspaces: list}
	if !l.lib.Legacy() {
		st := l.global.Status()
		body.Git = &st
	}
	if len(list) > 0 {
		body.Default = list[0].Slug
	}
	WriteJSON(w, http.StatusOK, body)
}

// handleWorkspaces is GET /api/workspaces → {workspaces}.
func (l *Library) handleWorkspaces(w http.ResponseWriter, _ *http.Request) {
	list, err := l.lib.Workspaces()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "list_failed", err.Error(), nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"workspaces": list})
}

type workspaceBody struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// handleCreateWorkspace is POST /api/workspaces {name, description?}:
// a new workspace (slug from the name, deduplicated), its layout
// directories, workspace.json and its own repository (initial snapshot
// commit). 201 {workspace, git}. Errors: invalid_json/invalid_name 400,
// legacy_folder 409 (a legacy folder is one workspace until migrated).
func (l *Library) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var body workspaceBody
	if !decodeBody(w, r, &body) {
		return
	}
	if l.lib.Legacy() {
		WriteError(w, http.StatusConflict, "legacy_folder", "this folder is a legacy flat workspace: migrate it to a library first", nil)
		return
	}
	name, desc := "", ""
	if body.Name != nil {
		name = *body.Name
	}
	if body.Description != nil {
		desc = *body.Description
	}
	ws, err := l.lib.CreateWorkspace(name, desc, l.opts.Now())
	if err != nil {
		if errors.Is(err, library.ErrBadName) {
			WriteError(w, http.StatusBadRequest, "invalid_name", err.Error(), nil)
			return
		}
		WriteError(w, http.StatusInternalServerError, "create_failed", err.Error(), nil)
		return
	}
	s, err := l.area(ws.Slug)
	if err != nil {
		writeAreaError(w, ws.Slug, err)
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"workspace": ws, "git": s.cfg.History.Status()})
}

// handleUpdateWorkspace is PATCH /api/workspaces/{slug} {name?,
// description?}: renames (display name only; the slug and directory
// stay) and/or re-describes a workspace; workspace.json is edited
// losslessly and committed in the workspace's repository ("studio:
// update workspace.json"). 200 {workspace, commit?}. Errors:
// invalid_json/invalid_name 400, workspace_not_found 404, legacy_folder
// 409, invalid_metadata 422 (workspace.json is not an object).
func (l *Library) handleUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var body workspaceBody
	if !decodeBody(w, r, &body) {
		return
	}
	if l.lib.Legacy() {
		WriteError(w, http.StatusConflict, "legacy_folder", "a legacy folder has no workspace metadata: migrate it to a library first", nil)
		return
	}
	s, err := l.area(slug)
	if err != nil {
		writeAreaError(w, slug, err)
		return
	}
	ws, err := l.lib.UpdateWorkspace(slug, body.Name, body.Description)
	switch {
	case errors.Is(err, library.ErrBadName):
		WriteError(w, http.StatusBadRequest, "invalid_name", err.Error(), nil)
		return
	case errors.Is(err, library.ErrNotFound):
		writeAreaError(w, slug, err)
		return
	case errors.Is(err, library.ErrBadMetadata):
		WriteError(w, http.StatusUnprocessableEntity, "invalid_metadata", err.Error(), map[string]any{"workspace": slug})
		return
	case err != nil:
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"workspace": slug})
		return
	}
	commit := s.commitPaths(r.Context(), "studio: update "+library.WorkspaceFile, library.WorkspaceFile)
	WriteJSON(w, http.StatusOK, map[string]any{"workspace": ws, "commit": commit})
}

// catalogEntry is one cohort, schema, import spec or source of the
// cohorts catalog. Path is relative to its area (use it under
// /api/w/<workspace or _global>/...); RefPath is the path a workspace
// uses for it ("_global/..." for a global entry); Ref (cohorts) is the
// {filename, data_dir} an analysis writes.
type catalogEntry struct {
	Path      string     `json:"path"`
	Name      string     `json:"name,omitempty"`
	Scope     string     `json:"scope"`
	Workspace string     `json:"workspace,omitempty"`
	RefPath   string     `json:"ref_path"`
	Ref       *cohortRef `json:"ref,omitempty"`
	Spec      string     `json:"spec,omitempty"`
	Target    string     `json:"target,omitempty"`
	State     string     `json:"state,omitempty"`
	Reason    string     `json:"reason,omitempty"`
	Format    string     `json:"format,omitempty"`
	Size      int64      `json:"size,omitempty"`
}

type cohortsCatalog struct {
	Cohorts   []catalogEntry `json:"cohorts"`
	Schemas   []catalogEntry `json:"schemas"`
	Imports   []catalogEntry `json:"imports"`
	Sources   []catalogEntry `json:"sources"`
	Truncated bool           `json:"truncated,omitempty"`
}

// handleCohorts is GET /api/cohorts: every cohort, saved schema, import
// spec and source of the library, global ones first (scope "global")
// then each workspace's local ones (scope "local", workspace = slug); a
// legacy folder's are all local to its one workspace.
func (l *Library) handleCohorts(w http.ResponseWriter, _ *http.Request) {
	out := cohortsCatalog{Cohorts: []catalogEntry{}, Schemas: []catalogEntry{}, Imports: []catalogEntry{}, Sources: []catalogEntry{}}
	add := func(dir, scopeName, ws string, skip []string) error {
		listing, err := workspace.ListWith(dir, workspace.ListOptions{Skip: skip})
		if err != nil {
			return err
		}
		out.Truncated = out.Truncated || listing.Truncated
		for _, f := range listing.Files {
			e := catalogEntry{Path: f.Path, Scope: scopeName, Workspace: ws, RefPath: f.Path}
			if scopeName == "global" {
				e.RefPath = library.GlobalPrefix + "/" + f.Path
			}
			switch f.Kind {
			case workspace.KindCohort:
				e.Name = strings.TrimSuffix(path.Base(f.Path), path.Ext(f.Path))
				dataDir := path.Dir(e.RefPath)
				e.Ref = &cohortRef{Filename: path.Base(f.Path), DataDir: dataDir}
				e.Spec = f.Spec
				if info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(f.Path))); err == nil {
					e.Size = info.Size()
				}
				out.Cohorts = append(out.Cohorts, e)
			case workspace.KindSchema:
				e.Name = strings.TrimSuffix(path.Base(f.Path), ".schema.json")
				out.Schemas = append(out.Schemas, e)
			case workspace.KindImport:
				e.Name = strings.TrimSuffix(path.Base(f.Path), ".import.json")
				e.Target, e.State, e.Reason = f.Target, f.State, f.Reason
				out.Imports = append(out.Imports, e)
			case workspace.KindSource:
				e.Name = path.Base(f.Path)
				e.Format, e.Size = f.Format, f.Size
				out.Sources = append(out.Sources, e)
			}
		}
		return nil
	}
	if !l.lib.Legacy() {
		if err := add(l.lib.Dir(), "global", "", []string{library.WorkspacesDir}); err != nil {
			WriteError(w, http.StatusInternalServerError, "list_failed", err.Error(), nil)
			return
		}
	}
	list, err := l.lib.Workspaces()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "list_failed", err.Error(), nil)
		return
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Slug < list[j].Slug })
	for _, ws := range list {
		if err := add(ws.Dir, "local", ws.Slug, nil); err != nil {
			WriteError(w, http.StatusInternalServerError, "list_failed", err.Error(), map[string]any{"workspace": ws.Slug})
			return
		}
	}
	WriteJSON(w, http.StatusOK, out)
}
