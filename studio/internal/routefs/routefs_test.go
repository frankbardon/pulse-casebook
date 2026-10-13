package routefs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/afero"
)

func TestRouting(t *testing.T) {
	ws, global := t.TempDir(), t.TempDir()
	write := func(dir, rel, s string) {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(ws, "cohorts/a.pulse", "local")
	write(global, "cohorts/a.pulse", "global")
	write(global, "workspaces/other/cohorts/a.pulse", "other")
	fs := New(ws, map[string]Mount{"_global": {Dir: global, Deny: []string{"workspaces"}}})

	cases := map[string]string{
		"cohorts/a.pulse":                    "local",
		"/cohorts/a.pulse":                   "local",
		"_global/cohorts/a.pulse":            "global",
		"cohorts/../_global/cohorts/a.pulse": "global",
		"./_global/./cohorts/a.pulse":        "global",
	}
	for name, want := range cases {
		got, err := afero.ReadFile(fs, name)
		if err != nil || string(got) != want {
			t.Errorf("%s = %q, %v; want %q", name, got, err, want)
		}
	}
	for _, name := range []string{"_global/workspaces/other/cohorts/a.pulse", "../x", "_global/../../x", "cohorts/b.pulse"} {
		if _, err := afero.ReadFile(fs, name); err == nil {
			t.Errorf("%s readable", name)
		}
	}
	// The mmap probe sees the real file; denied paths decline.
	if p, err := fs.RealPath("_global/cohorts/a.pulse"); err != nil || p != filepath.Join(global, "cohorts/a.pulse") {
		t.Errorf("RealPath = %q, %v", p, err)
	}
	if _, err := fs.RealPath("_global/workspaces/other/cohorts/a.pulse"); err == nil {
		t.Error("RealPath of a denied path")
	}
	// Opened files stay BasePathFiles (Pulse unwraps them for ReadAt).
	f, err := fs.Open("_global/cohorts/a.pulse")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, ok := f.(*afero.BasePathFile); !ok {
		t.Errorf("open returned %T", f)
	}
	// Writes route too; renames never cross areas.
	if err := afero.WriteFile(fs, "_global/cohorts/new.pulse", []byte("n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(global, "cohorts/new.pulse")); err != nil {
		t.Errorf("write did not land in the global area: %v", err)
	}
	if err := afero.WriteFile(fs, "_global/workspaces/other/x", []byte("n"), 0o644); err == nil {
		t.Error("write into a denied path")
	}
	if err := fs.Rename("_global/cohorts/new.pulse", "cohorts/new.pulse"); !errors.Is(err, ErrCrossMount) {
		t.Errorf("cross-mount rename: %v", err)
	}
}
