package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/frankbardon/pulse"
	pio "github.com/frankbardon/pulse/io"
	"github.com/spf13/afero"

	"github.com/frankbardon/pulse-casebook/studio/internal/importer"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// salesCSV is a small fixture: 40 rows, a categorical, a nullable float,
// a date.
func salesCSV(rows int) string {
	var b strings.Builder
	b.WriteString("order_id,region,revenue,sold_on\n")
	for i := 1; i <= rows; i++ {
		rev := fmt.Sprintf("%d.%02d", i*3, i%100)
		if i%10 == 0 {
			rev = ""
		}
		fmt.Fprintf(&b, "%d,%s,%s,2024-01-%02d\n", i, []string{"west", "east", "north", "south"}[i%4], rev, 1+i%28)
	}
	return b.String()
}

// newImportServer is a server with a real engine over a fresh temp
// workspace, git history on (isolated from the user's config).
func newImportServer(t *testing.T, git bool) *Server {
	t.Helper()
	root, err := scope.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	engine, err := pulse.New(pulse.Options{DataDir: root.Dir()})
	if err != nil {
		t.Fatal(err)
	}
	s := New(root, engine, Config{}, nil, false)
	if git {
		withHistory(t, s)
	}
	return s
}

func upload(t *testing.T, s *Server, query, name, content string) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("note", "ignored")
	fw, err := mw.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = fw.Write([]byte(content))
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/sources"+query, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

func listFiles(t *testing.T, s *Server) map[string]map[string]any {
	t.Helper()
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/files", nil))
	var out struct {
		Files []map[string]any `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	m := map[string]map[string]any{}
	for _, f := range out.Files {
		m[f["path"].(string)] = f
	}
	return m
}

func TestUploadSources(t *testing.T) {
	s := newImportServer(t, false)
	dir := s.Root().Dir()

	code, body := upload(t, s, "", "Q1 sales.csv", salesCSV(5))
	if code != http.StatusCreated || body["path"] != "sources/Q1_sales.csv" || body["format"] != "csv" {
		t.Fatalf("upload: %d %v", code, body)
	}
	data, err := os.ReadFile(filepath.Join(dir, "sources", "Q1_sales.csv"))
	if err != nil || string(data) != salesCSV(5) {
		t.Fatalf("stored bytes: %v", err)
	}
	if body["sha256"] != hashOf(data) || body["size"] != float64(len(data)) {
		t.Fatalf("hash/size: %v", body)
	}
	// Same bytes again: reused.
	code, body = upload(t, s, "", "Q1 sales.csv", salesCSV(5))
	if code != http.StatusOK || body["existing"] != true || body["path"] != "sources/Q1_sales.csv" {
		t.Fatalf("re-upload: %d %v", code, body)
	}
	// Different bytes, same name: deduped, unless overwrite.
	code, body = upload(t, s, "", "Q1 sales.csv", salesCSV(6))
	if code != http.StatusCreated || body["path"] != "sources/Q1_sales-2.csv" {
		t.Fatalf("dedupe: %d %v", code, body)
	}
	code, body = upload(t, s, "?overwrite=1", "Q1 sales.csv", salesCSV(7))
	if code != http.StatusCreated || body["path"] != "sources/Q1_sales.csv" {
		t.Fatalf("overwrite: %d %v", code, body)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "sources", "Q1_sales.csv")); string(data) != salesCSV(7) {
		t.Fatal("overwrite did not replace")
	}
	// No temp files left behind.
	ents, _ := os.ReadDir(filepath.Join(dir, "sources"))
	for _, e := range ents {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Fatalf("temp file left: %s", e.Name())
		}
	}

	// Refusals.
	for _, tc := range []struct {
		name, code string
		status     int
	}{
		{"../../escape.csv", "invalid_name", 400},
		{"..", "invalid_name", 400},
		{"notes.txt", "unsupported_format", 415},
		{"cohort.pulse", "unsupported_format", 415},
	} {
		code, body := upload(t, s, "", tc.name, "a,b\n1,2\n")
		if code != tc.status || errCode(body) != tc.code {
			t.Errorf("%s: %d %v", tc.name, code, body)
		}
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "escape.csv")); err == nil {
		t.Fatal("traversal wrote outside the workspace")
	}

	// Size cap.
	s.cfg.MaxUpload = 64
	code, body = upload(t, s, "", "big.csv", salesCSV(20))
	if code != http.StatusRequestEntityTooLarge || errCode(body) != "too_large" {
		t.Fatalf("cap: %d %v", code, body)
	}
	if _, err := os.Stat(filepath.Join(dir, "sources", "big.csv")); err == nil {
		t.Fatal("oversized upload kept")
	}

	// No file part.
	req := httptest.NewRequest(http.MethodPost, "/api/sources", strings.NewReader("x"))
	req.Header.Set("Content-Type", "text/plain")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("non-multipart: %d", rec.Code)
	}

	// The catalog lists sources with format and size.
	files := listFiles(t, s)
	if f := files["sources/Q1_sales.csv"]; f["kind"] != "source" || f["format"] != "csv" || f["size"] == nil {
		t.Fatalf("catalog source entry: %v", f)
	}
}

func hashOf(b []byte) string { return importer.HashBytes(b) }

func writeWS(t *testing.T, s *Server, rel, content string) {
	t.Helper()
	p := filepath.Join(s.Root().Dir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestImportPredict(t *testing.T) {
	s := newImportServer(t, false)
	writeWS(t, s, "sources/sales.csv", salesCSV(40))

	code, body := postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/sales.csv", "options": map[string]any{"sample_rows": 50}})
	if code != 200 || body["valid"] != true {
		t.Fatalf("predict: %d %v", code, body)
	}
	if rows := body["rows"].([]any); len(rows) != 20 {
		t.Fatalf("preview rows = %d", len(rows))
	}
	if sm := body["sample"].(map[string]any); sm["rows"] != float64(40) || sm["more"] != false || sm["sample_rows"] != float64(50) {
		t.Fatalf("sample info %v", sm)
	}
	if body["estimated_rows"] != float64(40) {
		t.Fatalf("estimated_rows %v", body["estimated_rows"])
	}
	cols := body["columns"].([]any)
	if len(cols) != 4 {
		t.Fatalf("columns %v", cols)
	}
	byName := map[string]map[string]any{}
	for _, c := range cols {
		m := c.(map[string]any)
		byName[m["name"].(string)] = m
	}
	rev := byName["revenue"]
	if rev["type"] != "f64" || rev["nullable"] != true || rev["included"] != true {
		t.Fatalf("revenue column %v", rev)
	}
	st := rev["stats"].(map[string]any)
	if st["nulls"] != float64(4) || st["null_pct"] != float64(10) || st["min"] != 3.01 || st["max"] == nil {
		t.Fatalf("revenue stats %v", st)
	}
	if !strings.HasPrefix(byName["region"]["type"].(string), "categorical_") || byName["region"]["stats"].(map[string]any)["min"] != nil {
		t.Fatalf("region %v", byName["region"])
	}
	if byName["sold_on"]["type"] != "date" {
		t.Fatalf("sold_on %v", byName["sold_on"])
	}
	if len(byName["order_id"]["samples"].([]any)) != 20 {
		t.Fatal("samples")
	}
	if sch := body["schema"].([]any); len(sch) != 4 {
		t.Fatalf("schema doc %v", sch)
	}
	if len(body["field_types"].([]any)) < 20 {
		t.Fatal("field_types")
	}

	// NDJSON source.
	writeWS(t, s, "sources/events.ndjson", "{\"user\":\"a\",\"n\":1}\n{\"user\":\"b\",\"n\":null}\n{\"user\":\"a\",\"n\":3}\n")
	code, body = postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/events.ndjson"})
	if code != 200 || body["valid"] != true || body["format"] != "ndjson" {
		t.Fatalf("ndjson predict: %d %v", code, body)
	}
	nst := body["columns"].([]any)[1].(map[string]any)["stats"].(map[string]any)
	if nst["nulls"] != float64(1) {
		t.Fatalf("ndjson null not counted: %v", nst)
	}

	// Parquet source, written with the public writer.
	w, err := pio.NewWriter(pio.FormatParquet, afero.NewOsFs(), filepath.Join(s.Root().Dir(), "sources", "p.parquet"), pio.WriterOptions{})
	if err != nil {
		t.Fatal(err)
	}
	_ = w.WriteHeader([]string{"k", "v"})
	for i := 0; i < 5; i++ {
		_ = w.WriteRow([]any{fmt.Sprint(i), fmt.Sprint(i * 2)})
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	code, body = postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/p.parquet"})
	if code != 200 || body["valid"] != true || len(body["rows"].([]any)) != 5 {
		t.Fatalf("parquet predict: %d %v", code, body)
	}

	// A Pulse refusal is valid:false with the refusal located to a column.
	code, body = postJSON(t, s, "/api/import/predict", map[string]any{
		"source": "sources/sales.csv",
		"schema": []map[string]any{{"name": "order_id", "type": "u32"}, {"name": "nope", "type": "u8"}},
	})
	if code != 200 || body["valid"] != false {
		t.Fatalf("refusal predict: %d %v", code, body)
	}
	ref := body["refusal"].(map[string]any)
	if ref["code"] != "PULSE_IMPORT_SCHEMA_FIELD_MISSING" || ref["column"] != "nope" {
		t.Fatalf("refusal %v", ref)
	}
	if len(body["rows"].([]any)) != 20 {
		t.Fatal("refusal response lacks the sample")
	}

	// Overrides via top-level field.
	code, body = postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/sales.csv", "overrides": map[string]string{"order_id": "u64"}})
	if code != 200 || body["valid"] != true || body["columns"].([]any)[0].(map[string]any)["type"] != "u64" {
		t.Fatalf("override predict: %d %v", code, body)
	}

	// Request errors.
	for _, tc := range []struct {
		body   map[string]any
		status int
		code   string
	}{
		{map[string]any{}, 400, "missing_source"},
		{map[string]any{"source": "../outside.csv"}, 403, "path_outside"},
		{map[string]any{"source": "sources/none.csv"}, 404, "source_not_found"},
		{map[string]any{"source": "sources/sales.csv", "schema": "nope"}, 404, "schema_not_found"},
		{map[string]any{"source": "sources/sales.csv", "schema": []any{}}, 400, "invalid_schema"},
		{map[string]any{"source": "sources/sales.csv", "options": map[string]any{"dst_policy": "x"}}, 400, "invalid_option"},
		{map[string]any{"source": "sources/sales.csv", "options": map[string]any{"sample_rows": 10_000_000}}, 400, "invalid_option"},
	} {
		code, body := postJSON(t, s, "/api/import/predict", tc.body)
		if code != tc.status || errCode(body) != tc.code {
			t.Errorf("%v: %d %v", tc.body, code, body)
		}
	}
}

var salesSchema = []map[string]any{
	{"name": "order_id", "type": "u32", "nullable": false, "description": "order key"},
	{"name": "region", "type": "categorical_u8", "nullable": false, "description": ""},
	{"name": "revenue", "type": "f64", "nullable": true, "description": ""},
	{"name": "sold_on", "type": "date", "nullable": false, "description": ""},
}

func TestSchemasSaveListMatch(t *testing.T) {
	s := newImportServer(t, true)
	dir := s.Root().Dir()

	code, body := postJSON(t, s, "/api/schemas", map[string]any{"name": "sales", "schema": salesSchema})
	if code != http.StatusCreated || body["path"] != "schemas/sales.schema.json" || body["commit"] == nil {
		t.Fatalf("save: %d %v", code, body)
	}
	text, _ := os.ReadFile(filepath.Join(dir, "schemas", "sales.schema.json"))
	if string(text) != body["text"] || !strings.HasPrefix(string(text), "[\n  {\"description\": \"order key\", \"name\": \"order_id\"") {
		t.Fatalf("on-disk schema:\n%s", text)
	}
	if got := gitOut(t, dir, "log", "-1", "--format=%s"); got != "studio: save schema schemas/sales.schema.json" {
		t.Fatalf("commit message %q", got)
	}
	// Exists without overwrite; overwrite works.
	code, body = postJSON(t, s, "/api/schemas", map[string]any{"name": "sales.schema.json", "schema": salesSchema})
	if code != http.StatusConflict || errCode(body) != "exists" {
		t.Fatalf("conflict: %d %v", code, body)
	}
	code, body = postJSON(t, s, "/api/schemas", map[string]any{"name": "sales", "schema": salesSchema[:3], "overwrite": true})
	if code != 200 || body["created"] != false {
		t.Fatalf("overwrite: %d %v", code, body)
	}
	postJSON(t, s, "/api/schemas", map[string]any{"name": "sales", "schema": salesSchema, "overwrite": true})
	postJSON(t, s, "/api/schemas", map[string]any{"name": "other", "schema": []map[string]any{{"name": "x", "type": "u8"}, {"name": "region", "type": "u8"}}})

	for _, tc := range []struct {
		body map[string]any
		code string
	}{
		{map[string]any{"name": "../x", "schema": salesSchema}, "invalid_name"},
		{map[string]any{"name": "x"}, "missing_schema"},
		{map[string]any{"name": "x", "schema": []map[string]any{{"name": "a", "type": "int"}}}, "invalid_schema"},
	} {
		code, body := postJSON(t, s, "/api/schemas", tc.body)
		if code != 400 || errCode(body) != tc.code {
			t.Errorf("%v: %d %v", tc.body, code, body)
		}
	}

	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/schemas", nil))
	var list struct {
		Schemas []struct {
			Name        string `json:"name"`
			Fields      int    `json:"fields"`
			Fingerprint []struct{ Name, Type string }
		} `json:"schemas"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Schemas) != 2 || list.Schemas[1].Name != "sales" || list.Schemas[1].Fields != 4 || list.Schemas[1].Fingerprint[0].Name != "order_id" {
		t.Fatalf("list: %s", rec.Body.String())
	}

	code, body = postJSON(t, s, "/api/schemas/match", map[string]any{"columns": []map[string]any{
		{"name": "Order ID", "type": "u64"}, {"name": "region", "type": "categorical_u16"},
		{"name": "revenue", "type": "f32"}, {"name": "sold_on", "type": "date"},
	}})
	if code != 200 {
		t.Fatalf("match: %d %v", code, body)
	}
	ms := body["matches"].([]any)
	if len(ms) != 2 || body["threshold"] != 0.8 {
		t.Fatalf("matches %v", ms)
	}
	top := ms[0].(map[string]any)
	if top["name"] != "sales" || top["exact"] != true || top["score"] != float64(1) {
		t.Fatalf("top match %v", top)
	}
	if code, body := postJSON(t, s, "/api/schemas/match", map[string]any{}); code != 400 || errCode(body) != "missing_columns" {
		t.Fatalf("empty match: %d %v", code, body)
	}

	// Predict ranks saved schemas against its inferred columns.
	writeWS(t, s, "sources/sales.csv", salesCSV(40))
	_, body = postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/sales.csv"})
	if pm := body["matches"].([]any); len(pm) == 0 || pm[0].(map[string]any)["name"] != "sales" || pm[0].(map[string]any)["exact"] != true {
		t.Fatalf("predict matches %v", body["matches"])
	}
}

func TestImportAndRebuild(t *testing.T) {
	s := newImportServer(t, true)
	dir := s.Root().Dir()
	// A user file the studio must never commit.
	writeWS(t, s, "notes.json", "{}")
	writeWS(t, s, "sources/sales.csv", salesCSV(40))
	postJSON(t, s, "/api/schemas", map[string]any{"name": "sales", "schema": salesSchema})

	code, body := postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "schema": "sales", "target": "cohorts/sales.pulse"})
	if code != http.StatusCreated {
		t.Fatalf("import: %d %v", code, body)
	}
	rep := body["report"].(map[string]any)
	if rep["rows_imported"] != float64(40) || rep["row_error_count"] != float64(0) || body["spec"] != "imports/sales.import.json" || body["commit"] == nil {
		t.Fatalf("import body %v", body)
	}
	if _, err := os.Stat(filepath.Join(dir, "cohorts", "sales.pulse")); err != nil {
		t.Fatal("cohort not written")
	}
	// The cohort opens in the engine.
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/cohort/inspect?path=cohorts/sales.pulse", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "order key") {
		t.Fatalf("inspect: %d %s", rec.Code, rec.Body.String())
	}
	var spec map[string]any
	raw, _ := os.ReadFile(filepath.Join(dir, "imports", "sales.import.json"))
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	src := spec["source"].(map[string]any)
	if spec["target"] != "cohorts/sales.pulse" || src["path"] != "sources/sales.csv" || src["sha256"] != hashOf([]byte(salesCSV(40))) || src["format"] != "csv" {
		t.Fatalf("spec %s", raw)
	}
	if sc := spec["schema"].(map[string]any); sc["ref"] != "sales" || sc["sha256"] == "" || sc["path"] != "schemas/sales.schema.json" {
		t.Fatalf("spec schema %v", sc)
	}
	if li := spec["last_import"].(map[string]any); li["rows_imported"] != float64(40) {
		t.Fatalf("last_import %v", li)
	}
	// Git: the spec is committed, binaries and unrelated files are not.
	if got := gitOut(t, dir, "log", "-1", "--format=%s"); got != "studio: import cohorts/sales.pulse" {
		t.Fatalf("commit %q", got)
	}
	tracked := gitOut(t, dir, "ls-files")
	if !strings.Contains(tracked, "imports/sales.import.json") || !strings.Contains(tracked, "schemas/sales.schema.json") ||
		strings.Contains(tracked, ".pulse") || strings.Contains(tracked, "sources/") || strings.Contains(tracked, "notes.json") {
		t.Fatalf("tracked:\n%s", tracked)
	}

	// Catalog: cohort links its spec; spec state ok.
	files := listFiles(t, s)
	if f := files["cohorts/sales.pulse"]; f["spec"] != "imports/sales.import.json" {
		t.Fatalf("cohort entry %v", f)
	}
	if f := files["imports/sales.import.json"]; f["kind"] != "import" || f["state"] != "ok" || f["target"] != "cohorts/sales.pulse" {
		t.Fatalf("spec entry %v", f)
	}
	if f := files["schemas/sales.schema.json"]; f["kind"] != "schema" {
		t.Fatalf("schema entry %v", f)
	}

	// Re-import onto the existing target needs overwrite.
	code, body = postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "target": "cohorts/sales.pulse"})
	if code != http.StatusConflict || errCode(body) != "exists" {
		t.Fatalf("re-import: %d %v", code, body)
	}
	// Another target whose spec name would collide.
	code, body = postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "target": "sales"})
	if code != http.StatusConflict || errCode(body) != "spec_conflict" {
		t.Fatalf("spec conflict: %d %v", code, body)
	}

	// Missing cohort → needs_rebuild → rebuild restores it.
	if err := os.Remove(filepath.Join(dir, "cohorts", "sales.pulse")); err != nil {
		t.Fatal(err)
	}
	if f := listFiles(t, s)["imports/sales.import.json"]; f["state"] != "needs_rebuild" {
		t.Fatalf("needs_rebuild state: %v", f)
	}
	code, body = postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/sales.import.json"})
	if code != 200 || body["report"].(map[string]any)["rows_imported"] != float64(40) || body["source_changed"] == true {
		t.Fatalf("rebuild: %d %v", code, body)
	}
	if _, err := os.Stat(filepath.Join(dir, "cohorts", "sales.pulse")); err != nil {
		t.Fatal("rebuild did not restore the cohort")
	}

	// Changed source: refused with a clear code, then forced.
	writeWS(t, s, "sources/sales.csv", salesCSV(50))
	code, body = postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/sales.import.json"})
	if code != http.StatusConflict || errCode(body) != "source_changed" {
		t.Fatalf("changed source: %d %v", code, body)
	}
	det := body["error"].(map[string]any)["details"].(map[string]any)
	if det["actual_sha256"] != hashOf([]byte(salesCSV(50))) || det["expected_sha256"] != hashOf([]byte(salesCSV(40))) {
		t.Fatalf("details %v", det)
	}
	code, body = postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/sales.import.json", "force": true})
	if code != 200 || body["source_changed"] != true || body["report"].(map[string]any)["rows_imported"] != float64(50) {
		t.Fatalf("forced rebuild: %d %v", code, body)
	}
	raw, _ = os.ReadFile(filepath.Join(dir, "imports", "sales.import.json"))
	if !strings.Contains(string(raw), hashOf([]byte(salesCSV(50)))) {
		t.Fatal("forced rebuild did not record the new hash")
	}
	if got := gitOut(t, dir, "log", "-1", "--format=%s"); got != "studio: rebuild cohorts/sales.pulse" {
		t.Fatalf("rebuild commit %q", got)
	}

	// Changed saved schema is reported.
	edited := append([]map[string]any(nil), salesSchema...)
	edited[0] = map[string]any{"name": "order_id", "type": "u64", "nullable": false, "description": "order key"}
	postJSON(t, s, "/api/schemas", map[string]any{"name": "sales", "schema": edited, "overwrite": true})
	code, body = postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/sales.import.json"})
	if code != 200 || body["schema_changed"] != true {
		t.Fatalf("schema change: %d %v", code, body)
	}

	// Missing source.
	if err := os.Remove(filepath.Join(dir, "sources", "sales.csv")); err != nil {
		t.Fatal(err)
	}
	code, body = postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/sales.import.json"})
	if code != http.StatusNotFound || errCode(body) != "source_missing" {
		t.Fatalf("missing source: %d %v", code, body)
	}

	// Bad rebuild requests.
	for _, tc := range []struct {
		body   map[string]any
		status int
		code   string
	}{
		{map[string]any{}, 400, "missing_spec"},
		{map[string]any{"spec": "../x.import.json"}, 403, "path_outside"},
		{map[string]any{"spec": "notes.json"}, 400, "not_import_spec"},
		{map[string]any{"spec": "imports/none.import.json"}, 404, "not_found"},
	} {
		code, body := postJSON(t, s, "/api/import/rebuild", tc.body)
		if code != tc.status || errCode(body) != tc.code {
			t.Errorf("%v: %d %v", tc.body, code, body)
		}
	}
	// A spec whose paths escape the workspace is refused.
	writeWS(t, s, "imports/evil.import.json", `{"version":1,"target":"../evil.pulse","source":{"path":"sources/sales.csv"}}`)
	if code, body := postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/evil.import.json"}); code != 403 || errCode(body) != "path_outside" {
		t.Fatalf("escaping spec: %d %v", code, body)
	}
	if git := gitOut(t, dir, "status", "--porcelain", "--", "notes.json"); git == "" {
		t.Fatal("notes.json should still be untracked")
	}
}

func TestImportInlineAndInferred(t *testing.T) {
	s := newImportServer(t, false)
	dir := s.Root().Dir()
	writeWS(t, s, "sources/sales.csv", salesCSV(40))

	// Inferred schema, bare cohort name → root-level cohort.
	code, body := postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "target": "inferred", "options": map[string]any{"float_width": "f32"}})
	if code != http.StatusCreated || body["target"] != "inferred.pulse" {
		t.Fatalf("inferred import: %d %v", code, body)
	}
	sd := body["spec_doc"].(map[string]any)
	if _, has := sd["schema"]; has || sd["options"].(map[string]any)["float_width"] != "f32" {
		t.Fatalf("inferred spec %v", sd)
	}
	if sch := body["report"].(map[string]any)["schema"].([]any); sch[2].(map[string]any)["type"] != "f32" {
		t.Fatalf("float_width not applied: %v", sch)
	}

	// Inline schema, dropping a column with ignore_extra.
	inline := []map[string]any{salesSchema[0], salesSchema[1]}
	code, body = postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "schema": inline, "target": "slim", "options": map[string]any{"ignore_extra": true}})
	if code != http.StatusCreated {
		t.Fatalf("inline import: %d %v", code, body)
	}
	if sc := body["spec_doc"].(map[string]any)["schema"].(map[string]any); len(sc["inline"].([]any)) != 2 {
		t.Fatalf("inline spec %v", sc)
	}
	_ = os.Remove(filepath.Join(dir, "slim.pulse"))
	if code, body := postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/slim.import.json"}); code != 200 {
		t.Fatalf("inline rebuild: %d %v", code, body)
	}

	// A Pulse refusal: 422 with the Pulse code; nothing written.
	code, body = postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "schema": inline, "target": "refused"})
	if code != http.StatusUnprocessableEntity || errCode(body) != "PULSE_IMPORT_SCHEMA_COLUMN_UNMAPPED" {
		t.Fatalf("refused import: %d %v", code, body)
	}
	for _, p := range []string{"refused.pulse", "imports/refused.import.json"} {
		if _, err := os.Stat(filepath.Join(dir, p)); err == nil {
			t.Fatalf("%s written for a refused import", p)
		}
	}
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Fatalf("temp cohort left: %s", e.Name())
		}
	}

	for _, tc := range []struct {
		body   map[string]any
		status int
		code   string
	}{
		{map[string]any{"source": "sources/sales.csv"}, 400, "missing_target"},
		{map[string]any{"source": "sources/sales.csv", "target": "a b"}, 400, "invalid_target"},
		{map[string]any{"source": "sources/sales.csv", "target": "x.csv/y"}, 400, "invalid_target"},
		{map[string]any{"source": "sources/sales.csv", "target": "../escape.pulse"}, 403, "path_outside"},
		{map[string]any{"source": "../sales.csv", "target": "t"}, 403, "path_outside"},
	} {
		code, body := postJSON(t, s, "/api/import", tc.body)
		if code != tc.status || errCode(body) != tc.code {
			t.Errorf("%v: %d %v", tc.body, code, body)
		}
	}
}

func TestWorkspaceKindsForImports(t *testing.T) {
	if k, _ := workspace.Classify("imports/a.import.json", nil); k != workspace.KindImport {
		t.Fatal(k)
	}
}
