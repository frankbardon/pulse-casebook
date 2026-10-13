// Package history keeps a Studio workspace in git: every studio write is
// committed (pathspec-limited, serialized), and the log and old contents
// of a file are read back for the history panel.
//
// It drives the system git CLI (exec), not a Go git library. A missing
// git binary, --no-git or a repository git refuses to use leaves the
// Repo disabled: Commit is then a no-op and Status says why; nothing a
// write endpoint does depends on it succeeding.
//
// Two layouts:
//
//   - the workspace is not inside any repository: Open runs `git init`
//     in it, writes the managed .gitignore block and commits an initial
//     snapshot of the workspace's JSON files;
//   - the workspace is inside a repository (e.g. a showcase dir in the
//     casebook): no nested init. The enclosing repository is used, and
//     every command runs in the workspace directory with workspace-relative
//     literal pathspecs, so commits never include paths outside it, nor
//     anything the user changed or staged that the studio did not write.
package history

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Fallback identity when git config has no user.name / user.email.
const (
	FallbackName  = "Pulse Studio"
	FallbackEmail = "studio@localhost"
)

// cmdTimeout bounds every git invocation.
const cmdTimeout = 30 * time.Second

// Options configures Open.
type Options struct {
	// Disabled turns history off (the --no-git flag).
	Disabled bool
	// Git is the git executable; "" looks up "git" on PATH.
	Git string
}

// Status describes the workspace's history support (GET /api/status).
type Status struct {
	// Available: a git binary was found.
	Available bool `json:"available"`
	// Enabled: studio writes are committed and history can be read.
	Enabled bool `json:"enabled"`
	// RepoRoot is the repository's top-level directory; Prefix is the
	// workspace's path inside it ("" when the workspace is the root).
	RepoRoot string `json:"repo_root,omitempty"`
	Prefix   string `json:"prefix,omitempty"`
	// Initialized: the studio ran `git init` for this workspace (as
	// opposed to finding an existing repository).
	Initialized bool `json:"initialized,omitempty"`
	// Reason says why history is off.
	Reason string `json:"reason,omitempty"`
}

// Commit is one commit in a file's log, or the result of Commit.
type Commit struct {
	Rev     string `json:"rev"`
	Short   string `json:"short"`
	Time    string `json:"time,omitempty"` // RFC 3339, author date
	Author  string `json:"author,omitempty"`
	Email   string `json:"email,omitempty"`
	Message string `json:"message"`
}

// Repo is a workspace's git history. The zero value and nil are disabled.
type Repo struct {
	dir    string // workspace directory (absolute, symlinks resolved)
	git    string
	status Status
	// Identity used when git config has none (env overrides for commit).
	env []string

	mu sync.Mutex // serializes index-touching commands
}

// Errors returned by Show and Resolve.
var (
	ErrDisabled    = errors.New("history is not enabled")
	ErrBadRev      = errors.New("revision must be a commit hash")
	ErrUnknownRev  = errors.New("no such commit")
	ErrNotAtRev    = errors.New("the file does not exist at that revision")
	ErrInvalidPath = errors.New("invalid path")
)

// Open prepares history for dir. It never fails: problems disable
// history and are reported in Status().Reason. log receives one line
// per noteworthy event (nil: discard).
func Open(ctx context.Context, dir string, opts Options, log func(format string, args ...any)) *Repo {
	if log == nil {
		log = func(string, ...any) {}
	}
	r := &Repo{dir: dir}
	if opts.Disabled {
		r.status.Reason = "disabled with --no-git"
		if g, err := lookGit(opts.Git); err == nil {
			r.git = g
			r.status.Available = true
		}
		return r
	}
	g, err := lookGit(opts.Git)
	if err != nil {
		r.status.Reason = "git is not installed or not on PATH"
		log("history: %s", r.status.Reason)
		return r
	}
	r.git = g
	r.status.Available = true

	top, err := r.run(ctx, nil, "rev-parse", "--show-toplevel")
	switch {
	case err == nil:
		r.status.RepoRoot = strings.TrimSpace(string(top))
		prefix, perr := r.run(ctx, nil, "rev-parse", "--show-prefix")
		if perr != nil {
			return r.disable(log, "cannot read the repository layout: "+perr.Error())
		}
		r.status.Prefix = strings.TrimSpace(string(prefix))
		if r.status.Prefix != "" {
			// A workspace the enclosing repo ignores cannot be versioned
			// there, and must not get a nested repository either.
			if _, ierr := r.run(ctx, nil, "check-ignore", "-q", "--", "."); ierr == nil {
				return r.disable(log, "the workspace is ignored by the enclosing repository "+r.status.RepoRoot)
			}
		}
	case isNotARepo(err):
		if _, err := r.run(ctx, nil, "init", "-q"); err != nil {
			return r.disable(log, "git init failed: "+err.Error())
		}
		top, err := r.run(ctx, nil, "rev-parse", "--show-toplevel")
		if err != nil {
			return r.disable(log, "git init failed: "+err.Error())
		}
		r.status.RepoRoot = strings.TrimSpace(string(top))
		r.status.Initialized = true
		log("history: initialized a git repository in %s", dir)
	default:
		return r.disable(log, "git cannot use this directory: "+err.Error())
	}
	r.env = r.identityEnv(ctx)
	r.status.Enabled = true

	changed, err := EnsureIgnore(filepath.Join(dir, ".gitignore"))
	if err != nil {
		log("history: cannot update .gitignore: %v", err)
	}
	switch {
	case r.status.Initialized:
		if c, err := r.snapshot(ctx); err != nil {
			log("history: initial snapshot failed: %v", err)
		} else if c != nil {
			log("history: initial snapshot %s", c.Short)
		}
	case changed:
		if _, err := r.Commit(ctx, "studio: manage .gitignore", ".gitignore"); err != nil {
			log("history: commit .gitignore: %v", err)
		}
	}
	return r
}

func (r *Repo) disable(log func(string, ...any), reason string) *Repo {
	r.status.Enabled = false
	r.status.Reason = reason
	log("history: %s", reason)
	return r
}

// Status reports history support.
func (r *Repo) Status() Status {
	if r == nil {
		return Status{Reason: "not configured"}
	}
	return r.status
}

// Enabled reports whether commits and history reads work.
func (r *Repo) Enabled() bool { return r != nil && r.status.Enabled }

func lookGit(name string) (string, error) {
	if name == "" {
		name = "git"
	}
	return exec.LookPath(name)
}

func isNotARepo(err error) bool {
	var ge *gitError
	return errors.As(err, &ge) && strings.Contains(strings.ToLower(ge.stderr), "not a git repository")
}

// identityEnv returns env overrides for commits when git config (or the
// environment) has no author identity.
func (r *Repo) identityEnv(ctx context.Context) []string {
	var env []string
	name, _ := r.run(ctx, nil, "config", "user.name")
	email, _ := r.run(ctx, nil, "config", "user.email")
	if strings.TrimSpace(string(name)) == "" {
		if os.Getenv("GIT_AUTHOR_NAME") == "" {
			env = append(env, "GIT_AUTHOR_NAME="+FallbackName)
		}
		if os.Getenv("GIT_COMMITTER_NAME") == "" {
			env = append(env, "GIT_COMMITTER_NAME="+FallbackName)
		}
	}
	if strings.TrimSpace(string(email)) == "" {
		if os.Getenv("GIT_AUTHOR_EMAIL") == "" {
			env = append(env, "GIT_AUTHOR_EMAIL="+FallbackEmail)
		}
		if os.Getenv("GIT_COMMITTER_EMAIL") == "" {
			env = append(env, "GIT_COMMITTER_EMAIL="+FallbackEmail)
		}
	}
	return env
}

// snapshot commits the workspace's .gitignore and JSON files (requests,
// layouts, outputs, schemas, import specs) after a fresh init, so files
// opened before their first studio save still have a revision to diff
// against and restore. Other files (data, sources) are left untracked.
func (r *Repo) snapshot(ctx context.Context) (*Commit, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	specs := []string{":(literal).gitignore", ":(glob)**/*.json"}
	if _, err := r.run(ctx, nil, "add", "-A", "--", specs[0]); err != nil {
		return nil, err
	}
	// Globbed adds skip ignored files silently.
	if _, err := r.run(ctx, nil, "add", "-A", "--", specs[1]); err != nil && !strings.Contains(err.Error(), "did not match") {
		return nil, err
	}
	// A fresh repository's index holds only what was just added.
	return r.commitStaged(ctx, "studio: initial snapshot", nil)
}

// Commit commits the current contents of paths (workspace-relative,
// slash-separated) and nothing else, with message msg. Paths that are
// gitignored, or neither present nor tracked, are skipped. It returns nil
// when there is nothing to commit, and (nil, nil) when history is off.
// Concurrent calls are serialized. Other staged or modified files are
// left exactly as they were.
func (r *Repo) Commit(ctx context.Context, msg string, paths ...string) (*Commit, error) {
	if !r.Enabled() {
		return nil, nil
	}
	clean := make([]string, 0, len(paths))
	for _, p := range paths {
		c, err := cleanRel(p)
		if err != nil {
			return nil, fmt.Errorf("%w: %q", ErrInvalidPath, p)
		}
		clean = append(clean, c)
	}
	if len(clean) == 0 {
		return nil, nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	// Drop ignored paths (check-ignore lists untracked ignored ones only;
	// a tracked file under an ignore pattern is still committed).
	ignored := map[string]bool{}
	out, err := r.run(ctx, nil, append([]string{"check-ignore", "--"}, clean...)...)
	if err == nil {
		for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			ignored[filepath.ToSlash(strings.TrimSpace(l))] = true
		}
	} else if !isExit(err, 1) {
		return nil, err
	}
	var keep []string
	for _, p := range clean {
		if ignored[p] {
			continue
		}
		if _, err := os.Lstat(filepath.Join(r.dir, filepath.FromSlash(p))); err != nil {
			// Gone from disk: commit the deletion only if git tracks it.
			tracked, terr := r.run(ctx, nil, "ls-files", "--", literal(p))
			if terr != nil || len(bytes.TrimSpace(tracked)) == 0 {
				continue
			}
		}
		keep = append(keep, p)
	}
	if len(keep) == 0 {
		return nil, nil
	}
	specs := make([]string, len(keep))
	for i, p := range keep {
		specs[i] = literal(p)
	}
	if _, err := r.run(ctx, nil, append([]string{"add", "-A", "--"}, specs...)...); err != nil {
		return nil, err
	}
	return r.commitStaged(ctx, msg, specs)
}

// commitStaged commits specs (--only: just those paths, whatever else is
// staged) if they differ from HEAD; nil specs commits the whole index.
// Caller holds mu.
func (r *Repo) commitStaged(ctx context.Context, msg string, specs []string) (*Commit, error) {
	_, err := r.run(ctx, nil, append([]string{"diff", "--cached", "--quiet", "--"}, specs...)...)
	if err == nil {
		return nil, nil // identical to HEAD
	}
	if !isExit(err, 1) {
		return nil, err
	}
	args := []string{"-c", "commit.gpgsign=false", "commit", "--no-verify", "--quiet", "--no-edit", "-m", msg}
	if specs != nil {
		args = append(append(args, "--only", "--"), specs...)
	}
	if _, err := r.run(ctx, r.env, args...); err != nil {
		return nil, err
	}
	out, err := r.run(ctx, nil, "log", "-1", "--format="+logFormat)
	if err != nil {
		return nil, err
	}
	cs := parseLog(out)
	if len(cs) == 0 {
		return nil, errors.New("commit not found after committing")
	}
	return &cs[0], nil
}

// Log lists up to limit commits touching path (newest first). A path
// with no history, or a repository without commits, gives an empty list.
func (r *Repo) Log(ctx context.Context, rel string, limit int) ([]Commit, error) {
	if !r.Enabled() {
		return nil, ErrDisabled
	}
	p, err := cleanRel(rel)
	if err != nil {
		return nil, fmt.Errorf("%w: %q", ErrInvalidPath, rel)
	}
	if limit <= 0 {
		limit = 100
	}
	out, err := r.run(ctx, nil, "log", fmt.Sprintf("-n%d", limit), "--format="+logFormat, "--", literal(p))
	if err != nil {
		var ge *gitError
		if errors.As(err, &ge) && strings.Contains(ge.stderr, "does not have any commits") {
			return []Commit{}, nil
		}
		return nil, err
	}
	cs := parseLog(out)
	if cs == nil {
		cs = []Commit{}
	}
	return cs, nil
}

var hexRev = regexp.MustCompile(`^[0-9a-fA-F]{4,64}$`)

// Resolve maps a commit hash (full or abbreviated) to its full hash.
func (r *Repo) Resolve(ctx context.Context, rev string) (string, error) {
	if !r.Enabled() {
		return "", ErrDisabled
	}
	if !hexRev.MatchString(rev) {
		return "", ErrBadRev
	}
	out, err := r.run(ctx, nil, "rev-parse", "--verify", "--quiet", "--end-of-options", rev+"^{commit}")
	if err != nil {
		if isExit(err, 1) || isExit(err, 128) {
			return "", ErrUnknownRev
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// Show returns path's content at rev (a hash), at most max bytes.
func (r *Repo) Show(ctx context.Context, rev, rel string, max int64) ([]byte, error) {
	full, err := r.Resolve(ctx, rev)
	if err != nil {
		return nil, err
	}
	p, err := cleanRel(rel)
	if err != nil {
		return nil, fmt.Errorf("%w: %q", ErrInvalidPath, rel)
	}
	obj := full + ":./" + p
	size, err := r.run(ctx, nil, "cat-file", "-s", obj)
	if err != nil {
		return nil, ErrNotAtRev
	}
	var n int64
	if _, err := fmt.Sscan(strings.TrimSpace(string(size)), &n); err == nil && max > 0 && n > max {
		return nil, &TooLargeError{Size: n, Max: max}
	}
	typ, err := r.run(ctx, nil, "cat-file", "-t", obj)
	if err != nil || strings.TrimSpace(string(typ)) != "blob" {
		return nil, ErrNotAtRev
	}
	return r.run(ctx, nil, "cat-file", "blob", obj)
}

// TooLargeError is returned by Show for a file over the size cap.
type TooLargeError struct{ Size, Max int64 }

func (e *TooLargeError) Error() string {
	return fmt.Sprintf("file is %d bytes at that revision (max %d)", e.Size, e.Max)
}

// cleanRel validates a workspace-relative slash path.
func cleanRel(p string) (string, error) {
	p = filepath.ToSlash(p)
	if p == "" || strings.ContainsRune(p, 0) || path.IsAbs(p) {
		return "", ErrInvalidPath
	}
	c := path.Clean(p)
	if c == "." || c == ".." || strings.HasPrefix(c, "../") {
		return "", ErrInvalidPath
	}
	return c, nil
}

func literal(p string) string { return ":(literal)" + p }

// logFormat: one record per commit, fields split by US, records by RS.
const logFormat = "%H%x1f%h%x1f%aI%x1f%an%x1f%ae%x1f%s%x1e"

func parseLog(out []byte) []Commit {
	var cs []Commit
	for _, rec := range strings.Split(string(out), "\x1e") {
		rec = strings.TrimLeft(rec, "\r\n")
		if rec == "" {
			continue
		}
		f := strings.Split(rec, "\x1f")
		if len(f) != 6 {
			continue
		}
		cs = append(cs, Commit{Rev: f[0], Short: f[1], Time: f[2], Author: f[3], Email: f[4], Message: f[5]})
	}
	return cs
}

// gitError is a failed git command with its stderr.
type gitError struct {
	args   []string
	code   int
	stderr string
}

func (e *gitError) Error() string {
	msg := strings.TrimSpace(e.stderr)
	if msg == "" {
		msg = fmt.Sprintf("exit status %d", e.code)
	}
	return fmt.Sprintf("git %s: %s", strings.Join(e.args, " "), msg)
}

func isExit(err error, code int) bool {
	var ge *gitError
	return errors.As(err, &ge) && ge.code == code
}

// run executes git in the workspace directory and returns stdout.
func (r *Repo) run(ctx context.Context, env []string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, cmdTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, r.git, args...)
	cmd.Dir = r.dir
	// Never prompt (credentials, editors, pagers) from a server.
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_EDITOR=true", "GIT_PAGER=cat", "LC_ALL=C")
	cmd.Env = append(cmd.Env, env...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		code := -1
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			code = ee.ExitCode()
		}
		if ctx.Err() != nil {
			return nil, fmt.Errorf("git %s: %w", strings.Join(args, " "), ctx.Err())
		}
		return nil, &gitError{args: args, code: code, stderr: stderr.String()}
	}
	return stdout.Bytes(), nil
}
