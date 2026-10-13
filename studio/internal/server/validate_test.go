package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
)

// shardArchive writes case/arch.pulse, a shard archive of two small
// cohorts (shards s1.pulse and s2.pulse), into the fixture workspace.
func shardArchive(t *testing.T, s *Server, dir string) {
	t.Helper()
	spec := filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json")
	synthCohort(t, spec, filepath.Join(dir, "case/s1.pulse"), 100, 5)
	synthCohort(t, spec, filepath.Join(dir, "case/s2.pulse"), 100, 6)
	if _, err := s.engine.CreateShardArchive(context.Background(), "case/arch.pulse", []string{"case/s1.pulse", "case/s2.pulse"}); err != nil {
		t.Fatal(err)
	}
}

// An anchored shard is inspected inside its archive; an anchor naming
// no shard is an inspect failure (422), not a missing file (404).
func TestCohortInspectAnchor(t *testing.T) {
	s, dir := newCreateFixture(t)
	shardArchive(t, s, dir)
	get := func(path string) (int, map[string]any) {
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/cohort/inspect?path="+url.QueryEscape(path), nil))
		var out map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode %q: %v", rec.Body.String(), err)
		}
		return rec.Code, out
	}
	code, out := get("case/arch.pulse#s1.pulse")
	if fields, _ := out["fields"].([]any); code != http.StatusOK || len(fields) == 0 {
		t.Fatalf("anchored inspect: %d %v", code, out)
	}
	if code, out = get("case/arch.pulse#nope.pulse"); code != http.StatusUnprocessableEntity {
		t.Fatalf("missing shard: %d %v", code, out)
	}
	if code, out = get("case/ghost.pulse#s1.pulse"); code != http.StatusNotFound {
		t.Fatalf("missing archive: %d %v", code, out)
	}
}

func postValidate(t *testing.T, s *Server, endpoint, path, request string) (int, map[string]any) {
	t.Helper()
	body := `{"path":` + mustJSON(path) + `,"request":` + request + `}`
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, endpoint, bytes.NewReader([]byte(body))))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// issuesAt indexes a predict response's issues by path.
func issuesAt(out map[string]any) map[string][]map[string]any {
	by := map[string][]map[string]any{}
	list, _ := out["issues"].([]any)
	for _, x := range list {
		is := x.(map[string]any)
		p, _ := is["path"].(string)
		by[p] = append(by[p], is)
	}
	return by
}

func hasSeverity(list []map[string]any, sev string) bool {
	for _, is := range list {
		if is["severity"] == sev {
			return true
		}
	}
	return false
}

func TestPredictMapsIssuesToNodes(t *testing.T) {
	s, dir := newCreateFixture(t)
	cohort := `{"filename": "ab_test.pulse", "data_dir": "."}`

	t.Run("valid request", func(t *testing.T) {
		code, out := postValidate(t, s, "/api/predict", "case/req/x.json",
			`{"cohort": `+cohort+`, "aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "n"}]}`)
		if code != http.StatusOK || out["valid"] != true || out["root"] != "request" {
			t.Fatalf("got %d %v", code, out)
		}
		for p, list := range issuesAt(out) {
			if hasSeverity(list, "error") {
				t.Errorf("unexpected error at %q: %v", p, list)
			}
		}
	})

	t.Run("unknown fields land on the referencing nodes", func(t *testing.T) {
		code, out := postValidate(t, s, "/api/predict", "case/req/x.json", `{"cohort": `+cohort+`,
		  "filterers": [{"type": "FILTER_INCLUDE", "field": "arnm", "values": ["a"]}],
		  "aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "n"}, {"type": "AGG_MEAN", "field": "revenu", "label": "m"}],
		  "tests": [{"type": "TEST_WELCH", "field": "revenue", "split_by": "armm"}]}`)
		if code != http.StatusOK || out["valid"] != false {
			t.Fatalf("got %d %v", code, out)
		}
		by := issuesAt(out)
		for _, p := range []string{"filterers[0].field", "aggregations[1].field", "tests[0].split_by"} {
			if !hasSeverity(by[p], "error") {
				t.Errorf("no error at %s; issues %v", p, out["issues"])
			}
		}
		// The typo suggestion carries the proposed value.
		var found bool
		for _, is := range by["aggregations[1].field"] {
			if is["severity"] == "warning" {
				prop, _ := is["proposed"].([]any)
				found = len(prop) > 0 && prop[0] == "revenue" && is["current"] == "revenu"
			}
		}
		if !found {
			t.Errorf("no revenu -> revenue suggestion at aggregations[1].field: %v", by["aggregations[1].field"])
		}
	})

	t.Run("missing cohort is an issue on the cohort node", func(t *testing.T) {
		code, out := postValidate(t, s, "/api/predict", "case/req/x.json", `{"cohort": {"filename": "ghost.pulse", "data_dir": "."}}`)
		if code != http.StatusOK || out["valid"] != false || !hasSeverity(issuesAt(out)["cohort"], "error") {
			t.Fatalf("got %d %v", code, out)
		}
	})

	t.Run("a join's right cohort resolves like the request's", func(t *testing.T) {
		join := func(right string) string {
			return `{"cohort": ` + cohort + `, "joins": [{"right": ` + mustJSON(right) + `, "kind": "inner", "as": "r_",
			  "on": [{"left_field": "user_id", "right_field": "user_id"}]}],
			  "aggregations": [{"type": "AGG_AVERAGE", "field": "r_revenue", "label": "m"}]}`
		}
		code, out := postValidate(t, s, "/api/predict", "case/req/x.json", join("ab_test.pulse"))
		if code != http.StatusOK || out["valid"] != true {
			t.Fatalf("got %d %v", code, out)
		}
		_, out = postValidate(t, s, "/api/predict", "case/req/x.json", join("ghost.pulse"))
		if out["valid"] != false {
			t.Fatalf("unknown right cohort predicted valid: %v", out)
		}
		// The engine's "opening cohort file" error lands on the join.
		by := issuesAt(out)
		if !hasSeverity(by["joins[0].right"], "error") || hasSeverity(by[""], "error") {
			t.Fatalf("missing right not located to joins[0].right: %v", out["issues"])
		}
	})

	t.Run("a shard anchor resolves by its archive", func(t *testing.T) {
		shardArchive(t, s, dir)
		join := func(right string) string {
			return `{"cohort": ` + cohort + `, "joins": [{"right": ` + mustJSON(right) + `, "kind": "inner", "as": "r_",
			  "on": [{"left_field": "user_id", "right_field": "user_id"}]}],
			  "aggregations": [{"type": "AGG_AVERAGE", "field": "r_revenue", "label": "m"}]}`
		}
		code, out := postValidate(t, s, "/api/predict", "case/req/x.json", join("arch.pulse#s1.pulse"))
		if code != http.StatusOK || out["valid"] != true {
			t.Fatalf("anchored right: got %d %v", code, out)
		}
		_, out = postValidate(t, s, "/api/predict", "case/req/x.json", join("arch.pulse#nope.pulse"))
		if !hasSeverity(issuesAt(out)["joins[0].right"], "error") {
			t.Fatalf("missing shard not located to joins[0].right: %v", out["issues"])
		}
		_, out = postValidate(t, s, "/api/predict", "case/req/x.json", join("ghost.pulse#s1.pulse"))
		if !hasSeverity(issuesAt(out)["joins[0].right"], "error") {
			t.Fatalf("missing archive not located to joins[0].right: %v", out["issues"])
		}
	})

	t.Run("decode error points at the offending key", func(t *testing.T) {
		_, out := postValidate(t, s, "/api/predict", "case/req/x.json", `{"cohort": `+cohort+`, "weight": "w"}`)
		if !hasSeverity(issuesAt(out)["weight"], "error") {
			t.Fatalf("got %v", out)
		}
	})

	t.Run("compose slot", func(t *testing.T) {
		_, out := postValidate(t, s, "/api/predict", "case/req/x.compose.json", `{"requests": [
		  {"label": "a", "cohort": `+cohort+`},
		  {"label": "b", "cohort": `+cohort+`, "aggregations": [{"type": "AGG_MEAN", "field": "nonexistent", "label": "m"}]}]}`)
		if out["root"] != "compose" || !hasSeverity(issuesAt(out)["requests[1].aggregations[0].field"], "error") {
			t.Fatalf("got %v", out)
		}
	})

	t.Run("errors", func(t *testing.T) {
		code, out := postValidate(t, s, "/api/predict", "case/req/x.json", `[1]`)
		if code != http.StatusBadRequest {
			t.Fatalf("got %d %v", code, out)
		}
	})
}

func TestExplainStepsByNode(t *testing.T) {
	s, _ := newCreateFixture(t)
	code, out := postValidate(t, s, "/api/explain", "case/req/x.json", `{"cohort": {"filename": "ab_test.pulse", "data_dir": "."},
	  "filterers": [{"type": "FILTER_INCLUDE", "field": "arm", "values": ["control"]}],
	  "tests": [{"type": "TEST_WELCH", "field": "revenue", "split_by": "arm"}]}`)
	if code != http.StatusOK {
		t.Fatalf("got %d %v", code, out)
	}
	if s, _ := out["summary"].(string); s == "" {
		t.Errorf("no summary: %v", out)
	}
	paths := map[string]string{}
	for _, x := range out["steps"].([]any) {
		st := x.(map[string]any)
		paths[st["path"].(string)], _ = st["text"].(string)
	}
	for _, p := range []string{"filterers[0]", "tests[0]"} {
		if paths[p] == "" {
			t.Errorf("no explain text for %s: %v", p, out["steps"])
		}
	}
}
