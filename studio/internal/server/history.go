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
func (s *Server) commitPaths(ctx context.Context, msg string, paths ...string) *history.Commit {
	if !s.cfg.History.Enabled() {
		return nil
	}
	c, err := s.cfg.History.Commit(context.WithoutCancel(ctx), msg, paths...)
	if err != nil {
		log.Printf("history: %s: %v", msg, err)
		return nil
	}
	return c
}

// relOf maps a scoped absolute path back to its slash-separated
// root-relative form (the form commitPaths and git take).
func (s *Server) relOf(abs string) string {
	rel, err := filepath.Rel(s.root.Dir(), abs)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

// handleStatus is GET /api/status: git availability and the repository.
func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"git": s.cfg.History.Status()})
}

// historyReady writes 503 history_unavailable unless history is on.
func (s *Server) historyReady(w http.ResponseWriter) bool {
	if s.cfg.History.Enabled() {
		return true
	}
	WriteError(w, http.StatusServiceUnavailable, "history_unavailable", s.cfg.History.Status().Reason, nil)
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
	if !s.historyReady(w) {
		return
	}
	_, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
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
	commits, err := s.cfg.History.Log(r.Context(), rel, limit)
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
	if !s.historyReady(w) {
		return
	}
	_, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
		return
	}
	rel := s.relOf(abs)
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
	full, err := s.cfg.History.Resolve(ctx, rev)
	if err == nil {
		var data []byte
		data, err = s.cfg.History.Show(ctx, full, rel, workspace.MaxRequestBytes)
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
	if !s.historyReady(w) {
		return
	}
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
