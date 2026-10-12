// Package validate maps the engine's no-execute verdicts (Predict*,
// Explain) onto graph node paths.
//
// Engine errors name no JSON path: they carry details such as
// {"aggregation": "AGG_MEAN", "field": "revenu"}, {"window_index": 0},
// {"matrix": "matrices[0]"}, and on Compose / chain roots the slot
// ({"request": 1}) or stage ({"stage": 2}) they belong to. Locate turns
// those details back into the node path(s) of the request document that
// raised them, using the document itself to find the entry that holds the
// referenced field. Predict suggestions carry a Go struct path
// (["Aggregations", "2", "Field"]); SuggestionPath renders it in JSON
// names. Paths use the node id grammar of preview.FormatPath (the Go twin
// of the UI's nodePath.ts), so the UI attaches each issue to the nearest
// graph node whose id is a prefix of it.
package validate

import (
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strconv"
	"strings"

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/preview"
)

// Severity ranks an issue: error (predict refuses the request), warning
// (a suggestion with a proposed fix) or hint (an advisory, e.g. a
// streamable substitute, shown only in the node's hover text).
const (
	Error   = "error"
	Warning = "warning"
	Hint    = "hint"
)

// Issue is one finding attached to a node path ("" = the request root).
type Issue struct {
	Path       string  `json:"path"`
	Severity   string  `json:"severity"`
	Code       string  `json:"code,omitempty"`
	Message    string  `json:"message"`
	Current    any     `json:"current,omitempty"`
	Proposed   []any   `json:"proposed,omitempty"`
	Confidence float64 `json:"confidence,omitempty"`
}

// sectionKeys maps the detail keys an engine error uses to name the
// operator of a slot to the request section that holds it.
var sectionKeys = map[string]string{
	"feature":     "features",
	"filter":      "filterers",
	"filterer":    "filterers",
	"attribute":   "attributes",
	"group":       "groups",
	"grouper":     "groups",
	"aggregation": "aggregations",
	"aggregator":  "aggregations",
	"window":      "windows",
	"test":        "tests",
	"post_test":   "post_tests",
	"regression":  "regressions",
	"matrix":      "matrices",
	"overlay":     "overlays",
}

// indexKeys maps "<x>_index" detail keys to their section.
var indexKeys = map[string]string{
	"feature_index":     "features",
	"filter_index":      "filterers",
	"filterer_index":    "filterers",
	"attribute_index":   "attributes",
	"group_index":       "groups",
	"aggregation_index": "aggregations",
	"window_index":      "windows",
	"sort_index":        "sort",
	"test_index":        "tests",
	"post_test_index":   "post_tests",
	"regression_index":  "regressions",
	"matrix_index":      "matrices",
	"vector_index":      "vectors",
	"overlay_index":     "overlays",
}

// opSections are the array sections whose entries name an operator in
// "type", searched in this order when an error names only the operator.
var opSections = []string{
	"features", "filterers", "attributes", "groups", "aggregations", "windows",
	"tests", "post_tests", "regressions", "matrices", "vectors", "overlays",
}

// frameKeys are detail keys that select a frame, never a field value.
var frameKeys = map[string]bool{"request": true, "stage": true, "slot": true}

// Locate returns the node paths an engine error (its details) points at
// inside doc, a request document of rootKind (request, compose, chain,
// facet). It never returns an empty list: when nothing more specific is
// found the error belongs to its frame ("" for the root, "requests[1]"
// for a Compose slot, "stages[2].request" for a chain stage).
func Locate(doc map[string]any, rootKind string, details map[string]any) []string {
	base, frame := frameOf(doc, rootKind, details)
	if frame == nil {
		return []string{preview.FormatPath(base)}
	}
	at := func(rel ...preview.Segment) string {
		return preview.FormatPath(append(slices.Clone(base), rel...))
	}
	refs := fieldRefs(details)

	// An explicit index: windows[0], sort[2], post_tests[0].
	for _, k := range sortedKeys(details) {
		section, ok := indexKeys[k]
		if !ok {
			continue
		}
		i, ok := asInt(details[k])
		if !ok {
			continue
		}
		entry, ok := getAt(frame, preview.Key(section), preview.Index(i))
		if !ok {
			continue
		}
		return []string{at(refine(entry, refs, preview.Key(section), preview.Index(i))...)}
	}

	// A path spelled in a detail value: {"matrix": "matrices[0]"}.
	for _, k := range sortedKeys(details) {
		s, ok := details[k].(string)
		if !ok || !strings.ContainsAny(s, "[.") {
			continue
		}
		segs, err := preview.ParsePath(s)
		if err != nil || len(segs) == 0 {
			continue
		}
		if entry, ok := getAt(frame, segs...); ok {
			return []string{at(refine(entry, refs, segs...)...)}
		}
	}

	// The operator and the section it lives in, when the error names them.
	var sections []string
	op := ""
	for _, k := range sortedKeys(details) {
		if section, ok := sectionKeys[k]; ok {
			sections = append(sections, section)
			if s, ok := details[k].(string); ok {
				op = s
			}
		}
	}
	if t, ok := details["type"].(string); ok && op == "" {
		op = t
	}
	if len(sections) == 0 {
		sections = opSections
	}

	// Entries of those sections running op that hold a referenced field.
	var byRef, byOp []string
	for _, section := range sections {
		list, _ := frame[section].([]any)
		for i, e := range list {
			entry, ok := e.(map[string]any)
			if !ok {
				continue
			}
			if op != "" {
				if t, _ := entry["type"].(string); t != op {
					continue
				}
			}
			byOp = append(byOp, at(preview.Key(section), preview.Index(i)))
			if len(refs) == 0 {
				continue
			}
			if rel := refine(entry, refs, preview.Key(section), preview.Index(i)); len(rel) > 2 {
				byRef = append(byRef, at(rel...))
			}
		}
	}
	switch {
	case len(byRef) > 0:
		return byRef
	case op != "" && len(byOp) > 0 && (len(refs) == 0 || len(byOp) == 1):
		return byOp
	}

	// Anything else that names a referenced field: a facet "fields" list,
	// a crosstab, the weight. The first holder in document order wins.
	if len(refs) > 0 {
		if p := findValue(frame, refs); p != nil {
			return []string{at(p...)}
		}
	}
	return []string{preview.FormatPath(base)}
}

// fieldRef is a (detail key, field name) pair an error references.
type fieldRef struct{ key, value string }

// fieldRefs lists the string details that name fields: everything but
// the operator, frame and reason keys.
func fieldRefs(details map[string]any) []fieldRef {
	var out []fieldRef
	for _, k := range sortedKeys(details) {
		if k == "type" || k == "reason" || k == "code" || frameKeys[k] || sectionKeys[k] != "" || indexKeys[k] != "" {
			continue
		}
		if s, ok := details[k].(string); ok && s != "" {
			out = append(out, fieldRef{k, s})
		}
	}
	return out
}

// refine narrows an entry path to the value inside it a referenced field
// sits at: entry[key] when that holds the name, else the first nested
// string equal to one. It returns prefix alone when nothing matches.
func refine(entry any, refs []fieldRef, prefix ...preview.Segment) []preview.Segment {
	obj, ok := entry.(map[string]any)
	if !ok {
		return prefix
	}
	for _, r := range refs {
		switch v := obj[r.key].(type) {
		case string:
			if v == r.value {
				return append(slices.Clone(prefix), preview.Key(r.key))
			}
		case []any:
			for i, x := range v {
				if s, ok := x.(string); ok && s == r.value {
					return append(slices.Clone(prefix), preview.Key(r.key), preview.Index(i))
				}
			}
		}
	}
	if p := findValue(obj, refs); p != nil {
		return append(slices.Clone(prefix), p...)
	}
	return prefix
}

// findValue is the path of the first string (document key order is not
// kept by a Go map, so keys are walked sorted) equal to a ref value.
func findValue(v any, refs []fieldRef) []preview.Segment {
	switch x := v.(type) {
	case string:
		for _, r := range refs {
			if x == r.value {
				return []preview.Segment{}
			}
		}
	case []any:
		for i, e := range x {
			if p := findValue(e, refs); p != nil {
				return append([]preview.Segment{preview.Index(i)}, p...)
			}
		}
	case map[string]any:
		for _, k := range sortedKeys(x) {
			if k == "type" || k == "cohort" || k == "label" || k == "name" {
				continue
			}
			if p := findValue(x[k], refs); p != nil {
				return append([]preview.Segment{preview.Key(k)}, p...)
			}
		}
	}
	return nil
}

// frameOf picks the request frame an error belongs to.
func frameOf(doc map[string]any, rootKind string, details map[string]any) ([]preview.Segment, map[string]any) {
	switch rootKind {
	case "compose":
		if i, ok := asInt(details["request"]); ok {
			if f, ok := getAt(doc, preview.Key("requests"), preview.Index(i)); ok {
				m, _ := f.(map[string]any)
				return []preview.Segment{preview.Key("requests"), preview.Index(i)}, m
			}
		}
	case "chain":
		if i, ok := asInt(details["stage"]); ok {
			segs := []preview.Segment{preview.Key("stages"), preview.Index(i), preview.Key("request")}
			if f, ok := getAt(doc, segs...); ok {
				m, _ := f.(map[string]any)
				return segs, m
			}
			return segs[:2], nil
		}
	}
	return []preview.Segment{}, doc
}

// SuggestionPath renders a predict suggestion path (Go field names and
// indices of types.Request, e.g. ["Aggregations", "2", "Field"]) as a
// node path ("aggregations[2].field"). Map keys (["Params",
// "percentile"]) pass through. base prefixes it (a Compose slot).
func SuggestionPath(base string, goPath []string) string {
	var segs []preview.Segment
	if base != "" {
		if b, err := preview.ParsePath(base); err == nil {
			segs = b
		}
	}
	t := reflect.TypeFor[pulse.Request]()
	for _, p := range goPath {
		for t != nil && (t.Kind() == reflect.Pointer) {
			t = t.Elem()
		}
		switch {
		case t != nil && (t.Kind() == reflect.Slice || t.Kind() == reflect.Array):
			if i, err := strconv.Atoi(p); err == nil {
				segs = append(segs, preview.Index(i))
				t = t.Elem()
				continue
			}
			t = nil
			segs = append(segs, preview.Key(p))
		case t != nil && t.Kind() == reflect.Struct:
			f, ok := t.FieldByName(p)
			if !ok {
				t = nil
				segs = append(segs, preview.Key(p))
				continue
			}
			name := jsonName(f)
			if name == "" {
				// An embedded or untagged struct: its fields are promoted.
				t = f.Type
				continue
			}
			segs = append(segs, preview.Key(name))
			t = f.Type
		case t != nil && t.Kind() == reflect.Map:
			segs = append(segs, preview.Key(p))
			t = t.Elem()
		default:
			t = nil
			if i, err := strconv.Atoi(p); err == nil {
				segs = append(segs, preview.Index(i))
			} else {
				segs = append(segs, preview.Key(p))
			}
		}
	}
	return preview.FormatPath(segs)
}

func jsonName(f reflect.StructField) string {
	tag := f.Tag.Get("json")
	name, _, _ := strings.Cut(tag, ",")
	if name == "-" {
		return ""
	}
	if name == "" {
		if f.Anonymous {
			return ""
		}
		return f.Name
	}
	return name
}

// SuggestionSeverity classifies a predict suggestion: advisories about
// the buffered path (streamable substitutes) are hints; everything else
// (field-name typos, missing params, operator/type mismatches) is a
// warning.
func SuggestionSeverity(reason string) string {
	if strings.Contains(reason, "buffered path") || strings.Contains(reason, "streamable") {
		return Hint
	}
	return Warning
}

// DecodePath is the node path a JSON decode error points at (an
// *json.UnmarshalTypeError names the dotted field it failed on, e.g.
// "weight" or "aggregations.params"), or "" when it names none. Array
// indices are not reported by encoding/json, so a path stops at the
// first array-valued key.
func DecodePath(doc map[string]any, base string, err error) string {
	var te *json.UnmarshalTypeError
	if !errors.As(err, &te) || te.Field == "" {
		return base
	}
	var segs []preview.Segment
	if base != "" {
		if b, err := preview.ParsePath(base); err == nil {
			segs = b
		}
	}
	cur := any(doc)
	if base != "" {
		cur, _ = getAt(doc, segs...)
	}
	for _, k := range strings.Split(te.Field, ".") {
		obj, ok := cur.(map[string]any)
		if !ok {
			break
		}
		v, ok := obj[k]
		if !ok {
			break
		}
		segs = append(segs, preview.Key(k))
		if _, isList := v.([]any); isList {
			break
		}
		cur = v
	}
	return preview.FormatPath(segs)
}

// Dedupe drops repeated (path, severity, message) issues, keeping order.
func Dedupe(in []Issue) []Issue {
	seen := map[string]bool{}
	out := in[:0]
	for _, is := range in {
		k := is.Path + "\x00" + is.Severity + "\x00" + is.Message
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, is)
	}
	return out
}

func getAt(v any, segs ...preview.Segment) (any, bool) {
	cur := v
	for _, s := range segs {
		if s.IsIndex {
			arr, ok := cur.([]any)
			if !ok || s.Index < 0 || s.Index >= len(arr) {
				return nil, false
			}
			cur = arr[s.Index]
			continue
		}
		obj, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		if cur, ok = obj[s.Key]; !ok {
			return nil, false
		}
	}
	return cur, true
}

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		if n == float64(int(n)) {
			return int(n), true
		}
	case json.Number:
		i, err := n.Int64()
		return int(i), err == nil
	}
	return 0, false
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}
