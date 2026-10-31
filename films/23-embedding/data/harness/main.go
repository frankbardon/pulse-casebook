// Command harness records the embedder-API outputs film 23 (embedding Pulse) quotes.
// It drives the published github.com/frankbardon/pulse module at v1.0.0-alpha.33 as a Go
// library: pulse.New with Options.Extensions (an aggregator, an expression function, a
// lookup table), the registration probe, panic recovery, ProcessStreamResult, Watch,
// Request.Hash, ExpressionReads / RequestReads, and the observe hooks plus the observe/prom
// and observe/otel adapters.
//
// Usage (from data/, after build.sh has imported orders.pulse and more.pulse):
//
//	go run ./harness .
//
// Every output is written beside the requests as <name>.out.json (or .txt). Wall-clock
// figures (durations, timestamps) are left out so a re-run gives the same bytes.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/encoding"
	perrors "github.com/frankbardon/pulse/errors"
	"github.com/frankbardon/pulse/extend"
	"github.com/frankbardon/pulse/observe"
	otelpulse "github.com/frankbardon/pulse/observe/otel"
	prompulse "github.com/frankbardon/pulse/observe/prom"
	"github.com/frankbardon/pulse/types"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

var dir string

func main() {
	dir = "."
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}
	steps := []struct {
		name string
		fn   func() error
	}{
		{"extension", stepExtension},
		{"probe", stepProbe},
		{"panic", stepPanic},
		{"stream", stepStream},
		{"watch", stepWatch},
		{"hash", stepHash},
		{"reads", stepReads},
		{"observe", stepObserve},
		{"filter_to_file", stepFilterToFile},
	}
	for _, s := range steps {
		if err := s.fn(); err != nil {
			fmt.Fprintf(os.Stderr, "harness: %s: %v\n", s.name, err)
			os.Exit(1)
		}
		fmt.Println("recorded", s.name)
	}
}

/* ---------- the extensions ---------- */

// midrange is AGG_ACME_MIDRANGE: (min + max) / 2 over the non-null values. It streams
// (OnlineAggregator) and merges (MergeableAggregator).
type midrange struct {
	lo, hi float64
	n      int
}

func newMid() *midrange { return &midrange{lo: math.Inf(1), hi: math.Inf(-1)} }

func (m *midrange) Aggregate(rows extend.Rows, field string) (float64, error) {
	for i := 0; i < rows.Len(); i++ {
		if err := m.UpdateRow(rows.At(i), field); err != nil {
			return 0, err
		}
	}
	return m.Finalize()
}
func (m *midrange) UpdateRow(rec extend.Record, field string) error {
	v, ok := rec.NumericValue(field)
	if !ok || rec.IsNull(field) {
		return nil
	}
	m.lo, m.hi, m.n = math.Min(m.lo, v), math.Max(m.hi, v), m.n+1
	return nil
}
func (m *midrange) Finalize() (float64, error) {
	if m.n == 0 {
		return math.NaN(), nil
	}
	return (m.lo + m.hi) / 2, nil
}
func (m *midrange) Merge(other extend.OnlineAggregator) error {
	o, ok := other.(*midrange)
	if !ok {
		return fmt.Errorf("midrange: cannot merge %T", other)
	}
	m.lo, m.hi, m.n = math.Min(m.lo, o.lo), math.Max(m.hi, o.hi), m.n+o.n
	return nil
}

var numeric = []encoding.FieldType{encoding.FieldTypeF32, encoding.FieldTypeF64, encoding.FieldTypeU8, encoding.FieldTypeU16, encoding.FieldTypeU32, encoding.FieldTypeU64}

func midReg() pulse.AggregatorRegistration {
	return pulse.AggregatorRegistration{
		Name:        "AGG_ACME_MIDRANGE",
		Description: "Midpoint of the smallest and largest value: (min + max) / 2.",
		Factory: func(*types.Aggregation, *encoding.Schema) (extend.Aggregator, error) {
			return newMid(), nil
		},
		Streamable: true,
		Mergeable:  true,
		Accepts:    numeric,
	}
}

// The expression-environment additions: a function and a lookup table.
func exprExt() ([]pulse.ExprFunction, map[string]pulse.LookupTable) {
	fns := []pulse.ExprFunction{{
		Name:        "with_tax",
		Description: "An amount with a tax rate applied.",
		Signature:   "with_tax(amount float64, rate float64) float64",
		Fn:          func(amount, rate float64) float64 { return math.Round(amount*(1+rate)*100) / 100 },
		Pure:        true,
	}}
	tables := map[string]pulse.LookupTable{"tax_rate": {
		Description: "Illustrative sales-tax rate by region.",
		Rows:        map[string]float64{"North": 0.20, "South": 0.10, "East": 0.15, "West": 0.05},
	}}
	return fns, tables
}

func fullExtensions() pulse.Extensions {
	fns, tables := exprExt()
	return pulse.Extensions{Aggregators: []pulse.AggregatorRegistration{midReg()}, ExprFunctions: fns, LookupTables: tables}
}

func newPulse(ext pulse.Extensions, mod func(*pulse.Options)) (*pulse.Pulse, error) {
	o := pulse.Options{DataDir: dir, Extensions: ext}
	if mod != nil {
		mod(&o)
	}
	return pulse.New(o)
}

/* ---------- helpers ---------- */

func readReq(name string) (*types.Request, []byte, error) {
	b, err := os.ReadFile(filepath.Join(dir, name+".json"))
	if err != nil {
		return nil, nil, err
	}
	var req types.Request
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return nil, nil, fmt.Errorf("%s.json: %w", name, err)
	}
	return &req, b, nil
}

func write(name string, v any) error {
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, name), []byte(buf.String()), 0o644)
}

// coded is the wire shape of a refusal: code, message, details.
func coded(err error) map[string]any {
	if err == nil {
		return nil
	}
	var ce *perrors.CodedError
	if errors.As(err, &ce) {
		return map[string]any{"code": ce.Code, "message": ce.Message, "details": ce.Details}
	}
	return map[string]any{"code": "uncoded", "message": err.Error()}
}

/* ---------- 1. pulse.New with Options.Extensions: the manifest, and a request ---------- */

func stepExtension() error {
	p, err := newPulse(fullExtensions(), nil)
	if err != nil {
		return err
	}
	ctx := context.Background()
	// The manifest entries the extensions add.
	man := p.Manifest(ctx)
	mb, _ := json.Marshal(man)
	var m map[string]any
	_ = json.Unmarshal(mb, &m)
	out := map[string]any{"pulse_version": pulse.Version()}
	out["extensions"] = m["extensions"]
	if comps, ok := m["components"].(map[string]any); ok {
		if aggs, ok := comps["aggregators"].([]any); ok {
			for _, a := range aggs {
				if e, ok := a.(map[string]any); ok && e["name"] == "AGG_ACME_MIDRANGE" {
					out["components_aggregator"] = e
				}
			}
		}
	}
	if err := write("ext_manifest.out.json", out); err != nil {
		return err
	}
	// A request that uses all three.
	for _, name := range []string{"ext_process", "ext_formula"} {
		req, _, err := readReq(name)
		if err != nil {
			return err
		}
		resp, err := p.Process(ctx, req)
		if err != nil {
			if err := write(name+".out.json", map[string]any{"error": coded(err)}); err != nil {
				return err
			}
			continue
		}
		if err := write(name+".out.json", resp); err != nil {
			return err
		}
	}
	return nil
}

/* ---------- 2. the registration probe: refusals at pulse.New ---------- */

// notOnline satisfies extend.Aggregator but not OnlineAggregator.
type notOnline struct{}

func (notOnline) Aggregate(extend.Rows, string) (float64, error) { return 0, nil }

func stepProbe() error {
	cases := []struct {
		name string
		reg  pulse.AggregatorRegistration
	}{
		{"streamable_mismatch", func() pulse.AggregatorRegistration {
			r := midReg()
			r.Factory = func(*types.Aggregation, *encoding.Schema) (extend.Aggregator, error) { return notOnline{}, nil }
			return r
		}()},
		{"factory_panic", func() pulse.AggregatorRegistration {
			r := midReg()
			r.Factory = func(_ *types.Aggregation, schema *encoding.Schema) (extend.Aggregator, error) {
				_ = schema.Fields[0] // a factory that assumes a schema: the probe passes none
				return newMid(), nil
			}
			return r
		}()},
		{"name_collision", func() pulse.AggregatorRegistration { r := midReg(); r.Name = "AGG_SUM"; return r }()},
		{"name_invalid", func() pulse.AggregatorRegistration { r := midReg(); r.Name = "midrange"; return r }()},
	}
	out := []map[string]any{}
	for _, c := range cases {
		_, err := newPulse(pulse.Extensions{Aggregators: []pulse.AggregatorRegistration{c.reg}}, nil)
		e := coded(err)
		if e != nil {
			if d, ok := e["details"].(map[string]any); ok {
				delete(d, "stack") // frames carry file:line of this harness
			}
		}
		out = append(out, map[string]any{"case": c.name, "name": c.reg.Name, "new_error": e})
	}
	return write("probe.out.json", out)
}

/* ---------- 3. panic recovery: PROCESSING_PANIC, and the instance keeps serving ---------- */

// brittle passes the probe (it is never fed rows there) and panics on a row over 75.
type brittle struct{ *midrange }

func (b brittle) UpdateRow(rec extend.Record, field string) error {
	if v, ok := rec.NumericValue(field); ok && v > 75 {
		var lookup map[string]float64
		lookup["over"] = v // a nil-map write: an embedder bug
	}
	return b.midrange.UpdateRow(rec, field)
}
func (b brittle) Aggregate(rows extend.Rows, field string) (float64, error) {
	for i := 0; i < rows.Len(); i++ {
		if err := b.UpdateRow(rows.At(i), field); err != nil {
			return 0, err
		}
	}
	return b.Finalize()
}

func stepPanic() error {
	reg := midReg()
	reg.Name = "AGG_ACME_BRITTLE"
	reg.Mergeable = false
	reg.Factory = func(*types.Aggregation, *encoding.Schema) (extend.Aggregator, error) { return brittle{newMid()}, nil }
	p, err := newPulse(pulse.Extensions{Aggregators: []pulse.AggregatorRegistration{reg, midReg()}}, nil)
	if err != nil {
		return err
	}
	ctx := context.Background()
	req, _, err := readReq("panic")
	if err != nil {
		return err
	}
	_, perr := p.Process(ctx, req)
	e := coded(perr)
	if d, ok := e["details"].(map[string]any); ok {
		if st, ok := d["stack"].([]string); ok {
			// keep the function names of the first frames; file:line is build-specific
			top := []string{}
			for i, f := range st {
				if i == 3 {
					break
				}
				top = append(top, strings.Fields(f)[0])
			}
			d["stack_top"] = top
			d["stack_frames"] = len(st)
			delete(d, "stack")
		}
	}
	// The same instance answers the next request.
	next, _, err := readReq("ext_process")
	if err != nil {
		return err
	}
	resp, nerr := p.Process(ctx, next)
	after := map[string]any{"error": coded(nerr)}
	if resp != nil {
		after = map[string]any{"rows": len(resp.Data), "data": resp.Data}
	}
	return write("panic.out.json", map[string]any{"error": e, "next_request": after})
}

/* ---------- 4. ProcessStreamResult: header, chunks, terminator ---------- */

func stepStream() error {
	p, err := newPulse(fullExtensions(), nil)
	if err != nil {
		return err
	}
	ctx := context.Background()
	out := map[string]any{}
	for _, name := range []string{"stream", "stream_grouped"} {
		req, _, err := readReq(name)
		if err != nil {
			return err
		}
		res, err := p.ProcessStreamResult(ctx, req)
		if err != nil {
			out[name] = map[string]any{"error": coded(err)}
			continue
		}
		chunks := []map[string]any{}
		for ch := range res.Chunks {
			c := map[string]any{"sequence": ch.Sequence, "progress": ch.Progress, "data": ch.Data, "has_components": ch.Components != nil}
			if ch.Components != nil {
				c["components"] = ch.Components
			}
			chunks = append(chunks, c)
		}
		term := <-res.Done
		buf, berr := p.Process(ctx, req)
		match := false
		if berr == nil && len(chunks) > 0 {
			a, _ := json.Marshal(chunks[len(chunks)-1]["components"])
			b, _ := json.Marshal(buf.Components)
			match = string(a) == string(b)
		}
		out[name] = map[string]any{
			"header":     map[string]any{"request_hash": res.Header.RequestHash, "estimated_total": res.Header.EstimatedTotal, "request_hash_matches": res.Header.RequestHash == req.Hash()},
			"chunks":     chunks,
			"terminator": map[string]any{"status": term.Status.String(), "total_rows": term.TotalRows, "error": coded(term.Error), "warnings": term.Warnings},
			"terminal_components_equal_process": match,
		}
	}
	return write("stream.out.json", out)
}

/* ---------- 5. Watch: a rewrite of the cohort, then its removal ---------- */

func copyFile(src, dst string) error {
	b, err := os.ReadFile(filepath.Join(dir, src))
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, dst), b, 0o644)
}

func stepWatch() error {
	_ = os.Remove(filepath.Join(dir, "live.pulse"))
	if err := copyFile("orders.pulse", "live.pulse"); err != nil {
		return err
	}
	p, err := newPulse(pulse.Extensions{}, nil)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	events := p.WatchWithOptions(ctx, "live.pulse", pulse.WatchOptions{PollInterval: 50 * time.Millisecond})
	got := []map[string]any{}
	wait := func() {
		select {
		case ev := <-events:
			got = append(got, map[string]any{"path": ev.Path, "kind": ev.Kind.String(), "hash": ev.Hash})
		case <-time.After(3 * time.Second):
			got = append(got, map[string]any{"kind": "timeout"})
		}
	}
	wait() // the first tick reports the file that is already there as created
	if err := copyFile("more.pulse", "live.pulse"); err != nil {
		cancel()
		return err
	}
	wait()
	// Count the records before and after, as an embedder re-running on change would.
	n, _ := p.CountRecords(context.Background(), "live.pulse")
	if err := os.Remove(filepath.Join(dir, "live.pulse")); err != nil {
		cancel()
		return err
	}
	wait()
	cancel()
	return write("watch.out.json", map[string]any{"events": got, "records_after_rewrite": n})
}

/* ---------- 6. Request.Hash: a cache key ---------- */

func stepHash() error {
	out := []map[string]any{}
	for _, name := range []string{"hash_a", "hash_b", "hash_c"} {
		req, raw, err := readReq(name)
		if err != nil {
			return err
		}
		out = append(out, map[string]any{"request": name, "json": json.RawMessage(raw), "hash": req.Hash()})
	}
	return write("hash.out.json", out)
}

/* ---------- 7. ExpressionReads and RequestReads ---------- */

func stepReads() error {
	exprs := []string{
		`with_tax(amount, lookup("tax_rate", region)) - params.fee`,
		`let gross = amount * items; gross > params.cut and channel == "web"`,
		`amount * (`,
	}
	er := []map[string]any{}
	for _, s := range exprs {
		r, err := pulse.ExpressionReads(s)
		e := map[string]any{"expression": s, "reads": r}
		if err != nil {
			c := coded(err)
			e["error"] = map[string]any{"code": c["code"]}
		}
		er = append(er, e)
	}
	p, err := newPulse(fullExtensions(), nil)
	if err != nil {
		return err
	}
	_, raw, err := readReq("reads")
	if err != nil {
		return err
	}
	rr, rerr := p.RequestReads(raw, "")
	return write("reads.out.json", map[string]any{"expression_reads": er, "request_reads": rr, "request_reads_error": coded(rerr)})
}

/* ---------- 8. observability: hooks, observe/prom, observe/otel ---------- */

func stepObserve() error {
	ctx := context.Background()
	// (a) plain hooks: what each callback is told (durations left out).
	calls := []map[string]any{}
	hooks := &observe.Hooks{
		OnOperationStart: func(ctx context.Context, info observe.OperationInfo) context.Context {
			calls = append(calls, map[string]any{"hook": "OnOperationStart", "kind": info.Kind, "scope": info.Scope, "cohort": info.Cohort, "request_hash": info.RequestHash})
			return ctx
		},
		OnPhase: func(_ context.Context, info observe.OperationInfo, ph observe.PhaseTiming) {
			calls = append(calls, map[string]any{"hook": "OnPhase", "phase": ph.Phase})
		},
		OnOperationEnd: func(_ context.Context, info observe.OperationInfo, r observe.OperationResult) {
			calls = append(calls, map[string]any{"hook": "OnOperationEnd", "code": r.Code, "arm": r.Arm, "rows_scanned": r.RowsScanned, "rows_matched": r.RowsMatched, "rows_out": r.RowsOut, "workers": r.Workers, "projected": r.Projected})
		},
	}
	p, err := newPulse(fullExtensions(), func(o *pulse.Options) { o.Hooks = hooks })
	if err != nil {
		return err
	}
	req, _, err := readReq("ext_process")
	if err != nil {
		return err
	}
	if _, err := p.Process(ctx, req); err != nil {
		return err
	}
	bad, _, err := readReq("observe_bad")
	if err != nil {
		return err
	}
	_, badErr := p.Process(ctx, bad)
	if err := write("observe_hooks.out.json", map[string]any{"calls": calls, "bad_request_error": coded(badErr)}); err != nil {
		return err
	}

	// (b) observe/prom: the families a scrape would show, values without timings.
	reg := prometheus.NewRegistry()
	pp, err := newPulse(fullExtensions(), func(o *pulse.Options) { o.Metrics = prompulse.Metrics(reg) })
	if err != nil {
		return err
	}
	if _, err := pp.Process(ctx, req); err != nil {
		return err
	}
	_, _ = pp.Process(ctx, bad)
	fams, err := reg.Gather()
	if err != nil {
		return err
	}
	prom := []map[string]any{}
	for _, f := range fams {
		series := []map[string]any{}
		for _, m := range f.GetMetric() {
			labels := map[string]string{}
			for _, l := range m.GetLabel() {
				labels[l.GetName()] = l.GetValue()
			}
			s := map[string]any{"labels": labels}
			switch f.GetType() {
			case dto.MetricType_COUNTER:
				s["value"] = m.GetCounter().GetValue()
			case dto.MetricType_GAUGE:
				s["value"] = m.GetGauge().GetValue()
			case dto.MetricType_HISTOGRAM:
				s["sample_count"] = m.GetHistogram().GetSampleCount()
				if !strings.Contains(f.GetName(), "seconds") {
					s["sample_sum"] = m.GetHistogram().GetSampleSum()
				}
			}
			if v, ok := s["value"].(float64); ok && v == 0 && f.GetType() != dto.MetricType_COUNTER {
				continue
			}
			series = append(series, s)
		}
		if len(series) == 0 {
			continue
		}
		prom = append(prom, map[string]any{"name": f.GetName(), "type": f.GetType().String(), "help": f.GetHelp(), "series": series})
	}
	sort.Slice(prom, func(i, j int) bool { return prom[i]["name"].(string) < prom[j]["name"].(string) })
	if err := write("observe_prom.out.json", prom); err != nil {
		return err
	}

	// (c) observe/otel: the spans a tracer provider receives.
	sr := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(sr))
	op, err := newPulse(fullExtensions(), func(o *pulse.Options) { o.Hooks = otelpulse.Hooks(tp) })
	if err != nil {
		return err
	}
	if _, err := op.Process(ctx, req); err != nil {
		return err
	}
	_, _ = op.Process(ctx, bad)
	spans := []map[string]any{}
	for _, s := range sr.Ended() {
		attrs := map[string]any{}
		for _, a := range s.Attributes() {
			attrs[string(a.Key)] = a.Value.AsInterface()
		}
		evs := []map[string]any{}
		for _, e := range s.Events() {
			ea := map[string]any{}
			for _, a := range e.Attributes {
				if strings.Contains(string(a.Key), "duration") {
					continue
				}
				ea[string(a.Key)] = a.Value.AsInterface()
			}
			evs = append(evs, map[string]any{"name": e.Name, "attributes": ea})
		}
		spans = append(spans, map[string]any{"name": s.Name(), "status": s.Status().Code.String(), "status_description": s.Status().Description, "attributes": attrs, "events": evs})
	}
	return write("observe_otel.out.json", spans)
}

/* ---------- 9. FilterToFileWithRequest: a derived cohort named by its inputs ---------- */

func stepFilterToFile() error {
	p, err := newPulse(fullExtensions(), nil)
	if err != nil {
		return err
	}
	ctx := context.Background()
	outDir := "ftf"
	_ = os.RemoveAll(filepath.Join(dir, outDir))
	if err := os.MkdirAll(filepath.Join(dir, outDir), 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(filepath.Join(dir, outDir))
	runs := []map[string]any{}
	for _, expr := range []string{"amount > 50", "amount > 50", "with_tax(amount, 0.1) > 55", "with_tax(amount, 0.1) > 55"} {
		res, err := p.FilterToFileWithRequest(ctx, &pulse.FilterToFileRequest{SourcePath: "orders.pulse", Expression: expr, OutputDir: outDir})
		r := map[string]any{"expression": expr}
		if err != nil {
			r["error"] = coded(err)
		} else {
			r["output_name"] = filepath.Base(res.OutputPath)
			r["output_hash"] = res.OutputHash
			r["row_count"] = res.RowCount
			r["reused"] = res.Reused
		}
		runs = append(runs, r)
	}
	return write("filter_to_file.out.json", runs)
}
