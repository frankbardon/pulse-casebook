package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/preview"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/validate"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// createBody is the POST /api/file/new request body.
//
//	{
//	  "path":   "case/req/new.json",  the file to create (root-relative)
//	  "root":   "request",            request | compose | facet | chain
//	  "cohort": "case/data.pulse"     a .pulse cohort in the workspace
//	}
type createBody struct {
	Path   string `json:"path"`
	Root   string `json:"root"`
	Cohort string `json:"cohort"`
}

// cohortRef is a request's cohort object, keys in house order.
type cohortRef struct {
	Filename string `json:"filename"`
	DataDir  string `json:"data_dir"`
}

// predictVerdict is the no-execute validation of a created file.
type predictVerdict struct {
	Valid  bool           `json:"valid"`
	Errors []predictIssue `json:"errors,omitempty"`
}

type predictIssue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// createResponse is the GET /api/file body for the new file plus the
// cohort object written into it and the engine's predict verdict.
type createResponse struct {
	fileBody
	Cohort  cohortRef      `json:"cohort"`
	Predict predictVerdict `json:"predict"`
}

// handleCreateFile is POST /api/file/new: create a new request file of
// the chosen root kind bound to a workspace cohort. The file is written
// in house style and atomically, and never replaces an existing file
// (409 exists). The cohort object is written so the studio resolves it
// exactly as previews and the engine do (see cohortFor). The response
// carries the created file and its predict verdict (status 201).
func (s *Server) handleCreateFile(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return
	}
	var body createBody
	if err := json.Unmarshal(raw, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return
	}
	if body.Path == "" {
		WriteError(w, http.StatusBadRequest, "missing_path", "path is required", nil)
		return
	}
	if body.Cohort == "" {
		WriteError(w, http.StatusBadRequest, "missing_cohort", "cohort is required", nil)
		return
	}
	kind := workspace.Kind(body.Root)
	switch kind {
	case workspace.KindRequest, workspace.KindCompose, workspace.KindFacet, workspace.KindChain:
	default:
		WriteError(w, http.StatusBadRequest, "invalid_root", "root must be request, compose, facet or chain", map[string]any{"root": body.Root})
		return
	}

	rel, abs, ok := s.scopedPath(w, body.Path)
	if !ok {
		return
	}
	if !strings.HasSuffix(strings.ToLower(rel), ".json") {
		WriteError(w, http.StatusBadRequest, "not_json", "a request file name must end in .json", map[string]any{"path": rel})
		return
	}
	if k, reason := workspace.Classify(rel, []byte("{}")); k == workspace.KindUnopenable {
		WriteError(w, http.StatusBadRequest, "not_request", "that name is reserved: "+reason, map[string]any{"path": rel})
		return
	}
	if _, err := os.Lstat(abs); err == nil {
		WriteError(w, http.StatusConflict, "exists", "a file already exists at that path", map[string]any{"path": rel})
		return
	} else if !errors.Is(err, fs.ErrNotExist) {
		writeFSError(w, rel, err)
		return
	}
	if pinfo, err := os.Stat(filepath.Dir(abs)); err != nil || !pinfo.IsDir() {
		WriteError(w, http.StatusNotFound, "not_found", "parent directory does not exist", map[string]any{"path": rel})
		return
	}

	cohortRel, cohortAbs, ok := s.scopedPath(w, body.Cohort)
	if !ok {
		return
	}
	if !strings.HasSuffix(strings.ToLower(cohortRel), ".pulse") {
		WriteError(w, http.StatusBadRequest, "not_cohort", "cohort must be a .pulse file", map[string]any{"cohort": cohortRel})
		return
	}
	if info, err := os.Stat(cohortAbs); err != nil || !info.Mode().IsRegular() {
		WriteError(w, http.StatusNotFound, "cohort_not_found", "no such cohort file", map[string]any{"cohort": cohortRel})
		return
	}
	if s.engine == nil {
		WriteError(w, http.StatusServiceUnavailable, "engine_unavailable", "pulse engine is not running", nil)
		return
	}
	enginePath, err := filepath.Rel(s.root.Dir(), cohortAbs)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "create_failed", err.Error(), nil)
		return
	}
	enginePath = filepath.ToSlash(enginePath)

	fields, err := s.cohortFields(r, enginePath)
	if err != nil {
		WriteError(w, http.StatusUnprocessableEntity, "inspect_failed", err.Error(), map[string]any{"cohort": cohortRel})
		return
	}
	ref := s.cohortFor(rel, enginePath)
	doc, err := newRequestDoc(kind, ref, fields)
	if err != nil {
		WriteError(w, http.StatusUnprocessableEntity, "create_failed", err.Error(), map[string]any{"cohort": cohortRel})
		return
	}
	node, err := jsonfmt.Parse(doc)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "create_failed", err.Error(), nil)
		return
	}
	out := jsonfmt.Format(node, jsonfmt.House)
	if err := createAtomic(abs, out, 0o644); err != nil {
		if errors.Is(err, fs.ErrExist) {
			WriteError(w, http.StatusConflict, "exists", "a file already exists at that path", map[string]any{"path": rel})
			return
		}
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		return
	}

	s.commitPaths(r.Context(), "studio: create "+rel, rel)

	// Predict the file as the engine sees it: the cohort rewritten to the
	// root-relative path the studio resolved (as previews do).
	engineDoc, err := newRequestDoc(kind, cohortRef{Filename: enginePath, DataDir: ""}, fields)
	verdict := predictVerdict{}
	if err == nil {
		verdict = s.predictDoc(r, rel, kind, engineDoc)
	}
	gotKind, reason := workspace.Classify(rel, out)
	WriteJSON(w, http.StatusCreated, createResponse{
		fileBody: fileBody{Path: rel, Kind: gotKind, Reason: reason, Text: string(out)},
		Cohort:   ref,
		Predict:  verdict,
	})
}

// scopedPath scopes a body path to the root, writing the error response
// itself when that fails.
func (s *Server) scopedPath(w http.ResponseWriter, rel string) (string, string, bool) {
	abs, err := s.root.Resolve(rel)
	if err != nil {
		if errors.Is(err, scope.ErrOutside) {
			WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": rel})
		} else if errors.Is(err, fs.ErrNotExist) {
			WriteError(w, http.StatusNotFound, "not_found", "parent directory does not exist", map[string]any{"path": rel})
		} else {
			writeFSError(w, rel, err)
		}
		return "", "", false
	}
	clean, err := filepath.Rel(s.root.Dir(), abs)
	if err != nil {
		WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": rel})
		return "", "", false
	}
	return filepath.ToSlash(clean), abs, true
}

// cohortFor returns the cohort object a new request at requestPath writes
// for the root-relative cohort file. It follows the casebook convention
// when it resolves: a cohort in the request's directory or its parent
// (cohort beside req/) is {"filename": base, "data_dir": "."}, which is
// how the engine finds it when run from the case directory, and how
// cohortCandidates (previews, the UI) resolve it. Otherwise data_dir is
// the cohort's root-relative directory, which the studio engine (DataDir
// = root) resolves as data_dir + "/" + filename directly. Either form is
// accepted only if the first existing candidate is exactly the cohort, so
// a same-named cohort elsewhere can never shadow the chosen one.
func (s *Server) cohortFor(requestPath, cohortPath string) cohortRef {
	dir, base := slashDir(cohortPath), cohortPath[strings.LastIndex(cohortPath, "/")+1:]
	reqDir := slashDir(requestPath)
	if dir == reqDir || dir == slashDir(reqDir) {
		conv := cohortRef{Filename: base, DataDir: "."}
		if got, ok := s.firstExistingCohort(requestPath, conv); ok && got == cohortPath {
			return conv
		}
	}
	if dir == "" {
		dir = "."
	}
	return cohortRef{Filename: base, DataDir: dir}
}

// firstExistingCohort is the root-relative file the cohort object
// resolves to for a request at requestPath (cohortResolver's rule).
func (s *Server) firstExistingCohort(requestPath string, ref cohortRef) (string, bool) {
	for _, cand := range cohortCandidates(requestPath, map[string]any{"filename": ref.Filename, "data_dir": ref.DataDir}) {
		abs, err := s.root.Resolve(cand)
		if err != nil {
			continue
		}
		if info, err := os.Stat(abs); err == nil && info.Mode().IsRegular() {
			return cand, true
		}
	}
	return "", false
}

// cohortField is the part of an inspected schema field a template uses.
type cohortField struct {
	Name        string `json:"name"`
	Categorical bool   `json:"categorical"`
}

// cohortFields reads the cohort's schema (header only).
func (s *Server) cohortFields(r *http.Request, enginePath string) ([]cohortField, error) {
	env, err := s.engine.InspectEnvelope(r.Context(), enginePath, nil)
	if err != nil {
		return nil, err
	}
	if len(env.Errors) > 0 {
		return nil, errors.New(env.Errors[0].Code + ": " + env.Errors[0].Message)
	}
	b, err := json.Marshal(env.Data)
	if err != nil {
		return nil, err
	}
	var res struct {
		Fields []cohortField `json:"fields"`
	}
	if err := json.Unmarshal(b, &res); err != nil {
		return nil, err
	}
	return res.Fields, nil
}

// newRequestDoc is the compact JSON of a new file of the given root kind:
// the smallest document of that root that predicts valid. A facet needs
// one field (the first categorical one) and a chain stage an aggregator
// (a row count), so those templates name a cohort field.
func newRequestDoc(kind workspace.Kind, ref cohortRef, fields []cohortField) ([]byte, error) {
	cohort := map[string]any{"filename": ref.Filename}
	if ref.DataDir != "" {
		cohort["data_dir"] = ref.DataDir
	}
	c, err := marshalOrdered(cohort, "filename", "data_dir")
	if err != nil {
		return nil, err
	}
	first := func(categorical bool) (string, error) {
		for _, f := range fields {
			if !categorical || f.Categorical {
				return f.Name, nil
			}
		}
		if len(fields) > 0 {
			return fields[0].Name, nil
		}
		return "", errors.New("the cohort has no fields")
	}
	q := func(s string) string { b, _ := json.Marshal(s); return string(b) }
	switch kind {
	case workspace.KindCompose:
		return []byte(`{"requests": [{"label": "request_1", "cohort": ` + c + `}]}`), nil
	case workspace.KindFacet:
		f, err := first(true)
		if err != nil {
			return nil, err
		}
		return []byte(`{"cohort": ` + c + `, "fields": [` + q(f) + `]}`), nil
	case workspace.KindChain:
		f, err := first(false)
		if err != nil {
			return nil, err
		}
		return []byte(`{"cohort": ` + c + `, "stages": [{"name": "stage_1", "request": {"aggregations": [{"type": "AGG_COUNT", "field": ` + q(f) + `, "label": "n"}]}}]}`), nil
	default:
		return []byte(`{"cohort": ` + c + `}`), nil
	}
}

// marshalOrdered renders a flat object with keys in the given order
// (present keys only).
func marshalOrdered(m map[string]any, keys ...string) (string, error) {
	var b strings.Builder
	b.WriteByte('{')
	n := 0
	for _, k := range keys {
		v, ok := m[k]
		if !ok {
			continue
		}
		kb, _ := json.Marshal(k)
		vb, err := json.Marshal(v)
		if err != nil {
			return "", err
		}
		if n > 0 {
			b.WriteString(", ")
		}
		b.Write(kb)
		b.WriteString(": ")
		b.Write(vb)
		n++
	}
	b.WriteByte('}')
	return b.String(), nil
}

// predictDoc runs the root's no-execute verdict on doc (cohort already
// rewritten for the engine) for the request at requestPath, through the
// same path as POST /api/predict (predictIssues), so a plain Request's
// refusals (reported by Explain, not Predict) are included. Only
// error-severity issues are returned.
func (s *Server) predictDoc(r *http.Request, requestPath string, kind workspace.Kind, doc []byte) predictVerdict {
	m, err := preview.DecodeDoc(doc)
	if err != nil {
		return predictVerdict{Errors: []predictIssue{{Code: "PREDICT_FAILED", Message: err.Error()}}}
	}
	out := predictVerdict{Valid: true}
	for _, is := range s.predictIssues(r.Context(), s.engineFor(requestPath), kind, m, m) {
		if is.Severity != validate.Error {
			continue
		}
		out.Valid = false
		out.Errors = append(out.Errors, predictIssue{Code: is.Code, Message: is.Message})
	}
	return out
}

// createAtomic writes data to a temp file in path's directory and links
// it into place, so the file appears whole and an existing file is never
// replaced (fs.ErrExist).
func createAtomic(path string, data []byte, mode fs.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer func() { _ = os.Remove(name) }()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Link(name, path)
}
