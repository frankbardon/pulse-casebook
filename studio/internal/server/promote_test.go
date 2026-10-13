package server

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// runData runs an analysis file of a workspace as it is on disk and
// returns its result rows (the envelope's data) as JSON.
func runData(t *testing.T, l *Library, ws, path string) string {
	t.Helper()
	text, err := os.ReadFile(filepath.Join(l.Dir(), "workspaces", ws, filepath.FromSlash(path)))
	if err != nil {
		t.Fatal(err)
	}
	code, env := libRun(t, l, ws, path, string(text))
	if code != http.StatusOK || env["data"] == nil {
		t.Fatalf("run %s: %d %s", path, code, stringOf(env))
	}
	// The cohort's path is the one thing that may differ.
	return cohortFileRE.ReplaceAllString(stringOf(env["data"]), `"cohort_file":"…"`)
}

var cohortFileRE = regexp.MustCompile(`"cohort_file":"[^"]*"`)

// previewProbes previews an analysis's cohort node and returns the
// probes as JSON.
func previewProbes(t *testing.T, l *Library, ws, path string) string {
	t.Helper()
	text, _ := os.ReadFile(filepath.Join(l.Dir(), "workspaces", ws, filepath.FromSlash(path)))
	code, out := call(t, l, http.MethodPost, "/api/w/"+ws+"/preview", map[string]any{"path": path, "request": json.RawMessage(text), "node": "cohort"})
	if code != 200 || out["status"] != "ok" {
		t.Fatalf("preview %s: %d %v", path, code, out)
	}
	return stringOf(out["probes"])
}

// Make global end to end on the real engine: an imported cohort (saved
// schema, uploaded source, a second spec sharing both), analyses of
// every reference kind, a name clash answered with a new name, results
// and previews identical before and after, the catalog, both
// repositories, rebuilds from either side, and the workspace that could
// not see the cohort left alone.
func TestPromoteImportedCohort(t *testing.T) {
	l, dir := newLibraryFixture(t, false)
	for _, name := range []string{"Lab", "Other"} {
		if code, out := call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": name}); code != 201 {
			t.Fatalf("create %s: %d %v", name, code, out)
		}
	}
	ws := filepath.Join(dir, "workspaces", "lab")

	// Lab: orders (saved schema "orders") and more (same source, same schema).
	if rec := uploadTo(t, l, "/api/w/lab/sources", "orders.csv", salesCSV(40)); rec.Code != 201 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}
	code, out := call(t, l, http.MethodPost, "/api/w/lab/import", map[string]any{"source": "sources/orders.csv", "target": "orders"})
	if code != 201 {
		t.Fatalf("import: %d %v", code, out)
	}
	schema := out["report"].(map[string]any)["schema"]
	if code, out = call(t, l, http.MethodPost, "/api/w/lab/schemas", map[string]any{"name": "orders", "schema": schema}); code != 201 {
		t.Fatalf("save schema: %d %v", code, out)
	}
	for _, target := range []string{"orders", "more"} {
		if code, out = call(t, l, http.MethodPost, "/api/w/lab/import", map[string]any{"source": "sources/orders.csv", "target": target, "schema": "orders", "overwrite": true}); code != 201 && code != 200 {
			t.Fatalf("import %s with schema: %d %v", target, code, out)
		}
	}
	count := `"aggregations": [{"type": "AGG_COUNT", "field": "order_id", "label": "n"}, {"type": "AGG_SUM", "field": "revenue", "label": "rev"}]`
	analyses := map[string]string{
		// Odd formatting: CRLF, tabs, spacing; only data_dir may change.
		"analyses/odd.json":    "{\r\n\t\"cohort\" :  {\"filename\":\"orders.pulse\" ,\"data_dir\":   \"cohorts\"},\r\n\t" + count + "\r\n}\r\n",
		"analyses/q/join.json": `{"cohort": {"filename": "more.pulse", "data_dir": "cohorts"}, "joins": [{"right": "cohorts/orders.pulse", "kind": "inner", "as": "o_", "on": [{"left_field": "order_id", "right_field": "order_id"}]}], "aggregations": [{"type": "AGG_SUM", "field": "o_revenue", "label": "rev"}]}` + "\n",
		"analyses/both.compose.json": `{"requests": [
  {"label": "o", "cohort": {"filename": "orders.pulse", "data_dir": "cohorts"}, ` + count + `},
  {"label": "m", "cohort": {"filename": "more.pulse", "data_dir": "cohorts"}, ` + count + `}
]}` + "\n",
		"analyses/chain.json": `{"cohort": {"filename": "orders.pulse", "data_dir": "cohorts"}, "stages": [
  {"name": "per_region", "request": {"groups": [{"type": "GROUP_CATEGORY", "field": "region"}], ` + count + `}},
  {"name": "total", "request": {"aggregations": [{"type": "AGG_SUM", "field": "n", "label": "total"}]}}
]}` + "\n",
		"analyses/more.json": `{"cohort": {"filename": "more.pulse", "data_dir": "cohorts"}, ` + count + `}` + "\n",
	}
	for p, text := range analyses {
		abs := filepath.Join(ws, filepath.FromSlash(p))
		_ = os.MkdirAll(filepath.Dir(abs), 0o755)
		if err := os.WriteFile(abs, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	gitOut(t, ws, "add", "-A")
	gitOut(t, ws, "commit", "-q", "-m", "analyses")
	before := map[string]string{}
	for p := range analyses {
		before[p] = runData(t, l, "lab", p)
	}
	previewBefore := previewProbes(t, l, "lab", "analyses/odd.json")

	// Other has its own "orders" (it could never see lab's).
	if rec := uploadTo(t, l, "/api/w/other/sources", "orders.csv", salesCSV(10)); rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/other/import", map[string]any{"source": "sources/orders.csv", "target": "orders"}); code != 201 {
		t.Fatalf("other import: %d %v", code, out)
	}
	otherAnalysis := `{"cohort": {"filename": "orders.pulse", "data_dir": "cohorts"}, ` + count + `}` + "\n"
	_ = os.MkdirAll(filepath.Join(dir, "workspaces/other/analyses"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "workspaces/other/analyses/o.json"), []byte(otherAnalysis), 0o644)
	otherHead := gitOut(t, filepath.Join(dir, "workspaces/other"), "rev-parse", "HEAD")

	// A global "orders" already exists (different data): 409 + a free name.
	if rec := uploadTo(t, l, "/api/w/_global/sources", "orders.csv", salesCSV(5)); rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/_global/import", map[string]any{"source": "sources/orders.csv", "target": "orders"}); code != 201 {
		t.Fatalf("global import: %d %v", code, out)
	}
	req := map[string]any{"workspace": "lab", "kind": "cohort", "name": "orders", "dry_run": true}
	code, out = call(t, l, http.MethodPost, "/api/cohorts/promote", req)
	if d, _ := out["error"].(map[string]any)["details"].(map[string]any); code != 409 || errCode(out) != "name_clash" || d["suggested"] != "orders-2" || d["field"] != "new_name" || d["item"] != "cohort" {
		t.Fatalf("clash: %d %v", code, out)
	}

	// The plan with a new name.
	req["new_name"] = "lab-orders"
	code, plan := call(t, l, http.MethodPost, "/api/cohorts/promote", req)
	if code != 200 || plan["item"].(map[string]any)["ref_path"] != "_global/cohorts/lab-orders.pulse" || plan["schema"].(map[string]any)["global_path"] != "schemas/orders.schema.json" {
		t.Fatalf("plan: %d %v", code, plan)
	}
	if c := plan["counts"].(map[string]any); c["analyses"] != float64(4) {
		t.Fatalf("plan counts: %v", c)
	}
	if s := stringOf(plan["moves"]); !strings.Contains(s, `"from":"workspaces/lab/sources/orders.csv","kind":"source","to":"sources/orders-2.csv"`) {
		t.Fatalf("source move (renamed: the global name is taken by other bytes): %s", s)
	}
	if _, err := os.Stat(filepath.Join(ws, "cohorts/orders.pulse")); err != nil {
		t.Fatal("dry run moved the cohort")
	}

	// Apply.
	delete(req, "dry_run")
	req["plan_id"] = plan["plan_id"]
	code, res := call(t, l, http.MethodPost, "/api/cohorts/promote", req)
	if code != 200 {
		t.Fatalf("promote: %d %v", code, res)
	}
	commits := res["commits"].(map[string]any)
	if commits["workspace"] == nil || commits["global"] == nil {
		t.Fatalf("commits: %v", commits)
	}
	odd, _ := os.ReadFile(filepath.Join(ws, "analyses/odd.json"))
	if want := strings.Replace(analyses["analyses/odd.json"], `"orders.pulse" ,"data_dir":   "cohorts"`, `"lab-orders.pulse" ,"data_dir":   "_global/cohorts"`, 1); string(odd) != want {
		t.Fatalf("odd analysis:\n%q\nwant\n%q", odd, want)
	}
	if got, _ := os.ReadFile(filepath.Join(ws, "analyses/more.json")); string(got) != analyses["analyses/more.json"] {
		t.Fatal("an analysis of another cohort changed")
	}
	if got, _ := os.ReadFile(filepath.Join(ws, "analyses/q/join.json")); !strings.Contains(string(got), `"right": "_global/cohorts/lab-orders.pulse"`) {
		t.Fatalf("join: %s", got)
	}
	for p, want := range before {
		if got := runData(t, l, "lab", p); got != want {
			t.Errorf("%s result changed:\n%s\n%s", p, want, got)
		}
	}
	if got := previewProbes(t, l, "lab", "analyses/odd.json"); got != previewBefore {
		t.Errorf("preview changed:\n%s\n%s", previewBefore, got)
	}

	// The catalog: global now, gone from the workspace.
	_, cat := call(t, l, http.MethodGet, "/api/cohorts", nil)
	var global, local bool
	for _, c := range cat["cohorts"].([]any) {
		m := c.(map[string]any)
		if m["ref_path"] == "_global/cohorts/lab-orders.pulse" && m["scope"] == "global" && m["spec"] == "imports/lab-orders.import.json" {
			global = true
		}
		if m["workspace"] == "lab" && m["name"] == "orders" {
			local = true
		}
	}
	if !global || local {
		t.Fatalf("catalog: %s", stringOf(cat["cohorts"]))
	}
	if s := stringOf(cat["schemas"]); !strings.Contains(s, `"ref_path":"_global/schemas/orders.schema.json"`) || strings.Contains(s, `"workspace":"lab"`) {
		t.Fatalf("schemas: %s", s)
	}

	// Repositories: removals + rewrites in the workspace, additions in the global one.
	if msg := gitOut(t, ws, "log", "-1", "--format=%s"); msg != "studio: make cohort cohorts/orders.pulse global as cohorts/lab-orders.pulse" {
		t.Errorf("workspace commit: %q", msg)
	}
	if msg := gitOut(t, dir, "log", "-1", "--format=%s"); msg != "studio: make cohort cohorts/lab-orders.pulse global (from workspace lab)" {
		t.Errorf("global commit: %q", msg)
	}
	if st := gitOut(t, ws, "status", "--porcelain"); st != "" {
		t.Errorf("workspace status: %q", st)
	}
	if st := gitOut(t, dir, "status", "--porcelain"); st != "" {
		t.Errorf("global status: %q", st)
	}
	if files := gitOut(t, dir, "ls-files"); !strings.Contains(files, "imports/lab-orders.import.json") || !strings.Contains(files, "schemas/orders.schema.json") || strings.Contains(files, ".pulse\n") || strings.Contains(files, "sources/") {
		t.Errorf("global files: %s", files)
	}

	// Rebuilds: the global cohort from its moved spec, the workspace's
	// other cohort from the global source and schema it now names.
	if code, out = call(t, l, http.MethodPost, "/api/w/_global/import/rebuild", map[string]any{"spec": "imports/lab-orders.import.json"}); code != 200 || out["schema_changed"] == true {
		t.Errorf("global rebuild: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/lab/import/rebuild", map[string]any{"spec": "imports/more.import.json"}); code != 200 || out["schema_changed"] == true {
		t.Errorf("workspace rebuild through _global: %d %v", code, out)
	}
	if got := runData(t, l, "lab", "analyses/odd.json"); got != before["analyses/odd.json"] {
		t.Errorf("after rebuild: %s", got)
	}

	// The other workspace is untouched.
	if got, _ := os.ReadFile(filepath.Join(dir, "workspaces/other/analyses/o.json")); string(got) != otherAnalysis {
		t.Error("other workspace's analysis changed")
	}
	if gitOut(t, filepath.Join(dir, "workspaces/other"), "rev-parse", "HEAD") != otherHead {
		t.Error("other workspace's repository moved")
	}
	if _, err := os.Stat(filepath.Join(dir, "workspaces/other/cohorts/orders.pulse")); err != nil {
		t.Error("other workspace's cohort moved")
	}

	// No way back, and nothing left to promote.
	for _, c := range []struct {
		body      map[string]any
		code      int
		errorCode string
	}{
		{map[string]any{"workspace": "lab", "kind": "cohort", "name": "_global/cohorts/lab-orders.pulse"}, 400, "not_promotable"},
		{map[string]any{"workspace": "lab", "kind": "cohort", "name": "orders"}, 404, "not_found"},
		{map[string]any{"workspace": "nope", "kind": "cohort", "name": "orders"}, 404, "workspace_not_found"},
		{map[string]any{"workspace": "lab", "kind": "analysis", "name": "x"}, 400, "invalid_kind"},
		{map[string]any{"kind": "cohort", "name": "x"}, 400, "missing_workspace"},
		{map[string]any{"workspace": "lab", "kind": "cohort", "name": "more", "plan_id": "0000000000000000"}, 409, "plan_changed"},
	} {
		if code, out := call(t, l, http.MethodPost, "/api/cohorts/promote", c.body); code != c.code || errCode(out) != c.errorCode {
			t.Errorf("%v: %d %v", c.body, code, out)
		}
	}
}

// A local shard archive (anchors in analyses) and a schema promoted on
// its own.
func TestPromoteShardArchiveAndSchema(t *testing.T) {
	l, dir := newLibraryFixture(t, false)
	if code, out := call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "Lab"}); code != 201 {
		t.Fatalf("create: %d %v", code, out)
	}
	ws := filepath.Join(dir, "workspaces", "lab")
	spec := filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json")
	synthCohort(t, spec, filepath.Join(ws, "cohorts/s1.pulse"), 60, 6)
	synthCohort(t, spec, filepath.Join(ws, "cohorts/s2.pulse"), 40, 7)
	area, err := l.area("lab")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := area.engine.CreateShardArchive(context.Background(), "cohorts/arch.pulse", []string{"cohorts/s1.pulse", "cohorts/s2.pulse"}); err != nil {
		t.Fatal(err)
	}
	count := `"aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "n"}]`
	files := map[string]string{
		"analyses/all.json":    `{"cohort": {"filename": "arch.pulse", "data_dir": "cohorts"}, ` + count + "}\n",
		"analyses/anchor.json": `{"cohort": {"filename": "arch.pulse#s2.pulse", "data_dir": "cohorts"}, ` + count + "}\n",
	}
	for p, text := range files {
		if err := os.WriteFile(filepath.Join(ws, filepath.FromSlash(p)), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want := map[string]string{}
	for p := range files {
		want[p] = runData(t, l, "lab", p)
	}
	if !strings.Contains(want["analyses/anchor.json"], `"n":40`) {
		t.Fatalf("anchor before: %s", want["analyses/anchor.json"])
	}
	code, out := call(t, l, http.MethodPost, "/api/cohorts/promote", map[string]any{"workspace": "lab", "kind": "cohort", "name": "cohorts/arch.pulse"})
	if code != 200 {
		t.Fatalf("promote archive: %d %v", code, out)
	}
	if got, _ := os.ReadFile(filepath.Join(ws, "analyses/anchor.json")); string(got) != strings.Replace(files["analyses/anchor.json"], `"data_dir": "cohorts"`, `"data_dir": "_global/cohorts"`, 1) {
		t.Fatalf("anchor ref: %s", got)
	}
	for p, w := range want {
		if got := runData(t, l, "lab", p); got != w {
			t.Errorf("%s: %s, want %s", p, got, w)
		}
	}

	// A schema alone; an identical global one is merged, a different one clashes.
	schema := `[{"name": "a", "type": "u32"}]`
	if code, out = call(t, l, http.MethodPost, "/api/w/lab/schemas", map[string]any{"name": "people", "schema": json.RawMessage(schema)}); code != 201 {
		t.Fatalf("save schema: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/_global/schemas", map[string]any{"name": "people", "schema": json.RawMessage(`[{"name": "b", "type": "u32"}]`)}); code != 201 {
		t.Fatalf("save global schema: %d %v", code, out)
	}
	code, out = call(t, l, http.MethodPost, "/api/cohorts/promote", map[string]any{"workspace": "lab", "kind": "schema", "name": "people"})
	if code != 409 || errCode(out) != "name_clash" {
		t.Fatalf("schema clash: %d %v", code, out)
	}
	code, out = call(t, l, http.MethodPost, "/api/cohorts/promote", map[string]any{"workspace": "lab", "kind": "schema", "name": "people", "new_name": "people-lab"})
	if code != 200 || out["item"].(map[string]any)["ref_path"] != "_global/schemas/people-lab.schema.json" {
		t.Fatalf("schema promote: %d %v", code, out)
	}
	if msg := gitOut(t, dir, "log", "-1", "--format=%s"); msg != "studio: make schema schemas/people-lab.schema.json global (from workspace lab)" {
		t.Errorf("global commit: %q", msg)
	}
	if msg := gitOut(t, ws, "log", "-1", "--format=%s"); msg != "studio: make schema schemas/people.schema.json global as schemas/people-lab.schema.json" {
		t.Errorf("workspace commit: %q", msg)
	}
}
