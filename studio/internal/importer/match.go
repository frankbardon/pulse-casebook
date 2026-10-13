package importer

import (
	"sort"
	"strings"
	"unicode"

	"github.com/frankbardon/pulse/encoding"

	"github.com/frankbardon/pulse-casebook/studio/internal/importer/rename"
)

// Coarse type classes a fingerprint compares. Rungs of one class (u8 vs
// u16, categorical_u8 vs categorical_u16, f32 vs f64) agree.
const (
	CoarseNumeric     = "numeric"
	CoarseCategorical = "categorical"
	CoarseTemporal    = "temporal"
	CoarseBool        = "bool"
	CoarseSet         = "set"
	CoarseUnknown     = "unknown"
)

// CoarseType maps a Pulse type name (or an already coarse class) to its
// class.
func CoarseType(name string) string {
	switch name {
	case CoarseNumeric, CoarseCategorical, CoarseTemporal, CoarseBool, CoarseSet:
		return name
	}
	ft, ok := encoding.ParseFieldType(name)
	if !ok {
		return CoarseUnknown
	}
	switch {
	case ft == encoding.FieldTypePackedBool:
		return CoarseBool
	case ft.IsCategorical():
		return CoarseCategorical
	case ft.IsSet():
		return CoarseSet
	case ft == encoding.FieldTypeDate || ft == encoding.FieldTypeDateTime:
		return CoarseTemporal
	case ft.IsNumeric() || ft == encoding.FieldTypeU4:
		return CoarseNumeric
	}
	return CoarseUnknown
}

// NormalizeName folds a column name for matching: lower case, surrounding
// space trimmed, and every run of whitespace, '-' or '_' made one '_'
// ("Order ID", "order_id" and "order-id" are one name).
func NormalizeName(name string) string {
	var b strings.Builder
	sep := false
	for _, r := range strings.TrimSpace(name) {
		if unicode.IsSpace(r) || r == '-' || r == '_' {
			sep = true
			continue
		}
		if sep && b.Len() > 0 {
			b.WriteByte('_')
		}
		sep = false
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

// Column is one column of a fingerprinted table: its name and Pulse type
// (or coarse class), plus nullability and description when known.
type Column struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Nullable    bool   `json:"nullable,omitempty"`
	Description string `json:"description,omitempty"`
	Precision   uint8  `json:"precision,omitempty"`
	Scale       uint8  `json:"scale,omitempty"`
}

// FingerprintEntry is one normalized column.
type FingerprintEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// Fingerprint is a table's structural identity: normalized names with
// coarse types, sorted by name. Order of columns does not matter.
type Fingerprint []FingerprintEntry

// FingerprintOf fingerprints columns. A name that folds to one already
// seen keeps its first type.
func FingerprintOf(cols []Column) Fingerprint {
	seen := map[string]bool{}
	fp := Fingerprint{}
	for _, c := range cols {
		n := NormalizeName(c.Name)
		if n == "" || seen[n] {
			continue
		}
		seen[n] = true
		fp = append(fp, FingerprintEntry{Name: n, Type: CoarseType(c.Type)})
	}
	sort.Slice(fp, func(i, j int) bool { return fp[i].Name < fp[j].Name })
	return fp
}

// ColumnsOf turns a schema document into columns.
func ColumnsOf(fields []SchemaField) []Column {
	out := make([]Column, len(fields))
	for i, f := range fields {
		out[i] = Column{Name: f.Name, Type: f.Type, Nullable: f.Nullable, Description: f.Description, Precision: f.Precision, Scale: f.Scale}
	}
	return out
}

// SourceColumns is ColumnsOf under the source column names a rename map
// records: a saved schema is matched against the next upload's ORIGINAL
// headers. PULSE-GAP(column-rename).
func SourceColumns(fields []SchemaField, m map[string]string) []Column {
	cols := ColumnsOf(fields)
	if len(m) == 0 {
		return cols
	}
	names := make([]string, len(cols))
	for i, c := range cols {
		names[i] = c.Name
	}
	for i, n := range rename.Sources(names, m) {
		cols[i].Name = n
	}
	return cols
}

// Thresholds the UI applies to a ranked match (G3): an exact match is
// auto-selected; matches at or above SuggestScore are offered.
const SuggestScore = 0.8

// Candidate is a saved schema to rank.
type Candidate struct {
	Name    string
	Path    string
	Columns []Column          // under source column names (SourceColumns)
	Rename  map[string]string // PULSE-GAP(column-rename): the saved schema's map
	Scope   string            // "global" | "local" in a library ("" elsewhere)
}

// Retyped is a column both sides have with different coarse types.
type Retyped struct {
	Name  string `json:"name"`  // the input column's name
	Saved string `json:"saved"` // saved schema's Pulse type
	Input string `json:"input"` // input column's type
}

// Diff compares a saved schema against input columns: Added are input
// columns the schema lacks, Missing schema fields the input lacks
// (saved names), Retyped columns whose coarse types disagree.
type Diff struct {
	Added   []string  `json:"added"`
	Missing []string  `json:"missing"`
	Retyped []Retyped `json:"retyped"`
}

// MergedField is one field of the schema an applied match produces: the
// input's columns in input order, a matched column taking the saved
// type / nullability / description under the INPUT's exact name (Pulse
// matches schema fields to source columns by exact name), a new column
// keeping its input type and flagged New.
type MergedField struct {
	SchemaField
	New bool `json:"new,omitempty"`
}

// Match is one ranked candidate.
type Match struct {
	Name    string        `json:"name"`
	Path    string        `json:"path"`
	Score   float64       `json:"score"`   // 0-1, 1 = exact
	Exact   bool          `json:"exact"`   // same names, same coarse types
	Suggest bool          `json:"suggest"` // score >= SuggestScore
	Diff    Diff          `json:"diff"`
	Merged  []MergedField `json:"merged"`
	// Rename is the saved schema's rename map, applied with the match.
	// PULSE-GAP(column-rename).
	Rename map[string]string `json:"rename,omitempty"`
	// Scope is "global" (a library's shared schema; a workspace refers to
	// it by Path, "_global/schemas/...") or "local" in a library.
	Scope string `json:"scope,omitempty"`
}

// Score is the weighted Jaccard of two fingerprints: matched names count
// 1 when their coarse types agree and 0.5 when they do not, over the
// size of the name union. Two empty fingerprints score 0.
func Score(a, b Fingerprint) float64 {
	bt := make(map[string]string, len(b))
	for _, e := range b {
		bt[e.Name] = e.Type
	}
	var inter float64
	both := 0
	for _, e := range a {
		t, ok := bt[e.Name]
		if !ok {
			continue
		}
		both++
		if t == e.Type {
			inter++
		} else {
			inter += 0.5
		}
	}
	union := len(a) + len(b) - both
	if union == 0 {
		return 0
	}
	return inter / float64(union)
}

// Rank scores every candidate against the input columns and returns the
// ones scoring above zero, best first (ties by name). limit <= 0 keeps
// all.
func Rank(input []Column, cands []Candidate, limit int) []Match {
	in := FingerprintOf(input)
	out := []Match{}
	for _, c := range cands {
		fp := FingerprintOf(c.Columns)
		sc := Score(in, fp)
		if sc <= 0 {
			continue
		}
		sc = float64(int(sc*1000+0.5)) / 1000
		m := Match{Name: c.Name, Path: c.Path, Score: sc, Exact: sc == 1, Suggest: sc >= SuggestScore, Rename: c.Rename, Scope: c.Scope}
		m.Diff, m.Merged = diffMerge(input, c.Columns)
		out = append(out, m)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].Name < out[j].Name
	})
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func diffMerge(input, saved []Column) (Diff, []MergedField) {
	d := Diff{Added: []string{}, Missing: []string{}, Retyped: []Retyped{}}
	byName := map[string]Column{}
	for _, c := range saved {
		n := NormalizeName(c.Name)
		if _, dup := byName[n]; !dup {
			byName[n] = c
		}
	}
	used := map[string]bool{}
	merged := make([]MergedField, 0, len(input))
	for _, c := range input {
		n := NormalizeName(c.Name)
		s, ok := byName[n]
		if !ok || used[n] {
			d.Added = append(d.Added, c.Name)
			merged = append(merged, MergedField{SchemaField: SchemaField{Name: c.Name, Type: c.Type, Nullable: c.Nullable, Description: c.Description, Precision: c.Precision, Scale: c.Scale}, New: true})
			continue
		}
		used[n] = true
		if CoarseType(s.Type) != CoarseType(c.Type) {
			d.Retyped = append(d.Retyped, Retyped{Name: c.Name, Saved: s.Type, Input: c.Type})
		}
		merged = append(merged, MergedField{SchemaField: SchemaField{Name: c.Name, Type: s.Type, Nullable: s.Nullable, Description: s.Description, Precision: s.Precision, Scale: s.Scale}})
	}
	for _, c := range saved {
		if !used[NormalizeName(c.Name)] {
			d.Missing = append(d.Missing, c.Name)
		}
	}
	return d, merged
}
