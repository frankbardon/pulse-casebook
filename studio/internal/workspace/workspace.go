// Package workspace lists and classifies the files in the Studio's scoped
// directory: which JSON files are Pulse requests (and of which root type),
// which are cohorts, and which the Studio cannot open.
package workspace

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	pio "github.com/frankbardon/pulse/io"
	"github.com/frankbardon/pulse/types"
)

// Kind is the classification of one workspace file.
type Kind string

// File kinds. Request, Compose, Facet and Chain are the four request roots
// the builder opens; Cohort is a .pulse data file; Unopenable is anything
// else the listing shows but the builder cannot edit.
const (
	KindRequest    Kind = "request"
	KindCompose    Kind = "compose"
	KindFacet      Kind = "facet"
	KindChain      Kind = "chain"
	KindCohort     Kind = "cohort"
	KindUnopenable Kind = "unopenable"

	// Import workspace layout (G1): schemas/<name>.schema.json saved
	// schemas, imports/<cohort>.import.json import specs, and any file
	// under sources/ (uploaded source data, gitignored).
	KindSchema Kind = "schema"
	KindImport Kind = "import"
	KindSource Kind = "source"
)

// Import spec states (File.State on KindImport entries).
const (
	// StateOK: the spec's target cohort exists.
	StateOK = "ok"
	// StateNeedsRebuild: the spec is in the workspace (and so in git)
	// but its .pulse is missing; POST /api/import/rebuild restores it.
	StateNeedsRebuild = "needs_rebuild"
	// StateInvalid: the spec cannot be read (Reason says why).
	StateInvalid = "invalid"
)

// MaxRequestBytes bounds how much of a JSON file is read to classify it.
// Larger files are never hand-authored requests.
const MaxRequestBytes = 4 << 20

// MaxEntries bounds a directory listing so a huge tree cannot stall the UI.
const MaxEntries = 5000

// File is one entry of a listing. Path is slash-separated and relative to
// the scoped root. Reason explains an unopenable classification.
//
// Import entries carry extra links: a source has its
// Format (pulse io.FormatFromPath, "" when unrecognised) and Size; an
// import spec its
// Target cohort and State; a cohort built by an import spec links back
// to it in Spec, so the UI can offer Rebuild.
type File struct {
	Path   string `json:"path"`
	Kind   Kind   `json:"kind"`
	Reason string `json:"reason,omitempty"`
	Format string `json:"format,omitempty"`
	Size   int64  `json:"size,omitempty"`
	Target string `json:"target,omitempty"`
	State  string `json:"state,omitempty"`
	Spec   string `json:"spec,omitempty"`
	// Scope is "global" for a global-area cohort listed in a library
	// workspace (Path "_global/..."); absent for the workspace's own.
	Scope string `json:"scope,omitempty"`
}

// Listing is the result of List.
type Listing struct {
	Files     []File `json:"files"`
	Truncated bool   `json:"truncated,omitempty"`
}

// sidecarSuffixes are JSON files that sit beside requests but are never
// requests themselves: layout sidecars and saved run/predict outputs.
var sidecarSuffixes = []string{".layout.json", ".out.json", ".predict.json"}

// Top-level key sets of each request root, derived from the engine's own
// types so they track the pinned Pulse version.
var (
	requestKeys = jsonKeys(reflect.TypeOf(types.Request{}))
	composeKeys = jsonKeys(reflect.TypeOf(types.ComposedRequest{}))
	chainKeys   = jsonKeys(reflect.TypeOf(types.ChainRequest{}))
	facetKeys   = jsonKeys(reflect.TypeOf(types.FacetRequest{}))
)

func jsonKeys(t reflect.Type) map[string]bool {
	keys := map[string]bool{}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if !f.IsExported() {
			continue
		}
		tag := f.Tag.Get("json")
		name, _, _ := strings.Cut(tag, ",")
		if name == "-" {
			continue
		}
		if f.Anonymous && name == "" {
			ft := f.Type
			if ft.Kind() == reflect.Pointer {
				ft = ft.Elem()
			}
			if ft.Kind() == reflect.Struct {
				for k := range jsonKeys(ft) {
					keys[k] = true
				}
				continue
			}
		}
		if name == "" {
			name = f.Name
		}
		keys[name] = true
	}
	return keys
}

// Classify decides the kind of a file from its name and, for JSON, its
// contents. name may be a path; only its base name is consulted.
func Classify(name string, data []byte) (Kind, string) {
	if kind, reason, ok := classifyName(name); ok {
		return kind, reason
	}
	return ClassifyJSON(data)
}

// classifyName decides what the file name alone can; ok is false when the
// contents must be read.
func classifyName(name string) (kind Kind, reason string, ok bool) {
	if kind, ok := classifyLayout(name); ok {
		return kind, "", true
	}
	base := strings.ToLower(path.Base(filepath.ToSlash(name)))
	if strings.HasSuffix(base, ".pulse") {
		return KindCohort, "", true
	}
	if !strings.HasSuffix(base, ".json") {
		return KindUnopenable, "not a JSON or .pulse file", true
	}
	for _, s := range sidecarSuffixes {
		if strings.HasSuffix(base, s) {
			return KindUnopenable, "sidecar or output file (" + s + ")", true
		}
	}
	return "", "", false
}

// classifyLayout recognises the import layout by root-relative path:
// sources/** (any file), schemas/*.schema.json and imports/*.import.json.
func classifyLayout(name string) (Kind, bool) {
	rel := filepath.ToSlash(name)
	dir, base := path.Split(rel)
	lower := strings.ToLower(base)
	switch {
	case strings.HasPrefix(rel, "sources/") && base != "":
		return KindSource, true
	case dir == "schemas/" && strings.HasSuffix(lower, ".schema.json"):
		return KindSchema, true
	case dir == "imports/" && strings.HasSuffix(lower, ".import.json"):
		return KindImport, true
	}
	return "", false
}

// ClassifyJSON detects the request root of a JSON document by its
// top-level keys: "requests" marks a ComposedRequest, "stages" a
// ChainRequest, "fields" a FacetRequest, and anything else is a plain
// Request. Every key must also belong to the detected root, so look-alikes
// (synth specs carry "fields", run envelopes carry "data") are unopenable.
func ClassifyJSON(data []byte) (Kind, string) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(data, &obj); err != nil || obj == nil {
		return KindUnopenable, "not a JSON object"
	}
	kind, keys := KindRequest, requestKeys
	switch {
	case has(obj, "requests"):
		kind, keys = KindCompose, composeKeys
	case has(obj, "stages"):
		kind, keys = KindChain, chainKeys
	case has(obj, "fields"):
		kind, keys = KindFacet, facetKeys
	}
	var unknown []string
	for k := range obj {
		if !keys[k] {
			unknown = append(unknown, k)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return KindUnopenable, "not a Pulse " + string(kind) + " request (unexpected keys: " + strings.Join(unknown, ", ") + ")"
	}
	return kind, ""
}

func has(obj map[string]json.RawMessage, key string) bool {
	_, ok := obj[key]
	return ok
}

// List walks dir and classifies every .json and .pulse file below it.
// Hidden entries and node_modules are skipped; symlinks are not followed.
// Files are returned sorted by path.
func List(dir string) (*Listing, error) { return ListWith(dir, ListOptions{}) }

// ListOptions tune ListWith.
type ListOptions struct {
	// Skip lists top-level directory names not walked (a library's
	// global area skips workspaces/).
	Skip []string
}

// ListWith is List with options.
func ListWith(dir string, opts ListOptions) (*Listing, error) {
	out := &Listing{Files: []File{}}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if p == dir {
				return err
			}
			return nil // unreadable subtree: skip it
		}
		name := d.Name()
		if p != dir && (strings.HasPrefix(name, ".") || name == "node_modules") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() && filepath.Dir(p) == dir {
			for _, s := range opts.Skip {
				if name == s {
					return filepath.SkipDir
				}
			}
		}
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		rel, err := filepath.Rel(dir, p)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		lower := strings.ToLower(name)
		if !strings.HasSuffix(lower, ".json") && !strings.HasSuffix(lower, ".pulse") && !strings.HasPrefix(rel, "sources/") {
			return nil
		}
		if len(out.Files) >= MaxEntries {
			out.Truncated = true
			return fs.SkipAll
		}
		out.Files = append(out.Files, classifyFile(p, rel, d))
		return nil
	})
	if err != nil {
		return nil, err
	}
	linkImports(dir, out.Files)
	sort.Slice(out.Files, func(i, j int) bool { return out.Files[i].Path < out.Files[j].Path })
	return out, nil
}

// linkImports reads each import spec's target: the spec gets Target and
// State (needs_rebuild when the cohort is missing), and the cohort, when
// listed, gets Spec.
func linkImports(dir string, files []File) {
	specOf := map[string]string{}
	for i := range files {
		f := &files[i]
		if f.Kind != KindImport {
			continue
		}
		target, err := SpecTarget(filepath.Join(dir, filepath.FromSlash(f.Path)))
		if err != nil {
			f.State, f.Reason = StateInvalid, err.Error()
			continue
		}
		f.Target = target
		f.State = StateNeedsRebuild
		if info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(target))); err == nil && info.Mode().IsRegular() {
			f.State = StateOK
		}
		if _, dup := specOf[target]; !dup {
			specOf[target] = f.Path
		}
	}
	for i := range files {
		if files[i].Kind == KindCohort {
			files[i].Spec = specOf[files[i].Path]
		}
	}
}

// SpecTarget reads an import spec's target cohort path (root-relative,
// slash-separated). Only the target is decoded here; package importer
// owns the full spec.
func SpecTarget(abs string) (string, error) {
	info, err := os.Stat(abs)
	if err != nil {
		return "", errors.New("unreadable")
	}
	if info.Size() > MaxRequestBytes {
		return "", errors.New("import spec too large")
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "", errors.New("unreadable")
	}
	var spec struct {
		Target string `json:"target"`
	}
	if err := json.Unmarshal(data, &spec); err != nil {
		return "", errors.New("import spec is not valid JSON")
	}
	t := path.Clean(spec.Target)
	if spec.Target == "" || !filepath.IsLocal(filepath.FromSlash(t)) || !strings.HasSuffix(strings.ToLower(t), ".pulse") {
		return "", errors.New("import spec has no valid target")
	}
	return t, nil
}

func classifyFile(abs, rel string, d fs.DirEntry) File {
	f := File{Path: rel}
	if kind, reason, ok := classifyName(rel); ok {
		f.Kind, f.Reason = kind, reason
		if kind == KindSource {
			f.Format = string(pio.FormatFromPath(rel))
			if info, err := d.Info(); err == nil {
				f.Size = info.Size()
			}
		}
		return f
	}
	if info, err := d.Info(); err == nil && info.Size() > MaxRequestBytes {
		f.Kind, f.Reason = KindUnopenable, "file too large to be a request"
		return f
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		f.Kind, f.Reason = KindUnopenable, "unreadable"
		return f
	}
	f.Kind, f.Reason = ClassifyJSON(data)
	return f
}

// LayoutSuffix marks a layout sidecar: foo.json keeps its node positions
// in foo.layout.json (foo.compose.json in foo.compose.layout.json).
const LayoutSuffix = ".layout.json"

// LayoutPath returns the sidecar path for a request path, or false when
// the path is not a request-shaped JSON file (not .json, or itself a
// sidecar or output file).
func LayoutPath(rel string) (string, bool) {
	lower := strings.ToLower(rel)
	if !strings.HasSuffix(lower, ".json") {
		return "", false
	}
	for _, s := range sidecarSuffixes {
		if strings.HasSuffix(lower, s) {
			return "", false
		}
	}
	return rel[:len(rel)-len(".json")] + LayoutSuffix, true
}
