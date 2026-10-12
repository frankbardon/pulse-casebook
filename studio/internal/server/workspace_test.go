package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/encoding"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
)

// newWorkspaceServer returns a server with a real engine over a temp dir
// holding one request, one sidecar and one empty cohort.
func newWorkspaceServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	write := func(rel string, data []byte) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("req/01.json", []byte(`{"cohort":{"filename":"c.pulse"},"aggregations":[]}`))
	write("req/01.layout.json", []byte(`{}`))
	var cohort bytes.Buffer
	if err := encoding.WriteHeader(&cohort); err != nil {
		t.Fatal(err)
	}
	schema := &encoding.Schema{Fields: []encoding.Field{{Name: "x", Type: encoding.FieldTypeU8}}}
	if err := encoding.WriteSchema(&cohort, schema); err != nil {
		t.Fatal(err)
	}
	write("c.pulse", cohort.Bytes())
	write("broken.pulse", []byte("nope"))

	root, err := scope.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := pulse.New(pulse.Options{DataDir: root.Dir()})
	if err != nil {
		t.Fatal(err)
	}
	return New(root, engine, Config{PreviewTimeout: 10 * time.Second}, nil, false)
}

func get(t *testing.T, s *Server, path string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: body is not a JSON object: %v: %s", path, err, rec.Body.String())
	}
	return rec.Code, body
}

func TestWorkspaceErrors(t *testing.T) {
	s := newWorkspaceServer(t)
	tests := []struct {
		path   string
		status int
		code   string
	}{
		{"/api/file", 400, "missing_path"},
		{"/api/file?path=../etc/passwd", 403, "path_outside"},
		{"/api/file?path=/etc/passwd", 403, "path_outside"},
		{"/api/file?path=req/missing.json", 404, "not_found"},
		{"/api/file?path=c.pulse", 400, "not_json"},
		{"/api/file?path=req", 400, "not_json"},
		{"/api/cohort/inspect?path=req/01.json", 400, "not_cohort"},
		{"/api/cohort/inspect?path=missing.pulse", 404, "not_found"},
		{"/api/cohort/inspect?path=../x.pulse", 403, "path_outside"},
		{"/api/cohort/inspect?path=broken.pulse", 422, ""},
	}
	for _, tc := range tests {
		t.Run(tc.path, func(t *testing.T) {
			status, body := get(t, s, tc.path)
			if status != tc.status {
				t.Fatalf("status = %d, want %d (%v)", status, tc.status, body)
			}
			e, ok := body["error"].(map[string]any)
			if !ok || e["code"] == "" || e["message"] == "" {
				t.Fatalf("not an error envelope: %v", body)
			}
			if tc.code != "" && e["code"] != tc.code {
				t.Fatalf("code = %v, want %s", e["code"], tc.code)
			}
		})
	}
}

func TestFilesAndFile(t *testing.T) {
	s := newWorkspaceServer(t)
	status, body := get(t, s, "/api/files")
	if status != 200 {
		t.Fatalf("status = %d", status)
	}
	kinds := map[string]string{}
	for _, f := range body["files"].([]any) {
		m := f.(map[string]any)
		kinds[m["path"].(string)] = m["kind"].(string)
	}
	want := map[string]string{
		"broken.pulse":       "cohort",
		"c.pulse":            "cohort",
		"req/01.json":        "request",
		"req/01.layout.json": "unopenable",
	}
	if len(kinds) != len(want) {
		t.Fatalf("files = %v, want %v", kinds, want)
	}
	for p, k := range want {
		if kinds[p] != k {
			t.Errorf("%s kind = %q, want %q", p, kinds[p], k)
		}
	}

	status, body = get(t, s, "/api/file?path=req/01.json")
	if status != 200 || body["kind"] != "request" || body["text"] != `{"cohort":{"filename":"c.pulse"},"aggregations":[]}` {
		t.Fatalf("file = %d %v", status, body)
	}
}

func TestCohortInspect(t *testing.T) {
	s := newWorkspaceServer(t)
	status, body := get(t, s, "/api/cohort/inspect?path=c.pulse")
	if status != 200 {
		t.Fatalf("status = %d: %v", status, body)
	}
	fields, _ := body["fields"].([]any)
	if body["field_count"] != float64(1) || len(fields) != 1 || fields[0].(map[string]any)["name"] != "x" {
		t.Fatalf("inspect = %v", body)
	}
}

func TestCatalog(t *testing.T) {
	s := newWorkspaceServer(t)
	status, body := get(t, s, "/api/catalog")
	if status != 200 {
		t.Fatalf("status = %d: %v", status, body)
	}
	digest, _ := body["feature_set_digest"].(string)
	if digest != s.Engine().FeatureSetDigest() || body["pulse_version"] == "" {
		t.Fatalf("version/digest = %v / %v", body["pulse_version"], body["feature_set_digest"])
	}
	m, _ := body["manifest"].(map[string]any)
	comps, _ := m["components"].(map[string]any)
	aggs, _ := comps["aggregators"].([]any)
	if len(aggs) == 0 {
		t.Fatal("manifest has no aggregators")
	}
	if _, has := aggs[0].(map[string]any)["description"]; has {
		t.Fatal("slim manifest still carries descriptions")
	}
	if sch, _ := body["schema"].(map[string]any); sch["$defs"] == nil {
		t.Fatal("schema has no $defs")
	}
	// Second call is served from the cache.
	first := s.catalog.body
	get(t, s, "/api/catalog")
	if &first[0] != &s.catalog.body[0] {
		t.Fatal("catalog was rebuilt for an unchanged digest")
	}
}

func TestEngineUnavailable(t *testing.T) {
	s := newTestServer(t, true)
	for _, p := range []string{"/api/catalog"} {
		status, body := get(t, s, p)
		if status != 503 || body["error"].(map[string]any)["code"] != "engine_unavailable" {
			t.Fatalf("%s = %d %v", p, status, body)
		}
	}
}
