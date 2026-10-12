package preview

import (
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"
)

// Preview statuses. A preview that did not produce probes because it
// was deferred, timed out or superseded is still a successful response:
// the status says why the probes are empty.
const (
	StatusOK        = "ok"
	StatusDeferred  = "deferred"
	StatusTimedOut  = "timed_out"
	StatusCancelled = "cancelled"
)

// Defaults for the Scheduler (research/preview-benchmark.md: a filtered
// scan of a 3M-row cohort buffers about 1 GB, so cap concurrency).
const (
	DefaultMaxInFlight = 2
	DefaultCacheSize   = 128
)

// RunFunc executes a plan; Run with an engine bound in production, a
// stub in tests.
type RunFunc func(ctx context.Context, plan *Plan) (*Result, error)

// Job is one scheduled preview.
type Job struct {
	// Key identifies the node(s) previewed (e.g. request path + node
	// ids). A newer job with the same Key cancels the in-flight one.
	Key string
	// Plan is the built probe.
	Plan *Plan
	// Stamp identifies the state of the cohort file(s) the plan reads
	// (path, size, mtime). It is part of the cache key, so touching a
	// cohort invalidates cached previews over it.
	Stamp string
	// RecordCount is the cohort's record_count from inspect (the largest
	// one when the plan reads several); 0 when unknown.
	RecordCount int64
	// Force runs expensive probes regardless of the row threshold.
	Force bool
	// Cheaper, when set, returns a cheap variant of an expensive plan
	// (e.g. attribute stats without percentiles) and the names of the
	// parts it leaves out. It is used instead of deferring outright.
	Cheaper func() (*Plan, []string, error)
}

// Scheduler runs previews: it caches results by sub-request and cohort
// stamp, cancels superseded previews of the same node, caps the number
// of engine calls in flight, applies the preview timeout, and defers
// expensive probes on cohorts above the auto-preview row threshold.
type Scheduler struct {
	run      RunFunc
	timeout  time.Duration
	autoRows int64
	sem      chan struct{}

	mu       sync.Mutex
	inflight map[string]*flight
	cache    *lru
}

type flight struct{ cancel context.CancelFunc }

// SchedulerOptions configure a Scheduler. Zero values take the defaults
// (no timeout, no threshold, DefaultMaxInFlight, DefaultCacheSize).
type SchedulerOptions struct {
	Timeout     time.Duration
	AutoRows    int64
	MaxInFlight int
	CacheSize   int
}

// NewScheduler returns a Scheduler running plans with run.
func NewScheduler(run RunFunc, o SchedulerOptions) *Scheduler {
	if o.MaxInFlight <= 0 {
		o.MaxInFlight = DefaultMaxInFlight
	}
	if o.CacheSize <= 0 {
		o.CacheSize = DefaultCacheSize
	}
	return &Scheduler{
		run:      run,
		timeout:  o.Timeout,
		autoRows: o.AutoRows,
		sem:      make(chan struct{}, o.MaxInFlight),
		inflight: map[string]*flight{},
		cache:    newLRU(o.CacheSize),
	}
}

// Do schedules a job and waits for it. Deferral, timeout and
// supersession are reported in Result.Status, not as errors; errors are
// build/engine failures.
func (s *Scheduler) Do(ctx context.Context, job Job) (*Result, error) {
	ctx, done := s.claim(ctx, job.Key)
	defer done()

	plan := job.Plan
	var deferred []string
	if !job.Force && plan.Cost == CostExpensive && s.overThreshold(job.RecordCount) {
		if job.Cheaper != nil {
			cheap, parts, err := job.Cheaper()
			if err != nil {
				return nil, err
			}
			if cheap != nil && cheap.Cost == CostCheap {
				plan, deferred = cheap, parts
			}
		}
		if plan.Cost == CostExpensive {
			return s.deferredResult(plan, job.RecordCount), nil
		}
	}

	key, err := cacheKey(plan, job.Stamp)
	if err != nil {
		return nil, err
	}
	if hit := s.cache.get(key); hit != nil {
		out := *hit
		out.Cached = true
		return &out, nil
	}

	select {
	case s.sem <- struct{}{}:
	case <-ctx.Done():
		return statusResult(plan, ctx.Err()), nil
	}
	defer func() { <-s.sem }()

	runCtx := ctx
	if s.timeout > 0 {
		var cancel context.CancelFunc
		runCtx, cancel = context.WithTimeout(ctx, s.timeout)
		defer cancel()
	}
	res, err := s.run(runCtx, plan)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return statusResult(plan, err), nil
		}
		return nil, err
	}
	res.Status = StatusOK
	res.Deferred = deferred
	res.RecordCount = job.RecordCount
	s.cache.put(key, res)
	return res, nil
}

// SupersedeKey identifies "the same node" for supersession: a newer
// preview from the same client of the same request file and node set
// cancels the older one. client is an opaque per-page id (the UI makes
// one per page load); previews from different clients never cancel each
// other. An empty client keys by path and nodes alone. The result cache
// is not keyed by client: it is shared.
func SupersedeKey(client, path string, nodes []string) string {
	ids := slices.Clone(nodes)
	slices.Sort(ids)
	return client + "\x00" + path + "\x00" + strings.Join(ids, "\x00")
}

// claim registers the job as the in-flight preview for its key,
// cancelling the previous one. done unregisters it (if still current).
func (s *Scheduler) claim(parent context.Context, key string) (context.Context, func()) {
	ctx, cancel := context.WithCancel(parent)
	if key == "" {
		return ctx, cancel
	}
	f := &flight{cancel: cancel}
	s.mu.Lock()
	if prev := s.inflight[key]; prev != nil {
		prev.cancel()
	}
	s.inflight[key] = f
	s.mu.Unlock()
	return ctx, func() {
		s.mu.Lock()
		if s.inflight[key] == f {
			delete(s.inflight, key)
		}
		s.mu.Unlock()
		cancel()
	}
}

func (s *Scheduler) overThreshold(rows int64) bool {
	return s.autoRows > 0 && rows > s.autoRows
}

// deferredResult lists the plan's nodes without running anything.
func (s *Scheduler) deferredResult(plan *Plan, rows int64) *Result {
	res := &Result{Verb: plan.Verb, Cost: plan.Cost, Status: StatusDeferred, RecordCount: rows, Probes: []*Probe{}}
	reason := fmt.Sprintf("cohort has %d records, over the auto-preview limit of %d; run with force", rows, s.autoRows)
	for _, np := range plan.Nodes {
		res.Probes = append(res.Probes, &Probe{Node: np.ID, Kind: np.Kind, Reason: reason})
	}
	return res
}

// statusResult is the response for a preview stopped by its context.
func statusResult(plan *Plan, err error) *Result {
	status := StatusCancelled
	if errors.Is(err, context.DeadlineExceeded) {
		status = StatusTimedOut
	}
	res := &Result{Verb: plan.Verb, Cost: plan.Cost, Status: status, Probes: []*Probe{}}
	for _, np := range plan.Nodes {
		res.Probes = append(res.Probes, &Probe{Node: np.ID, Kind: np.Kind})
	}
	return res
}

// cacheKey hashes the whole plan (sub-request plus what is read back
// from it) with the cohort stamp.
func cacheKey(plan *Plan, stamp string) (string, error) {
	raw, err := json.Marshal(plan)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	h.Write(raw)
	h.Write([]byte{0})
	h.Write([]byte(stamp))
	return hex.EncodeToString(h.Sum(nil)), nil
}

// lru is a small mutex-guarded LRU of successful results.
type lru struct {
	mu    sync.Mutex
	max   int
	order *list.List // front = most recent; values are *lruEntry
	items map[string]*list.Element
}

type lruEntry struct {
	key string
	res *Result
}

func newLRU(max int) *lru {
	return &lru{max: max, order: list.New(), items: map[string]*list.Element{}}
}

func (c *lru) get(key string) *Result {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		return nil
	}
	c.order.MoveToFront(el)
	return el.Value.(*lruEntry).res
}

func (c *lru) put(key string, res *Result) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		el.Value.(*lruEntry).res = res
		c.order.MoveToFront(el)
		return
	}
	c.items[key] = c.order.PushFront(&lruEntry{key: key, res: res})
	for c.order.Len() > c.max {
		last := c.order.Back()
		c.order.Remove(last)
		delete(c.items, last.Value.(*lruEntry).key)
	}
}
