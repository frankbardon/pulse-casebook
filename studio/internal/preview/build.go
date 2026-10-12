package preview

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/frankbardon/pulse/descriptor"
)

// Probe kinds, one per node kind.
const (
	KindCohort      = "cohort"
	KindFeature     = "feature"
	KindFilter      = "filter"
	KindAttribute   = "attribute"
	KindGroup       = "group"
	KindAggregation = "aggregation"
	KindWindow      = "window"
	KindSort        = "sort"
	KindTest        = "test"
	KindPostTest    = "post_test"
	KindRegression  = "regression"
	KindMatrix      = "matrix"
	KindCrosstab    = "crosstab"
	KindOverlay     = "overlay"
	KindFacet       = "facet"
	KindNone        = "none"
)

// Engine verbs a plan runs with.
const (
	VerbProcess = "process"
	VerbCompose = "compose"
	VerbChain   = "chain"
	VerbFacet   = "facet"
	VerbNone    = "none"
)

// Cost tiers: cheap probes are counts and moments; expensive ones sort
// (percentiles, histograms) or fit models (tests, regressions, ...).
const (
	CostCheap     = "cheap"
	CostExpensive = "expensive"
)

// Probe quantiles (percent) added to attribute and feature probes. They
// share one sub-request: the first percentile pays for the sort, the
// rest are nearly free (research/preview-benchmark.md).
var probeQuantiles = []float64{5, 25, 50, 75, 95}

// Catalog is the slice of the engine manifest the builder needs. AGG_*
// names and type compatibility always come from here, never from
// hard-coded lists.
type Catalog struct {
	Emits         map[string]string // feature/attribute operator -> emitted field type
	Aggregators   map[string]bool   // known AGG_* names
	MomentTypes   map[string]bool   // field types AGG_AVERAGE accepts
	QuantileTypes map[string]bool   // field types AGG_PERCENTILE accepts
	Mergeable     map[string]bool   // aggregators a chain stage accepts
}

// CatalogFromManifest extracts a Catalog from the engine manifest.
func CatalogFromManifest(m *descriptor.Manifest) *Catalog {
	c := &Catalog{
		Emits:         map[string]string{},
		Aggregators:   map[string]bool{},
		MomentTypes:   map[string]bool{},
		QuantileTypes: map[string]bool{},
		Mergeable:     map[string]bool{},
	}
	for _, ops := range [][]descriptor.Operator{m.Components.Attributes, m.Components.Features} {
		for _, op := range ops {
			c.Emits[op.Name] = op.EmitsType
		}
	}
	for _, op := range m.Components.Aggregators {
		c.Aggregators[op.Name] = true
		switch op.Name {
		case "AGG_AVERAGE":
			for _, t := range op.AcceptsTypes {
				c.MomentTypes[t] = true
			}
		case "AGG_PERCENTILE":
			for _, t := range op.AcceptsTypes {
				c.QuantileTypes[t] = true
			}
		}
	}
	if m.ProcessChain != nil {
		for _, n := range m.ProcessChain.MergeableAggregators {
			c.Mergeable[n] = true
		}
	}
	return c
}

// Options tune one preview.
type Options struct {
	// Quantiles adds the batched percentile probes to attribute and
	// feature nodes (the expensive part of those probes).
	Quantiles bool
	// Facet, when set on a cohort or filter node of a Request, switches
	// the probe to a FacetSchema call over these settings (fields,
	// numeric_percentiles, include_histogram, ...) with the node's
	// upstream filterers.
	Facet map[string]any
	// ResolveCohort rewrites a request's cohort object to one the engine
	// can open (root-relative). Nil leaves cohorts untouched.
	ResolveCohort func(cohort any) (any, error)
}

// Error is a builder error the HTTP layer maps to a status and code.
type Error struct {
	Code    string
	Message string
	Details map[string]any
}

func (e *Error) Error() string { return e.Message }

func errf(code string, details map[string]any, format string, args ...any) *Error {
	return &Error{Code: code, Message: fmt.Sprintf(format, args...), Details: details}
}

// Plan is a built sub-request plus what to read back from its response.
type Plan struct {
	Verb    string         // VerbProcess, VerbCompose, VerbChain, VerbFacet or VerbNone
	Request map[string]any // the truncated sub-request (nil for VerbNone)
	Cost    string
	Nodes   []*NodePlan

	// Slot selects the response to summarize: compose responses[Slot]
	// or chain stages[Slot]. -1 means the whole response.
	Slot int
}

// NodePlan is one requested node's probe.
type NodePlan struct {
	ID      string
	Kind    string
	Section string
	Index   int    // entry index within its section (-1 for single sections)
	Reason  string // why a KindNone node has no probe
	Stats   *StatsPlan
	// CountLabel is the hidden AGG_COUNT label of a group probe.
	CountLabel string
}

// StatsPlan maps the hidden aggregations of an attribute or feature
// probe back to the statistic they compute.
type StatsPlan struct {
	Field     string
	Count     string
	Min       string
	Max       string
	Mean      string
	StdDev    string
	Quantiles []QuantileLabel
	Note      string
}

// QuantileLabel is one hidden AGG_PERCENTILE.
type QuantileLabel struct {
	P     float64
	Label string
}

// Request sections in pipeline order (Load -> Features -> Filter ->
// Attributes -> Group -> Aggregate -> Windows -> Sort).
var pipeline = []string{"features", "filterers", "attributes", "groups", "aggregations", "windows", "sort"}

// Request keys that are context for every stage and always kept.
var contextKeys = []string{"label", "joins", "weight", "time_zone", "labels", "models", "vectors"}

// sectionKind maps a Request array section to its probe kind.
var sectionKind = map[string]string{
	"features":     KindFeature,
	"filterers":    KindFilter,
	"attributes":   KindAttribute,
	"groups":       KindGroup,
	"aggregations": KindAggregation,
	"windows":      KindWindow,
	"sort":         KindSort,
	"tests":        KindTest,
	"post_tests":   KindPostTest,
	"regressions":  KindRegression,
	"matrices":     KindMatrix,
	"overlays":     KindOverlay,
}

// Build parses the node ids, checks they form one batch (same request
// frame and section), and returns the plan for them. doc is the full
// request document decoded with json.Decoder.UseNumber; rootKind is the
// workspace classification ("request", "compose", "chain", "facet").
func Build(doc map[string]any, rootKind string, nodeIDs []string, cat *Catalog, opts Options) (*Plan, error) {
	if len(nodeIDs) == 0 {
		return nil, errf("missing_node", nil, "at least one node id is required")
	}
	type located struct {
		id    string
		frame frameRef
		rest  []Segment
	}
	var locs []located
	for _, id := range nodeIDs {
		segs, err := ParsePath(id)
		if err != nil {
			return nil, errf("invalid_node", map[string]any{"node": id}, "%s", err.Error())
		}
		if len(segs) == 0 {
			return nil, errf("invalid_node", map[string]any{"node": id}, "the document root is not a node")
		}
		fr, rest, err := locate(doc, rootKind, segs)
		if err != nil {
			return nil, err
		}
		locs = append(locs, located{id, fr, rest})
	}
	first := locs[0]
	for _, l := range locs[1:] {
		if l.frame.id != first.frame.id || l.rest[0].Key != first.rest[0].Key {
			return nil, errf("mixed_batch", map[string]any{"nodes": nodeIDs},
				"batched nodes must share one request frame and section")
		}
	}
	b := &builder{doc: doc, cat: cat, opts: opts, frame: first.frame}
	section := first.rest[0].Key
	indices := make([]int, len(locs))
	for i, l := range locs {
		indices[i] = -1
		if len(l.rest) > 1 && l.rest[1].IsIndex {
			indices[i] = l.rest[1].Index
		}
	}
	return b.build(section, nodeIDs, indices)
}

// frameRef names where the nodes live.
type frameRef struct {
	id   string // node path of the frame ("" for the root)
	role string // "request", "slot", "fit", "stage", "compose", "chain", "facet"
	slot int    // compose slot / fit / chain stage index
	obj  map[string]any
}

// locate finds the frame a node belongs to and the node's path relative
// to it.
func locate(doc map[string]any, rootKind string, segs []Segment) (frameRef, []Segment, error) {
	id := FormatPath(segs)
	notFound := errf("node_not_found", map[string]any{"node": id}, "node %s is not in the request", id)
	reqFrame := func(prefix []Segment, role string, slot int, rest []Segment) (frameRef, []Segment, error) {
		v, ok := getAt(doc, prefix)
		obj, isObj := v.(map[string]any)
		if !ok || !isObj {
			return frameRef{}, nil, notFound
		}
		if len(rest) == 0 {
			return frameRef{}, nil, errf("invalid_node", map[string]any{"node": id}, "%s is a frame, not a node", id)
		}
		return frameRef{id: FormatPath(prefix), role: role, slot: slot, obj: obj}, rest, nil
	}
	isKey := func(i int, k string) bool { return len(segs) > i && !segs[i].IsIndex && segs[i].Key == k }
	isIdx := func(i int) bool { return len(segs) > i && segs[i].IsIndex }
	if _, ok := getAt(doc, segs); !ok {
		return frameRef{}, nil, notFound
	}
	switch rootKind {
	case "compose":
		if isKey(0, "requests") && isIdx(1) {
			return reqFrame(segs[:2], "slot", segs[1].Index, segs[2:])
		}
		if isKey(0, "fits") && isIdx(1) && isKey(2, "request") {
			return reqFrame(segs[:3], "fit", segs[1].Index, segs[3:])
		}
		return frameRef{role: "compose", obj: doc, slot: -1}, segs, nil
	case "chain":
		if isKey(0, "stages") && isIdx(1) && isKey(2, "request") {
			return reqFrame(segs[:3], "stage", segs[1].Index, segs[3:])
		}
		return frameRef{role: "chain", obj: doc, slot: -1}, segs, nil
	case "facet":
		return frameRef{role: "facet", obj: doc, slot: -1}, segs, nil
	default:
		return frameRef{role: "request", obj: doc, slot: -1}, segs, nil
	}
}

func getAt(v any, segs []Segment) (any, bool) {
	cur := v
	for _, s := range segs {
		if s.IsIndex {
			arr, ok := cur.([]any)
			if !ok || s.Index >= len(arr) {
				return nil, false
			}
			cur = arr[s.Index]
		} else {
			obj, ok := cur.(map[string]any)
			if !ok {
				return nil, false
			}
			if cur, ok = obj[s.Key]; !ok {
				return nil, false
			}
		}
	}
	return cur, true
}

type builder struct {
	doc   map[string]any
	cat   *Catalog
	opts  Options
	frame frameRef
}

func (b *builder) build(section string, ids []string, indices []int) (*Plan, error) {
	switch b.frame.role {
	case "request", "slot", "fit", "stage":
		return b.requestFrame(section, ids, indices)
	case "compose":
		return b.composeRoot(section, ids, indices)
	case "chain":
		return b.chainRoot(section, ids, indices)
	default:
		return b.facetRoot(section, ids, indices)
	}
}

// none returns a plan with no engine call.
func none(ids []string, section string, indices []int, reason string) *Plan {
	p := &Plan{Verb: VerbNone, Cost: CostCheap, Slot: -1}
	for i, id := range ids {
		p.Nodes = append(p.Nodes, &NodePlan{ID: id, Kind: KindNone, Section: section, Index: indices[i], Reason: reason})
	}
	return p
}

// requestFrame plans nodes inside a Request (a plain request, compose
// slot, compose fit request or chain stage request).
func (b *builder) requestFrame(section string, ids []string, indices []int) (*Plan, error) {
	frame := b.frame.obj
	inChain := b.frame.role == "stage"
	kind, isArray := sectionKind[section]
	single := section == "crosstab"
	switch {
	case section == "cohort":
		kind = KindCohort
	case single:
		kind = KindCrosstab
	case !isArray:
		return none(ids, section, indices, fmt.Sprintf("%s has no preview", section)), nil
	}
	if isArray {
		if _, ok := frame[section].([]any); !ok {
			return none(ids, section, indices, fmt.Sprintf("%s is not an entry list", section)), nil
		}
		for i, idx := range indices {
			if idx < 0 {
				return nil, errf("invalid_node", map[string]any{"node": ids[i]}, "%s names a section, not an entry", ids[i])
			}
		}
	}
	maxIdx := slices.Max(indices)

	// Facet probes on cohort and filter nodes of a plain request frame.
	if b.opts.Facet != nil && (kind == KindCohort || kind == KindFilter) && !inChain {
		return b.requestFacet(frame, kind, section, ids, indices, maxIdx)
	}

	sub := map[string]any{}
	copyKeys(sub, frame, contextKeys...)
	if c, ok := frame["cohort"]; ok {
		sub["cohort"] = c
	}
	// keepThrough copies the pipeline sections strictly upstream of
	// stage, and stage itself truncated to entries 0..upto (upto < 0
	// copies none of it).
	keepThrough := func(stage string, upto int) {
		for _, s := range pipeline {
			if s == stage {
				if upto >= 0 {
					if arr, ok := frame[s].([]any); ok {
						sub[s] = arr[:min(upto+1, len(arr))]
					}
				}
				return
			}
			copyKeys(sub, frame, s)
		}
	}
	// rowAnalysis keeps the row-level pipeline plus grouping (with its
	// aggregations, which per-group analyses need) for tests,
	// regressions and matrices.
	rowAnalysis := func() {
		keepThrough("groups", -1)
		if _, grouped := frame["groups"]; grouped {
			copyKeys(sub, frame, "groups", "aggregations")
		}
	}

	plan := &Plan{Verb: VerbProcess, Cost: CostCheap, Slot: -1}
	include := []string{"metadata", "components"}
	var hidden []any
	for i, id := range ids {
		np := &NodePlan{ID: id, Kind: kind, Section: section, Index: indices[i]}
		plan.Nodes = append(plan.Nodes, np)
		if single || kind == KindCohort {
			np.Index = -1
		}
	}

	switch kind {
	case KindCohort:
		delete(sub, "vectors")
	case KindFilter:
		keepThrough("filterers", maxIdx)
	case KindFeature, KindAttribute:
		keepThrough(section, maxIdx)
		for _, np := range plan.Nodes {
			entry, _ := frame[section].([]any)[np.Index].(map[string]any)
			np.Stats, hidden = b.statsProbe(entry, np.Index, inChain, hidden)
			if len(np.Stats.Quantiles) > 0 {
				plan.Cost = CostExpensive
			}
		}
		include = append(include, "data")
	case KindGroup:
		keepThrough("groups", maxIdx)
		for _, np := range plan.Nodes {
			entry, _ := frame["groups"].([]any)[np.Index].(map[string]any)
			field := groupField(entry)
			if field == "" || !b.cat.Aggregators["AGG_COUNT"] {
				continue
			}
			np.CountLabel = fmt.Sprintf("__probe%d_n", np.Index)
			hidden = append(hidden, map[string]any{"type": "AGG_COUNT", "field": field, "label": np.CountLabel})
		}
		include = append(include, "data")
	case KindAggregation, KindWindow:
		keepThrough(section, maxIdx)
		include = append(include, "data")
	case KindSort:
		keepThrough("sort", -1)
		copyKeys(sub, frame, "sort")
		include = append(include, "data")
	case KindTest:
		rowAnalysis()
		copyKeys(sub, frame, "tests", "multiplicity")
		include = append(include, "tests")
		plan.Cost = CostExpensive
	case KindRegression:
		rowAnalysis()
		copyKeys(sub, frame, "regressions")
		include = append(include, "regressions")
		plan.Cost = CostExpensive
	case KindMatrix:
		rowAnalysis()
		copyKeys(sub, frame, "matrices")
		include = append(include, "matrices")
		plan.Cost = CostExpensive
	case KindCrosstab:
		keepThrough("groups", -1)
		copyKeys(sub, frame, "crosstab")
		include = append(include, "crosstab", "data")
		plan.Cost = CostExpensive
	case KindPostTest:
		keepThrough("sort", -1)
		copyKeys(sub, frame, "sort", "post_tests", "multiplicity")
		include = append(include, "post_tests")
		plan.Cost = CostExpensive
	case KindOverlay:
		// Overlays decorate the whole result: keep everything but
		// side effects (outputs) and the caller's response shaping.
		for k, v := range frame {
			if k != "outputs" && k != "return" && k != "disable_components" {
				sub[k] = v
			}
		}
		include = append(include, "overlays")
		plan.Cost = CostExpensive
	}
	if len(hidden) > 0 {
		if existing, ok := sub["aggregations"].([]any); ok {
			sub["aggregations"] = append(slices.Clone(existing), hidden...)
		} else {
			sub["aggregations"] = hidden
		}
	}
	// A chain stage must aggregate. A probe upstream of the stage's
	// aggregations keeps the stage's own attributes, grouping and
	// aggregations; its counters are unaffected by them.
	if _, ok := sub["aggregations"]; inChain && !ok {
		for _, k := range []string{"attributes", "groups", "aggregations"} {
			if _, ok := sub[k]; !ok {
				copyKeys(sub, frame, k)
			}
		}
	}
	// Components feed the counters; force them on whatever the request
	// or engine default says.
	sub["disable_components"] = false
	sub["return"] = map[string]any{"include": toAny(include)}
	if err := b.resolveCohort(sub); err != nil {
		return nil, err
	}
	return b.wrap(plan, sub)
}

// wrap places a truncated request back into its root so it runs the way
// the original would: chain stages run as a chain, compose slots that
// bind fits run as a one-slot compose, everything else as a Request.
func (b *builder) wrap(plan *Plan, sub map[string]any) (*Plan, error) {
	switch b.frame.role {
	case "stage":
		chain := map[string]any{}
		cohort, err := b.cohortOf(b.doc)
		if err != nil {
			return nil, err
		}
		chain["cohort"] = cohort
		delete(sub, "cohort")
		stages, _ := b.doc["stages"].([]any)
		var out []any
		for i := 0; i < b.frame.slot; i++ {
			out = append(out, stages[i])
		}
		stage := map[string]any{"request": sub}
		if orig, ok := stages[b.frame.slot].(map[string]any); ok {
			copyKeys(stage, orig, "name")
		}
		out = append(out, stage)
		chain["stages"] = out
		plan.Verb, plan.Request, plan.Slot = VerbChain, chain, b.frame.slot
	case "slot":
		if fits, ok := b.doc["fits"]; ok {
			fitList, err := b.resolveFits(fits)
			if err != nil {
				return nil, err
			}
			plan.Verb, plan.Slot = VerbCompose, 0
			plan.Request = map[string]any{"requests": []any{sub}, "fits": fitList}
		} else {
			plan.Request = sub
		}
	default:
		plan.Request = sub
	}
	return plan, nil
}

// statsProbe appends the hidden aggregations describing one attribute
// or feature output.
func (b *builder) statsProbe(entry map[string]any, idx int, inChain bool, hidden []any) (*StatsPlan, []any) {
	sp := &StatsPlan{}
	label, _ := entry["label"].(string)
	op, _ := entry["type"].(string)
	if label == "" {
		sp.Note = "entry has no label to probe"
		return sp, hidden
	}
	emits, known := b.cat.Emits[op]
	if !known || emits == "" {
		sp.Note = "operator emits no single typed column"
		return sp, hidden
	}
	sp.Field = label
	add := func(agg, stat string, params map[string]any) string {
		if !b.cat.Aggregators[agg] || (inChain && !b.cat.Mergeable[agg]) {
			return ""
		}
		l := fmt.Sprintf("__probe%d_%s", idx, stat)
		a := map[string]any{"type": agg, "field": label, "label": l}
		if params != nil {
			a["params"] = params
		}
		hidden = append(hidden, a)
		return l
	}
	sp.Count = add("AGG_COUNT", "n", nil)
	if b.cat.MomentTypes[emits] {
		sp.Min = add("AGG_MIN", "min", nil)
		sp.Max = add("AGG_MAX", "max", nil)
		sp.Mean = add("AGG_AVERAGE", "mean", nil)
		sp.StdDev = add("AGG_STDDEV", "sd", nil)
	}
	if b.opts.Quantiles && b.cat.QuantileTypes[emits] {
		for _, p := range probeQuantiles {
			if l := add("AGG_PERCENTILE", fmt.Sprintf("p%g", p), map[string]any{"percentile": p}); l != "" {
				sp.Quantiles = append(sp.Quantiles, QuantileLabel{P: p, Label: l})
			}
		}
	}
	return sp, hidden
}

// requestFacet runs a FacetSchema over the request's cohort with the
// filterers up to the node.
func (b *builder) requestFacet(frame map[string]any, kind, section string, ids []string, indices []int, maxIdx int) (*Plan, error) {
	sub := map[string]any{}
	for k, v := range b.opts.Facet {
		sub[k] = v
	}
	if _, ok := sub["numeric_percentiles"]; !ok && b.opts.Quantiles {
		qs := make([]any, len(probeQuantiles))
		for i, p := range probeQuantiles {
			qs[i] = p / 100
		}
		sub["numeric_percentiles"] = qs
	}
	copyKeys(sub, frame, "cohort", "labels")
	delete(sub, "filterers")
	if kind == KindFilter {
		if arr, ok := frame["filterers"].([]any); ok {
			sub["filterers"] = arr[:maxIdx+1]
		}
	}
	if err := b.resolveCohort(sub); err != nil {
		return nil, err
	}
	plan := &Plan{Verb: VerbFacet, Request: sub, Cost: facetCost(sub), Slot: -1}
	for i, id := range ids {
		idx := indices[i]
		if kind == KindCohort {
			idx = -1
		}
		plan.Nodes = append(plan.Nodes, &NodePlan{ID: id, Kind: KindFacet, Section: section, Index: idx})
	}
	return plan, nil
}

func facetCost(req map[string]any) string {
	if p, ok := req["numeric_percentiles"].([]any); ok && len(p) > 0 {
		return CostExpensive
	}
	if h, ok := req["include_histogram"].(bool); ok && h {
		return CostExpensive
	}
	return CostCheap
}

// composeRoot plans compose-level nodes: overlays run the whole compose.
func (b *builder) composeRoot(section string, ids []string, indices []int) (*Plan, error) {
	if section != "overlays" {
		return none(ids, section, indices, fmt.Sprintf("compose %s has no preview", section)), nil
	}
	if _, swept := b.doc["sweep"]; swept {
		return nil, errf("unsupported_node", map[string]any{"node": ids[0]}, "previews of swept compose requests are not supported")
	}
	sub := map[string]any{}
	for k, v := range b.doc {
		if k != "return" {
			sub[k] = v
		}
	}
	if reqs, ok := sub["requests"].([]any); ok {
		out := make([]any, len(reqs))
		for i, r := range reqs {
			slot, ok := r.(map[string]any)
			if !ok {
				return nil, errf("invalid_request", nil, "requests[%d] is not an object", i)
			}
			slot = clone(slot)
			delete(slot, "outputs")
			if err := b.resolveCohort(slot); err != nil {
				return nil, err
			}
			out[i] = slot
		}
		sub["requests"] = out
	}
	if fits, ok := sub["fits"]; ok {
		fitList, err := b.resolveFits(fits)
		if err != nil {
			return nil, err
		}
		sub["fits"] = fitList
	}
	sub["return"] = map[string]any{"include": []any{"overlays"}}
	return overlayPlan(VerbCompose, sub, ids, section, indices), nil
}

// chainRoot plans chain-level nodes: the cohort probes like a Request
// cohort; overlays run the whole chain.
func (b *builder) chainRoot(section string, ids []string, indices []int) (*Plan, error) {
	switch section {
	case "cohort":
		b.frame = frameRef{role: "request", obj: map[string]any{"cohort": b.doc["cohort"]}, slot: -1}
		return b.requestFrame(section, ids, indices)
	case "overlays":
		sub := clone(b.doc)
		cohort, err := b.cohortOf(b.doc)
		if err != nil {
			return nil, err
		}
		sub["cohort"] = cohort
		return overlayPlan(VerbChain, sub, ids, section, indices), nil
	}
	return none(ids, section, indices, fmt.Sprintf("chain %s has no preview", section)), nil
}

// facetRoot plans nodes of a FacetRequest: the cohort runs the facet
// without filterers, a filter runs it with the filterers up to it, any
// other node runs the whole facet.
func (b *builder) facetRoot(section string, ids []string, indices []int) (*Plan, error) {
	sub := clone(b.doc)
	if err := b.resolveCohort(sub); err != nil {
		return nil, err
	}
	kind := KindFacet
	switch section {
	case "cohort":
		delete(sub, "filterers")
		delete(sub, "overlays")
	case "filterers":
		maxIdx := slices.Max(indices)
		if maxIdx < 0 {
			return nil, errf("invalid_node", map[string]any{"node": ids[0]}, "%s names a section, not an entry", ids[0])
		}
		arr, _ := sub["filterers"].([]any)
		sub["filterers"] = arr[:maxIdx+1]
		delete(sub, "overlays")
	case "overlays":
		kind = KindOverlay
	}
	plan := &Plan{Verb: VerbFacet, Request: sub, Cost: facetCost(sub), Slot: -1}
	if kind == KindOverlay {
		plan.Cost = CostExpensive
	}
	for i, id := range ids {
		idx := indices[i]
		if section == "cohort" {
			idx = -1
		}
		plan.Nodes = append(plan.Nodes, &NodePlan{ID: id, Kind: kind, Section: section, Index: idx})
	}
	return plan, nil
}

func overlayPlan(verb string, sub map[string]any, ids []string, section string, indices []int) *Plan {
	plan := &Plan{Verb: verb, Request: sub, Cost: CostExpensive, Slot: -1}
	for i, id := range ids {
		plan.Nodes = append(plan.Nodes, &NodePlan{ID: id, Kind: KindOverlay, Section: section, Index: indices[i]})
	}
	return plan
}

// resolveCohort rewrites obj["cohort"] in place.
func (b *builder) resolveCohort(obj map[string]any) error {
	c, ok := obj["cohort"]
	if !ok {
		return nil
	}
	r, err := b.resolve(c)
	if err != nil {
		return err
	}
	obj["cohort"] = r
	return nil
}

func (b *builder) cohortOf(obj map[string]any) (any, error) {
	c, ok := obj["cohort"]
	if !ok {
		return nil, errf("no_cohort", nil, "the request has no cohort")
	}
	return b.resolve(c)
}

func (b *builder) resolve(c any) (any, error) {
	if b.opts.ResolveCohort == nil {
		return c, nil
	}
	return b.opts.ResolveCohort(c)
}

// resolveFits copies a compose fits list with each fit request's cohort
// resolved and outputs dropped.
func (b *builder) resolveFits(fits any) ([]any, error) {
	list, ok := fits.([]any)
	if !ok {
		return nil, errf("invalid_request", nil, "fits is not a list")
	}
	out := make([]any, len(list))
	for i, f := range list {
		fit, ok := f.(map[string]any)
		if !ok {
			out[i] = f
			continue
		}
		fit = clone(fit)
		if req, ok := fit["request"].(map[string]any); ok {
			req = clone(req)
			delete(req, "outputs")
			if err := b.resolveCohort(req); err != nil {
				return nil, err
			}
			fit["request"] = req
		}
		out[i] = fit
	}
	return out, nil
}

func groupField(entry map[string]any) string {
	if f, ok := entry["field"].(string); ok && f != "" {
		return f
	}
	if fs, ok := entry["fields"].([]any); ok && len(fs) > 0 {
		if f, ok := fs[0].(string); ok {
			return f
		}
	}
	return ""
}

func copyKeys(dst, src map[string]any, keys ...string) {
	for _, k := range keys {
		if v, ok := src[k]; ok {
			dst[k] = v
		}
	}
}

// clone returns a shallow copy of m.
func clone(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func toAny(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}

// DecodeDoc decodes a request document keeping numbers exact.
func DecodeDoc(data []byte) (map[string]any, error) {
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.UseNumber()
	var doc map[string]any
	if err := dec.Decode(&doc); err != nil {
		return nil, err
	}
	if dec.More() {
		return nil, fmt.Errorf("trailing data after the request document")
	}
	return doc, nil
}
