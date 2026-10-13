package migrate

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
)

// resolver finds the legacy file a reference points at and where it
// moves.
type resolver struct {
	dir  string
	dest map[string]Move // legacy rel → move (workspace-relative To)
}

// candidates mirrors the studio's cohort resolution
// (server.cohortCandidates): data_dir + "/" + filename against the
// root, then the request's directory, then its parent.
func candidates(requestPath, dataDir, filename string) []string {
	reqDir := slashDir(requestPath)
	var out []string
	for _, base := range []string{"", reqDir, slashDir(reqDir)} {
		if p, ok := normalizeRel(base + "/" + dataDir + "/" + filename); ok && !contains(out, p) {
			out = append(out, p)
		}
	}
	return out
}

// resolve returns the first candidate that is an existing file.
func (r *resolver) resolve(cands []string) (string, bool) {
	for _, c := range cands {
		if info, err := os.Stat(filepath.Join(r.dir, filepath.FromSlash(c))); err == nil && info.Mode().IsRegular() {
			return c, true
		}
	}
	return "", false
}

// newPath is where a legacy file ends up, workspace-relative. ok is
// false when it does not move into the workspace (.studio, .git).
func (r *resolver) newPath(rel string) (string, bool) {
	if m, ok := r.dest[rel]; ok {
		return m.To, true
	}
	for d := slashDir(rel); d != ""; d = slashDir(d) {
		if m, ok := r.dest[d]; ok && m.Dir {
			return m.To + rel[len(d):], true
		}
	}
	return "", false
}

// edit replaces src[start:end] with text.
type edit struct {
	start, end int
	text       string
}

// splice applies non-overlapping edits; every other byte is kept.
func splice(src []byte, edits []edit) []byte {
	sorted := append([]edit(nil), edits...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].start < sorted[j].start })
	var b bytes.Buffer
	pos := 0
	for _, e := range sorted {
		b.Write(src[pos:e.start])
		b.WriteString(e.text)
		pos = e.end
	}
	b.Write(src[pos:])
	return b.Bytes()
}

// refWalk collects a document's references, their edits and warnings.
type refWalk struct {
	res     *resolver
	from    string // the document's legacy path
	edits   []edit
	changes []RefChange
	issues  []Issue
	refs    int
}

func (w *refWalk) warn(code, ptr, ref, msg string) {
	w.issues = append(w.issues, Issue{Code: code, Pointer: ptr, Ref: ref, Message: msg})
}

// target resolves a reference and returns the workspace-relative path
// it must name after the move ("" + a warning when it stays as it is).
func (w *refWalk) target(ptr, written string, cands []string) (resolved, to string) {
	w.refs++
	if len(cands) == 0 {
		w.warn("ref_unresolvable", ptr, written, "the reference is absolute or escapes the folder: left as it is")
		return "", ""
	}
	found, ok := w.res.resolve(cands)
	if !ok {
		w.warn("ref_missing", ptr, written, "no file at "+strings.Join(cands, ", ")+": the reference is left as it is")
		return "", ""
	}
	to, ok = w.res.newPath(found)
	if !ok {
		w.warn("ref_outside", ptr, written, found+" does not move into the workspace: the reference is left as it is")
		return "", ""
	}
	return found, to
}

// refsOfAnalysis finds every cohort reference of a request document,
// at any depth: {"cohort": {filename, data_dir}} (requests, compose
// slots, fits, chain stages, facets), joins[].right and an overlay's
// ref.population.cohort.
func refsOfAnalysis(n *jsonfmt.Node, w *refWalk) { w.node(n, "") }

func (w *refWalk) node(n *jsonfmt.Node, ptr string) {
	switch n.Kind {
	case jsonfmt.Object:
		for _, m := range n.Members {
			key := unquote(m.Key)
			p := ptr + "/" + escapePointer(key)
			switch {
			case key == "cohort" && m.Value.Kind == jsonfmt.Object:
				w.cohort(m.Value, p)
			case key == "joins" && m.Value.Kind == jsonfmt.Array:
				for i, j := range m.Value.Items {
					if right := member(j, "right"); right != nil && right.Kind == jsonfmt.String {
						w.path(right, p+"/"+strconv.Itoa(i)+"/right", FieldJoin)
					}
				}
			case key == "population" && m.Value.Kind == jsonfmt.Object:
				if c := member(m.Value, "cohort"); c != nil && c.Kind == jsonfmt.String {
					w.path(c, p+"/cohort", FieldPopulation)
				}
			}
			w.node(m.Value, p)
		}
	case jsonfmt.Array:
		for i, it := range n.Items {
			w.node(it, ptr+"/"+strconv.Itoa(i))
		}
	}
}

// cohort rewrites a {filename, data_dir} object so that data_dir +
// "/" + filename is the cohort's new workspace path: data_dir alone
// changes when the filename still fits (it may carry a subdirectory or
// a shard anchor), else both. A missing data_dir is inserted after
// filename.
func (w *refWalk) cohort(obj *jsonfmt.Node, ptr string) {
	fn := member(obj, "filename")
	if fn == nil || fn.Kind != jsonfmt.String {
		return
	}
	filename := unquote(fn.Raw)
	if filename == "" {
		return
	}
	dd := member(obj, "data_dir")
	dataDir := "."
	if dd != nil {
		if dd.Kind != jsonfmt.String {
			w.refs++
			w.warn("ref_unresolvable", ptr, filename, "data_dir is not a string: left as it is")
			return
		}
		dataDir = unquote(dd.Raw)
	}
	written := filename
	if dd != nil {
		written = dataDir + "/" + filename
	}
	archive, anchor := filename, ""
	if a, s, ok := strings.Cut(filename, "#"); ok && a != "" && s != "" {
		archive, anchor = a, "#"+s
	}
	var cands []string
	if !isAbsPath(dataDir) && !isAbsPath(archive) {
		cands = candidates(w.from, dataDir, archive)
	}
	found, to := w.target(ptr, written, cands)
	if to == "" {
		return
	}
	newFile, newDir := filename, ""
	if strings.HasSuffix(to, "/"+archive) {
		newDir = strings.TrimSuffix(to, "/"+archive)
	} else {
		newFile, newDir = baseName(to)+anchor, slashDir(to)
		if newDir == "" {
			newDir = "."
		}
	}
	if dd != nil && newDir == dataDir && newFile == filename {
		return
	}
	if newFile != filename {
		w.edits = append(w.edits, edit{fn.Start, fn.End, quote(newFile)})
	}
	if dd != nil {
		w.edits = append(w.edits, edit{dd.Start, dd.End, quote(newDir)})
	} else {
		w.edits = append(w.edits, edit{fn.End, fn.End, `, "data_dir": ` + quote(newDir)})
	}
	w.changes = append(w.changes, RefChange{Pointer: ptr, Field: FieldCohort, Old: written, New: newDir + "/" + newFile, Resolved: found})
}

// path rewrites a cohort path string (join right side, population
// cohort), read like a request cohort with data_dir ".", to the
// cohort's new workspace path.
func (w *refWalk) path(n *jsonfmt.Node, ptr, field string) {
	written := unquote(n.Raw)
	if written == "" {
		return
	}
	archive, anchor := written, ""
	if a, s, ok := strings.Cut(written, "#"); ok && a != "" && s != "" {
		archive, anchor = a, "#"+s
	}
	var cands []string
	if !isAbsPath(archive) {
		cands = candidates(w.from, ".", archive)
	}
	found, to := w.target(ptr, written, cands)
	if to == "" || to+anchor == written {
		return
	}
	w.edits = append(w.edits, edit{n.Start, n.End, quote(to + anchor)})
	w.changes = append(w.changes, RefChange{Pointer: ptr, Field: field, Old: written, New: to + anchor, Resolved: found})
}

// refsOfImport rewrites an import spec's target (a root-relative cohort
// path) to the cohort's new workspace path.
func refsOfImport(n *jsonfmt.Node, w *refWalk) {
	t := member(n, "target")
	if t == nil || t.Kind != jsonfmt.String {
		return
	}
	written := unquote(t.Raw)
	var cands []string
	if p, ok := normalizeRel(written); ok && !isAbsPath(written) {
		cands = []string{p}
	}
	found, to := w.target("/target", written, cands)
	if to == "" || to == written {
		return
	}
	w.edits = append(w.edits, edit{t.Start, t.End, quote(to)})
	w.changes = append(w.changes, RefChange{Pointer: "/target", Field: FieldImportTarget, Old: written, New: to, Resolved: found})
}

func member(n *jsonfmt.Node, key string) *jsonfmt.Node {
	if n == nil || n.Kind != jsonfmt.Object {
		return nil
	}
	var found *jsonfmt.Node
	for _, m := range n.Members {
		if unquote(m.Key) == key {
			found = m.Value // last one wins, as in encoding/json
		}
	}
	return found
}

func unquote(raw string) string {
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return raw
	}
	return s
}

// quote is a JSON string literal without HTML escaping.
func quote(s string) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimSuffix(b.String(), "\n")
}

func escapePointer(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1")
}

func isAbsPath(p string) bool {
	return strings.HasPrefix(p, "/") || strings.HasPrefix(p, `\`) ||
		(len(p) >= 2 && p[1] == ':' && ((p[0] >= 'A' && p[0] <= 'Z') || (p[0] >= 'a' && p[0] <= 'z')))
}

func slashDir(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return ""
	}
	return p[:i]
}

func baseName(p string) string { return p[strings.LastIndex(p, "/")+1:] }

// normalizeRel resolves "." and ".." in a relative slash path; false if
// it escapes the root or is empty.
func normalizeRel(p string) (string, bool) {
	var stack []string
	for _, seg := range strings.Split(p, "/") {
		switch seg {
		case "", ".":
		case "..":
			if len(stack) == 0 {
				return "", false
			}
			stack = stack[:len(stack)-1]
		default:
			stack = append(stack, seg)
		}
	}
	if len(stack) == 0 {
		return "", false
	}
	return strings.Join(stack, "/"), true
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
