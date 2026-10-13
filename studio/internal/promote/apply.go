package promote

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/frankbardon/pulse-casebook/studio/internal/fileops"
	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/refedit"
)

// JournalPath is a running promotion's journal (library-relative).
const JournalPath = ".studio/promotion.json"

// trashDir holds local copies a merge removes until the promotion is
// done (library-relative; rollback moves them back).
const trashDir = ".studio/promotion-trash"

// Journal phases, in order. Before PhaseCommitting a failure is rolled
// back; from it on the files are in place and only the commits remain.
const (
	PhaseMoving     = "moving"
	PhaseRewriting  = "rewriting"
	PhaseCommitting = "committing"
)

// Journal is .studio/promotion.json: everything needed to finish or
// undo a promotion. Every step is idempotent.
type Journal struct {
	Version   int        `json:"version"`
	Started   string     `json:"started"`
	Phase     string     `json:"phase"`
	PlanID    string     `json:"plan_id"`
	Kind      string     `json:"kind"`
	Workspace string     `json:"workspace"`
	Item      Item       `json:"item"`
	Moves     []jMove    `json:"moves"`
	Rewrites  []jRewrite `json:"rewrites"`
	// Dirs the moves create (removed again on rollback when empty).
	Dirs []string `json:"dirs"`
	// Paths committed in each repository and the messages.
	WorkspacePaths []string `json:"workspace_paths"`
	GlobalPaths    []string `json:"global_paths"`
	Commits        Commits  `json:"commits"`
}

// jMove is a move as performed (To is the trash for a merge).
type jMove struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type jRewrite struct {
	Path   string    `json:"path"`
	Before string    `json:"before"`
	After  string    `json:"after"`
	Mtime  time.Time `json:"mtime,omitzero"`
}

// ApplyOptions configures Apply.
type ApplyOptions struct {
	// PlanID, when set, must equal the fresh plan's ID.
	PlanID string
	// WorkspaceRepo and GlobalRepo receive the commits (nil: none).
	WorkspaceRepo, GlobalRepo *history.Repo
	// Logf receives progress lines (nil: discard).
	Logf func(string, ...any)
	// Now stamps the journal (nil: time.Now).
	Now func() time.Time
}

func (o ApplyOptions) logf(format string, args ...any) {
	if o.Logf != nil {
		o.Logf(format, args...)
	}
}

// Result is a finished promotion.
type Result struct {
	PlanID    string          `json:"plan_id"`
	Kind      string          `json:"kind"`
	Workspace string          `json:"workspace"`
	Item      Item            `json:"item"`
	Schema    *Item           `json:"schema,omitempty"`
	Moved     int             `json:"moved"`
	Rewritten int             `json:"rewritten"`
	Commits   ResultCommits   `json:"commits"`
	Warnings  []refedit.Issue `json:"warnings"`
}

// ResultCommits are the commits made (nil when history is off or there
// was nothing to commit).
type ResultCommits struct {
	Workspace *history.Commit `json:"workspace,omitempty"`
	Global    *history.Commit `json:"global,omitempty"`
}

// PlanChangedError: the files changed since the plan the caller saw.
type PlanChangedError struct{ Plan *Plan }

func (e *PlanChangedError) Error() string { return "the promotion plan changed: review it again" }

// FailedError: the promotion failed part way. RolledBack says whether
// everything was restored; otherwise the journal is left for Recover.
type FailedError struct {
	Err        error
	RolledBack bool
	Phase      string
}

func (e *FailedError) Error() string {
	state := "the journal was kept for the next start"
	if e.RolledBack {
		state = "it was rolled back"
	}
	return fmt.Sprintf("promotion failed while %s (%s): %v", e.Phase, state, e.Err)
}

func (e *FailedError) Unwrap() error { return e.Err }

// ErrInterrupted: an earlier promotion's journal is still present.
var ErrInterrupted = errors.New("an interrupted promotion's journal (" + JournalPath + ") is present: restart the studio to roll it back")

// hook, when set by tests, runs before each step ("move", "rewrite",
// "commit"); an error simulates a crash there.
var hook func(step string) error

func step(name string) error {
	if hook != nil {
		return hook(name)
	}
	return nil
}

// Apply plans req again, refuses a changed plan, then moves, rewrites
// and commits. A failure before the commits is rolled back.
func Apply(ctx context.Context, lib *library.Library, req Request, opts ApplyOptions) (*Result, error) {
	if j, err := LoadJournal(lib.Dir()); err != nil || j != nil {
		if err == nil {
			err = ErrInterrupted
		}
		return nil, err
	}
	plan, err := MakePlan(ctx, lib, req)
	if err != nil {
		return nil, err
	}
	if opts.PlanID != "" && opts.PlanID != plan.ID {
		return nil, &PlanChangedError{Plan: plan}
	}
	now := time.Now
	if opts.Now != nil {
		now = opts.Now
	}
	dir := lib.Dir()
	j := newJournal(plan, now())
	if err := saveJournal(dir, j); err != nil {
		return nil, fmt.Errorf("write the promotion journal: %w", err)
	}
	opts.logf("promote: %s %s of workspace %s → %s (%d moves, %d rewrites)", plan.Kind, plan.Item.Path, plan.Workspace, plan.Item.GlobalPath, len(j.Moves), len(j.Rewrites))
	if err := forward(dir, j); err != nil {
		fe := &FailedError{Err: err, Phase: j.Phase}
		if rerr := rollback(dir, j); rerr != nil {
			opts.logf("promote: rollback failed: %v", rerr)
		} else {
			fe.RolledBack = true
		}
		return nil, fe
	}
	if err := step("commit"); err != nil {
		return nil, &FailedError{Err: err, Phase: j.Phase}
	}
	commits := commit(ctx, dir, j, opts.WorkspaceRepo, opts.GlobalRepo, opts.logf)
	if err := finish(dir); err != nil {
		opts.logf("promote: %v", err)
	}
	return &Result{PlanID: plan.ID, Kind: plan.Kind, Workspace: plan.Workspace, Item: plan.Item, Schema: plan.Schema,
		Moved: len(plan.Moves), Rewritten: len(plan.Rewrites), Commits: commits, Warnings: plan.Warnings}, nil
}

func newJournal(p *Plan, now time.Time) *Journal {
	j := &Journal{Version: 1, Started: now.UTC().Format(time.RFC3339), Phase: PhaseMoving, PlanID: p.ID, Kind: p.Kind,
		Workspace: p.Workspace, Item: p.Item, Moves: []jMove{}, Rewrites: []jRewrite{}, Dirs: []string{}, Commits: p.Commits,
		WorkspacePaths: uniq(p.wsPaths), GlobalPaths: uniq(p.glPaths)}
	created := map[string]bool{}
	for i, m := range p.Moves {
		to := m.To
		if m.Action == ActionMerge {
			to = fmt.Sprintf("%s/%d/%s", trashDir, i, filepath.Base(m.From))
		}
		j.Moves = append(j.Moves, jMove{From: m.From, To: to})
		for d := refedit.SlashDir(to); d != ""; d = refedit.SlashDir(d) {
			if !created[d] && !exists(filepath.Join(p.libDir, filepath.FromSlash(d))) {
				created[d] = true
				j.Dirs = append(j.Dirs, d)
			}
		}
	}
	for _, r := range p.Rewrites {
		jr := jRewrite{Path: r.Path, Before: string(r.before), After: string(r.after)}
		from := r.Path
		if r.From != "" {
			from = r.From
		}
		if info, err := os.Stat(filepath.Join(p.libDir, filepath.FromSlash(from))); err == nil {
			jr.Mtime = info.ModTime()
		}
		j.Rewrites = append(j.Rewrites, jr)
	}
	return j
}

// forward performs the moves and the rewrites, advancing the journal.
func forward(dir string, j *Journal) error {
	abs := func(rel string) string { return filepath.Join(dir, filepath.FromSlash(rel)) }
	if j.Phase == PhaseMoving {
		for _, m := range j.Moves {
			if err := step("move"); err != nil {
				return err
			}
			if err := fileops.Move(abs(m.From), abs(m.To)); err != nil {
				return fmt.Errorf("move %s: %w", m.From, err)
			}
		}
		if err := advance(dir, j, PhaseRewriting); err != nil {
			return err
		}
	}
	if j.Phase == PhaseRewriting {
		for _, r := range j.Rewrites {
			if err := step("rewrite"); err != nil {
				return err
			}
			if err := rewriteOne(abs(r.Path), r); err != nil {
				return fmt.Errorf("rewrite %s: %w", r.Path, err)
			}
		}
		removeEmptyParents(dir, j)
		if err := advance(dir, j, PhaseCommitting); err != nil {
			return err
		}
	}
	return nil
}

// advance records the next phase (the journal keeps the old one when
// that fails).
func advance(dir string, j *Journal, phase string) error {
	old := j.Phase
	j.Phase = phase
	if err := saveJournal(dir, j); err != nil {
		j.Phase = old
		return err
	}
	return nil
}

// rewriteOne writes r.After over a file holding r.Before (keeping its
// mode); already done when it holds r.After.
func rewriteOne(file string, r jRewrite) error {
	cur, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	if string(cur) == r.After {
		return nil
	}
	if string(cur) != r.Before {
		return errors.New("the file changed since the plan")
	}
	mode := fs.FileMode(0o644)
	if info, err := os.Stat(file); err == nil {
		mode = info.Mode().Perm()
	}
	return fileops.WriteAtomic(file, []byte(r.After), mode)
}

// removeEmptyParents removes directories below a workspace layout
// directory (cohorts/<sub>/) that the moves emptied.
func removeEmptyParents(dir string, j *Journal) {
	ws := library.WorkspacesDir + "/" + j.Workspace + "/"
	for _, m := range j.Moves {
		rel := strings.TrimPrefix(m.From, ws)
		for d := refedit.SlashDir(rel); strings.Contains(d, "/"); d = refedit.SlashDir(d) {
			if os.Remove(filepath.Join(dir, filepath.FromSlash(ws+d))) != nil {
				break
			}
		}
	}
}

// commit makes the two commits: the workspace's (removals and rewritten
// references), then the global repository's (additions). A commit that
// fails is logged; the files are already in place.
func commit(ctx context.Context, dir string, j *Journal, wsRepo, glRepo *history.Repo, logf func(string, ...any)) ResultCommits {
	ctx = context.WithoutCancel(ctx)
	var out ResultCommits
	if c, err := wsRepo.Commit(ctx, j.Commits.Workspace, j.WorkspacePaths...); err != nil {
		logf("promote: workspace commit: %v", err)
	} else {
		out.Workspace = c
	}
	if j.Commits.Global != "" {
		if c, err := glRepo.Commit(ctx, j.Commits.Global, j.GlobalPaths...); err != nil {
			logf("promote: global commit: %v", err)
		} else {
			out.Global = c
		}
	}
	return out
}

// finish removes the trash and the journal.
func finish(dir string) error {
	if err := os.RemoveAll(filepath.Join(dir, filepath.FromSlash(trashDir))); err != nil {
		return err
	}
	return removeJournal(dir)
}

// rollback undoes a journal that has not reached PhaseCommitting:
// rewritten files get their bytes (and mtimes) back, then the moves are
// reversed and the directories they created removed.
func rollback(dir string, j *Journal) error {
	if j.Phase == PhaseCommitting {
		return errors.New("the promotion is past its rewrites: it is finished, not rolled back")
	}
	abs := func(rel string) string { return filepath.Join(dir, filepath.FromSlash(rel)) }
	var errs []error
	for _, r := range j.Rewrites {
		cur, err := os.ReadFile(abs(r.Path))
		if err != nil || string(cur) != r.After {
			continue // not rewritten (or changed since: kept)
		}
		mode := fs.FileMode(0o644)
		if info, err := os.Stat(abs(r.Path)); err == nil {
			mode = info.Mode().Perm()
		}
		errs = append(errs, fileops.WriteAtomic(abs(r.Path), []byte(r.Before), mode))
		if !r.Mtime.IsZero() {
			_ = os.Chtimes(abs(r.Path), r.Mtime, r.Mtime)
		}
	}
	for i := len(j.Moves) - 1; i >= 0; i-- {
		m := j.Moves[i]
		_, ferr := os.Lstat(abs(m.From))
		_, terr := os.Lstat(abs(m.To))
		if terr == nil && errors.Is(ferr, fs.ErrNotExist) {
			if err := os.MkdirAll(filepath.Dir(abs(m.From)), 0o755); err != nil {
				errs = append(errs, err)
				continue
			}
			errs = append(errs, os.Rename(abs(m.To), abs(m.From)))
		}
	}
	dirs := append([]string(nil), j.Dirs...)
	sort.SliceStable(dirs, func(a, b int) bool { return strings.Count(dirs[a], "/") > strings.Count(dirs[b], "/") })
	for _, d := range dirs {
		_ = os.Remove(abs(d))
	}
	if err := errors.Join(errs...); err != nil {
		return err
	}
	_ = os.RemoveAll(abs(trashDir))
	return removeJournal(dir)
}

// Recovery actions (Outcome.Action).
const (
	ActionRolledBack = "rolled_back"
	ActionFinished   = "finished"
)

// Outcome reports what Recover did with an interrupted promotion.
type Outcome struct {
	Action    string        `json:"action"`
	Phase     string        `json:"phase"`
	Kind      string        `json:"kind"`
	Workspace string        `json:"workspace"`
	Item      Item          `json:"item"`
	Started   string        `json:"started"`
	Commits   ResultCommits `json:"commits"`
}

// RecoverOptions configures Recover.
type RecoverOptions struct {
	// NoGit: --no-git (no commits).
	NoGit bool
	// Git is the git executable ("" = PATH).
	Git string
	// Logf receives progress lines (nil: discard).
	Logf func(string, ...any)
}

// Recover rolls back (before PhaseCommitting) or finishes (commits,
// cleanup) an interrupted promotion of the library at dir (nil, nil
// when there is none). An error means neither worked: the journal is
// kept.
func Recover(ctx context.Context, dir string, opts RecoverOptions) (*Outcome, error) {
	j, err := LoadJournal(dir)
	if err != nil || j == nil {
		return nil, err
	}
	logf := opts.Logf
	if logf == nil {
		logf = func(string, ...any) {}
	}
	out := &Outcome{Phase: j.Phase, Kind: j.Kind, Workspace: j.Workspace, Item: j.Item, Started: j.Started}
	if j.Phase != PhaseCommitting {
		if err := rollback(dir, j); err != nil {
			return nil, fmt.Errorf("roll back the interrupted promotion (%s): %w", JournalPath, err)
		}
		out.Action = ActionRolledBack
		logf("promote: rolled back the interrupted promotion of %s (workspace %s)", j.Item.Path, j.Workspace)
		return out, nil
	}
	var wsRepo, glRepo *history.Repo
	if !opts.NoGit {
		wsRepo = history.Open(ctx, filepath.Join(dir, library.WorkspacesDir, j.Workspace), history.Options{Git: opts.Git, Standalone: true}, logf)
		glRepo = history.Open(ctx, dir, history.Options{Git: opts.Git, Standalone: true, Ignore: history.GlobalIgnorePatterns}, logf)
	}
	out.Commits = commit(ctx, dir, j, wsRepo, glRepo, logf)
	if err := finish(dir); err != nil {
		return nil, err
	}
	out.Action = ActionFinished
	logf("promote: finished the interrupted promotion of %s (workspace %s)", j.Item.Path, j.Workspace)
	return out, nil
}

// LoadJournal reads dir's journal (nil, nil when there is none).
func LoadJournal(dir string) (*Journal, error) {
	data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(JournalPath)))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var j Journal
	if err := json.Unmarshal(data, &j); err != nil {
		return nil, fmt.Errorf("%s: %w", JournalPath, err)
	}
	return &j, nil
}

func saveJournal(dir string, j *Journal) error {
	file := filepath.Join(dir, filepath.FromSlash(JournalPath))
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(j, "", "  ")
	if err != nil {
		return err
	}
	return fileops.WriteAtomic(file, append(data, '\n'), 0o644)
}

func removeJournal(dir string) error {
	err := os.Remove(filepath.Join(dir, filepath.FromSlash(JournalPath)))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	_ = os.Remove(filepath.Join(dir, filepath.Dir(filepath.FromSlash(JournalPath)))) // .studio, if now empty
	return nil
}

func uniq(list []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range list {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}
