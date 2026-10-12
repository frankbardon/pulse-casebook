package preview

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// stubRunner is a RunFunc whose plans either return at once or, when
// the sub-request has "slow": true, block until their context ends.
type stubRunner struct {
	calls   atomic.Int64
	active  atomic.Int64
	peak    atomic.Int64
	started chan string // receives the plan label when a run starts
	hold    time.Duration
}

func newStub() *stubRunner { return &stubRunner{started: make(chan string, 16)} }

func (r *stubRunner) run(ctx context.Context, plan *Plan) (*Result, error) {
	r.calls.Add(1)
	n := r.active.Add(1)
	defer r.active.Add(-1)
	for {
		p := r.peak.Load()
		if n <= p || r.peak.CompareAndSwap(p, n) {
			break
		}
	}
	label, _ := plan.Request["label"].(string)
	r.started <- label
	if plan.Request["fail"] == true {
		return nil, &EngineError{Code: "boom", Message: "engine failed"}
	}
	if plan.Request["slow"] == true {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if r.hold > 0 {
		select {
		case <-time.After(r.hold):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return &Result{Status: StatusOK, Verb: plan.Verb, Cost: plan.Cost, Probes: []*Probe{{Node: "x", Kind: KindFilter}}}, nil
}

func stubPlan(label, cost string, extra map[string]any) *Plan {
	req := map[string]any{"label": label}
	for k, v := range extra {
		req[k] = v
	}
	return &Plan{Verb: VerbProcess, Cost: cost, Request: req, Slot: -1,
		Nodes: []*NodePlan{{ID: "filterers[0]", Kind: KindFilter, Section: "filterers"}}}
}

func TestSchedulerCache(t *testing.T) {
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{})
	job := Job{Key: "a", Plan: stubPlan("p", CostCheap, nil), Stamp: "c.pulse|10|1"}
	for i, wantCached := range []bool{false, true, true} {
		res, err := s.Do(context.Background(), job)
		if err != nil {
			t.Fatal(err)
		}
		if res.Status != StatusOK || res.Cached != wantCached {
			t.Fatalf("run %d: status %s cached %v, want ok/%v", i, res.Status, res.Cached, wantCached)
		}
	}
	if r.calls.Load() != 1 {
		t.Fatalf("runs = %d, want 1", r.calls.Load())
	}
	// A touched cohort (new stamp) and a different sub-request miss.
	job.Stamp = "c.pulse|10|2"
	if res, _ := s.Do(context.Background(), job); res.Cached {
		t.Fatal("new cohort stamp hit the cache")
	}
	job.Plan = stubPlan("other", CostCheap, nil)
	if res, _ := s.Do(context.Background(), job); res.Cached {
		t.Fatal("different sub-request hit the cache")
	}
	if r.calls.Load() != 3 {
		t.Fatalf("runs = %d, want 3", r.calls.Load())
	}
}

func TestSchedulerSupersede(t *testing.T) {
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{Timeout: 10 * time.Second})
	first := make(chan *Result, 1)
	go func() {
		res, err := s.Do(context.Background(), Job{Key: "req.json\x00filterers[0]", Plan: stubPlan("old", CostCheap, map[string]any{"slow": true})})
		if err != nil {
			t.Error(err)
		}
		first <- res
	}()
	if got := <-r.started; got != "old" {
		t.Fatalf("started %q", got)
	}
	// Another node's preview does not cancel it.
	if res, err := s.Do(context.Background(), Job{Key: "req.json\x00filterers[1]", Plan: stubPlan("side", CostCheap, nil)}); err != nil || res.Status != StatusOK {
		t.Fatalf("other node: %v %v", res, err)
	}
	select {
	case res := <-first:
		t.Fatalf("other node cancelled the in-flight preview: %+v", res)
	default:
	}
	res, err := s.Do(context.Background(), Job{Key: "req.json\x00filterers[0]", Plan: stubPlan("new", CostCheap, nil)})
	if err != nil || res.Status != StatusOK {
		t.Fatalf("newer preview: %+v %v", res, err)
	}
	select {
	case old := <-first:
		if old.Status != StatusCancelled {
			t.Fatalf("superseded status = %s, want cancelled", old.Status)
		}
		if len(old.Probes) != 1 || old.Probes[0].Node != "filterers[0]" {
			t.Fatalf("superseded probes = %+v", old.Probes)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("superseded preview was not cancelled")
	}
}

// Two clients previewing the same node of the same file do not cancel
// each other (and share the cache); the same client still supersedes.
func TestSchedulerSupersedeIsPerClient(t *testing.T) {
	nodes := []string{"filterers[1]", "filterers[0]"}
	if SupersedeKey("", "r.json", nodes) != SupersedeKey("", "r.json", []string{"filterers[0]", "filterers[1]"}) {
		t.Fatal("key depends on node order")
	}
	if SupersedeKey("a", "r.json", nodes) == SupersedeKey("b", "r.json", nodes) || SupersedeKey("a", "r.json", nodes) == SupersedeKey("", "r.json", nodes) {
		t.Fatal("key ignores the client")
	}
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{Timeout: 10 * time.Second})
	slowA := make(chan *Result, 1)
	go func() {
		res, _ := s.Do(context.Background(), Job{Key: SupersedeKey("tab-a", "r.json", nodes), Plan: stubPlan("a", CostCheap, map[string]any{"slow": true})})
		slowA <- res
	}()
	if got := <-r.started; got != "a" {
		t.Fatalf("started %q", got)
	}
	// Another client on the same nodes runs alongside.
	if res, err := s.Do(context.Background(), Job{Key: SupersedeKey("tab-b", "r.json", nodes), Plan: stubPlan("b", CostCheap, nil)}); err != nil || res.Status != StatusOK {
		t.Fatalf("client b: %+v %v", res, err)
	}
	select {
	case res := <-slowA:
		t.Fatalf("client b cancelled client a: %+v", res)
	case <-time.After(50 * time.Millisecond):
	}
	// Client b's result is cached for client a too.
	if res, _ := s.Do(context.Background(), Job{Key: SupersedeKey("tab-c", "r.json", nodes), Plan: stubPlan("b", CostCheap, nil)}); !res.Cached {
		t.Fatal("cache is not shared across clients")
	}
	// The same client's newer preview supersedes its in-flight one.
	if res, err := s.Do(context.Background(), Job{Key: SupersedeKey("tab-a", "r.json", nodes), Plan: stubPlan("a2", CostCheap, nil)}); err != nil || res.Status != StatusOK {
		t.Fatalf("client a newer: %+v %v", res, err)
	}
	select {
	case res := <-slowA:
		if res.Status != StatusCancelled {
			t.Fatalf("superseded status = %s", res.Status)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("same client did not supersede")
	}
}

func TestSchedulerTimeout(t *testing.T) {
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{Timeout: 20 * time.Millisecond})
	res, err := s.Do(context.Background(), Job{Key: "k", Plan: stubPlan("slow", CostCheap, map[string]any{"slow": true})})
	if err != nil {
		t.Fatalf("timeout returned an error: %v", err)
	}
	if res.Status != StatusTimedOut {
		t.Fatalf("status = %s, want timed_out", res.Status)
	}
	// Timed-out results are not cached.
	r.started = make(chan string, 16)
	res, _ = s.Do(context.Background(), Job{Key: "k", Plan: stubPlan("slow", CostCheap, map[string]any{"slow": true})})
	if res.Cached || r.calls.Load() != 2 {
		t.Fatalf("timed-out result was cached (calls %d)", r.calls.Load())
	}
}

func TestSchedulerConcurrencyCap(t *testing.T) {
	r := newStub()
	r.hold = 30 * time.Millisecond
	s := NewScheduler(r.run, SchedulerOptions{MaxInFlight: 2})
	var wg sync.WaitGroup
	for i := range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			key := string(rune('a' + i))
			if _, err := s.Do(context.Background(), Job{Key: key, Plan: stubPlan(key, CostCheap, nil)}); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if r.calls.Load() != 6 {
		t.Fatalf("runs = %d, want 6", r.calls.Load())
	}
	if p := r.peak.Load(); p > 2 {
		t.Fatalf("peak in flight = %d, want <= 2", p)
	}
}

func TestSchedulerQueuedCancel(t *testing.T) {
	// A preview waiting for a slot is cancelled by a newer one too.
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{MaxInFlight: 1})
	blocker := make(chan struct{})
	go func() {
		_, _ = s.Do(context.Background(), Job{Key: "blocker", Plan: stubPlan("blocker", CostCheap, map[string]any{"slow": true})})
		close(blocker)
	}()
	<-r.started
	queued := make(chan *Result, 1)
	go func() {
		res, _ := s.Do(context.Background(), Job{Key: "n", Plan: stubPlan("queued", CostCheap, nil)})
		queued <- res
	}()
	time.Sleep(20 * time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		_, _ = s.Do(ctx, Job{Key: "n", Plan: stubPlan("newer", CostCheap, nil)})
	}()
	select {
	case res := <-queued:
		if res.Status != StatusCancelled {
			t.Fatalf("queued status = %s, want cancelled", res.Status)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("queued preview was not cancelled")
	}
	cancel()
	_, _ = s.Do(context.Background(), Job{Key: "blocker", Plan: stubPlan("x", CostCheap, nil)}) // cancels the blocker
	<-blocker
}

func TestSchedulerTiering(t *testing.T) {
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{AutoRows: 1000})
	expensive := stubPlan("battery", CostExpensive, nil)
	cases := []struct {
		name   string
		job    Job
		status string
		runs   int64
	}{
		{"cheap above threshold runs", Job{Key: "1", Plan: stubPlan("count", CostCheap, nil), RecordCount: 5000}, StatusOK, 1},
		{"expensive below threshold runs", Job{Key: "2", Plan: expensive, RecordCount: 1000}, StatusOK, 1},
		{"expensive above threshold defers", Job{Key: "3", Plan: stubPlan("battery2", CostExpensive, nil), RecordCount: 1001}, StatusDeferred, 0},
		{"force runs it", Job{Key: "3", Plan: stubPlan("battery2", CostExpensive, nil), RecordCount: 1001, Force: true}, StatusOK, 1},
		{"unknown size runs", Job{Key: "4", Plan: stubPlan("battery3", CostExpensive, nil)}, StatusOK, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			before := r.calls.Load()
			res, err := s.Do(context.Background(), c.job)
			if err != nil {
				t.Fatal(err)
			}
			if res.Status != c.status {
				t.Fatalf("status = %s, want %s", res.Status, c.status)
			}
			if got := r.calls.Load() - before; got != c.runs {
				t.Fatalf("runs = %d, want %d", got, c.runs)
			}
			if res.Status == StatusDeferred && (len(res.Probes) != 1 || res.Probes[0].Reason == "" || res.RecordCount != 1001) {
				t.Fatalf("deferred result = %+v", res)
			}
		})
	}

	t.Run("cheaper variant runs instead", func(t *testing.T) {
		res, err := s.Do(context.Background(), Job{Key: "5", Plan: stubPlan("stats", CostExpensive, nil), RecordCount: 5000,
			Cheaper: func() (*Plan, []string, error) {
				return stubPlan("stats-cheap", CostCheap, nil), []string{"quantiles"}, nil
			}})
		if err != nil {
			t.Fatal(err)
		}
		if res.Status != StatusOK || res.Cost != CostCheap || len(res.Deferred) != 1 || res.Deferred[0] != "quantiles" {
			t.Fatalf("cheaper result = %+v", res)
		}
	})
}

func TestSchedulerEngineError(t *testing.T) {
	r := newStub()
	s := NewScheduler(r.run, SchedulerOptions{})
	_, err := s.Do(context.Background(), Job{Key: "k", Plan: stubPlan("f", CostCheap, map[string]any{"fail": true})})
	var ee *EngineError
	if !errors.As(err, &ee) || ee.Code != "boom" {
		t.Fatalf("err = %v, want engine error", err)
	}
}
