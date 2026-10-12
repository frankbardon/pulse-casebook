package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

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
	s, _ := newCreateFixture(t)
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
