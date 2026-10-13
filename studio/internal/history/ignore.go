package history

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// The managed block of the workspace .gitignore. Binaries are not
// versioned: cohorts are rebuilt from the versioned schemas and import
// specs, uploaded sources are recorded by hash in the import specs, and
// cohort exports (exports/) are reproducible outputs.
// Lines outside the markers belong to the user and are never touched.
const (
	ignoreBegin = "# >>> pulse studio (managed block: edits between these markers are replaced)"
	ignoreEnd   = "# <<< pulse studio"
)

// IgnorePatterns are the managed block's lines.
var IgnorePatterns = []string{
	"*.pulse",
	"/sources/",
	"/exports/",
	"/.studio/",
	".*.tmp",
}

func ignoreBlock() []byte {
	var b bytes.Buffer
	b.WriteString(ignoreBegin + "\n")
	for _, p := range IgnorePatterns {
		b.WriteString(p + "\n")
	}
	b.WriteString(ignoreEnd + "\n")
	return b.Bytes()
}

// MergeIgnore returns src with the managed block set to the current
// patterns: replaced in place when present (an unterminated block runs
// to the end of the file), appended otherwise. It is idempotent.
func MergeIgnore(src []byte) []byte {
	block := ignoreBlock()
	begin := lineIndex(src, ignoreBegin, 0)
	if begin < 0 {
		out := append([]byte{}, src...)
		if len(out) > 0 && out[len(out)-1] != '\n' {
			out = append(out, '\n')
		}
		if len(out) > 0 {
			out = append(out, '\n')
		}
		return append(out, block...)
	}
	end := len(src)
	if e := lineIndex(src, ignoreEnd, begin); e >= 0 {
		end = e + len(ignoreEnd)
		if end < len(src) && src[end] == '\r' {
			end++
		}
		if end < len(src) && src[end] == '\n' {
			end++
		}
	}
	out := append([]byte{}, src[:begin]...)
	out = append(out, block...)
	return append(out, src[end:]...)
}

// lineIndex finds line (a whole line) in src at or after from.
func lineIndex(src []byte, line string, from int) int {
	for i := from; i < len(src); {
		j := bytes.IndexByte(src[i:], '\n')
		next := len(src)
		if j >= 0 {
			next = i + j + 1
		}
		if string(bytes.TrimRight(src[i:next], "\r\n")) == line {
			return i
		}
		i = next
	}
	return -1
}

// EnsureIgnore writes the managed block into the .gitignore at file,
// creating it if needed. It reports whether the file changed.
func EnsureIgnore(file string) (bool, error) {
	src, err := os.ReadFile(file)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	out := MergeIgnore(src)
	if bytes.Equal(out, src) {
		return false, nil
	}
	mode := fs.FileMode(0o644)
	if info, err := os.Stat(file); err == nil {
		mode = info.Mode().Perm()
	}
	tmp, err := os.CreateTemp(filepath.Dir(file), ".gitignore.*.tmp")
	if err != nil {
		return false, err
	}
	name := tmp.Name()
	if _, err := tmp.Write(out); err != nil {
		_ = tmp.Close()
		_ = os.Remove(name)
		return false, err
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		_ = os.Remove(name)
		return false, err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(name)
		return false, err
	}
	if err := os.Rename(name, file); err != nil {
		_ = os.Remove(name)
		return false, err
	}
	return true, nil
}
