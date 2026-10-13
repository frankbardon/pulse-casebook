package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/encoding"
	perrors "github.com/frankbardon/pulse/errors"
	pio "github.com/frankbardon/pulse/io"
	"github.com/spf13/afero"

	"github.com/frankbardon/pulse-casebook/studio/internal/history"
	"github.com/frankbardon/pulse-casebook/studio/internal/importer"
	"github.com/frankbardon/pulse-casebook/studio/internal/jsonfmt"
	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// Import endpoints (G1, G3). Sources upload into sources/ (gitignored);
// saved schemas live in schemas/<name>.schema.json and import specs in
// imports/<cohort>.import.json (both versioned and auto-committed); the
// cohort .pulse is gitignored and rebuilt from its spec.
//
//	POST /api/sources                 multipart "file" → source descriptor
//	POST /api/import/predict          Pulse dry run + sample + stats + matches
//	GET  /api/schemas                 saved schemas with fingerprints
//	POST /api/schemas                 validate + save a schema document
//	POST /api/schemas/match           rank saved schemas against columns
//	POST /api/import                  import into the workspace, write spec
//	POST /api/import/rebuild          re-run an import spec
//
// Request/response shapes are documented on each handler and in the
// visual-request-builder story notes ("G1 — import backend").

// DefaultMaxUpload is the --max-upload default: 2 GiB.
const DefaultMaxUpload int64 = 2 << 30

// multipartSlack is the multipart framing allowed on top of the file.
const multipartSlack = 1 << 20

func (s *Server) maxUpload() int64 {
	if s.cfg.MaxUpload > 0 {
		return s.cfg.MaxUpload
	}
	return DefaultMaxUpload
}

func (s *Server) registerImportRoutes() {
	s.mux.HandleFunc("POST /api/sources", s.handleUpload)
	s.mux.HandleFunc("POST /api/import/predict", s.handleImportPredict)
	s.mux.HandleFunc("GET /api/schemas", s.handleListSchemas)
	s.mux.HandleFunc("POST /api/schemas", s.handleSaveSchema)
	s.mux.HandleFunc("POST /api/schemas/match", s.handleMatchSchemas)
	s.mux.HandleFunc("POST /api/import", s.handleImport)
	s.mux.HandleFunc("POST /api/import/rebuild", s.handleRebuild)
}

// ---------------------------------------------------------------- upload

type sourceBody struct {
	Path     string   `json:"path"`
	Name     string   `json:"name"`
	Size     int64    `json:"size"`
	SHA256   string   `json:"sha256"`
	Format   string   `json:"format"`
	Sheets   []string `json:"sheets,omitempty"`
	Existing bool     `json:"existing,omitempty"`
}

// handleUpload is POST /api/sources[?overwrite=1], multipart/form-data
// with one file part named "file". The part is streamed to a temp file
// in sources/ (hashing as it goes) and renamed into place; nothing is
// buffered in memory. The client's file name is sanitized
// (importer.SanitizeUploadName); a name with a path is refused. When
// sources/<name> already exists: identical bytes → that file is reused
// (200, existing: true); different bytes → "<stem>-2<ext>"... unless
// ?overwrite=1 replaces it. 201 for a new file.
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	limit := s.maxUpload()
	if r.ContentLength > limit+multipartSlack {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds --max-upload", map[string]any{"max": limit, "size": r.ContentLength})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit+multipartSlack)
	mr, err := r.MultipartReader()
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_multipart", "expected multipart/form-data with a \"file\" part: "+err.Error(), nil)
		return
	}
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			writeBodyError(w, err, limit)
			return
		}
		if part.FormName() != "file" {
			_ = part.Close()
			continue
		}
		s.storeUpload(w, r, part, rawFileName(part), limit)
		_ = part.Close()
		return
	}
	WriteError(w, http.StatusBadRequest, "missing_file", "no \"file\" part in the upload", nil)
}

func writeBodyError(w http.ResponseWriter, err error, limit int64) {
	var mbe *http.MaxBytesError
	if errors.As(err, &mbe) {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds --max-upload", map[string]any{"max": limit})
		return
	}
	WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
}

// rawFileName is the part's filename parameter as the client sent it.
// (*multipart.Part).FileName applies filepath.Base, which would quietly
// turn "../../x.csv" into "x.csv"; a name with a path is refused instead.
func rawFileName(p *multipart.Part) string {
	_, params, err := mime.ParseMediaType(p.Header.Get("Content-Disposition"))
	if err != nil {
		return p.FileName()
	}
	return params["filename"]
}

func (s *Server) storeUpload(w http.ResponseWriter, r *http.Request, part io.Reader, raw string, limit int64) {
	name, err := importer.SanitizeUploadName(raw)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_name", "upload file name must be a plain file name", map[string]any{"name": raw})
		return
	}
	format := pio.FormatFromPath(name)
	if !format.CanRead() {
		WriteError(w, http.StatusUnsupportedMediaType, "unsupported_format", (&importer.FormatError{Format: format}).Error(),
			map[string]any{"name": name, "format": string(format), "formats": importer.ReadableFormats()})
		return
	}
	dirAbs, ok := s.ensureDir(w, importer.SourcesDir)
	if !ok {
		return
	}
	tmp, err := os.CreateTemp(dirAbs, ".upload-*.tmp")
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), nil)
		return
	}
	keep := false
	defer func() {
		if !keep {
			_ = tmp.Close()
			_ = os.Remove(tmp.Name())
		}
	}()
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(part, limit+1))
	if err != nil {
		writeBodyError(w, err, limit)
		return
	}
	if n > limit {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds --max-upload", map[string]any{"max": limit})
		return
	}
	if err := tmp.Sync(); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), nil)
		return
	}
	if err := tmp.Close(); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), nil)
		return
	}
	sum := hex.EncodeToString(h.Sum(nil))
	overwrite := r.URL.Query().Get("overwrite") == "1"

	s.sourcesMu.Lock()
	final, existing := name, false
	if !overwrite {
		p := filepath.Join(dirAbs, name)
		if info, err := os.Lstat(p); err == nil {
			if got, _, herr := importer.HashFile(p); herr == nil && info.Mode().IsRegular() && got == sum {
				existing = true // identical bytes are already there: keep that file
			} else {
				final = importer.DedupeName(name, func(c string) bool {
					_, err := os.Lstat(filepath.Join(dirAbs, c))
					return err == nil
				})
			}
		}
	}
	if !existing {
		err = os.Rename(tmp.Name(), filepath.Join(dirAbs, final))
	}
	s.sourcesMu.Unlock()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), nil)
		return
	}
	keep = !existing
	rel := importer.SourcesDir + "/" + final
	body := sourceBody{Path: rel, Name: final, Size: n, SHA256: sum, Format: string(format), Existing: existing}
	if format == pio.FormatExcel {
		body.Sheets = sheetsOf(filepath.Join(dirAbs, final))
	}
	status := http.StatusCreated
	if existing {
		status = http.StatusOK
	}
	WriteJSON(w, status, body)
}

// sheetsOf lists an Excel workbook's sheets, nil when unreadable.
func sheetsOf(abs string) []string {
	rd, _, err := importer.OpenReader(abs, pio.FormatExcel, importer.Options{})
	if err != nil {
		return nil
	}
	defer rd.Close()
	sheets, _, _ := importer.SheetNames(rd)
	return sheets
}

// ensureDir creates a root-level workspace directory and returns its
// absolute path, refusing one that resolves outside the root (a symlink).
func (s *Server) ensureDir(w http.ResponseWriter, rel string) (string, bool) {
	abs, err := s.root.Resolve(rel)
	if err == nil {
		err = os.MkdirAll(abs, 0o755)
	}
	if err == nil {
		// Re-resolve now it exists, so a symlinked directory is checked.
		abs, err = s.root.Resolve(rel)
	}
	if err != nil {
		if errors.Is(err, scope.ErrOutside) {
			WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": rel})
		} else {
			WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		}
		return "", false
	}
	return abs, true
}

// --------------------------------------------------------------- schemas

type schemaEntry struct {
	Name        string               `json:"name"`
	Path        string               `json:"path"`
	SHA256      string               `json:"sha256"`
	Fields      int                  `json:"fields"`
	Fingerprint importer.Fingerprint `json:"fingerprint"`
	Invalid     string               `json:"invalid,omitempty"`
	Rename      map[string]string    `json:"rename,omitempty"` // PULSE-GAP(column-rename)

	columns []importer.Column
}

// savedSchemas reads every schemas/*.schema.json, sorted by name.
func (s *Server) savedSchemas() []schemaEntry {
	out := []schemaEntry{}
	dir, err := s.root.Resolve(importer.SchemasDir)
	if err != nil {
		return out
	}
	ents, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	for _, e := range ents {
		name := e.Name()
		if !e.Type().IsRegular() || strings.HasPrefix(name, ".") || !strings.HasSuffix(strings.ToLower(name), importer.SchemaSuffix) {
			continue
		}
		rel := importer.SchemasDir + "/" + name
		ent := schemaEntry{Name: name[:len(name)-len(importer.SchemaSuffix)], Path: rel, Fingerprint: importer.Fingerprint{}}
		data, err := readSmall(filepath.Join(dir, name))
		if err != nil {
			ent.Invalid = err.Error()
			out = append(out, ent)
			continue
		}
		ent.SHA256 = importer.HashBytes(data)
		fields, ren, _, err := importer.ParseSchemaDoc(data)
		if err != nil {
			ent.Invalid = err.Error()
		} else {
			ent.Fields = len(fields)
			ent.Rename = ren
			ent.columns = importer.SourceColumns(fields, ren)
			ent.Fingerprint = importer.FingerprintOf(ent.columns)
		}
		out = append(out, ent)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func readSmall(abs string) ([]byte, error) {
	info, err := os.Stat(abs)
	if err != nil {
		return nil, err
	}
	if info.Size() > workspace.MaxRequestBytes {
		return nil, fmt.Errorf("file is larger than %d bytes", workspace.MaxRequestBytes)
	}
	return os.ReadFile(abs)
}

// handleListSchemas is GET /api/schemas →
// {schemas:[{name, path, sha256, fields, fingerprint:[{name,type}], invalid?}], field_types:[...]}.
func (s *Server) handleListSchemas(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"schemas": s.savedSchemas(), "field_types": importer.FieldTypeNames()})
}

type saveSchemaRequest struct {
	Name      string            `json:"name"`
	Schema    json.RawMessage   `json:"schema"`
	Rename    map[string]string `json:"rename"` // PULSE-GAP(column-rename)
	Overwrite bool              `json:"overwrite"`
}

type saveSchemaResponse struct {
	Name        string               `json:"name"`
	Path        string               `json:"path"`
	SHA256      string               `json:"sha256"`
	Fingerprint importer.Fingerprint `json:"fingerprint"`
	Text        string               `json:"text"`
	Created     bool                 `json:"created"`
	Commit      *history.Commit      `json:"commit,omitempty"`
	Rename      map[string]string    `json:"rename,omitempty"` // PULSE-GAP(column-rename)
}

// handleSaveSchema is POST /api/schemas {name, schema:[fields], overwrite?}.
// The document is validated (importer.ParseSchema) and written to
// schemas/<name>.schema.json in house style through the lossless
// formatter (key order and unknown keys kept), then committed. An
// existing schema is replaced only with overwrite:true (else 409 exists,
// details carry its sha256 and text for a diff confirm).
func (s *Server) handleSaveSchema(w http.ResponseWriter, r *http.Request) {
	var req saveSchemaRequest
	if !decodeBody(w, r, &req) {
		return
	}
	name, ok := importer.SchemaName(req.Name)
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid_name", "schema name must be 1-100 letters, digits, '.', '-' or '_', starting with a letter or digit", map[string]any{"name": req.Name})
		return
	}
	if len(req.Schema) == 0 {
		WriteError(w, http.StatusBadRequest, "missing_schema", "schema is required", nil)
		return
	}
	fields, _, err := importer.ParseSchema(req.Schema)
	if err != nil {
		writeSchemaError(w, err)
		return
	}
	// PULSE-GAP(column-rename): the rename map rides along.
	text, err := importer.WithRename(req.Schema, fields, req.Rename)
	if err != nil {
		cb := toCoded(err, "invalid_rename")
		WriteError(w, http.StatusBadRequest, cb.Code, cb.Message, cb.Details)
		return
	}
	doc, err := jsonfmt.Parse(text)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return
	}
	out := jsonfmt.Format(doc, jsonfmt.House)
	if _, ok := s.ensureDir(w, importer.SchemasDir); !ok {
		return
	}
	rel, abs, ok := s.scopedPath(w, importer.SchemaPath(name))
	if !ok {
		return
	}
	created := true
	if old, err := os.ReadFile(abs); err == nil {
		created = false
		if !req.Overwrite {
			WriteError(w, http.StatusConflict, "exists", "a schema with this name exists; pass overwrite to replace it",
				map[string]any{"path": rel, "sha256": importer.HashBytes(old), "text": string(old)})
			return
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		writeFSError(w, rel, err)
		return
	}
	if err := writeAtomic(abs, out, 0o644); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	commit := s.commitPaths(r.Context(), "studio: save schema "+rel, rel)
	fields, ren, _, _ := importer.ParseSchemaDoc(out)
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	WriteJSON(w, status, saveSchemaResponse{
		Name: name, Path: rel, SHA256: importer.HashBytes(out),
		Fingerprint: importer.FingerprintOf(importer.SourceColumns(fields, ren)),
		Text:        string(out), Created: created, Commit: commit, Rename: ren,
	})
}

func writeSchemaError(w http.ResponseWriter, err error) {
	var se *importer.SchemaError
	if errors.As(err, &se) {
		WriteError(w, http.StatusBadRequest, "invalid_schema", se.Message, se.Details())
		return
	}
	WriteError(w, http.StatusBadRequest, "invalid_schema", err.Error(), nil)
}

type matchRequest struct {
	Columns []importer.Column `json:"columns"`
	Limit   int               `json:"limit"`
}

// handleMatchSchemas is POST /api/schemas/match {columns:[{name,type}], limit?}
// → {threshold, matches:[{name, path, score, exact, suggest, diff:{added,
// missing, retyped}, merged}]}: saved schemas ranked by weighted Jaccard
// (importer.Rank), best first, score > 0 only.
func (s *Server) handleMatchSchemas(w http.ResponseWriter, r *http.Request) {
	var req matchRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if len(req.Columns) == 0 {
		WriteError(w, http.StatusBadRequest, "missing_columns", "columns is required", nil)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"threshold": importer.SuggestScore, "matches": s.rankSchemas(req.Columns, req.Limit)})
}

func (s *Server) rankSchemas(cols []importer.Column, limit int) []importer.Match {
	var cands []importer.Candidate
	for _, e := range s.savedSchemas() {
		if e.Invalid == "" {
			cands = append(cands, importer.Candidate{Name: e.Name, Path: e.Path, Columns: e.columns, Rename: e.Rename})
		}
	}
	return importer.Rank(cols, cands, limit)
}

// --------------------------------------------------------------- predict

// importSource is the source + schema + options part shared by predict
// and import requests. Schema is a saved schema's name (a JSON string),
// an inline schema document (a JSON array), or absent/null (infer).
// Overrides (column → Pulse type) is merged into Options.Overrides.
type importSource struct {
	Source    string            `json:"source"`
	Format    string            `json:"format"`
	Schema    json.RawMessage   `json:"schema"`
	Overrides map[string]string `json:"overrides"`
	Options   importer.Options  `json:"options"`
}

// resolvedSource is an importSource checked against the workspace.
type resolvedSource struct {
	rel, abs string
	format   pio.Format
	opts     importer.Options
	fields   []importer.SchemaField // nil: infer
	schema   *encoding.Schema
	ref      *importer.SpecSchema // spec record of the schema
	refPath  string               // saved schema's path, to commit with a spec
}

func (s *Server) resolveImportSource(w http.ResponseWriter, in importSource) (*resolvedSource, bool) {
	if in.Source == "" {
		WriteError(w, http.StatusBadRequest, "missing_source", "source is required", nil)
		return nil, false
	}
	rel, abs, ok := s.scopedPath(w, in.Source)
	if !ok {
		return nil, false
	}
	info, err := os.Stat(abs)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			WriteError(w, http.StatusNotFound, "source_not_found", "no such source file", map[string]any{"source": rel})
		} else {
			writeFSError(w, rel, err)
		}
		return nil, false
	}
	if !info.Mode().IsRegular() {
		WriteError(w, http.StatusBadRequest, "not_a_file", "source is not a regular file", map[string]any{"source": rel})
		return nil, false
	}
	format := pio.Format(in.Format)
	if format == "" {
		format = pio.FormatFromPath(rel)
	}
	if !format.CanRead() {
		WriteError(w, http.StatusUnsupportedMediaType, "unsupported_format", (&importer.FormatError{Format: format}).Error(),
			map[string]any{"source": rel, "format": string(format), "formats": importer.ReadableFormats()})
		return nil, false
	}
	opts := in.Options
	if len(in.Overrides) > 0 {
		merged := map[string]string{}
		for k, v := range opts.Overrides {
			merged[k] = v
		}
		for k, v := range in.Overrides {
			merged[k] = v
		}
		opts.Overrides = merged
	}
	rs := &resolvedSource{rel: rel, abs: abs, format: format, opts: opts}
	if !s.resolveSchema(w, in.Schema, rs) {
		return nil, false
	}
	return rs, true
}

func (s *Server) resolveSchema(w http.ResponseWriter, raw json.RawMessage, rs *resolvedSource) bool {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return true
	}
	if strings.HasPrefix(trimmed, "\"") {
		var ref string
		_ = json.Unmarshal(raw, &ref)
		name, ok := importer.SchemaName(ref)
		if !ok {
			WriteError(w, http.StatusBadRequest, "invalid_name", "schema must be a saved schema name or an inline schema document", map[string]any{"schema": ref})
			return false
		}
		rel, abs, ok := s.scopedPath(w, importer.SchemaPath(name))
		if !ok {
			return false
		}
		data, err := readSmall(abs)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				WriteError(w, http.StatusNotFound, "schema_not_found", "no saved schema with this name", map[string]any{"schema": name, "path": rel})
			} else {
				writeFSError(w, rel, err)
			}
			return false
		}
		fields, sch, err := importer.ParseSchema(data)
		if err != nil {
			writeSchemaError(w, err)
			return false
		}
		rs.fields, rs.schema, rs.refPath = fields, sch, rel
		rs.ref = &importer.SpecSchema{Ref: name, Path: rel, SHA256: importer.HashBytes(data)}
		return true
	}
	fields, sch, err := importer.ParseSchema(raw)
	if err != nil {
		writeSchemaError(w, err)
		return false
	}
	rs.fields, rs.schema = fields, sch
	rs.ref = &importer.SpecSchema{Inline: fields}
	return true
}

// newJob builds the ImportJob for rs reading through a fresh reader.
func newJob(rs *resolvedSource, target string) (*pio.ImportJob, pio.Reader, error) {
	rd, _, err := importer.OpenReader(rs.abs, rs.format, rs.opts)
	if err != nil {
		return nil, nil, err
	}
	job := pio.NewImportJob(rd, target)
	job.FS = afero.NewOsFs()
	if err := rs.opts.Apply(job); err != nil {
		_ = rd.Close()
		return nil, nil, err
	}
	job.Schema = rs.schema
	return job, rd, nil
}

type predictRequest struct {
	importSource
	PreviewRows int `json:"preview_rows"`
}

type columnBody struct {
	Name        string                `json:"name"`
	Index       int                   `json:"index"`    // source column, -1 for a generated field
	Included    bool                  `json:"included"` // in the predicted schema
	Generated   bool                  `json:"generated,omitempty"`
	Type        string                `json:"type,omitempty"`
	Nullable    bool                  `json:"nullable,omitempty"`
	Description string                `json:"description,omitempty"`
	Precision   uint8                 `json:"precision,omitempty"`
	Scale       uint8                 `json:"scale,omitempty"`
	Stats       *importer.ColumnStats `json:"stats,omitempty"`
	Samples     []*string             `json:"samples"`
	Warnings    []string              `json:"warnings"`
}

type codedBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
	Column  string         `json:"column,omitempty"`
}

type inferenceWarning struct {
	Column  string `json:"column"`
	Message string `json:"message"`
}

type importPredictResponse struct {
	Source        string                 `json:"source"`
	Format        string                 `json:"format"`
	Sheet         string                 `json:"sheet,omitempty"`
	Sheets        []string               `json:"sheets,omitempty"`
	Valid         bool                   `json:"valid"`
	Refusal       *codedBody             `json:"refusal,omitempty"`
	Header        []string               `json:"header"`
	Rows          [][]*string            `json:"rows"`
	Sample        sampleInfo             `json:"sample"`
	EstimatedRows int                    `json:"estimated_rows"`
	Columns       []columnBody           `json:"columns"`
	Schema        []importer.SchemaField `json:"schema"`
	SchemaRef     *importer.SpecSchema   `json:"schema_ref,omitempty"`
	Warnings      []inferenceWarning     `json:"warnings"`
	CodedWarnings []codedBody            `json:"coded_warnings"`
	Groups        []pio.GroupReport      `json:"groups,omitempty"`
	Candidates    *pio.GroupDetection    `json:"group_candidates,omitempty"`
	Projection    *pio.ImportProjection  `json:"projection,omitempty"`
	Elided        []string               `json:"elided_constants,omitempty"`
	Matches       []importer.Match       `json:"matches"`
	FieldTypes    []string               `json:"field_types"`
	Options       importer.Options       `json:"options"`
}

type sampleInfo struct {
	Rows       int  `json:"rows"`        // rows the stats cover
	More       bool `json:"more"`        // the source has more rows
	SampleRows int  `json:"sample_rows"` // inference sample size Pulse uses
}

// handleImportPredict is POST /api/import/predict {source, format?,
// schema?, overrides?, options?, preview_rows?}: the Pulse dry run
// (ImportJob.Predict) plus the first preview_rows rows (default 20, max
// 200) and per-column stats over options.sample_rows rows (default 500),
// both read through the public Reader, and saved schemas ranked against
// the predicted columns. A Pulse refusal (an override it rejects, an
// explicit schema field with no column, ...) is not an HTTP error: the
// response has valid:false and refusal {code, message, details, column?}
// with the sample still filled in, so the editor can show it per column.
func (s *Server) handleImportPredict(w http.ResponseWriter, r *http.Request) {
	var req predictRequest
	if !decodeBody(w, r, &req) {
		return
	}
	rs, ok := s.resolveImportSource(w, req.importSource)
	if !ok {
		return
	}
	preview := req.PreviewRows
	switch {
	case preview <= 0:
		preview = importer.DefaultPreviewRows
	case preview > importer.MaxPreviewRows:
		preview = importer.MaxPreviewRows
	}
	sampleRows := rs.opts.EffectiveSampleRows()
	if rs.opts.SampleRows > importer.MaxSampleRows || rs.opts.SampleRows < 0 {
		WriteError(w, http.StatusBadRequest, "invalid_option", fmt.Sprintf("sample_rows must be between %d and %d", importer.MinSampleRows, importer.MaxSampleRows), map[string]any{"option": "sample_rows"})
		return
	}

	// Sample pass: preview rows and stats, through the public Reader.
	rd, _, err := importer.OpenReader(rs.abs, rs.format, rs.opts)
	if err != nil {
		writeImportError(w, err, "read_failed", rs.rel)
		return
	}
	var sheets []string
	if rs.format == pio.FormatExcel {
		sheets, _, _ = importer.SheetNames(rd)
	}
	sample, err := importer.SampleSource(r.Context(), rd, sampleRows, preview)
	_ = rd.Close()
	if err != nil {
		writeImportError(w, err, "read_failed", rs.rel)
		return
	}

	resp := importPredictResponse{
		Source: rs.rel, Format: string(rs.format), Sheet: rs.opts.Sheet, Sheets: sheets,
		Header: sample.Header, Rows: sample.Rows,
		Sample:   sampleInfo{Rows: sample.Sampled, More: sample.More, SampleRows: sampleRows},
		Warnings: []inferenceWarning{}, CodedWarnings: []codedBody{}, Matches: []importer.Match{},
		FieldTypes: importer.FieldTypeNames(), Options: rs.opts, SchemaRef: rs.ref,
	}
	if rs.ref != nil && rs.ref.Inline != nil {
		resp.SchemaRef = nil
	}

	// Dry run.
	job, rd2, err := newJob(rs, os.DevNull)
	if err != nil {
		writeImportError(w, err, "read_failed", rs.rel)
		return
	}
	report, perr := job.Predict(r.Context())
	_ = rd2.Close()
	if perr != nil {
		if errors.Is(perr, context.Canceled) {
			WriteError(w, 499, "cancelled", "predict cancelled", nil)
			return
		}
		cb := toCoded(perr, "predict_failed")
		resp.Refusal = &cb
		resp.Schema = rs.fields
	} else {
		resp.Valid = true
		resp.EstimatedRows = report.EstimatedRows
		resp.Schema = importer.Template(report.Schema)
		for _, wn := range report.Warnings {
			resp.Warnings = append(resp.Warnings, inferenceWarning{Column: wn.Column, Message: wn.Message})
		}
		for _, list := range [][]*perrors.CodedError{report.SourceWarnings, report.ZoneWarnings, report.WidthWarnings, report.GroupWarnings, report.TargetWarnings} {
			for _, ce := range list {
				resp.CodedWarnings = append(resp.CodedWarnings, codedOf(ce))
			}
		}
		resp.Groups, resp.Candidates, resp.Projection, resp.Elided = report.Groups, report.GroupCandidates, report.Projection, report.ElidedConstants
	}
	if resp.Schema == nil {
		resp.Schema = []importer.SchemaField{}
	}
	resp.Columns = predictColumns(sample, resp.Schema, resp.Warnings, resp.Refusal)
	if resp.Valid {
		// Ranked under the source's own column names. PULSE-GAP(column-rename)
		resp.Matches = s.rankSchemas(importer.SourceColumns(resp.Schema, rs.opts.Rename), 10)
	}
	WriteJSON(w, http.StatusOK, resp)
}

// predictColumns joins the header, the schema (by exact name) and the
// sample: one entry per source column in source order, then any schema
// field with no source column (a generated SPSS `_missing` sibling, or
// an explicit field the source lacks).
func predictColumns(sample *importer.SampleResult, schema []importer.SchemaField, warns []inferenceWarning, refusal *codedBody) []columnBody {
	byName := map[string]importer.SchemaField{}
	for _, f := range schema {
		byName[f.Name] = f
	}
	out := []columnBody{}
	seen := map[string]bool{}
	for i, name := range sample.Header {
		c := columnBody{Name: name, Index: i, Stats: sample.Stats[i], Samples: []*string{}, Warnings: []string{}}
		if f, ok := byName[name]; ok && !seen[name] {
			seen[name] = true
			c.Included, c.Type, c.Nullable, c.Description, c.Precision, c.Scale = true, f.Type, f.Nullable, f.Description, f.Precision, f.Scale
			if ft, ok := encoding.ParseFieldType(f.Type); ok && ft.IsNumeric() {
				c.Stats.SetNumeric()
			}
		}
		for _, row := range sample.Rows {
			c.Samples = append(c.Samples, row[i])
		}
		out = append(out, c)
	}
	for _, f := range schema {
		if !seen[f.Name] {
			out = append(out, columnBody{Name: f.Name, Index: -1, Included: true, Generated: true, Type: f.Type, Nullable: f.Nullable,
				Description: f.Description, Precision: f.Precision, Scale: f.Scale, Samples: []*string{}, Warnings: []string{}})
		}
	}
	for _, wn := range warns {
		for i := range out {
			if out[i].Name == wn.Column {
				out[i].Warnings = append(out[i].Warnings, wn.Message)
			}
		}
	}
	if refusal != nil && refusal.Column != "" {
		for i := range out {
			if out[i].Name == refusal.Column {
				out[i].Warnings = append(out[i].Warnings, refusal.Message)
			}
		}
	}
	return out
}

func codedOf(ce *perrors.CodedError) codedBody {
	cb := codedBody{Code: string(ce.Code), Message: ce.Message, Details: ce.Details}
	for _, k := range []string{"field", "column"} {
		if v, ok := ce.Details[k].(string); ok && v != "" {
			cb.Column = v
			break
		}
	}
	return cb
}

// toCoded maps an error to the coded body: a Pulse CodedError keeps its
// code; anything else gets fallback.
func toCoded(err error, fallback string) codedBody {
	var ce *perrors.CodedError
	if errors.As(err, &ce) {
		return codedOf(ce)
	}
	var oe *importer.OptionError
	if errors.As(err, &oe) {
		return codedBody{Code: "invalid_option", Message: oe.Message, Details: map[string]any{"option": oe.Option}}
	}
	return codedBody{Code: fallback, Message: err.Error()}
}

// writeImportError writes a reader / import failure: a studio option
// refusal is 400 invalid_option, an unreadable format 415, a cancelled
// request 499, a Pulse coded error 422 with the Pulse code, else 422
// fallback.
func writeImportError(w http.ResponseWriter, err error, fallback, source string) {
	var oe *importer.OptionError
	var fe *importer.FormatError
	switch {
	case errors.As(err, &oe):
		WriteError(w, http.StatusBadRequest, "invalid_option", oe.Message, map[string]any{"option": oe.Option})
	case errors.As(err, &fe):
		WriteError(w, http.StatusUnsupportedMediaType, "unsupported_format", fe.Error(), map[string]any{"source": source, "formats": importer.ReadableFormats()})
	case errors.Is(err, context.Canceled):
		WriteError(w, 499, "cancelled", "request cancelled", nil)
	default:
		cb := toCoded(err, fallback)
		details := cb.Details
		if details == nil {
			details = map[string]any{}
		}
		details["source"] = source
		WriteError(w, http.StatusUnprocessableEntity, cb.Code, cb.Message, details)
	}
}

// ---------------------------------------------------------------- import

type importRequest struct {
	importSource
	Target    string `json:"target"`
	Overwrite bool   `json:"overwrite"`
}

type rowErrorBody struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

type importReportBody struct {
	RowsImported    int                    `json:"rows_imported"`
	RowErrorCount   int                    `json:"row_error_count"`
	RowErrors       []rowErrorBody         `json:"row_errors"` // first 100
	PromotedFields  []string               `json:"promoted_fields"`
	ElidedConstants []string               `json:"elided_constants,omitempty"`
	Groups          []pio.GroupReport      `json:"groups,omitempty"`
	Warnings        []codedBody            `json:"warnings"`
	Schema          []importer.SchemaField `json:"schema"`
	CohortBytes     int64                  `json:"cohort_bytes"`
	ElapsedMS       int64                  `json:"elapsed_ms"`
}

type importResponse struct {
	Target        string           `json:"target"`
	Spec          string           `json:"spec"`
	SpecDoc       *importer.Spec   `json:"spec_doc"`
	Report        importReportBody `json:"report"`
	File          workspace.File   `json:"file"`
	Commit        *history.Commit  `json:"commit,omitempty"`
	SourceChanged bool             `json:"source_changed,omitempty"`
	SchemaChanged bool             `json:"schema_changed,omitempty"`
}

const maxRowErrors = 100

// handleImport is POST /api/import {source, format?, schema?, overrides?,
// options?, target, overwrite?}: imports source into target (a bare
// cohort name → "<name>.pulse" at the root, or a root-relative .pulse
// path), writes imports/<cohort>.import.json and commits the spec and a
// referenced saved schema ("studio: import <target>"; the .pulse is
// gitignored). 201 with the report. An existing target needs
// overwrite:true (409 exists); a spec of that name for another target is
// 409 spec_conflict.
func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	var req importRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Target) == "" {
		WriteError(w, http.StatusBadRequest, "missing_target", "target is required", nil)
		return
	}
	targetRel, ok := importer.TargetPath(req.Target)
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid_target", "target must be a cohort name or a .pulse path whose name is letters, digits, '.', '-' or '_'", map[string]any{"target": req.Target})
		return
	}
	targetRel, targetAbs, ok := s.scopedPath(w, targetRel)
	if !ok {
		return
	}
	rs, ok := s.resolveImportSource(w, req.importSource)
	if !ok {
		return
	}
	rs.opts.SuggestGroups = false

	s.importMu.Lock()
	defer s.importMu.Unlock()

	specRel, specAbs, ok := s.scopedPath(w, importer.SpecPath(targetRel))
	if !ok {
		return
	}
	if t, err := workspace.SpecTarget(specAbs); err == nil && t != targetRel {
		WriteError(w, http.StatusConflict, "spec_conflict", "an import spec of this name builds another cohort", map[string]any{"spec": specRel, "target": t})
		return
	}
	if _, err := os.Stat(targetAbs); err == nil && !req.Overwrite {
		WriteError(w, http.StatusConflict, "exists", "target cohort exists; pass overwrite to replace it", map[string]any{"target": targetRel})
		return
	}
	sum, size, err := importer.HashFile(rs.abs)
	if err != nil {
		writeFSError(w, rs.rel, err)
		return
	}
	spec := &importer.Spec{
		Version: importer.SpecVersion,
		Target:  targetRel,
		Source:  importer.SpecSource{Path: rs.rel, SHA256: sum, Size: size, Format: string(rs.format)},
		Schema:  rs.ref,
		Options: rs.opts,
	}
	s.runImport(w, r, rs, spec, specRel, specAbs, targetAbs, "studio: import "+targetRel, http.StatusCreated, false, false)
}

// runImport runs the import, writes the spec, commits and responds.
// Caller holds importMu.
func (s *Server) runImport(w http.ResponseWriter, r *http.Request, rs *resolvedSource, spec *importer.Spec, specRel, specAbs, targetAbs, msg string, status int, srcChanged, schemaChanged bool) {
	start := time.Now()
	report, err := s.importInto(r.Context(), rs, targetAbs)
	if err != nil {
		writeImportError(w, err, "import_failed", rs.rel)
		return
	}
	body := reportBody(report)
	body.ElapsedMS = time.Since(start).Milliseconds()
	if info, err := os.Stat(targetAbs); err == nil {
		body.CohortBytes = info.Size()
	}
	spec.LastImport = &importer.SpecReport{
		At:             time.Now().UTC().Format(time.RFC3339),
		PulseVersion:   pulse.Version(),
		RowsImported:   body.RowsImported,
		RowErrors:      body.RowErrorCount,
		Warnings:       len(body.Warnings),
		Fields:         len(body.Schema),
		PromotedFields: report.PromotedFields,
		CohortBytes:    body.CohortBytes,
	}
	if _, ok := s.ensureDir(w, importer.ImportsDir); !ok {
		return
	}
	if err := writeSpec(specAbs, spec); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": specRel})
		return
	}
	paths := []string{specRel}
	if rs.refPath != "" {
		paths = append(paths, rs.refPath)
	}
	commit := s.commitPaths(r.Context(), msg, paths...)
	WriteJSON(w, status, importResponse{
		Target: spec.Target, Spec: specRel, SpecDoc: spec, Report: body,
		File:   workspace.File{Path: spec.Target, Kind: workspace.KindCohort, Spec: specRel},
		Commit: commit, SourceChanged: srcChanged, SchemaChanged: schemaChanged,
	})
}

// importInto runs the Pulse import (Pulse.Import) into a temp file beside
// the target and renames it into place, so a failed import never leaves
// a torn or half-replaced cohort. SPSS imports write straight to the
// target: the adapter's metadata sidecar is named after the cohort path.
func (s *Server) importInto(ctx context.Context, rs *resolvedSource, targetAbs string) (*pio.ImportReport, error) {
	if err := os.MkdirAll(filepath.Dir(targetAbs), 0o755); err != nil {
		return nil, err
	}
	out := targetAbs
	if rs.format != pio.FormatSPSS {
		f, err := os.CreateTemp(filepath.Dir(targetAbs), "."+filepath.Base(targetAbs)+".*.tmp")
		if err != nil {
			return nil, err
		}
		out = f.Name()
		_ = f.Close()
		defer os.Remove(out) // no-op after the rename
	}
	job, rd, err := newJob(rs, out)
	if err != nil {
		return nil, err
	}
	defer rd.Close()
	var report *pio.ImportReport
	if s.engine != nil {
		report, err = s.engine.Import(ctx, job)
	} else {
		report, err = job.Run(ctx)
	}
	if err != nil {
		return nil, err
	}
	if out != targetAbs {
		if err := os.Rename(out, targetAbs); err != nil {
			return nil, err
		}
	}
	return report, nil
}

func reportBody(rep *pio.ImportReport) importReportBody {
	b := importReportBody{
		RowsImported: rep.RowsImported, RowErrorCount: len(rep.RowErrors),
		RowErrors: []rowErrorBody{}, PromotedFields: rep.PromotedFields, Warnings: []codedBody{},
		ElidedConstants: rep.ElidedConstants, Groups: rep.Groups, Schema: importer.Template(rep.Schema),
	}
	if b.PromotedFields == nil {
		b.PromotedFields = []string{}
	}
	if b.Schema == nil {
		b.Schema = []importer.SchemaField{}
	}
	for i, re := range rep.RowErrors {
		if i >= maxRowErrors {
			break
		}
		rb := rowErrorBody{Row: re.Row}
		if re.Err != nil {
			rb.Message = re.Err.Error()
			var ce *perrors.CodedError
			if errors.As(re.Err, &ce) {
				rb.Code = string(ce.Code)
			}
		}
		b.RowErrors = append(b.RowErrors, rb)
	}
	for _, list := range [][]*perrors.CodedError{rep.SourceWarnings, rep.ZoneWarnings, rep.WidthWarnings, rep.GroupWarnings} {
		for _, ce := range list {
			b.Warnings = append(b.Warnings, codedOf(ce))
		}
	}
	return b
}

func writeSpec(abs string, spec *importer.Spec) error {
	raw, err := json.Marshal(spec)
	if err != nil {
		return err
	}
	doc, err := jsonfmt.Parse(raw)
	if err != nil {
		return err
	}
	return writeAtomic(abs, jsonfmt.Format(doc, jsonfmt.House), 0o644)
}

// --------------------------------------------------------------- rebuild

type rebuildRequest struct {
	Spec  string `json:"spec"`
	Force bool   `json:"force"`
}

// handleRebuild is POST /api/import/rebuild {spec, force?}: re-runs the
// import an imports/*.import.json spec records, into its target. The
// source must still hash to the spec's sha256: a changed source is 409
// source_changed (details: source, expected_sha256, actual_sha256,
// expected_size, actual_size) unless force, which imports it and records
// the new hash. A missing source is 404 source_missing. A saved schema is
// read as it is now; schema_changed says it differs from the hash the
// spec recorded. The spec's last_import (and any new hashes) are written
// back and committed ("studio: rebuild <target>"). 200 with the import
// response shape.
func (s *Server) handleRebuild(w http.ResponseWriter, r *http.Request) {
	var req rebuildRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.Spec == "" {
		WriteError(w, http.StatusBadRequest, "missing_spec", "spec is required", nil)
		return
	}
	specRel, specAbs, ok := s.scopedPath(w, req.Spec)
	if !ok {
		return
	}
	if kind, _ := workspace.Classify(specRel, nil); kind != workspace.KindImport {
		WriteError(w, http.StatusBadRequest, "not_import_spec", "spec must be an imports/<cohort>.import.json file", map[string]any{"spec": specRel})
		return
	}
	s.importMu.Lock()
	defer s.importMu.Unlock()

	data, err := readSmall(specAbs)
	if err != nil {
		writeFSError(w, specRel, err)
		return
	}
	spec, err := importer.ParseSpec(data)
	if err != nil {
		WriteError(w, http.StatusUnprocessableEntity, "invalid_spec", err.Error(), map[string]any{"spec": specRel})
		return
	}
	targetRel, targetAbs, ok := s.scopedPath(w, spec.Target)
	if !ok {
		return
	}
	if !strings.HasSuffix(strings.ToLower(targetRel), ".pulse") {
		WriteError(w, http.StatusUnprocessableEntity, "invalid_spec", "spec target is not a .pulse path", map[string]any{"spec": specRel, "target": targetRel})
		return
	}
	srcRel, srcAbs, ok := s.scopedPath(w, spec.Source.Path)
	if !ok {
		return
	}
	sum, size, err := importer.HashFile(srcAbs)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			WriteError(w, http.StatusNotFound, "source_missing", "the spec's source file is missing; upload it again to sources/", map[string]any{"spec": specRel, "source": srcRel, "expected_sha256": spec.Source.SHA256})
		} else {
			writeFSError(w, srcRel, err)
		}
		return
	}
	changed := sum != spec.Source.SHA256
	if changed && !req.Force {
		WriteError(w, http.StatusConflict, "source_changed", "the source file changed since the last import; re-check the schema, or rebuild with force",
			map[string]any{"spec": specRel, "source": srcRel, "expected_sha256": spec.Source.SHA256, "actual_sha256": sum, "expected_size": spec.Source.Size, "actual_size": size})
		return
	}
	format := pio.Format(spec.Source.Format)
	if format == "" {
		format = pio.FormatFromPath(srcRel)
	}
	if !format.CanRead() {
		WriteError(w, http.StatusUnprocessableEntity, "invalid_spec", (&importer.FormatError{Format: format}).Error(), map[string]any{"spec": specRel})
		return
	}
	opts := spec.Options
	opts.SuggestGroups = false
	rs := &resolvedSource{rel: srcRel, abs: srcAbs, format: format, opts: opts}
	schemaChanged := false
	if sc := spec.Schema; sc != nil {
		switch {
		case sc.Ref != "":
			raw, _ := json.Marshal(sc.Ref)
			if !s.resolveSchema(w, raw, rs) {
				return
			}
			schemaChanged = rs.ref.SHA256 != sc.SHA256
		case len(sc.Inline) > 0:
			sch, err := importer.BuildSchema(sc.Inline)
			if err != nil {
				writeSchemaError(w, err)
				return
			}
			rs.fields, rs.schema, rs.ref = sc.Inline, sch, sc
		}
	}
	spec.Target = targetRel
	spec.Source = importer.SpecSource{Path: srcRel, SHA256: sum, Size: size, Format: string(format)}
	spec.Schema = rs.ref
	spec.Options = opts
	s.runImport(w, r, rs, spec, specRel, specAbs, targetAbs, "studio: rebuild "+targetRel, http.StatusOK, changed, schemaChanged)
}

// decodeBody reads a JSON request body (max 4 MiB) into v, writing the
// error response itself.
func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	raw, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return false
	}
	if len(raw) > workspace.MaxRequestBytes {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "request body is too large", map[string]any{"max": workspace.MaxRequestBytes})
		return false
	}
	if err := json.Unmarshal(raw, v); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return false
	}
	return true
}
