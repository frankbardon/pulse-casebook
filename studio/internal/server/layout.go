package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// Layout sidecars. foo.json keeps its graph layout in foo.layout.json
// beside it. The server treats the sidecar as an opaque JSON object; the
// UI owns its schema (studio/ui/src/graph/layout.ts):
//
//	{
//	  "version": 1,
//	  "nodes": {"<node id>": {"x": 0, "y": 0, "collapsed": true}},
//	  "lanes": ["<lane id>", ...]
//	}
//
// Node ids are the JSON-path ids of studio/ui/src/graph/nodePath.ts.
// Entries naming nodes that no longer exist are ignored on load.

// layoutBody is the /api/layout response. Layout is null when there is
// no sidecar or it cannot be used; Invalid then says why, so a broken
// sidecar degrades to auto-layout instead of blocking the request.
type layoutBody struct {
	Path    string          `json:"path"`
	Layout  json.RawMessage `json:"layout"`
	Invalid string          `json:"invalid,omitempty"`
}

// handleLayout is GET /api/layout?path=<request>. A missing sidecar is
// not an error.
func (s *Server) handleLayout(w http.ResponseWriter, r *http.Request) {
	side, abs, ok := s.resolveLayoutPath(w, r)
	if !ok {
		return
	}
	info, err := os.Stat(abs)
	if errors.Is(err, fs.ErrNotExist) {
		WriteJSON(w, http.StatusOK, layoutBody{Path: side, Layout: json.RawMessage("null")})
		return
	}
	if err != nil {
		writeFSError(w, side, err)
		return
	}
	if !info.Mode().IsRegular() {
		WriteJSON(w, http.StatusOK, layoutBody{Path: side, Layout: json.RawMessage("null"), Invalid: "not a regular file"})
		return
	}
	if info.Size() > workspace.MaxRequestBytes {
		WriteJSON(w, http.StatusOK, layoutBody{Path: side, Layout: json.RawMessage("null"), Invalid: "file is too large"})
		return
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		writeFSError(w, side, err)
		return
	}
	if msg := checkLayout(data); msg != "" {
		WriteJSON(w, http.StatusOK, layoutBody{Path: side, Layout: json.RawMessage("null"), Invalid: msg})
		return
	}
	WriteJSON(w, http.StatusOK, layoutBody{Path: side, Layout: json.RawMessage(data)})
}

// handleSaveLayout is PUT /api/layout?path=<request>. The body is the
// sidecar object; it is written in house style, atomically.
func (s *Server) handleSaveLayout(w http.ResponseWriter, r *http.Request) {
	side, abs, ok := s.resolveLayoutPath(w, r)
	if !ok {
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), map[string]any{"path": side})
		return
	}
	if len(body) > workspace.MaxRequestBytes {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "layout is too large to save", map[string]any{"path": side, "max": workspace.MaxRequestBytes})
		return
	}
	doc, err := jsonfmt.Parse(body)
	if err != nil {
		details := map[string]any{"path": side}
		var se *jsonfmt.SyntaxError
		if errors.As(err, &se) {
			details["offset"] = se.Offset
		}
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), details)
		return
	}
	if doc.Kind != jsonfmt.Object {
		WriteError(w, http.StatusBadRequest, "invalid_layout", "layout must be a JSON object", map[string]any{"path": side})
		return
	}
	if info, err := os.Stat(abs); err == nil && !info.Mode().IsRegular() {
		WriteError(w, http.StatusBadRequest, "not_a_file", "path is not a regular file", map[string]any{"path": side})
		return
	} else if errors.Is(err, fs.ErrNotExist) {
		if pinfo, perr := os.Stat(filepath.Dir(abs)); perr != nil || !pinfo.IsDir() {
			WriteError(w, http.StatusNotFound, "not_found", "parent directory does not exist", map[string]any{"path": side})
			return
		}
	} else if err != nil {
		writeFSError(w, side, err)
		return
	}
	out := jsonfmt.Format(doc, jsonfmt.House)
	if err := writeAtomic(abs, out, 0o644); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": side})
		return
	}
	WriteJSON(w, http.StatusOK, layoutBody{Path: side, Layout: json.RawMessage(out)})
}

// resolveLayoutPath maps ?path=<request> to its sidecar and scopes it.
func (s *Server) resolveLayoutPath(w http.ResponseWriter, r *http.Request) (side, abs string, ok bool) {
	rel := r.URL.Query().Get("path")
	if rel == "" {
		WriteError(w, http.StatusBadRequest, "missing_path", "query parameter path is required", nil)
		return "", "", false
	}
	side, ok = workspace.LayoutPath(rel)
	if !ok {
		WriteError(w, http.StatusBadRequest, "not_request", "layout sidecars belong to request JSON files", map[string]any{"path": rel})
		return "", "", false
	}
	abs, err := s.root.Resolve(side)
	if err != nil {
		if errors.Is(err, scope.ErrOutside) {
			WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": rel})
		} else {
			writeFSError(w, side, err)
		}
		return "", "", false
	}
	return side, abs, true
}

// checkLayout returns why data cannot serve as a layout, or "".
func checkLayout(data []byte) string {
	doc, err := jsonfmt.Parse(data)
	if err != nil {
		return "invalid JSON: " + err.Error()
	}
	if doc.Kind != jsonfmt.Object {
		return "layout must be a JSON object"
	}
	return ""
}
