package server

import (
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// handleSaveFile is PUT /api/file?path=. The body is the JSON document.
// It is re-formatted before writing: in the style the existing file is
// written in (house or expanded), or house style for a new file. The
// write is atomic (temp file in the same directory, then rename). The
// response is the GET /api/file body for the bytes now on disk.
func (s *Server) handleSaveFile(w http.ResponseWriter, r *http.Request) {
	rel, abs, ok := s.resolveQueryPath(w, r)
	if !ok {
		return
	}
	if !strings.HasSuffix(strings.ToLower(rel), ".json") {
		WriteError(w, http.StatusBadRequest, "not_json", "only JSON files can be saved", map[string]any{"path": rel})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	if len(body) > workspace.MaxRequestBytes {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "document is too large to save", map[string]any{"path": rel, "max": workspace.MaxRequestBytes})
		return
	}
	doc, err := jsonfmt.Parse(body)
	if err != nil {
		details := map[string]any{"path": rel}
		var se *jsonfmt.SyntaxError
		if errors.As(err, &se) {
			details["offset"] = se.Offset
		}
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), details)
		return
	}

	style := jsonfmt.House
	mode := fs.FileMode(0o644)
	info, err := os.Stat(abs)
	switch {
	case err == nil:
		if !info.Mode().IsRegular() {
			WriteError(w, http.StatusBadRequest, "not_a_file", "path is not a regular file", map[string]any{"path": rel})
			return
		}
		mode = info.Mode().Perm()
		if info.Size() <= workspace.MaxRequestBytes {
			if old, err := os.ReadFile(abs); err == nil {
				style = jsonfmt.Detect(old)
			}
		}
	case errors.Is(err, fs.ErrNotExist):
		if pinfo, perr := os.Stat(filepath.Dir(abs)); perr != nil || !pinfo.IsDir() {
			WriteError(w, http.StatusNotFound, "not_found", "parent directory does not exist", map[string]any{"path": rel})
			return
		}
	default:
		writeFSError(w, rel, err)
		return
	}

	out := jsonfmt.Format(doc, style)
	if err := writeAtomic(abs, out, mode); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	kind, reason := workspace.Classify(rel, out)
	WriteJSON(w, http.StatusOK, fileBody{Path: rel, Kind: kind, Reason: reason, Text: string(out)})
}

// writeAtomic replaces path with data via a temp file in the same
// directory, so readers see either the old or the new file, never a torn
// one.
func writeAtomic(path string, data []byte, mode fs.FileMode) (err error) {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = os.Remove(tmp.Name())
		}
	}()
	if _, err = tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
