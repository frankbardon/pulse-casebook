package migrate

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

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
)

// isolateGit keeps git away from the user's config and any enclosing
// repository.
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
	out, err := gitRun(context.Background(), "git", dir, args...)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
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

// snapshot maps every file below dir (outside .git and .studio) to its
// content hash, plus "dir/" entries for directories.
func snapshot(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := relOf(dir, p)
		if p == dir {
			return nil
		}
		if d.IsDir() && (d.Name() == ".git" || rel == ".studio") {
			out[rel+"/"] = "git-or-studio"
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

// A request written in a deliberately odd style: tabs, a \u escape, an
// exponent, extra spaces, CRLF line ends. Only the cohort's data_dir
// value may change.
const oddRequest = "{\r\n\t\"cohort\" :  {\"filename\":\"ab.pulse\" ,\"data_dir\":   \".\"},\r\n\t\"label\": \"caf\\u00e9\",  \"aggregations\": [ {\"op\":\"COUNT\",\"label\":\"n\", \"x\": 1.50e+0} ]\r\n}\r\n"

const oddRequestAfter = "{\r\n\t\"cohort\" :  {\"filename\":\"ab.pulse\" ,\"data_dir\":   \"cohorts\"},\r\n\t\"label\": \"caf\\u00e9\",  \"aggregations\": [ {\"op\":\"COUNT\",\"label\":\"n\", \"x\": 1.50e+0} ]\r\n}\r\n"

// synthetic is a legacy folder with every case the plan handles.
func synthetic(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	writeTree(t, real, map[string]string{
		"ab.pulse":                      "PULSE-ab",
		"ab.pulse.meta.json":            `{"handle": 1}`,
		"ab.pulse.0123456789abcdef.idx": "idx",
		"ab.pulse.indexes.json":         `{"indexes": []}`,
		"design.pulse":                  "PULSE-design",
		"data/z.pulse":                  "PULSE-z",
		"req/01_odd.json":               oddRequest,
		"req/01_odd.layout.json":        `{"version": 1, "nodes": {}}`,
		"req/sub/02_join.json": `{
  "cohort": {"filename": "ab.pulse", "data_dir": "."},
  "joins": [
    {"right": "design.pulse", "on": [{"left": "id", "right": "id"}]}
  ],
  "overlays": [
    {"name": "srm", "kind": "OVERLAY_CHISQ_VS_POP", "ref": {"population": {"cohort": "design.pulse"}}}
  ]
}
`,
		"req/03_readout.compose.json": `{
  "requests": [
    {"label": "a", "cohort": {"filename": "ab.pulse", "data_dir": "."}},
    {"label": "b", "cohort": {"filename": "gone.pulse", "data_dir": "."}}
  ],
  "fits": [
    {"name": "m", "request": {"cohort": {"filename": "ab.pulse#s2.pulse", "data_dir": "."}}}
  ]
}
`,
		"req/04_chain.json": `{
  "stages": [
    {"name": "s1", "request": {"cohort": {"filename": "data/z.pulse"}}},
    {"name": "s2", "request": {"aggregations": [{"op": "COUNT", "label": "n"}]}}
  ]
}
`,
		"req/05_facet.facet.json": "{\"cohort\": {\"filename\": \"ab.pulse\", \"data_dir\": \".\"}, \"fields\": [\"x\"]}\n",
		// A nested casebook case: request in case/req/, cohort beside req/.
		"case/c.pulse":             "PULSE-c",
		"case/req/x.json":          `{"cohort": {"filename": "c.pulse", "data_dir": "."}}` + "\n",
		"case/req/x.layout.json":   `{"version": 1}`,
		"case/labels/regions.json": `{"name": "regions", "labels": {}}`,
		"case/out/x.json":          `{"data": {}}`,
		"case/README.md":           "# case\n",
		"deep/a/b/y.json":          `{"cohort": {"filename": "z.pulse", "data_dir": "../../../data"}}` + "\n",
		"labels/root.json":         `{"name": "root"}`,
		"imports/ab.import.json":   `{"version": 1, "target": "ab.pulse", "source": {"path": "sources/ab.csv"}}` + "\n",
		"imports/old.import.json":  `{"version": 1, "target": "old.pulse"}` + "\n",
		"schemas/ab.schema.json":   `[{"name": "x", "type": "f64"}]` + "\n",
		"sources/ab.csv":           "x\n1\n",
		"README.md":                "# legacy\n",
		"run_all.sh":               "#!/bin/sh\n",
		".hidden/cache.bin2":       "c",
		".gitignore":               "# >>> pulse studio (managed block: edits between these markers are replaced)\n*.pulse\n/sources/\n/.studio/\n.*.tmp\n/exports/\n# <<< pulse studio\nmine.txt\n",
	})
	if err := os.Mkdir(filepath.Join(real, "empty"), 0o755); err != nil {
		t.Fatal(err)
	}
	return real
}

func moveOf(p *Plan, from string) (Move, bool) {
	for _, m := range p.Moves {
		if m.From == from {
			return m, true
		}
	}
	return Move{}, false
}

func rewriteOf(p *Plan, from string) (Rewrite, bool) {
	for _, r := range p.Rewrites {
		if r.From == from {
			return r, true
		}
	}
	return Rewrite{}, false
}

func TestPlanSynthetic(t *testing.T) {
	dir := synthetic(t)
	isolateGit(t, dir)
	git(t, dir, "init", "-q")
	p, err := MakePlan(context.Background(), dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if !p.Migratable {
		t.Fatalf("not migratable: %s %s %+v", p.Reason, p.Message, p.Conflicts)
	}
	slug := library.Slugify(filepath.Base(dir))
	ws := "workspaces/" + slug + "/"
	want := map[string][2]string{
		".git":                          {ws + ".git", KindGit},
		"ab.pulse":                      {ws + "cohorts/ab.pulse", KindCohort},
		"ab.pulse.meta.json":            {ws + "cohorts/ab.pulse.meta.json", KindCohortSidecar},
		"ab.pulse.0123456789abcdef.idx": {ws + "cohorts/ab.pulse.0123456789abcdef.idx", KindCohortSidecar},
		"ab.pulse.indexes.json":         {ws + "cohorts/ab.pulse.indexes.json", KindCohortSidecar},
		"data/z.pulse":                  {ws + "cohorts/data/z.pulse", KindCohort},
		"req/01_odd.json":               {ws + "analyses/01_odd.json", KindAnalysis},
		"req/01_odd.layout.json":        {ws + "analyses/01_odd.layout.json", KindLayout},
		"req/sub/02_join.json":          {ws + "analyses/sub/02_join.json", KindAnalysis},
		"req/03_readout.compose.json":   {ws + "analyses/03_readout.compose.json", KindAnalysis},
		"req/04_chain.json":             {ws + "analyses/04_chain.json", KindAnalysis},
		"req/05_facet.facet.json":       {ws + "analyses/05_facet.facet.json", KindAnalysis},
		"case/c.pulse":                  {ws + "cohorts/case/c.pulse", KindCohort},
		"case/req/x.json":               {ws + "analyses/case/req/x.json", KindAnalysis},
		"case/req/x.layout.json":        {ws + "analyses/case/req/x.layout.json", KindLayout},
		"case/labels/regions.json":      {ws + "analyses/case/labels/regions.json", KindLabels},
		"case/out/x.json":               {ws + "case/out/x.json", KindOther},
		"deep/a/b/y.json":               {ws + "analyses/deep/a/b/y.json", KindAnalysis},
		"labels/root.json":              {ws + "labels/root.json", KindOther},
		"imports/ab.import.json":        {ws + "imports/ab.import.json", KindImport},
		"schemas/ab.schema.json":        {ws + "schemas/ab.schema.json", KindSchema},
		"sources/ab.csv":                {ws + "sources/ab.csv", KindSource},
		"README.md":                     {ws + "README.md", KindOther},
		".gitignore":                    {ws + ".gitignore", KindOther},
		".hidden":                       {ws + ".hidden", KindOther},
		"empty":                         {ws + "empty", KindOther},
	}
	for from, w := range want {
		m, ok := moveOf(p, from)
		if !ok {
			t.Errorf("no move for %s", from)
			continue
		}
		if m.To != w[0] || m.Kind != w[1] {
			t.Errorf("%s → %s (%s), want %s (%s)", from, m.To, m.Kind, w[0], w[1])
		}
	}
	if p.Git.Workspace != "moved" || p.Git.Global != "init" || p.Git.Ignore != ws+".gitignore" {
		t.Errorf("git plan %+v", p.Git)
	}

	// Byte preservation: only the data_dir value changed.
	r, ok := rewriteOf(p, "req/01_odd.json")
	if !ok || string(r.after) != oddRequestAfter || r.Path != ws+"analyses/01_odd.json" {
		t.Fatalf("odd rewrite = %q (%v)", r.after, ok)
	}
	// Joins, population, compose slots, fits (shard anchor), chain
	// stages (data_dir inserted), facets, request-relative refs.
	checks := map[string][]string{
		"req/sub/02_join.json":        {`"right": "cohorts/design.pulse"`, `{"population": {"cohort": "cohorts/design.pulse"}}`, `{"filename": "ab.pulse", "data_dir": "cohorts"}`},
		"req/03_readout.compose.json": {`{"label": "a", "cohort": {"filename": "ab.pulse", "data_dir": "cohorts"}}`, `{"filename": "gone.pulse", "data_dir": "."}`, `{"filename": "ab.pulse#s2.pulse", "data_dir": "cohorts"}`},
		"req/04_chain.json":           {`{"cohort": {"filename": "data/z.pulse", "data_dir": "cohorts"}}`},
		"req/05_facet.facet.json":     {`{"cohort": {"filename": "ab.pulse", "data_dir": "cohorts"}, "fields": ["x"]}`},
		"case/req/x.json":             {`{"filename": "c.pulse", "data_dir": "cohorts/case"}`},
		"deep/a/b/y.json":             {`{"filename": "z.pulse", "data_dir": "cohorts/data"}`},
		"imports/ab.import.json":      {`"target": "cohorts/ab.pulse"`, `"source": {"path": "sources/ab.csv"}`},
	}
	for from, subs := range checks {
		r, ok := rewriteOf(p, from)
		if !ok {
			t.Errorf("no rewrite for %s", from)
			continue
		}
		for _, s := range subs {
			if !strings.Contains(string(r.after), s) {
				t.Errorf("%s after rewrite lacks %s:\n%s", from, s, r.after)
			}
		}
	}
	// Missing targets are warnings, left as written.
	var missing []string
	for _, w := range p.Warnings {
		if w.Code == "ref_missing" {
			missing = append(missing, w.Path+" "+w.Ref)
		}
	}
	sort.Strings(missing)
	if strings.Join(missing, "|") != "imports/old.import.json old.pulse|req/03_readout.compose.json ./gone.pulse" {
		t.Errorf("missing-ref warnings = %v", missing)
	}
	if p.ID == "" || p.Counts.Analyses != 7 || p.Counts.Cohorts != 4 || p.Counts.CohortSidecars != 3 || p.Counts.Layouts != 2 {
		t.Errorf("counts %+v id %q", p.Counts, p.ID)
	}
	// Planning changed nothing.
	if _, err := os.Stat(filepath.Join(dir, "workspaces")); err == nil {
		t.Error("plan wrote to disk")
	}
}

func TestPlanRefusals(t *testing.T) {
	ctx := context.Background()
	t.Run("no git", func(t *testing.T) {
		dir := synthetic(t)
		p, _ := MakePlan(ctx, dir, Options{NoGit: true})
		if p.Migratable || p.Reason != ReasonNoGit {
			t.Fatalf("%+v", p)
		}
		if _, err := Apply(ctx, dir, ApplyOptions{Options: Options{NoGit: true}}); !errors.As(err, new(*NotMigratableError)) {
			t.Fatalf("apply under --no-git: %v", err)
		}
	})
	t.Run("already library", func(t *testing.T) {
		dir := t.TempDir()
		if _, err := library.Open(dir); err != nil {
			t.Fatal(err)
		}
		if p, _ := MakePlan(ctx, dir, Options{}); p.Reason != ReasonAlreadyLibrary {
			t.Fatalf("%+v", p)
		}
	})
	t.Run("inside a repository", func(t *testing.T) {
		outer := t.TempDir()
		isolateGit(t, outer)
		real, _ := filepath.EvalSymlinks(outer)
		git(t, real, "init", "-q")
		dir := filepath.Join(real, "showcase", "case")
		writeTree(t, dir, map[string]string{"req/a.json": `{"cohort": {"filename": "a.pulse", "data_dir": "."}}`, "a.pulse": "x"})
		if p, _ := MakePlan(ctx, dir, Options{}); p.Reason != ReasonInsideRepo {
			t.Fatalf("%+v", p)
		}
	})
	t.Run("collisions and reserved names", func(t *testing.T) {
		dir := t.TempDir()
		isolateGit(t, dir)
		real, _ := filepath.EvalSymlinks(dir)
		writeTree(t, real, map[string]string{
			"a.json":            `{"cohort": {"filename": "x.pulse"}}`,
			"req/a.json":        `{"cohort": {"filename": "x.pulse"}}`,
			"workspaces/w.txt":  "x",
			"_global/notes.txt": "y",
		})
		p, _ := MakePlan(ctx, real, Options{})
		if p.Migratable || p.Reason != ReasonConflicts || len(p.Conflicts) != 3 {
			t.Fatalf("%+v", p.Conflicts)
		}
		if _, err := Apply(ctx, real, ApplyOptions{}); !errors.As(err, new(*NotMigratableError)) {
			t.Fatalf("apply with conflicts: %v", err)
		}
	})
}

// legacyRepo is the synthetic folder as a studio-managed repository with
// a couple of commits.
func legacyRepo(t *testing.T) string {
	t.Helper()
	dir := synthetic(t)
	isolateGit(t, dir)
	git(t, dir, "init", "-q")
	git(t, dir, "add", "-A")
	git(t, dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first")
	writeTree(t, dir, map[string]string{"req/04_chain.json": strings.Replace(readFile(t, filepath.Join(dir, "req/04_chain.json")), `"s2"`, `"s2b"`, 1)})
	git(t, dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "second")
	return dir
}

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestApplyKeepsHistory(t *testing.T) {
	dir := legacyRepo(t)
	ctx := context.Background()
	p, err := MakePlan(ctx, dir, Options{})
	if err != nil || !p.Migratable {
		t.Fatalf("%v %+v", err, p)
	}
	res, err := Apply(ctx, dir, ApplyOptions{PlanID: p.ID, Now: func() time.Time { return time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC) }})
	if err != nil {
		t.Fatal(err)
	}
	ws := filepath.Join(dir, "workspaces", p.Workspace.Slug)
	if len(res.Commits) != 2 || res.Commits[0].Message != CommitMessage || res.Commits[1].Message != CommitRefsMessage {
		t.Fatalf("commits %+v", res.Commits)
	}
	// Layout.
	for _, rel := range []string{"analyses/01_odd.json", "analyses/sub/02_join.json", "cohorts/ab.pulse", "cohorts/ab.pulse.meta.json", "analyses/case/labels/regions.json", "README.md", "empty", ".hidden/cache.bin2", "workspace.json", "sources/ab.csv"} {
		if _, err := os.Lstat(filepath.Join(ws, rel)); err != nil {
			t.Errorf("missing %s: %v", rel, err)
		}
	}
	if got := readFile(t, filepath.Join(ws, "analyses/01_odd.json")); got != oddRequestAfter {
		t.Errorf("odd request on disk = %q", got)
	}
	if got := readFile(t, filepath.Join(ws, "workspace.json")); got != "{\n  \"name\": \""+filepath.Base(dir)+"\",\n  \"created\": \"2026-10-13T09:00:00Z\"\n}\n" {
		t.Errorf("workspace.json = %q", got)
	}
	if got := readFile(t, filepath.Join(dir, library.MarkerFile)); got != string(library.Marker()) {
		t.Errorf("library.json = %q", got)
	}
	entries, _ := os.ReadDir(dir)
	var root []string
	for _, e := range entries {
		root = append(root, e.Name())
	}
	if strings.Join(root, ",") != "library.json,workspaces" {
		t.Errorf("library root holds %v", root)
	}
	ignore := readFile(t, filepath.Join(ws, ".gitignore"))
	if strings.Contains(ignore, "/exports/") || !strings.Contains(ignore, "mine.txt") || !strings.Contains(ignore, "/sources/") {
		t.Errorf("workspace .gitignore = %q", ignore)
	}
	// History: the moved analysis keeps its earlier commits.
	log := git(t, ws, "log", "--follow", "--format=%s", "--", "analyses/04_chain.json")
	if strings.TrimSpace(log) != CommitRefsMessage+"\n"+CommitMessage+"\nsecond\nfirst" {
		t.Errorf("log --follow = %q", log)
	}
	if st := git(t, ws, "status", "--porcelain"); strings.TrimSpace(st) != "" {
		t.Errorf("workspace repo not clean after the migration:\n%s", st)
	}
	// Then the library: global repo on open.
	lib, err := library.Open(dir)
	if err != nil || lib.Legacy() {
		t.Fatalf("open: %v legacy=%v", err, lib.Legacy())
	}
	g := history.Open(ctx, dir, history.Options{Standalone: true, Ignore: history.GlobalIgnorePatterns}, t.Logf)
	if !g.Enabled() || !g.Status().Initialized {
		t.Errorf("global repo %+v", g.Status())
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(JournalPath))); err == nil {
		t.Error("journal left behind")
	}
}

func TestApplyPlanChanged(t *testing.T) {
	dir := legacyRepo(t)
	if _, err := Apply(context.Background(), dir, ApplyOptions{PlanID: "stale"}); !errors.As(err, new(*PlanChangedError)) {
		t.Fatalf("err = %v", err)
	}
}

// failAt makes the n-th call of step name fail.
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

func TestApplyFailureRollsBack(t *testing.T) {
	for _, at := range []struct {
		step string
		n    int
	}{{"move", 1}, {"move", 9}, {"rewrite", 1}, {"commit", 1}, {"rewrite", 3}, {"write", 1}} {
		t.Run(fmt.Sprint(at.step, at.n), func(t *testing.T) {
			dir := legacyRepo(t)
			before := snapshot(t, dir)
			head := git(t, dir, "rev-parse", "HEAD")
			failAt(t, at.step, at.n)
			_, err := Apply(context.Background(), dir, ApplyOptions{})
			var fe *FailedError
			if !errors.As(err, &fe) || !fe.RolledBack {
				t.Fatalf("err = %v", err)
			}
			hook = nil
			after := snapshot(t, dir)
			delete(after, ".studio/")
			if d := diffSnap(before, after); len(d) > 0 {
				t.Fatalf("not rolled back:\n%s", strings.Join(d, "\n"))
			}
			if git(t, dir, "rev-parse", "HEAD") != head {
				t.Error("repository HEAD moved")
			}
			if _, err := os.Stat(filepath.Join(dir, ".studio")); err == nil {
				t.Error(".studio left behind")
			}
		})
	}
}

// crash leaves the folder as a process killed at step would: the
// journal written, the forward pass stopped, no rollback.
func crash(t *testing.T, dir, name string, n int) {
	t.Helper()
	ctx := context.Background()
	p, err := MakePlan(ctx, dir, Options{})
	if err != nil || !p.Migratable {
		t.Fatalf("%v %+v", err, p)
	}
	j, err := newJournal(ctx, p, time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if err := saveJournal(dir, j); err != nil {
		t.Fatal(err)
	}
	failAt(t, name, n)
	if _, err := forward(ctx, dir, j, Options{}); err == nil {
		t.Fatal("no crash")
	}
	hook = nil
}

func TestRecoverResumes(t *testing.T) {
	for _, at := range []struct {
		step string
		n    int
	}{{"move", 5}, {"rewrite", 2}, {"commit", 1}, {"commit", 2}, {"finalize", 1}} {
		t.Run(fmt.Sprint(at.step, at.n), func(t *testing.T) {
			dir := legacyRepo(t)
			crash(t, dir, at.step, at.n)
			if p, _ := MakePlan(context.Background(), dir, Options{}); p.Reason != ReasonInterrupted && at.step != "finalize" {
				// finalize: library.json not written yet either way.
				t.Errorf("plan during an interrupted migration: %+v", p.Reason)
			}
			out, err := Recover(context.Background(), dir, Options{})
			if err != nil || out == nil || out.Action != ActionResumed {
				t.Fatalf("recover = %+v, %v", out, err)
			}
			ws := filepath.Join(dir, "workspaces", out.Workspace.Slug)
			if got := readFile(t, filepath.Join(ws, "analyses/01_odd.json")); got != oddRequestAfter {
				t.Errorf("odd request = %q", got)
			}
			if _, err := os.Stat(filepath.Join(dir, library.MarkerFile)); err != nil {
				t.Error("library.json missing")
			}
			if log := git(t, ws, "log", "-2", "--format=%s"); strings.TrimSpace(log) != CommitRefsMessage+"\n"+CommitMessage {
				t.Errorf("last commit %q", log)
			}
			if st := git(t, ws, "status", "--porcelain"); strings.TrimSpace(st) != "" {
				t.Errorf("workspace repo not clean:\n%s", st)
			}
			if again, err := Recover(context.Background(), dir, Options{}); again != nil || err != nil {
				t.Errorf("second recover = %+v, %v", again, err)
			}
		})
	}
}

func TestRecoverRollsBack(t *testing.T) {
	dir := legacyRepo(t)
	before := snapshot(t, dir)
	crash(t, dir, "rewrite", 4)
	// --no-git on the next start: never migrate, so roll back.
	out, err := Recover(context.Background(), dir, Options{NoGit: true})
	if err != nil || out == nil || out.Action != ActionRolledBack {
		t.Fatalf("recover = %+v, %v", out, err)
	}
	after := snapshot(t, dir)
	if d := diffSnap(before, after); len(d) > 0 {
		t.Fatalf("not rolled back:\n%s", strings.Join(d, "\n"))
	}
	if !library.IsLegacy(dir) {
		t.Error("no longer legacy")
	}

	// A resume that cannot proceed (a moved file edited meanwhile) rolls
	// back too.
	dir = legacyRepo(t)
	before = snapshot(t, dir)
	crash(t, dir, "rewrite", 1)
	j, _ := LoadJournal(dir)
	edited := filepath.Join(dir, filepath.FromSlash(j.Rewrites[len(j.Rewrites)-1].Path))
	orig := readFile(t, edited)
	if err := os.WriteFile(edited, []byte(orig+" "), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err = Recover(context.Background(), dir, Options{})
	if err != nil || out.Action != ActionRolledBack || !strings.Contains(out.Error, "changed since the plan") {
		t.Fatalf("recover = %+v, %v", out, err)
	}
	// Everything is back; the edited file keeps the user's edit.
	d := diffSnap(before, snapshot(t, dir))
	if len(d) != 1 || !strings.HasPrefix(d[0], "changed/missing ") {
		t.Fatalf("after rollback: %v", d)
	}
	if got := readFile(t, filepath.Join(dir, strings.TrimPrefix(d[0], "changed/missing "))); got != orig+" " {
		t.Errorf("edited file = %q", got)
	}
}

// The plan moves exactly the sidecars Pulse says travel with a cohort.
func TestCohortSidecarsMatchPulse(t *testing.T) {
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	writeTree(t, dir, map[string]string{
		"d/ab.pulse": "x", "d/ab.pulse.meta.json": "{}", "d/ab.pulse.spss.json": "{}", "d/ab.pulse.indexes.json": "{}",
		"d/ab.pulse.0123456789abcdef.idx": "", "d/ab.pulse.123.idx": "", "d/ab.pulse.other.json": "{}", "d/ab.pulsex.meta.json": "{}",
	})
	p, err := MakePlan(context.Background(), dir, Options{Git: "no-such-git-binary"})
	if err != nil || !p.Migratable {
		t.Fatalf("%v %+v", err, p)
	}
	var got []string
	for _, m := range p.Moves {
		if m.Kind == KindCohortSidecar {
			got = append(got, m.From)
		}
	}
	eng, err := pulse.New(pulse.Options{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	want, err := eng.CohortArtifacts(context.Background(), "d/ab.pulse")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(got)
	if strings.Join(got, ",") != filepath.ToSlash(strings.Join(want, ",")) {
		t.Errorf("plan sidecars %v, pulse %v", got, want)
	}
	if p.Git.Workspace != "none" || p.Git.Global != "none" {
		t.Errorf("git plan without git: %+v", p.Git)
	}
}

// A failure after the reference commit is not rolled back: the journal
// finishes it on the next start.
func TestApplyLateFailureResumes(t *testing.T) {
	dir := legacyRepo(t)
	failAt(t, "finalize", 1)
	_, err := Apply(context.Background(), dir, ApplyOptions{})
	var fe *FailedError
	if !errors.As(err, &fe) || fe.RolledBack || fe.Phase != PhaseFinalizing {
		t.Fatalf("err = %#v", err)
	}
	hook = nil
	if p, _ := MakePlan(context.Background(), dir, Options{}); p.Reason != ReasonInterrupted {
		t.Errorf("plan = %s", p.Reason)
	}
	out, err := Recover(context.Background(), dir, Options{NoGit: true})
	if err != nil || out.Action != ActionResumed {
		t.Fatalf("recover = %+v %v", out, err)
	}
	if _, err := os.Stat(filepath.Join(dir, library.MarkerFile)); err != nil {
		t.Error("library.json missing")
	}
}
