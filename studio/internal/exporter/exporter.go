// Package exporter describes the cohort export formats the studio
// offers (every format Pulse can write, plus the Pulse transfer
// artifact) and turns a client's generic option map into the Pulse
// writer options and job fields. The descriptors are what
// GET /api/export/formats serves, so the UI renders each format's
// options from them and a new Pulse writer knob needs no UI change:
// add it here, next to the WriterOptions field it sets.
package exporter

import (
	"fmt"
	"math"
	"strings"

	pio "github.com/frankbardon/pulse/io"

	"github.com/frankbardon/pulse-casebook/studio/internal/importer"
)

// ExportsDir is the workspace directory exports are written to. It is
// data, not versioned: history.IgnorePatterns ignores it.
const ExportsDir = "exports"

// FormatTransfer is the Pulse transfer artifact: the cohort's exact
// bytes, zstd-compressed (Pulse.ExportTransfer). It is not a tabular
// format, so fields, time zone and labels do not apply.
const FormatTransfer = "transfer"

// Option types.
const (
	TypeBool   = "bool"
	TypeString = "string"
	TypeEnum   = "enum"
	TypeInt    = "int"
)

// Option is one per-format knob.
type Option struct {
	Key     string   `json:"key"`
	Title   string   `json:"title"`
	Type    string   `json:"type"`
	Default any      `json:"default"`
	Help    string   `json:"help"`
	Enum    []string `json:"enum,omitempty"`
	Min     *int     `json:"min,omitempty"`
	Max     *int     `json:"max,omitempty"`
	// Placeholder is the hint a string option shows when empty.
	Placeholder string `json:"placeholder,omitempty"`
}

// Supports says which common options apply to a format.
type Supports struct {
	Fields   bool `json:"fields"`
	TimeZone bool `json:"time_zone"`
	Labels   bool `json:"labels"`
}

// Format describes one export format.
type Format struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Extension string   `json:"extension"`
	Help      string   `json:"help,omitempty"`
	Options   []Option `json:"options"`
	Supports  Supports `json:"supports"`
	// UTCOnly: the format refuses a non-UTC time zone (SPSS: a .sav
	// DATETIME has no offset slot). Pulse refuses it; this lets the UI
	// say so up front.
	UTCOnly bool `json:"utc_only,omitempty"`
}

// Common describes the options every tabular format shares.
type Common struct {
	Fields   string   `json:"fields"`
	TimeZone string   `json:"time_zone"`
	Labels   string   `json:"labels"`
	Modes    []string `json:"label_modes"`
}

// Help strings follow the pulse CLI's (internal/cli/export.go).
const (
	helpTimeZone = "Render datetime columns on this IANA zone's wall clock with its offset (e.g. Asia/Kolkata -> 2026-03-29T08:00:00+05:30) instead of UTC ...Z. Re-imports to the same instants; date columns never move. Leave empty, or UTC, for UTC output."
	helpFields   = "Export only the checked fields. Output order always follows the cohort's schema."
	helpLabels   = "Rewrite (replace) or add a <field>_label column (augment) for a categorical field using a label table from the workspace's labels/ directory."

	helpIgnoreSidecar = "Do not read the SPSS metadata sidecar beside the cohort; synthesise the .sav dictionary from the .pulse schema alone. Cannot round-trip a cohort whose derived set_* column is still present."
	helpUncompressed  = "Write the data section as flat 8-byte elements instead of SPSS's bytecode compression. Both are losslessly equivalent; bytecode is what SPSS itself writes."
	helpCharset       = "Character encoding the .sav is written in and declares, e.g. windows-1252 or utf-8. Empty: the charset the source declared, or UTF-8 for a cohort with no SPSS provenance."
	helpSanitize      = "Rewrite field names that cannot be SPSS variable names (a space, bracket, hyphen or leading digit) instead of refusing the export. Every rename is reported as a warning."
	helpLevel         = "zstd level: 1-2 fastest, 3-5 default, 6-9 better, 10-22 best (slower)."
)

func intp(n int) *int { return &n }

// tabular are the row formats Pulse writes, in pio.Formats order.
var tabular = map[pio.Format]Format{
	pio.FormatCSV:       {Title: "CSV", Extension: ".csv"},
	pio.FormatTSV:       {Title: "TSV", Extension: ".tsv"},
	pio.FormatNDJSON:    {Title: "NDJSON (one JSON object per line)", Extension: ".ndjson"},
	pio.FormatJSONArray: {Title: "JSON array", Extension: ".json"},
	pio.FormatParquet:   {Title: "Parquet", Extension: ".parquet"},
	pio.FormatArrow:     {Title: "Arrow IPC", Extension: ".arrow"},
	pio.FormatExcel:     {Title: "Excel workbook", Extension: ".xlsx", Help: "One sheet; at most 1,048,575 rows."},
	pio.FormatSPSS: {
		Title: "SPSS system file", Extension: ".sav", UTCOnly: true,
		Options: []Option{
			{Key: "sanitize_names", Title: "Sanitize names", Type: TypeBool, Default: false, Help: helpSanitize},
			{Key: "charset", Title: "Charset", Type: TypeString, Default: "", Help: helpCharset, Placeholder: "source charset"},
			{Key: "uncompressed", Title: "Uncompressed", Type: TypeBool, Default: false, Help: helpUncompressed},
			{Key: "ignore_sidecar", Title: "Ignore sidecar", Type: TypeBool, Default: false, Help: helpIgnoreSidecar},
		},
	},
}

var transfer = Format{
	ID: FormatTransfer, Title: "Pulse transfer (.pulse.zst)", Extension: ".pulse.zst",
	Help: "The cohort's exact bytes, zstd-compressed, for moving it to another machine (pulse import transfer restores it byte-identical).",
	Options: []Option{
		{Key: "level", Title: "Level", Type: TypeInt, Default: DefaultTransferLevel, Help: helpLevel,
			Min: intp(MinTransferLevel), Max: intp(MaxTransferLevel)},
	},
}

// Transfer zstd levels: pulse's internal/io constants (not re-exported
// by pulse/io in alpha.10; Pulse validates the level itself too).
const (
	DefaultTransferLevel = 3
	MinTransferLevel     = 1
	MaxTransferLevel     = 22
)

// ExcelMaxRows is the most data rows an .xlsx sheet holds (1,048,576
// rows less the header).
const ExcelMaxRows = 1_048_575

// Formats returns every export format: Pulse's writable formats in
// pio.Formats order, then the transfer artifact.
func Formats() []Format {
	var out []Format
	for _, f := range pio.Formats() {
		if !f.CanWrite() {
			continue
		}
		d, ok := tabular[f]
		if !ok {
			// A format a newer Pulse added: offered with no options.
			d = Format{Title: string(f), Extension: "." + string(f)}
		}
		d.ID = string(f)
		d.Supports = Supports{Fields: true, TimeZone: true, Labels: true}
		if d.Options == nil {
			d.Options = []Option{}
		}
		out = append(out, d)
	}
	return append(out, transfer)
}

// CommonOptions describes the shared options.
func CommonOptions() Common {
	return Common{Fields: helpFields, TimeZone: helpTimeZone, Labels: helpLabels, Modes: []string{"replace", "augment"}}
}

// Lookup returns the format with id.
func Lookup(id string) (Format, bool) {
	for _, f := range Formats() {
		if f.ID == id {
			return f, true
		}
	}
	return Format{}, false
}

// OptionError is a refused option value; Option names it.
type OptionError struct {
	Option  string
	Message string
}

func (e *OptionError) Error() string { return e.Message }

// Settings are the decoded per-format options.
type Settings struct {
	Writer pio.WriterOptions
	// Level is the transfer zstd level (0 = default).
	Level int
}

// Decode validates opts against format f's descriptors and maps them
// onto Pulse's writer options. Unknown keys and wrongly typed values are
// refused; absent keys keep their default.
func Decode(f Format, opts map[string]any) (Settings, error) {
	var s Settings
	known := map[string]Option{}
	for _, o := range f.Options {
		known[o.Key] = o
	}
	for k, v := range opts {
		o, ok := known[k]
		if !ok {
			return s, &OptionError{Option: k, Message: fmt.Sprintf("format %s has no option %q", f.ID, k)}
		}
		if v == nil {
			continue
		}
		if err := apply(&s, o, v); err != nil {
			return s, err
		}
	}
	return s, nil
}

func apply(s *Settings, o Option, v any) error {
	bad := func(want string) error {
		return &OptionError{Option: o.Key, Message: fmt.Sprintf("option %s must be %s", o.Key, want)}
	}
	switch o.Type {
	case TypeBool:
		b, ok := v.(bool)
		if !ok {
			return bad("true or false")
		}
		switch o.Key {
		case "sanitize_names":
			s.Writer.SPSS.SanitizeNames = b
		case "uncompressed":
			s.Writer.SPSS.Uncompressed = b
		case "ignore_sidecar":
			s.Writer.SPSS.IgnoreSidecar = b
		}
	case TypeString:
		str, ok := v.(string)
		if !ok {
			return bad("a string")
		}
		if o.Key == "charset" {
			s.Writer.SPSS.Charset = strings.TrimSpace(str)
		}
	case TypeInt:
		n, ok := v.(float64)
		if !ok || n != math.Trunc(n) {
			return bad("a whole number")
		}
		if (o.Min != nil && int(n) < *o.Min) || (o.Max != nil && int(n) > *o.Max) {
			return bad(fmt.Sprintf("between %d and %d", *o.Min, *o.Max))
		}
		if o.Key == "level" {
			s.Level = int(n)
		}
	}
	return nil
}

// FileName resolves the export file name for format f: name with the
// format's extension appended unless it already ends in it. ok is false
// for an empty name, one with a path, or a stem that is not an
// importer.ValidName (letters, digits, '.', '-', '_', starting with a
// letter or digit).
func FileName(name string, f Format) (string, bool) {
	n := strings.TrimSpace(name)
	if n == "" || strings.ContainsAny(n, "/\\\x00") {
		return "", false
	}
	stem := n
	if strings.HasSuffix(strings.ToLower(n), f.Extension) {
		stem = n[:len(n)-len(f.Extension)]
	} else {
		n += f.Extension
	}
	if !importer.ValidName(stem) {
		return "", false
	}
	return n, true
}

// Path is the workspace path of an export file.
func Path(file string) string { return ExportsDir + "/" + file }

// DefaultName is the default export name for a cohort path: its base
// name without ".pulse", plus the format's extension.
func DefaultName(cohort string, f Format) string {
	return importer.CohortName(cohort) + f.Extension
}

// FormatOfPath returns the export format id a file name's extension
// names ("" when unrecognised): the transfer artifact or a Pulse format.
func FormatOfPath(p string) string {
	if strings.HasSuffix(strings.ToLower(p), ".pulse.zst") {
		return FormatTransfer
	}
	return string(pio.FormatFromPath(p))
}
