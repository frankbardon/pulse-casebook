package server

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	pio "github.com/frankbardon/pulse/io"
	"github.com/spf13/afero"
)

// exportCohort builds people.pulse in s's workspace from a small CSV:
// an id, a categorical, a datetime and a field whose name is not a legal
// SPSS variable name ("home town").
func exportCohort(t *testing.T, s *Server) string {
	t.Helper()
	var b strings.Builder
	b.WriteString("id,region,seen_at,home town\n")
	for i := 1; i <= 12; i++ {
		b.WriteString(strings.Join([]string{
			strconv.Itoa(i),
			[]string{"west", "east", "north"}[i%3],
			"2024-03-0" + string(rune('1'+i%9)) + "T10:30:00Z",
			[]string{"Leeds", "York"}[i%2],
		}, ",") + "\n")
	}
	src := filepath.Join(t.TempDir(), "people.csv")
	if err := os.WriteFile(src, []byte(b.String()), 0o644); err != nil {
		t.Fatal(err)
	}
	rd, err := pio.NewReader(pio.FormatCSV, afero.NewOsFs(), src, pio.ReaderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	job := pio.NewImportJob(rd, filepath.Join(s.Root().Dir(), "people.pulse"))
	job.FS = afero.NewOsFs()
	if _, err := s.Engine().Import(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	return "people.pulse"
}

func getRaw(s *Server, url string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
	return rec
}

// postExport POSTs /api/export. On 200 it returns the streamed file and
// the decoded X-Studio-Export-Report; otherwise the JSON error body.
func postExport(t *testing.T, s *Server, body map[string]any) (int, map[string]any, []byte, http.Header) {
	t.Helper()
	raw, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/export", bytes.NewReader(raw)))
	if rec.Code != http.StatusOK {
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out, nil, rec.Header()
	}
	dec, err := url.PathUnescape(rec.Header().Get("X-Studio-Export-Report"))
	if err != nil {
		t.Fatalf("report header: %v", err)
	}
	var rep map[string]any
	if err := json.Unmarshal([]byte(dec), &rep); err != nil {
		t.Fatalf("report header %q: %v", dec, err)
	}
	return rec.Code, rep, rec.Body.Bytes(), rec.Header()
}

// noExportsDir asserts nothing was written to the workspace.
func noExportsDir(t *testing.T, s *Server) {
	t.Helper()
	if _, err := os.Stat(filepath.Join(s.Root().Dir(), "exports")); err == nil {
		t.Fatal("an exports/ directory was written")
	}
}

func refusalCode(out map[string]any) string {
	r, _ := out["refusal"].(map[string]any)
	c, _ := r["code"].(string)
	return c
}

func warningCodes(list any) []string {
	var codes []string
	items, _ := list.([]any)
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			codes = append(codes, m["code"].(string))
		}
	}
	return codes
}

func TestExportFormats(t *testing.T) {
	s := newImportServer(t, false)
	rec := getRaw(s, "/api/export/formats")
	if rec.Code != http.StatusOK {
		t.Fatalf("formats: %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, id := range []string{`"csv"`, `"tsv"`, `"ndjson"`, `"jsonarray"`, `"parquet"`, `"arrow"`, `"excel"`, `"spss"`, `"transfer"`} {
		if !strings.Contains(body, `"id":`+id) {
			t.Errorf("formats lack %s: %s", id, body)
		}
	}
	for _, key := range []string{"sanitize_names", "charset", "uncompressed", "ignore_sidecar", "level"} {
		if !strings.Contains(body, `"key":"`+key+`"`) {
			t.Errorf("formats lack option %s", key)
		}
	}
}

func TestExportCSVFieldsAndZone(t *testing.T) {
	s := newImportServer(t, true)
	cohort := exportCohort(t, s)

	code, pred := postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "csv", "fields": []string{"id", "seen_at"}, "time_zone": "Asia/Kolkata"})
	if code != http.StatusOK || pred["valid"] != true || pred["rows"] != float64(12) || pred["exported_fields"] != float64(2) || pred["name"] != "people.csv" {
		t.Fatalf("predict: %d %v", code, pred)
	}
	if _, ok := pred["exists"]; ok {
		t.Fatalf("predict still reports exists: %v", pred)
	}
	code, out, data, hdr := postExport(t, s, map[string]any{"cohort": cohort, "format": "csv", "fields": []string{"seen_at", "id"}, "time_zone": "Asia/Kolkata", "name": "subset"})
	if code != http.StatusOK || out["name"] != "subset.csv" || out["cohort"] != cohort {
		t.Fatalf("export: %d %v", code, out)
	}
	if cd := hdr.Get("Content-Disposition"); !strings.Contains(cd, "attachment") || !strings.Contains(cd, "filename=subset.csv") {
		t.Fatalf("Content-Disposition: %q", cd)
	}
	if hdr.Get("Content-Length") != strconv.Itoa(len(data)) || !strings.HasPrefix(hdr.Get("Content-Type"), "text/csv") {
		t.Fatalf("headers: %v", hdr)
	}
	rep := out["report"].(map[string]any)
	if rep["rows"] != float64(12) || rep["bytes"] != float64(len(data)) {
		t.Fatalf("report: %v", rep)
	}
	rows, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	// Source order, not request order; datetimes on Kolkata's wall clock.
	if len(rows) != 13 || strings.Join(rows[0], ",") != "id,seen_at" {
		t.Fatalf("header/rows: %v", rows)
	}
	if !strings.HasSuffix(rows[1][1], "16:00:00+05:30") {
		t.Fatalf("zone not applied: %v", rows[1])
	}

	// Exports are not stored: the same name streams again, nothing is
	// written or committed, and the old endpoints are gone.
	code, _, data, _ = postExport(t, s, map[string]any{"cohort": cohort, "format": "csv", "name": "subset.csv"})
	if code != http.StatusOK || !strings.HasPrefix(string(data), "id,region,seen_at,home town\n") {
		t.Fatalf("second export: %d %q", code, data)
	}
	noExportsDir(t, s)
	if st := gitOut(t, s.Root().Dir(), "status", "--porcelain", "--untracked-files=all"); st != "" {
		t.Fatalf("export left changes: %q", st)
	}
	if rec := getRaw(s, "/api/export/download?path=exports/subset.csv"); rec.Code != http.StatusNotFound {
		t.Fatalf("download endpoint still served: %d", rec.Code)
	}
}

func TestExportSPSSOptions(t *testing.T) {
	s := newImportServer(t, false)
	cohort := exportCohort(t, s)

	// "home town" cannot be an SPSS name: refused unless sanitize_names.
	code, pred := postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "spss"})
	if code != http.StatusOK || pred["valid"] != false || refusalCode(pred) == "" {
		t.Fatalf("predict unsanitized: %d %v", code, pred)
	}
	refused := refusalCode(pred)
	code, out, _, _ := postExport(t, s, map[string]any{"cohort": cohort, "format": "spss"})
	if code != http.StatusUnprocessableEntity || errCode(out) != refused {
		t.Fatalf("export unsanitized: %d %v (predict said %s)", code, out, refused)
	}
	noExportsDir(t, s)

	opts := map[string]any{"sanitize_names": true, "uncompressed": true}
	code, pred = postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "spss", "options": opts})
	if code != http.StatusOK || pred["valid"] != true || !contains(warningCodes(pred["warnings"]), "PULSE_SPSS_NAME_SANITIZED") {
		t.Fatalf("predict sanitized: %d %v", code, pred)
	}
	code, out, data, _ := postExport(t, s, map[string]any{"cohort": cohort, "format": "spss", "options": opts})
	if code != http.StatusOK || out["name"] != "people.sav" || !bytes.HasPrefix(data, []byte("$FL2")) {
		t.Fatalf("export sanitized: %d %v", code, out)
	}
	if w := warningCodes(out["report"].(map[string]any)["warnings"]); !contains(w, "PULSE_SPSS_NAME_SANITIZED") {
		t.Fatalf("export warnings: %v", w)
	}

	// A non-UTC zone is refused by the .sav writer, at predict time.
	code, pred = postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "spss", "options": opts, "time_zone": "Europe/Paris"})
	if code != http.StatusOK || refusalCode(pred) != "PULSE_SPSS_EXPORT_UNSUPPORTED" {
		t.Fatalf("predict spss tz: %d %v", code, pred)
	}
	// An unknown zone is Pulse's PULSE_TIMEZONE_UNKNOWN.
	code, pred = postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "csv", "time_zone": "Mars/Base"})
	if code != http.StatusOK || refusalCode(pred) != "PULSE_TIMEZONE_UNKNOWN" {
		t.Fatalf("predict bad tz: %d %v", code, pred)
	}
}

func TestExportTransferAndErrors(t *testing.T) {
	s := newImportServer(t, false)
	cohort := exportCohort(t, s)

	code, out, data, _ := postExport(t, s, map[string]any{"cohort": cohort, "format": "transfer", "options": map[string]any{"level": 5}})
	if code != http.StatusOK || out["name"] != "people.pulse.zst" || len(data) == 0 {
		t.Fatalf("transfer: %d %v", code, out)
	}
	tr := out["transfer"].(map[string]any)
	if tr["level"] != float64(5) || tr["codec"] != "zstd" || tr["output"] != "people.pulse.zst" || tr["compressed_bytes"] != float64(len(data)) {
		t.Fatalf("transfer report: %v", tr)
	}
	// zstd frame magic.
	if !bytes.HasPrefix(data, []byte{0x28, 0xb5, 0x2f, 0xfd}) {
		t.Fatalf("not a zstd frame: % x", data[:4])
	}
	noExportsDir(t, s)

	cases := []struct {
		name string
		body map[string]any
		code int
		err  string
	}{
		{"missing cohort", map[string]any{"format": "csv"}, 400, "missing_cohort"},
		{"not a cohort", map[string]any{"cohort": "a.json", "format": "csv"}, 400, "not_cohort"},
		{"no such cohort", map[string]any{"cohort": "nope.pulse", "format": "csv"}, 404, "not_found"},
		{"outside", map[string]any{"cohort": "../x.pulse", "format": "csv"}, 403, "path_outside"},
		{"format", map[string]any{"cohort": cohort, "format": "pulse"}, 400, "unknown_format"},
		{"option", map[string]any{"cohort": cohort, "format": "csv", "options": map[string]any{"sanitize_names": true}}, 400, "invalid_option"},
		{"option type", map[string]any{"cohort": cohort, "format": "spss", "options": map[string]any{"uncompressed": "yes"}}, 400, "invalid_option"},
		{"level range", map[string]any{"cohort": cohort, "format": "transfer", "options": map[string]any{"level": 40}}, 400, "invalid_option"},
		{"transfer fields", map[string]any{"cohort": cohort, "format": "transfer", "fields": []string{"id"}}, 400, "invalid_option"},
		{"label mode", map[string]any{"cohort": cohort, "format": "csv", "labels": []map[string]any{{"field": "region", "table": "t", "mode": "x"}}}, 400, "invalid_option"},
		{"name", map[string]any{"cohort": cohort, "format": "csv", "name": "../x"}, 400, "invalid_name"},
	}
	for _, c := range cases {
		code, out, _, _ := postExport(t, s, c.body)
		if code != c.code || errCode(out) != c.err {
			t.Errorf("%s: %d %v, want %d %s", c.name, code, out, c.code, c.err)
		}
	}

	// Header-level refusals in predict.
	code, pred := postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "csv", "fields": []string{"id", "nope"}})
	if code != http.StatusOK || refusalCode(pred) != "PULSE_EXPORT_FIELD_UNKNOWN" {
		t.Fatalf("unknown field: %d %v", code, pred)
	}
	code, pred = postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "csv", "labels": []map[string]any{{"field": "region", "table": "regions"}}})
	if code != http.StatusOK || refusalCode(pred) != "PULSE_LABEL_TABLE_UNKNOWN" {
		t.Fatalf("unknown table: %d %v", code, pred)
	}
}

func TestExportLabels(t *testing.T) {
	s := newImportServer(t, false)
	cohort := exportCohort(t, s)
	writeWS(t, s, "labels/regions.json", `{"rows":{"west":"West coast","east":"East coast","north":"The North"}}`)

	code, pred := postJSON(t, s, "/api/export/predict", map[string]any{"cohort": cohort, "format": "csv"})
	if code != http.StatusOK || !strings.Contains(stringOf(pred["label_tables"]), "regions") {
		t.Fatalf("label tables: %d %v", code, pred)
	}
	code, out, data, _ := postExport(t, s, map[string]any{"cohort": cohort, "format": "csv", "fields": []string{"id", "region"},
		"labels": []map[string]any{{"field": "region", "table": "regions", "mode": "augment"}}})
	if code != http.StatusOK {
		t.Fatalf("labelled export: %d %v", code, out)
	}
	if !strings.HasPrefix(string(data), "id,region,region_label\n") || !strings.Contains(string(data), "coast") {
		t.Fatalf("labelled csv: %q", data)
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func stringOf(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// Every format streams from memory: nothing lands in the workspace or the
// working directory.
func TestExportEveryFormatStreams(t *testing.T) {
	s := newImportServer(t, false)
	cohort := exportCohort(t, s)
	before, _ := os.ReadDir(s.Root().Dir())
	for _, f := range []string{"csv", "tsv", "ndjson", "jsonarray", "parquet", "arrow", "excel", "spss", "transfer"} {
		body := map[string]any{"cohort": cohort, "format": f}
		if f == "spss" {
			body["options"] = map[string]any{"sanitize_names": true}
		}
		code, out, data, hdr := postExport(t, s, body)
		if code != http.StatusOK || len(data) == 0 || !strings.Contains(hdr.Get("Content-Disposition"), "people.") {
			t.Errorf("%s: %d %v", f, code, out)
		}
	}
	after, _ := os.ReadDir(s.Root().Dir())
	if len(after) != len(before) {
		t.Fatalf("export wrote into the workspace: %v → %v", before, after)
	}
}
