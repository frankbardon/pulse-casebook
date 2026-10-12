package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Scheduling over the small fixture cohorts (3000 rows) with a forced
// low auto-preview threshold.
func TestPreviewTiering(t *testing.T) {
	f := newPreviewFixtureConfig(t, Config{PreviewTimeout: 30 * time.Second, AutoPreviewRows: 1000})
	battery := "ab/req/04_metric_battery.json"
	pipeline := "ab/req/pipeline.json"

	t.Run("cheap probe runs", func(t *testing.T) {
		code, out := f.post(t, map[string]any{"path": pipeline, "request": f.read(t, pipeline), "node": "filterers[0]"})
		if code != 200 || out["status"] != "ok" || at(out, "probes", 0, "filter") == nil {
			t.Fatalf("%d %v", code, out)
		}
		if out["record_count"] != float64(3000) {
			t.Fatalf("record_count = %v", out["record_count"])
		}
	})
	t.Run("expensive probe defers", func(t *testing.T) {
		before := f.calls.Load()
		code, out := f.post(t, map[string]any{"path": battery, "request": f.read(t, battery), "node": "tests[2]"})
		if code != 200 || out["status"] != "deferred" || out["cost"] != "expensive" {
			t.Fatalf("%d %v", code, out)
		}
		if at(out, "probes", 0, "node") != "tests[2]" || at(out, "probes", 0, "reason") == nil || at(out, "probes", 0, "result") != nil {
			t.Fatalf("deferred probe = %v", at(out, "probes", 0))
		}
		if f.calls.Load() != before {
			t.Fatal("deferred preview called the engine")
		}
	})
	t.Run("force runs it", func(t *testing.T) {
		code, out := f.post(t, map[string]any{"path": battery, "request": f.read(t, battery), "node": "tests[2]", "force": true})
		if code != 200 || out["status"] != "ok" || at(out, "probes", 0, "result") == nil {
			t.Fatalf("%d %v", code, out)
		}
	})
	t.Run("attribute drops quantiles", func(t *testing.T) {
		code, out := f.post(t, map[string]any{"path": pipeline, "request": f.read(t, pipeline), "node": "attributes[0]"})
		if code != 200 || out["status"] != "ok" || out["cost"] != "cheap" {
			t.Fatalf("%d %v", code, out)
		}
		if d, _ := out["deferred"].([]any); len(d) != 1 || d[0] != "quantiles" {
			t.Fatalf("deferred = %v", out["deferred"])
		}
		if at(out, "probes", 0, "stats", "mean") == nil || at(out, "probes", 0, "stats", "quantiles") != nil {
			t.Fatalf("stats = %v", at(out, "probes", 0, "stats"))
		}
		_, forced := f.post(t, map[string]any{"path": pipeline, "request": f.read(t, pipeline), "node": "attributes[0]", "force": true})
		if forced["deferred"] != nil || at(forced, "probes", 0, "stats", "quantiles") == nil {
			t.Fatalf("forced stats = %v", at(forced, "probes", 0, "stats"))
		}
	})
}

// A grouped request's own AGG_PERCENTILE sorts the cohort per group: its
// probe, and downstream probes that keep it, defer on large cohorts.
func TestPreviewPercentileAggregationDefers(t *testing.T) {
	f := newPreviewFixtureConfig(t, Config{PreviewTimeout: 30 * time.Second, AutoPreviewRows: 1000})
	path := "ab/req/percentile.json"
	for node, want := range map[string]string{"groups[0]": "ok", "aggregations[0]": "ok", "aggregations[1]": "deferred", "sort[0]": "deferred"} {
		code, out := f.post(t, map[string]any{"path": path, "request": f.read(t, path), "node": node})
		if code != 200 || out["status"] != want {
			t.Fatalf("%s: %d %v, want %s", node, code, out, want)
		}
		if want == "deferred" && out["cost"] != "expensive" {
			t.Fatalf("%s: cost %v", node, out["cost"])
		}
	}
	code, out := f.post(t, map[string]any{"path": path, "request": f.read(t, path), "node": "aggregations[1]", "force": true})
	if code != 200 || out["status"] != "ok" || at(out, "probes", 0, "table") == nil {
		t.Fatalf("forced: %d %v", code, out)
	}
}

func TestPreviewCache(t *testing.T) {
	f := newPreviewFixture(t)
	path := "ab/req/pipeline.json"
	body := map[string]any{"path": path, "request": f.read(t, path), "node": "filterers[1]"}
	before := f.calls.Load()
	_, first := f.post(t, body)
	_, second := f.post(t, body)
	if first["status"] != "ok" || first["cached"] != nil || second["cached"] != true {
		t.Fatalf("cached: first %v, second %v", first["cached"], second["cached"])
	}
	if got := f.calls.Load() - before; got != 1 {
		t.Fatalf("engine calls = %d, want 1", got)
	}
	if at(first, "probes", 0, "filter", "n_out") != at(second, "probes", 0, "filter", "n_out") {
		t.Fatal("cached probe differs")
	}

	// Touching the cohort invalidates.
	cohort := filepath.Join(f.dir, "ab", "ab_test.pulse")
	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(cohort, later, later); err != nil {
		t.Fatal(err)
	}
	_, third := f.post(t, body)
	if third["status"] != "ok" || third["cached"] != nil {
		t.Fatalf("after touch: %v", third)
	}
	if got := f.calls.Load() - before; got != 2 {
		t.Fatalf("engine calls after touch = %d, want 2", got)
	}
}

func TestPreviewTimedOut(t *testing.T) {
	f := newPreviewFixtureConfig(t, Config{PreviewTimeout: time.Nanosecond})
	path := "ab/req/04_metric_battery.json"
	code, out := f.post(t, map[string]any{"path": path, "request": f.read(t, path), "node": "tests[0]"})
	if code != 200 || out["status"] != "timed_out" || out["error"] != nil {
		t.Fatalf("%d %v", code, out)
	}
	if at(out, "probes", 0, "node") != "tests[0]" {
		t.Fatalf("probes = %v", out["probes"])
	}
}

// A synthesized cohort over the default --auto-preview-rows (1M) with
// the binary's default settings: cheap probes run, expensive ones defer,
// and a newer forced preview of a node cancels the in-flight engine
// scan. Slow (synthesizes ~60 MB), so skipped under -short.
func TestPreviewLargeCohort(t *testing.T) {
	if testing.Short() {
		t.Skip("large cohort test skipped in -short mode")
	}
	show := showcaseDir()
	f := newPreviewFixtureConfig(t, Config{PreviewTimeout: 10 * time.Second, AutoPreviewRows: 1_000_000})
	synthCohort(t, filepath.Join(show, "ab-test-readout/data/ab_test.synth.json"), filepath.Join(f.dir, "big", "ab_test.pulse"), 1_100_000, 11)
	path := "big/req/04_metric_battery.json"
	req := f.read(t, "ab/req/04_metric_battery.json")
	if err := os.MkdirAll(filepath.Join(f.dir, "big", "req"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.dir, filepath.FromSlash(path)), req, 0o644); err != nil {
		t.Fatal(err)
	}

	start := time.Now()
	code, out := f.post(t, map[string]any{"path": path, "request": req, "node": "tests[2]"})
	if code != 200 || out["status"] != "deferred" || out["record_count"] != float64(1_100_000) {
		t.Fatalf("%d %v", code, out)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("deferred preview took %v", d)
	}
	code, out = f.post(t, map[string]any{"path": path, "request": req, "node": "cohort"})
	if code != 200 || out["status"] != "ok" || at(out, "probes", 0, "rows", "total") != float64(1_100_000) {
		t.Fatalf("cheap probe: %d %v", code, out)
	}

	// Supersede: start a forced battery, wait for the engine to pick it
	// up, then send a newer preview for the same node.
	forced := map[string]any{"path": path, "request": req, "node": "tests[2]", "force": true}
	before := f.calls.Load()
	first := make(chan map[string]any, 1)
	go func() {
		_, out := f.post(t, forced)
		first <- out
	}()
	deadline := time.Now().Add(5 * time.Second)
	for f.calls.Load() == before {
		if time.Now().After(deadline) {
			t.Fatal("first preview never reached the engine")
		}
		time.Sleep(time.Millisecond)
	}
	newer := map[string]any{"path": path, "request": req, "node": "tests[2]"} // deferred, but still supersedes
	if _, out := f.post(t, newer); out["status"] != "deferred" {
		t.Fatalf("newer preview: %v", out)
	}
	select {
	case out := <-first:
		if out["status"] != "cancelled" {
			t.Fatalf("superseded preview status = %v, want cancelled", out["status"])
		}
	case <-time.After(10 * time.Second):
		t.Fatal("superseded preview kept running")
	}
}
