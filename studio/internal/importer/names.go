package importer

import (
	"errors"
	"path"
	"strconv"
	"strings"
	"unicode"
)

// Workspace layout for imports. All three are directories at the
// workspace root; sources/ is gitignored (history.IgnorePatterns),
// schemas/ and imports/ are versioned.
const (
	SourcesDir = "sources"
	SchemasDir = "schemas"
	ImportsDir = "imports"

	SchemaSuffix = ".schema.json"
	SpecSuffix   = ".import.json"
)

// ErrBadName is returned for an upload, schema or cohort name that is
// empty, tries to leave its directory, or has nothing usable left after
// sanitizing.
var ErrBadName = errors.New("invalid name")

const maxNameLen = 120

// SanitizeUploadName turns a client-supplied upload file name into a
// safe base name for sources/. A name carrying a path (separators, a
// NUL, "." or "..") is refused outright rather than reduced to its base:
// browsers send bare names, so anything else is a traversal attempt.
// Otherwise letters, digits, '.', '-' and '_' are kept, runs of anything
// else become '_', leading dots are dropped (no hidden files) and the
// stem is shortened to keep the extension within maxNameLen.
func SanitizeUploadName(name string) (string, error) {
	if strings.ContainsAny(name, "/\\\x00") {
		return "", ErrBadName
	}
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || trimmed == "." || trimmed == ".." {
		return "", ErrBadName
	}
	var b strings.Builder
	under := false
	for _, r := range trimmed {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '-' || r == '_':
			b.WriteRune(r)
			under = false
		default:
			if !under {
				b.WriteByte('_')
				under = true
			}
		}
	}
	out := strings.TrimLeft(b.String(), "._")
	out = strings.TrimRight(out, "_")
	if out == "" || out == "." || out == ".." {
		return "", ErrBadName
	}
	if len(out) > maxNameLen {
		ext := path.Ext(out)
		if len(ext) > 16 {
			ext = ""
		}
		stem := strings.TrimSuffix(out, ext)
		for len(stem)+len(ext) > maxNameLen {
			r := []rune(stem)
			stem = string(r[:len(r)-1])
		}
		out = stem + ext
	}
	return out, nil
}

// DedupeName returns name, or name with "-2", "-3", ... before its
// extension, the first for which taken reports false.
func DedupeName(name string, taken func(string) bool) string {
	if !taken(name) {
		return name
	}
	ext := path.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for i := 2; ; i++ {
		c := stem + "-" + strconv.Itoa(i) + ext
		if !taken(c) {
			return c
		}
	}
}

// ValidName checks a schema or cohort name: 1-100 characters of letters,
// digits, '.', '-' and '_', starting with a letter or digit. It is the
// file stem, so it never contains a path.
func ValidName(name string) bool {
	if name == "" || len(name) > 100 {
		return false
	}
	for i, r := range name {
		ok := r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) || (i > 0 && (r == '.' || r == '-' || r == '_'))
		if !ok {
			return false
		}
	}
	return !strings.HasSuffix(name, ".")
}

// SchemaName normalizes a schema name: an optional ".schema.json" (or
// ".json") suffix is dropped. ok is false for an invalid name.
func SchemaName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	name = strings.TrimSuffix(name, SchemaSuffix)
	name = strings.TrimSuffix(name, ".json")
	return name, ValidName(name)
}

// SchemaPath is the workspace path of a saved schema.
func SchemaPath(name string) string { return SchemasDir + "/" + name + SchemaSuffix }

// TargetPath resolves an import target: a bare cohort name ("sales")
// becomes "sales.pulse" at the workspace root; a path must end in
// ".pulse". ok is false for an empty target, a non-.pulse path, or one
// whose cohort stem is not a ValidName. The result is slash-separated
// and not yet scoped (the caller resolves it against the workspace).
func TargetPath(target string) (rel string, ok bool) {
	t := strings.TrimSpace(target)
	if t == "" {
		return "", false
	}
	if !strings.HasSuffix(strings.ToLower(t), ".pulse") {
		if strings.ContainsAny(t, "/\\") {
			return "", false
		}
		t += ".pulse"
	}
	if !ValidName(CohortName(t)) {
		return "", false
	}
	return t, true
}

// CohortName is a target's cohort name: its base without ".pulse".
func CohortName(target string) string {
	base := path.Base(strings.ReplaceAll(target, "\\", "/"))
	if i := strings.LastIndex(strings.ToLower(base), ".pulse"); i >= 0 && i == len(base)-len(".pulse") {
		base = base[:i]
	}
	return base
}

// SpecPath is the workspace path of the import spec for a target.
func SpecPath(target string) string { return ImportsDir + "/" + CohortName(target) + SpecSuffix }
