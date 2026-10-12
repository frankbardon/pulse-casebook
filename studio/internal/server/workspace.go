package server

import (
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/frankbardon/pulse/descriptor"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// handleFiles lists every request, cohort and unopenable JSON file in the
// scoped directory.
func (s *Server) handleFiles(w http.ResponseWriter, _ *http.Request) {
	listing, err := workspace.List(s.root.Dir())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "list_failed", err.Error(), nil)
		return
	}
	WriteJSON(w, http.StatusOK, listing)
}

// fileBody is the /api/file response. Text is the file verbatim so later
// stages can round-trip it byte for byte.
type fileBody struct {
	Path   string         `json:"path"`
	Kind   workspace.Kind `json:"kind"`
	Reason string         `json:"reason,omitempty"`
	Text   string         `json:"text"`
}

// handleFile reads one JSON file and reports its classification.
func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	rel, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
		return
	}
	if !strings.HasSuffix(strings.ToLower(rel), ".json") {
		WriteError(w, http.StatusBadRequest, "not_json", "only JSON files can be opened", map[string]any{"path": rel})
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeFSError(w, rel, err)
		return
	}
	if !info.Mode().IsRegular() {
		WriteError(w, http.StatusBadRequest, "not_a_file", "path is not a regular file", map[string]any{"path": rel})
		return
	}
	if info.Size() > workspace.MaxRequestBytes {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "file is too large to open", map[string]any{"path": rel, "size": info.Size(), "max": workspace.MaxRequestBytes})
		return
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		writeFSError(w, rel, err)
		return
	}
	kind, reason := workspace.Classify(rel, data)
	WriteJSON(w, http.StatusOK, fileBody{Path: rel, Kind: kind, Reason: reason, Text: string(data)})
}

// handleCohortInspect returns the engine's header-only Inspect result for
// a .pulse cohort. ?full_dict=1 returns untruncated dictionaries.
func (s *Server) handleCohortInspect(w http.ResponseWriter, r *http.Request) {
	rel, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
		return
	}
	if !strings.HasSuffix(strings.ToLower(rel), ".pulse") {
		WriteError(w, http.StatusBadRequest, "not_cohort", "only .pulse cohorts can be inspected", map[string]any{"path": rel})
		return
	}
	if _, err := os.Stat(abs); err != nil {
		writeFSError(w, rel, err)
		return
	}
	if s.engine == nil {
		WriteError(w, http.StatusServiceUnavailable, "engine_unavailable", "pulse engine is not running", nil)
		return
	}
	// The engine's filesystem is rooted at the scoped directory, so it
	// takes the root-relative form of the already-validated path.
	enginePath, err := filepath.Rel(s.root.Dir(), abs)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "inspect_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	opts := &descriptor.InspectOptions{FullDict: r.URL.Query().Get("full_dict") == "1"}
	env, err := s.engine.InspectEnvelope(r.Context(), enginePath, opts)
	if err != nil {
		WriteError(w, http.StatusUnprocessableEntity, "inspect_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	if len(env.Errors) > 0 {
		e := env.Errors[0]
		WriteError(w, http.StatusUnprocessableEntity, e.Code, e.Message, e.Details)
		return
	}
	WriteJSON(w, http.StatusOK, env.Data)
}

// resolveQueryPath reads ?path= and scopes it to the root, writing the
// error response itself when that fails.
func (s *Server) resolveQueryPath(w http.ResponseWriter, r *http.Request) (rel, abs string, ok bool) {
	rel = r.URL.Query().Get("path")
	if rel == "" {
		WriteError(w, http.StatusBadRequest, "missing_path", "query parameter path is required", nil)
		return "", "", false
	}
	abs, err := s.root.Resolve(rel)
	if err != nil {
		if errors.Is(err, scope.ErrOutside) {
			WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": rel})
		} else {
			writeFSError(w, rel, err)
		}
		return "", "", false
	}
	return rel, abs, true
}

func writeFSError(w http.ResponseWriter, rel string, err error) {
	if errors.Is(err, fs.ErrNotExist) {
		WriteError(w, http.StatusNotFound, "not_found", "no such file", map[string]any{"path": rel})
		return
	}
	WriteError(w, http.StatusInternalServerError, "read_failed", err.Error(), map[string]any{"path": rel})
}
