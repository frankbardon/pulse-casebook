package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// newCreateFixture lays out a temp workspace like the casebook: a cohort
// beside req/ in a case dir, plus a cohort in a separate data dir.
func newCreateFixture(t *testing.T) (*Server, string) {
	t.Helper()
	dir := t.TempDir()
	spec := filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json")
	synthCohort(t, spec, filepath.Join(dir, "case/ab_test.pulse"), 200, 3)
	synthCohort(t, spec, filepath.Join(dir, "shared/cohorts/ab_test.pulse"), 200, 4)
	for _, d := range []string{"case/req", "other"} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	root, err := scope.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := pulse.New(pulse.Options{DataDir: root.Dir()})
	if err != nil {
		t.Fatal(err)
	}
	return New(root, engine, Config{}, nil, false), dir
}

func postCreate(t *testing.T, s *Server, body map[string]any) (int, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/file/new", bytes.NewReader(raw)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

func TestCreateFile(t *testing.T) {
	s, dir := newCreateFixture(t)
	tests := []struct {
		name, path, root, cohort string
		wantText                 string
		wantResolved             string
	}{
		{
			name: "request beside req/ uses the data_dir \".\" convention",
			path: "case/req/new.json", root: "request", cohort: "case/ab_test.pulse",
			wantText:     "{\n  \"cohort\": {\"filename\": \"ab_test.pulse\", \"data_dir\": \".\"}\n}\n",
			wantResolved: "case/ab_test.pulse",
		},
		{
			name: "compose",
			path: "case/req/new.compose.json", root: "compose", cohort: "case/ab_test.pulse",
			wantText:     "{\n  \"requests\": [{\"label\": \"slot_1\", \"cohort\": {\"filename\": \"ab_test.pulse\", \"data_dir\": \".\"}}]\n}\n",
			wantResolved: "case/ab_test.pulse",
		},
		{
			name: "facet", path: "case/req/new.facet.json", root: "facet", cohort: "case/ab_test.pulse",
			wantResolved: "case/ab_test.pulse",
		},
		{
			name: "chain", path: "case/req/new_chain.json", root: "chain", cohort: "case/ab_test.pulse",
			wantResolved: "case/ab_test.pulse",
		},
		{
			name: "cohort elsewhere is root-relative data_dir",
			path: "other/x.json", root: "request", cohort: "shared/cohorts/ab_test.pulse",
			wantText:     "{\n  \"cohort\": {\"filename\": \"ab_test.pulse\", \"data_dir\": \"shared/cohorts\"}\n}\n",
			wantResolved: "shared/cohorts/ab_test.pulse",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, out := postCreate(t, s, map[string]any{"path": tt.path, "root": tt.root, "cohort": tt.cohort})
			if code != http.StatusCreated {
				t.Fatalf("status %d: %v", code, out)
			}
			if out["kind"] != tt.root || out["path"] != tt.path {
				t.Errorf("kind/path = %v/%v", out["kind"], out["path"])
			}
			text, _ := out["text"].(string)
			if tt.wantText != "" && text != tt.wantText {
				t.Errorf("text =\n%s\nwant\n%s", text, tt.wantText)
			}
			disk, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(tt.path)))
			if err != nil || string(disk) != text {
				t.Fatalf("disk = %q (%v), want response text", disk, err)
			}
			// Classifies as the chosen root and lists in the workspace.
			if k, reason := workspace.ClassifyJSON(disk); string(k) != tt.root {
				t.Errorf("ClassifyJSON = %s (%s)", k, reason)
			}
			// Cohort resolves (as previews resolve it) to the chosen file.
			var doc map[string]any
			mustUnmarshal(t, disk, &doc)
			cohort := doc["cohort"]
			if reqs, ok := doc["requests"].([]any); ok {
				cohort = reqs[0].(map[string]any)["cohort"]
			}
			got, err := s.cohortResolver(tt.path)(cohort)
			if err != nil || got.(map[string]any)["filename"] != tt.wantResolved {
				t.Errorf("resolved %v (%v), want %s", got, err, tt.wantResolved)
			}
			// Predict verdict.
			if v, _ := at(out, "predict", "valid").(bool); !v {
				t.Errorf("predict = %v", out["predict"])
			}
		})
	}

	// Listed in the sidebar.
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/files", nil))
	var listing struct {
		Files []struct{ Path, Kind string }
	}
	mustUnmarshal(t, rec.Body.Bytes(), &listing)
	found := false
	for _, f := range listing.Files {
		if f.Path == "case/req/new.json" && f.Kind == "request" {
			found = true
		}
	}
	if !found {
		t.Errorf("new file not listed: %+v", listing.Files)
	}
}

// A same-named cohort in the root would shadow the convention form, so the
// created file names the cohort's own directory instead.
func TestCreateFileShadowedConvention(t *testing.T) {
	s, dir := newCreateFixture(t)
	synthCohort(t, filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json"), filepath.Join(dir, "ab_test.pulse"), 50, 5)
	code, out := postCreate(t, s, map[string]any{"path": "case/req/n.json", "root": "request", "cohort": "case/ab_test.pulse"})
	if code != http.StatusCreated {
		t.Fatalf("status %d: %v", code, out)
	}
	if got := at(out, "cohort", "data_dir"); got != "case" {
		t.Errorf("data_dir = %v, want case", got)
	}
}

func TestCreateFileErrors(t *testing.T) {
	s, dir := newCreateFixture(t)
	existing := filepath.Join(dir, "case/req/keep.json")
	if err := os.WriteFile(existing, []byte("{\"cohort\": {}}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		body map[string]any
		code int
		err  string
	}{
		{"exists", map[string]any{"path": "case/req/keep.json", "root": "request", "cohort": "case/ab_test.pulse"}, 409, "exists"},
		{"bad root", map[string]any{"path": "case/req/a.json", "root": "cohort", "cohort": "case/ab_test.pulse"}, 400, "invalid_root"},
		{"missing path", map[string]any{"root": "request", "cohort": "case/ab_test.pulse"}, 400, "missing_path"},
		{"missing cohort", map[string]any{"path": "case/req/a.json", "root": "request"}, 400, "missing_cohort"},
		{"not json", map[string]any{"path": "case/req/a.txt", "root": "request", "cohort": "case/ab_test.pulse"}, 400, "not_json"},
		{"sidecar name", map[string]any{"path": "case/req/a.layout.json", "root": "request", "cohort": "case/ab_test.pulse"}, 400, "not_request"},
		{"outside", map[string]any{"path": "../a.json", "root": "request", "cohort": "case/ab_test.pulse"}, 403, "path_outside"},
		{"no parent", map[string]any{"path": "nope/a.json", "root": "request", "cohort": "case/ab_test.pulse"}, 404, "not_found"},
		{"cohort missing", map[string]any{"path": "case/req/a.json", "root": "request", "cohort": "case/none.pulse"}, 404, "cohort_not_found"},
		{"cohort not pulse", map[string]any{"path": "case/req/a.json", "root": "request", "cohort": "case/req/keep.json"}, 400, "not_cohort"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, out := postCreate(t, s, tt.body)
			if code != tt.code || at(out, "error", "code") != tt.err {
				t.Errorf("got %d %v, want %d %s", code, out, tt.code, tt.err)
			}
		})
	}
	if b, _ := os.ReadFile(existing); string(b) != "{\"cohort\": {}}\n" {
		t.Errorf("existing file changed: %q", b)
	}
	if _, err := os.Stat(filepath.Join(dir, "case/req/a.json")); err == nil {
		t.Error("a failed create left a file behind")
	}
	entries, _ := os.ReadDir(filepath.Join(dir, "case/req"))
	for _, e := range entries {
		if e.Name() != "keep.json" {
			t.Errorf("stray file %s", e.Name())
		}
	}
}
