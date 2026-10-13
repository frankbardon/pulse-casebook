package importer

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	pio "github.com/frankbardon/pulse/io"
)

func TestSanitizeUploadName(t *testing.T) {
	tests := []struct {
		in, want string
		bad      bool
	}{
		{in: "sales.csv", want: "sales.csv"},
		{in: "Q1 sales (final).csv", want: "Q1_sales_final_.csv"},
		{in: "  données.ndjson ", want: "données.ndjson"},
		{in: ".hidden.csv", want: "hidden.csv"},
		{in: "../etc/passwd", bad: true},
		{in: "..\\secret.csv", bad: true},
		{in: "/abs.csv", bad: true},
		{in: "a\x00.csv", bad: true},
		{in: "..", bad: true},
		{in: ".", bad: true},
		{in: "", bad: true},
		{in: "***", bad: true},
		{in: strings.Repeat("x", 300) + ".parquet", want: strings.Repeat("x", 120-len(".parquet")) + ".parquet"},
	}
	for _, tc := range tests {
		got, err := SanitizeUploadName(tc.in)
		if tc.bad {
			if !errors.Is(err, ErrBadName) {
				t.Errorf("SanitizeUploadName(%q) = %q, %v; want ErrBadName", tc.in, got, err)
			}
			continue
		}
		if err != nil || got != tc.want {
			t.Errorf("SanitizeUploadName(%q) = %q, %v; want %q", tc.in, got, err, tc.want)
		}
	}
}

func TestDedupeName(t *testing.T) {
	taken := map[string]bool{"a.csv": true, "a-2.csv": true}
	if got := DedupeName("a.csv", func(s string) bool { return taken[s] }); got != "a-3.csv" {
		t.Fatalf("got %q", got)
	}
	if got := DedupeName("b.csv", func(s string) bool { return taken[s] }); got != "b.csv" {
		t.Fatalf("got %q", got)
	}
}

func TestTargetAndNames(t *testing.T) {
	tests := []struct {
		in, rel, spec string
		ok            bool
	}{
		{"sales", "sales.pulse", "imports/sales.import.json", true},
		{"cohorts/sales.pulse", "cohorts/sales.pulse", "imports/sales.import.json", true},
		{"a/b", "", "", false},
		{"sales.csv/x", "", "", false},
		{"", "", "", false},
		{"bad name", "", "", false},
		{"-x", "", "", false},
	}
	for _, tc := range tests {
		rel, ok := TargetPath(tc.in)
		if ok != tc.ok || rel != tc.rel {
			t.Errorf("TargetPath(%q) = %q, %v", tc.in, rel, ok)
			continue
		}
		if ok && SpecPath(rel) != tc.spec {
			t.Errorf("SpecPath(%q) = %q", rel, SpecPath(rel))
		}
	}
	if n, ok := SchemaName("orders.schema.json"); !ok || n != "orders" {
		t.Fatalf("SchemaName = %q %v", n, ok)
	}
	if _, ok := SchemaName("../x"); ok {
		t.Fatal("SchemaName accepted a path")
	}
}

func TestParseSchema(t *testing.T) {
	good := `[{"name":"id","type":"u32","nullable":false,"description":"key"},{"name":"amt","type":"decimal128","nullable":true,"description":"","precision":10,"scale":2}]`
	fields, s, err := ParseSchema([]byte(good))
	if err != nil {
		t.Fatal(err)
	}
	if len(fields) != 2 || len(s.Fields) != 2 || s.Fields[1].Precision != 10 || s.Fields[0].Description != "key" {
		t.Fatalf("bad schema %+v", s.Fields)
	}
	if rt := Template(s); rt[1].Scale != 2 || rt[0].Type != "u32" {
		t.Fatalf("template %+v", rt)
	}
	bad := []struct{ doc, reason string }{
		{`{"name":"x"}`, "malformed"},
		{`[]`, "empty"},
		{`[{"name":"","type":"u8"}]`, "missing_name"},
		{`[{"name":"a","type":"u8"},{"name":"a","type":"u8"}]`, "duplicate"},
		{`[{"name":"a","type":"int"}]`, "unknown_type"},
		{`[{"name":"a","type":"decimal128"}]`, "missing_precision"},
	}
	for _, tc := range bad {
		_, _, err := ParseSchema([]byte(tc.doc))
		var se *SchemaError
		if !errors.As(err, &se) || se.Reason != tc.reason {
			t.Errorf("%s: err %v, want reason %s", tc.doc, err, tc.reason)
		}
		if tc.reason == "unknown_type" && len(se.Details()["valid"].([]string)) < 20 {
			t.Errorf("unknown_type details lack the valid list")
		}
	}
}

func TestFingerprint(t *testing.T) {
	if got := NormalizeName("  Order  ID "); got != "order_id" {
		t.Fatalf("NormalizeName = %q", got)
	}
	if NormalizeName("order-id") != NormalizeName("ORDER_ID") {
		t.Fatal("separators not folded")
	}
	tests := map[string]string{
		"u8": CoarseNumeric, "f32": CoarseNumeric, "decimal128": CoarseNumeric, "u4": CoarseNumeric,
		"categorical_u16": CoarseCategorical, "date": CoarseTemporal, "datetime": CoarseTemporal,
		"packed_bool": CoarseBool, "set_u8": CoarseSet, "numeric": CoarseNumeric, "nope": CoarseUnknown,
	}
	for in, want := range tests {
		if got := CoarseType(in); got != want {
			t.Errorf("CoarseType(%q) = %q, want %q", in, got, want)
		}
	}
	a := FingerprintOf([]Column{{Name: "b", Type: "u8"}, {Name: "A", Type: "u16"}})
	b := FingerprintOf([]Column{{Name: "a", Type: "f64"}, {Name: "B ", Type: "u32"}})
	if Score(a, b) != 1 {
		t.Fatalf("order/rung-insensitive fingerprints differ: %v %v", a, b)
	}
}

func TestRank(t *testing.T) {
	input := []Column{
		{Name: "order_id", Type: "u32"}, {Name: "region", Type: "categorical_u8"},
		{Name: "units", Type: "u16"}, {Name: "sold_on", Type: "date"}, {Name: "promo", Type: "packed_bool"},
	}
	cands := []Candidate{
		{Name: "exact", Path: "schemas/exact.schema.json", Columns: []Column{
			{Name: "Order ID", Type: "u64", Nullable: true, Description: "key"}, {Name: "Region", Type: "categorical_u16"},
			{Name: "units", Type: "u8"}, {Name: "sold-on", Type: "datetime"}, {Name: "promo", Type: "packed_bool"},
		}},
		{Name: "missing_one", Columns: []Column{
			{Name: "order_id", Type: "u32"}, {Name: "region", Type: "categorical_u8"},
			{Name: "units", Type: "u16"}, {Name: "sold_on", Type: "date"},
		}},
		{Name: "retyped", Columns: []Column{
			{Name: "order_id", Type: "u32"}, {Name: "region", Type: "u8"},
			{Name: "units", Type: "u16"}, {Name: "sold_on", Type: "date"}, {Name: "promo", Type: "packed_bool"},
		}},
		{Name: "unrelated", Columns: []Column{{Name: "x", Type: "u8"}}},
	}
	got := Rank(input, cands, 0)
	var names []string
	for _, m := range got {
		names = append(names, m.Name)
	}
	if strings.Join(names, ",") != "exact,retyped,missing_one" {
		t.Fatalf("ranking %v", names)
	}
	ex := got[0]
	if !ex.Exact || ex.Score != 1 || !ex.Suggest || len(ex.Diff.Added)+len(ex.Diff.Missing)+len(ex.Diff.Retyped) != 0 {
		t.Fatalf("exact match %+v", ex)
	}
	// Merged keeps the INPUT's names (exact-name import matching) with
	// the saved types.
	if m := ex.Merged[0]; m.Name != "order_id" || m.Type != "u64" || !m.Nullable || m.Description != "key" || m.New {
		t.Fatalf("merged[0] %+v", m)
	}
	re := got[1]
	if re.Score != 0.9 || re.Exact || !re.Suggest || len(re.Diff.Retyped) != 1 || re.Diff.Retyped[0] != (Retyped{Name: "region", Saved: "u8", Input: "categorical_u8"}) {
		t.Fatalf("retyped match %+v", re)
	}
	mo := got[2]
	if mo.Score != 0.8 || !mo.Suggest || strings.Join(mo.Diff.Added, ",") != "promo" || len(mo.Diff.Missing) != 0 {
		t.Fatalf("missing_one match %+v", mo)
	}
	if last := mo.Merged[len(mo.Merged)-1]; !last.New || last.Type != "packed_bool" {
		t.Fatalf("new column not flagged: %+v", last)
	}
	if lim := Rank(input, cands, 1); len(lim) != 1 {
		t.Fatalf("limit ignored: %d", len(lim))
	}
}

func TestSampleSource(t *testing.T) {
	dir := t.TempDir()
	var b strings.Builder
	b.WriteString("id,region,score,note\n")
	for i := 1; i <= 30; i++ {
		region := []string{"west", "east", "north"}[i%3]
		score := "" // null every 5th row
		if i%5 != 0 {
			score = fmt.Sprintf("%.1f", float64(i)/10)
		}
		note := "n/a" // a null token on odd rows
		if i%2 == 0 {
			note = "hello"
		}
		fmt.Fprintf(&b, "%d,%s,%s,%s\n", i, region, score, note)
	}
	path := filepath.Join(dir, "s.csv")
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		t.Fatal(err)
	}
	rd, f, err := OpenReader(path, "", Options{})
	if err != nil || f != pio.FormatCSV {
		t.Fatalf("OpenReader: %v %v", f, err)
	}
	defer rd.Close()
	res, err := SampleSource(context.Background(), rd, 25, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Rows) != 20 || res.Sampled != 25 || !res.More {
		t.Fatalf("rows %d sampled %d more %v", len(res.Rows), res.Sampled, res.More)
	}
	if strings.Join(res.Header, ",") != "id,region,score,note" || *res.Rows[0][1] != "east" {
		t.Fatalf("header/rows %v %v", res.Header, *res.Rows[0][1])
	}
	id, region, score, note := res.Stats[0], res.Stats[1], res.Stats[2], res.Stats[3]
	id.SetNumeric()
	if id.Distinct != 25 || id.Nulls != 0 || *id.Min != 1 || *id.Max != 25 {
		t.Fatalf("id stats %+v", id)
	}
	if region.Distinct != 3 {
		t.Fatalf("region distinct %d", region.Distinct)
	}
	region.SetNumeric()
	if region.Min != nil {
		t.Fatal("categorical got min/max")
	}
	if score.Nulls != 5 || score.NullPct != 20 {
		t.Fatalf("score nulls %d pct %v", score.Nulls, score.NullPct)
	}
	if note.Nulls != 13 || note.Distinct != 1 {
		t.Fatalf("note nulls %d distinct %d", note.Nulls, note.Distinct)
	}
}

func TestOptionsApply(t *testing.T) {
	job := pio.NewImportJob(nil, "x")
	o := Options{SampleRows: 120, FloatWidth: "f32", Overrides: map[string]string{"a": "u16"}, DSTPolicy: "later", IgnoreExtra: true}
	if err := o.Apply(job); err != nil {
		t.Fatal(err)
	}
	if job.SampleRows != 120 || job.FloatWidth != "f32" || job.ColumnTypeOverrides["a"].String() != "u16" || job.DSTPolicy != pio.DSTPolicyLater || !job.IgnoreExtra {
		t.Fatalf("job %+v", job)
	}
	for _, bad := range []Options{{Overrides: map[string]string{"a": "int"}}, {DSTPolicy: "never"}, {SampleRows: -1}} {
		var oe *OptionError
		if err := bad.Apply(pio.NewImportJob(nil, "x")); !errors.As(err, &oe) {
			t.Errorf("%+v: %v", bad, err)
		}
	}
	if (Options{}).EffectiveSampleRows() != 500 || (Options{SampleRows: 10}).EffectiveSampleRows() != 50 {
		t.Fatal("EffectiveSampleRows")
	}
}
