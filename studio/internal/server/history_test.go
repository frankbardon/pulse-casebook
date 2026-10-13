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
	"strings"
	"testing"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
)

// isolateGit points git at an empty global config and stops repository
// discovery at dir's parent, so the commits a test makes land only in
// its own temp repository (never the casebook's).
func isolateGit(t *testing.T, dir string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	cfg := filepath.Join(t.TempDir(), "gitconfig")
	if err := os.WriteFile(cfg, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", cfg)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(real))
	for _, k := range []string{"GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
}

// withHistory turns git history on for s's workspace (git init +
// snapshot, as `studio <dir>` does).
func withHistory(t *testing.T, s *Server) {
	t.Helper()
	isolateGit(t, s.Root().Dir())
	s.cfg.History = history.Open(context.Background(), s.Root().Dir(), history.Options{}, t.Logf)
	if !s.cfg.History.Enabled() {
		t.Fatalf("history off: %+v", s.cfg.History.Status())
	}
}

func gitOut(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func postJSON(t *testing.T, s *Server, url string, body any) (int, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, url, bytes.NewReader(raw)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return rec.Code, out
}

func errCode(out map[string]any) string {
	e, _ := out["error"].(map[string]any)
	c, _ := e["code"].(string)
	return c
}

func TestHistoryOff(t *testing.T) {
	s := newWorkspaceServer(t)
	code, body := get(t, s, "/api/status")
	g, _ := body["git"].(map[string]any)
	if code != 200 || g["enabled"] != false || g["reason"] == "" {
		t.Fatalf("status = %d %v", code, body)
	}
	for _, url := range []string{"/api/history?path=req/01.json", "/api/history/file?path=req/01.json&rev=abcd"} {
		if code, body := get(t, s, url); code != http.StatusServiceUnavailable || errCode(body) != "history_unavailable" {
			t.Errorf("%s = %d %v", url, code, body)
		}
	}
	if code, body := postJSON(t, s, "/api/history/restore", map[string]any{"path": "req/01.json", "rev": "abcd"}); code != http.StatusServiceUnavailable {
		t.Errorf("restore = %d %v", code, body)
	}
	// Saves still work without history.
	if code, body := put(t, s, "/api/file?path=req/01.json", []byte(`{"cohort":{"filename":"c.pulse"}}`)); code != 200 {
		t.Fatalf("save = %d %v", code, body)
	}
	if _, err := os.Stat(filepath.Join(s.Root().Dir(), ".git")); err == nil {
		t.Fatal("a server without history initialized git")
	}
}

func TestHistorySaveLogShowRestore(t *testing.T) {
	s := newWorkspaceServer(t)
	withHistory(t, s)
	dir := s.Root().Dir()

	code, body := get(t, s, "/api/status")
	g, _ := body["git"].(map[string]any)
	if code != 200 || g["enabled"] != true || g["initialized"] != true || g["repo_root"] != dir {
		t.Fatalf("status = %d %v", code, body)
	}
	// The snapshot tracks JSON and the managed .gitignore, never cohorts.
	if got := gitOut(t, dir, "ls-files"); got != ".gitignore\nreq/01.json\nreq/01.layout.json" {
		t.Fatalf("tracked = %q", got)
	}

	// A file the user edits outside the studio stays uncommitted.
	if err := os.WriteFile(filepath.Join(dir, "req/01.layout.json"), []byte(`{"user":1}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if code, body := put(t, s, "/api/file?path=req/01.json", []byte(`{"cohort":{"filename":"c.pulse"},"label":"v2"}`)); code != 200 {
		t.Fatalf("save = %d %v", code, body)
	}
	if got := gitOut(t, dir, "log", "-1", "--format=%s|%an", "--name-only"); got != "studio: save req/01.json|Pulse Studio\n\nreq/01.json" {
		t.Fatalf("save commit = %q", got)
	}
	if got := gitOut(t, dir, "status", "--porcelain"); got != "M req/01.layout.json" {
		t.Fatalf("status after save = %q", got)
	}

	code, body = get(t, s, "/api/history?path=req/01.json")
	commits, _ := body["commits"].([]any)
	if code != 200 || body["path"] != "req/01.json" || len(commits) != 2 {
		t.Fatalf("history = %d %v", code, body)
	}
	first := commits[1].(map[string]any)
	if first["message"] != "studio: initial snapshot" || first["author"] != "Pulse Studio" || first["time"] == "" {
		t.Fatalf("oldest commit = %v", first)
	}
	// limit and an unknown path.
	if _, body := get(t, s, "/api/history?path=req/01.json&limit=1"); len(body["commits"].([]any)) != 1 {
		t.Fatalf("limit=1 = %v", body)
	}
	if code, body := get(t, s, "/api/history?path=req/none.json"); code != 200 || len(body["commits"].([]any)) != 0 {
		t.Fatalf("unknown path = %d %v", code, body)
	}

	short := first["short"].(string)
	code, body = get(t, s, "/api/history/file?path=req/01.json&rev="+short)
	if code != 200 || body["text"] != `{"cohort":{"filename":"c.pulse"},"aggregations":[]}` || body["rev"] != first["rev"] {
		t.Fatalf("file at rev = %d %v", code, body)
	}

	code, body = postJSON(t, s, "/api/history/restore", map[string]any{"path": "req/01.json", "rev": short})
	if code != 200 || body["text"] != `{"cohort":{"filename":"c.pulse"},"aggregations":[]}` || body["kind"] != "request" {
		t.Fatalf("restore = %d %v", code, body)
	}
	c, _ := body["commit"].(map[string]any)
	if c == nil || c["message"] != "studio: restore req/01.json to "+first["rev"].(string)[:7] {
		t.Fatalf("restore commit = %v", body["commit"])
	}
	if disk, _ := os.ReadFile(filepath.Join(dir, "req/01.json")); string(disk) != body["text"] {
		t.Fatalf("restored bytes = %q", disk)
	}
	if got := gitOut(t, dir, "rev-list", "--count", "HEAD"); got != "3" {
		t.Fatalf("commits = %s", got)
	}
	// Restoring the same content again commits nothing.
	if code, body := postJSON(t, s, "/api/history/restore", map[string]any{"path": "req/01.json", "rev": short}); code != 200 || body["commit"] != nil {
		t.Fatalf("no-op restore = %d %v", code, body)
	}

	// A layout save commits the sidecar alone.
	if code, body := put(t, s, "/api/layout?path=req/01.json", []byte(`{"version":1}`)); code != 200 {
		t.Fatalf("layout = %d %v", code, body)
	}
	if got := gitOut(t, dir, "log", "-1", "--format=%s", "--name-only"); got != "studio: save req/01.layout.json\n\nreq/01.layout.json" {
		t.Fatalf("layout commit = %q", got)
	}
}

func TestHistoryErrors(t *testing.T) {
	s := newWorkspaceServer(t)
	withHistory(t, s)
	_, body := get(t, s, "/api/history?path=req/01.json")
	rev := body["commits"].([]any)[0].(map[string]any)["rev"].(string)
	tests := []struct {
		name   string
		url    string
		status int
		code   string
	}{
		{"missing path", "/api/history", 400, "missing_path"},
		{"outside", "/api/history?path=../x.json", 403, "path_outside"},
		{"bad limit", "/api/history?path=req/01.json&limit=0", 400, "invalid_limit"},
		{"missing rev", "/api/history/file?path=req/01.json", 400, "missing_rev"},
		{"symbolic rev", "/api/history/file?path=req/01.json&rev=HEAD", 400, "invalid_rev"},
		{"option rev", "/api/history/file?path=req/01.json&rev=--output=x", 400, "invalid_rev"},
		{"unknown rev", "/api/history/file?path=req/01.json&rev=" + strings.Repeat("0", 40), 404, "rev_not_found"},
		{"not at rev", "/api/history/file?path=req/nope.json&rev=" + rev, 404, "not_found"},
		{"outside file", "/api/history/file?path=../x.json&rev=" + rev, 403, "path_outside"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			code, body := get(t, s, tc.url)
			if code != tc.status || errCode(body) != tc.code {
				t.Fatalf("%d %v, want %d %s", code, body, tc.status, tc.code)
			}
		})
	}
	for _, tc := range []struct {
		body   any
		status int
		code   string
	}{
		{map[string]any{"rev": rev}, 400, "missing_path"},
		{map[string]any{"path": "../x.json", "rev": rev}, 403, "path_outside"},
		{map[string]any{"path": "req/01.json"}, 400, "missing_rev"},
		{map[string]any{"path": "req/nope.json", "rev": rev}, 404, "not_found"},
		{"nope", 400, "invalid_json"},
	} {
		code, body := postJSON(t, s, "/api/history/restore", tc.body)
		if code != tc.status || errCode(body) != tc.code {
			t.Errorf("restore %v = %d %v, want %d %s", tc.body, code, body, tc.status, tc.code)
		}
	}
}

func TestHistoryCreateAndRunSaveCommit(t *testing.T) {
	s, dir := newCreateFixture(t)
	withHistory(t, s)
	code, out := postCreate(t, s, map[string]any{"path": "case/req/new.json", "root": "request", "cohort": "case/ab_test.pulse"})
	if code != http.StatusCreated {
		t.Fatalf("create = %d %v", code, out)
	}
	if got := gitOut(t, dir, "log", "-1", "--format=%s", "--name-only"); got != "studio: create case/req/new.json\n\ncase/req/new.json" {
		t.Fatalf("create commit = %q", got)
	}
	// Cohorts are never versioned.
	if got := gitOut(t, dir, "ls-files", "*.pulse"); got != "" {
		t.Fatalf("cohorts tracked: %q", got)
	}

	f := newPreviewFixture(t)
	withHistory(t, f.srv)
	const path = "ab/req/11_readout.compose.json"
	_, run := postRun(t, f.srv, nil, map[string]any{"path": path, "request": f.read(t, path)})
	if code, saved := postRunSave(t, f.srv, map[string]any{"run_id": run["run_id"]}); code != 200 {
		t.Fatalf("run save = %d %v", code, saved)
	}
	if got := gitOut(t, f.dir, "log", "-1", "--format=%s", "--name-only"); got != "studio: save run output ab/out/11_readout.json\n\nab/out/11_readout.json" {
		t.Fatalf("run save commit = %q", got)
	}
}

// TestHistoryEnclosingRepo serves a workspace inside an outer repository:
// no nested init, commits limited to the workspace.
func TestHistoryEnclosingRepo(t *testing.T) {
	outer := t.TempDir()
	isolateGit(t, outer)
	gitOut(t, outer, "init", "-q")
	ws := filepath.Join(outer, "case")
	if err := os.MkdirAll(filepath.Join(ws, "req"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outer, "outside.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	root, err := scope.New(ws)
	if err != nil {
		t.Fatal(err)
	}
	s := New(root, nil, Config{History: history.Open(context.Background(), root.Dir(), history.Options{}, t.Logf)}, nil, false)
	if _, err := os.Stat(filepath.Join(ws, ".git")); err == nil {
		t.Fatal("nested repository created")
	}
	_, body := get(t, s, "/api/status")
	if g := body["git"].(map[string]any); g["prefix"] != "case/" || g["initialized"] == true {
		t.Fatalf("status = %v", body)
	}
	if code, body := put(t, s, "/api/file?path=req/a.json", []byte(`{"cohort":{"filename":"c.pulse"}}`)); code != 200 {
		t.Fatalf("save = %d %v", code, body)
	}
	if got := gitOut(t, outer, "log", "-1", "--format=%s", "--name-only"); got != "studio: save req/a.json\n\ncase/req/a.json" {
		t.Fatalf("commit = %q", got)
	}
	if got := gitOut(t, outer, "status", "--porcelain"); got != "?? outside.json" {
		t.Fatalf("outer status = %q", got)
	}
}
