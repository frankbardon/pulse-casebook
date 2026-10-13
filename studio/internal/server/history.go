package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// Git-backed workspace (see internal/history). Every studio write calls
// commitPaths after the file is on disk; the history endpoints read the
// log and old contents back for the history panel:
//
//	GET  /api/status                         {git: history.Status}
//	GET  /api/history?path=&limit=           {path, commits: [history.Commit]}
//	GET  /api/history/file?path=&rev=        {path, rev, text}
//	POST /api/history/restore {path, rev}    GET /api/file body + commit

// commitPaths commits the workspace-relative paths a write endpoint just
// wrote, and nothing else, with message msg (e.g. "studio: save
// req/a.json"). It is the single auto-commit hook: new write endpoints
// call it once their files are on disk. Ignored paths (cohorts, sources)
// are skipped. History is best effort: when it is off, or the commit
// fails, the write still succeeds; failures are logged and the result is
// nil. The commit runs to completion even if the client goes away.
//
// In a library workspace the global area is mounted under "_global/":
// those paths belong to the global repository (Config.GlobalHistory),
// every other path to the workspace's own. commitPaths splits a write's
// paths by owner and commits each group in its repository with the same
// message (the commit returned is the workspace one when there is one).
func (s *Server) commitPaths(ctx context.Context, msg string, paths ...string) *history.Commit {
	groups := map[*history.Repo][]string{}
	var order []*history.Repo
	for _, p := range paths {
		repo, rel := s.repoFor(p)
		if !repo.Enabled() {
			continue
		}
		if _, ok := groups[repo]; !ok {
			order = append(order, repo)
		}
		groups[repo] = append(groups[repo], rel)
	}
	var first *history.Commit
	for _, repo := range order {
		c, err := repo.Commit(context.WithoutCancel(ctx), msg, groups[repo]...)
		if err != nil {
			log.Printf("history: %s: %v", msg, err)
			continue
		}
		if first == nil || repo == s.cfg.History {
			if c != nil {
				first = c
			}
		}
	}
	return first
}

// repoFor returns the repository owning the root-relative path rel and
// the path inside it: the global repository for "_global/..." when this
// root mounts the global area, else the workspace's.
func (s *Server) repoFor(rel string) (*history.Repo, string) {
	if rest, ok := strings.CutPrefix(rel, globalPrefix+"/"); ok && s.root.Mounted(globalPrefix) != nil {
		return s.cfg.GlobalHistory, rest
	}
	return s.cfg.History, rel
}

// relOf maps a scoped absolute path back to its slash-separated
// root-relative form (the form commitPaths and git take; a global-area
// path in a workspace is "_global/...").
func (s *Server) relOf(abs string) string {
	rel, ok := s.root.Rel(abs)
	if !ok {
		return ""
	}
	return rel
}

// handleStatus is GET /api/status: git availability and the repository
// (+ global: the global repository's, in a library workspace).
func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	body := map[string]any{"git": s.cfg.History.Status()}
	if s.root.Mounted(globalPrefix) != nil {
		body["global_git"] = s.cfg.GlobalHistory.Status()
	}
	WriteJSON(w, http.StatusOK, body)
}

// historyReady writes 503 history_unavailable unless the repository
// owning rel has history on.
func (s *Server) historyReady(w http.ResponseWriter, rel string) bool {
	repo, _ := s.repoFor(rel)
	if repo.Enabled() {
		return true
	}
	WriteError(w, http.StatusServiceUnavailable, "history_unavailable", repo.Status().Reason, nil)
	return false
}

type historyBody struct {
	Path    string           `json:"path"`
	Commits []history.Commit `json:"commits"`
}

const maxHistoryLimit = 500

// handleHistory is GET /api/history?path=[&limit=]: the commits touching
// path, newest first (default 100). A path with no history (never
// committed, or deleted before the repository) gives an empty list.
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	_, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
		return
	}
	if !s.historyReady(w, s.relOf(abs)) {
		return
	}
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			WriteError(w, http.StatusBadRequest, "invalid_limit", "limit must be a positive integer", map[string]any{"limit": v})
			return
		}
		limit = min(n, maxHistoryLimit)
	}
	rel := s.relOf(abs)
	repo, inRepo := s.repoFor(rel)
	commits, err := repo.Log(r.Context(), inRepo, limit)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "history_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	WriteJSON(w, http.StatusOK, historyBody{Path: rel, Commits: commits})
}

type historyFileBody struct {
	Path string `json:"path"`
	Rev  string `json:"rev"`
	Text string `json:"text"`
}

// handleHistoryFile is GET /api/history/file?path=&rev=: the file's
// content at a commit (rev: a full or abbreviated hash).
func (s *Server) handleHistoryFile(w http.ResponseWriter, r *http.Request) {
	_, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
		return
	}
	rel := s.relOf(abs)
	if !s.historyReady(w, rel) {
		return
	}
	rev := r.URL.Query().Get("rev")
	data, full, ok := s.contentAt(w, r.Context(), rel, rev)
	if !ok {
		return
	}
	WriteJSON(w, http.StatusOK, historyFileBody{Path: rel, Rev: full, Text: string(data)})
}

// contentAt reads rel at rev, writing the error response itself.
func (s *Server) contentAt(w http.ResponseWriter, ctx context.Context, rel, rev string) ([]byte, string, bool) {
	if rev == "" {
		WriteError(w, http.StatusBadRequest, "missing_rev", "rev is required", nil)
		return nil, "", false
	}
	repo, inRepo := s.repoFor(rel)
	full, err := repo.Resolve(ctx, rev)
	if err == nil {
		var data []byte
		data, err = repo.Show(ctx, full, inRepo, workspace.MaxRequestBytes)
		if err == nil {
			return data, full, true
		}
	}
	details := map[string]any{"path": rel, "rev": rev}
	var tl *history.TooLargeError
	switch {
	case errors.Is(err, history.ErrBadRev):
		WriteError(w, http.StatusBadRequest, "invalid_rev", err.Error(), details)
	case errors.Is(err, history.ErrUnknownRev):
		WriteError(w, http.StatusNotFound, "rev_not_found", err.Error(), details)
	case errors.Is(err, history.ErrNotAtRev):
		WriteError(w, http.StatusNotFound, "not_found", err.Error(), details)
	case errors.As(err, &tl):
		details["max"] = tl.Max
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", err.Error(), details)
	default:
		WriteError(w, http.StatusInternalServerError, "history_failed", err.Error(), details)
	}
	return nil, "", false
}

type restoreBody struct {
	Path string `json:"path"`
	Rev  string `json:"rev"`
}

type restoreResponse struct {
	fileBody
	Rev    string          `json:"rev"`
	Commit *history.Commit `json:"commit,omitempty"`
}

// handleRestore is POST /api/history/restore {path, rev}: write the
// file's content at rev back verbatim (atomically, keeping its mode) and
// commit it as "studio: restore <path> to <short>". The response is the
// GET /api/file body for the restored bytes, plus the commit (absent when
// the file already had that content).
func (s *Server) handleRestore(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return
	}
	var body restoreBody
	if err := json.Unmarshal(raw, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return
	}
	if body.Path == "" {
		WriteError(w, http.StatusBadRequest, "missing_path", "path is required", nil)
		return
	}
	rel, abs, ok := s.scopedPath(w, body.Path)
	if !ok {
		return
	}
	if !s.historyReady(w, rel) {
		return
	}
	data, full, ok := s.contentAt(w, r.Context(), rel, body.Rev)
	if !ok {
		return
	}
	mode := fs.FileMode(0o644)
	if info, err := os.Lstat(abs); err == nil {
		if !info.Mode().IsRegular() {
			WriteError(w, http.StatusBadRequest, "not_a_file", "path is not a regular file", map[string]any{"path": rel})
			return
		}
		mode = info.Mode().Perm()
	} else if !errors.Is(err, fs.ErrNotExist) {
		writeFSError(w, rel, err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	if err := writeAtomic(abs, data, mode); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	commit := s.commitPaths(r.Context(), "studio: restore "+rel+" to "+full[:min(7, len(full))], rel)
	kind, reason := workspace.Classify(rel, data)
	WriteJSON(w, http.StatusOK, restoreResponse{
		fileBody: fileBody{Path: rel, Kind: kind, Reason: reason, Text: string(data)},
		Rev:      full,
		Commit:   commit,
	})
}
