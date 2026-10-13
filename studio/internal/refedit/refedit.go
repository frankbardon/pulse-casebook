// Package refedit finds and rewrites the cohort references of studio
// JSON documents losslessly: edits are byte splices over the spans
// jsonfmt.Parse records, so every other byte of a file (formatting,
// key order, escapes, line endings) is kept.
//
// References found in an analysis (any request root, at any depth):
//
//	{"cohort": {"filename", "data_dir"}}   requests, compose slots, fits, chain stages, facets
//	joins[].right                          a join's right-hand cohort path
//	population.cohort                      an overlay's population cohort path
//
// and in an import spec, its "target". Where a reference goes is decided
// by a Mapper: the legacy-folder migration (internal/migrate) moves every
// cohort into a workspace, a promotion (internal/promote) moves one
// workspace cohort into the global area.
package refedit

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

// Reference fields (Change.Field).
const (
	FieldCohort       = "cohort"        // {filename, data_dir}
	FieldJoin         = "join"          // joins[].right
	FieldPopulation   = "population"    // overlays ref.population.cohort
	FieldImportTarget = "import_target" // import spec target
)

// Change is one rewritten reference. Old and New are the reference as
// written (cohorts: data_dir + "/" + filename); Resolved is the file it
// pointed at.
type Change struct {
	Pointer  string `json:"pointer"`
	Field    string `json:"field"`
	Old      string `json:"old"`
	New      string `json:"new"`
	Resolved string `json:"resolved"`
}

// Issue is a reference left as it is (or any other remark a caller
// reports about a file).
type Issue struct {
	Code    string `json:"code"`
	Path    string `json:"path,omitempty"`
	Pointer string `json:"pointer,omitempty"`
	Ref     string `json:"ref,omitempty"`
	Message string `json:"message"`
}

// Mapper decides where a reference goes. cands are the root-relative
// files the reference may name, in the studio's resolution order (empty
// when it is absolute or escapes the root). Map returns the file it
// resolves to and the root-relative path the reference must name from
// now on; to == "" leaves it as it is, issue (optional) saying why.
type Mapper interface {
	Map(written string, cands []string) (found, to string, issue *Issue)
}

// Edit replaces src[Start:End] with Text.
type Edit struct {
	Start, End int
	Text       string
}

// Splice applies non-overlapping edits; every other byte is kept.
func Splice(src []byte, edits []Edit) []byte {
	sorted := append([]Edit(nil), edits...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Start < sorted[j].Start })
	var b bytes.Buffer
	pos := 0
	for _, e := range sorted {
		b.Write(src[pos:e.Start])
		b.WriteString(e.Text)
		pos = e.End
	}
	b.Write(src[pos:])
	return b.Bytes()
}

// Walk collects a document's references, their edits and issues.
type Walk struct {
	Mapper Mapper
	// From is the document's root-relative path (requests resolve
	// cohorts against their own directory too).
	From    string
	Edits   []Edit
	Changes []Change
	Issues  []Issue
	// Refs counts the references visited.
	Refs int
}

// Rewrite parses src, lets find visit it with a Walk and returns the
// spliced document (nil when nothing changes). A result that no longer
// parses is an error: such a file is never written.
func Rewrite(src []byte, from string, m Mapper, find func(*Walk, *jsonfmt.Node)) ([]byte, *Walk, error) {
	root, err := jsonfmt.Parse(src)
	if err != nil {
		return nil, nil, err
	}
	w := &Walk{Mapper: m, From: from}
	find(w, root)
	if len(w.Edits) == 0 {
		return nil, w, nil
	}
	out := Splice(src, w.Edits)
	if _, err := jsonfmt.Parse(out); err != nil {
		return nil, w, err
	}
	return out, w, nil
}

func (w *Walk) target(ptr, written string, cands []string) (found, to string) {
	w.Refs++
	found, to, issue := w.Mapper.Map(written, cands)
	if issue != nil {
		is := *issue
		is.Pointer = ptr
		if is.Ref == "" {
			is.Ref = written
		}
		w.Issues = append(w.Issues, is)
	}
	if to == "" {
		return "", ""
	}
	return found, to
}

func (w *Walk) warn(code, ptr, ref, msg string) {
	w.Issues = append(w.Issues, Issue{Code: code, Pointer: ptr, Ref: ref, Message: msg})
}

// Analysis visits every cohort reference of a request document, at any
// depth: {"cohort": {filename, data_dir}} (requests, compose slots,
// fits, chain stages, facets), joins[].right and an overlay's
// ref.population.cohort.
func Analysis(w *Walk, n *jsonfmt.Node) { w.node(n, "") }

func (w *Walk) node(n *jsonfmt.Node, ptr string) {
	switch n.Kind {
	case jsonfmt.Object:
		for _, m := range n.Members {
			key := Unquote(m.Key)
			p := ptr + "/" + EscapePointer(key)
			switch {
			case key == "cohort" && m.Value.Kind == jsonfmt.Object:
				w.cohort(m.Value, p)
			case key == "joins" && m.Value.Kind == jsonfmt.Array:
				for i, j := range m.Value.Items {
					if right := Member(j, "right"); right != nil && right.Kind == jsonfmt.String {
						w.path(right, p+"/"+strconv.Itoa(i)+"/right", FieldJoin)
					}
				}
			case key == "population" && m.Value.Kind == jsonfmt.Object:
				if c := Member(m.Value, "cohort"); c != nil && c.Kind == jsonfmt.String {
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

// cohort rewrites a {filename, data_dir} object so that data_dir + "/"
// + filename is the cohort's new path: data_dir alone changes when the
// filename still fits (it may carry a subdirectory or a shard anchor),
// else both. A missing data_dir is inserted after filename.
func (w *Walk) cohort(obj *jsonfmt.Node, ptr string) {
	fn := Member(obj, "filename")
	if fn == nil || fn.Kind != jsonfmt.String {
		return
	}
	filename := Unquote(fn.Raw)
	if filename == "" {
		return
	}
	dd := Member(obj, "data_dir")
	dataDir := "."
	if dd != nil {
		if dd.Kind != jsonfmt.String {
			w.Refs++
			w.warn("ref_unresolvable", ptr, filename, "data_dir is not a string: left as it is")
			return
		}
		dataDir = Unquote(dd.Raw)
	}
	written := filename
	if dd != nil {
		written = dataDir + "/" + filename
	}
	archive, anchor := SplitAnchor(filename)
	var cands []string
	if !IsAbsPath(dataDir) && !IsAbsPath(archive) {
		cands = Candidates(w.From, dataDir, archive)
	}
	found, to := w.target(ptr, written, cands)
	if to == "" {
		return
	}
	newFile, newDir := filename, ""
	if strings.HasSuffix(to, "/"+archive) {
		newDir = strings.TrimSuffix(to, "/"+archive)
	} else {
		newFile, newDir = BaseName(to)+anchor, SlashDir(to)
		if newDir == "" {
			newDir = "."
		}
	}
	if dd != nil && newDir == dataDir && newFile == filename {
		return
	}
	if newFile != filename {
		w.Edits = append(w.Edits, Edit{fn.Start, fn.End, Quote(newFile)})
	}
	if dd != nil {
		w.Edits = append(w.Edits, Edit{dd.Start, dd.End, Quote(newDir)})
	} else {
		w.Edits = append(w.Edits, Edit{fn.End, fn.End, `, "data_dir": ` + Quote(newDir)})
	}
	w.Changes = append(w.Changes, Change{Pointer: ptr, Field: FieldCohort, Old: written, New: newDir + "/" + newFile, Resolved: found})
}

// path rewrites a cohort path string (join right side, population
// cohort), read like a request cohort with data_dir ".", to the
// cohort's new path.
func (w *Walk) path(n *jsonfmt.Node, ptr, field string) {
	written := Unquote(n.Raw)
	if written == "" {
		return
	}
	archive, anchor := SplitAnchor(written)
	var cands []string
	if !IsAbsPath(archive) {
		cands = Candidates(w.From, ".", archive)
	}
	found, to := w.target(ptr, written, cands)
	if to == "" || to+anchor == written {
		return
	}
	w.Edits = append(w.Edits, Edit{n.Start, n.End, Quote(to + anchor)})
	w.Changes = append(w.Changes, Change{Pointer: ptr, Field: field, Old: written, New: to + anchor, Resolved: found})
}

// ImportTarget visits an import spec's target (a root-relative cohort
// path).
func ImportTarget(w *Walk, n *jsonfmt.Node) {
	t := Member(n, "target")
	if t == nil || t.Kind != jsonfmt.String {
		return
	}
	written := Unquote(t.Raw)
	var cands []string
	if p, ok := NormalizeRel(written); ok && !IsAbsPath(written) {
		cands = []string{p}
	}
	found, to := w.target("/target", written, cands)
	if to == "" || to == written {
		return
	}
	w.Edits = append(w.Edits, Edit{t.Start, t.End, Quote(to)})
	w.Changes = append(w.Changes, Change{Pointer: "/target", Field: FieldImportTarget, Old: written, New: to, Resolved: found})
}

// Candidates mirrors the studio's cohort resolution
// (server.cohortCandidates): data_dir + "/" + filename against the
// root, then the request's directory, then its parent.
func Candidates(requestPath, dataDir, filename string) []string {
	reqDir := SlashDir(requestPath)
	var out []string
	for _, base := range []string{"", reqDir, SlashDir(reqDir)} {
		if p, ok := NormalizeRel(base + "/" + dataDir + "/" + filename); ok && !contains(out, p) {
			out = append(out, p)
		}
	}
	return out
}

// FirstFile returns the first candidate that is a regular file below
// dir.
func FirstFile(dir string, cands []string) (string, bool) {
	for _, c := range cands {
		if info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(c))); err == nil && info.Mode().IsRegular() {
			return c, true
		}
	}
	return "", false
}

// SplitAnchor splits a shard anchor off a cohort filename:
// "arch.pulse#s2.pulse" → ("arch.pulse", "#s2.pulse").
func SplitAnchor(filename string) (archive, anchor string) {
	if a, s, ok := strings.Cut(filename, "#"); ok && a != "" && s != "" {
		return a, "#" + s
	}
	return filename, ""
}

// Member is an object's member value (the last one of that key, as in
// encoding/json), nil when absent or n is not an object.
func Member(n *jsonfmt.Node, key string) *jsonfmt.Node {
	if n == nil || n.Kind != jsonfmt.Object {
		return nil
	}
	var found *jsonfmt.Node
	for _, m := range n.Members {
		if Unquote(m.Key) == key {
			found = m.Value
		}
	}
	return found
}

// Unquote decodes a JSON string literal (raw itself when it is not one).
func Unquote(raw string) string {
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return raw
	}
	return s
}

// Quote is a JSON string literal without HTML escaping.
func Quote(s string) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimSuffix(b.String(), "\n")
}

// EscapePointer escapes a JSON pointer token.
func EscapePointer(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1")
}

// IsAbsPath reports a slash or Windows absolute path.
func IsAbsPath(p string) bool {
	return strings.HasPrefix(p, "/") || strings.HasPrefix(p, `\`) ||
		(len(p) >= 2 && p[1] == ':' && ((p[0] >= 'A' && p[0] <= 'Z') || (p[0] >= 'a' && p[0] <= 'z')))
}

// SlashDir is the directory of a slash path ("" at the root).
func SlashDir(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return ""
	}
	return p[:i]
}

// BaseName is the last element of a slash path.
func BaseName(p string) string { return p[strings.LastIndex(p, "/")+1:] }

// NormalizeRel resolves "." and ".." in a relative slash path; false if
// it escapes the root or is empty.
func NormalizeRel(p string) (string, bool) {
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
