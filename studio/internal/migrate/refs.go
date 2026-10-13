package migrate

import (
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/refedit"
)

// resolver maps a legacy reference to where its file moves
// (refedit.Mapper).
type resolver struct {
	dir  string
	dest map[string]Move // legacy rel → move (workspace-relative To)
}

// Map resolves a reference against the legacy folder and returns the
// workspace path it must name after the move ("" + a warning when it
// stays as it is).
func (r *resolver) Map(written string, cands []string) (string, string, *refedit.Issue) {
	if len(cands) == 0 {
		return "", "", &refedit.Issue{Code: "ref_unresolvable", Message: "the reference is absolute or escapes the folder: left as it is"}
	}
	found, ok := refedit.FirstFile(r.dir, cands)
	if !ok {
		return "", "", &refedit.Issue{Code: "ref_missing", Message: "no file at " + strings.Join(cands, ", ") + ": the reference is left as it is"}
	}
	to, ok := r.newPath(found)
	if !ok {
		return "", "", &refedit.Issue{Code: "ref_outside", Message: found + " does not move into the workspace: the reference is left as it is"}
	}
	return found, to, nil
}

// newPath is where a legacy file ends up, workspace-relative. ok is
// false when it does not move into the workspace (.studio, .git).
func (r *resolver) newPath(rel string) (string, bool) {
	if m, ok := r.dest[rel]; ok {
		return m.To, true
	}
	for d := slashDir(rel); d != ""; d = slashDir(d) {
		if m, ok := r.dest[d]; ok && m.Dir {
			return m.To + rel[len(d):], true
		}
	}
	return "", false
}

var (
	quote    = refedit.Quote
	slashDir = refedit.SlashDir
)
