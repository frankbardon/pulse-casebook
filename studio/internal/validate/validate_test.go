package validate

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/frankbardon/pulse"
)

func decode(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// Error details below are the shapes the engine reports (captured from
// Predict / PredictCompose / PredictChain / PredictFacet).
func TestLocate(t *testing.T) {
	request := decode(t, `{
	  "cohort": {"filename": "ab_test.pulse"},
	  "features": [{"type": "FEAT_LOG", "field": "nope", "label": "f"}],
	  "filterers": [{"type": "FILTER_INCLUDE", "field": "arm", "values": ["a"]}, {"type": "FILTER_INCLUDE", "field": "arnm", "values": ["a"]}],
	  "groups": [{"type": "GROUP_BY", "field": "nopeg"}],
	  "aggregations": [
	    {"type": "AGG_NOPE", "field": "revenue", "label": "a"},
	    {"type": "AGG_MEAN", "field": "nonexistent", "label": "b"},
	    {"type": "AGG_MEAN", "field": "revenu", "label": "c"}
	  ],
	  "windows": [{"type": "WIN_LAG", "field": "nopew", "label": "w"}],
	  "sort": [{"field": "nopes"}],
	  "tests": [{"type": "TEST_WELCH", "field": "revenue", "split_by": "armm"}, {"type": "TEST_NOPE", "field": "revenue", "split_by": "arm"}],
	  "post_tests": [{"type": "TEST_WELCH", "field": "nopept", "split_by": "arm"}],
	  "regressions": [{"type": "REG_OLS", "target": "nopet", "predictors": ["revenue"], "label": "r"}],
	  "matrices": [{"type": "MAT_CORR", "fields": ["revenue", "nopem"], "label": "m"}]
	}`)
	compose := decode(t, `{"requests": [
	  {"label": "a", "cohort": {"filename": "x.pulse"}},
	  {"label": "b", "cohort": {"filename": "x.pulse"}, "aggregations": [{"type": "AGG_MEAN", "field": "nonexistent", "label": "b"}]}
	]}`)
	chain := decode(t, `{"cohort": {"filename": "x.pulse"}, "stages": [
	  {"name": "s", "request": {"aggregations": [{"type": "AGG_COUNT", "field": "revenue", "label": "n"}]}},
	  {"name": "t", "request": {"aggregations": [{"type": "AGG_SUM", "field": "nope", "label": "b"}]}}
	]}`)
	facet := decode(t, `{"cohort": {"filename": "x.pulse"}, "fields": ["arm", "nope"],
	  "filterers": [{"type": "FILTER_INCLUDE", "field": "nopef", "values": ["a"]}]}`)

	tests := []struct {
		name    string
		doc     map[string]any
		kind    string
		details map[string]any
		want    []string
	}{
		{"unknown field in a filter", request, "request", map[string]any{"filter": "FILTER_INCLUDE", "field": "arnm"}, []string{"filterers[1].field"}},
		{"unknown field in an aggregation", request, "request", map[string]any{"aggregation": "AGG_MEAN", "field": "nonexistent"}, []string{"aggregations[1].field"}},
		{"feature", request, "request", map[string]any{"feature": "FEAT_LOG", "field": "nope"}, []string{"features[0].field"}},
		{"group", request, "request", map[string]any{"group": "GROUP_BY", "field": "nopeg"}, []string{"groups[0].field"}},
		{"test split_by (operator only, no section key)", request, "request", map[string]any{"type": "TEST_WELCH", "split_by": "armm"}, []string{"tests[0].split_by"}},
		{"unknown test type", request, "request", map[string]any{"type": "TEST_NOPE"}, []string{"tests[1]"}},
		{"regression target", request, "request", map[string]any{"type": "REG_OLS", "field": "nopet"}, []string{"regressions[0].target"}},
		{"window by index", request, "request", map[string]any{"type": "WIN_LAG", "window_index": 0, "field": "nopew"}, []string{"windows[0].field"}},
		{"window by index, no field", request, "request", map[string]any{"type": "WIN_LAG", "window_index": 0}, []string{"windows[0]"}},
		{"sort by index", request, "request", map[string]any{"sort_index": 0, "field": "nopes"}, []string{"sort[0].field"}},
		{"post test by index", request, "request", map[string]any{"type": "TEST_WELCH", "post_test_index": 0, "field": "nopept"}, []string{"post_tests[0].field"}},
		{"path in a detail value", request, "request", map[string]any{"matrix": "matrices[0]", "reason": "unknown_type", "type": "MAT_CORR"}, []string{"matrices[0]"}},
		{"nothing matches: request level", request, "request", map[string]any{"field": "ghost"}, []string{""}},
		{"no details", request, "request", nil, []string{""}},
		{"compose slot", compose, "compose", map[string]any{"aggregation": "AGG_MEAN", "field": "nonexistent", "request": 1}, []string{"requests[1].aggregations[0].field"}},
		{"compose slot level", compose, "compose", map[string]any{"request": 0, "field": "ghost"}, []string{"requests[0]"}},
		{"chain stage", chain, "chain", map[string]any{"aggregation": "AGG_SUM", "field": "nope", "stage": 1}, []string{"stages[1].request.aggregations[0].field"}},
		{"chain gate", chain, "chain", map[string]any{"stage_index": 1, "stage_name": "b"}, []string{"stages[1].request"}},
		{"facet field list", facet, "facet", map[string]any{"field": "nope"}, []string{"fields[1]"}},
		{"facet filter", facet, "facet", map[string]any{"filter": "FILTER_INCLUDE", "field": "nopef"}, []string{"filterers[0].field"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Locate(tc.doc, tc.kind, tc.details)
			if !slices.Equal(got, tc.want) {
				t.Errorf("Locate = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestSuggestionPath(t *testing.T) {
	tests := []struct {
		base string
		path []string
		want string
	}{
		{"", []string{"Aggregations", "2", "Field"}, "aggregations[2].field"},
		{"", []string{"Filterers", "0", "Field"}, "filterers[0].field"},
		{"", []string{"Windows", "0", "OrderBy"}, "windows[0].order_by"},
		{"", []string{"Aggregations", "1", "Params", "percentile"}, "aggregations[1].params.percentile"},
		{"", []string{"PostTests", "0", "SplitBy"}, "post_tests[0].split_by"},
		{"requests[1]", []string{"Aggregations", "0", "Type"}, "requests[1].aggregations[0].type"},
		{"", []string{"Unknown", "3"}, "Unknown[3]"},
	}
	for _, tc := range tests {
		if got := SuggestionPath(tc.base, tc.path); got != tc.want {
			t.Errorf("SuggestionPath(%q, %q) = %q, want %q", tc.base, tc.path, got, tc.want)
		}
	}
}

func TestDecodePath(t *testing.T) {
	doc := decode(t, `{"cohort": {"filename": "x.pulse"}, "weight": "w"}`)
	b, _ := json.Marshal(doc)
	var req pulse.Request
	err := json.Unmarshal(b, &req)
	if err == nil {
		t.Fatal("want a decode error")
	}
	if got := DecodePath(doc, "", err); got != "weight" {
		t.Errorf("DecodePath = %q, want weight", got)
	}
}

func TestSuggestionSeverity(t *testing.T) {
	if got := SuggestionSeverity("operator AGG_MEAN forces the buffered path; no streamable peer is available"); got != Hint {
		t.Errorf("buffered advisory = %q, want hint", got)
	}
	if got := SuggestionSeverity("field revenu is not in the schema; closest names by edit distance"); got != Warning {
		t.Errorf("typo = %q, want warning", got)
	}
}

// The engine reports a cohort it could not open by message only
// (SERVICE_RESOURCE "opening cohort file: X"); a join's right lands on
// joins[i].right of its own request frame.
func TestLocateJoinRight(t *testing.T) {
	join := func(right string) string {
		return `{"cohort": {"filename": "a.pulse"}, "joins": [{"right": "` + right + `", "kind": "inner", "on": [{"left_field": "id", "right_field": "id"}]}]}`
	}
	request := decode(t, join("data/twin.pulse"))
	resolved := decode(t, join("case/data/twin.pulse"))
	compose := decode(t, `{"requests": [{"label": "a", "cohort": {"filename": "a.pulse"}}, `+join("twin.pulse")+`]}`)
	chain := decode(t, `{"cohort": {"filename": "a.pulse"}, "stages": [{"name": "s", "request": `+join("arch.pulse#s1.pulse")+`}]}`)
	fits := decode(t, `{"requests": [], "fits": [{"name": "f", "request": `+join("fit.pulse")+`}]}`)

	tests := []struct {
		name      string
		doc, edoc map[string]any
		message   string
		want      string
		ok        bool
	}{
		{"as written", request, request, "opening cohort file: data/twin.pulse", "joins[0].right", true},
		{"as the engine resolved it", request, resolved, "opening cohort file: case/data/twin.pulse", "joins[0].right", true},
		{"wrapped message", request, request, "SERVICE_RESOURCE: opening cohort file: data/twin.pulse", "joins[0].right", true},
		{"compose slot", compose, compose, "opening cohort file: twin.pulse", "requests[1].joins[0].right", true},
		{"compose fit", fits, fits, "opening cohort file: fit.pulse", "fits[0].request.joins[0].right", true},
		{"chain stage anchor archive", chain, chain, "opening cohort file for anchor: arch.pulse", "stages[0].request.joins[0].right", true},
		{"chain stage anchor shard", chain, chain, `shard "s1.pulse" not present in archive central directory`, "stages[0].request.joins[0].right", true},
		{"the request's own cohort", request, request, "opening cohort file: a.pulse", "", false},
		{"another error", request, request, "unknown field data/twin.pulse", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := LocateJoinRight(tc.doc, tc.edoc, tc.message)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("LocateJoinRight = %q, %v; want %q, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}
