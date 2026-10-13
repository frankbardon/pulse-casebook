package importer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/frankbardon/pulse/encoding"
	pio "github.com/frankbardon/pulse/io"
	"github.com/spf13/afero"

	"github.com/frankbardon/pulse-casebook/studio/internal/importer/rename"
)

// Options are the import knobs a predict, an import and a spec share.
// Each maps onto the pulse ImportJob / ReaderOptions field of the same
// meaning; zero values are Pulse's defaults. JSON names follow the CLI
// flags (docs/src/cli/flags.md).
type Options struct {
	// Reader knobs.
	Sheet       string `json:"sheet,omitempty"`        // Excel worksheet (default: first)
	Charset     string `json:"charset,omitempty"`      // SPSS charset override
	SPSSMissing string `json:"spss_missing,omitempty"` // SPSS: auto | null

	// Inference (inert with an explicit schema).
	SampleRows         int               `json:"sample_rows,omitempty"` // default 500, min 50
	FloatWidth         string            `json:"float_width,omitempty"` // f64 | f32
	SetInferenceMinPct int               `json:"set_min_pct,omitempty"` // default 30
	Overrides          map[string]string `json:"overrides,omitempty"`   // column → Pulse type (force_type)
	SetDelimiters      map[string]string `json:"set_delimiters,omitempty"`

	// Time zones.
	SourceTZ       string            `json:"source_tz,omitempty"`
	ColumnSourceTZ map[string]string `json:"column_source_tz,omitempty"`
	DSTPolicy      string            `json:"dst_policy,omitempty"` // error | earlier | later

	// Explicit schema matching.
	IgnoreExtra bool `json:"ignore_extra,omitempty"` // drop source columns the schema does not name

	// Layout.
	ElideConstants  bool            `json:"elide_constants,omitempty"`
	Groups          []pio.GroupDecl `json:"groups,omitempty"`
	DedupRatioFloor float64         `json:"dedup_ratio_floor,omitempty"`
	StrictDedup     bool            `json:"strict_dedup,omitempty"`

	// Predict only: detect candidate parent groups (a full row pass).
	SuggestGroups bool `json:"suggest_groups,omitempty"`

	// Rename maps source columns to field names: {"<source column>":
	// "<field name>"}. Pulse sees the new names, so every per-column
	// option above names fields by their NEW name. Applied by the reader
	// OpenReader builds. PULSE-GAP(column-rename): when Pulse can rename,
	// feed this map to its option in Apply and drop the reader wrap.
	Rename map[string]string `json:"rename,omitempty"`
}

// OptionError is an option the studio refuses before Pulse sees it.
type OptionError struct {
	Option  string
	Message string
}

func (e *OptionError) Error() string { return e.Message }

// ReaderOptions are the per-format reader knobs.
func (o Options) ReaderOptions() pio.ReaderOptions {
	return pio.ReaderOptions{
		Excel: pio.ExcelReaderOptions{Sheet: o.Sheet},
		SPSS:  pio.SPSSReaderOptions{Charset: o.Charset, MissingMode: pio.SPSSMissingMode(o.SPSSMissing)},
	}
}

// Apply sets the job fields the options carry.
func (o Options) Apply(job *pio.ImportJob) error {
	if o.SampleRows < 0 || o.SampleRows > MaxSampleRows {
		return &OptionError{Option: "sample_rows", Message: fmt.Sprintf("sample_rows must be between %d and %d", MinSampleRows, MaxSampleRows)}
	}
	if o.SampleRows > 0 {
		job.SampleRows = o.SampleRows
	}
	job.FloatWidth = o.FloatWidth
	job.SetInferenceMinPct = o.SetInferenceMinPct
	if len(o.Overrides) > 0 {
		job.ColumnTypeOverrides = make(map[string]encoding.FieldType, len(o.Overrides))
		for col, name := range o.Overrides {
			ft, ok := encoding.ParseFieldType(name)
			if !ok {
				return &OptionError{Option: "overrides", Message: fmt.Sprintf("override for column %q names unknown type %q", col, name)}
			}
			job.ColumnTypeOverrides[col] = ft
		}
	}
	if len(o.SetDelimiters) > 0 {
		job.SetDelimiters = o.SetDelimiters
	}
	job.SourceTZ = o.SourceTZ
	job.ColumnSourceTZ = o.ColumnSourceTZ
	switch pio.DSTPolicy(o.DSTPolicy) {
	case "", pio.DSTPolicyError, pio.DSTPolicyEarlier, pio.DSTPolicyLater:
		job.DSTPolicy = pio.DSTPolicy(o.DSTPolicy)
	default:
		return &OptionError{Option: "dst_policy", Message: "dst_policy must be error, earlier or later"}
	}
	job.IgnoreExtra = o.IgnoreExtra
	job.ElideConstants = o.ElideConstants
	job.Groups = o.Groups
	job.DedupRatioFloor = o.DedupRatioFloor
	job.StrictDedup = o.StrictDedup
	job.SuggestGroups = o.SuggestGroups
	return nil
}

// EffectiveSampleRows is the inference sample size Pulse will use.
func (o Options) EffectiveSampleRows() int {
	switch {
	case o.SampleRows <= 0:
		return DefaultSampleRows
	case o.SampleRows < MinSampleRows:
		return MinSampleRows
	}
	return o.SampleRows
}

// SpecVersion is the import spec document version.
const SpecVersion = 1

// Spec is an import spec, imports/<cohort>.import.json: everything
// needed to rebuild a gitignored cohort from its source. It is versioned
// in git; the source and the cohort are not.
type Spec struct {
	Version int        `json:"version"`
	Target  string     `json:"target"` // workspace path of the .pulse
	Source  SpecSource `json:"source"`
	// Schema is the explicit schema the import used, nil for an import
	// that let Pulse infer one.
	Schema     *SpecSchema `json:"schema,omitempty"`
	Options    Options     `json:"options"`
	LastImport *SpecReport `json:"last_import,omitempty"`
}

// SpecSource pins the source file by content.
type SpecSource struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
	Format string `json:"format"`
}

// SpecSchema references a saved schema by name and content hash (the
// sha256 of the schema file's bytes), or carries an inline document.
type SpecSchema struct {
	Ref    string        `json:"ref,omitempty"`
	Path   string        `json:"path,omitempty"`
	SHA256 string        `json:"sha256,omitempty"`
	Inline []SchemaField `json:"inline,omitempty"`
}

// SpecReport summarizes the last import.
type SpecReport struct {
	At             string   `json:"at"` // RFC3339 UTC
	PulseVersion   string   `json:"pulse_version"`
	RowsImported   int      `json:"rows_imported"`
	RowErrors      int      `json:"row_errors"`
	Warnings       int      `json:"warnings"`
	Fields         int      `json:"fields"`
	PromotedFields []string `json:"promoted_fields,omitempty"`
	CohortBytes    int64    `json:"cohort_bytes,omitempty"`
}

// ParseSpec decodes an import spec, checking the fields a rebuild needs.
func ParseSpec(raw []byte) (*Spec, error) {
	var s Spec
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("import spec is not valid JSON: %w", err)
	}
	if s.Version != SpecVersion {
		return nil, fmt.Errorf("import spec version %d is not supported (want %d)", s.Version, SpecVersion)
	}
	if s.Target == "" || s.Source.Path == "" {
		return nil, fmt.Errorf("import spec lacks target or source.path")
	}
	return &s, nil
}

// HashFile streams a file through sha256, returning the hex digest and
// the byte count.
func HashFile(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// HashBytes is the hex sha256 of b.
func HashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// OpenReader builds the public Pulse reader for an absolute source path.
// An empty format is detected from the extension (pio.FormatFromPath).
func OpenReader(abs string, format pio.Format, o Options) (pio.Reader, pio.Format, error) {
	if format == "" {
		format = pio.FormatFromPath(abs)
	}
	if !format.CanRead() {
		return nil, format, &FormatError{Format: format}
	}
	r, err := pio.NewReader(format, afero.NewOsFs(), abs, o.ReaderOptions())
	if err != nil {
		return nil, format, err
	}
	// PULSE-GAP(column-rename): the one place renames are applied.
	return rename.Wrap(r, o.Rename), format, nil
}

// FormatError reports a source whose format cannot be read.
type FormatError struct{ Format pio.Format }

func (e *FormatError) Error() string {
	if e.Format == "" {
		return "cannot detect the source format from its extension"
	}
	return fmt.Sprintf("format %q cannot be imported", e.Format)
}

// ReadableFormats lists the formats an upload may have.
func ReadableFormats() []string {
	var out []string
	for _, f := range pio.Formats() {
		out = append(out, f.String())
	}
	return out
}

// SheetNames lists an Excel workbook's data sheets when the reader
// exposes them (the public excel adapter does; overlay sheets, prefixed
// "__overlay_", are left out). ok is false for other readers.
func SheetNames(r pio.Reader) ([]string, bool, error) {
	sr, ok := r.(interface{ SheetNames() ([]string, error) })
	if !ok {
		return nil, false, nil
	}
	all, err := sr.SheetNames()
	if err != nil {
		return nil, true, err
	}
	out := []string{}
	for _, n := range all {
		if len(n) >= 10 && n[:10] == "__overlay_" {
			continue
		}
		out = append(out, n)
	}
	return out, true, nil
}
