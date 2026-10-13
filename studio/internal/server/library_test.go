package server

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/frankbardon/pulse-casebook/studio/internal/library"
)

// call sends a JSON request to h and decodes the JSON response.
func call(t *testing.T, h http.Handler, method, target string, body any) (int, map[string]any) {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		rd = bytes.NewReader(raw)
	} else {
		rd = bytes.NewReader(nil)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, target, rd))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s %s: decode %q: %v", method, target, rec.Body.String(), err)
	}
	return rec.Code, out
}

// libRun runs a request text through /api/w/<ws>/run and returns the
// first data row's value of label (or the whole envelope on failure).
func libRun(t *testing.T, h http.Handler, ws, path, request string) (int, map[string]any) {
	t.Helper()
	code, out := call(t, h, http.MethodPost, "/api/w/"+ws+"/run", map[string]any{"path": path, "request": json.RawMessage(request)})
	if code != http.StatusOK {
		return code, out
	}
	var env map[string]any
	if err := json.Unmarshal([]byte(out["text"].(string)), &env); err != nil {
		t.Fatalf("run envelope: %v", err)
	}
	return code, env
}

func dataValue(env map[string]any, label string) any {
	resp, _ := env["data"].(map[string]any)
	data, _ := resp["data"].([]any)
	if len(data) == 0 {
		return nil
	}
	row, _ := data[0].(map[string]any)
	return row[label]
}

func newLibraryFixture(t *testing.T, noGit bool) (*Library, string) {
	t.Helper()
	dir := t.TempDir()
	if !noGit {
		isolateGit(t, dir)
	}
	lib, err := library.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	l, err := NewLibrary(context.Background(), lib, LibraryOptions{NoGit: noGit, Logf: t.Logf, Now: func() time.Time { return time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC) }}, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	return l, lib.Dir()
}

// The library layout end to end: workspaces, the _global/ mount in every
// path guard and in the engine (cohort refs, a shard archive and its
// anchors, a join's right side, compose slots and fits, chains,
// previews), repositories per area, imports per scope, the cohorts
// catalog and the compatibility routes.
func TestLibraryWorkspacesAndGlobalCohorts(t *testing.T) {
	l, dir := newLibraryFixture(t, false)
	spec := filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json")

	code, out := call(t, l, http.MethodGet, "/api/library", nil)
	if code != 200 || out["mode"] != "library" || len(out["workspaces"].([]any)) != 0 {
		t.Fatalf("library: %d %v", code, out)
	}
	if g := out["git"].(map[string]any); g["enabled"] != true || g["initialized"] != true {
		t.Fatalf("global git: %v", g)
	}
	if code, out = call(t, l, http.MethodGet, "/api/files", nil); code != 404 || errCode(out) != "no_workspace" {
		t.Fatalf("compat with no workspace: %d %v", code, out)
	}
	if got := gitOut(t, dir, "ls-files"); !strings.Contains(got, "library.json") || !strings.Contains(got, ".gitignore") {
		t.Fatalf("global repo files: %q", got)
	}

	// Workspaces: slug from the name, deduplicated; each its own repo.
	code, out = call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "Sales Q1", "description": "first"})
	if code != 201 || out["workspace"].(map[string]any)["slug"] != "sales-q1" {
		t.Fatalf("create: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "Sales Q1"}); code != 201 || out["workspace"].(map[string]any)["slug"] != "sales-q1-2" {
		t.Fatalf("create dup: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "  "}); code != 400 || errCode(out) != "invalid_name" {
		t.Fatalf("create blank: %d %v", code, out)
	}
	ws := filepath.Join(dir, "workspaces", "sales-q1")
	if top := gitOut(t, ws, "rev-parse", "--show-toplevel"); top != ws {
		t.Fatalf("workspace repo top = %s", top)
	}
	if got := gitOut(t, ws, "ls-files"); !strings.Contains(got, "workspace.json") {
		t.Fatalf("workspace repo files: %q", got)
	}
	if st := gitOut(t, dir, "status", "--porcelain", "--untracked-files=all"); st != "" {
		t.Fatalf("global repo sees workspaces: %q", st)
	}

	// Cohorts: global (plain + a shard archive) and local.
	synthCohort(t, spec, filepath.Join(dir, "cohorts/ab.pulse"), 100, 5)
	synthCohort(t, spec, filepath.Join(dir, "cohorts/s1.pulse"), 60, 6)
	synthCohort(t, spec, filepath.Join(dir, "cohorts/s2.pulse"), 40, 7)
	if _, err := l.base.engine.CreateShardArchive(context.Background(), "cohorts/arch.pulse", []string{"cohorts/s1.pulse", "cohorts/s2.pulse"}); err != nil {
		t.Fatal(err)
	}
	synthCohort(t, spec, filepath.Join(ws, "cohorts/local.pulse"), 30, 8)

	// The catalog: global first, local tagged with the workspace.
	code, out = call(t, l, http.MethodGet, "/api/cohorts", nil)
	if code != 200 {
		t.Fatalf("cohorts: %d %v", code, out)
	}
	byRef := map[string]map[string]any{}
	for _, c := range out["cohorts"].([]any) {
		m := c.(map[string]any)
		byRef[m["ref_path"].(string)] = m
	}
	if g := byRef["_global/cohorts/ab.pulse"]; g == nil || g["scope"] != "global" || g["path"] != "cohorts/ab.pulse" ||
		stringOf(g["ref"]) != `{"data_dir":"_global/cohorts","filename":"ab.pulse"}` {
		t.Fatalf("global cohort entry: %v", g)
	}
	if lc := byRef["cohorts/local.pulse"]; lc == nil || lc["scope"] != "local" || lc["workspace"] != "sales-q1" ||
		stringOf(lc["ref"]) != `{"data_dir":"cohorts","filename":"local.pulse"}` {
		t.Fatalf("local cohort entry: %v", lc)
	}

	// The workspace listing shows its own files plus the global cohorts.
	code, out = call(t, l, http.MethodGet, "/api/w/sales-q1/files", nil)
	files := map[string]map[string]any{}
	for _, f := range out["files"].([]any) {
		m := f.(map[string]any)
		files[m["path"].(string)] = m
	}
	if code != 200 || files["_global/cohorts/ab.pulse"]["scope"] != "global" || files["cohorts/local.pulse"] == nil || files["workspace.json"] == nil {
		t.Fatalf("workspace files: %d %v", code, files)
	}
	// The global area never lists the workspaces.
	_, out = call(t, l, http.MethodGet, "/api/w/_global/files", nil)
	if s := stringOf(out); strings.Contains(s, "workspaces/") || !strings.Contains(s, "cohorts/arch.pulse") {
		t.Fatalf("global files: %s", s)
	}

	// Inspect through the mount, including a shard anchor; the guards.
	for _, p := range []string{"_global/cohorts/ab.pulse", "_global/cohorts/arch.pulse#s1.pulse", "cohorts/local.pulse"} {
		if code, out := call(t, l, http.MethodGet, "/api/w/sales-q1/cohort/inspect?path="+url.QueryEscape(p), nil); code != 200 {
			t.Errorf("inspect %s: %d %v", p, code, out)
		}
	}
	for _, p := range []string{"_global/workspaces/sales-q1/cohorts/local.pulse", "../../cohorts/ab.pulse", "cohorts/../../../cohorts/ab.pulse"} {
		if code, out := call(t, l, http.MethodGet, "/api/w/sales-q1/cohort/inspect?path="+url.QueryEscape(p), nil); code != 403 {
			t.Errorf("inspect %s: %d %v, want 403", p, code, out)
		}
	}
	// A symlink out of the workspace into the global area is refused.
	if err := os.Symlink(filepath.Join(dir, "cohorts"), filepath.Join(ws, "sneaky")); err != nil {
		t.Fatal(err)
	}
	if code, out := call(t, l, http.MethodGet, "/api/w/sales-q1/cohort/inspect?path=sneaky/ab.pulse", nil); code != 403 {
		t.Errorf("symlinked escape: %d %v", code, out)
	}

	// New analyses: mode + cohort ref per scope; folders under analyses/.
	code, out = call(t, l, http.MethodPost, "/api/w/sales-q1/file/new", map[string]any{"path": "analyses/q/global.json", "mode": "standalone", "cohort": "_global/cohorts/ab.pulse"})
	if code != 201 || stringOf(out["cohort"]) != `{"data_dir":"_global/cohorts","filename":"ab.pulse"}` || out["predict"].(map[string]any)["valid"] != true || out["kind"] != "request" {
		t.Fatalf("new global analysis: %d %v", code, out)
	}
	code, out = call(t, l, http.MethodPost, "/api/w/sales-q1/file/new", map[string]any{"path": "analyses/local.compose.json", "mode": "composed", "cohort": "cohorts/local.pulse"})
	if code != 201 || stringOf(out["cohort"]) != `{"data_dir":"cohorts","filename":"local.pulse"}` || out["kind"] != "compose" {
		t.Fatalf("new local analysis: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/sales-q1/file/new", map[string]any{"path": "analyses/x.json", "mode": "sideways", "cohort": "cohorts/local.pulse"}); code != 400 || errCode(out) != "invalid_mode" {
		t.Fatalf("bad mode: %d %v", code, out)
	}
	if log := gitOut(t, ws, "log", "--format=%s", "--", "analyses/q/global.json"); log != "studio: create analyses/q/global.json" {
		t.Fatalf("analysis commit: %q", log)
	}

	// Runs: Pulse resolves data_dir "_global/cohorts" (and shard archives,
	// anchors, joins' right side, compose slots, fits, chains) on the
	// workspace's routing filesystem.
	count := `"aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "n"}]`
	runs := []struct {
		name, path, req string
		want            float64
	}{
		{"global", "analyses/a.json", `{"cohort": {"filename": "ab.pulse", "data_dir": "_global/cohorts"}, ` + count + `}`, 100},
		{"local", "analyses/a.json", `{"cohort": {"filename": "local.pulse", "data_dir": "cohorts"}, ` + count + `}`, 30},
		{"archive", "analyses/a.json", `{"cohort": {"filename": "arch.pulse", "data_dir": "_global/cohorts"}, ` + count + `}`, 100},
		{"anchor", "analyses/a.json", `{"cohort": {"filename": "arch.pulse#s2.pulse", "data_dir": "_global/cohorts"}, ` + count + `}`, 40},
		{"join right global", "analyses/a.json", `{"cohort": {"filename": "local.pulse", "data_dir": "cohorts"}, "joins": [{"right": "_global/cohorts/ab.pulse", "kind": "inner", "as": "g_", "on": [{"left_field": "user_id", "right_field": "user_id"}]}], ` + count + `}`, 30},
	}
	for _, r := range runs {
		code, env := libRun(t, l, "sales-q1", r.path, r.req)
		if code != 200 {
			t.Errorf("run %s: %d %v", r.name, code, env)
			continue
		}
		if dataValue(env, "n") != r.want {
			t.Errorf("run %s: n = %v, want %v (%v)", r.name, dataValue(env, "n"), r.want, env)
		}
	}
	compose := `{"requests": [
		{"label": "g", "cohort": {"filename": "ab.pulse", "data_dir": "_global/cohorts"}, ` + count + `},
		{"label": "l", "cohort": {"filename": "local.pulse", "data_dir": "cohorts"}, ` + count + `}],
	 "fits": [{"name": "m", "request": {"cohort": {"filename": "arch.pulse", "data_dir": "_global/cohorts"}, "regressions": [{"type": "REG_OLS", "name": "m", "target": "pages_viewed", "predictors": ["prior_sessions"]}]}}]}`
	code, env := libRun(t, l, "sales-q1", "analyses/c.compose.json", compose)
	if code != 200 || !strings.Contains(stringOf(env), `"n":100`) || !strings.Contains(stringOf(env), `"n":30`) || !strings.Contains(stringOf(env), `"fits"`) {
		t.Fatalf("compose run: %d %s", code, stringOf(env))
	}
	chain := `{"cohort": {"filename": "ab.pulse", "data_dir": "_global/cohorts"}, "stages": [
		{"name": "per_arm", "request": {"groups": [{"type": "GROUP_CATEGORY", "field": "arm"}], ` + count + `}},
		{"name": "total", "request": {"aggregations": [{"type": "AGG_SUM", "field": "n", "label": "total"}]}}]}`
	code, env = libRun(t, l, "sales-q1", "analyses/ch.json", chain)
	if code != 200 || !strings.Contains(stringOf(env), `"total":100`) {
		t.Fatalf("chain run: %d %s", code, stringOf(env))
	}
	// One workspace cannot reach another through the global mount.
	code, env = libRun(t, l, "sales-q1", "analyses/a.json", `{"cohort": {"filename": "local.pulse", "data_dir": "_global/workspaces/sales-q1/cohorts"}, `+count+`}`)
	if code == 200 && dataValue(env, "n") != nil {
		t.Fatalf("run through _global/workspaces succeeded: %v", env)
	}

	// Preview of a global cohort node.
	code, out = call(t, l, http.MethodPost, "/api/w/sales-q1/preview", map[string]any{"path": "analyses/q/global.json", "request": json.RawMessage(runs[0].req), "node": "cohort"})
	if code != 200 || out["status"] != "ok" || !strings.Contains(stringOf(out["probes"]), `"total":100`) {
		t.Fatalf("preview: %d %v", code, out)
	}

	// Writes commit to the repository owning the path.
	rec := httptest.NewRecorder()
	l.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/w/sales-q1/file?path=_global/notes.json", strings.NewReader(`{"note": "hi"}`)))
	if rec.Code != 200 {
		t.Fatalf("save global file: %d %s", rec.Code, rec.Body.String())
	}
	if log := gitOut(t, dir, "log", "--format=%s", "--", "notes.json"); log != "studio: save _global/notes.json" {
		t.Fatalf("global commit: %q", log)
	}
	if log := gitOut(t, ws, "log", "--format=%s"); strings.Contains(log, "notes.json") {
		t.Fatalf("workspace repo got the global commit: %q", log)
	}
	code, out = call(t, l, http.MethodGet, "/api/w/sales-q1/history?path=_global/notes.json", nil)
	if code != 200 || len(out["commits"].([]any)) != 1 {
		t.Fatalf("global history via workspace: %d %v", code, out)
	}
	code, out = call(t, l, http.MethodGet, "/api/w/sales-q1/status", nil)
	if code != 200 || out["global_git"].(map[string]any)["enabled"] != true || out["git"].(map[string]any)["enabled"] != true {
		t.Fatalf("status: %d %v", code, out)
	}

	// Imports per scope: local into the workspace, global through _global.
	csvData := salesCSV(20)
	for _, area := range []string{"sales-q1", "_global"} {
		rec := uploadTo(t, l, "/api/w/"+area+"/sources", "orders.csv", csvData)
		if rec.Code != 201 {
			t.Fatalf("upload %s: %d %s", area, rec.Code, rec.Body.String())
		}
		code, out := call(t, l, http.MethodPost, "/api/w/"+area+"/import", map[string]any{"source": "sources/orders.csv", "target": "orders"})
		if code != 201 || out["target"] != "cohorts/orders.pulse" || out["spec"] != "imports/orders.import.json" {
			t.Fatalf("import %s: %d %v", area, code, out)
		}
	}
	for _, p := range []string{filepath.Join(ws, "cohorts/orders.pulse"), filepath.Join(dir, "cohorts/orders.pulse")} {
		if _, err := os.Stat(p); err != nil {
			t.Errorf("imported cohort missing: %v", err)
		}
	}
	if log := gitOut(t, ws, "log", "--format=%s", "--", "imports/orders.import.json"); log != "studio: import cohorts/orders.pulse" {
		t.Fatalf("local import commit: %q", log)
	}
	if log := gitOut(t, dir, "log", "--format=%s", "--", "imports/orders.import.json"); log != "studio: import cohorts/orders.pulse" {
		t.Fatalf("global import commit: %q", log)
	}
	if code, out = call(t, l, http.MethodPost, "/api/w/sales-q1/import", map[string]any{"source": "sources/orders.csv", "target": "_global/cohorts/x.pulse"}); code != 400 || errCode(out) != "invalid_target" {
		t.Fatalf("cross-area import: %d %v", code, out)
	}

	// Rename / describe: workspace.json edited in place and committed.
	code, out = call(t, l, http.MethodPatch, "/api/workspaces/sales-q1", map[string]any{"name": "Sales 2026", "description": ""})
	if code != 200 || out["workspace"].(map[string]any)["name"] != "Sales 2026" || out["workspace"].(map[string]any)["slug"] != "sales-q1" {
		t.Fatalf("rename: %d %v", code, out)
	}
	meta, _ := os.ReadFile(filepath.Join(ws, "workspace.json"))
	if string(meta) != "{\n  \"name\": \"Sales 2026\",\n  \"created\": \"2026-10-13T09:00:00Z\"\n}\n" {
		t.Fatalf("workspace.json: %q", meta)
	}
	if log := gitOut(t, ws, "log", "-1", "--format=%s"); log != "studio: update workspace.json" {
		t.Fatalf("rename commit: %q", log)
	}
	if code, out = call(t, l, http.MethodPatch, "/api/workspaces/nope", map[string]any{"name": "x"}); code != 404 || errCode(out) != "workspace_not_found" {
		t.Fatalf("rename missing: %d %v", code, out)
	}
	_, out = call(t, l, http.MethodGet, "/api/workspaces", nil)
	if names := stringOf(out); !strings.Contains(names, `"Sales 2026"`) || !strings.Contains(names, `"sales-q1-2"`) {
		t.Fatalf("workspaces: %s", names)
	}

	// Compatibility: flat paths are the first workspace's.
	_, flat := call(t, l, http.MethodGet, "/api/files", nil)
	_, scoped := call(t, l, http.MethodGet, "/api/w/sales-q1/files", nil)
	if stringOf(flat) != stringOf(scoped) {
		t.Fatalf("compat files differ")
	}
	if code, out = call(t, l, http.MethodGet, "/api/w/nope/files", nil); code != 404 || errCode(out) != "workspace_not_found" {
		t.Fatalf("unknown workspace: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodGet, "/api/health", nil); code != 200 || out["mode"] != "library" || out["pulse_version"] == nil {
		t.Fatalf("health: %d %v", code, out)
	}
	if code, _ = call(t, l, http.MethodGet, "/api/catalog", nil); code != 200 {
		t.Fatalf("catalog: %d", code)
	}
}

func uploadTo(t *testing.T, h http.Handler, target, name, content string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := newMultipart(&buf, name, content)
	req := httptest.NewRequest(http.MethodPost, target, &buf)
	req.Header.Set("Content-Type", mw)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// A pre-library flat folder is served in place as its one workspace,
// untouched (no library.json), with the flat routes as before.
func TestLibraryLegacyFolder(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(showcaseDir(), "ab-test-readout/data/ab_test.synth.json")
	if err := os.MkdirAll(filepath.Join(dir, "req"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "req", "a.json"), []byte(`{"cohort": {"filename": "ab.pulse", "data_dir": "."}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	synthCohort(t, spec, filepath.Join(dir, "ab.pulse"), 10, 1)
	lib, err := library.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !lib.Legacy() {
		t.Fatal("not detected as legacy")
	}
	if _, err := os.Stat(filepath.Join(lib.Dir(), library.MarkerFile)); err == nil {
		t.Fatal("legacy folder got library.json")
	}
	l, err := NewLibrary(context.Background(), lib, LibraryOptions{NoGit: true, Logf: t.Logf}, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	slug := library.Slugify(filepath.Base(lib.Dir()))
	code, out := call(t, l, http.MethodGet, "/api/library", nil)
	wss := out["workspaces"].([]any)
	if code != 200 || out["mode"] != "legacy" || len(wss) != 1 || wss[0].(map[string]any)["legacy"] != true || out["default"] != slug {
		t.Fatalf("library: %d %v", code, out)
	}
	_, flat := call(t, l, http.MethodGet, "/api/files", nil)
	_, scoped := call(t, l, http.MethodGet, "/api/w/"+slug+"/files", nil)
	if stringOf(flat) != stringOf(scoped) || !strings.Contains(stringOf(flat), `"req/a.json"`) {
		t.Fatalf("legacy files: %s vs %s", stringOf(flat), stringOf(scoped))
	}
	if code, out = call(t, l, http.MethodGet, "/api/w/_global/files", nil); code != 404 {
		t.Fatalf("legacy global area: %d %v", code, out)
	}
	if code, out = call(t, l, http.MethodPost, "/api/workspaces", map[string]any{"name": "x"}); code != 409 || errCode(out) != "legacy_folder" {
		t.Fatalf("create in legacy: %d %v", code, out)
	}
	code, out = call(t, l, http.MethodGet, "/api/cohorts", nil)
	if c := out["cohorts"].([]any); code != 200 || len(c) != 1 || c[0].(map[string]any)["scope"] != "local" || c[0].(map[string]any)["workspace"] != slug {
		t.Fatalf("legacy cohorts: %d %v", code, out)
	}
	if code, env := libRun(t, l, slug, "req/a.json", `{"cohort": {"filename": "ab.pulse", "data_dir": "."}, "aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "n"}]}`); code != 200 || dataValue(env, "n") != float64(10) {
		t.Fatalf("legacy run: %d %v", code, env)
	}
}

// newMultipart writes a one-file multipart body (part "file") into buf
// and returns its Content-Type.
func newMultipart(buf *bytes.Buffer, name, content string) string {
	mw := multipart.NewWriter(buf)
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write([]byte(content))
	_ = mw.Close()
	return mw.FormDataContentType()
}
