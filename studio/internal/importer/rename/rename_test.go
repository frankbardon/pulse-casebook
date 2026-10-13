package rename

import (
	"context"
	"errors"
	"testing"

	"github.com/frankbardon/pulse/encoding"
	perrors "github.com/frankbardon/pulse/errors"
	pio "github.com/frankbardon/pulse/io"
)

const zillowCSV = "Living Space (sq ft),List Price ($),City\n1200,350000,Austin\n900,,Dallas\n"

const zillowNDJSON = `{"Living Space (sq ft)": 1200, "List Price ($)": 350000, "City": "Austin"}
{"Living Space (sq ft)": 900, "List Price ($)": null, "City": "Dallas"}
`

var zillowRename = map[string]string{"Living Space (sq ft)": "living_space_sq_ft", "List Price ($)": "list_price"}

func open(t *testing.T, f pio.Format, data string) pio.Reader {
	t.Helper()
	r, err := pio.NewReaderFromBytes(f, []byte(data), pio.ReaderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestWrapUnchangedWithoutRename(t *testing.T) {
	r := open(t, pio.FormatCSV, zillowCSV)
	if Wrap(r, nil) != r || Wrap(r, map[string]string{"City": "City"}) != r {
		t.Fatal("no effective rename must return the reader itself")
	}
}

func TestWrapRenamesHeaderAndImports(t *testing.T) {
	for _, tc := range []struct {
		f    pio.Format
		data string
	}{{pio.FormatCSV, zillowCSV}, {pio.FormatNDJSON, zillowNDJSON}} {
		t.Run(string(tc.f), func(t *testing.T) {
			r := Wrap(open(t, tc.f, tc.data), zillowRename)
			h, err := r.ReadHeader()
			if err != nil {
				t.Fatal(err)
			}
			if h[0] != "living_space_sq_ft" || h[1] != "list_price" || h[2] != "City" {
				t.Fatalf("header %v", h)
			}
			if _, ok := r.(pio.ResetReader); !ok {
				t.Fatal("wrapped reader must stay a ResetReader")
			}
			var rows [][]string
			if err := r.ReadRows(context.Background(), func(row []string) error {
				rows = append(rows, append([]string(nil), row...))
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			if len(rows) != 2 || rows[0][2] != "Austin" {
				t.Fatalf("rows %v", rows)
			}

			// Pulse infers under the new names...
			job := pio.NewImportJob(Wrap(open(t, tc.f, tc.data), zillowRename), "x.pulse")
			rep, err := job.Predict(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if rep.Schema.Fields[0].Name != "living_space_sq_ft" || rep.Schema.Fields[1].Name != "list_price" || !rep.Schema.Fields[1].Nullable {
				t.Fatalf("inferred %+v", rep.Schema.Fields)
			}
			// ...and matches an explicit schema by the new names.
			job = pio.NewImportJob(Wrap(open(t, tc.f, tc.data), zillowRename), "x.pulse")
			job.Schema = &encoding.Schema{Fields: []encoding.Field{
				{Name: "City", Type: encoding.FieldTypeCategoricalU8},
				{Name: "list_price", Type: encoding.FieldTypeF64, Nullable: true},
				{Name: "living_space_sq_ft", Type: encoding.FieldTypeU16},
			}}
			job.ColumnTypeOverrides = nil
			if _, err := job.Predict(context.Background()); err != nil {
				t.Fatalf("explicit schema by new names: %v", err)
			}
			// The old names are gone as far as Pulse is concerned.
			job = pio.NewImportJob(Wrap(open(t, tc.f, tc.data), zillowRename), "x.pulse")
			job.Schema = &encoding.Schema{Fields: []encoding.Field{{Name: "List Price ($)", Type: encoding.FieldTypeF64}}}
			job.IgnoreExtra = true
			var ce *perrors.CodedError
			if _, err := job.Predict(context.Background()); !errors.As(err, &ce) || ce.Code != perrors.PULSE_IMPORT_SCHEMA_FIELD_MISSING {
				t.Fatalf("old name: %v", err)
			}
		})
	}
}

func TestNullChannelForwarded(t *testing.T) {
	r := Wrap(open(t, pio.FormatNDJSON, zillowNDJSON), zillowRename)
	nr, ok := r.(pio.NullAwareReader)
	if !ok {
		t.Fatal("not NullAware")
	}
	if _, err := r.ReadHeader(); err != nil {
		t.Fatal(err)
	}
	var second []bool
	n := 0
	_ = r.ReadRows(context.Background(), func([]string) error {
		n++
		if n == 2 {
			second = append([]bool(nil), nr.RowNulls()...)
		}
		return nil
	})
	if len(second) < 2 || !second[1] {
		t.Fatalf("row nulls %v", second)
	}
	// CSV has no null channel: nil, as Pulse sees from the bare reader.
	c := Wrap(open(t, pio.FormatCSV, zillowCSV), zillowRename).(pio.NullAwareReader)
	if c.RowNulls() != nil {
		t.Fatal("csv row nulls")
	}
}

func reasonOf(t *testing.T, err error) string {
	t.Helper()
	var ce *perrors.CodedError
	if !errors.As(err, &ce) || ce.Code != Code {
		t.Fatalf("want %s, got %v", Code, err)
	}
	return ce.Details["reason"].(string)
}

func TestValidate(t *testing.T) {
	h := []string{"a", "b", "c"}
	if err := Validate(h, map[string]string{"a": "b", "b": "a"}); err != nil {
		t.Fatalf("swap: %v", err)
	}
	for _, tc := range []struct {
		m      map[string]string
		reason string
	}{
		{map[string]string{"x": "y"}, "unknown_column"},
		{map[string]string{"a": " "}, "empty"},
		{map[string]string{"a": " a1"}, "whitespace"},
		{map[string]string{"a": "c"}, "duplicate"},
		{map[string]string{"a": "z", "b": "z"}, "duplicate"},
		{map[string]string{"a": "\xff"}, "invalid_utf8"},
	} {
		if got := reasonOf(t, Validate(h, tc.m)); got != tc.reason {
			t.Errorf("%v: reason %q, want %q", tc.m, got, tc.reason)
		}
	}
	// The wrapped reader refuses at ReadHeader.
	_, err := Wrap(open(t, pio.FormatCSV, zillowCSV), map[string]string{"City": "list_price", "List Price ($)": "list_price"}).ReadHeader()
	if reasonOf(t, err) != "duplicate" {
		t.Fatal(err)
	}
}

func TestValidateFields(t *testing.T) {
	f := []string{"a", "b"}
	if err := ValidateFields(f, map[string]string{"A": "a"}); err != nil {
		t.Fatal(err)
	}
	if reasonOf(t, ValidateFields(f, map[string]string{"A": "zz"})) != "unknown_field" {
		t.Fatal("unknown field")
	}
	if reasonOf(t, ValidateFields(f, map[string]string{"A": "a", "B": "a"})) != "duplicate" {
		t.Fatal("dup")
	}
}

func TestSuggestAndSources(t *testing.T) {
	for in, want := range map[string]string{
		"Living Space (sq ft)": "living_space_sq_ft",
		"List Price ($)":       "list_price",
		"2020 Sales":           "c_2020_sales",
		"  Order--ID ":         "order_id",
		"Café":                 "café",
		"($)":                  "",
	} {
		if got := Suggest(in); got != want {
			t.Errorf("Suggest(%q) = %q, want %q", in, got, want)
		}
	}
	got := Sources([]string{"living_space_sq_ft", "City"}, zillowRename)
	if got[0] != "Living Space (sq ft)" || got[1] != "City" {
		t.Fatalf("sources %v", got)
	}
}
