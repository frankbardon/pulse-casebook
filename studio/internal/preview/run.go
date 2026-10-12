package preview

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/frankbardon/pulse"
	perrors "github.com/frankbardon/pulse/errors"
)

// MaxTableRows caps the rows a table probe returns.
const MaxTableRows = 100

// Result is the /api/preview response body. Status is StatusOK, or
// StatusDeferred / StatusTimedOut / StatusCancelled with probes that
// carry only node and kind (and reason for deferred). Deferred names the
// parts of an expensive probe left out to keep it cheap ("quantiles").
type Result struct {
	Status      string            `json:"status"`
	Verb        string            `json:"verb"`
	Cost        string            `json:"cost"`
	Cached      bool              `json:"cached,omitempty"`
	Deferred    []string          `json:"deferred,omitempty"`
	RecordCount int64             `json:"record_count,omitempty"`
	Request     json.RawMessage   `json:"request,omitempty"`
	Probes      []*Probe          `json:"probes"`
	Warnings    []json.RawMessage `json:"warnings,omitempty"`
	ElapsedMS   int64             `json:"elapsed_ms"`
}

// Probe is one node's typed preview. Which fields are set depends on
// Kind:
//
//	cohort                  rows
//	filter                  rows, filter (this filter's n_in/n_out)
//	feature, attribute      rows, stats (hidden aggregations)
//	group                   rows, table (buckets + count), component
//	aggregation, window,
//	sort                    rows, table, component (aggregations only)
//	test, post_test,
//	regression, matrix,
//	crosstab, overlay       rows, result (the engine's result entry)
//	facet                   rows, facet (per-field facet results)
//	none                    reason
type Probe struct {
	Node      string          `json:"node"`
	Kind      string          `json:"kind"`
	Reason    string          `json:"reason,omitempty"`
	Rows      *Rows           `json:"rows,omitempty"`
	Filter    *FilterCounts   `json:"filter,omitempty"`
	Stats     *Stats          `json:"stats,omitempty"`
	Table     *Table          `json:"table,omitempty"`
	Component json.RawMessage `json:"component,omitempty"`
	Facet     json.RawMessage `json:"facet,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
}

// Rows are the run-wide record counts.
type Rows struct {
	Total    int64 `json:"total"`
	Filtered int64 `json:"filtered"`
}

// FilterCounts are one filterer's component counters.
type FilterCounts struct {
	NIn        int64 `json:"n_in"`
	NOut       int64 `json:"n_out"`
	NNullInput int64 `json:"n_null_input"`
}

// Stats summarize one derived column. Values are passed through from
// the engine (numbers, or null when undefined).
type Stats struct {
	Field     string     `json:"field,omitempty"`
	N         any        `json:"n,omitempty"`
	NNull     *int64     `json:"n_null,omitempty"`
	Min       any        `json:"min,omitempty"`
	Max       any        `json:"max,omitempty"`
	Mean      any        `json:"mean,omitempty"`
	StdDev    any        `json:"stddev,omitempty"`
	Quantiles []Quantile `json:"quantiles,omitempty"`
	Note      string     `json:"note,omitempty"`
}

// Quantile is one percentile (P in percent).
type Quantile struct {
	P     float64 `json:"p"`
	Value any     `json:"value"`
}

// Table is a capped slice of result rows, each row verbatim.
type Table struct {
	Rows      []json.RawMessage `json:"rows"`
	TotalRows int               `json:"total_rows"`
	Truncated bool              `json:"truncated,omitempty"`
}

// EngineError is a failure reported by the engine for the sub-request.
type EngineError struct {
	Code    string
	Message string
	Details map[string]any
}

func (e *EngineError) Error() string { return e.Message }

// Run executes the plan with exactly one engine call and summarizes the
// response. Context cancellation and deadlines are returned as the
// context's error.
func Run(ctx context.Context, engine *pulse.Pulse, plan *Plan) (*Result, error) {
	res := &Result{Status: StatusOK, Verb: plan.Verb, Cost: plan.Cost}
	if plan.Verb == VerbNone {
		for _, np := range plan.Nodes {
			res.Probes = append(res.Probes, &Probe{Node: np.ID, Kind: KindNone, Reason: np.Reason})
		}
		return res, nil
	}
	reqJSON, err := json.Marshal(plan.Request)
	if err != nil {
		return nil, err
	}
	res.Request = reqJSON
	start := time.Now()
	raw, err := execute(ctx, engine, plan.Verb, reqJSON)
	res.ElapsedMS = time.Since(start).Milliseconds()
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		return nil, engineError(err)
	}
	if err := summarize(res, plan, raw); err != nil {
		return nil, err
	}
	return res, nil
}

// Execute runs a sub-request document with the engine verb and returns
// the engine's (shaped) response JSON. Exported so parity tests can run
// the same truncated request directly.
func Execute(ctx context.Context, engine *pulse.Pulse, verb string, reqJSON []byte) ([]byte, error) {
	return execute(ctx, engine, verb, reqJSON)
}

func execute(ctx context.Context, engine *pulse.Pulse, verb string, reqJSON []byte) ([]byte, error) {
	decode := func(v any) error {
		if err := json.Unmarshal(reqJSON, v); err != nil {
			return &EngineError{Code: "invalid_request", Message: "sub-request does not decode: " + err.Error()}
		}
		return nil
	}
	var out any
	switch verb {
	case VerbProcess:
		var req pulse.Request
		if err := decode(&req); err != nil {
			return nil, err
		}
		resp, err := engine.Process(ctx, &req)
		if err != nil {
			return nil, err
		}
		out = resp
	case VerbCompose:
		var req pulse.ComposedRequest
		if err := decode(&req); err != nil {
			return nil, err
		}
		resp, err := engine.Compose(ctx, &req)
		if err != nil {
			return nil, err
		}
		out = resp
	case VerbChain:
		var req pulse.ChainRequest
		if err := decode(&req); err != nil {
			return nil, err
		}
		resp, err := engine.ProcessChain(ctx, &req)
		if err != nil {
			return nil, err
		}
		out = resp
	case VerbFacet:
		var req pulse.FacetRequest
		if err := decode(&req); err != nil {
			return nil, err
		}
		resp, err := engine.FacetSchema(ctx, &req)
		if err != nil {
			return nil, err
		}
		out = resp
	default:
		return nil, fmt.Errorf("unknown verb %q", verb)
	}
	return json.Marshal(out)
}

func engineError(err error) error {
	var ee *EngineError
	if errors.As(err, &ee) {
		return ee
	}
	var ce *perrors.CodedError
	if errors.As(err, &ce) {
		return &EngineError{Code: string(ce.Code), Message: ce.Message, Details: ce.Details}
	}
	return &EngineError{Code: "engine_error", Message: err.Error()}
}

// wireResponse is the slice of a (shaped) Response the summaries read.
type wireResponse struct {
	Data     []json.RawMessage `json:"data"`
	Metadata *struct {
		TotalRows    int64 `json:"total_rows"`
		FilteredRows int64 `json:"filtered_rows"`
	} `json:"metadata"`
	Tests       []json.RawMessage `json:"tests"`
	PostTests   []json.RawMessage `json:"post_tests"`
	Regressions []json.RawMessage `json:"regressions"`
	Matrices    []json.RawMessage `json:"matrices"`
	Overlays    []json.RawMessage `json:"overlays"`
	Crosstab    json.RawMessage   `json:"crosstab"`
	Components  *struct {
		Filterers    []FilterCounts    `json:"filterers"`
		Groupers     []json.RawMessage `json:"groupers"`
		Aggregations []json.RawMessage `json:"aggregations"`
	} `json:"components"`
	Warnings []json.RawMessage `json:"warnings"`
}

type wireFacet struct {
	Fields          json.RawMessage   `json:"fields"`
	TotalRecords    int64             `json:"total_records"`
	FilteredRecords int64             `json:"filtered_records"`
	Overlays        []json.RawMessage `json:"overlays"`
	Warnings        []json.RawMessage `json:"warnings"`
}

func summarize(res *Result, plan *Plan, raw []byte) error {
	if plan.Verb == VerbFacet {
		var f wireFacet
		if err := json.Unmarshal(raw, &f); err != nil {
			return err
		}
		res.Warnings = f.Warnings
		rows := &Rows{Total: f.TotalRecords, Filtered: f.FilteredRecords}
		for _, np := range plan.Nodes {
			p := &Probe{Node: np.ID, Kind: np.Kind, Rows: rows}
			if np.Kind == KindOverlay {
				p.Result = pick(f.Overlays, np.Index)
			} else {
				p.Facet = f.Fields
			}
			res.Probes = append(res.Probes, p)
		}
		return nil
	}

	resp, top, err := selectResponse(plan, raw)
	if err != nil {
		return err
	}
	res.Warnings = append(res.Warnings, top.Warnings...)
	var rows *Rows
	if resp.Metadata != nil {
		rows = &Rows{Total: resp.Metadata.TotalRows, Filtered: resp.Metadata.FilteredRows}
	}
	var first map[string]any
	if len(resp.Data) > 0 {
		dec := json.NewDecoder(bytes.NewReader(resp.Data[0]))
		dec.UseNumber()
		_ = dec.Decode(&first)
	}
	for _, np := range plan.Nodes {
		p := &Probe{Node: np.ID, Kind: np.Kind, Rows: rows}
		switch np.Kind {
		case KindFilter:
			if resp.Components != nil && np.Index < len(resp.Components.Filterers) {
				fc := resp.Components.Filterers[np.Index]
				p.Filter = &fc
			}
		case KindFeature, KindAttribute:
			p.Stats = statsFrom(np.Stats, first, resp)
		case KindGroup:
			p.Table = table(resp.Data)
			if resp.Components != nil {
				p.Component = capBuckets(pick(resp.Components.Groupers, np.Index))
			}
		case KindAggregation:
			p.Table = table(resp.Data)
			if resp.Components != nil {
				p.Component = pick(resp.Components.Aggregations, np.Index)
			}
		case KindWindow, KindSort:
			p.Table = table(resp.Data)
		case KindTest:
			p.Result = pick(resp.Tests, np.Index)
		case KindPostTest:
			p.Result = pick(resp.PostTests, np.Index)
		case KindRegression:
			p.Result = pick(resp.Regressions, np.Index)
		case KindMatrix:
			p.Result = pick(resp.Matrices, np.Index)
		case KindCrosstab:
			p.Result = resp.Crosstab
			if len(p.Result) == 0 {
				p.Table = table(resp.Data)
			}
		case KindOverlay:
			p.Result = pick(top.Overlays, np.Index)
		}
		res.Probes = append(res.Probes, p)
	}
	return nil
}

// selectResponse returns the Response a plan's nodes live in, plus the
// top-level wire object (for root-level overlays and warnings).
func selectResponse(plan *Plan, raw []byte) (*wireResponse, *wireResponse, error) {
	var top wireResponse
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, nil, err
	}
	if plan.Slot < 0 {
		return &top, &top, nil
	}
	var multi struct {
		Responses []json.RawMessage `json:"responses"`
		Stages    []json.RawMessage `json:"stages"`
	}
	if err := json.Unmarshal(raw, &multi); err != nil {
		return nil, nil, err
	}
	list := multi.Responses
	if plan.Verb == VerbChain {
		list = multi.Stages
	}
	if plan.Slot >= len(list) {
		return nil, nil, fmt.Errorf("engine returned %d responses, wanted index %d", len(list), plan.Slot)
	}
	var one wireResponse
	if err := json.Unmarshal(list[plan.Slot], &one); err != nil {
		return nil, nil, err
	}
	return &one, &top, nil
}

func statsFrom(sp *StatsPlan, row map[string]any, resp *wireResponse) *Stats {
	if sp == nil {
		return nil
	}
	st := &Stats{Field: sp.Field, Note: sp.Note}
	get := func(label string) any {
		if label == "" || row == nil {
			return nil
		}
		return row[label]
	}
	st.N = get(sp.Count)
	st.Min, st.Max, st.Mean, st.StdDev = get(sp.Min), get(sp.Max), get(sp.Mean), get(sp.StdDev)
	for _, q := range sp.Quantiles {
		st.Quantiles = append(st.Quantiles, Quantile{P: q.P, Value: get(q.Label)})
	}
	if sp.Count != "" && resp.Components != nil {
		for _, c := range resp.Components.Aggregations {
			var ac struct {
				Label string `json:"label"`
				NNull int64  `json:"n_null"`
			}
			if json.Unmarshal(c, &ac) == nil && ac.Label == sp.Count {
				n := ac.NNull
				st.NNull = &n
				break
			}
		}
	}
	return st
}

func table(rows []json.RawMessage) *Table {
	t := &Table{TotalRows: len(rows), Rows: rows}
	if t.Rows == nil {
		t.Rows = []json.RawMessage{}
	}
	if len(rows) > MaxTableRows {
		t.Rows, t.Truncated = rows[:MaxTableRows], true
	}
	return t
}

// capBuckets trims a grouper component's operator.buckets inventory to
// MaxTableRows entries, flagging operator.buckets_truncated.
func capBuckets(raw json.RawMessage) json.RawMessage {
	if raw == nil {
		return nil
	}
	var comp map[string]json.RawMessage
	if json.Unmarshal(raw, &comp) != nil {
		return raw
	}
	var op map[string]json.RawMessage
	if json.Unmarshal(comp["operator"], &op) != nil {
		return raw
	}
	var buckets []json.RawMessage
	if json.Unmarshal(op["buckets"], &buckets) != nil || len(buckets) <= MaxTableRows {
		return raw
	}
	op["buckets"], _ = json.Marshal(buckets[:MaxTableRows])
	op["buckets_truncated"] = json.RawMessage("true")
	comp["operator"], _ = json.Marshal(op)
	out, err := json.Marshal(comp)
	if err != nil {
		return raw
	}
	return out
}

func pick(list []json.RawMessage, i int) json.RawMessage {
	if i < 0 || i >= len(list) {
		return nil
	}
	return list[i]
}
