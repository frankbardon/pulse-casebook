package scope

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolve(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "root")
	outside := filepath.Join(base, "outside")
	for _, d := range []string{filepath.Join(root, "req"), outside} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite(t, filepath.Join(root, "req", "a.json"))
	mustWrite(t, filepath.Join(outside, "secret.json"))
	mustSymlink(t, outside, filepath.Join(root, "escape-dir"))
	mustSymlink(t, filepath.Join(outside, "secret.json"), filepath.Join(root, "escape-file.json"))
	mustSymlink(t, filepath.Join(root, "req"), filepath.Join(root, "inner-link"))
	mustSymlink(t, "../outside/secret.json", filepath.Join(root, "relative-escape.json"))

	r, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	realRoot := r.Dir()

	tests := []struct {
		name string
		rel  string
		want string // relative to root; ignored when wantErr
		ok   bool
	}{
		{"empty is root", "", ".", true},
		{"dot is root", ".", ".", true},
		{"plain file", "req/a.json", "req/a.json", true},
		{"not yet existing file", "req/new.layout.json", "req/new.layout.json", true},
		{"not yet existing dir", "out/x/y.json", "out/x/y.json", true},
		{"internal dotdot that stays inside", "req/../req/a.json", "req/a.json", true},
		{"symlink staying inside", "inner-link/a.json", "req/a.json", true},
		{"parent traversal", "../outside/secret.json", "", false},
		{"bare parent", "..", "", false},
		{"deep traversal", "req/../../outside", "", false},
		{"absolute path", "/etc/passwd", "", false},
		{"absolute path into root", filepath.ToSlash(filepath.Join(realRoot, "req", "a.json")), "", false},
		{"symlinked dir escaping", "escape-dir/secret.json", "", false},
		{"symlinked dir escaping, new file", "escape-dir/new.json", "", false},
		{"symlinked file escaping", "escape-file.json", "", false},
		{"relative symlink escaping", "relative-escape.json", "", false},
		{"nul byte", "req/a.json\x00", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := r.Resolve(tc.rel)
			if !tc.ok {
				if err == nil {
					t.Fatalf("Resolve(%q) = %q, want error", tc.rel, got)
				}
				if !errors.Is(err, ErrOutside) {
					t.Fatalf("Resolve(%q) error = %v, want ErrOutside", tc.rel, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("Resolve(%q) error: %v", tc.rel, err)
			}
			want := filepath.Join(realRoot, filepath.FromSlash(tc.want))
			if got != want {
				t.Fatalf("Resolve(%q) = %q, want %q", tc.rel, got, want)
			}
		})
	}
}

func TestNewRejectsFile(t *testing.T) {
	f := filepath.Join(t.TempDir(), "f.json")
	mustWrite(t, f)
	if _, err := New(f); err == nil {
		t.Fatal("New on a file: want error")
	}
	if _, err := New(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("New on a missing dir: want error")
	}
}

func mustWrite(t *testing.T, p string) {
	t.Helper()
	if err := os.WriteFile(p, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mustSymlink(t *testing.T, target, link string) {
	t.Helper()
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
}
