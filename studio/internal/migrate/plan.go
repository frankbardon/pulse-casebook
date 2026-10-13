// Package migrate turns a legacy flat Studio folder (internal/library
// ModeLegacy: request JSON and cohorts at the root, in req/ or anywhere
// below) into the library layout, the folder becoming one workspace:
//
//	<dir>/req/a/x.json         → workspaces/<slug>/analyses/a/x.json
//	<dir>/case/req/y.json      → workspaces/<slug>/analyses/case/req/y.json
//	<dir>/x.layout.json        → beside its analysis
//	<dir>/data/ab.pulse        → workspaces/<slug>/cohorts/data/ab.pulse
//	<dir>/ab.pulse.meta.json   → beside its cohort (Pulse's sidecars)
//	<dir>/case/labels/t.json   → workspaces/<slug>/analyses/case/labels/t.json
//	<dir>/schemas|imports|sources/...  → the workspace's own
//	<dir>/anything else        → workspaces/<slug>/anything else
//	<dir>/.git                 → workspaces/<slug>/.git (history kept)
//
// Cohort references in every moved analysis (request, compose slot,
// chain stage, fit, facet cohorts, join right sides, overlay population
// cohorts) and import spec targets are rewritten to the cohort's new
// workspace path by splicing bytes into the file: nothing else in it
// changes. Plan computes everything without touching the disk; Apply
// performs it under a journal (.studio/migration.json) that Recover
// finishes or rolls back after a crash.
package migrate

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// Names.
const (
	// JournalPath is the journal of an applied migration (library
	// relative). It stays at the library root (.studio/ is not moved).
	JournalPath = ".studio/migration.json"
	// LabelsDir is the label tables directory name (server.LabelTablesDirName).
	LabelsDir = "labels"
	// legacyReqDir is the casebook request directory whose level is dropped.
	legacyReqDir = "req"
	// maxEntries bounds the walk.
	maxEntries = 100000
)

// Move kinds.
const (
	KindGit           = "git"
	KindAnalysis      = "analysis"
	KindLayout        = "layout"
	KindCohort        = "cohort"
	KindCohortSidecar = "cohort_sidecar"
	KindLabels        = "labels"
	KindSchema        = "schema"
	KindImport        = "import"
	KindSource        = "source"
	KindOther         = "other"
)

// Reasons a folder cannot be migrated (Plan.Reason).
const (
	ReasonAlreadyLibrary = "already_library"
	ReasonNoGit          = "no_git"
	ReasonNotLegacy      = "not_legacy"
	ReasonInsideRepo     = "inside_repository"
	ReasonGitLink        = "git_link"
	ReasonConflicts      = "conflicts"
	ReasonTooManyFiles   = "too_many_files"
	ReasonInterrupted    = "interrupted"
)

// Move is one file or directory moved, library-relative slash paths.
// Dir: a whole directory moved as one unit (hidden directories,
// node_modules, empty directories, the repository).
type Move struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
	Dir  bool   `json:"dir,omitempty"`
}

// Ref fields (RefChange.Field).
const (
	FieldCohort       = "cohort"        // {filename, data_dir}
	FieldJoin         = "join"          // joins[].right
	FieldPopulation   = "population"    // overlays ref.population.cohort
	FieldImportTarget = "import_target" // import spec target
)

// RefChange is one rewritten reference. Old and New are the reference
// as written (cohorts: data_dir + "/" + filename); Resolved is the
// legacy file it pointed at.
type RefChange struct {
	Pointer  string `json:"pointer"`
	Field    string `json:"field"`
	Old      string `json:"old"`
	New      string `json:"new"`
	Resolved string `json:"resolved"`
}

// Rewrite is one moved JSON file whose references change. Path is its
// new (library-relative) path, From the old one.
type Rewrite struct {
	Path    string      `json:"path"`
	From    string      `json:"from"`
	Changes []RefChange `json:"changes"`

	before, after []byte
}

// Issue is a warning (the migration still runs) or a conflict (it
// refuses).
type Issue struct {
	Code    string `json:"code"`
	Path    string `json:"path,omitempty"`
	Pointer string `json:"pointer,omitempty"`
	Ref     string `json:"ref,omitempty"`
	Message string `json:"message"`
}

// WorkspacePlan is the workspace the folder becomes.
type WorkspacePlan struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
	Path string `json:"path"` // workspaces/<slug>
}

// GitPlan says what happens to repositories.
type GitPlan struct {
	// Workspace: "moved" (the root .git becomes the workspace's
	// repository and the moves are committed there), "init" (no
	// repository yet: one is initialised on first open) or "none" (git
	// is not available).
	Workspace string `json:"workspace"`
	From      string `json:"from,omitempty"`
	To        string `json:"to,omitempty"`
	Commit    string `json:"commit_message,omitempty"`
	// Ignore is the workspace .gitignore whose managed block is
	// rewritten to the workspace form.
	Ignore string `json:"ignore,omitempty"`
	// Global: "init" (a new repository for the global area at the
	// library root) or "none".
	Global string `json:"global"`
}

// Counts summarises a plan.
type Counts struct {
	Files          int `json:"files"`
	Analyses       int `json:"analyses"`
	Layouts        int `json:"layouts"`
	Cohorts        int `json:"cohorts"`
	CohortSidecars int `json:"cohort_sidecars"`
	Labels         int `json:"labels"`
	Schemas        int `json:"schemas"`
	Imports        int `json:"imports"`
	Sources        int `json:"sources"`
	Other          int `json:"other"`
	Rewrites       int `json:"rewrites"`
	Refs           int `json:"refs"`
	Warnings       int `json:"warnings"`
	Conflicts      int `json:"conflicts"`
}

// Plan is everything a migration would do. It is computed from the disk
// as it is now; ID fingerprints it so Apply can refuse a plan that
// changed since it was shown.
type Plan struct {
	Migratable bool          `json:"migratable"`
	Reason     string        `json:"reason,omitempty"`
	Message    string        `json:"message,omitempty"`
	ID         string        `json:"plan_id,omitempty"`
	Library    string        `json:"library"`
	Workspace  WorkspacePlan `json:"workspace"`
	Moves      []Move        `json:"moves"`
	Rewrites   []Rewrite     `json:"rewrites"`
	// Creates lists files and directories the migration makes.
	Creates []string `json:"creates"`
	// Stays lists root entries left where they are.
	Stays     []string `json:"stays"`
	Git       GitPlan  `json:"git"`
	Warnings  []Issue  `json:"warnings"`
	Conflicts []Issue  `json:"conflicts"`
	Counts    Counts   `json:"counts"`

	dir     string
	gitExe  string
	tracked bool // a root repository whose index is read at apply time
}

// Options configures Plan, Apply and Recover.
type Options struct {
	// NoGit: --no-git; a folder is never migrated.
	NoGit bool
	// Git is the git executable ("" = PATH).
	Git string
	// Logf receives progress lines (nil: discard).
	Logf func(string, ...any)
}

func (o Options) logf(format string, args ...any) {
	if o.Logf != nil {
		o.Logf(format, args...)
	}
}

func (o Options) gitExe() string {
	name := o.Git
	if name == "" {
		name = "git"
	}
	exe, err := exec.LookPath(name)
	if err != nil {
		return ""
	}
	return exe
}

func emptyPlan(dir string) *Plan {
	name := filepath.Base(dir)
	slug := library.Slugify(name)
	return &Plan{
		Library:   name,
		Workspace: WorkspacePlan{Slug: slug, Name: name, Path: library.WorkspacesDir + "/" + slug},
		Moves:     []Move{}, Rewrites: []Rewrite{}, Creates: []string{}, Stays: []string{},
		Warnings: []Issue{}, Conflicts: []Issue{},
		Git: GitPlan{Workspace: "none", Global: "none"},
		dir: dir,
	}
}

func (p *Plan) refuse(reason, msg string) *Plan {
	p.Migratable, p.Reason, p.Message = false, reason, msg
	return p
}

// file is one walked entry (library-relative slash path).
type file struct {
	rel  string
	dir  bool // a directory moved whole
	link bool
	size int64
}

// MakePlan computes the migration of dir (absolute, symlinks evaluated).
// It never changes anything on disk. A folder that cannot be migrated
// gives a plan with Migratable false and a Reason; an error is returned
// only when the folder cannot be read.
func MakePlan(ctx context.Context, dir string, opts Options) (*Plan, error) {
	p := emptyPlan(dir)
	if _, err := os.Stat(filepath.Join(dir, library.MarkerFile)); err == nil {
		return p.refuse(ReasonAlreadyLibrary, "this folder is already a library"), nil
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(JournalPath))); err == nil {
		return p.refuse(ReasonInterrupted, "an interrupted migration's journal ("+JournalPath+") is present: restart the studio to resume or roll it back"), nil
	}
	if opts.NoGit {
		return p.refuse(ReasonNoGit, "the studio runs with --no-git: legacy folders are served in place and never migrated"), nil
	}
	if !library.IsLegacy(dir) {
		return p.refuse(ReasonNotLegacy, "this folder holds no legacy studio content"), nil
	}

	// Repositories.
	p.gitExe = opts.gitExe()
	wsRel := p.Workspace.Path
	if info, err := os.Lstat(filepath.Join(dir, ".git")); err == nil {
		if !info.IsDir() {
			return p.refuse(ReasonGitLink, ".git is a link to a repository elsewhere (a worktree or submodule): it cannot become the workspace's repository"), nil
		}
		p.Moves = append(p.Moves, Move{From: ".git", To: wsRel + "/.git", Kind: KindGit, Dir: true})
		p.Git = GitPlan{Workspace: "moved", From: ".git", To: wsRel + "/.git"}
		if p.gitExe != "" {
			p.Git.Commit = CommitMessage
			p.tracked = true
		}
	} else if p.gitExe != "" {
		if out, err := gitRun(ctx, p.gitExe, dir, "rev-parse", "--show-toplevel"); err == nil {
			return p.refuse(ReasonInsideRepo, "this folder is part of the repository at "+strings.TrimSpace(string(out))+": migrating would move that repository's files"), nil
		}
		p.Git.Workspace = "init"
	}
	if p.gitExe != "" {
		p.Git.Ignore = wsRel + "/.gitignore"
		p.Git.Global = "init"
	}

	files, err := walk(dir, p)
	if err != nil {
		return nil, err
	}
	if len(files) > maxEntries {
		return p.refuse(ReasonTooManyFiles, fmt.Sprintf("more than %d files below this folder", maxEntries)), nil
	}
	p.classify(files)
	p.Creates = append(p.Creates, library.MarkerFile, library.WorkspacesDir+"/", wsRel+"/"+library.WorkspaceFile)
	for _, d := range layoutDirs {
		p.Creates = append(p.Creates, wsRel+"/"+d+"/")
	}
	if p.Git.Global == "init" {
		p.Creates = append(p.Creates, ".git/", ".gitignore")
	}
	if p.Git.Workspace == "moved" {
		if _, err := os.Stat(filepath.Join(dir, ".gitignore")); err != nil {
			p.Creates = append(p.Creates, wsRel+"/.gitignore")
		}
	}
	p.Counts.Warnings, p.Counts.Conflicts = len(p.Warnings), len(p.Conflicts)
	p.Counts.Rewrites = len(p.Rewrites)
	p.ID = p.fingerprint()
	if len(p.Conflicts) > 0 {
		return p.refuse(ReasonConflicts, "the migration would overwrite or hide files: resolve the conflicts first"), nil
	}
	p.Migratable = true
	return p, nil
}

var layoutDirs = []string{library.AnalysesDir, library.CohortsDir, library.SchemasDir, library.ImportsDir, library.SourcesDir}

// walk lists every entry to move. Root .git and .studio are not walked
// (the repository moves whole; .studio stays). Hidden directories,
// node_modules and empty directories move as one unit.
func walk(dir string, p *Plan) ([]file, error) {
	var out []file
	err := filepath.WalkDir(dir, func(abs string, d fs.DirEntry, err error) error {
		if err != nil {
			if abs == dir {
				return err
			}
			p.Warnings = append(p.Warnings, Issue{Code: "unreadable", Path: relOf(dir, abs), Message: err.Error()})
			return nil
		}
		if abs == dir {
			return nil
		}
		rel := relOf(dir, abs)
		name := d.Name()
		top := !strings.Contains(rel, "/")
		if top {
			switch name {
			case ".git":
				return filepath.SkipDir
			case ".studio":
				p.Stays = append(p.Stays, rel)
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			case library.WorkspacesDir, library.GlobalPrefix, library.MarkerFile:
				p.Conflicts = append(p.Conflicts, Issue{Code: "reserved_name", Path: rel,
					Message: "\"" + name + "\" is reserved by the library layout: rename it before migrating"})
			}
		}
		if len(out) > maxEntries {
			return fs.SkipAll
		}
		if d.Type()&fs.ModeSymlink != 0 {
			out = append(out, file{rel: rel, link: true})
			target, _ := os.Readlink(abs)
			p.Warnings = append(p.Warnings, Issue{Code: "symlink_moved", Path: rel, Ref: target,
				Message: "a symbolic link is moved as it is: a relative target may no longer resolve"})
			return nil
		}
		if d.IsDir() {
			if strings.HasPrefix(name, ".") || name == "node_modules" {
				out = append(out, file{rel: rel, dir: true})
				return filepath.SkipDir
			}
			if entries, err := os.ReadDir(abs); err == nil && len(entries) == 0 {
				out = append(out, file{rel: rel, dir: true})
			}
			return nil
		}
		f := file{rel: rel}
		if info, err := d.Info(); err == nil {
			f.size = info.Size()
		}
		out = append(out, f)
		return nil
	})
	return out, err
}

func relOf(dir, abs string) string {
	r, _ := filepath.Rel(dir, abs)
	return filepath.ToSlash(r)
}

// analysisPath maps a legacy path to its place under analyses/: the
// root req/ level is dropped, anything else keeps its relative path.
func analysisPath(rel string) string {
	switch {
	case rel == legacyReqDir:
		return library.AnalysesDir
	case strings.HasPrefix(rel, legacyReqDir+"/"):
		return library.AnalysesDir + "/" + rel[len(legacyReqDir)+1:]
	case rel == library.AnalysesDir || strings.HasPrefix(rel, library.AnalysesDir+"/"):
		return rel
	}
	return library.AnalysesDir + "/" + rel
}

// cohortPath maps a legacy cohort path to its place under cohorts/.
func cohortPath(rel string) string {
	if strings.HasPrefix(rel, library.CohortsDir+"/") {
		return rel
	}
	return library.CohortsDir + "/" + rel
}

// Pulse's cohort sidecars (pulse.CohortArtifacts): <cohort> + one of
// these, or <cohort>.<16 hex>.idx, in the cohort's directory.
var (
	cohortSidecarSuffixes = []string{".meta.json", ".spss.json", ".indexes.json"}
	idxSuffix             = regexp.MustCompile(`\.[0-9a-f]{16}\.idx$`)
)

func isAnalysisKind(k workspace.Kind) bool {
	return k == workspace.KindRequest || k == workspace.KindCompose || k == workspace.KindFacet || k == workspace.KindChain
}

// classify decides every entry's destination, then plans the rewrites.
func (p *Plan) classify(files []file) {
	ws := p.Workspace.Path + "/"
	dest := map[string]Move{} // legacy rel → move (workspace-relative To)
	cohorts := map[string]bool{}
	for _, f := range files {
		if !f.dir && strings.HasSuffix(strings.ToLower(f.rel), ".pulse") {
			cohorts[f.rel] = true
		}
	}
	sidecarOf := func(rel string) (string, bool) {
		for _, s := range cohortSidecarSuffixes {
			if c := strings.TrimSuffix(rel, s); c != rel && cohorts[c] {
				return c, true
			}
		}
		if loc := idxSuffix.FindStringIndex(rel); loc != nil && cohorts[rel[:loc[0]]] {
			return rel[:loc[0]], true
		}
		return "", false
	}
	// Analyses first (layouts and labels depend on them).
	analyses := map[string]bool{}
	for _, f := range files {
		if f.dir || f.link || cohorts[f.rel] || inLabels(f.rel) != "" {
			continue
		}
		if _, ok := sidecarOf(f.rel); ok {
			continue
		}
		lower := strings.ToLower(f.rel)
		if !strings.HasSuffix(lower, ".json") || strings.HasSuffix(lower, workspace.LayoutSuffix) || f.size > workspace.MaxRequestBytes {
			continue
		}
		data, err := os.ReadFile(filepath.Join(p.dir, filepath.FromSlash(f.rel)))
		if err != nil {
			continue
		}
		if k, _ := workspace.Classify(f.rel, data); isAnalysisKind(k) {
			analyses[f.rel] = true
		}
	}
	for _, f := range files {
		m := Move{From: f.rel, To: f.rel, Kind: KindOther, Dir: f.dir}
		switch {
		case f.dir:
		case cohorts[f.rel]:
			m.To, m.Kind = cohortPath(f.rel), KindCohort
			p.Counts.Cohorts++
		case analyses[f.rel]:
			m.To, m.Kind = analysisPath(f.rel), KindAnalysis
			p.Counts.Analyses++
		default:
			if c, ok := sidecarOf(f.rel); ok {
				m.To, m.Kind = cohortPath(c)+f.rel[len(c):], KindCohortSidecar
				p.Counts.CohortSidecars++
				break
			}
			if req, ok := layoutOwner(f.rel); ok && analyses[req] {
				lp, _ := workspace.LayoutPath(analysisPath(req))
				m.To, m.Kind = lp, KindLayout
				p.Counts.Layouts++
				break
			}
			if owner := inLabels(f.rel); owner != "" && servesAnalysis(owner, analyses) {
				m.To, m.Kind = analysisPath(owner)+f.rel[len(owner):], KindLabels
				p.Counts.Labels++
				break
			}
			if k, _, ok := layoutKind(f.rel); ok {
				m.Kind = k
				switch k {
				case KindSchema:
					p.Counts.Schemas++
				case KindImport:
					p.Counts.Imports++
				case KindSource:
					p.Counts.Sources++
				}
				break
			}
			p.Counts.Other++
		}
		if !f.dir {
			p.Counts.Files++
		}
		dest[f.rel] = m
	}

	// Collisions (two sources, one destination). Every destination is
	// inside the new workspace directory, which does not exist yet.
	byTo := map[string]string{}
	keys := make([]string, 0, len(dest))
	for k := range dest {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		m := dest[k]
		if other, dup := byTo[m.To]; dup {
			p.Conflicts = append(p.Conflicts, Issue{Code: "target_collision", Path: ws + m.To,
				Message: fmt.Sprintf("both %s and %s would move to %s", other, m.From, ws+m.To)})
			continue
		}
		byTo[m.To] = m.From
	}
	// A destination below another moved file (x is a file, x/y a target).
	for _, k := range keys {
		to := dest[k].To
		for d := path.Dir(to); d != "."; d = path.Dir(d) {
			if from, ok := byTo[d]; ok && !dest[from].Dir {
				p.Conflicts = append(p.Conflicts, Issue{Code: "target_collision", Path: ws + to,
					Message: fmt.Sprintf("%s would move below the file %s", k, ws+d)})
				break
			}
		}
	}

	for _, k := range keys {
		m := dest[k]
		p.Moves = append(p.Moves, Move{From: m.From, To: ws + m.To, Kind: m.Kind, Dir: m.Dir})
	}
	// Rewrites: analyses' cohort refs and import spec targets.
	res := &resolver{dir: p.dir, dest: dest}
	for _, k := range keys {
		m := dest[k]
		switch m.Kind {
		case KindAnalysis:
			p.planRewrite(res, m, refsOfAnalysis)
		case KindImport:
			p.planRewrite(res, m, refsOfImport)
		}
	}
}

// layoutOwner is the request a layout sidecar belongs to.
func layoutOwner(rel string) (string, bool) {
	if !strings.HasSuffix(strings.ToLower(rel), workspace.LayoutSuffix) {
		return "", false
	}
	return rel[:len(rel)-len(workspace.LayoutSuffix)] + ".json", true
}

// inLabels returns the parent of the first labels/ directory below the
// root that holds rel ("case" for case/labels/t.json), or "" (root
// labels/ never moves: it already serves analyses/).
func inLabels(rel string) string {
	segs := strings.Split(rel, "/")
	for i := 1; i < len(segs)-1; i++ {
		if segs[i] == LabelsDir {
			return strings.Join(segs[:i], "/")
		}
	}
	return ""
}

// servesAnalysis reports whether a labels/ directory in owner serves an
// analysis (the studio looks for labels/ walking up from a request).
func servesAnalysis(owner string, analyses map[string]bool) bool {
	for a := range analyses {
		if strings.HasPrefix(a, owner+"/") {
			return true
		}
	}
	return false
}

// layoutKind is the import layout kind of a root-relative path.
func layoutKind(rel string) (string, workspace.Kind, bool) {
	k, _ := workspace.Classify(rel, nil)
	switch k {
	case workspace.KindSchema:
		return KindSchema, k, true
	case workspace.KindImport:
		return KindImport, k, true
	case workspace.KindSource:
		return KindSource, k, true
	}
	return "", "", false
}

func (p *Plan) planRewrite(res *resolver, m Move, find func(*jsonfmt.Node, *refWalk)) {
	src, err := os.ReadFile(filepath.Join(p.dir, filepath.FromSlash(m.From)))
	if err != nil {
		p.Warnings = append(p.Warnings, Issue{Code: "unreadable", Path: m.From, Message: err.Error()})
		return
	}
	root, err := jsonfmt.Parse(src)
	if err != nil {
		p.Warnings = append(p.Warnings, Issue{Code: "invalid_json", Path: m.From, Message: err.Error()})
		return
	}
	w := &refWalk{res: res, from: m.From}
	find(root, w)
	for i := range w.issues {
		w.issues[i].Path = m.From
	}
	p.Warnings = append(p.Warnings, w.issues...)
	p.Counts.Refs += w.refs
	if len(w.edits) == 0 {
		return
	}
	out := splice(src, w.edits)
	if _, err := jsonfmt.Parse(out); err != nil {
		// Never write a file that no longer parses.
		p.Warnings = append(p.Warnings, Issue{Code: "rewrite_failed", Path: m.From, Message: err.Error()})
		return
	}
	p.Rewrites = append(p.Rewrites, Rewrite{Path: p.Workspace.Path + "/" + m.To, From: m.From, Changes: w.changes, before: src, after: out})
}

func (p *Plan) fingerprint() string {
	h := sha256.New()
	enc := json.NewEncoder(h)
	_ = enc.Encode([]any{p.Workspace, p.Moves, p.Git, p.Conflicts, p.Creates})
	for _, r := range p.Rewrites {
		fmt.Fprintf(h, "%s\x00%s\x00%x\x00%x\n", r.Path, r.From, sha256.Sum256(r.before), sha256.Sum256(r.after))
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func shaHex(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

// gitRun runs git in dir (no prompts, C locale) and returns stdout.
func gitRun(ctx context.Context, git, dir string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, git, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_EDITOR=true", "GIT_PAGER=cat", "LC_ALL=C")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return out, nil
}

// workspaceIgnore is the workspace .gitignore: src (may be nil) with the
// managed block in the workspace form.
func workspaceIgnore(src []byte) []byte { return history.MergeIgnoreWith(src, history.IgnorePatterns) }
