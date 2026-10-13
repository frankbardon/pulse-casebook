package library

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

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

func TestDetect(t *testing.T) {
	cases := []struct {
		name  string
		files map[string]string
		fresh bool
		err   bool
	}{
		{"empty", nil, true, false},
		{"dotfiles only", map[string]string{".DS_Store": "x", ".git/HEAD": "x"}, true, false},
		{"hidden dirs only", map[string]string{".cache/a.pulse": "x"}, true, false},
		{"marker", map[string]string{"library.json": `{"version": 1}`, "a.pulse": "x"}, false, false},
		{"unrelated files", map[string]string{"README.md": "x"}, false, true},
		{"flat folder", map[string]string{"req/a.json": `{"cohort": {"filename": "x.pulse"}}`, "x.pulse": "x"}, false, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			for rel, text := range c.files {
				write(t, dir, rel, text)
			}
			fresh, err := Detect(dir)
			if fresh != c.fresh || (err != nil) != c.err || (err != nil && !errors.Is(err, ErrNotLibrary)) {
				t.Fatalf("Detect = %v %v, want fresh %v err %v", fresh, err, c.fresh, c.err)
			}
		})
	}
}

func TestOpenFreshAndRefused(t *testing.T) {
	dir := t.TempDir()
	l, err := Open(dir)
	if err != nil || l.GlobalDir() != l.Dir() {
		t.Fatalf("Open fresh: %v %v", l, err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, MarkerFile)); string(b) != "{\"version\": 1}\n" {
		t.Fatalf("library.json = %q", b)
	}
	if list, err := l.Workspaces(); err != nil || len(list) != 0 {
		t.Fatalf("zero workspaces: %v %v", list, err)
	}
	// Reopening an initialised library works.
	if _, err := Open(dir); err != nil {
		t.Fatalf("reopen: %v", err)
	}

	flat := filepath.Join(t.TempDir(), "My Case")
	write(t, flat, "req/a.json", "{}")
	if _, err := Open(flat); !errors.Is(err, ErrNotLibrary) {
		t.Fatalf("Open flat folder: %v", err)
	}
	if _, err := os.Stat(filepath.Join(flat, MarkerFile)); err == nil {
		t.Fatal("refused folder got library.json")
	}
}

func TestWorkspaces(t *testing.T) {
	l, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC)
	a, err := l.CreateWorkspace("  Churn study ", "why they leave", now)
	if err != nil || a.Slug != "churn-study" || a.Name != "Churn study" || a.Created != "2026-10-13T09:00:00Z" {
		t.Fatalf("create = %+v %v", a, err)
	}
	for _, d := range []string{AnalysesDir, CohortsDir, SchemasDir, ImportsDir, SourcesDir} {
		if info, err := os.Stat(filepath.Join(a.Dir, d)); err != nil || !info.IsDir() {
			t.Errorf("%s missing", d)
		}
	}
	if b, _ := os.ReadFile(filepath.Join(a.Dir, WorkspaceFile)); string(b) != "{\n  \"name\": \"Churn study\",\n  \"description\": \"why they leave\",\n  \"created\": \"2026-10-13T09:00:00Z\"\n}\n" {
		t.Fatalf("workspace.json = %q", b)
	}
	b, _ := l.CreateWorkspace("churn STUDY!", "", now)
	if b.Slug != "churn-study-2" {
		t.Fatalf("dedupe slug = %s", b.Slug)
	}
	if _, err := l.CreateWorkspace(" ", "", now); !errors.Is(err, ErrBadName) {
		t.Fatalf("blank name: %v", err)
	}
	// Stray entries in workspaces/ are not workspaces.
	write(t, l.Dir(), "workspaces/_global/x", "x")
	write(t, l.Dir(), "workspaces/file.txt", "x")
	list, _ := l.Workspaces()
	if len(list) != 2 || list[0].Slug != "churn-study" || list[1].Slug != "churn-study-2" {
		t.Fatalf("list = %+v", list)
	}

	// Update edits workspace.json losslessly (unknown keys, order).
	write(t, a.Dir, WorkspaceFile, `{"created": "2026-01-01T00:00:00Z", "x-extra": [1, 2], "name": "Old", "description": "d"}`)
	name, empty := "New name", ""
	got, err := l.UpdateWorkspace("churn-study", &name, &empty)
	if err != nil || got.Name != "New name" || got.Description != "" || got.Slug != "churn-study" {
		t.Fatalf("update = %+v %v", got, err)
	}
	if b, _ := os.ReadFile(filepath.Join(a.Dir, WorkspaceFile)); string(b) != "{\n  \"created\": \"2026-01-01T00:00:00Z\",\n  \"x-extra\": [1, 2],\n  \"name\": \"New name\"\n}\n" {
		t.Fatalf("updated workspace.json = %q", b)
	}
	if _, err := l.UpdateWorkspace("nope", &name, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing: %v", err)
	}
	if _, err := l.UpdateWorkspace("churn-study", &empty, nil); !errors.Is(err, ErrBadName) {
		t.Fatalf("update blank: %v", err)
	}
	// A broken workspace.json still lists the workspace under its slug.
	write(t, b.Dir, WorkspaceFile, `{`)
	ws, err := l.Workspace("churn-study-2")
	if err != nil || ws.Name != "churn-study-2" || ws.Invalid == "" {
		t.Fatalf("broken metadata = %+v %v", ws, err)
	}
	if _, err := l.Workspace("../x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bad slug: %v", err)
	}
}

func TestSlugify(t *testing.T) {
	for in, want := range map[string]string{
		"Sales Q1":        "sales-q1",
		"  --Ünïcode-- ":  "n-code",
		"_global":         "global",
		"!!!":             "workspace",
		"a/b\\c":          "a-b-c",
		"ab-test-readout": "ab-test-readout",
	} {
		if got := Slugify(in); got != want || !ValidSlug(got) {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
	for _, s := range []string{"", "_global", ".git", "-a", "a-", "A"} {
		if ValidSlug(s) {
			t.Errorf("ValidSlug(%q)", s)
		}
	}
}
