package importer

import (
	"context"
	"errors"
	"math"
	"strconv"
	"strings"

	pio "github.com/frankbardon/pulse/io"
)

// Sample bounds.
const (
	DefaultSampleRows  = 500 // pulse ImportJob default
	MinSampleRows      = 50  // pulse clamps lower values up to this
	MaxSampleRows      = 100_000
	DefaultPreviewRows = 20
	MaxPreviewRows     = 200
	maxDistinct        = 10_000 // exact distinct counting stops here
	maxCellChars       = 200    // preview cells are cut to this many runes
)

// ColumnStats are one column's figures over the sample.
type ColumnStats struct {
	Sampled int     `json:"sampled"`  // rows looked at
	Nulls   int     `json:"nulls"`    // null cells among them
	NullPct float64 `json:"null_pct"` // 0-100
	// Distinct counts distinct non-null cell texts, exactly up to 10000;
	// DistinctCapped says the count stopped there (a lower bound).
	Distinct       int  `json:"distinct"`
	DistinctCapped bool `json:"distinct_capped,omitempty"`
	// Min / Max are set for numeric columns only (see SetNumeric), over
	// the non-null cells that parse as numbers.
	Min *float64 `json:"min,omitempty"`
	Max *float64 `json:"max,omitempty"`

	distinct  map[string]struct{}
	min, max  float64
	numeric   int
	allNumber bool
}

// SampleResult is the outcome of SampleSource.
type SampleResult struct {
	Header []string
	// Rows are the first preview rows, one cell per header column (nil
	// for a cell the source declares null, e.g. JSON null).
	Rows    [][]*string
	Stats   []*ColumnStats
	Sampled int  // rows read
	More    bool // the source has rows beyond the sample
}

var errStop = errors.New("sample complete")

// IsNullToken mirrors pulse's import null tokens: "", "na", "n/a" and
// "null", case-insensitively (internal/io isNullToken).
func IsNullToken(s string) bool {
	switch len(s) {
	case 0:
		return true
	case 2, 3, 4:
		l := strings.ToLower(s)
		return l == "na" || l == "n/a" || l == "null"
	}
	return false
}

// SampleSource reads the header and up to sampleRows rows of r (which it
// does not close), keeping the first previewRows rows verbatim and
// per-column stats over all of them. Readers that report source nulls
// (pio.NullAwareReader) have those counted as nulls too.
func SampleSource(ctx context.Context, r pio.Reader, sampleRows, previewRows int) (*SampleResult, error) {
	header, err := r.ReadHeader()
	if err != nil {
		return nil, err
	}
	res := &SampleResult{Header: header, Rows: [][]*string{}, Stats: make([]*ColumnStats, len(header))}
	for i := range res.Stats {
		res.Stats[i] = &ColumnStats{distinct: map[string]struct{}{}, allNumber: true, min: math.Inf(1), max: math.Inf(-1)}
	}
	nulls, _ := r.(pio.NullAwareReader)
	err = r.ReadRows(ctx, func(row []string) error {
		if res.Sampled >= sampleRows {
			res.More = true
			return errStop
		}
		var declared []bool
		if nulls != nil {
			declared = nulls.RowNulls()
		}
		if len(res.Rows) < previewRows {
			cells := make([]*string, len(header))
			for i := range cells {
				if i < len(row) && !(i < len(declared) && declared[i]) {
					v := clip(row[i])
					cells[i] = &v
				}
			}
			res.Rows = append(res.Rows, cells)
		}
		for i, st := range res.Stats {
			st.Sampled++
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			if (i < len(declared) && declared[i]) || IsNullToken(cell) {
				st.Nulls++
				continue
			}
			if len(st.distinct) < maxDistinct {
				st.distinct[cell] = struct{}{}
			} else if _, ok := st.distinct[cell]; !ok {
				st.DistinctCapped = true
			}
			if f, err := strconv.ParseFloat(strings.TrimSpace(cell), 64); err == nil && !math.IsNaN(f) && !math.IsInf(f, 0) {
				st.numeric++
				st.min = math.Min(st.min, f)
				st.max = math.Max(st.max, f)
			} else {
				st.allNumber = false
			}
		}
		res.Sampled++
		return nil
	})
	if err != nil && !errors.Is(err, errStop) {
		return nil, err
	}
	for _, st := range res.Stats {
		st.Distinct = len(st.distinct)
		if st.Sampled > 0 {
			st.NullPct = math.Round(float64(st.Nulls)*10000/float64(st.Sampled)) / 100
		}
	}
	return res, nil
}

// SetNumeric publishes min/max for a column whose Pulse type is numeric
// and whose non-null sampled cells all parsed as numbers.
func (st *ColumnStats) SetNumeric() {
	if st.numeric == 0 || !st.allNumber {
		return
	}
	lo, hi := st.min, st.max
	st.Min, st.Max = &lo, &hi
}

func clip(s string) string {
	if len(s) <= maxCellChars {
		return s
	}
	r := []rune(s)
	if len(r) <= maxCellChars {
		return s
	}
	return string(r[:maxCellChars]) + "…"
}
