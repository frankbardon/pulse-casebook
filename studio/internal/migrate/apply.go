package migrate

import (
	"bytes"
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
	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/library"
)

// Journal phases, in order. Until PhaseCommitting a failed or
// interrupted migration can be rolled back (the move commit is undone
// with a soft reset); from it on it is always finished.
const (
	PhaseMoving     = "moving"     // moving files (and the workspace .gitignore)
	PhaseRecording  = "recording"  // committing the moves (pure renames)
	PhaseRewriting  = "rewriting"  // rewriting references, writing workspace.json
	PhaseCommitting = "committing" // committing the rewrites
	PhaseFinalizing = "finalizing" // writing library.json
)

// Commit messages of the workspace repository. The moves are committed
// on their own first, so every moved file is a 100% rename and `git log
// --follow` keeps its history; the reference rewrites follow.
const (
	CommitMessage     = "studio: migrate to library layout"
	CommitRefsMessage = "studio: migrate cohort references"
)

// Journal is .studio/migration.json: everything needed to finish or
// undo a migration without the original plan. Every step is idempotent:
// a move is done when its source is gone and its target exists, a
// rewrite when the file holds After.
type Journal struct {
	Version   int           `json:"version"`
	Started   string        `json:"started"`
	Phase     string        `json:"phase"`
	PlanID    string        `json:"plan_id"`
	Workspace WorkspacePlan `json:"workspace"`
	Moves     []Move        `json:"moves"`
	// Rewrites: file contents before and after (library-relative new
	// path). Create: the file did not exist before (a new .gitignore).
	Rewrites []JournalRewrite `json:"rewrites"`
	// Writes: files the migration creates (workspace.json).
	Writes []JournalWrite `json:"writes"`
	// Dirs the migration creates (removed again on rollback when empty).
	Dirs []string `json:"dirs"`
	// Git: the workspace repository is committed to. GitInit: it is
	// initialised by the migration (no root repository); else HeadBefore
	// is the moved repository's HEAD before ("" when it had no commit).
	Git        bool   `json:"git,omitempty"`
	GitInit    bool   `json:"git_init,omitempty"`
	HeadBefore string `json:"head_before,omitempty"`
	// MovePaths / RefPaths: workspace-relative paths of the two commits.
	MovePaths []string `json:"move_paths,omitempty"`
	RefPaths  []string `json:"ref_paths,omitempty"`
}

// JournalRewrite is one file rewritten in place. Early: rewritten with
// the moves (the workspace .gitignore, so the move commit has it).
type JournalRewrite struct {
	Path   string `json:"path"`
	Before string `json:"before"`
	After  string `json:"after"`
	Create bool   `json:"create,omitempty"`
	Early  bool   `json:"early,omitempty"`
	// Mtime: the file's modification time before (restored by rollback).
	Mtime time.Time `json:"mtime,omitempty"`
}

// JournalWrite is one file created.
type JournalWrite struct {
	Path string `json:"path"`
	Text string `json:"text"`
}

// Result is a finished migration.
type Result struct {
	PlanID    string        `json:"plan_id"`
	Workspace WorkspacePlan `json:"workspace"`
	Moved     int           `json:"moved"`
	Rewritten int           `json:"rewritten"`
	// Commits made in the workspace repository (moves, then references).
	Commits  []*history.Commit `json:"commits"`
	Warnings []Issue           `json:"warnings"`
}

// NotMigratableError: Apply refused (Plan says why).
type NotMigratableError struct{ Plan *Plan }

func (e *NotMigratableError) Error() string {
	return "cannot migrate: " + e.Plan.Reason + ": " + e.Plan.Message
}

// PlanChangedError: the folder changed since the plan the caller saw.
type PlanChangedError struct{ Plan *Plan }

func (e *PlanChangedError) Error() string { return "the migration plan changed: review it again" }

// FailedError: the migration failed part way. RolledBack says whether
// the folder was restored; otherwise the journal is left for Recover.
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
	return fmt.Sprintf("migration failed while %s (%s): %v", e.Phase, state, e.Err)
}

func (e *FailedError) Unwrap() error { return e.Err }

// ApplyOptions adds Apply-only settings to Options.
type ApplyOptions struct {
	Options
	// PlanID, when set, must equal the fresh plan's ID.
	PlanID string
	// Now stamps workspace.json (nil: time.Now).
	Now func() time.Time
}

// hook, when set by tests, runs before each step ("move", "rewrite",
// "write", "commit", "finalize"); an error simulates a crash there.
var hook func(step string) error

func step(name string) error {
	if hook != nil {
		return hook(name)
	}
	return nil
}

// Apply migrates dir (absolute, symlinks evaluated): it plans again,
// refuses when the folder cannot be migrated or the plan changed, then
// moves, rewrites, commits and finally writes library.json. A failure
// before the commit is rolled back.
func Apply(ctx context.Context, dir string, opts ApplyOptions) (*Result, error) {
	plan, err := MakePlan(ctx, dir, opts.Options)
	if err != nil {
		return nil, err
	}
	if !plan.Migratable {
		return nil, &NotMigratableError{Plan: plan}
	}
	if opts.PlanID != "" && opts.PlanID != plan.ID {
		return nil, &PlanChangedError{Plan: plan}
	}
	now := time.Now
	if opts.Now != nil {
		now = opts.Now
	}
	j, err := newJournal(ctx, plan, now())
	if err != nil {
		return nil, err
	}
	if err := saveJournal(dir, j); err != nil {
		return nil, fmt.Errorf("write the migration journal: %w", err)
	}
	opts.logf("migrate: %s → %s (%d moves, %d rewrites)", dir, plan.Workspace.Path, len(j.Moves), len(j.Rewrites))
	commits, err := forward(ctx, dir, j, opts.Options)
	if err != nil {
		fe := &FailedError{Err: err, Phase: j.Phase}
		if canRollBack(j.Phase) {
			if rerr := rollback(ctx, dir, j, opts.Options); rerr != nil {
				opts.logf("migrate: rollback failed: %v", rerr)
			} else {
				fe.RolledBack = true
			}
		}
		return nil, fe
	}
	return &Result{PlanID: plan.ID, Workspace: plan.Workspace, Moved: len(plan.Moves), Rewritten: len(plan.Rewrites), Commits: commits, Warnings: plan.Warnings}, nil
}

func canRollBack(phase string) bool {
	return phase == PhaseMoving || phase == PhaseRecording || phase == PhaseRewriting
}

func newJournal(ctx context.Context, p *Plan, now time.Time) (*Journal, error) {
	ws := p.Workspace.Path
	j := &Journal{Version: 1, Started: now.UTC().Format(time.RFC3339), Phase: PhaseMoving, PlanID: p.ID, Workspace: p.Workspace,
		Moves: p.Moves, Rewrites: []JournalRewrite{}, Writes: []JournalWrite{}}
	for _, r := range p.Rewrites {
		jr := JournalRewrite{Path: r.Path, Before: string(r.before), After: string(r.after)}
		if info, err := os.Stat(filepath.Join(p.dir, filepath.FromSlash(r.From))); err == nil {
			jr.Mtime = info.ModTime()
		}
		j.Rewrites = append(j.Rewrites, jr)
	}
	if p.Git.Ignore != "" {
		src, err := os.ReadFile(filepath.Join(p.dir, ".gitignore"))
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
		after := workspaceIgnore(src)
		if !bytes.Equal(src, after) || src == nil {
			jr := JournalRewrite{Path: ws + "/.gitignore", Before: string(src), After: string(after), Create: src == nil, Early: true}
			if info, err := os.Stat(filepath.Join(p.dir, ".gitignore")); err == nil {
				jr.Mtime = info.ModTime()
			}
			j.Rewrites = append(j.Rewrites, jr)
		}
	}
	j.Writes = append(j.Writes, JournalWrite{Path: ws + "/" + library.WorkspaceFile, Text: string(workspaceDoc(p.Workspace.Name, now))})
	if _, err := os.Stat(filepath.Join(p.dir, library.WorkspacesDir)); err != nil {
		j.Dirs = append(j.Dirs, library.WorkspacesDir)
	}
	j.Dirs = append(j.Dirs, ws)
	for _, d := range layoutDirs {
		j.Dirs = append(j.Dirs, ws+"/"+d)
	}
	j.Git = p.gitExe != "" && p.Git.Workspace != "none"
	j.GitInit = p.Git.Workspace == "init"
	for _, r := range j.Rewrites {
		j.RefPaths = append(j.RefPaths, strings.TrimPrefix(r.Path, ws+"/"))
	}
	j.RefPaths = append(j.RefPaths, library.WorkspaceFile)
	if p.tracked {
		if head, err := gitRun(ctx, p.gitExe, p.dir, "rev-parse", "-q", "--verify", "HEAD"); err == nil {
			j.HeadBefore = strings.TrimSpace(string(head))
		}
		// The move commit: every tracked file whose path changes (its
		// deletion and its new path), every moved JSON file at its new
		// path (studio versions all JSON) and the workspace .gitignore.
		out, err := gitRun(ctx, p.gitExe, p.dir, "ls-files", "-z")
		if err != nil {
			return nil, err
		}
		tracked := map[string]bool{}
		for _, f := range strings.Split(string(out), "\x00") {
			if f != "" {
				tracked[f] = true
			}
		}
		set := map[string]bool{".gitignore": true}
		for _, m := range p.Moves {
			to := strings.TrimPrefix(m.To, ws+"/")
			if m.Kind == KindGit || m.Dir || to == m.From {
				continue
			}
			if tracked[m.From] {
				set[m.From] = true
				set[to] = true
			} else if strings.HasSuffix(strings.ToLower(to), ".json") {
				set[to] = true
			}
		}
		for f := range set {
			j.MovePaths = append(j.MovePaths, f)
		}
		sort.Strings(j.MovePaths)
	}
	return j, nil
}

// workspaceDoc is workspace.json for a migrated folder (house style, as
// library.CreateWorkspace writes it).
func workspaceDoc(name string, now time.Time) []byte {
	root := &jsonfmt.Node{Kind: jsonfmt.Object}
	for _, kv := range [][2]string{{"name", name}, {"created", now.UTC().Format(time.RFC3339)}} {
		root.Members = append(root.Members, jsonfmt.Member{Key: quote(kv[0]), Value: &jsonfmt.Node{Kind: jsonfmt.String, Raw: quote(kv[1])}})
	}
	return jsonfmt.Format(root, jsonfmt.House)
}

// forward performs (or finishes) a journal's migration. Every step
// skips what is already done, so it also resumes. It returns the
// commits it made.
func forward(ctx context.Context, dir string, j *Journal, opts Options) ([]*history.Commit, error) {
	abs := func(rel string) string { return filepath.Join(dir, filepath.FromSlash(rel)) }
	var commits []*history.Commit
	rewrite := func(early bool) error {
		for _, r := range j.Rewrites {
			if r.Early != early {
				continue
			}
			if err := step("rewrite"); err != nil {
				return err
			}
			if err := rewriteOne(abs(r.Path), r); err != nil {
				return fmt.Errorf("rewrite %s: %w", r.Path, err)
			}
		}
		return nil
	}
	advance := func(phase string) error {
		j.Phase = phase
		return saveJournal(dir, j)
	}
	if j.Phase == PhaseMoving {
		for _, d := range j.Dirs {
			if err := os.MkdirAll(abs(d), 0o755); err != nil {
				return nil, err
			}
		}
		for _, m := range j.Moves {
			if err := step("move"); err != nil {
				return nil, err
			}
			if err := moveOne(abs(m.From), abs(m.To)); err != nil {
				return nil, fmt.Errorf("move %s: %w", m.From, err)
			}
		}
		removeEmptyParents(dir, j.Moves)
		if err := rewrite(true); err != nil {
			return nil, err
		}
		if err := advance(PhaseRecording); err != nil {
			return nil, err
		}
	}
	if j.Phase == PhaseRecording {
		if err := step("commit"); err != nil {
			return nil, err
		}
		if c, err := commitIn(ctx, abs(j.Workspace.Path), j, CommitMessage, j.MovePaths, opts); err != nil {
			return nil, err
		} else if c != nil {
			commits = append(commits, c)
		}
		if err := advance(PhaseRewriting); err != nil {
			return nil, err
		}
	}
	if j.Phase == PhaseRewriting {
		if err := rewrite(false); err != nil {
			return nil, err
		}
		for _, w := range j.Writes {
			if err := step("write"); err != nil {
				return nil, err
			}
			cur, err := os.ReadFile(abs(w.Path))
			switch {
			case err == nil && string(cur) == w.Text:
			case errors.Is(err, fs.ErrNotExist):
				if err := writeFileAtomic(abs(w.Path), []byte(w.Text), 0o644); err != nil {
					return nil, err
				}
			case err != nil:
				return nil, err
			default:
				return nil, fmt.Errorf("%s exists with other content", w.Path)
			}
		}
		if err := advance(PhaseCommitting); err != nil {
			return nil, err
		}
	}
	if j.Phase == PhaseCommitting {
		if err := step("commit"); err != nil {
			return nil, err
		}
		if c, err := commitIn(ctx, abs(j.Workspace.Path), j, CommitRefsMessage, j.RefPaths, opts); err != nil {
			return nil, err
		} else if c != nil {
			commits = append(commits, c)
		}
		if err := advance(PhaseFinalizing); err != nil {
			return nil, err
		}
	}
	if err := step("finalize"); err != nil {
		return commits, err
	}
	marker := abs(library.MarkerFile)
	if _, err := os.Stat(marker); errors.Is(err, fs.ErrNotExist) {
		if err := writeFileAtomic(marker, library.Marker(), 0o644); err != nil {
			return commits, err
		}
	}
	return commits, removeJournal(dir)
}

// commitIn commits paths in the workspace repository (nil when there is
// none, git is off or nothing changed). A workspace without a repository
// (GitInit) gets one here: its initial snapshot is the move commit.
func commitIn(ctx context.Context, wsDir string, j *Journal, msg string, paths []string, opts Options) (*history.Commit, error) {
	if !j.Git || opts.NoGit || opts.gitExe() == "" {
		return nil, nil
	}
	repo := history.Open(ctx, wsDir, history.Options{Git: opts.Git, Standalone: true}, opts.Logf)
	if !repo.Enabled() {
		opts.logf("migrate: workspace repository unavailable: %s", repo.Status().Reason)
		return nil, nil
	}
	if len(paths) == 0 || (j.GitInit && msg == CommitMessage) {
		return nil, nil
	}
	c, err := repo.Commit(ctx, msg, paths...)
	if err != nil {
		return nil, fmt.Errorf("commit %q: %w", msg, err)
	}
	return c, nil
}

// rewriteOne writes r.After over a file holding r.Before (keeping its
// mode); already done when it holds r.After.
func rewriteOne(file string, r JournalRewrite) error {
	cur, err := os.ReadFile(file)
	mode := fs.FileMode(0o644)
	switch {
	case err == nil:
		if string(cur) == r.After {
			return nil
		}
		if string(cur) != r.Before {
			return errors.New("the file changed since the plan")
		}
		if info, err := os.Stat(file); err == nil {
			mode = info.Mode().Perm()
		}
	case errors.Is(err, fs.ErrNotExist) && r.Create:
	default:
		return err
	}
	return writeFileAtomic(file, []byte(r.After), mode)
}

// removeEmptyParents removes the legacy directories the moves emptied
// (deepest first; non-empty ones stay).
func removeEmptyParents(dir string, moves []Move) {
	seen := map[string]bool{}
	for _, m := range moves {
		for d := slashDir(m.From); d != ""; d = slashDir(d) {
			seen[d] = true
		}
	}
	list := make([]string, 0, len(seen))
	for d := range seen {
		list = append(list, d)
	}
	sort.Slice(list, func(a, b int) bool { return strings.Count(list[a], "/") > strings.Count(list[b], "/") })
	for _, d := range list {
		_ = os.Remove(filepath.Join(dir, filepath.FromSlash(d)))
	}
}

// rollback undoes a journal that has not reached PhaseCommitting: the
// move commit (if made) is undone in the workspace repository first,
// then the files go back.
func rollback(ctx context.Context, dir string, j *Journal, opts Options) error {
	abs := func(rel string) string { return filepath.Join(dir, filepath.FromSlash(rel)) }
	if err := undoGit(ctx, abs(j.Workspace.Path), j, opts); err != nil {
		return err
	}
	var errs []error
	for _, r := range j.Rewrites {
		cur, err := os.ReadFile(abs(r.Path))
		if err != nil || string(cur) != r.After {
			continue // not rewritten (or changed since: kept)
		}
		if r.Create {
			errs = append(errs, os.Remove(abs(r.Path)))
			continue
		}
		mode := fs.FileMode(0o644)
		if info, err := os.Stat(abs(r.Path)); err == nil {
			mode = info.Mode().Perm()
		}
		errs = append(errs, writeFileAtomic(abs(r.Path), []byte(r.Before), mode))
		if !r.Mtime.IsZero() {
			_ = os.Chtimes(abs(r.Path), r.Mtime, r.Mtime)
		}
	}
	for _, w := range j.Writes {
		if cur, err := os.ReadFile(abs(w.Path)); err == nil && string(cur) == w.Text {
			errs = append(errs, os.Remove(abs(w.Path)))
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
	// Directories the moves created below the workspace, then the
	// journal's own, deepest first; anything still holding files stays.
	ws := abs(j.Workspace.Path)
	var dirs []string
	_ = filepath.WalkDir(ws, func(p string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			dirs = append(dirs, p)
		}
		return nil
	})
	for i := len(j.Dirs) - 1; i >= 0; i-- {
		dirs = append(dirs, abs(j.Dirs[i]))
	}
	sort.SliceStable(dirs, func(a, b int) bool {
		return strings.Count(dirs[a], string(filepath.Separator)) > strings.Count(dirs[b], string(filepath.Separator))
	})
	for _, d := range dirs {
		_ = os.Remove(d)
	}
	if err := errors.Join(errs...); err != nil {
		return err
	}
	if _, err := os.Stat(ws); err == nil {
		return fmt.Errorf("%s is not empty after the rollback", j.Workspace.Path)
	}
	return removeJournal(dir)
}

// undoGit undoes the move commit in the workspace repository: a
// repository the migration created is removed; a moved one is reset
// (soft, then the index entries of the moved paths only) to HeadBefore
// when HEAD is exactly the migration's commit on top of it.
func undoGit(ctx context.Context, wsDir string, j *Journal, opts Options) error {
	gitDir := filepath.Join(wsDir, ".git")
	if _, err := os.Lstat(gitDir); err != nil {
		return nil // never moved / created
	}
	if j.GitInit {
		return os.RemoveAll(gitDir)
	}
	exe := opts.gitExe()
	if exe == "" {
		return nil
	}
	head := ""
	if out, err := gitRun(ctx, exe, wsDir, "rev-parse", "-q", "--verify", "HEAD"); err == nil {
		head = strings.TrimSpace(string(out))
	}
	if head == j.HeadBefore {
		return nil
	}
	out, err := gitRun(ctx, exe, wsDir, "log", "-1", "--format=%P%x1f%s", "HEAD")
	if err != nil {
		return err
	}
	parent, subject, _ := strings.Cut(strings.TrimSpace(string(out)), "\x1f")
	if subject != CommitMessage || parent != j.HeadBefore || j.HeadBefore == "" {
		return fmt.Errorf("the workspace repository moved on since the migration (HEAD %s): not rolled back", head)
	}
	if _, err := gitRun(ctx, exe, wsDir, "reset", "-q", "--soft", j.HeadBefore); err != nil {
		return err
	}
	if len(j.MovePaths) > 0 {
		args := []string{"reset", "-q", j.HeadBefore, "--"}
		for _, p := range j.MovePaths {
			args = append(args, ":(literal)"+p)
		}
		if _, err := gitRun(ctx, exe, wsDir, args...); err != nil {
			return err
		}
	}
	return nil
}

func removeJournal(dir string) error {
	err := os.Remove(filepath.Join(dir, filepath.FromSlash(JournalPath)))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	_ = os.Remove(filepath.Join(dir, filepath.Dir(filepath.FromSlash(JournalPath)))) // .studio, if now empty
	return nil
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
	return writeFileAtomic(file, append(data, '\n'), 0o644)
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

// Recovery actions (Outcome.Action).
const (
	ActionResumed    = "resumed"
	ActionRolledBack = "rolled_back"
)

// Outcome reports what Recover did with an interrupted migration.
type Outcome struct {
	Action    string            `json:"action"`
	Phase     string            `json:"phase"`
	Workspace WorkspacePlan     `json:"workspace"`
	Started   string            `json:"started"`
	Error     string            `json:"error,omitempty"` // why it was not resumed
	Commits   []*history.Commit `json:"commits,omitempty"`
}

// Recover finishes or undoes an interrupted migration of dir (nil, nil
// when there is none). From PhaseCommitting on it always finishes
// (resumed). Before that it resumes, unless --no-git (never migrate)
// or resuming fails, in which case it rolls back. An error means
// neither worked; the journal is kept.
func Recover(ctx context.Context, dir string, opts Options) (*Outcome, error) {
	j, err := LoadJournal(dir)
	if err != nil || j == nil {
		return nil, err
	}
	out := &Outcome{Phase: j.Phase, Workspace: j.Workspace, Started: j.Started}
	if !canRollBack(j.Phase) || !opts.NoGit {
		commits, ferr := forward(ctx, dir, j, opts)
		if ferr == nil {
			out.Action, out.Commits = ActionResumed, commits
			opts.logf("migrate: resumed the interrupted migration of %s (was %s)", dir, out.Phase)
			return out, nil
		}
		if !canRollBack(j.Phase) {
			return nil, fmt.Errorf("resume the interrupted migration (%s): %w", JournalPath, ferr)
		}
		out.Error = ferr.Error()
	} else {
		out.Error = "the studio runs with --no-git: legacy folders are never migrated"
	}
	if err := rollback(ctx, dir, j, opts); err != nil {
		return nil, fmt.Errorf("roll back the interrupted migration (%s): %w", JournalPath, err)
	}
	out.Action = ActionRolledBack
	opts.logf("migrate: rolled back the interrupted migration of %s (%s)", dir, out.Error)
	return out, nil
}

var (
	moveOne         = fileops.Move
	writeFileAtomic = fileops.WriteAtomic
)
