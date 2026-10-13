// Package rename renames source columns on import. PULSE-GAP(column-rename)
//
// Pulse (alpha.10) matches an explicit import schema to source columns by
// exact name and has no rename option, so a file whose headers are
// "Living Space (sq ft)" cannot become a cohort field living_space_sq_ft.
// This package is the studio's stopgap, built to be deleted once Pulse
// can rename natively:
//
//   - Wrap decorates a pio.Reader so ReadHeader reports the renamed
//     names. Everything downstream (inference, the explicit schema match,
//     overrides, set delimiters, column time zones, groups) then sees the
//     new names: every per-column setting handed to Pulse uses the NEW
//     name. It is applied in exactly one place, importer.OpenReader, which
//     builds the reader for predict, import and rebuild alike.
//   - The map itself, {"<source column>": "<field name>"}, is persisted
//     as the optional key `rename`: options.rename in an import spec, and
//     the top-level `rename` of a saved schema's object form. A future
//     Pulse option is fed from that same map; nobody's files migrate.
//
// See studio/README.md, "Removing the rename shim", for the removal steps.
package rename

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/frankbardon/pulse/encoding"
	perrors "github.com/frankbardon/pulse/errors"
	pio "github.com/frankbardon/pulse/io"
	"github.com/spf13/afero"
)

// Code is the coded error a refused rename map raises. The server passes
// it through like a Pulse refusal (predict: valid:false + refusal; import:
// 422 with this code).
const Code perrors.Code = "invalid_rename"

// MaxNameBytes is the longest field name a .pulse schema can hold (the
// name is written with a u16 length prefix, pulse encoding/schema.go).
const MaxNameBytes = 1<<16 - 1

// Normalize drops identity entries ("a": "a"); nil when nothing is left,
// so an unused map is never written.
func Normalize(m map[string]string) map[string]string {
	var out map[string]string
	for k, v := range m {
		if k == v {
			continue
		}
		if out == nil {
			out = map[string]string{}
		}
		out[k] = v
	}
	return out
}

// Wrap returns r reading through m: ReadHeader reports renamed names and
// refuses an invalid map (Validate). With no effective rename r itself is
// returned, so an import without one is exactly what it was.
func Wrap(r pio.Reader, m map[string]string) pio.Reader {
	m = Normalize(m)
	if len(m) == 0 {
		return r
	}
	return &reader{in: r, m: m}
}

// Apply renames a header (a copy; names absent from m are kept).
func Apply(header []string, m map[string]string) []string {
	out := make([]string, len(header))
	for i, h := range header {
		if n, ok := m[h]; ok {
			out[i] = n
		} else {
			out[i] = h
		}
	}
	return out
}

// Sources maps renamed names back to their source columns (the inverse
// of Apply; names m does not produce are kept).
func Sources(names []string, m map[string]string) []string {
	inv := make(map[string]string, len(m))
	for k, v := range Normalize(m) {
		inv[v] = k
	}
	out := make([]string, len(names))
	for i, n := range names {
		if s, ok := inv[n]; ok {
			out[i] = s
		} else {
			out[i] = n
		}
	}
	return out
}

// CheckName refuses a field name Pulse cannot store or the studio will
// not write: empty (Pulse's own schema check trims), leading/trailing
// space (a typo the exact-name match would never forgive), not UTF-8, or
// longer than a .pulse field name can be. reason is "" when n is fine.
func CheckName(n string) (reason, msg string) {
	switch {
	case strings.TrimSpace(n) == "":
		return "empty", "a field name cannot be empty"
	case strings.TrimSpace(n) != n:
		return "whitespace", fmt.Sprintf("field name %q starts or ends with a space", n)
	case !utf8.ValidString(n):
		return "invalid_utf8", "field name is not valid UTF-8"
	case len(n) > MaxNameBytes:
		return "too_long", fmt.Sprintf("field name is longer than %d bytes", MaxNameBytes)
	}
	return "", ""
}

func refuse(reason, msg string, details map[string]any) *perrors.CodedError {
	d := map[string]any{"reason": reason}
	for k, v := range details {
		d[k] = v
	}
	return perrors.NewCodedErrorWithDetails(Code, msg, d)
}

// Validate checks m against a source header: every key names a column,
// every new name is acceptable (CheckName), and no renamed name collides
// with another column after renaming (renamed or not). Duplicates the
// source header already had are Pulse's to judge, as without a rename.
// The error is a *perrors.CodedError with Code and details {reason,
// column?, name?, columns?}; reason is unknown_column, empty, whitespace,
// invalid_utf8, too_long or duplicate.
func Validate(header []string, m map[string]string) error {
	m = Normalize(m)
	if len(m) == 0 {
		return nil
	}
	in := make(map[string]bool, len(header))
	for _, h := range header {
		in[h] = true
	}
	for _, k := range sortedKeys(m) {
		if !in[k] {
			return refuse("unknown_column", fmt.Sprintf("rename names source column %q, which the source does not have", k),
				map[string]any{"column": k, "name": m[k]})
		}
		if reason, msg := CheckName(m[k]); reason != "" {
			return refuse(reason, fmt.Sprintf("column %q: %s", k, msg), map[string]any{"column": k, "name": m[k]})
		}
	}
	renamed := Apply(header, m)
	for _, h := range header {
		n, ok := m[h]
		if !ok {
			continue
		}
		var cols []string
		for j, o := range renamed {
			if o == n {
				cols = append(cols, header[j])
			}
		}
		if len(cols) > 1 {
			return refuse("duplicate", fmt.Sprintf("column %q is renamed to %q, which column %q is also called after renaming", h, n, other(cols, h)),
				map[string]any{"column": h, "name": n, "columns": cols})
		}
	}
	return nil
}

func other(cols []string, self string) string {
	for _, c := range cols {
		if c != self {
			return c
		}
	}
	return self
}

// ValidateFields checks a saved schema's map against its fields: every
// new name is a field and acceptable, and no two columns share one.
func ValidateFields(fields []string, m map[string]string) error {
	m = Normalize(m)
	have := make(map[string]bool, len(fields))
	for _, f := range fields {
		have[f] = true
	}
	by := map[string]string{}
	for _, k := range sortedKeys(m) {
		n := m[k]
		if strings.TrimSpace(k) == "" {
			return refuse("empty", "rename has an empty source column", map[string]any{"name": n})
		}
		if reason, msg := CheckName(n); reason != "" {
			return refuse(reason, fmt.Sprintf("column %q: %s", k, msg), map[string]any{"column": k, "name": n})
		}
		if !have[n] {
			return refuse("unknown_field", fmt.Sprintf("rename maps column %q to %q, which the schema does not declare", k, n),
				map[string]any{"column": k, "name": n})
		}
		if o, dup := by[n]; dup {
			return refuse("duplicate", fmt.Sprintf("columns %q and %q are both renamed to %q", o, k, n),
				map[string]any{"column": k, "name": n, "columns": []string{o, k}})
		}
		by[n] = k
	}
	return nil
}

func sortedKeys(m map[string]string) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

// Suggest is a clean snake_case field name for a source header: lower
// case, every run of other characters one "_", trimmed, and "c_" before
// a leading digit ("Living Space (sq ft)" → living_space_sq_ft, "List
// Price ($)" → list_price, "2020 Sales" → c_2020_sales). "" when nothing
// is left. The UI's suggestName (ui/src/importer/rename.ts) mirrors it.
func Suggest(name string) string {
	var b strings.Builder
	sep := false
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			if sep && b.Len() > 0 {
				b.WriteByte('_')
			}
			sep = false
			b.WriteRune(unicode.ToLower(r))
			continue
		}
		sep = true
	}
	s := b.String()
	if s != "" && s[0] >= '0' && s[0] <= '9' {
		s = "c_" + s
	}
	return s
}

// reader is the renaming decorator. Every optional reader interface Pulse
// type-asserts (pulse internal/iocore) is implemented by forwarding, with
// the "not implemented" answer Pulse would take from the bare reader when
// the inner one lacks it, so wrapping changes names and nothing else.
type reader struct {
	in pio.Reader
	m  map[string]string
}

func (r *reader) ReadHeader() ([]string, error) {
	h, err := r.in.ReadHeader()
	if err != nil {
		return h, err
	}
	if err := Validate(h, r.m); err != nil {
		return nil, err
	}
	return Apply(h, r.m), nil
}

func (r *reader) ReadRows(ctx context.Context, fn func(row []string) error) error {
	return r.in.ReadRows(ctx, fn)
}

func (r *reader) Close() error { return r.in.Close() }

// Reset: every readable format's reader is a ResetReader (pio.NewReader).
func (r *reader) Reset() error {
	rr, ok := r.in.(pio.ResetReader)
	if !ok {
		return fmt.Errorf("source reader cannot be reset")
	}
	return rr.Reset()
}

// RowNulls: nil is what Pulse uses for a reader without a null channel.
func (r *reader) RowNulls() []bool {
	if nr, ok := r.in.(pio.NullAwareReader); ok {
		return nr.RowNulls()
	}
	return nil
}

// RefuseLateKeys: keyed sources (NDJSON, JSON array). Rows are positional
// after the header, so renaming the header renames the keys.
func (r *reader) RefuseLateKeys(on bool) {
	if lk, ok := r.in.(interface{ RefuseLateKeys(bool) }); ok {
		lk.RefuseLateKeys(on)
	}
}

// PulseSchema renames the fields of an authoritative source schema
// (SPSS); (nil, nil) declines, as a reader without one does.
func (r *reader) PulseSchema() (*encoding.Schema, error) {
	sar, ok := r.in.(pio.SchemaAwareReader)
	if !ok {
		return nil, nil
	}
	s, err := sar.PulseSchema()
	if err != nil || s == nil {
		return s, err
	}
	cp := *s
	cp.Fields = append([]encoding.Field(nil), s.Fields...)
	for i := range cp.Fields {
		if n, ok := r.m[cp.Fields[i].Name]; ok {
			cp.Fields[i].Name = n
		}
	}
	return &cp, nil
}

func (r *reader) Warnings() []*perrors.CodedError {
	if sw, ok := r.in.(pio.SourceWarningEmitter); ok {
		return sw.Warnings()
	}
	return nil
}

// WriteSidecar forwards (SPSS metadata). The sidecar keeps the source's
// variable names; see README "Removing the rename shim" (known gap).
func (r *reader) WriteSidecar(fs afero.Fs, cohortPath string) error {
	if se, ok := r.in.(pio.SidecarEmitter); ok {
		return se.WriteSidecar(fs, cohortPath)
	}
	return nil
}

// SheetNames forwards the Excel adapter's sheet list.
func (r *reader) SheetNames() ([]string, error) {
	if sr, ok := r.in.(interface{ SheetNames() ([]string, error) }); ok {
		return sr.SheetNames()
	}
	return nil, fmt.Errorf("source has no sheets")
}
