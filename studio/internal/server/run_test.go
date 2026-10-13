package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/descriptor"
)

func postRun(t *testing.T, s *Server, ctx context.Context, body map[string]any) (int, map[string]any) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run", bytes.NewReader(raw))
	if ctx != nil {
		req = req.WithContext(ctx)
	}
	s.ServeHTTP(rec, req)
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

func postRunSave(t *testing.T, s *Server, body map[string]any) (int, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/run/save", bytes.NewReader(raw)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

func envelopeOf(t *testing.T, out map[string]any) map[string]any {
	t.Helper()
	text, _ := out["text"].(string)
	var env map[string]any
	if err := json.Unmarshal([]byte(text), &env); err != nil {
		t.Fatalf("envelope text: %v\n%s", err, text)
	}
	return env
}

func TestRunEachRoot(t *testing.T) {
	f := newPreviewFixture(t)
	// The facet's overlay compares against design.pulse beside req/.
	synthCohort(t, filepath.Join(showcaseDir(), "ab-test-readout/data/design.synth.json"), filepath.Join(f.dir, "ab/design.pulse"), 2, 1)
	tests := []struct {
		path, root string
		check      func(t *testing.T, data map[string]any)
	}{
		{"ab/req/04_metric_battery.json", "request", func(t *testing.T, d map[string]any) {
			if n := len(d["tests"].([]any)); n != 6 {
				t.Errorf("tests = %d, want 6", n)
			}
		}},
		{"ab/req/11_readout.compose.json", "compose", func(t *testing.T, d map[string]any) {
			if n := len(d["responses"].([]any)); n != 4 {
				t.Errorf("responses = %d, want 4", n)
			}
		}},
		{"retail/req/06_spend_distribution_chain.json", "chain", func(t *testing.T, d map[string]any) {
			if _, ok := d["stages"].([]any); !ok || d["final"] == nil {
				t.Errorf("chain data lacks stages/final: %v", d)
			}
		}},
		{"ab/req/02_srm_gof.facet.json", "facet", func(t *testing.T, d map[string]any) {
			if _, ok := d["fields"].(map[string]any); !ok {
				t.Errorf("facet data lacks fields: %v", d)
			}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.root, func(t *testing.T) {
			code, out := postRun(t, f.srv, nil, map[string]any{"path": tc.path, "request": f.read(t, tc.path), "client": "c1"})
			if code != http.StatusOK {
				t.Fatalf("run %d %v", code, out)
			}
			if out["root"] != tc.root || out["ok"] != true || out["run_id"] == "" {
				t.Fatalf("bad response: root=%v ok=%v", out["root"], out["ok"])
			}
			env := envelopeOf(t, out)
			if env["format_version"] != "1.1" || len(env["errors"].([]any)) != 0 {
				t.Fatalf("envelope: %v %v", env["format_version"], env["errors"])
			}
			tc.check(t, env["data"].(map[string]any))
		})
	}
	// A run never writes out/.
	if _, err := os.Stat(filepath.Join(f.dir, "ab/out")); !os.IsNotExist(err) {
		t.Fatalf("run created out/: %v", err)
	}
}

// The envelope is byte-for-byte what the CLI writer produces for the
// same engine response: descriptor.NewEnvelope + two-space indent +
// newline (and envelope.data equals a direct library run).
func TestRunEnvelopeMatchesCLIWriter(t *testing.T) {
	f := newPreviewFixture(t)
	const path = "ab/req/07_regression_adjustment.json"
	_, out := postRun(t, f.srv, nil, map[string]any{"path": path, "request": f.read(t, path)})
	var req pulse.Request
	mustUnmarshal(t, f.read(t, path), &req)
	req.Cohort.Filename, req.Cohort.DataDir = "ab/ab_test.pulse", ""
	resp, err := f.srv.Engine().Process(context.Background(), &req)
	if err != nil {
		t.Fatal(err)
	}
	want, err := envelopeBytes(descriptor.NewEnvelope(resp))
	if err != nil {
		t.Fatal(err)
	}
	// metadata.cohort_file names the path the engine opened; the request
	// sent through the API resolves to the same root-relative file.
	if got := out["text"].(string); got != string(want) {
		t.Fatalf("envelope differs from CLI writer output\n got: %.400s\nwant: %.400s", got, want)
	}
	if !bytes.HasPrefix(want, []byte("{\n  \"format_version\": \"1.1\",\n  \"data\": {")) || !bytes.HasSuffix(want, []byte("}\n")) {
		t.Fatalf("unexpected framing: %.80s", want)
	}
}

// Opt-in parity against the real CLI: PULSE_CLI=/path/to/pulse runs
// `pulse api <verb> -r <file> --json` from the case directory and the
// saved envelope must match it except the cohort paths the response
// echoes (metadata.cohort_file, an overlay's ref.population.cohort): the
// CLI echoes them as the request spells them, relative to the case
// directory it runs in; the studio engine opens them by workspace path. The CLI must be built from the pinned Pulse commit.
func TestRunMatchesPulseCLI(t *testing.T) {
	cli := os.Getenv("PULSE_CLI")
	if cli == "" {
		t.Skip("set PULSE_CLI to a pulse binary built from the pinned commit")
	}
	f := newPreviewFixture(t)
	synthCohort(t, filepath.Join(showcaseDir(), "ab-test-readout/data/design.synth.json"), filepath.Join(f.dir, "ab/design.pulse"), 2, 1)
	for _, tc := range []struct{ path, verb string }{
		{"ab/req/04_metric_battery.json", "process"},
		{"ab/req/11_readout.compose.json", "compose"},
		{"ab/req/02_srm_gof.facet.json", "facet"},
		{"retail/req/06_spend_distribution_chain.json", "process-chain"},
	} {
		t.Run(tc.verb, func(t *testing.T) {
			_, out := postRun(t, f.srv, nil, map[string]any{"path": tc.path, "request": f.read(t, tc.path)})
			caseDir := filepath.Join(f.dir, filepath.Dir(filepath.Dir(tc.path)))
			cmd := exec.Command(cli, "api", tc.verb, "-r", filepath.Join("req", filepath.Base(tc.path)), "--json")
			cmd.Dir = caseDir
			want, err := cmd.Output()
			if err != nil {
				t.Fatalf("cli: %v", err)
			}
			norm := func(b []byte) any {
				var v any
				mustUnmarshal(t, b, &v)
				stripCohortFile(v)
				return v
			}
			g, _ := json.Marshal(norm([]byte(out["text"].(string))))
			w, _ := json.Marshal(norm(want))
			if !bytes.Equal(g, w) {
				t.Fatalf("differs from CLI\n got: %.600s\nwant: %.600s", g, w)
			}
		})
	}
}

func stripCohortFile(v any) {
	switch x := v.(type) {
	case map[string]any:
		delete(x, "cohort_file")
		if pop, ok := x["population"].(map[string]any); ok {
			delete(pop, "cohort")
		}
		for _, c := range x {
			stripCohortFile(c)
		}
	case []any:
		for _, c := range x {
			stripCohortFile(c)
		}
	}
}

func TestRunSave(t *testing.T) {
	f := newPreviewFixture(t)
	const path = "ab/req/11_readout.compose.json"
	_, out := postRun(t, f.srv, nil, map[string]any{"path": path, "request": f.read(t, path)})
	if out["out_dir"] != "ab/out" || out["out_name"] != "11_readout.json" {
		t.Fatalf("default out = %v / %v", out["out_dir"], out["out_name"])
	}
	id := out["run_id"].(string)
	text := out["text"].(string)

	code, saved := postRunSave(t, f.srv, map[string]any{"run_id": id})
	if code != http.StatusOK || saved["path"] != "ab/out/11_readout.json" || saved["overwritten"] != false {
		t.Fatalf("save %d %v", code, saved)
	}
	disk, err := os.ReadFile(filepath.Join(f.dir, "ab/out/11_readout.json"))
	if err != nil || string(disk) != text {
		t.Fatalf("saved bytes differ (%v)", err)
	}

	// Never overwrites silently.
	if err := os.WriteFile(filepath.Join(f.dir, "ab/out/11_readout.json"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	code, res := postRunSave(t, f.srv, map[string]any{"run_id": id})
	if code != http.StatusConflict || res["error"].(map[string]any)["code"] != "exists" {
		t.Fatalf("want 409 exists, got %d %v", code, res)
	}
	if b, _ := os.ReadFile(filepath.Join(f.dir, "ab/out/11_readout.json")); string(b) != "keep" {
		t.Fatal("refused save changed the file")
	}
	code, res = postRunSave(t, f.srv, map[string]any{"run_id": id, "overwrite": true})
	if code != http.StatusOK || res["overwritten"] != true {
		t.Fatalf("overwrite %d %v", code, res)
	}
	if b, _ := os.ReadFile(filepath.Join(f.dir, "ab/out/11_readout.json")); string(b) != text {
		t.Fatal("overwrite did not write the envelope")
	}

	code, res = postRunSave(t, f.srv, map[string]any{"run_id": id, "name": "11_readout_try2.json"})
	if code != http.StatusOK || res["path"] != "ab/out/11_readout_try2.json" {
		t.Fatalf("named save %d %v", code, res)
	}

	for _, name := range []string{"../escape.json", "sub/x.json", ".hidden.json", "x.txt", "x.layout.json", ".."} {
		code, res := postRunSave(t, f.srv, map[string]any{"run_id": id, "name": name})
		if code != http.StatusBadRequest {
			t.Errorf("name %q: want 400, got %d %v", name, code, res)
		}
	}
	if code, _ := postRunSave(t, f.srv, map[string]any{"run_id": "nope"}); code != http.StatusNotFound {
		t.Errorf("unknown run: %d", code)
	}
	if code, _ := postRunSave(t, f.srv, map[string]any{}); code != http.StatusBadRequest {
		t.Errorf("missing run_id: %d", code)
	}
	entries, _ := os.ReadDir(filepath.Join(f.dir, "ab/out"))
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".tmp" {
			t.Errorf("temp file left: %s", e.Name())
		}
	}
}

func TestRunErrors(t *testing.T) {
	f := newPreviewFixture(t)
	req := f.read(t, "ab/req/04_metric_battery.json")

	if code, _ := postRun(t, f.srv, nil, map[string]any{"request": req}); code != http.StatusBadRequest {
		t.Errorf("missing path: %d", code)
	}
	if code, _ := postRun(t, f.srv, nil, map[string]any{"path": "../x.json", "request": req}); code != http.StatusForbidden {
		t.Errorf("escaping path: %d", code)
	}
	code, out := postRun(t, f.srv, nil, map[string]any{"path": "ab/req/x.json",
		"request": json.RawMessage(`{"cohort": {"filename": "missing.pulse"}, "aggregations": [{"type": "AGG_COUNT", "field": "user_id"}]}`)})
	if code != http.StatusNotFound || out["error"].(map[string]any)["code"] != "cohort_not_found" {
		t.Errorf("missing cohort: %d %v", code, out)
	}

	// An engine refusal is an envelope with errors, like `--json` prints.
	code, out = postRun(t, f.srv, nil, map[string]any{"path": "ab/req/x.json",
		"request": json.RawMessage(`{"cohort": ` + abCohort + `, "aggregations": [{"type": "AGG_AVERAGE", "field": "no_such_field", "label": "m"}]}`)})
	if code != http.StatusOK || out["ok"] != false {
		t.Fatalf("engine error: %d %v", code, out)
	}
	env := envelopeOf(t, out)
	if errs := env["errors"].([]any); len(errs) == 0 || errs[0].(map[string]any)["code"] == "" {
		t.Fatalf("no coded error: %v", env)
	}

	// A cancelled caller gets 499 and no stored run.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	code, out = postRun(t, f.srv, ctx, map[string]any{"path": "ab/req/04_metric_battery.json", "request": req})
	if code != 499 || out["error"].(map[string]any)["code"] != "cancelled" {
		t.Fatalf("cancelled: %d %v", code, out)
	}
}

func TestRunSupersedes(t *testing.T) {
	var rs runState
	first, release1 := rs.start(context.Background(), "c\x00a.json")
	other, release2 := rs.start(context.Background(), "c\x00b.json")
	second, release3 := rs.start(context.Background(), "c\x00a.json")
	defer release2()
	defer release3()
	if first.Err() == nil {
		t.Fatal("newer run of the same client+file did not cancel the older")
	}
	if other.Err() != nil || second.Err() != nil {
		t.Fatal("unrelated runs cancelled")
	}
	release1() // the superseded run's release must not drop the newer one
	rs.mu.Lock()
	_, ok := rs.inflight["c\x00a.json"]
	rs.mu.Unlock()
	if !ok {
		t.Fatal("old release removed the newer in-flight run")
	}
}

// Runs use the case's label tables, as predict and previews do.
func TestRunUsesCaseLabelTables(t *testing.T) {
	const path = "bt/req/02_funnel_by_wave.json"
	s, _, req := newBrandTrackerFixture(t, true)
	code, out := postRun(t, s, nil, map[string]any{"path": path, "request": json.RawMessage(req)})
	if code != http.StatusOK || out["ok"] != true {
		t.Fatalf("with labels: %d ok=%v %.400s", code, out["ok"], out["text"])
	}
	s, _, req = newBrandTrackerFixture(t, false)
	_, out = postRun(t, s, nil, map[string]any{"path": path, "request": json.RawMessage(req)})
	if out["ok"] != false {
		t.Fatal("control: run without labels/ should fail in the envelope")
	}
}

func TestOutPathFor(t *testing.T) {
	for _, tc := range []struct{ in, dir, name string }{
		{"showcase/ab-test-readout/req/11_readout.compose.json", "showcase/ab-test-readout/out", "11_readout.json"},
		{"req/04_metric_battery.json", "out", "04_metric_battery.json"},
		{"req/02_srm_gof.facet.json", "out", "02_srm_gof.json"},
		{"a/b/x.chain.json", "a/b/out", "x.json"},
		{"x.json", "out", "x.json"},
		{"case/req/05_kpi_tracker.JSON", "case/out", "05_kpi_tracker.json"},
		{"analyses/11_readout.compose.json", "out", "11_readout.json"},
		{"analyses/q1/deep/x.facet.json", "out/q1/deep", "x.json"},
	} {
		dir, name := outPathFor(tc.in)
		if dir != tc.dir || name != tc.name {
			t.Errorf("outPathFor(%q) = %q, %q; want %q, %q", tc.in, dir, name, tc.dir, tc.name)
		}
	}
}
