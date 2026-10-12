package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sync/atomic"
	"testing"
	"time"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/observe"
	"github.com/frankbardon/pulse/synth"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
)

// showcaseDir returns the repository's showcase directory.
func showcaseDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "showcase")
}

// synthCohort writes a small cohort generated from a committed synth spec
// (the showcase cohorts themselves are gitignored).
func synthCohort(t *testing.T, spec, out string, rows int, seed int64) {
	t.Helper()
	raw, err := os.ReadFile(spec)
	if err != nil {
		t.Skipf("synth spec %s unavailable: %v", spec, err)
	}
	s, err := synth.ParseSpec(raw)
	if err != nil {
		t.Fatal(err)
	}
	s.RowCount = rows
	data, _, err := synth.SynthBytes(s, synth.Options{Seed: seed})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

// Fixture workspace, laid out like the casebook (cohort beside req/):
// small cohorts synthesized from committed specs plus copies of showcase
// requests and a few inline requests for sections the showcase only
// uses on non-synthesizable cohorts.
var fixtureCohorts = []struct{ spec, out string }{
	{"ab-test-readout/data/ab_test.synth.json", "ab/ab_test.pulse"},
	{"retail-at-scale/synth/orders-2025-01.synth.json", "retail/orders.pulse"},
	{"credit-risk-model/data/loans.synth.json", "credit/loans.pulse"},
	{"brand-tracker/spec/brand_tracker.synth.json", "brand/brand_tracker.pulse"},
}

var fixtureRequests = map[string]string{
	"ab/req/04_metric_battery.json":               "ab-test-readout/req/04_metric_battery.json",
	"ab/req/07_regression_adjustment.json":        "ab-test-readout/req/07_regression_adjustment.json",
	"ab/req/08_cuped_welch.json":                  "ab-test-readout/req/08_cuped_welch.json",
	"ab/req/02_srm_gof.facet.json":                "ab-test-readout/req/02_srm_gof.facet.json",
	"ab/req/11_readout.compose.json":              "ab-test-readout/req/11_readout.compose.json",
	"retail/req/06_spend_distribution_chain.json": "retail-at-scale/req/06_spend_distribution_chain.json",
	"credit/req/06_features_split.json":           "credit-risk-model/req/06_features_split.json",
	"brand/req/06_q4_banner.json":                 "brand-tracker/req/06_q4_banner.json",
}

const abCohort = `{"filename": "ab_test.pulse", "data_dir": "."}`

var inlineRequests = map[string]string{
	"ab/req/pipeline.json": `{
  "cohort": ` + abCohort + `,
  "multiplicity": {"method": "holm", "family": "request"},
  "filterers": [
    {"type": "FILTER_INCLUDE", "field": "device", "values": ["desktop", "mobile"]},
    {"type": "FILTER_INCLUDE", "field": "plan_tier", "values": ["individual", "team"]}
  ],
  "attributes": [
    {"type": "ATTR_FORMULA", "field": "pages_viewed", "label": "pages_x2", "expression": "pages_viewed * 2"},
    {"type": "ATTR_FORMULA", "field": "prior_sessions", "label": "sessions_plus", "expression": "prior_sessions + 1"}
  ],
  "groups": [{"type": "GROUP_CATEGORY", "field": "assign_week"}],
  "aggregations": [
    {"type": "AGG_AVERAGE", "field": "revenue", "label": "rev"},
    {"type": "AGG_COUNT", "field": "user_id", "label": "users"}
  ],
  "windows": [{"type": "WIN_LAG", "field": "rev", "label": "rev_prev", "order_by": [{"field": "assign_week"}], "params": {"offset": 1}}],
  "sort": [{"field": "assign_week"}],
  "post_tests": [{"type": "TEST_TREND", "field": "rev", "label": "rev_trend", "order_by": [{"field": "assign_week"}], "params": {"variant": "mann_kendall"}}],
  "outputs": [{"format": "csv", "path": "should_never_be_written.csv"}]
}`,
	"ab/req/matrix.json": `{
  "cohort": ` + abCohort + `,
  "vectors": [{"name": "drivers", "fields": ["pages_viewed", "prior_sessions", "revenue"]}],
  "matrices": [{"type": "MAT_CORRELATION", "name": "corr", "vector": "drivers"}]
}`,
	"ab/req/overlay.compose.json": `{
  "requests": [
    {"label": "variant", "cohort": ` + abCohort + `, "filterers": [{"type": "FILTER_INCLUDE", "field": "arm", "values": ["new_page"]}],
     "groups": [{"type": "GROUP_CATEGORY", "field": "device"}], "aggregations": [{"type": "AGG_AVERAGE", "field": "pages_viewed", "label": "pages"}]},
    {"label": "control", "cohort": ` + abCohort + `, "filterers": [{"type": "FILTER_INCLUDE", "field": "arm", "values": ["old_page"]}],
     "groups": [{"type": "GROUP_CATEGORY", "field": "device"}], "aggregations": [{"type": "AGG_AVERAGE", "field": "pages_viewed", "label": "pages"}]}
  ],
  "overlays": [{"name": "lift", "kind": "OVERLAY_DELTA_VS_REF", "scope": "group", "reference": "control", "targets": ["variant"]}]
}`,
}

type previewFixture struct {
	srv   *Server
	dir   string
	calls atomic.Int64 // top-level engine operations, excluding manifest and inspect
}

func newPreviewFixture(t *testing.T) *previewFixture {
	t.Helper()
	return newPreviewFixtureConfig(t, Config{PreviewTimeout: 30 * time.Second})
}

func newPreviewFixtureConfig(t *testing.T, cfg Config) *previewFixture {
	t.Helper()
	show := showcaseDir()
	dir := t.TempDir()
	for _, c := range fixtureCohorts {
		synthCohort(t, filepath.Join(show, c.spec), filepath.Join(dir, c.out), 3000, 7)
	}
	write := func(rel string, data []byte) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for dst, src := range fixtureRequests {
		data, err := os.ReadFile(filepath.Join(show, src))
		if err != nil {
			t.Skipf("showcase request %s unavailable: %v", src, err)
		}
		write(dst, data)
	}
	for dst, text := range inlineRequests {
		write(dst, []byte(text))
	}
	root, err := scope.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	f := &previewFixture{dir: dir}
	hooks := &observe.Hooks{OnOperationStart: func(ctx context.Context, info observe.OperationInfo) context.Context {
		if info.Parent == 0 && info.Kind != observe.OpManifest && info.Kind != observe.OpPayloadSchema && info.Kind != observe.OpInspect {
			f.calls.Add(1)
		}
		return ctx
	}}
	engine, err := pulse.New(pulse.Options{DataDir: root.Dir(), Hooks: hooks})
	if err != nil {
		t.Fatal(err)
	}
	f.srv = New(root, engine, cfg, nil, false)
	return f
}

func (f *previewFixture) read(t *testing.T, rel string) json.RawMessage {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(f.dir, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func (f *previewFixture) post(t *testing.T, body map[string]any) (int, map[string]any) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	f.srv.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/preview", bytes.NewReader(raw)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

// direct runs a sub-request straight through the public engine API (the
// library equivalent of `pulse api <verb> -r sub.json`), independent of
// the preview package, and returns the response as generic JSON.
func (f *previewFixture) direct(t *testing.T, verb string, req any) map[string]any {
	t.Helper()
	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	e := f.srv.Engine()
	var out any
	switch verb {
	case "process":
		var r pulse.Request
		mustUnmarshal(t, raw, &r)
		out, err = e.Process(ctx, &r)
	case "compose":
		var r pulse.ComposedRequest
		mustUnmarshal(t, raw, &r)
		out, err = e.Compose(ctx, &r)
	case "chain":
		var r pulse.ChainRequest
		mustUnmarshal(t, raw, &r)
		out, err = e.ProcessChain(ctx, &r)
	case "facet":
		var r pulse.FacetRequest
		mustUnmarshal(t, raw, &r)
		out, err = e.FacetSchema(ctx, &r)
	default:
		t.Fatalf("unknown verb %q", verb)
	}
	if err != nil {
		t.Fatalf("direct %s: %v", verb, err)
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	mustUnmarshal(t, b, &m)
	return m
}

func mustUnmarshal(t *testing.T, data []byte, v any) {
	t.Helper()
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatal(err)
	}
}

// at walks a generic JSON value by keys and indices.
func at(v any, path ...any) any {
	for _, p := range path {
		switch k := p.(type) {
		case string:
			m, _ := v.(map[string]any)
			v = m[k]
		case int:
			a, _ := v.([]any)
			if k >= len(a) {
				return nil
			}
			v = a[k]
		}
	}
	return v
}

func TestPreviewProbes(t *testing.T) {
	f := newPreviewFixture(t)
	type tc struct {
		name  string
		path  string
		nodes []string
		extra map[string]any
		kind  string
		cost  string
		verb  string
		// slot is the compose/chain response the node lives in (-1: top).
		slot int
		// check asserts the probe is populated; parity compares it with
		// the direct engine response of the same sub-request.
		check  func(t *testing.T, probe map[string]any)
		parity func(t *testing.T, probe, direct map[string]any)
	}
	equal := func(t *testing.T, what string, got, want any) {
		t.Helper()
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: probe %v, direct engine %v", what, got, want)
		}
	}
	rowsParity := func(t *testing.T, probe, direct map[string]any) {
		equal(t, "rows.total", at(probe, "rows", "total"), at(direct, "metadata", "total_rows"))
		equal(t, "rows.filtered", at(probe, "rows", "filtered"), at(direct, "metadata", "filtered_rows"))
	}
	filterParity := func(idx int) func(*testing.T, map[string]any, map[string]any) {
		return func(t *testing.T, probe, direct map[string]any) {
			for _, k := range []string{"n_in", "n_out", "n_null_input"} {
				equal(t, k, at(probe, "filter", k), at(direct, "components", "filterers", idx, k))
			}
		}
	}
	statsParity := func(idx int, quantiles bool) func(*testing.T, map[string]any, map[string]any) {
		return func(t *testing.T, probe, direct map[string]any) {
			row := at(direct, "data", 0)
			for stat, key := range map[string]string{"n": "n", "min": "min", "max": "max", "mean": "mean", "stddev": "sd"} {
				want := at(row, fmt.Sprintf("__probe%d_%s", idx, key))
				if want == nil {
					t.Fatalf("direct response has no %s column: %v", key, row)
				}
				equal(t, stat, at(probe, "stats", stat), want)
			}
			if !quantiles {
				return
			}
			for i, p := range []string{"p5", "p25", "p50", "p75", "p95"} {
				equal(t, p, at(probe, "stats", "quantiles", i, "value"), at(row, fmt.Sprintf("__probe%d_%s", idx, p)))
			}
		}
	}
	tableParity := func(t *testing.T, probe, direct map[string]any) {
		rows, _ := at(direct, "data").([]any)
		equal(t, "table.total_rows", at(probe, "table", "total_rows"), float64(len(rows)))
		if len(rows) > 100 {
			rows = rows[:100]
		}
		equal(t, "table.rows", at(probe, "table", "rows"), any(rows))
	}
	resultParity := func(key string, idx int) func(*testing.T, map[string]any, map[string]any) {
		return func(t *testing.T, probe, direct map[string]any) {
			want := at(direct, key)
			if idx >= 0 {
				want = at(direct, key, idx)
			}
			if want == nil {
				t.Fatalf("direct response has no %s[%d]", key, idx)
			}
			equal(t, "result", at(probe, "result"), want)
		}
	}
	nonEmpty := func(keys ...string) func(*testing.T, map[string]any) {
		return func(t *testing.T, probe map[string]any) {
			for _, k := range keys {
				if at(probe, k) == nil {
					t.Fatalf("probe has no %s: %v", k, probe)
				}
			}
		}
	}

	cases := []tc{
		{name: "cohort", path: "ab/req/08_cuped_welch.json", nodes: []string{"cohort"}, kind: "cohort", cost: "cheap", verb: "process",
			check: func(t *testing.T, p map[string]any) {
				if at(p, "rows", "total") != float64(3000) {
					t.Fatalf("rows = %v", at(p, "rows"))
				}
			}},
		{name: "cohort facet", path: "ab/req/04_metric_battery.json", nodes: []string{"cohort"}, kind: "facet", cost: "expensive", verb: "facet",
			extra: map[string]any{"facet": map[string]any{"fields": []string{"revenue", "device"}}},
			check: func(t *testing.T, p map[string]any) {
				if at(p, "facet", "revenue", "numeric", "percentiles") == nil {
					t.Fatalf("facet probe lacks default percentiles: %v", at(p, "facet", "revenue"))
				}
			},
			parity: func(t *testing.T, p, d map[string]any) { equal(t, "facet", at(p, "facet"), at(d, "fields")) }},
		{name: "filter", path: "ab/req/pipeline.json", nodes: []string{"filterers[1]"}, kind: "filter", cost: "cheap", verb: "process",
			check: nonEmpty("filter"), parity: filterParity(1)},
		{name: "filter facet", path: "ab/req/pipeline.json", nodes: []string{"filterers[0]"}, kind: "facet", cost: "expensive", verb: "facet",
			extra: map[string]any{"facet": map[string]any{"fields": []string{"revenue"}, "include_histogram": true, "histogram_bins": 10, "histogram_range": []float64{0, 1000}}},
			check: func(t *testing.T, p map[string]any) {
				if at(p, "rows", "filtered").(float64) >= at(p, "rows", "total").(float64) {
					t.Fatalf("filter facet did not filter: %v", at(p, "rows"))
				}
			},
			parity: func(t *testing.T, p, d map[string]any) { equal(t, "facet", at(p, "facet"), at(d, "fields")) }},
		{name: "feature", path: "credit/req/06_features_split.json", nodes: []string{"features[1]"}, kind: "feature", cost: "expensive", verb: "process",
			check: nonEmpty("stats"), parity: statsParity(1, true)},
		{name: "attribute", path: "ab/req/08_cuped_welch.json", nodes: []string{"attributes[0]"}, kind: "attribute", cost: "expensive", verb: "process",
			check: nonEmpty("stats"), parity: statsParity(0, true)},
		{name: "attribute cheap", path: "ab/req/08_cuped_welch.json", nodes: []string{"attributes[0]"}, kind: "attribute", cost: "cheap", verb: "process",
			extra: map[string]any{"quantiles": false},
			check: func(t *testing.T, p map[string]any) {
				if at(p, "stats", "quantiles") != nil || at(p, "stats", "mean") == nil {
					t.Fatalf("cheap stats = %v", at(p, "stats"))
				}
			},
			parity: statsParity(0, false)},
		{name: "group", path: "ab/req/pipeline.json", nodes: []string{"groups[0]"}, kind: "group", cost: "cheap", verb: "process",
			check: nonEmpty("table", "component"), parity: tableParity},
		{name: "aggregation", path: "ab/req/pipeline.json", nodes: []string{"aggregations[0]"}, kind: "aggregation", cost: "cheap", verb: "process",
			check: nonEmpty("table", "component"), parity: tableParity},
		{name: "window", path: "ab/req/pipeline.json", nodes: []string{"windows[0]"}, kind: "window", cost: "cheap", verb: "process",
			check: nonEmpty("table"), parity: tableParity},
		{name: "sort", path: "ab/req/pipeline.json", nodes: []string{"sort[0]"}, kind: "sort", cost: "cheap", verb: "process",
			check: nonEmpty("table"), parity: tableParity},
		{name: "test", path: "ab/req/08_cuped_welch.json", nodes: []string{"tests[1]"}, kind: "test", cost: "expensive", verb: "process",
			check: nonEmpty("result"), parity: resultParity("tests", 1)},
		{name: "post test", path: "ab/req/pipeline.json", nodes: []string{"post_tests[0]"}, kind: "post_test", cost: "expensive", verb: "process",
			check: nonEmpty("result"), parity: resultParity("post_tests", 0)},
		{name: "regression", path: "ab/req/07_regression_adjustment.json", nodes: []string{"regressions[1]"}, kind: "regression", cost: "expensive", verb: "process",
			check: nonEmpty("result"), parity: resultParity("regressions", 1)},
		{name: "matrix", path: "ab/req/matrix.json", nodes: []string{"matrices[0]"}, kind: "matrix", cost: "expensive", verb: "process",
			check: nonEmpty("result"), parity: resultParity("matrices", 0)},
		{name: "vector has no probe", path: "ab/req/matrix.json", nodes: []string{"vectors[0]"}, kind: "none", cost: "cheap", verb: "none",
			check: nonEmpty("reason")},
		{name: "compose slot attribute", path: "ab/req/11_readout.compose.json", nodes: []string{"requests[1].attributes[0]"}, kind: "attribute", cost: "expensive", verb: "process",
			check: nonEmpty("stats"), parity: statsParity(0, true)},
		{name: "compose slot crosstab", path: "brand/req/06_q4_banner.json", nodes: []string{"requests[9].crosstab"}, kind: "crosstab", cost: "expensive", verb: "process",
			check: nonEmpty("result"), parity: resultParity("crosstab", -1)},
		{name: "compose slot overlay", path: "brand/req/06_q4_banner.json", nodes: []string{"requests[0].overlays[0]"}, kind: "overlay", cost: "expensive", verb: "process",
			check: nonEmpty("result"), parity: resultParity("overlays", 0)},
		{name: "compose overlay", path: "ab/req/overlay.compose.json", nodes: []string{"overlays[0]"}, kind: "overlay", cost: "expensive", verb: "compose",
			check: nonEmpty("result"), parity: resultParity("overlays", 0)},
		{name: "chain stage attribute", path: "retail/req/06_spend_distribution_chain.json", nodes: []string{"stages[1].request.attributes[0]"},
			kind: "attribute", cost: "cheap", verb: "chain", slot: 1, check: nonEmpty("stats"),
			parity: func(t *testing.T, p, d map[string]any) {
				equal(t, "mean", at(p, "stats", "mean"), at(d, "data", 0, "__probe0_mean"))
			}},
		{name: "chain stage filter", path: "retail/req/06_spend_distribution_chain.json", nodes: []string{"stages[0].request.filterers[0]"},
			kind: "filter", cost: "cheap", verb: "chain", slot: 0, check: nonEmpty("filter"), parity: filterParity(0)},
		{name: "chain cohort", path: "retail/req/06_spend_distribution_chain.json", nodes: []string{"cohort"}, kind: "cohort", cost: "cheap", verb: "process"},
		{name: "facet root filter-free cohort", path: "ab/req/02_srm_gof.facet.json", nodes: []string{"cohort"}, kind: "facet", verb: "facet",
			check: nonEmpty("facet"), parity: func(t *testing.T, p, d map[string]any) { equal(t, "facet", at(p, "facet"), at(d, "fields")) }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			body := map[string]any{"path": c.path, "request": f.read(t, c.path), "nodes": c.nodes}
			for k, v := range c.extra {
				body[k] = v
			}
			before := f.calls.Load()
			code, out := f.post(t, body)
			if code != http.StatusOK {
				t.Fatalf("status %d: %v", code, out)
			}
			calls := f.calls.Load() - before
			wantCalls := int64(1)
			if c.verb == "none" {
				wantCalls = 0
			}
			if calls != wantCalls {
				t.Fatalf("engine calls = %d, want %d", calls, wantCalls)
			}
			if out["verb"] != c.verb {
				t.Fatalf("verb = %v, want %s", out["verb"], c.verb)
			}
			if c.cost != "" && out["cost"] != c.cost {
				t.Fatalf("cost = %v, want %s", out["cost"], c.cost)
			}
			probe, _ := at(out, "probes", 0).(map[string]any)
			if probe["node"] != c.nodes[0] || probe["kind"] != c.kind {
				t.Fatalf("probe = %v, want node %s kind %s", probe, c.nodes[0], c.kind)
			}
			if c.check != nil {
				c.check(t, probe)
			}
			if c.parity == nil {
				return
			}
			direct := f.direct(t, c.verb, out["request"])
			if c.slot > 0 || c.verb == "chain" {
				direct, _ = at(direct, "stages", c.slot).(map[string]any)
			}
			if c.verb != "facet" && c.kind != "overlay" {
				rowsParity(t, probe, direct)
			}
			c.parity(t, probe, direct)
		})
	}
}

func TestPreviewOutputsNeverRun(t *testing.T) {
	f := newPreviewFixture(t)
	path := "ab/req/pipeline.json"
	for _, node := range []string{"filterers[0]", "aggregations[1]", "post_tests[0]"} {
		code, out := f.post(t, map[string]any{"path": path, "request": f.read(t, path), "node": node})
		if code != http.StatusOK {
			t.Fatalf("%s: status %d: %v", node, code, out)
		}
		if at(out, "request", "outputs") != nil {
			t.Fatalf("%s: sub-request kept outputs", node)
		}
	}
	if _, err := os.Stat(filepath.Join(f.dir, "should_never_be_written.csv")); err == nil {
		t.Fatal("preview wrote the request's outputs")
	}
}

// Truncation semantics: a filter probe's counters equal the same filter's
// counters in the full request.
func TestPreviewFilterMatchesFullRun(t *testing.T) {
	f := newPreviewFixture(t)
	path := "ab/req/pipeline.json"
	var full map[string]any
	mustUnmarshal(t, f.read(t, path), &full)
	delete(full, "outputs")
	full["cohort"] = map[string]any{"filename": "ab/ab_test.pulse"}
	direct := f.direct(t, "process", full)
	for i := range 2 {
		_, out := f.post(t, map[string]any{"path": path, "request": f.read(t, path), "node": fmt.Sprintf("filterers[%d]", i)})
		for _, k := range []string{"n_in", "n_out"} {
			got, want := at(out, "probes", 0, "filter", k), at(direct, "components", "filterers", i, k)
			if got != want {
				t.Fatalf("filterers[%d].%s: probe %v, full run %v", i, k, got, want)
			}
		}
	}
}

// A batch of a stage's nodes runs as one sub-request; all attribute
// percentiles share it.
func TestPreviewBatch(t *testing.T) {
	f := newPreviewFixture(t)
	path := "ab/req/pipeline.json"
	before := f.calls.Load()
	code, out := f.post(t, map[string]any{"path": path, "request": f.read(t, path), "nodes": []string{"attributes[0]", "attributes[1]"}})
	if code != http.StatusOK {
		t.Fatalf("status %d: %v", code, out)
	}
	if n := f.calls.Load() - before; n != 1 {
		t.Fatalf("engine calls = %d, want 1", n)
	}
	aggs, _ := at(out, "request", "aggregations").([]any)
	pct := 0
	for _, a := range aggs {
		if at(a, "type") == "AGG_PERCENTILE" {
			pct++
		}
	}
	if pct != 10 {
		t.Fatalf("batched sub-request has %d percentile aggregations, want 10", pct)
	}
	for i, field := range []string{"pages_x2", "sessions_plus"} {
		if at(out, "probes", i, "stats", "field") != field || len(at(out, "probes", i, "stats", "quantiles").([]any)) != 5 {
			t.Fatalf("probe %d = %v", i, at(out, "probes", i))
		}
	}
	if at(out, "request", "groups") != nil || at(out, "request", "tests") != nil {
		t.Fatalf("attribute batch kept downstream sections: %v", out["request"])
	}
}

func TestPreviewErrors(t *testing.T) {
	f := newPreviewFixture(t)
	path := "ab/req/pipeline.json"
	req := f.read(t, path)
	badField := json.RawMessage(`{"cohort": {"filename": "ab_test.pulse"}, "filterers": [{"type": "FILTER_INCLUDE", "field": "nope", "values": ["x"]}]}`)
	cases := []struct {
		name   string
		body   map[string]any
		status int
		code   string
	}{
		{"no request", map[string]any{"node": "cohort"}, 400, "missing_request"},
		{"no node", map[string]any{"request": req}, 400, "missing_node"},
		{"bad path", map[string]any{"request": req, "node": "filterers[01]"}, 400, "invalid_node"},
		{"missing node", map[string]any{"request": req, "node": "filterers[9]"}, 404, "node_not_found"},
		{"mixed batch", map[string]any{"path": path, "request": req, "nodes": []string{"filterers[0]", "groups[0]"}}, 400, "mixed_batch"},
		{"section not entry", map[string]any{"path": path, "request": req, "node": "filterers"}, 400, "invalid_node"},
		{"cohort missing", map[string]any{"path": "elsewhere/req/x.json", "request": req, "node": "cohort"}, 404, "cohort_not_found"},
		{"engine error", map[string]any{"path": "ab/x.json", "request": badField, "node": "filterers[0]"}, 422, ""},
		{"not a request", map[string]any{"request": json.RawMessage(`[1]`), "node": "cohort"}, 400, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			code, out := f.post(t, c.body)
			if code != c.status {
				t.Fatalf("status = %d, want %d: %v", code, c.status, out)
			}
			if c.code != "" && at(out, "error", "code") != c.code {
				t.Fatalf("code = %v, want %s", at(out, "error", "code"), c.code)
			}
			if at(out, "error", "message") == "" {
				t.Fatalf("no error message: %v", out)
			}
		})
	}
}

func TestCohortCandidates(t *testing.T) {
	cohort := func(f, d string) map[string]any {
		m := map[string]any{"filename": f}
		if d != "" {
			m["data_dir"] = d
		}
		return m
	}
	cases := []struct {
		req    string
		cohort any
		want   []string
	}{
		{"case/req/a.json", cohort("c.pulse", "."), []string{"c.pulse", "case/req/c.pulse", "case/c.pulse"}},
		{"a.json", cohort("c.pulse", ""), []string{"c.pulse"}},
		{"case/req/a.json", cohort("c.pulse", "data"), []string{"data/c.pulse", "case/req/data/c.pulse", "case/data/c.pulse"}},
		{"req/a.json", cohort("../c.pulse", "."), []string{"c.pulse"}},
		{"a.json", cohort("/abs/c.pulse", ""), []string{}},
		{"a.json", "nope", []string{}},
	}
	for _, c := range cases {
		got := cohortCandidates(c.req, c.cohort)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("cohortCandidates(%q, %v) = %v, want %v", c.req, c.cohort, got, c.want)
		}
	}
}
