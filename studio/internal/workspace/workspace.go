// Package workspace lists and classifies the files in the Studio's scoped
// directory: which JSON files are Pulse requests (and of which root type),
// which are cohorts, and which the Studio cannot open.
package workspace

import (
	"encoding/json"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

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
)

// MaxRequestBytes bounds how much of a JSON file is read to classify it.
// Larger files are never hand-authored requests.
const MaxRequestBytes = 4 << 20

// MaxEntries bounds a directory listing so a huge tree cannot stall the UI.
const MaxEntries = 5000

// File is one entry of a listing. Path is slash-separated and relative to
// the scoped root. Reason explains an unopenable classification.
type File struct {
	Path   string `json:"path"`
	Kind   Kind   `json:"kind"`
	Reason string `json:"reason,omitempty"`
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
func List(dir string) (*Listing, error) {
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
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		lower := strings.ToLower(name)
		if !strings.HasSuffix(lower, ".json") && !strings.HasSuffix(lower, ".pulse") {
			return nil
		}
		if len(out.Files) >= MaxEntries {
			out.Truncated = true
			return fs.SkipAll
		}
		rel, err := filepath.Rel(dir, p)
		if err != nil {
			return nil
		}
		out.Files = append(out.Files, classifyFile(p, filepath.ToSlash(rel), d))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out.Files, func(i, j int) bool { return out.Files[i].Path < out.Files[j].Path })
	return out, nil
}

func classifyFile(abs, rel string, d fs.DirEntry) File {
	f := File{Path: rel}
	if kind, reason, ok := classifyName(rel); ok {
		f.Kind, f.Reason = kind, reason
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
