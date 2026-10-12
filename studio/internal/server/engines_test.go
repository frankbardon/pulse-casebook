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

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// newBrandTrackerFixture copies brand-tracker request 02 and its label
// tables into a temp workspace (as "bt/") next to a small synthesized
// cohort. withLabels=false leaves out the labels/ directory.
func newBrandTrackerFixture(t *testing.T, withLabels bool) (*Server, string, string) {
	t.Helper()
	src := filepath.Join(showcaseDir(), "brand-tracker")
	dir := t.TempDir()
	synthCohort(t, filepath.Join(src, "spec/brand_tracker.synth.json"), filepath.Join(dir, "bt/brand_tracker.pulse"), 300, 2025)
	copyFile := func(from, to string) {
		t.Helper()
		b, err := os.ReadFile(from)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(to, b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	copyFile(filepath.Join(src, "req/02_funnel_by_wave.json"), filepath.Join(dir, "bt/req/02_funnel_by_wave.json"))
	if withLabels {
		for _, n := range []string{"wave_names.json", "region_names.json"} {
			copyFile(filepath.Join(src, "labels", n), filepath.Join(dir, "bt/labels", n))
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
	req, err := os.ReadFile(filepath.Join(dir, "bt/req/02_funnel_by_wave.json"))
	if err != nil {
		t.Fatal(err)
	}
	return New(root, engine, Config{}, nil, false), dir, string(req)
}

func notRegistered(out map[string]any) []any {
	var hits []any
	list, _ := out["issues"].([]any)
	for _, x := range list {
		if m, _ := x.(map[string]any)["message"].(string); strings.Contains(m, "not registered") {
			hits = append(hits, x)
		}
	}
	return hits
}

func TestLabelTablesRegisteredPerCase(t *testing.T) {
	const path = "bt/req/02_funnel_by_wave.json"

	t.Run("labels dir registers the tables", func(t *testing.T) {
		s, _, req := newBrandTrackerFixture(t, true)
		code, out := postValidate(t, s, "/api/predict", path, req)
		if code != http.StatusOK {
			t.Fatalf("predict %d %v", code, out)
		}
		if hits := notRegistered(out); len(hits) > 0 {
			t.Fatalf("label table refused: %v", hits)
		}
		if out["valid"] != true {
			t.Fatalf("not valid: %v", out["issues"])
		}
		if code, out := postValidate(t, s, "/api/explain", path, req); code != http.StatusOK {
			t.Fatalf("explain %d %v", code, out)
		}
		// Previews run on the case's engine too.
		body := `{"path":` + mustJSON(path) + `,"node":"aggregations[1]","force":true,"request":` + req + `}`
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/preview", bytes.NewReader([]byte(body))))
		if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "not registered") {
			t.Fatalf("preview %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("without labels dir the engine refuses (control)", func(t *testing.T) {
		s, _, req := newBrandTrackerFixture(t, false)
		_, out := postValidate(t, s, "/api/predict", path, req)
		if len(notRegistered(out)) == 0 || out["valid"] != false {
			t.Fatalf("want a not-registered refusal, got %v", out)
		}
	})

	t.Run("edited tables rebuild the engine", func(t *testing.T) {
		s, dir, _ := newBrandTrackerFixture(t, true)
		first := s.engineFor(path)
		if first == s.engine {
			t.Fatal("labels dir not picked up")
		}
		if again := s.engineFor(path); again != first {
			t.Fatal("engine not cached")
		}
		extra := filepath.Join(dir, "bt/labels/extra.json")
		if err := os.WriteFile(extra, []byte(`{"a":"A"}`), 0o644); err != nil {
			t.Fatal(err)
		}
		if s.engineFor(path) == first {
			t.Fatal("engine not rebuilt after a table was added")
		}
		// A request outside the case gets the shared engine.
		if s.engineFor("elsewhere/x.json") != s.engine {
			t.Fatal("unrelated request picked up the case's labels")
		}
	})

	t.Run("symlinked table escaping the workspace is refused", func(t *testing.T) {
		s, dir, _ := newBrandTrackerFixture(t, true)
		outside := filepath.Join(t.TempDir(), "secret.json")
		if err := os.WriteFile(outside, []byte(`{"a":"A"}`), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(outside, filepath.Join(dir, "bt/labels/secret.json")); err != nil {
			t.Skip("symlinks unsupported:", err)
		}
		if s.engineFor(path) != s.engine {
			t.Fatal("escaping label table loaded")
		}
	})
}

// A created plain Request's predict verdict carries the refusals
// Explain reports (Predict alone only says "invalid").
func TestCreatePredictIncludesRefusals(t *testing.T) {
	s, _ := newCreateFixture(t)
	doc := `{"cohort": {"filename": "case/ab_test.pulse", "data_dir": ""},
	  "aggregations": [{"type": "AGG_MEAN", "field": "revenu", "label": "m"}]}`
	r := httptest.NewRequest(http.MethodPost, "/api/file/new", nil)
	got := s.predictDoc(r, "case/req/x.json", workspace.KindRequest, []byte(doc))
	if got.Valid || len(got.Errors) == 0 {
		t.Fatalf("want refusals, got %+v", got)
	}
	found := false
	for _, e := range got.Errors {
		if e.Code != "PREDICT_INVALID" && strings.Contains(e.Message, "revenu") {
			found = true
		}
	}
	if !found {
		b, _ := json.Marshal(got)
		t.Fatalf("no refusal naming the field: %s", b)
	}

	ok := s.predictDoc(r, "case/req/x.json", workspace.KindRequest,
		[]byte(`{"cohort": {"filename": "case/ab_test.pulse", "data_dir": ""}}`))
	if !ok.Valid || len(ok.Errors) != 0 {
		t.Fatalf("minimal request: %+v", ok)
	}
}
