package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

func put(t *testing.T, s *Server, path string, body []byte) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, path, bytes.NewReader(body)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s: body is not a JSON object: %v: %s", path, err, rec.Body.String())
	}
	return rec.Code, out
}

// TestSaveShowcaseByteIdentical copies every showcase request into a
// scoped dir, PUTs it back minified (whitespace is the editor's business,
// key order and literals are not), and expects the original bytes on disk.
func TestSaveShowcaseByteIdentical(t *testing.T) {
	files, err := filepath.Glob("../../../showcase/*/req/*.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("no showcase files: %v", err)
	}
	s := newTestServer(t, false)
	dir := s.Root().Dir()
	for _, f := range files {
		orig, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		rel := strings.TrimPrefix(filepath.ToSlash(f), "../../../showcase/")
		dst := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(dst, orig, 0o644); err != nil {
			t.Fatal(err)
		}
		var min bytes.Buffer
		if err := json.Compact(&min, orig); err != nil {
			t.Fatal(err)
		}
		status, body := put(t, s, "/api/file?path="+rel, min.Bytes())
		if status != 200 {
			t.Fatalf("%s: status %d %v", rel, status, body)
		}
		got, _ := os.ReadFile(dst)
		if !bytes.Equal(got, orig) {
			t.Errorf("%s: saved bytes differ from the original", rel)
		}
		if body["text"] != string(orig) {
			t.Errorf("%s: response text differs from the original", rel)
		}
	}
	// No temp files are left behind.
	leftovers, _ := filepath.Glob(filepath.Join(dir, "*", "req", ".*.tmp"))
	if len(leftovers) != 0 {
		t.Errorf("temp files left: %v", leftovers)
	}
}

func TestSaveNewFileHouseStyleAndMode(t *testing.T) {
	s := newWorkspaceServer(t)
	dir := s.Root().Dir()
	status, body := put(t, s, "/api/file?path=req/new.json", []byte(`{"cohort":{"filename":"c.pulse"},"aggregations":[{"type":"AGG_COUNT","field":"x","label":"n"}]}`))
	if status != 200 || body["kind"] != string(workspace.KindRequest) {
		t.Fatalf("save = %d %v", status, body)
	}
	want := "{\n  \"cohort\": {\"filename\": \"c.pulse\"},\n  \"aggregations\": [{\"type\": \"AGG_COUNT\", \"field\": \"x\", \"label\": \"n\"}]\n}\n"
	got, _ := os.ReadFile(filepath.Join(dir, "req", "new.json"))
	if string(got) != want {
		t.Fatalf("new file:\n%s", got)
	}

	// An existing file keeps its permissions.
	p := filepath.Join(dir, "req", "01.json")
	if err := os.Chmod(p, 0o600); err != nil {
		t.Fatal(err)
	}
	if status, body := put(t, s, "/api/file?path=req/01.json", []byte(`{"cohort":{"filename":"c.pulse"}}`)); status != 200 {
		t.Fatalf("overwrite = %d %v", status, body)
	}
	if info, _ := os.Stat(p); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, want 0600", info.Mode().Perm())
	}
}

func TestSaveErrors(t *testing.T) {
	s := newWorkspaceServer(t)
	big := append([]byte(`"`), bytes.Repeat([]byte("x"), workspace.MaxRequestBytes)...)
	big = append(big, '"')
	tests := []struct {
		name   string
		path   string
		body   []byte
		status int
		code   string
	}{
		{"missing path", "/api/file", []byte(`{}`), 400, "missing_path"},
		{"traversal", "/api/file?path=../x.json", []byte(`{}`), 403, "path_outside"},
		{"absolute", "/api/file?path=/tmp/x.json", []byte(`{}`), 403, "path_outside"},
		{"not json ext", "/api/file?path=c.pulse", []byte(`{}`), 400, "not_json"},
		{"invalid json", "/api/file?path=req/01.json", []byte(`{"a":}`), 400, "invalid_json"},
		{"trailing data", "/api/file?path=req/01.json", []byte(`{} {}`), 400, "invalid_json"},
		{"no parent dir", "/api/file?path=nope/x.json", []byte(`{}`), 404, "not_found"},
		{"directory", "/api/file?path=dir.json", []byte(`{}`), 400, "not_a_file"},
		{"too large", "/api/file?path=req/01.json", big, 413, "too_large"},
	}
	if err := os.Mkdir(filepath.Join(s.Root().Dir(), "dir.json"), 0o755); err != nil {
		t.Fatal(err)
	}
	orig, _ := os.ReadFile(filepath.Join(s.Root().Dir(), "req", "01.json"))
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, body := put(t, s, tc.path, tc.body)
			e, _ := body["error"].(map[string]any)
			if status != tc.status || e == nil || e["code"] != tc.code {
				t.Fatalf("got %d %v, want %d %s", status, body, tc.status, tc.code)
			}
		})
	}
	if got, _ := os.ReadFile(filepath.Join(s.Root().Dir(), "req", "01.json")); !bytes.Equal(got, orig) {
		t.Fatal("a rejected save modified the file")
	}
}
