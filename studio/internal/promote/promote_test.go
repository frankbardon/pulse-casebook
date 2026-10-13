package promote

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
)

func isolateGit(t *testing.T, dir string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	cfg := filepath.Join(t.TempDir(), "gitconfig")
	if err := os.WriteFile(cfg, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", cfg)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(dir))
	for _, k := range []string{"GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
}

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git %v: %v", args, err)
	}
	return strings.TrimSpace(string(out))
}

func writeTree(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for rel, text := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// snapshot maps every file below dir (outside .git and .studio) to its
// content hash and mtime, plus "dir/" entries for directories.
func snapshot(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || p == dir {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() && (d.Name() == ".git" || rel == ".studio") {
			return filepath.SkipDir
		}
		if d.IsDir() {
			out[rel+"/"] = ""
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		info, _ := os.Stat(p)
		s := sha256.Sum256(data)
		out[rel] = hex.EncodeToString(s[:8]) + info.ModTime().UTC().Format(time.RFC3339Nano)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func diffSnap(a, b map[string]string) []string {
	var d []string
	for k, v := range a {
		if b[k] != v {
			d = append(d, "changed/missing "+k)
		}
	}
	for k := range b {
		if _, ok := a[k]; !ok {
			d = append(d, "added "+k)
		}
	}
	sort.Strings(d)
	return d
}

// oddAnalysis is written in a deliberately odd style (CRLF, tabs, a \u
// escape, an exponent, odd spacing): only the cohort's data_dir (and
// the join's right side) may change.
const oddAnalysis = "{\r\n\t\"cohort\" :  {\"filename\":\"orders.pulse\" ,\"data_dir\":   \"cohorts\"},\r\n\t\"label\": \"caf\\u00e9\",\r\n\t\"joins\": [{\"right\":\"cohorts/orders.pulse\", \"as\": \"o_\"}],\r\n\t\"aggregations\": [ {\"op\":\"COUNT\",\"label\":\"n\", \"x\": 1.50e+0} ]\r\n}\r\n"

const oddAnalysisAfter = "{\r\n\t\"cohort\" :  {\"filename\":\"orders.pulse\" ,\"data_dir\":   \"_global/cohorts\"},\r\n\t\"label\": \"caf\\u00e9\",\r\n\t\"joins\": [{\"right\":\"_global/cohorts/orders.pulse\", \"as\": \"o_\"}],\r\n\t\"aggregations\": [ {\"op\":\"COUNT\",\"label\":\"n\", \"x\": 1.50e+0} ]\r\n}\r\n"

const spec = `{
  "version": 1,
  "target": "cohorts/orders.pulse",
  "source": {"path": "sources/orders.csv", "sha256": "x", "size": 4, "format": "csv"},
  "schema": {"ref": "orders", "path": "schemas/orders.schema.json", "sha256": "y"},
  "options": {}
}
`

const otherSpec = `{
  "version": 1,
  "target": "cohorts/more.pulse",
  "source": {"path": "sources/orders.csv", "sha256": "x", "size": 4, "format": "csv"},
  "schema": {"ref": "orders", "path": "schemas/orders.schema.json", "sha256": "y"},
  "options": {}
}
`

// fixture is a library with workspace "lab" holding a cohort with
// sidecars, its spec, source and schema, a second spec sharing the
// source and schema, analyses and an untouched workspace "other".
func fixture(t *testing.T, withGit bool) (*library.Library, string, string) {
	t.Helper()
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	if withGit {
		isolateGit(t, dir)
	}
	lib, err := library.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC)
	ws, err := lib.CreateWorkspace("Lab", "", now)
	if err != nil {
		t.Fatal(err)
	}
	other, err := lib.CreateWorkspace("Other", "", now)
	if err != nil {
		t.Fatal(err)
	}
	writeTree(t, ws.Dir, map[string]string{
		"cohorts/orders.pulse":                      "PULSE",
		"cohorts/orders.pulse.meta.json":            "{}",
		"cohorts/orders.pulse.0123456789abcdef.idx": "IDX",
		"cohorts/orders.pulse.indexes.json":         "{\n  \"cohort\": \"orders.pulse\",\n  \"indexes\": [\n    {\"index_path\": \"orders.pulse.0123456789abcdef.idx\", \"key_hash\": \"0123456789abcdef\"}\n  ]\n}\n",
		"cohorts/more.pulse":                        "PULSE2",
		"imports/orders.import.json":                spec,
		"imports/more.import.json":                  otherSpec,
		"sources/orders.csv":                        "a,b\n",
		"schemas/orders.schema.json":                "[{\"name\": \"a\", \"type\": \"int64\"}]\n",
		"analyses/odd.json":                         oddAnalysis,
		"analyses/deep/x.json":                      "{\"cohort\": {\"filename\": \"orders.pulse\", \"data_dir\": \"../../cohorts\"}}\n",
		"analyses/more.json":                        "{\"cohort\": {\"filename\": \"more.pulse\", \"data_dir\": \"cohorts\"}}\n",
		"analyses/c.compose.json":                   "{\"requests\": [{\"label\": \"a\", \"cohort\": {\"filename\": \"orders.pulse\", \"data_dir\": \"cohorts\"}}, {\"label\": \"b\", \"cohort\": {\"filename\": \"more.pulse\", \"data_dir\": \"cohorts\"}}]}\n",
		"analyses/c.layout.json":                    "{\"nodes\": {}}\n",
	})
	writeTree(t, other.Dir, map[string]string{
		"cohorts/orders.pulse": "OTHER",
		"analyses/o.json":      "{\"cohort\": {\"filename\": \"orders.pulse\", \"data_dir\": \"cohorts\"}}\n",
	})
	if withGit {
		for _, d := range []string{ws.Dir, other.Dir} {
			repo := history.Open(context.Background(), d, history.Options{Standalone: true}, t.Logf)
			if !repo.Enabled() {
				t.Fatal(repo.Status().Reason)
			}
		}
		history.Open(context.Background(), dir, history.Options{Standalone: true, Ignore: history.GlobalIgnorePatterns}, t.Logf)
	}
	return lib, ws.Dir, other.Dir
}

func TestPlanCohort(t *testing.T) {
	lib, _, _ := fixture(t, false)
	p, err := MakePlan(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "orders"})
	if err != nil {
		t.Fatal(err)
	}
	if p.Item.GlobalPath != "cohorts/orders.pulse" || p.Item.RefPath != "_global/cohorts/orders.pulse" || p.Schema == nil || p.Schema.GlobalPath != "schemas/orders.schema.json" {
		t.Fatalf("item %+v schema %+v", p.Item, p.Schema)
	}
	var moves []string
	for _, m := range p.Moves {
		moves = append(moves, m.Kind+":"+m.From+">"+m.To+":"+m.Action)
	}
	want := []string{
		"cohort:workspaces/lab/cohorts/orders.pulse>cohorts/orders.pulse:move",
		"cohort_sidecar:workspaces/lab/cohorts/orders.pulse.0123456789abcdef.idx>cohorts/orders.pulse.0123456789abcdef.idx:move",
		"cohort_sidecar:workspaces/lab/cohorts/orders.pulse.indexes.json>cohorts/orders.pulse.indexes.json:move",
		"cohort_sidecar:workspaces/lab/cohorts/orders.pulse.meta.json>cohorts/orders.pulse.meta.json:move",
		"import:workspaces/lab/imports/orders.import.json>imports/orders.import.json:move",
		"source:workspaces/lab/sources/orders.csv>sources/orders.csv:move",
		"schema:workspaces/lab/schemas/orders.schema.json>schemas/orders.schema.json:move",
	}
	if strings.Join(moves, "\n") != strings.Join(want, "\n") {
		t.Fatalf("moves:\n%s", strings.Join(moves, "\n"))
	}
	var rewrites []string
	for _, r := range p.Rewrites {
		rewrites = append(rewrites, fmt.Sprintf("%s<%s:%d", r.Path, r.From, len(r.Changes)))
	}
	sort.Strings(rewrites)
	got := strings.Join(rewrites, "\n")
	for _, w := range []string{
		"workspaces/lab/analyses/odd.json<:2",
		"workspaces/lab/analyses/deep/x.json<:1",
		"workspaces/lab/analyses/c.compose.json<:1",
		"workspaces/lab/imports/more.import.json<:2",
	} {
		if !strings.Contains(got, w) {
			t.Errorf("rewrites lack %s:\n%s", w, got)
		}
	}
	if strings.Contains(got, "more.json<") || strings.Contains(got, "other") || strings.Contains(got, "orders.import.json") {
		t.Errorf("unexpected rewrites:\n%s", got)
	}
	if p.Counts.Analyses != 3 || p.Commits.Workspace != "studio: make cohort cohorts/orders.pulse global" ||
		p.Commits.Global != "studio: make cohort cohorts/orders.pulse global (from workspace lab)" {
		t.Errorf("counts %+v commits %+v", p.Counts, p.Commits)
	}
	// The deep analysis keeps its relative form (data_dir only changes).
	for _, r := range p.Rewrites {
		if strings.HasSuffix(r.Path, "deep/x.json") && string(r.after) != "{\"cohort\": {\"filename\": \"orders.pulse\", \"data_dir\": \"_global/cohorts\"}}\n" {
			t.Errorf("deep: %q", r.after)
		}
	}
}

func TestApplyCohortWithGit(t *testing.T) {
	lib, wsDir, otherDir := fixture(t, true)
	dir := lib.Dir()
	otherBefore := snapshot(t, otherDir)
	wsRepo := history.Open(context.Background(), wsDir, history.Options{Standalone: true}, t.Logf)
	glRepo := history.Open(context.Background(), dir, history.Options{Standalone: true, Ignore: history.GlobalIgnorePatterns}, t.Logf)
	mtime := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
	_ = os.Chtimes(filepath.Join(wsDir, "cohorts/orders.pulse"), mtime, mtime)

	plan, err := MakePlan(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "cohorts/orders.pulse"})
	if err != nil {
		t.Fatal(err)
	}
	res, err := Apply(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "cohorts/orders.pulse"}, ApplyOptions{PlanID: plan.ID, WorkspaceRepo: wsRepo, GlobalRepo: glRepo})
	if err != nil {
		t.Fatal(err)
	}
	if res.Commits.Workspace == nil || res.Commits.Global == nil {
		t.Fatalf("commits: %+v", res.Commits)
	}
	if got := readFile(t, filepath.Join(wsDir, "analyses/odd.json")); got != oddAnalysisAfter {
		t.Errorf("odd analysis:\n%q", got)
	}
	if info, err := os.Stat(filepath.Join(dir, "cohorts/orders.pulse")); err != nil || !info.ModTime().Equal(mtime) {
		t.Errorf("cohort moved without its mtime: %v %v", info, err)
	}
	for _, gone := range []string{"cohorts/orders.pulse", "cohorts/orders.pulse.meta.json", "imports/orders.import.json", "sources/orders.csv", "schemas/orders.schema.json"} {
		if _, err := os.Stat(filepath.Join(wsDir, gone)); err == nil {
			t.Errorf("%s left in the workspace", gone)
		}
	}
	if got := readFile(t, filepath.Join(dir, "imports/orders.import.json")); got != spec {
		t.Errorf("global spec changed although no path did:\n%s", got)
	}
	more := readFile(t, filepath.Join(wsDir, "imports/more.import.json"))
	if !strings.Contains(more, `"path": "_global/sources/orders.csv"`) || !strings.Contains(more, `"path": "_global/schemas/orders.schema.json"`) {
		t.Errorf("shared spec:\n%s", more)
	}
	if d := diffSnap(otherBefore, snapshot(t, otherDir)); len(d) > 0 {
		t.Errorf("other workspace changed: %v", d)
	}
	if st := git(t, wsDir, "status", "--porcelain"); st != "" {
		t.Errorf("workspace repo not clean: %q", st)
	}
	if st := git(t, dir, "status", "--porcelain"); st != "?? cohorts/orders.pulse.0123456789abcdef.idx" {
		t.Errorf("global repo status (only the binary index, untracked as in the workspace): %q", st)
	}
	if msg := git(t, wsDir, "log", "-1", "--format=%s"); msg != "studio: make cohort cohorts/orders.pulse global" {
		t.Errorf("workspace commit: %q", msg)
	}
	if files := git(t, dir, "show", "--name-only", "--format=%s", "HEAD"); files != "studio: make cohort cohorts/orders.pulse global (from workspace lab)\n\ncohorts/orders.pulse.indexes.json\ncohorts/orders.pulse.meta.json\nimports/orders.import.json\nschemas/orders.schema.json" {
		t.Errorf("global commit:\n%s", files)
	}
	if _, err := os.Stat(filepath.Join(dir, ".studio")); err == nil {
		t.Error(".studio left behind")
	}
	// Again: the cohort is gone from the workspace.
	var nf *NotFoundError
	if _, err := MakePlan(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "orders"}); !errors.As(err, &nf) {
		t.Errorf("second promotion: %v", err)
	}
}

func TestClashAndRename(t *testing.T) {
	lib, wsDir, _ := fixture(t, false)
	dir := lib.Dir()
	writeTree(t, dir, map[string]string{
		"cohorts/orders.pulse":         "GLOBAL",
		"sources/orders.csv":           "different\n",
		"schemas/orders.schema.json":   "[{\"name\": \"a\", \"type\": \"int64\"}]\n", // identical: merged
		"imports/orders-2.import.json": "{}",                                         // takes orders-2
	})
	_, err := MakePlan(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "orders"})
	var clash *ClashError
	if !errors.As(err, &clash) || clash.Item != KindCohort || clash.Field != "new_name" || clash.Suggested != "orders-3" || clash.Existing != "cohorts/orders.pulse" {
		t.Fatalf("clash: %#v", err)
	}
	var inv *InvalidError
	if _, err := MakePlan(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "orders", NewName: "bad name"}); !errors.As(err, &inv) || inv.Field != "new_name" {
		t.Fatalf("bad new name: %v", err)
	}
	req := Request{Workspace: "lab", Kind: KindCohort, Name: "orders", NewName: "lab-orders"}
	if _, err := Apply(context.Background(), lib, req, ApplyOptions{}); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"cohorts/lab-orders.pulse", "cohorts/lab-orders.pulse.meta.json", "cohorts/lab-orders.pulse.0123456789abcdef.idx", "imports/lab-orders.import.json", "sources/orders-2.csv"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Errorf("missing %s", f)
		}
	}
	if got := readFile(t, filepath.Join(dir, "cohorts/lab-orders.pulse.indexes.json")); got != "{\n  \"cohort\": \"lab-orders.pulse\",\n  \"indexes\": [\n    {\"index_path\": \"lab-orders.pulse.0123456789abcdef.idx\", \"key_hash\": \"0123456789abcdef\"}\n  ]\n}\n" {
		t.Errorf("manifest:\n%s", got)
	}
	gspec := readFile(t, filepath.Join(dir, "imports/lab-orders.import.json"))
	for _, want := range []string{`"target": "cohorts/lab-orders.pulse"`, `"path": "sources/orders-2.csv"`, `"ref": "orders", "path": "schemas/orders.schema.json"`} {
		if !strings.Contains(gspec, want) {
			t.Errorf("global spec lacks %s:\n%s", want, gspec)
		}
	}
	if got := readFile(t, filepath.Join(dir, "cohorts/orders.pulse")); got != "GLOBAL" {
		t.Error("global cohort overwritten")
	}
	if _, err := os.Stat(filepath.Join(wsDir, "schemas/orders.schema.json")); err == nil {
		t.Error("merged schema left in the workspace")
	}
	if got := readFile(t, filepath.Join(wsDir, "analyses/odd.json")); got != strings.ReplaceAll(oddAnalysisAfter, "orders.pulse", "lab-orders.pulse") {
		t.Errorf("renamed refs:\n%q", got)
	}
	more := readFile(t, filepath.Join(wsDir, "imports/more.import.json"))
	if !strings.Contains(more, `"path": "_global/sources/orders-2.csv"`) || !strings.Contains(more, `"path": "_global/schemas/orders.schema.json"`) {
		t.Errorf("shared spec:\n%s", more)
	}
}

func TestSchemaPromotion(t *testing.T) {
	lib, wsDir, _ := fixture(t, false)
	dir := lib.Dir()
	writeTree(t, dir, map[string]string{"schemas/orders.schema.json": "[]\n"})
	_, err := MakePlan(context.Background(), lib, Request{Workspace: "lab", Kind: KindSchema, Name: "orders"})
	var clash *ClashError
	if !errors.As(err, &clash) || clash.Item != KindSchema || clash.Suggested != "orders-2" {
		t.Fatalf("clash: %v", err)
	}
	res, err := Apply(context.Background(), lib, Request{Workspace: "lab", Kind: KindSchema, Name: "orders", NewName: "lab-orders"}, ApplyOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Item.GlobalPath != "schemas/lab-orders.schema.json" || res.Moved != 1 || res.Rewritten != 2 {
		t.Fatalf("result %+v", res)
	}
	for _, f := range []string{"imports/orders.import.json", "imports/more.import.json"} {
		got := readFile(t, filepath.Join(wsDir, f))
		if !strings.Contains(got, `"schema": {"ref": "lab-orders", "path": "_global/schemas/lab-orders.schema.json", "sha256": "y"}`) {
			t.Errorf("%s:\n%s", f, got)
		}
	}
	if _, err := os.Stat(filepath.Join(wsDir, "cohorts/orders.pulse")); err != nil {
		t.Error("schema promotion moved the cohort")
	}
}

func TestRefusals(t *testing.T) {
	lib, _, _ := fixture(t, false)
	ctx := context.Background()
	var inv *InvalidError
	var nf *NotFoundError
	for _, c := range []struct {
		req  Request
		code string
	}{
		{Request{Workspace: "lab", Kind: KindCohort, Name: "_global/cohorts/orders.pulse"}, "not_promotable"},
		{Request{Workspace: "lab", Kind: KindCohort, Name: "analyses/x.pulse"}, "not_promotable"},
		{Request{Workspace: "lab", Kind: KindCohort, Name: "../other/cohorts/orders.pulse"}, "invalid_name"},
		{Request{Workspace: "lab", Kind: KindCohort, Name: "/abs/x.pulse"}, "invalid_name"},
	} {
		if _, err := MakePlan(ctx, lib, c.req); !errors.As(err, &inv) || inv.Code != c.code {
			t.Errorf("%+v: %v", c.req, err)
		}
	}
	if _, err := MakePlan(ctx, lib, Request{Workspace: "lab", Kind: KindCohort, Name: "nope"}); !errors.As(err, &nf) {
		t.Errorf("missing: %v", err)
	}
	if _, err := MakePlan(ctx, lib, Request{Workspace: "lab", Kind: "analysis", Name: "x"}); !errors.Is(err, ErrBadKind) {
		t.Errorf("kind: %v", err)
	}
	if _, err := MakePlan(ctx, lib, Request{Workspace: "nope", Kind: KindCohort, Name: "orders"}); !errors.Is(err, library.ErrNotFound) {
		t.Errorf("workspace: %v", err)
	}
	// A changed plan.
	if _, err := Apply(ctx, lib, Request{Workspace: "lab", Kind: KindCohort, Name: "orders"}, ApplyOptions{PlanID: "0000"}); !errors.As(err, new(*PlanChangedError)) {
		t.Errorf("plan changed: %v", err)
	}
}

func failAt(t *testing.T, name string, n int) {
	t.Helper()
	count := 0
	hook = func(s string) error {
		if s == name {
			if count++; count == n {
				return errors.New("simulated crash at " + s)
			}
		}
		return nil
	}
	t.Cleanup(func() { hook = nil })
}

// A failure part way is rolled back: every file, byte and mtime as
// before, nothing committed.
func TestApplyFailureRollsBack(t *testing.T) {
	for _, at := range []struct {
		step string
		n    int
	}{{"move", 1}, {"move", 4}, {"move", 7}, {"rewrite", 1}, {"rewrite", 4}} {
		t.Run(fmt.Sprint(at.step, at.n), func(t *testing.T) {
			lib, wsDir, _ := fixture(t, true)
			dir := lib.Dir()
			before := snapshot(t, dir)
			head := git(t, wsDir, "rev-parse", "HEAD")
			ghead := git(t, dir, "rev-parse", "HEAD")
			failAt(t, at.step, at.n)
			wsRepo := history.Open(context.Background(), wsDir, history.Options{Standalone: true}, t.Logf)
			_, err := Apply(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "orders", NewName: "renamed"}, ApplyOptions{WorkspaceRepo: wsRepo})
			var fe *FailedError
			if !errors.As(err, &fe) || !fe.RolledBack {
				t.Fatalf("err = %v", err)
			}
			if d := diffSnap(before, snapshot(t, dir)); len(d) > 0 {
				t.Fatalf("not rolled back:\n%s", strings.Join(d, "\n"))
			}
			if git(t, wsDir, "rev-parse", "HEAD") != head || git(t, dir, "rev-parse", "HEAD") != ghead {
				t.Error("a repository moved")
			}
			if _, err := os.Stat(filepath.Join(dir, ".studio")); err == nil {
				t.Error(".studio left behind")
			}
		})
	}
}

// crash leaves the library as a process killed at step would.
func crash(t *testing.T, lib *library.Library, req Request, name string, n int) {
	t.Helper()
	p, err := MakePlan(context.Background(), lib, req)
	if err != nil {
		t.Fatal(err)
	}
	j := newJournal(p, time.Now())
	if err := saveJournal(lib.Dir(), j); err != nil {
		t.Fatal(err)
	}
	failAt(t, name, n)
	if err := forward(lib.Dir(), j); err == nil {
		t.Fatal("no crash")
	}
	hook = nil
}

func TestRecover(t *testing.T) {
	req := Request{Workspace: "lab", Kind: KindCohort, Name: "orders", NewName: "renamed"}
	t.Run("rolls back", func(t *testing.T) {
		lib, _, _ := fixture(t, false)
		before := snapshot(t, lib.Dir())
		crash(t, lib, req, "rewrite", 2)
		if _, err := Apply(context.Background(), lib, req, ApplyOptions{}); !errors.Is(err, ErrInterrupted) {
			t.Fatalf("apply with a journal: %v", err)
		}
		out, err := Recover(context.Background(), lib.Dir(), RecoverOptions{NoGit: true})
		if err != nil || out.Action != ActionRolledBack || out.Phase != PhaseRewriting {
			t.Fatalf("recover: %+v %v", out, err)
		}
		if d := diffSnap(before, snapshot(t, lib.Dir())); len(d) > 0 {
			t.Fatalf("not rolled back:\n%s", strings.Join(d, "\n"))
		}
	})
	t.Run("finishes", func(t *testing.T) {
		lib, wsDir, _ := fixture(t, true)
		failAt(t, "commit", 1)
		_, err := Apply(context.Background(), lib, req, ApplyOptions{})
		var fe *FailedError
		if !errors.As(err, &fe) || fe.RolledBack || fe.Phase != PhaseCommitting {
			t.Fatalf("err = %v", err)
		}
		hook = nil
		out, err := Recover(context.Background(), lib.Dir(), RecoverOptions{Logf: t.Logf})
		if err != nil || out.Action != ActionFinished || out.Commits.Workspace == nil || out.Commits.Global == nil {
			t.Fatalf("recover: %+v %v", out, err)
		}
		if st := git(t, wsDir, "status", "--porcelain"); st != "" {
			t.Errorf("workspace repo not clean: %q", st)
		}
		if _, err := os.Stat(filepath.Join(lib.Dir(), "cohorts/renamed.pulse")); err != nil {
			t.Error(err)
		}
		if j, _ := LoadJournal(lib.Dir()); j != nil {
			t.Error("journal left")
		}
	})
}

// A cohort without an import spec moves alone; legacy folders have no
// global area.
func TestBareCohortAndLegacy(t *testing.T) {
	lib, wsDir, _ := fixture(t, false)
	writeTree(t, wsDir, map[string]string{"cohorts/sub/bare.pulse": "B", "analyses/b.json": "{\"cohort\": {\"filename\": \"sub/bare.pulse\", \"data_dir\": \"cohorts\"}}"})
	res, err := Apply(context.Background(), lib, Request{Workspace: "lab", Kind: KindCohort, Name: "cohorts/sub/bare.pulse"}, ApplyOptions{})
	if err != nil || res.Moved != 1 || res.Item.GlobalPath != "cohorts/sub/bare.pulse" {
		t.Fatalf("%+v %v", res, err)
	}
	if got := readFile(t, filepath.Join(wsDir, "analyses/b.json")); got != "{\"cohort\": {\"filename\": \"sub/bare.pulse\", \"data_dir\": \"_global/cohorts\"}}" {
		t.Errorf("subfolder ref: %s", got)
	}
	if _, err := os.Stat(filepath.Join(wsDir, "cohorts/sub")); err == nil {
		t.Error("emptied cohorts/sub left")
	}
	if _, err := os.Stat(filepath.Join(wsDir, "cohorts")); err != nil {
		t.Error("cohorts/ removed")
	}

	legacy, _ := filepath.EvalSymlinks(t.TempDir())
	writeTree(t, legacy, map[string]string{"ab.pulse": "x", "req/a.json": "{\"cohort\": {\"filename\": \"ab.pulse\"}}"})
	llib, err := library.Open(legacy)
	if err != nil || !llib.Legacy() {
		t.Fatal(err)
	}
	if _, err := MakePlan(context.Background(), llib, Request{Workspace: "x", Kind: KindCohort, Name: "ab"}); !errors.Is(err, ErrLegacy) {
		t.Errorf("legacy: %v", err)
	}
}
