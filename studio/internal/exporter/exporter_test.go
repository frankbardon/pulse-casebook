package exporter

import (
	"errors"
	"testing"
)

func TestFormats(t *testing.T) {
	ids := []string{}
	for _, f := range Formats() {
		ids = append(ids, f.ID)
	}
	want := []string{"csv", "tsv", "ndjson", "jsonarray", "parquet", "arrow", "excel", "spss", "transfer"}
	if len(ids) != len(want) {
		t.Fatalf("formats %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("formats %v, want %v", ids, want)
		}
	}
	if f, _ := Lookup("transfer"); f.Supports.Fields || f.Supports.TimeZone {
		t.Fatalf("transfer supports %+v", f.Supports)
	}
	if f, _ := Lookup("spss"); !f.UTCOnly || len(f.Options) != 4 {
		t.Fatalf("spss %+v", f)
	}
}

func TestDecode(t *testing.T) {
	spss, _ := Lookup("spss")
	s, err := Decode(spss, map[string]any{"sanitize_names": true, "charset": " windows-1252 ", "uncompressed": false, "ignore_sidecar": nil})
	if err != nil || !s.Writer.SPSS.SanitizeNames || s.Writer.SPSS.Charset != "windows-1252" || s.Writer.SPSS.Uncompressed {
		t.Fatalf("spss: %+v %v", s, err)
	}
	tr, _ := Lookup("transfer")
	if s, err := Decode(tr, map[string]any{"level": float64(19)}); err != nil || s.Level != 19 {
		t.Fatalf("level: %+v %v", s, err)
	}
	csv, _ := Lookup("csv")
	bad := []struct {
		f    Format
		opts map[string]any
		opt  string
	}{
		{csv, map[string]any{"charset": "x"}, "charset"},
		{spss, map[string]any{"sanitize_names": "yes"}, "sanitize_names"},
		{spss, map[string]any{"charset": 1.0}, "charset"},
		{tr, map[string]any{"level": 2.5}, "level"},
		{tr, map[string]any{"level": 0.0}, "level"},
		{tr, map[string]any{"level": 23.0}, "level"},
	}
	for _, c := range bad {
		_, err := Decode(c.f, c.opts)
		var oe *OptionError
		if !errors.As(err, &oe) || oe.Option != c.opt {
			t.Errorf("%s %v: %v", c.f.ID, c.opts, err)
		}
	}
}

func TestFileName(t *testing.T) {
	csv, _ := Lookup("csv")
	tr, _ := Lookup("transfer")
	cases := []struct {
		name string
		f    Format
		want string
		ok   bool
	}{
		{"sales", csv, "sales.csv", true},
		{"sales.csv", csv, "sales.csv", true},
		{"sales.CSV", csv, "sales.CSV", true},
		{"q1.sales", csv, "q1.sales.csv", true},
		{"orders", tr, "orders.pulse.zst", true},
		{"orders.pulse.zst", tr, "orders.pulse.zst", true},
		{"", csv, "", false},
		{"../x", csv, "", false},
		{".hidden", csv, "", false},
		{"a b", csv, "", false},
		{".csv", csv, "", false},
	}
	for _, c := range cases {
		got, ok := FileName(c.name, c.f)
		if got != c.want || ok != c.ok {
			t.Errorf("FileName(%q, %s) = %q %v, want %q %v", c.name, c.f.ID, got, ok, c.want, c.ok)
		}
	}
	if got := DefaultName("data/ab_test.pulse", csv); got != "ab_test.csv" {
		t.Errorf("DefaultName = %q", got)
	}
	if FormatOfPath("exports/x.pulse.zst") != "transfer" || FormatOfPath("exports/x.xlsx") != "excel" {
		t.Error("FormatOfPath")
	}
}
