package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A workspace imports with a GLOBAL saved schema: schema listing and
// match ranking cover both scopes (labelled), predict and import accept
// "_global/schemas/<name>.schema.json", the spec records that path and
// rebuild follows it.
func TestWorkspaceImportWithGlobalSchema(t *testing.T) {
	l, dir := newLibraryFixture(t, false)
	if code, out := call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "Lab"}); code != 201 {
		t.Fatalf("create: %d %v", code, out)
	}
	if rec := uploadTo(t, l, "/api/w/_global/sources", "orders.csv", salesCSV(20)); rec.Code != 201 {
		t.Fatalf("global upload: %d %s", rec.Code, rec.Body.String())
	}
	code, out := call(t, l, http.MethodPost, "/api/w/_global/import/predict", map[string]any{"source": "sources/orders.csv"})
	if code != 200 {
		t.Fatalf("predict: %d %v", code, out)
	}
	schema := out["schema"]
	if code, out = call(t, l, http.MethodPost, "/api/w/_global/schemas", map[string]any{"name": "orders", "schema": schema}); code != 201 {
		t.Fatalf("save global schema: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/lab/schemas", map[string]any{"name": "local_one", "schema": json.RawMessage(`[{"name": "x", "type": "u32", "description": "", "nullable": false}]`)}); code != 201 {
		t.Fatalf("save local schema: %d %v", code, out)
	}

	// Listing: local first, then global (path through the mount).
	_, out = call(t, l, http.MethodGet, "/api/w/lab/schemas", nil)
	list := out["schemas"].([]any)
	if len(list) != 2 || list[0].(map[string]any)["scope"] != "local" || list[1].(map[string]any)["path"] != "_global/schemas/orders.schema.json" || list[1].(map[string]any)["scope"] != "global" {
		t.Fatalf("workspace schemas: %v", list)
	}
	_, out = call(t, l, http.MethodGet, "/api/w/_global/schemas", nil)
	if g := out["schemas"].([]any); len(g) != 1 || g[0].(map[string]any)["scope"] != "global" || g[0].(map[string]any)["path"] != "schemas/orders.schema.json" {
		t.Fatalf("global schemas: %v", g)
	}

	// Predict in the workspace ranks the global schema (exact).
	if rec := uploadTo(t, l, "/api/w/lab/sources", "orders.csv", salesCSV(30)); rec.Code != 201 {
		t.Fatalf("lab upload: %d %s", rec.Code, rec.Body.String())
	}
	code, out = call(t, l, http.MethodPost, "/api/w/lab/import/predict", map[string]any{"source": "sources/orders.csv"})
	matches, _ := out["matches"].([]any)
	if code != 200 || len(matches) == 0 {
		t.Fatalf("lab predict: %d %v", code, out)
	}
	m := matches[0].(map[string]any)
	if m["exact"] != true || m["scope"] != "global" || m["path"] != "_global/schemas/orders.schema.json" {
		t.Fatalf("match: %v", m)
	}
	ref := "_global/schemas/orders.schema.json"
	code, out = call(t, l, http.MethodPost, "/api/w/lab/import/predict", map[string]any{"source": "sources/orders.csv", "schema": ref})
	if code != 200 || out["valid"] != true {
		t.Fatalf("predict with global schema: %d %v", code, out)
	}
	code, out = call(t, l, http.MethodPost, "/api/w/lab/import", map[string]any{"source": "sources/orders.csv", "schema": ref, "target": "orders"})
	if code != 201 {
		t.Fatalf("import with global schema: %d %v", code, out)
	}
	spec := out["spec_doc"].(map[string]any)["schema"].(map[string]any)
	if spec["ref"] != "orders" || spec["path"] != ref {
		t.Fatalf("spec schema: %v", spec)
	}
	ws := filepath.Join(dir, "workspaces", "lab")
	if b, err := os.ReadFile(filepath.Join(ws, "imports", "orders.import.json")); err != nil || !strings.Contains(string(b), `"path": "_global/schemas/orders.schema.json"`) {
		t.Fatalf("spec file: %s %v", b, err)
	}
	if _, err := os.Stat(filepath.Join(ws, "schemas", "orders.schema.json")); err == nil {
		t.Fatal("a local copy of the global schema was written")
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/lab/import/rebuild", map[string]any{"spec": "imports/orders.import.json"}); code != 200 {
		t.Fatalf("rebuild: %d %v", code, out)
	}

	// Refusals: a bad global path; the global area itself has no mount.
	for _, bad := range []string{"_global/schemas/../x.schema.json", "_global/schemas/nope.schema.json", "_global/orders"} {
		if code, _ := call(t, l, http.MethodPost, "/api/w/lab/import/predict", map[string]any{"source": "sources/orders.csv", "schema": bad}); code == 200 {
			t.Errorf("predict with %q accepted", bad)
		}
	}
	if code, _ := call(t, l, http.MethodPost, "/api/w/_global/import/predict", map[string]any{"source": "sources/orders.csv", "schema": ref}); code == 200 {
		t.Error("global area accepted a _global/ schema path")
	}
}

// Analyses are never created in the global area: not through its own
// URL, not as a "_global/..." path through a workspace's.
func TestNoAnalysesInGlobalArea(t *testing.T) {
	l, dir := newLibraryFixture(t, true)
	if code, out := call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "Lab"}); code != 201 {
		t.Fatalf("create: %d %v", code, out)
	}
	synthCohort(t, filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json"), filepath.Join(dir, "cohorts", "ab.pulse"), 10, 1)
	cases := []struct{ target, path, cohort string }{
		{"/api/w/_global/file/new", "analyses/a.json", "cohorts/ab.pulse"},
		{"/api/w/_global/file/new", "a.json", "cohorts/ab.pulse"},
		{"/api/w/lab/file/new", "_global/a.json", "_global/cohorts/ab.pulse"},
	}
	for _, c := range cases {
		code, out := call(t, l, http.MethodPost, c.target, map[string]any{"path": c.path, "mode": "standalone", "cohort": c.cohort})
		if code != http.StatusForbidden || errCode(out) != "global_area" {
			t.Errorf("%s %s: %d %v", c.target, c.path, code, out)
		}
	}
	analysis := map[string]any{"cohort": map[string]any{"filename": "ab.pulse", "data_dir": "cohorts"}}
	for _, target := range []string{"/api/w/_global/file?path=a.json", "/api/w/lab/file?path=_global/a.json"} {
		if code, out := call(t, l, http.MethodPut, target, analysis); code != http.StatusForbidden || errCode(out) != "global_area" {
			t.Errorf("PUT %s: %d %v", target, code, out)
		}
	}
	// Other JSON still saves in the global area; analyses save in a workspace.
	if code, out := call(t, l, http.MethodPut, "/api/w/_global/file?path=notes.json", map[string]any{"a": 1}); code != 200 {
		t.Errorf("global notes: %d %v", code, out)
	}
	if code, out := call(t, l, http.MethodPost, "/api/w/lab/file/new", map[string]any{"path": "analyses/a.json", "mode": "standalone", "cohort": "_global/cohorts/ab.pulse"}); code != 201 {
		t.Errorf("workspace analysis: %d %v", code, out)
	}
	if _, err := os.Stat(filepath.Join(dir, "a.json")); err == nil {
		t.Error("an analysis was written to the global area")
	}
}
