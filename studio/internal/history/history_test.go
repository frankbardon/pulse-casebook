package history

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// isolate makes git in this test ignore the developer's global and system
// config and never look above base for a repository, so tests can only
// create commits in their own temp repos. It returns base.
func isolate(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	base := t.TempDir()
	base, _ = filepath.EvalSymlinks(base)
	empty := filepath.Join(base, ".gitconfig-empty")
	if err := os.WriteFile(empty, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", empty)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_CEILING_DIRECTORIES", base)
	for _, k := range []string{"GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
	return base
}

func write(t *testing.T, dir, rel, text string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func TestOpenInitsAndSnapshots(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "ws")
	write(t, ws, "req/a.json", `{"cohort":{}}`)
	write(t, ws, "req/a.layout.json", `{"version":1}`)
	write(t, ws, "data/big.csv", "x\n1\n")
	write(t, ws, "c.pulse", "binary")
	write(t, ws, "sources/up.json", `{}`)

	r := Open(context.Background(), ws, Options{}, t.Logf)
	st := r.Status()
	if !st.Enabled || !st.Initialized || st.RepoRoot != ws || st.Prefix != "" {
		t.Fatalf("status = %+v", st)
	}
	files := git(t, ws, "ls-files")
	want := ".gitignore\nreq/a.json\nreq/a.layout.json"
	if files != want {
		t.Fatalf("snapshot tracks %q, want %q", files, want)
	}
	if author := git(t, ws, "log", "-1", "--format=%an <%ae>|%s"); author != "Pulse Studio <studio@localhost>|studio: initial snapshot" {
		t.Fatalf("snapshot commit = %q", author)
	}
	// Re-opening is idempotent: no new commit, .gitignore unchanged.
	gi, _ := os.ReadFile(filepath.Join(ws, ".gitignore"))
	r2 := Open(context.Background(), ws, Options{}, t.Logf)
	if r2.Status().Initialized {
		t.Fatal("second open re-initialized")
	}
	if n := git(t, ws, "rev-list", "--count", "HEAD"); n != "1" {
		t.Fatalf("commits after reopen = %s", n)
	}
	gi2, _ := os.ReadFile(filepath.Join(ws, ".gitignore"))
	if string(gi) != string(gi2) {
		t.Fatal(".gitignore changed on reopen")
	}
}

func TestOpenEmptyWorkspace(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "empty")
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatal(err)
	}
	r := Open(context.Background(), ws, Options{}, t.Logf)
	if !r.Enabled() {
		t.Fatalf("status = %+v", r.Status())
	}
	if files := git(t, ws, "ls-files"); files != ".gitignore" {
		t.Fatalf("tracked = %q", files)
	}
}

func TestCommitOnlyTouchedPaths(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "ws")
	write(t, ws, "req/a.json", "1")
	write(t, ws, "req/b.json", "1")
	r := Open(context.Background(), ws, Options{}, t.Logf)
	ctx := context.Background()

	// The user edits b and stages an unrelated file outside the studio.
	write(t, ws, "req/b.json", "user edit")
	write(t, ws, "notes.txt", "staged by user")
	git(t, ws, "add", "notes.txt")

	write(t, ws, "req/a.json", "2")
	c, err := r.Commit(ctx, "studio: save req/a.json", "req/a.json")
	if err != nil || c == nil {
		t.Fatalf("commit = %v, %v", c, err)
	}
	if c.Message != "studio: save req/a.json" || len(c.Rev) != 40 || c.Short == "" || c.Author != FallbackName {
		t.Fatalf("commit = %+v", c)
	}
	if got := git(t, ws, "show", "--name-only", "--format=", "HEAD"); got != "req/a.json" {
		t.Fatalf("commit touched %q", got)
	}
	// The user's staged file is still staged, their edit still unstaged.
	if got := git(t, ws, "diff", "--cached", "--name-only"); got != "notes.txt" {
		t.Fatalf("staged after commit = %q", got)
	}
	if got := git(t, ws, "diff", "--name-only"); got != "req/b.json" {
		t.Fatalf("modified after commit = %q", got)
	}

	// Nothing changed: no commit.
	if c, err := r.Commit(ctx, "studio: save req/a.json", "req/a.json"); err != nil || c != nil {
		t.Fatalf("no-op commit = %v, %v", c, err)
	}
	// Ignored and missing untracked paths are skipped.
	write(t, ws, "x.pulse", "bin")
	if c, err := r.Commit(ctx, "studio: cohort", "x.pulse", "nope.json"); err != nil || c != nil {
		t.Fatalf("ignored commit = %v, %v", c, err)
	}
	// New files and odd names (pathspec magic characters) commit literally.
	write(t, ws, "req/new [1]*.json", "{}")
	write(t, ws, "req/new 1.json", "{}")
	c, err = r.Commit(ctx, "studio: create", "req/new [1]*.json")
	if err != nil || c == nil {
		t.Fatalf("create commit = %v, %v", c, err)
	}
	if got := git(t, ws, "show", "--name-only", "--format=", "HEAD"); got != "req/new [1]*.json" {
		t.Fatalf("commit touched %q", got)
	}
	// A tracked file removed from disk commits its deletion.
	os.Remove(filepath.Join(ws, "req/a.json"))
	if c, err := r.Commit(ctx, "studio: delete", "req/a.json"); err != nil || c == nil {
		t.Fatalf("delete commit = %v, %v", c, err)
	}
	// Escaping paths are refused.
	if _, err := r.Commit(ctx, "x", "../outside.json"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("escape err = %v", err)
	}
}

func TestCommitUsesConfiguredAuthor(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "ws")
	write(t, ws, "a.json", "1")
	git(t, base, "init", "-q", ws)
	git(t, ws, "config", "user.name", "Ada")
	git(t, ws, "config", "user.email", "ada@example.com")
	r := Open(context.Background(), ws, Options{}, t.Logf)
	write(t, ws, "a.json", "2")
	c, err := r.Commit(context.Background(), "studio: save a.json", "a.json")
	if err != nil || c == nil || c.Author != "Ada" || c.Email != "ada@example.com" {
		t.Fatalf("commit = %+v, %v", c, err)
	}
}

func TestEnclosingRepo(t *testing.T) {
	base := isolate(t)
	outer := filepath.Join(base, "outer")
	ws := filepath.Join(outer, "cases", "ab")
	write(t, outer, "README.md", "outer")
	write(t, ws, "req/a.json", "1")
	git(t, base, "init", "-q", outer)
	git(t, outer, "add", "-A")
	git(t, outer, "-c", "user.name=T", "-c", "user.email=t@x", "commit", "-qm", "outer init")

	// Unrelated dirty files elsewhere in the outer repo.
	write(t, outer, "README.md", "changed by user")
	write(t, outer, "other/new.json", "{}")

	r := Open(context.Background(), ws, Options{}, t.Logf)
	st := r.Status()
	if !st.Enabled || st.Initialized || st.RepoRoot != outer || st.Prefix != "cases/ab/" {
		t.Fatalf("status = %+v", st)
	}
	if _, err := os.Stat(filepath.Join(ws, ".git")); err == nil {
		t.Fatal("nested repository created")
	}
	// The managed .gitignore was committed inside the workspace only.
	if got := git(t, outer, "show", "--name-only", "--format=%s", "HEAD"); got != "studio: manage .gitignore\n\ncases/ab/.gitignore" {
		t.Fatalf("gitignore commit = %q", got)
	}
	write(t, ws, "req/a.json", "2")
	if _, err := r.Commit(context.Background(), "studio: save req/a.json", "req/a.json"); err != nil {
		t.Fatal(err)
	}
	if got := git(t, outer, "show", "--name-only", "--format=", "HEAD"); got != "cases/ab/req/a.json" {
		t.Fatalf("commit touched %q", got)
	}
	if got := git(t, outer, "status", "--porcelain"); got != "M README.md\n?? other/" {
		t.Fatalf("outer status = %q", got)
	}
	log, err := r.Log(context.Background(), "req/a.json", 10)
	if err != nil || len(log) != 2 || log[0].Message != "studio: save req/a.json" || log[1].Message != "outer init" {
		t.Fatalf("log = %+v, %v", log, err)
	}
	old, err := r.Show(context.Background(), log[1].Short, "req/a.json", 1<<20)
	if err != nil || string(old) != "1" {
		t.Fatalf("show = %q, %v", old, err)
	}
}

func TestIgnoredWorkspaceInRepoIsDisabled(t *testing.T) {
	base := isolate(t)
	outer := filepath.Join(base, "outer")
	write(t, outer, ".gitignore", "scratch/\n")
	write(t, outer, "scratch/ws/a.json", "1")
	git(t, base, "init", "-q", outer)
	r := Open(context.Background(), filepath.Join(outer, "scratch", "ws"), Options{}, t.Logf)
	if r.Enabled() || !strings.Contains(r.Status().Reason, "ignored") {
		t.Fatalf("status = %+v", r.Status())
	}
	if _, err := os.Stat(filepath.Join(outer, "scratch", "ws", ".git")); err == nil {
		t.Fatal("nested repository created")
	}
}

func TestDisabledAndMissingGit(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "ws")
	write(t, ws, "a.json", "1")
	r := Open(context.Background(), ws, Options{Disabled: true}, nil)
	if r.Enabled() || !r.Status().Available || !strings.Contains(r.Status().Reason, "--no-git") {
		t.Fatalf("status = %+v", r.Status())
	}
	if _, err := os.Stat(filepath.Join(ws, ".git")); err == nil {
		t.Fatal("--no-git initialized a repository")
	}
	if c, err := r.Commit(context.Background(), "x", "a.json"); c != nil || err != nil {
		t.Fatalf("disabled commit = %v, %v", c, err)
	}
	if _, err := r.Log(context.Background(), "a.json", 1); !errors.Is(err, ErrDisabled) {
		t.Fatalf("disabled log err = %v", err)
	}

	m := Open(context.Background(), ws, Options{Git: filepath.Join(base, "no-such-git")}, nil)
	if m.Enabled() || m.Status().Available || !strings.Contains(m.Status().Reason, "not installed") {
		t.Fatalf("missing git status = %+v", m.Status())
	}
	var nilRepo *Repo
	if nilRepo.Enabled() || nilRepo.Status().Enabled {
		t.Fatal("nil repo enabled")
	}
	if c, err := nilRepo.Commit(context.Background(), "x", "a.json"); c != nil || err != nil {
		t.Fatalf("nil commit = %v, %v", c, err)
	}
}

func TestLogShowResolve(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "ws")
	write(t, ws, "a.json", "v1")
	r := Open(context.Background(), ws, Options{}, t.Logf)
	ctx := context.Background()
	write(t, ws, "a.json", "v2")
	c2, _ := r.Commit(ctx, "studio: save a.json", "a.json")
	write(t, ws, "b.json", "b")
	if _, err := r.Commit(ctx, "studio: save b.json", "b.json"); err != nil {
		t.Fatal(err)
	}

	log, err := r.Log(ctx, "a.json", 0)
	if err != nil || len(log) != 2 || log[0].Rev != c2.Rev || log[1].Message != "studio: initial snapshot" {
		t.Fatalf("log = %+v, %v", log, err)
	}
	if log[0].Time == "" || log[0].Author != FallbackName {
		t.Fatalf("log entry = %+v", log[0])
	}
	if l, err := r.Log(ctx, "never.json", 5); err != nil || len(l) != 0 {
		t.Fatalf("empty log = %v, %v", l, err)
	}
	got, err := r.Show(ctx, log[1].Short, "a.json", 100)
	if err != nil || string(got) != "v1" {
		t.Fatalf("show = %q, %v", got, err)
	}
	if _, err := r.Show(ctx, log[1].Rev, "b.json", 100); !errors.Is(err, ErrNotAtRev) {
		t.Fatalf("missing-at-rev err = %v", err)
	}
	if _, err := r.Show(ctx, c2.Rev, "a.json", 1); err == nil {
		t.Fatal("size cap not enforced")
	}
	for _, bad := range []string{"HEAD", "--all", "main~1", "abc"} {
		if _, err := r.Resolve(ctx, bad); !errors.Is(err, ErrBadRev) {
			t.Errorf("Resolve(%q) err = %v, want ErrBadRev", bad, err)
		}
	}
	if _, err := r.Resolve(ctx, strings.Repeat("0", 40)); !errors.Is(err, ErrUnknownRev) {
		t.Fatalf("unknown rev err = %v", err)
	}
}

func TestConcurrentCommitsSerialize(t *testing.T) {
	base := isolate(t)
	ws := filepath.Join(base, "ws")
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatal(err)
	}
	r := Open(context.Background(), ws, Options{}, t.Logf)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := range 8 {
		name := "f" + string(rune('a'+i)) + ".json"
		write(t, ws, name, "{}")
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := r.Commit(context.Background(), "studio: save "+name, name); err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	if n := git(t, ws, "rev-list", "--count", "HEAD"); n != "9" {
		t.Fatalf("commits = %s, want 9", n)
	}
}

func TestMergeIgnore(t *testing.T) {
	block := string(ignoreBlock(IgnorePatterns))
	tests := []struct {
		name, src, want string
	}{
		{"empty", "", block},
		{"user lines kept", "node_modules/\n*.log", "node_modules/\n*.log\n\n" + block},
		{"block replaced in place", "a\n" + ignoreBegin + "\nold\n" + ignoreEnd + "\nb\n", "a\n" + block + "b\n"},
		{"unterminated block runs to end", "a\n" + ignoreBegin + "\nold\n", "a\n" + block},
		{"crlf block", "a\r\n" + ignoreBegin + "\r\nold\r\n" + ignoreEnd + "\r\nb\r\n", "a\r\n" + block + "b\r\n"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := string(MergeIgnore([]byte(tc.src)))
			if got != tc.want {
				t.Fatalf("MergeIgnore = %q, want %q", got, tc.want)
			}
			if again := string(MergeIgnore([]byte(got))); again != got {
				t.Fatalf("not idempotent: %q", again)
			}
		})
	}
}

// A standalone area inside another repository (a library workspace
// under the global repository, which ignores workspaces/) gets its own
// repository with its own managed patterns; reopening keeps it.
func TestStandaloneNestedRepo(t *testing.T) {
	base := isolate(t)
	lib := filepath.Join(base, "lib")
	ws := filepath.Join(lib, "workspaces", "w")
	write(t, lib, "library.json", "{}")
	write(t, ws, "workspace.json", `{"name": "w"}`)
	g := Open(context.Background(), lib, Options{Standalone: true, Ignore: GlobalIgnorePatterns}, t.Logf)
	if st := g.Status(); !st.Enabled || !st.Initialized || st.RepoRoot != lib {
		t.Fatalf("global status = %+v", st)
	}
	if got := git(t, lib, "ls-files"); got != ".gitignore\nlibrary.json" {
		t.Fatalf("global files = %q", got)
	}
	r := Open(context.Background(), ws, Options{Standalone: true}, t.Logf)
	if st := r.Status(); !st.Enabled || !st.Initialized || st.RepoRoot != ws || st.Prefix != "" {
		t.Fatalf("workspace status = %+v", st)
	}
	if got := git(t, ws, "ls-files"); got != ".gitignore\nworkspace.json" {
		t.Fatalf("workspace files = %q", got)
	}
	if ig, _ := os.ReadFile(filepath.Join(ws, ".gitignore")); strings.Contains(string(ig), "/workspaces/") || strings.Contains(string(ig), "/exports/") {
		t.Fatalf("workspace .gitignore = %q", ig)
	}
	if ig, _ := os.ReadFile(filepath.Join(lib, ".gitignore")); !strings.Contains(string(ig), "/workspaces/") {
		t.Fatalf("global .gitignore = %q", ig)
	}
	if got := git(t, lib, "status", "--porcelain", "--untracked-files=all"); got != "" {
		t.Fatalf("global status = %q", got)
	}
	again := Open(context.Background(), ws, Options{Standalone: true}, t.Logf)
	if st := again.Status(); !st.Enabled || st.Initialized || st.RepoRoot != ws {
		t.Fatalf("reopened status = %+v", st)
	}
}
