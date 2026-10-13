package preview

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/frankbardon/pulse"
)

func testCatalog() *Catalog {
	numeric := map[string]bool{"f64": true, "u16": true, "packed_bool": true}
	return &Catalog{
		Emits:         map[string]string{"ATTR_FORMULA": "f64", "ATTR_SET_HAS": "packed_bool", "FEAT_LOG": "f64", "FEAT_ONE_HOT": ""},
		Aggregators:   map[string]bool{"AGG_COUNT": true, "AGG_MIN": true, "AGG_MAX": true, "AGG_AVERAGE": true, "AGG_STDDEV": true, "AGG_PERCENTILE": true, "AGG_SUM": true},
		MomentTypes:   numeric,
		QuantileTypes: map[string]bool{"f64": true, "u16": true},
		Mergeable:     map[string]bool{"AGG_COUNT": true, "AGG_MIN": true, "AGG_MAX": true, "AGG_AVERAGE": true, "AGG_STDDEV": true, "AGG_SUM": true},
		Buffered:      map[string]bool{"AGG_PERCENTILE": true, "AGG_MEDIAN": true},
	}
}

const fullRequest = `{
  "label": "r",
  "cohort": {"filename": "c.pulse", "data_dir": "."},
  "time_zone": "UTC",
  "weight": {"field": "w"},
  "multiplicity": {"method": "holm"},
  "features": [{"type": "FEAT_LOG", "field": "x", "label": "lx"}, {"type": "FEAT_ONE_HOT", "field": "c", "label": "oh"}],
  "filterers": [{"type": "FILTER_INCLUDE", "field": "c", "values": ["a"]}, {"type": "FILTER_RANGE", "field": "x"}, {"type": "FILTER_NULL", "field": "y"}],
  "attributes": [{"type": "ATTR_FORMULA", "label": "a0", "expression": "x+1"}, {"type": "ATTR_SET_HAS", "label": "a1"}, {"type": "ATTR_FORMULA", "expression": "x"}],
  "groups": [{"type": "GROUP_CATEGORY", "field": "g"}, {"type": "GROUP_CATEGORY", "field": "h"}],
  "aggregations": [{"type": "AGG_SUM", "field": "x", "label": "s"}, {"type": "AGG_COUNT", "field": "x", "label": "n"}],
  "windows": [{"type": "WIN_LAG", "field": "s", "label": "lag"}],
  "sort": [{"field": "g"}],
  "tests": [{"type": "TEST_WELCH", "field": "x", "split_by": "c", "label": "t0"}, {"type": "TEST_T", "field": "x", "split_by": "c", "label": "t1"}],
  "post_tests": [{"type": "TEST_TREND", "field": "s", "label": "p0"}],
  "regressions": [{"type": "REG_OLS", "name": "m", "target": "x", "predictors": ["y"]}],
  "vectors": [{"name": "v", "fields": ["x", "y"]}],
  "matrices": [{"type": "MAT_CORRELATION", "name": "corr", "vector": "v"}],
  "overlays": [{"name": "o", "kind": "OVERLAY_INDEX_VS_POP"}],
  "outputs": [{"format": "csv", "path": "out.csv"}],
  "return": {"preset": "minimal"},
  "disable_components": true
}`

func decode(t *testing.T, s string) map[string]any {
	t.Helper()
	doc, err := DecodeDoc([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func lenOf(m map[string]any, k string) int {
	a, _ := m[k].([]any)
	return len(a)
}

func labels(m map[string]any, k string) []string {
	var out []string
	for _, e := range m[k].([]any) {
		l, _ := e.(map[string]any)["label"].(string)
		out = append(out, l)
	}
	return out
}

// context keys every Request probe keeps (vectors dropped for cohort).
var ctx = []string{"cohort", "disable_components", "label", "return", "time_zone", "vectors", "weight"}

func with(extra ...string) []string {
	out := append(slices.Clone(ctx), extra...)
	sort.Strings(out)
	return out
}

func TestBuildRequestProbes(t *testing.T) {
	cases := []struct {
		node    string
		kind    string
		cost    string
		keys    []string
		include []string
		check   func(t *testing.T, sub map[string]any, np *NodePlan)
	}{
		{"cohort", KindCohort, CostCheap,
			[]string{"cohort", "disable_components", "label", "return", "time_zone", "weight"},
			[]string{"metadata", "components"}, nil},
		{"features[0]", KindFeature, CostExpensive, with("features", "aggregations"), []string{"metadata", "components", "data"},
			func(t *testing.T, sub map[string]any, np *NodePlan) {
				if lenOf(sub, "features") != 1 || np.Stats.Field != "lx" || len(np.Stats.Quantiles) != 5 {
					t.Fatalf("sub=%v stats=%+v", sub, np.Stats)
				}
			}},
		{"features[1]", KindFeature, CostCheap, with("features"), nil,
			func(t *testing.T, sub map[string]any, np *NodePlan) {
				if np.Stats.Note == "" || np.Stats.Field != "" {
					t.Fatalf("multi-output feature should not be probed: %+v", np.Stats)
				}
			}},
		{"filterers[1]", KindFilter, CostCheap, with("features", "filterers"), []string{"metadata", "components"},
			func(t *testing.T, sub map[string]any, _ *NodePlan) {
				if lenOf(sub, "filterers") != 2 || lenOf(sub, "features") != 2 {
					t.Fatalf("filterers truncation: %v", sub["filterers"])
				}
			}},
		{"attributes[0]", KindAttribute, CostExpensive, with("features", "filterers", "attributes", "aggregations"), nil,
			func(t *testing.T, sub map[string]any, np *NodePlan) {
				if lenOf(sub, "attributes") != 1 || lenOf(sub, "filterers") != 3 {
					t.Fatalf("attribute truncation: %v", sub)
				}
				want := []string{"__probe0_n", "__probe0_min", "__probe0_max", "__probe0_mean", "__probe0_sd",
					"__probe0_p5", "__probe0_p25", "__probe0_p50", "__probe0_p75", "__probe0_p95"}
				if got := labels(sub, "aggregations"); !reflect.DeepEqual(got, want) {
					t.Fatalf("hidden aggregations = %v", got)
				}
			}},
		{"attributes[1]", KindAttribute, CostCheap, with("features", "filterers", "attributes", "aggregations"), nil,
			func(t *testing.T, sub map[string]any, np *NodePlan) {
				// packed_bool: moments yes, percentiles no.
				if got := labels(sub, "aggregations"); len(got) != 5 || np.Stats.Mean != "__probe1_mean" {
					t.Fatalf("hidden aggregations = %v", got)
				}
			}},
		{"attributes[2]", KindAttribute, CostCheap, with("features", "filterers", "attributes"), nil,
			func(t *testing.T, sub map[string]any, np *NodePlan) {
				if np.Stats.Note == "" {
					t.Fatalf("unlabeled attribute should carry a note")
				}
			}},
		{"groups[0]", KindGroup, CostCheap, with("features", "filterers", "attributes", "groups", "aggregations"), []string{"metadata", "components", "data"},
			func(t *testing.T, sub map[string]any, np *NodePlan) {
				if lenOf(sub, "groups") != 1 || !reflect.DeepEqual(labels(sub, "aggregations"), []string{"__probe0_n"}) {
					t.Fatalf("group probe: %v", sub)
				}
			}},
		{"aggregations[0]", KindAggregation, CostCheap, with("features", "filterers", "attributes", "groups", "aggregations"), nil,
			func(t *testing.T, sub map[string]any, _ *NodePlan) {
				if lenOf(sub, "groups") != 2 || !reflect.DeepEqual(labels(sub, "aggregations"), []string{"s"}) {
					t.Fatalf("aggregation probe: %v", sub)
				}
			}},
		{"windows[0]", KindWindow, CostCheap, with("features", "filterers", "attributes", "groups", "aggregations", "windows"), nil, nil},
		{"sort[0]", KindSort, CostCheap, with("features", "filterers", "attributes", "groups", "aggregations", "windows", "sort"), nil, nil},
		{"tests[0]", KindTest, CostExpensive, with("features", "filterers", "attributes", "groups", "aggregations", "tests", "multiplicity"), []string{"metadata", "components", "tests"},
			func(t *testing.T, sub map[string]any, _ *NodePlan) {
				if lenOf(sub, "tests") != 2 {
					t.Fatalf("tests keep the whole family for multiplicity: %v", sub["tests"])
				}
			}},
		{"post_tests[0]", KindPostTest, CostExpensive,
			with("features", "filterers", "attributes", "groups", "aggregations", "windows", "sort", "post_tests", "multiplicity"), nil, nil},
		{"regressions[0]", KindRegression, CostExpensive, with("features", "filterers", "attributes", "groups", "aggregations", "regressions"), nil, nil},
		{"matrices[0]", KindMatrix, CostExpensive, with("features", "filterers", "attributes", "groups", "aggregations", "matrices"), nil, nil},
		{"overlays[0]", KindOverlay, CostExpensive,
			with("features", "filterers", "attributes", "groups", "aggregations", "windows", "sort", "tests", "post_tests", "regressions", "matrices", "multiplicity", "overlays"),
			[]string{"metadata", "components", "overlays"}, nil},
	}
	for _, c := range cases {
		t.Run(c.node, func(t *testing.T) {
			plan, err := Build(decode(t, fullRequest), "request", []string{c.node}, testCatalog(), Options{Quantiles: true})
			if err != nil {
				t.Fatal(err)
			}
			if plan.Verb != VerbProcess || plan.Slot != -1 {
				t.Fatalf("verb %s slot %d", plan.Verb, plan.Slot)
			}
			np := plan.Nodes[0]
			if np.Kind != c.kind || plan.Cost != c.cost {
				t.Fatalf("kind %s cost %s, want %s %s", np.Kind, plan.Cost, c.kind, c.cost)
			}
			sub := plan.Request
			if got := keys(sub); !reflect.DeepEqual(got, c.keys) {
				t.Fatalf("sub-request keys = %v, want %v", got, c.keys)
			}
			if sub["disable_components"] != false {
				t.Fatalf("components must be forced on")
			}
			if c.include != nil {
				got := sub["return"].(map[string]any)["include"]
				want := make([]any, len(c.include))
				for i, s := range c.include {
					want[i] = s
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("return.include = %v, want %v", got, c.include)
				}
			}
			if c.check != nil {
				c.check(t, sub, np)
			}
		})
	}
}

func TestBuildNoProbe(t *testing.T) {
	for _, node := range []string{"multiplicity", "return", "outputs[0]", "label"} {
		plan, err := Build(decode(t, fullRequest), "request", []string{node}, testCatalog(), Options{})
		if err != nil {
			t.Fatalf("%s: %v", node, err)
		}
		if plan.Verb != VerbNone || plan.Nodes[0].Kind != KindNone || plan.Nodes[0].Reason == "" {
			t.Fatalf("%s: plan %+v", node, plan.Nodes[0])
		}
	}
}

func TestBuildQuantilesOff(t *testing.T) {
	plan, err := Build(decode(t, fullRequest), "request", []string{"attributes[0]"}, testCatalog(), Options{Quantiles: false})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Cost != CostCheap || len(plan.Nodes[0].Stats.Quantiles) != 0 || lenOf(plan.Request, "aggregations") != 5 {
		t.Fatalf("plan = %+v aggs %v", plan, plan.Request["aggregations"])
	}
}

// A request's own buffered aggregations (percentile, median) make every
// probe whose sub-request keeps them expensive; probes upstream of them,
// or truncated before them, stay cheap.
func TestBuildBufferedAggregationsAreExpensive(t *testing.T) {
	const req = `{
  "cohort": {"filename": "c.pulse"},
  "attributes": [{"type": "ATTR_FORMULA", "label": "a0", "expression": "x+1"}],
  "groups": [{"type": "GROUP_CATEGORY", "field": "g"}],
  "aggregations": [{"type": "AGG_SUM", "field": "x", "label": "s"}, {"type": "AGG_PERCENTILE", "field": "x", "label": "p90", "params": {"percentile": 90}}],
  "windows": [{"type": "WIN_LAG", "field": "s", "label": "lag"}],
  "sort": [{"field": "g"}],
  "tests": [{"type": "TEST_WELCH", "field": "x", "split_by": "g", "label": "t0"}]
}`
	for node, want := range map[string]string{
		"attributes[0]":   CostCheap,
		"groups[0]":       CostCheap,
		"aggregations[0]": CostCheap, // truncated before the percentile
		"aggregations[1]": CostExpensive,
		"windows[0]":      CostExpensive,
		"sort[0]":         CostExpensive,
		"tests[0]":        CostExpensive,
	} {
		plan, err := Build(decode(t, req), "request", []string{node}, testCatalog(), Options{})
		if err != nil {
			t.Fatalf("%s: %v", node, err)
		}
		if plan.Cost != want {
			t.Errorf("%s: cost %s, want %s", node, plan.Cost, want)
		}
	}
	// AGG_MEDIAN is buffered too; an unbuffered aggregation stays cheap.
	median := `{"cohort": {"filename": "c.pulse"}, "groups": [{"type": "GROUP_CATEGORY", "field": "g"}], "aggregations": [{"type": "AGG_MEDIAN", "field": "x", "label": "m"}]}`
	if plan, _ := Build(decode(t, median), "request", []string{"aggregations[0]"}, testCatalog(), Options{}); plan.Cost != CostExpensive {
		t.Errorf("median cost %s", plan.Cost)
	}
	sum := `{"cohort": {"filename": "c.pulse"}, "groups": [{"type": "GROUP_CATEGORY", "field": "g"}], "aggregations": [{"type": "AGG_SUM", "field": "x", "label": "s"}]}`
	if plan, _ := Build(decode(t, sum), "request", []string{"aggregations[0]"}, testCatalog(), Options{}); plan.Cost != CostCheap {
		t.Errorf("sum cost %s", plan.Cost)
	}
}

// Hidden probe aggregations opt out of a request weight with
// "weight": null; unweighted requests leave the key out.
func TestBuildHiddenAggregationsOptOutOfWeight(t *testing.T) {
	weighted := `{"cohort": {"filename": "c.pulse"}, "weight": {"field": "w"},
  "attributes": [{"type": "ATTR_FORMULA", "label": "a0", "expression": "x+1"}],
  "groups": [{"type": "GROUP_CATEGORY", "field": "g"}]}`
	unweighted := `{"cohort": {"filename": "c.pulse"},
  "attributes": [{"type": "ATTR_FORMULA", "label": "a0", "expression": "x+1"}],
  "groups": [{"type": "GROUP_CATEGORY", "field": "g"}]}`
	for _, c := range []struct {
		doc  string
		want bool
	}{{weighted, true}, {unweighted, false}} {
		for _, node := range []string{"attributes[0]", "groups[0]"} {
			plan, err := Build(decode(t, c.doc), "request", []string{node}, testCatalog(), Options{Quantiles: true})
			if err != nil {
				t.Fatal(err)
			}
			aggs := plan.Request["aggregations"].([]any)
			if len(aggs) == 0 {
				t.Fatalf("%s: no hidden aggregations", node)
			}
			for _, a := range aggs {
				w, has := a.(map[string]any)["weight"]
				if has != c.want || w != nil {
					t.Fatalf("%s weighted=%v: hidden aggregation %v", node, c.want, a)
				}
			}
			// The null must reach the wire.
			raw, _ := json.Marshal(aggs[0])
			if c.want && !strings.Contains(string(raw), `"weight":null`) {
				t.Fatalf("%s: marshalled %s", node, raw)
			}
		}
	}
}

func TestBuildBatch(t *testing.T) {
	plan, err := Build(decode(t, fullRequest), "request", []string{"filterers[2]", "filterers[0]"}, testCatalog(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if lenOf(plan.Request, "filterers") != 3 || len(plan.Nodes) != 2 || plan.Nodes[0].Index != 2 || plan.Nodes[1].Index != 0 {
		t.Fatalf("batch plan %+v", plan)
	}
	if _, err := Build(decode(t, fullRequest), "request", []string{"filterers[0]", "attributes[0]"}, testCatalog(), Options{}); err == nil {
		t.Fatal("mixed sections should not batch")
	}
}

func TestBuildFacetOption(t *testing.T) {
	opts := Options{Quantiles: true, Facet: map[string]any{"fields": []any{"x"}}}
	plan, err := Build(decode(t, fullRequest), "request", []string{"filterers[1]"}, testCatalog(), opts)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Verb != VerbFacet || plan.Nodes[0].Kind != KindFacet || lenOf(plan.Request, "filterers") != 2 || plan.Cost != CostExpensive {
		t.Fatalf("facet plan %+v %v", plan, plan.Request)
	}
	if got := keys(plan.Request); !reflect.DeepEqual(got, []string{"cohort", "fields", "filterers", "numeric_percentiles"}) {
		t.Fatalf("facet keys %v", got)
	}
}

func TestBuildResolvesCohort(t *testing.T) {
	resolved := map[string]any{"filename": "case/c.pulse"}
	opts := Options{ResolveCohort: func(any) (any, error) { return resolved, nil }}
	plan, err := Build(decode(t, fullRequest), "request", []string{"cohort"}, testCatalog(), opts)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(plan.Request["cohort"], resolved) {
		t.Fatalf("cohort = %v", plan.Request["cohort"])
	}
}

const composeDoc = `{
  "requests": [
    {"label": "a", "cohort": {"filename": "c.pulse"}, "filterers": [{"type": "FILTER_NULL", "field": "x"}], "aggregations": [{"type": "AGG_SUM", "field": "x", "label": "s"}]},
    {"label": "b", "cohort": {"filename": "c.pulse"}, "attributes": [{"type": "ATTR_FORMULA", "label": "f", "expression": "x"}], "outputs": [{"format": "csv"}]}
  ],
  "fits": [{"name": "m", "request": {"cohort": {"filename": "c.pulse"}, "filterers": [{"type": "FILTER_NULL", "field": "y"}], "regressions": [{"type": "REG_OLS", "name": "m"}]}}],
  "overlays": [{"name": "o", "kind": "OVERLAY_DELTA_VS_REF", "reference": "a", "targets": ["b"]}],
  "multiplicity": {"method": "holm"},
  "return": {"preset": "minimal"}
}`

func TestBuildCompose(t *testing.T) {
	cases := []struct {
		node string
		verb string
		kind string
		slot int
	}{
		{"requests[0].filterers[0]", VerbCompose, KindFilter, 0},
		{"requests[1].attributes[0]", VerbCompose, KindAttribute, 0},
		{"fits[0].request.filterers[0]", VerbProcess, KindFilter, -1},
		{"overlays[0]", VerbCompose, KindOverlay, -1},
		{"multiplicity", VerbNone, KindNone, -1},
		{"fits[0].name", VerbNone, KindNone, -1},
	}
	for _, c := range cases {
		t.Run(c.node, func(t *testing.T) {
			doc := decode(t, composeDoc)
			if c.node == "fits[0].name" {
				doc["fits"].([]any)[0].(map[string]any)["name"] = "m"
			}
			plan, err := Build(doc, "compose", []string{c.node}, testCatalog(), Options{Quantiles: true})
			if err != nil {
				t.Fatal(err)
			}
			if plan.Verb != c.verb || plan.Nodes[0].Kind != c.kind || plan.Slot != c.slot {
				t.Fatalf("plan verb %s kind %s slot %d", plan.Verb, plan.Nodes[0].Kind, plan.Slot)
			}
			switch c.node {
			case "requests[0].filterers[0]":
				// The compose binds fits, so the slot runs as a one-slot
				// compose carrying the fits.
				reqs := plan.Request["requests"].([]any)
				if len(reqs) != 1 || plan.Request["fits"] == nil || reqs[0].(map[string]any)["label"] != "a" {
					t.Fatalf("slot compose %v", plan.Request)
				}
			case "overlays[0]":
				if _, ok := plan.Request["return"].(map[string]any)["preset"]; ok {
					t.Fatalf("caller return shaping must be replaced")
				}
				for _, r := range plan.Request["requests"].([]any) {
					if _, ok := r.(map[string]any)["outputs"]; ok {
						t.Fatalf("outputs must be dropped")
					}
				}
			}
		})
	}
}

func TestBuildComposeWithoutFitsRunsSlotAsRequest(t *testing.T) {
	doc := decode(t, composeDoc)
	delete(doc, "fits")
	plan, err := Build(doc, "compose", []string{"requests[1].attributes[0]"}, testCatalog(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Verb != VerbProcess || plan.Request["label"] != "b" || plan.Request["outputs"] != nil {
		t.Fatalf("plan %+v", plan.Request)
	}
}

const chainDoc = `{
  "cohort": {"filename": "o.pulse"},
  "stages": [
    {"name": "s0", "request": {"filterers": [{"type": "FILTER_EXPRESSION", "expression": "x > 1"}], "groups": [{"type": "GROUP_CATEGORY", "field": "k"}], "aggregations": [{"type": "AGG_SUM", "field": "x", "label": "s"}]}},
    {"name": "s1", "request": {"attributes": [{"type": "ATTR_FORMULA", "field": "s", "label": "band", "expression": "s > 1"}], "groups": [{"type": "GROUP_CATEGORY", "field": "band"}], "aggregations": [{"type": "AGG_COUNT", "field": "band", "label": "n"}]}},
    {"name": "s2", "request": {"aggregations": [{"type": "AGG_SUM", "field": "n", "label": "t"}]}}
  ],
  "overlays": [{"name": "o", "kind": "OVERLAY_DELTA_VS_STAGE"}]
}`

func TestBuildChain(t *testing.T) {
	t.Run("stage attribute", func(t *testing.T) {
		plan, err := Build(decode(t, chainDoc), "chain", []string{"stages[1].request.attributes[0]"}, testCatalog(), Options{Quantiles: true})
		if err != nil {
			t.Fatal(err)
		}
		if plan.Verb != VerbChain || plan.Slot != 1 || plan.Cost != CostCheap {
			t.Fatalf("plan %+v", plan)
		}
		stages := plan.Request["stages"].([]any)
		if len(stages) != 2 {
			t.Fatalf("chain keeps stages through the node's: %d", len(stages))
		}
		stage := stages[1].(map[string]any)
		if stage["name"] != "s1" {
			t.Fatalf("stage name lost: %v", stage)
		}
		req := stage["request"].(map[string]any)
		for _, a := range labels(req, "aggregations") {
			if a == "__probe0_p50" {
				t.Fatal("percentiles are not mergeable and must not reach a chain stage")
			}
		}
		if _, ok := req["cohort"]; ok {
			t.Fatal("stage requests carry no cohort")
		}
	})
	t.Run("stage filter keeps stage aggregation", func(t *testing.T) {
		plan, err := Build(decode(t, chainDoc), "chain", []string{"stages[0].request.filterers[0]"}, testCatalog(), Options{})
		if err != nil {
			t.Fatal(err)
		}
		req := plan.Request["stages"].([]any)[0].(map[string]any)["request"].(map[string]any)
		if lenOf(req, "aggregations") != 1 || lenOf(req, "groups") != 1 {
			t.Fatalf("stage must still aggregate: %v", req)
		}
	})
	t.Run("cohort", func(t *testing.T) {
		plan, err := Build(decode(t, chainDoc), "chain", []string{"cohort"}, testCatalog(), Options{})
		if err != nil {
			t.Fatal(err)
		}
		if plan.Verb != VerbProcess || plan.Nodes[0].Kind != KindCohort {
			t.Fatalf("plan %+v", plan)
		}
	})
	t.Run("overlay", func(t *testing.T) {
		plan, err := Build(decode(t, chainDoc), "chain", []string{"overlays[0]"}, testCatalog(), Options{})
		if err != nil {
			t.Fatal(err)
		}
		if plan.Verb != VerbChain || plan.Slot != -1 || len(plan.Request["stages"].([]any)) != 3 {
			t.Fatalf("plan %+v", plan)
		}
	})
}

const facetDoc = `{
  "cohort": {"filename": "c.pulse"},
  "fields": ["x"],
  "numeric_percentiles": [0.5],
  "filterers": [{"type": "FILTER_NULL", "field": "x"}, {"type": "FILTER_NULL", "field": "y"}],
  "overlays": [{"kind": "OVERLAY_INDEX_VS_POP"}]
}`

func TestBuildFacetRoot(t *testing.T) {
	cases := []struct {
		node      string
		kind      string
		filterers int
		overlays  bool
	}{
		{"cohort", KindFacet, 0, false},
		{"filterers[0]", KindFacet, 1, false},
		{"fields", KindFacet, 2, true},
		{"overlays[0]", KindOverlay, 2, true},
	}
	for _, c := range cases {
		plan, err := Build(decode(t, facetDoc), "facet", []string{c.node}, testCatalog(), Options{})
		if err != nil {
			t.Fatal(err)
		}
		if plan.Verb != VerbFacet || plan.Nodes[0].Kind != c.kind || lenOf(plan.Request, "filterers") != c.filterers {
			t.Fatalf("%s: plan %+v %v", c.node, plan.Nodes[0], plan.Request)
		}
		if _, ok := plan.Request["overlays"]; ok != c.overlays {
			t.Fatalf("%s: overlays kept = %v", c.node, ok)
		}
	}
}

func TestBuildErrors(t *testing.T) {
	cases := []struct {
		kind string
		doc  string
		node string
		code string
	}{
		{"request", fullRequest, "filterers[9]", "node_not_found"},
		{"request", fullRequest, "filterers[1", "invalid_node"},
		{"request", fullRequest, "filterers", "invalid_node"},
		{"compose", composeDoc, "requests[0]", "invalid_node"},
		{"compose", `{"requests": [{"cohort": {"filename": "c"}}], "sweep": {}, "overlays": [{}]}`, "overlays[0]", "unsupported_node"},
	}
	for _, c := range cases {
		_, err := Build(decode(t, c.doc), c.kind, []string{c.node}, testCatalog(), Options{})
		be, ok := err.(*Error)
		if !ok || be.Code != c.code {
			t.Errorf("%s: err = %v, want code %s", c.node, err, c.code)
		}
	}
	if _, err := Build(decode(t, fullRequest), "request", nil, testCatalog(), Options{}); err == nil {
		t.Error("no nodes should fail")
	}
}

func TestDecodeDocKeepsNumbers(t *testing.T) {
	doc := decode(t, `{"n": 12345678901234567890, "f": 0.10}`)
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != `{"f":0.10,"n":12345678901234567890}` {
		t.Fatalf("numbers changed: %s", out)
	}
}

// Buffered comes from the manifest's streamable flag: percentile-type
// aggregators are buffered, moments are not.
func TestCatalogBufferedFromManifest(t *testing.T) {
	engine, err := pulse.New(pulse.Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	cat := CatalogFromManifest(engine.Manifest(context.Background()))
	for _, agg := range []string{"AGG_PERCENTILE", "AGG_MEDIAN"} {
		if !cat.Buffered[agg] {
			t.Errorf("%s not buffered", agg)
		}
	}
	for _, agg := range []string{"AGG_COUNT", "AGG_SUM", "AGG_AVERAGE", "AGG_MIN", "AGG_STDDEV"} {
		if cat.Buffered[agg] {
			t.Errorf("%s buffered", agg)
		}
	}
}

func TestBuildVectorProbe(t *testing.T) {
	cat := testCatalog()
	cat.Aggregators["AGG_VEC_MEAN"] = true
	build := func(vectors string) *Plan {
		t.Helper()
		doc := decode(t, `{"cohort": {"filename": "c.pulse"}, "weight": {"field": "w"},
			"groups": [{"type": "GROUP_CATEGORY", "field": "g"}], "vectors": [`+vectors+`]}`)
		plan, err := Build(doc, "request", []string{"vectors[0]"}, cat, Options{})
		if err != nil {
			t.Fatal(err)
		}
		return plan
	}

	// Literal members: one AGG_AVERAGE each (packed_bool members too).
	plan := build(`{"name": "v", "fields": ["x", "flag"], "coerce": "binary"}`)
	np := plan.Nodes[0]
	if plan.Verb != VerbProcess || plan.Cost != CostCheap || np.Kind != KindVector || np.Vector == nil {
		t.Fatalf("plan %+v node %+v", plan, np)
	}
	want := []any{
		map[string]any{"type": "AGG_AVERAGE", "field": "x", "label": "__probe0_m0", "weight": nil},
		map[string]any{"type": "AGG_AVERAGE", "field": "flag", "label": "__probe0_m1", "weight": nil},
	}
	if !reflect.DeepEqual(plan.Request["aggregations"], want) || !reflect.DeepEqual(np.Vector.Members, []string{"x", "flag"}) {
		t.Fatalf("hidden aggregations = %v, plan %+v", plan.Request["aggregations"], np.Vector)
	}
	if _, grouped := plan.Request["groups"]; grouped {
		t.Fatal("vector probe keeps the request's groups")
	}

	// A pattern (or glob) vector: one AGG_VEC_MEAN over the vector.
	plan = build(`{"name": "v", "pattern": "^q"}`)
	want = []any{map[string]any{"type": "AGG_VEC_MEAN", "vector": "v", "label": "__probe0_vec", "weight": nil}}
	if !reflect.DeepEqual(plan.Request["aggregations"], want) || plan.Nodes[0].Vector.Mean != "__probe0_vec" {
		t.Fatalf("hidden aggregations = %v", plan.Request["aggregations"])
	}
	if got := build(`{"name": "v", "fields": ["q_*"]}`).Nodes[0].Vector; got == nil || got.Mean == "" {
		t.Fatalf("glob vector plan = %+v", got)
	}

	// Nothing to probe yet, or a coerced pattern AGG_VEC_MEAN refuses.
	for _, v := range []string{`{"name": "v", "fields": []}`, `{"name": "v", "pattern": "^q", "coerce": "binary"}`} {
		plan = build(v)
		if plan.Verb != VerbNone || plan.Nodes[0].Kind != KindNone || plan.Nodes[0].Reason == "" {
			t.Fatalf("%s: plan %+v node %+v", v, plan, plan.Nodes[0])
		}
	}
}
