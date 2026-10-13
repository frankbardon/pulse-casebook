// Package promote makes a workspace-local cohort or schema global
// ("Make global"): it moves into the library's global area, where every
// workspace sees it as _global/...; the workspace's references follow.
// There is deliberately no way back: a global item may be used by any
// workspace, so it is never moved into one.
//
// A cohort moves with everything that belongs to it:
//
//	workspaces/<ws>/cohorts/<sub>/x.pulse        → cohorts/<sub>/<name>.pulse
//	  + Pulse's sidecars (pulse.CohortArtifacts)   beside it, renamed with it
//	workspaces/<ws>/imports/x.import.json        → imports/<name>.import.json (target rewritten)
//	workspaces/<ws>/sources/<file>               → sources/<file> (source.path rewritten when renamed)
//	workspaces/<ws>/schemas/<s>.schema.json      → schemas/<s>.schema.json, if the import used a saved schema
//
// A schema alone moves just its file. Every analysis of the workspace
// that names the cohort is rewritten to data_dir "_global/cohorts" (joins
// and populations to "_global/cohorts/..."), keeping subfolders and
// shard anchors; the workspace's other import specs that shared the
// moved source or schema point at it as "_global/...". Edits are byte
// splices (internal/refedit): nothing else in a file changes.
//
// MakePlan computes everything without writing; Apply performs it under
// a journal (.studio/promotion.json at the library root): a failure
// before the commits is rolled back, and Recover (at startup) rolls back
// or finishes an interrupted one.
package promote

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/importer"
	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/refedit"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// Item kinds (Request.Kind).
const (
	KindCohort = "cohort"
	KindSchema = "schema"
)

// Move kinds.
const (
	MoveCohort        = "cohort"
	MoveCohortSidecar = "cohort_sidecar"
	MoveImport        = "import"
	MoveSchema        = "schema"
	MoveSource        = "source"
)

// Move actions.
const (
	// ActionMove: the file moves to To.
	ActionMove = "move"
	// ActionMerge: an identical file is already at To; the local copy
	// is removed and its references point at the global one.
	ActionMerge = "merge"
)

// Fields of the import spec references a promotion rewrites (besides
// refedit's cohort, join, population and import_target).
const (
	FieldImportSource = "import_source" // source.path
	FieldImportSchema = "import_schema" // schema.ref / schema.path
	FieldIndexName    = "index_manifest"
)

// Request names what to promote.
type Request struct {
	Workspace string `json:"workspace"`
	Kind      string `json:"kind"`
	// Name: a cohort's name (cohorts/<name>.pulse) or its workspace
	// path (cohorts/<sub>/<name>.pulse); a schema's name.
	Name string `json:"name"`
	// NewName: the item's name in the global area (default: its name).
	NewName string `json:"new_name,omitempty"`
	// SchemaName: a promoted cohort's local schema's name in the global
	// area (default: its name).
	SchemaName string `json:"schema_name,omitempty"`
}

// Move is one file promoted. Paths are library-relative.
type Move struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Kind   string `json:"kind"`
	Action string `json:"action"`
}

// Rewrite is one file whose references change. Path is where it is
// after the promotion (library-relative); From is set when it moves.
type Rewrite struct {
	Path    string           `json:"path"`
	From    string           `json:"from,omitempty"`
	Changes []refedit.Change `json:"changes"`

	before, after []byte
}

// Item is a promoted file: its local and global names and paths.
type Item struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	GlobalName string `json:"global_name"`
	// Path is workspace-relative, GlobalPath global-area-relative;
	// RefPath is what a workspace names it by from now on.
	Path       string `json:"path"`
	GlobalPath string `json:"global_path"`
	RefPath    string `json:"ref_path"`
	// Action: move, or merge (an identical global copy exists).
	Action string `json:"action"`
}

// Commits are the messages of the two commits.
type Commits struct {
	Workspace string `json:"workspace"`
	Global    string `json:"global"`
}

// Counts summarises a plan.
type Counts struct {
	Moves    int `json:"moves"`
	Rewrites int `json:"rewrites"`
	Analyses int `json:"analyses"` // analyses rewritten
	Refs     int `json:"refs"`     // references rewritten
	Warnings int `json:"warnings"`
}

// Plan is everything a promotion does, computed from the disk as it is.
// ID fingerprints it so Apply can refuse a plan that changed since it
// was shown.
type Plan struct {
	ID        string          `json:"plan_id"`
	Kind      string          `json:"kind"`
	Workspace string          `json:"workspace"`
	Item      Item            `json:"item"`
	Schema    *Item           `json:"schema,omitempty"` // a cohort's local schema
	Moves     []Move          `json:"moves"`
	Rewrites  []Rewrite       `json:"rewrites"`
	Warnings  []refedit.Issue `json:"warnings"`
	Commits   Commits         `json:"commits"`
	Counts    Counts          `json:"counts"`

	libDir, wsDir, wsRel string
	wsPaths, glPaths     []string // committed in each repository
}

// Errors.
var (
	// ErrBadKind: kind is neither cohort nor schema.
	ErrBadKind = errors.New("kind must be cohort or schema")
)

// NotFoundError: no such workspace item.
type NotFoundError struct{ Kind, Path string }

func (e *NotFoundError) Error() string { return "no " + e.Kind + " at " + e.Path }

// InvalidError: a request the promotion refuses (Field names the bad
// input).
type InvalidError struct {
	// Code: invalid_name (a bad name or new name) or not_promotable
	// (the item cannot be made global: already global, outside cohorts/).
	Code, Field, Message string
}

func (e *InvalidError) Error() string { return e.Message }

// ClashError: the global area already has an item of that name. Field
// is the request field that renames it; Suggested is a free name.
type ClashError struct {
	Item      string `json:"item"` // cohort | schema
	Name      string `json:"name"`
	Existing  string `json:"existing"` // global-area path in the way
	Field     string `json:"field"`
	Suggested string `json:"suggested"`
}

func (e *ClashError) Error() string {
	return fmt.Sprintf("the global area already has a %s named %q (%s): choose another name, e.g. %q", e.Item, e.Name, e.Existing, e.Suggested)
}

// planner carries the state of one MakePlan.
type planner struct {
	ctx    context.Context
	p      *Plan
	req    Request
	libDir string
	wsDir  string
	wsRel  string // workspaces/<slug>
	// specs: the workspace's import specs (workspace paths) and their
	// texts; edits collected per file.
	specs      []string
	specText   map[string][]byte
	specEdits  map[string][]refedit.Edit
	specChange map[string][]refedit.Change
	moved      map[string]string // workspace path → global path, for sources and schemas
	promoted   string            // the promoted cohort's spec (workspace path)
	claimed    map[string]bool   // global paths this plan writes
}

// MakePlan computes the promotion req asks for in lib. It never writes.
// Errors: library.ErrNotFound (workspace), ErrBadKind,
// *NotFoundError, *InvalidError, *ClashError.
func MakePlan(ctx context.Context, lib *library.Library, req Request) (*Plan, error) {
	ws, err := lib.Workspace(req.Workspace)
	if err != nil {
		return nil, err
	}
	pl := &planner{ctx: ctx, req: req, libDir: lib.Dir(), wsDir: ws.Dir, wsRel: library.WorkspacesDir + "/" + ws.Slug,
		specText: map[string][]byte{}, specEdits: map[string][]refedit.Edit{}, specChange: map[string][]refedit.Change{},
		moved: map[string]string{}, claimed: map[string]bool{}}
	pl.p = &Plan{Kind: req.Kind, Workspace: ws.Slug, Moves: []Move{}, Rewrites: []Rewrite{}, Warnings: []refedit.Issue{},
		libDir: lib.Dir(), wsDir: ws.Dir, wsRel: pl.wsRel}
	if err := pl.loadSpecs(); err != nil {
		return nil, err
	}
	switch req.Kind {
	case KindCohort:
		err = pl.cohort()
	case KindSchema:
		err = pl.schema()
	default:
		err = ErrBadKind
	}
	if err != nil {
		return nil, err
	}
	pl.finishSpecs()
	p := pl.p
	p.Counts.Moves, p.Counts.Rewrites, p.Counts.Warnings = len(p.Moves), len(p.Rewrites), len(p.Warnings)
	for _, r := range p.Rewrites {
		p.Counts.Refs += len(r.Changes)
	}
	p.ID = p.fingerprint()
	return p, nil
}

// ------------------------------------------------------------------ cohort

func (pl *planner) cohort() error {
	req := pl.req
	rel := strings.TrimSpace(req.Name)
	if rel == "" {
		return &InvalidError{Code: "invalid_name", Field: "name", Message: "name is required"}
	}
	if !strings.Contains(rel, "/") && !strings.HasSuffix(strings.ToLower(rel), ".pulse") {
		rel = library.CohortsDir + "/" + rel + ".pulse"
	}
	rel, ok := refedit.NormalizeRel(rel)
	if !ok || refedit.IsAbsPath(req.Name) || !strings.HasSuffix(strings.ToLower(rel), ".pulse") {
		return &InvalidError{Code: "invalid_name", Field: "name", Message: "name must be a cohort name or a workspace path to a .pulse file"}
	}
	if strings.HasPrefix(rel, library.GlobalPrefix+"/") {
		return &InvalidError{Code: "not_promotable", Field: "name", Message: "this cohort is already global"}
	}
	if !strings.HasPrefix(rel, library.CohortsDir+"/") {
		return &InvalidError{Code: "not_promotable", Field: "name", Message: "only cohorts in the workspace's cohorts/ folder can be made global"}
	}
	if info, err := os.Lstat(pl.ws(rel)); err != nil || !info.Mode().IsRegular() {
		return &NotFoundError{Kind: "cohort", Path: rel}
	}
	name := importer.CohortName(rel)
	gname := name
	if req.NewName != "" {
		gname = importer.CohortName(strings.TrimSpace(req.NewName))
		if !importer.ValidName(gname) {
			return &InvalidError{Code: "invalid_name", Field: "new_name", Message: "new_name must be letters, digits, '.', '-' or '_' (starting with a letter or digit)"}
		}
	}
	dir := refedit.SlashDir(rel)
	gpath := dir + "/" + gname + ".pulse"

	eng, err := pulse.New(pulse.Options{DataDir: pl.wsDir})
	if err != nil {
		return fmt.Errorf("start pulse engine: %w", err)
	}
	arts, err := eng.CohortArtifacts(pl.ctx, rel)
	if err != nil {
		return fmt.Errorf("list the cohort's sidecars: %w", err)
	}
	base := path.Base(rel)
	sidecar := func(a string, cohortName string) string {
		return dir + "/" + cohortName + ".pulse" + strings.TrimPrefix(path.Base(a), base)
	}
	spec := pl.specOf(rel)

	// The global names the cohort takes: it, its sidecars, its spec.
	taken := func(n string) string {
		cands := []string{dir + "/" + n + ".pulse", importer.ImportsDir + "/" + n + importer.SpecSuffix}
		for _, a := range arts {
			cands = append(cands, sidecar(filepath.ToSlash(a), n))
		}
		for _, c := range cands {
			if exists(pl.gl(c)) {
				return c
			}
		}
		return ""
	}
	if in := taken(gname); in != "" {
		return &ClashError{Item: KindCohort, Name: gname, Existing: in, Field: "new_name", Suggested: freeName(gname, func(n string) bool { return taken(n) == "" })}
	}

	pl.p.Item = Item{Kind: KindCohort, Name: name, GlobalName: gname, Path: rel, GlobalPath: gpath, RefPath: library.GlobalPrefix + "/" + gpath, Action: ActionMove}
	pl.move(rel, gpath, MoveCohort, ActionMove)
	for _, a := range arts {
		a = filepath.ToSlash(a)
		pl.move(a, sidecar(a, gname), MoveCohortSidecar, ActionMove)
	}
	if gname != name {
		if err := pl.renameManifest(rel, gpath, base, gname+".pulse"); err != nil {
			return err
		}
	}
	if spec != "" {
		if err := pl.promoteSpec(spec, gpath, gname); err != nil {
			return err
		}
	}
	if err := pl.rewriteAnalyses(rel, library.GlobalPrefix+"/"+gpath); err != nil {
		return err
	}

	what := "cohort " + rel
	pl.p.Commits = Commits{
		Workspace: "studio: make " + what + " global" + renamedAs(gpath, rel),
		Global:    "studio: make cohort " + gpath + " global (from workspace " + pl.p.Workspace + ")",
	}
	return nil
}

// promoteSpec moves the cohort's import spec with its source and its
// local schema, rewriting target, source.path and schema.
func (pl *planner) promoteSpec(spec, gpath, gname string) error {
	pl.promoted = spec
	src := pl.specText[spec]
	gspec := importer.ImportsDir + "/" + gname + importer.SpecSuffix
	pl.move(spec, gspec, MoveImport, ActionMove)
	root, err := jsonfmt.Parse(src)
	if err != nil {
		pl.warn("invalid_json", spec, "", err.Error())
		return nil
	}
	var edits []refedit.Edit
	var changes []refedit.Change
	set := func(n *jsonfmt.Node, ptr, field, to string) {
		if n == nil || n.Kind != jsonfmt.String || refedit.Unquote(n.Raw) == to {
			return
		}
		edits = append(edits, refedit.Edit{Start: n.Start, End: n.End, Text: refedit.Quote(to)})
		changes = append(changes, refedit.Change{Pointer: ptr, Field: field, Old: refedit.Unquote(n.Raw), New: to})
	}
	set(refedit.Member(root, "target"), "/target", refedit.FieldImportTarget, gpath)

	// Source: a workspace file moves to the global sources/ (merged with
	// an identical global file, else renamed when the name is taken).
	if sp := refedit.Member(refedit.Member(root, "source"), "path"); sp != nil && sp.Kind == jsonfmt.String {
		written := refedit.Unquote(sp.Raw)
		switch {
		case strings.HasPrefix(written, library.GlobalPrefix+"/"):
			set(sp, "/source/path", FieldImportSource, strings.TrimPrefix(written, library.GlobalPrefix+"/"))
		default:
			srcRel, ok := refedit.NormalizeRel(written)
			if !ok || refedit.IsAbsPath(written) {
				pl.warn("source_unresolvable", spec, written, "the spec's source path is absolute or escapes the workspace: left as it is")
				break
			}
			if !exists(pl.ws(srcRel)) {
				pl.warn("source_missing", spec, written, "the spec's source file is missing: upload it to the global sources/ to rebuild the cohort")
				break
			}
			to := pl.promoteSource(srcRel)
			set(sp, "/source/path", FieldImportSource, to)
		}
	}

	// Schema: a saved schema of the workspace moves too.
	if sc := refedit.Member(root, "schema"); sc != nil && sc.Kind == jsonfmt.Object {
		ref := refedit.Member(sc, "ref")
		pth := refedit.Member(sc, "path")
		written := ""
		if pth != nil && pth.Kind == jsonfmt.String {
			written = refedit.Unquote(pth.Raw)
		}
		switch {
		case strings.HasPrefix(written, library.GlobalPrefix+"/"):
			set(pth, "/schema/path", FieldImportSchema, strings.TrimPrefix(written, library.GlobalPrefix+"/"))
		case ref != nil && ref.Kind == jsonfmt.String && refedit.Unquote(ref.Raw) != "":
			name := refedit.Unquote(ref.Raw)
			local := importer.SchemaPath(name)
			if !exists(pl.ws(local)) {
				pl.warn("schema_missing", spec, local, "the spec's saved schema is missing: it is not moved")
				break
			}
			it, err := pl.promoteSchema(name, local, strings.TrimSpace(pl.req.SchemaName), "schema_name")
			if err != nil {
				return err
			}
			pl.p.Schema = it
			set(ref, "/schema/ref", FieldImportSchema, it.GlobalName)
			if pth != nil {
				set(pth, "/schema/path", FieldImportSchema, it.GlobalPath)
			}
		}
	}
	pl.addRewrite(pl.wsRel+"/"+spec, gspec, src, edits, changes)
	pl.specText[spec] = nil // promoted: not one of the workspace's specs any more
	return nil
}

// promoteSource moves a workspace source to the global sources/ and
// returns its global path.
func (pl *planner) promoteSource(rel string) string {
	if to, ok := pl.moved[rel]; ok {
		return to
	}
	to := rel
	if !strings.HasPrefix(rel, library.SourcesDir+"/") {
		to = library.SourcesDir + "/" + path.Base(rel)
	}
	action := ActionMove
	if exists(pl.gl(to)) {
		if sameFile(pl.ws(rel), pl.gl(to)) {
			action = ActionMerge
		} else {
			stem, ext := splitExt(path.Base(to))
			free := freeName(stem, func(n string) bool {
				return !exists(pl.gl(refedit.SlashDir(to)+"/"+n+ext)) && !pl.claimed[refedit.SlashDir(to)+"/"+n+ext]
			})
			to = refedit.SlashDir(to) + "/" + free + ext
		}
	}
	pl.move(rel, to, MoveSource, action)
	pl.moved[rel] = to
	// The workspace's other specs that read it.
	for _, spec := range pl.specs {
		if spec == pl.promoted || pl.specText[spec] == nil {
			continue
		}
		root, err := jsonfmt.Parse(pl.specText[spec])
		if err != nil {
			continue
		}
		sp := refedit.Member(refedit.Member(root, "source"), "path")
		if sp == nil || sp.Kind != jsonfmt.String {
			continue
		}
		if p, ok := refedit.NormalizeRel(refedit.Unquote(sp.Raw)); !ok || p != rel {
			continue
		}
		g := library.GlobalPrefix + "/" + to
		pl.specEdit(spec, refedit.Edit{Start: sp.Start, End: sp.End, Text: refedit.Quote(g)},
			refedit.Change{Pointer: "/source/path", Field: FieldImportSource, Old: refedit.Unquote(sp.Raw), New: g})
	}
	return to
}

// renameManifest rewrites a renamed cohort's index manifest (its
// "cohort" and every "index_path" name the cohort's file name).
func (pl *planner) renameManifest(rel, gpath, oldBase, newBase string) error {
	man := rel + ".indexes.json"
	src, err := os.ReadFile(pl.ws(man))
	if err != nil {
		return nil // no manifest
	}
	root, err := jsonfmt.Parse(src)
	if err != nil {
		pl.warn("invalid_json", man, "", "the index manifest is not JSON: moved as it is")
		return nil
	}
	var edits []refedit.Edit
	var changes []refedit.Change
	rename := func(n *jsonfmt.Node, ptr string) {
		if n == nil || n.Kind != jsonfmt.String {
			return
		}
		v := refedit.Unquote(n.Raw)
		if v != oldBase && !strings.HasPrefix(v, oldBase+".") {
			return
		}
		nv := newBase + strings.TrimPrefix(v, oldBase)
		edits = append(edits, refedit.Edit{Start: n.Start, End: n.End, Text: refedit.Quote(nv)})
		changes = append(changes, refedit.Change{Pointer: ptr, Field: FieldIndexName, Old: v, New: nv})
	}
	rename(refedit.Member(root, "cohort"), "/cohort")
	if list := refedit.Member(root, "indexes"); list != nil && list.Kind == jsonfmt.Array {
		for i, e := range list.Items {
			rename(refedit.Member(e, "index_path"), "/indexes/"+strconv.Itoa(i)+"/index_path")
		}
	}
	pl.addRewrite(pl.wsRel+"/"+man, gpath+".indexes.json", src, edits, changes)
	return nil
}

// ------------------------------------------------------------------ schema

func (pl *planner) schema() error {
	name, ok := importer.SchemaName(pl.req.Name)
	if !ok {
		return &InvalidError{Code: "invalid_name", Field: "name", Message: "name must be a saved schema's name"}
	}
	local := importer.SchemaPath(name)
	if info, err := os.Lstat(pl.ws(local)); err != nil || !info.Mode().IsRegular() {
		return &NotFoundError{Kind: "schema", Path: local}
	}
	it, err := pl.promoteSchema(name, local, strings.TrimSpace(pl.req.NewName), "new_name")
	if err != nil {
		return err
	}
	pl.p.Item = *it
	pl.p.Commits = Commits{
		Workspace: "studio: make schema " + local + " global" + renamedAs(it.GlobalPath, local),
		Global:    "studio: make schema " + it.GlobalPath + " global (from workspace " + pl.p.Workspace + ")",
	}
	if it.Action == ActionMerge {
		pl.p.Commits.Global = ""
	}
	return nil
}

// promoteSchema moves a workspace schema to the global schemas/ (merged
// with an identical global one) and points the workspace's import specs
// that use it at "_global/schemas/..." (a promoted cohort's own spec is
// rewritten by the caller).
func (pl *planner) promoteSchema(name, local, newName, field string) (*Item, error) {
	gname := name
	if newName != "" {
		n, ok := importer.SchemaName(newName)
		if !ok {
			return nil, &InvalidError{Code: "invalid_name", Field: field, Message: field + " must be letters, digits, '.', '-' or '_' (starting with a letter or digit)"}
		}
		gname = n
	}
	gpath := importer.SchemaPath(gname)
	action := ActionMove
	if exists(pl.gl(gpath)) {
		if !sameFile(pl.ws(local), pl.gl(gpath)) {
			return nil, &ClashError{Item: KindSchema, Name: gname, Existing: gpath, Field: field,
				Suggested: freeName(gname, func(n string) bool { return !exists(pl.gl(importer.SchemaPath(n))) })}
		}
		action = ActionMerge
	}
	pl.move(local, gpath, MoveSchema, action)
	pl.moved[local] = gpath
	it := &Item{Kind: KindSchema, Name: name, GlobalName: gname, Path: local, GlobalPath: gpath, RefPath: library.GlobalPrefix + "/" + gpath, Action: action}
	// The workspace's other specs that use it.
	for _, spec := range pl.specs {
		src := pl.specText[spec]
		if src == nil || spec == pl.promoted {
			continue
		}
		root, err := jsonfmt.Parse(src)
		if err != nil {
			continue
		}
		sc := refedit.Member(root, "schema")
		ref, pth := refedit.Member(sc, "ref"), refedit.Member(sc, "path")
		if ref == nil || ref.Kind != jsonfmt.String || refedit.Unquote(ref.Raw) != name {
			continue
		}
		if pth != nil && (pth.Kind != jsonfmt.String || refedit.Unquote(pth.Raw) != local) {
			continue // another area's schema of that name
		}
		to := library.GlobalPrefix + "/" + gpath
		if gname != name {
			pl.specEdit(spec, refedit.Edit{Start: ref.Start, End: ref.End, Text: refedit.Quote(gname)},
				refedit.Change{Pointer: "/schema/ref", Field: FieldImportSchema, Old: name, New: gname})
		}
		if pth != nil {
			pl.specEdit(spec, refedit.Edit{Start: pth.Start, End: pth.End, Text: refedit.Quote(to)},
				refedit.Change{Pointer: "/schema/path", Field: FieldImportSchema, Old: local, New: to})
		} else {
			pl.specEdit(spec, refedit.Edit{Start: ref.End, End: ref.End, Text: `, "path": ` + refedit.Quote(to)},
				refedit.Change{Pointer: "/schema/path", Field: FieldImportSchema, Old: "", New: to})
		}
	}
	return it, nil
}

// ------------------------------------------------------------------ helpers

// loadSpecs reads the workspace's import specs.
func (pl *planner) loadSpecs() error {
	entries, err := os.ReadDir(pl.ws(importer.ImportsDir))
	if err != nil {
		return nil
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), importer.SpecSuffix) || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		rel := importer.ImportsDir + "/" + e.Name()
		data, err := os.ReadFile(pl.ws(rel))
		if err != nil || int64(len(data)) > workspace.MaxRequestBytes {
			continue
		}
		pl.specs = append(pl.specs, rel)
		pl.specText[rel] = data
	}
	sort.Strings(pl.specs)
	return nil
}

// specOf is the import spec that builds a cohort ("" when none): the
// one named after it first, else the first whose target is it.
func (pl *planner) specOf(cohort string) string {
	want := importer.SpecPath(cohort)
	var found string
	for _, s := range pl.specs {
		if t, err := workspace.SpecTarget(pl.ws(s)); err == nil && t == cohort {
			if s == want {
				return s
			}
			if found == "" {
				found = s
			}
		}
	}
	return found
}

// rewriteAnalyses plans the reference rewrites of every analysis of the
// workspace that names the cohort at rel.
func (pl *planner) rewriteAnalyses(rel, to string) error {
	listing, err := workspace.ListWith(pl.wsDir, workspace.ListOptions{})
	if err != nil {
		return err
	}
	if listing.Truncated {
		pl.warn("listing_truncated", "", "", "the workspace has more files than the studio lists: analyses past the limit are not rewritten")
	}
	m := &cohortMapper{dir: pl.wsDir, from: rel, to: to}
	for _, f := range listing.Files {
		switch f.Kind {
		case workspace.KindRequest, workspace.KindCompose, workspace.KindFacet, workspace.KindChain:
		default:
			continue
		}
		src, err := os.ReadFile(pl.ws(f.Path))
		if err != nil {
			pl.warn("unreadable", f.Path, "", err.Error())
			continue
		}
		out, w, err := refedit.Rewrite(src, f.Path, m, refedit.Analysis)
		if err != nil {
			code := "invalid_json"
			if w != nil {
				code = "rewrite_failed"
			}
			pl.warn(code, f.Path, "", err.Error())
			continue
		}
		if out == nil {
			continue
		}
		pl.p.Rewrites = append(pl.p.Rewrites, Rewrite{Path: pl.wsRel + "/" + f.Path, Changes: w.Changes, before: src, after: out})
		pl.p.Counts.Analyses++
		pl.p.wsPaths = append(pl.p.wsPaths, f.Path)
	}
	return nil
}

// cohortMapper sends the references that resolve to one cohort to its
// new path; every other reference stays as it is, silently.
type cohortMapper struct{ dir, from, to string }

func (m *cohortMapper) Map(_ string, cands []string) (string, string, *refedit.Issue) {
	found, ok := refedit.FirstFile(m.dir, cands)
	if !ok || found != m.from {
		return "", "", nil
	}
	return found, m.to, nil
}

// move records a promoted file (workspace path → global path).
func (pl *planner) move(from, to, kind, action string) {
	pl.p.Moves = append(pl.p.Moves, Move{From: pl.wsRel + "/" + from, To: to, Kind: kind, Action: action})
	pl.claimed[to] = true
	pl.p.wsPaths = append(pl.p.wsPaths, from)
	// The global repository gets the moved JSON (studio versions JSON:
	// specs, schemas and any sidecar JSON a workspace snapshot tracked);
	// ignored files (cohorts, sources) are skipped by the commit itself.
	if action == ActionMove && strings.HasSuffix(strings.ToLower(to), ".json") {
		pl.p.glPaths = append(pl.p.glPaths, to)
	}
}

func (pl *planner) specEdit(spec string, e refedit.Edit, c refedit.Change) {
	pl.specEdits[spec] = append(pl.specEdits[spec], e)
	pl.specChange[spec] = append(pl.specChange[spec], c)
}

// finishSpecs turns the edits of the workspace's remaining specs into
// rewrites.
func (pl *planner) finishSpecs() {
	for _, spec := range pl.specs {
		if len(pl.specEdits[spec]) == 0 || pl.specText[spec] == nil {
			continue
		}
		pl.addRewrite(pl.wsRel+"/"+spec, "", pl.specText[spec], pl.specEdits[spec], pl.specChange[spec])
		pl.p.wsPaths = append(pl.p.wsPaths, spec)
	}
}

// addRewrite records a rewrite of src; at is its library path before
// the promotion, to its global path when it moves ("" when it stays).
func (pl *planner) addRewrite(at, to string, src []byte, edits []refedit.Edit, changes []refedit.Change) {
	if len(edits) == 0 {
		return
	}
	out := refedit.Splice(src, edits)
	if _, err := jsonfmt.Parse(out); err != nil {
		pl.p.Warnings = append(pl.p.Warnings, refedit.Issue{Code: "rewrite_failed", Path: at, Message: err.Error()})
		return
	}
	r := Rewrite{Path: at, Changes: changes, before: src, after: out}
	if to != "" {
		r.Path, r.From = to, at
	}
	pl.p.Rewrites = append(pl.p.Rewrites, r)
}

// warn records a warning about a workspace file (p workspace-relative).
func (pl *planner) warn(code, p, ref, msg string) {
	if p != "" {
		p = pl.wsRel + "/" + p
	}
	pl.p.Warnings = append(pl.p.Warnings, refedit.Issue{Code: code, Path: p, Ref: ref, Message: msg})
}

func (pl *planner) ws(rel string) string { return filepath.Join(pl.wsDir, filepath.FromSlash(rel)) }
func (pl *planner) gl(rel string) string { return filepath.Join(pl.libDir, filepath.FromSlash(rel)) }

func renamedAs(to, from string) string {
	if path.Base(to) == path.Base(from) {
		return ""
	}
	return " as " + to
}

func exists(abs string) bool {
	_, err := os.Lstat(abs)
	return err == nil
}

// sameFile reports two files with identical bytes.
func sameFile(a, b string) bool {
	ha, ea := hashFile(a)
	hb, eb := hashFile(b)
	return ea == nil && eb == nil && ha == hb
}

func hashFile(p string) (string, error) {
	sum, _, err := importer.HashFile(p)
	return sum, err
}

// freeName is the first of name-2, name-3, ... that free accepts.
func freeName(name string, free func(string) bool) string {
	for i := 2; i < 10000; i++ {
		n := name + "-" + strconv.Itoa(i)
		if free(n) {
			return n
		}
	}
	return name + "-copy"
}

// splitExt splits "orders.csv" into "orders", ".csv" (and keeps
// compound extensions like ".pulse.zst" whole).
func splitExt(base string) (string, string) {
	i := strings.Index(base[1:], ".")
	if i < 0 {
		return base, ""
	}
	return base[:i+1], base[i+1:]
}

func (p *Plan) fingerprint() string {
	h := sha256.New()
	enc := json.NewEncoder(h)
	_ = enc.Encode([]any{p.Kind, p.Workspace, p.Item, p.Schema, p.Moves})
	for _, r := range p.Rewrites {
		fmt.Fprintf(h, "%s\x00%s\x00%x\x00%x\n", r.Path, r.From, sha256.Sum256(r.before), sha256.Sum256(r.after))
	}
	for _, m := range p.Moves {
		if info, err := os.Lstat(filepath.Join(p.libDir, filepath.FromSlash(m.From))); err == nil {
			fmt.Fprintf(h, "%s\x00%d\x00%d\n", m.From, info.Size(), info.ModTime().UnixNano())
		}
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}
