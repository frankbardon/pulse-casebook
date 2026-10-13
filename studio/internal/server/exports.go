package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/descriptor"
	perrors "github.com/frankbardon/pulse/errors"
	pio "github.com/frankbardon/pulse/io"
	"github.com/frankbardon/pulse/types"
	"github.com/spf13/afero"

	"github.com/frankbardon/pulse-casebook/studio/internal/exporter"
)

// Export endpoints (X1, streaming since W1). A cohort is exported to any
// format Pulse writes (plus the zstd transfer artifact). Exports are not
// stored: each export is generated on demand and streamed back as a
// download; nothing is written to the library.
//
//	GET  /api/export/formats         format descriptors + common options
//	POST /api/export/predict         preflight: rows, warnings, refusal
//	POST /api/export                 the exported file as an attachment
//
// Shapes are documented on each handler and in the visual-request-builder
// story notes ("X1").

func (s *Server) registerExportRoutes() {
	s.mux.HandleFunc("GET /api/export/formats", s.handleExportFormats)
	s.mux.HandleFunc("POST /api/export/predict", s.handleExportPredict)
	s.mux.HandleFunc("POST /api/export", s.handleExport)
}

// handleExportFormats is GET /api/export/formats →
// {formats:[exporter.Format], common:exporter.Common}.
func (s *Server) handleExportFormats(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"formats": exporter.Formats(), "common": exporter.CommonOptions()})
}

// exportRequest is the predict / export body. Fields empty = every
// field; Options are the format's own (exporter.Format.Options keys).
type exportRequest struct {
	Cohort   string                `json:"cohort"`
	Format   string                `json:"format"`
	Options  map[string]any        `json:"options"`
	Fields   []string              `json:"fields"`
	TimeZone string                `json:"time_zone"`
	Labels   []*types.LabelBinding `json:"labels"`
	Name     string                `json:"name"`
}

// exportPlan is a validated request.
type exportPlan struct {
	req      exportRequest
	rel, abs string
	format   exporter.Format
	settings exporter.Settings
	engine   *pulse.Pulse
}

func (p *exportPlan) transfer() bool { return p.format.ID == exporter.FormatTransfer }

// resolveExport validates the body shared by predict and export,
// writing the error response itself.
func (s *Server) resolveExport(w http.ResponseWriter, r *http.Request) (*exportPlan, bool) {
	var req exportRequest
	if !decodeBody(w, r, &req) {
		return nil, false
	}
	if strings.TrimSpace(req.Cohort) == "" {
		WriteError(w, http.StatusBadRequest, "missing_cohort", "cohort is required", nil)
		return nil, false
	}
	if !strings.HasSuffix(strings.ToLower(req.Cohort), ".pulse") {
		WriteError(w, http.StatusBadRequest, "not_cohort", "only .pulse cohorts can be exported", map[string]any{"cohort": req.Cohort})
		return nil, false
	}
	rel, abs, ok := s.scopedPath(w, req.Cohort)
	if !ok {
		return nil, false
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeFSError(w, rel, err)
		return nil, false
	}
	if !info.Mode().IsRegular() {
		WriteError(w, http.StatusBadRequest, "not_a_file", "cohort is not a regular file", map[string]any{"cohort": rel})
		return nil, false
	}
	f, ok := exporter.Lookup(req.Format)
	if !ok {
		ids := []string{}
		for _, d := range exporter.Formats() {
			ids = append(ids, d.ID)
		}
		WriteError(w, http.StatusBadRequest, "unknown_format", fmt.Sprintf("unknown export format %q", req.Format), map[string]any{"format": req.Format, "formats": ids})
		return nil, false
	}
	settings, err := exporter.Decode(f, req.Options)
	if err != nil {
		var oe *exporter.OptionError
		if errors.As(err, &oe) {
			WriteError(w, http.StatusBadRequest, "invalid_option", oe.Message, map[string]any{"option": oe.Option, "format": f.ID})
			return nil, false
		}
		WriteError(w, http.StatusBadRequest, "invalid_option", err.Error(), nil)
		return nil, false
	}
	if f.ID == exporter.FormatTransfer {
		for opt, set := range map[string]bool{"fields": len(req.Fields) > 0, "time_zone": req.TimeZone != "", "labels": len(req.Labels) > 0} {
			if set {
				WriteError(w, http.StatusBadRequest, "invalid_option", "the transfer artifact is the whole cohort: "+opt+" does not apply", map[string]any{"option": opt, "format": f.ID})
				return nil, false
			}
		}
	}
	for i, b := range req.Labels {
		if b == nil || b.Field == "" || b.Table == "" {
			WriteError(w, http.StatusBadRequest, "invalid_option", "a label binding needs a field and a table", map[string]any{"option": "labels", "index": i})
			return nil, false
		}
		if b.Mode != "" && b.Mode != types.LabelModeReplace && b.Mode != types.LabelModeAugment {
			WriteError(w, http.StatusBadRequest, "invalid_option", "label mode must be replace or augment", map[string]any{"option": "labels", "index": i, "mode": b.Mode})
			return nil, false
		}
	}
	if s.engine == nil {
		WriteError(w, http.StatusServiceUnavailable, "engine_unavailable", "pulse engine is not running", nil)
		return nil, false
	}
	req.TimeZone = strings.TrimSpace(req.TimeZone)
	return &exportPlan{req: req, rel: rel, abs: abs, format: f, settings: settings, engine: s.engineFor(rel)}, true
}

// exportField is one cohort field as the export dialog lists it.
type exportField struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Categorical bool   `json:"categorical,omitempty"`
}

type exportPredictResponse struct {
	Cohort      string                 `json:"cohort"`
	Format      string                 `json:"format"`
	Valid       bool                   `json:"valid"`
	Refusal     *codedBody             `json:"refusal,omitempty"`
	Rows        int64                  `json:"rows"`
	CohortBytes int64                  `json:"cohort_bytes"`
	Fields      []exportField          `json:"fields"`
	Exported    int                    `json:"exported_fields"`
	Warnings    []codedBody            `json:"warnings"`
	LabelTables []pulse.LabelTableInfo `json:"label_tables"`
	Name        string                 `json:"name"`
}

// handleExportPredict is POST /api/export/predict {cohort, format,
// options?, fields?, time_zone?, labels?, name?}: a preflight that writes
// nothing. A refusal the export would hit is NOT an HTTP error: valid
// false + refusal {code, message, details} (Pulse's code where Pulse
// decides: PULSE_EXPORT_FIELD_UNKNOWN, PULSE_LABEL_TABLE_UNKNOWN,
// PULSE_TIMEZONE_UNKNOWN, PULSE_SPSS_EXPORT_UNSUPPORTED, …; studio's
// excel_row_limit for a cohort too long for one sheet).
//
// Rows and fields come from the cohort header (Pulse Inspect). Pulse's
// ExportJob.Predict runs when it can refuse something (a .sav target, a
// time zone, label bindings): it reads the whole cohort, so a plain
// CSV preflight of a large cohort stays a header read.
func (s *Server) handleExportPredict(w http.ResponseWriter, r *http.Request) {
	p, ok := s.resolveExport(w, r)
	if !ok {
		return
	}
	insp, err := p.engine.Inspect(r.Context(), p.rel)
	if err != nil {
		writeExportError(w, err, "inspect_failed", p.rel)
		return
	}
	info, _ := os.Stat(p.abs)
	out := exportPredictResponse{
		Cohort: p.rel, Format: p.format.ID, Valid: true, Rows: insp.RecordCount,
		Fields: []exportField{}, Warnings: []codedBody{}, LabelTables: p.engine.LabelTables(),
	}
	if info != nil {
		out.CohortBytes = info.Size()
	}
	if out.LabelTables == nil {
		out.LabelTables = []pulse.LabelTableInfo{}
	}
	for _, f := range insp.Fields {
		out.Fields = append(out.Fields, exportField{Name: f.Name, Type: f.Type, Categorical: f.Categorical})
	}
	out.Exported = len(out.Fields)
	if !p.transfer() && len(p.req.Fields) > 0 {
		out.Exported = len(p.req.Fields)
	}
	name := p.req.Name
	if strings.TrimSpace(name) == "" {
		name = exporter.DefaultName(p.rel, p.format)
	}
	if file, ok := exporter.FileName(name, p.format); ok {
		out.Name = file
	}

	refuse := func(cb codedBody) {
		out.Valid, out.Refusal = false, &cb
		WriteJSON(w, http.StatusOK, out)
	}
	if ce := checkExport(p, insp, out.LabelTables); ce != nil {
		refuse(codedOf(ce))
		return
	}
	if p.transfer() || !(p.format.ID == string(pio.FormatSPSS) || p.req.TimeZone != "" || len(p.req.Labels) > 0) {
		WriteJSON(w, http.StatusOK, out)
		return
	}
	// Pulse's own preflight: the writer is built but never opened.
	wr, err := pio.NewWriter(pio.Format(p.format.ID), afero.NewOsFs(), filepath.Join(os.TempDir(), "studio-export-predict"), p.settings.Writer)
	if err != nil {
		refuse(toCoded(err, "predict_failed"))
		return
	}
	job := p.job(p.abs, wr)
	if len(job.Labels) > 0 {
		// Predict only asks whether the export is labelled; the real
		// resolver is built by Pulse.Export from the registered tables.
		job.LabelResolver = labelledOnly{}
	}
	rep, err := job.Predict(r.Context())
	if err != nil {
		if errors.Is(err, context.Canceled) {
			WriteError(w, 499, "cancelled", "predict cancelled", nil)
			return
		}
		refuse(toCoded(err, "predict_failed"))
		return
	}
	for _, ce := range rep.TargetWarnings {
		out.Warnings = append(out.Warnings, codedOf(ce))
	}
	WriteJSON(w, http.StatusOK, out)
}

// checkExport refuses, before any Pulse call, what the export would
// refuse from the header alone: unknown included fields, label bindings
// on unknown fields or tables, and a cohort too long for one Excel
// sheet. The codes are Pulse's where Pulse has one.
func checkExport(p *exportPlan, insp *descriptor.InspectResult, tables []pulse.LabelTableInfo) *perrors.CodedError {
	if p.transfer() {
		return nil
	}
	known := map[string]bool{}
	names := make([]string, 0, len(insp.Fields))
	for _, f := range insp.Fields {
		known[f.Name] = true
		names = append(names, f.Name)
	}
	for _, f := range p.req.Fields {
		if !known[f] {
			return perrors.NewCodedErrorWithDetails(perrors.PULSE_EXPORT_FIELD_UNKNOWN,
				fmt.Sprintf("field %q is not in the cohort", f), map[string]any{"field": f, "known": names})
		}
	}
	registered := map[string]bool{}
	for _, t := range tables {
		registered[t.Name] = true
	}
	for _, b := range p.req.Labels {
		if !known[b.Field] {
			return perrors.NewCodedErrorWithDetails(perrors.PULSE_EXPORT_FIELD_UNKNOWN,
				fmt.Sprintf("label binding names field %q, which is not in the cohort", b.Field), map[string]any{"field": b.Field, "known": names})
		}
		if !registered[b.Table] {
			avail := make([]string, 0, len(tables))
			for _, t := range tables {
				avail = append(avail, t.Name)
			}
			return perrors.NewCodedErrorWithDetails(perrors.PULSE_LABEL_TABLE_UNKNOWN,
				fmt.Sprintf("label table %q is not registered (the workspace's labels/ directory serving this cohort)", b.Table),
				map[string]any{"field": b.Field, "table": b.Table, "tables": avail})
		}
	}
	if p.format.ID == string(pio.FormatExcel) && insp.RecordCount > exporter.ExcelMaxRows {
		return perrors.NewCodedErrorWithDetails("excel_row_limit",
			fmt.Sprintf("%d rows do not fit one Excel sheet (at most %d); export to CSV or Parquet instead", insp.RecordCount, exporter.ExcelMaxRows),
			map[string]any{"rows": insp.RecordCount, "max": exporter.ExcelMaxRows})
	}
	return nil
}

// job builds the Pulse export job for a tabular plan.
func (p *exportPlan) job(source string, wr pio.Writer) *pio.ExportJob {
	job := pio.NewExportJob(source, wr)
	job.FS = afero.NewOsFs()
	if len(p.req.Fields) > 0 {
		job.Includes = p.req.Fields
	}
	if len(p.req.Labels) > 0 {
		job.Labels = p.req.Labels
	}
	job.TimeZone = p.req.TimeZone
	return job
}

// labelledOnly stands in for the label resolver during Predict, which
// only asks whether one is set.
type labelledOnly struct{}

func (labelledOnly) Has(string) bool                            { return false }
func (labelledOnly) Mode(string) types.LabelMode                { return "" }
func (labelledOnly) Apply(_, raw string) (string, string, bool) { return raw, "", false }
func (labelledOnly) FieldsWithAugment() []string                { return nil }
func (labelledOnly) Warnings() []pio.LabelWarning               { return nil }

type exportReportBody struct {
	Rows          int            `json:"rows"`
	Fields        int            `json:"fields,omitempty"`
	Bytes         int64          `json:"bytes"`
	ElapsedMS     int64          `json:"elapsed_ms"`
	RowErrorCount int            `json:"row_error_count"`
	RowErrors     []rowErrorBody `json:"row_errors"`
	Warnings      []codedBody    `json:"warnings"`
}

// exportReportHeader carries the export report beside the streamed
// file: the JSON below, percent-encoded (encodeURIComponent-compatible;
// decode with decodeURIComponent).
const exportReportHeader = "X-Studio-Export-Report"

type exportResponse struct {
	Name     string              `json:"name"`
	Format   string              `json:"format"`
	Cohort   string              `json:"cohort"`
	Report   exportReportBody    `json:"report"`
	Transfer *pio.TransferReport `json:"transfer,omitempty"`
}

// handleExport is POST /api/export: the predict body (name? = the
// download's file name, default "<cohort>.<ext>"; the format's extension
// is appended unless present). Exports are never stored: the file is
// generated in memory and streamed back as the response body (200,
// Content-Type by extension, Content-Disposition attachment with the
// name, Content-Length), with the report {name, format, cohort,
// report:{rows, fields?, bytes, elapsed_ms, row_error_count, row_errors
// (≤100), warnings:[coded]}, transfer?} percent-encoded in the
// X-Studio-Export-Report header. Nothing is written to the library.
//
// Errors (JSON envelope, nothing streamed): as predict, plus
// invalid_name 400, a Pulse refusal 422 with its code, export_failed
// 422, cancelled 499.
func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	p, ok := s.resolveExport(w, r)
	if !ok {
		return
	}
	name := p.req.Name
	if strings.TrimSpace(name) == "" {
		name = exporter.DefaultName(p.rel, p.format)
	}
	file, ok := exporter.FileName(name, p.format)
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid_name", "export name must be letters, digits, '.', '-' or '_', starting with a letter or digit", map[string]any{"name": name})
		return
	}
	// Pulse writers write through an afero Fs: an in-memory one here
	// (the file name keeps its extension: some writers check it), over
	// the read-only OS filesystem for the transfer job, which reads its
	// source through the same Fs.
	mem := afero.NewMemMapFs()
	out := "/export/" + file
	_ = mem.MkdirAll("/export", 0o755) // the copy-on-write Fs needs the parent in its layer

	start := time.Now()
	resp := exportResponse{Name: file, Format: p.format.ID, Cohort: p.rel}
	resp.Report.RowErrors, resp.Report.Warnings = []rowErrorBody{}, []codedBody{}
	if p.transfer() {
		fsys := afero.NewCopyOnWriteFs(afero.NewReadOnlyFs(afero.NewOsFs()), mem)
		rep, err := p.engine.ExportTransfer(r.Context(), &pio.TransferExportJob{FS: fsys, Source: p.abs, Output: out, Level: p.settings.Level})
		if err != nil {
			writeExportError(w, err, "export_failed", p.rel)
			return
		}
		rep.Source, rep.Output = p.rel, file
		resp.Transfer = rep
		if insp, err := p.engine.Inspect(r.Context(), p.rel); err == nil {
			resp.Report.Rows = int(insp.RecordCount)
			resp.Report.Fields = len(insp.Fields)
		}
	} else {
		wr, err := pio.NewWriter(pio.Format(p.format.ID), mem, out, p.settings.Writer)
		if err != nil {
			writeExportError(w, err, "export_failed", p.rel)
			return
		}
		// Every Pulse writer buffers and emits its file once, in Close;
		// on an error it is discarded (releases Excel's spill files).
		rep, err := p.engine.Export(r.Context(), p.job(p.abs, wr))
		if err == nil {
			err = wr.Close()
		} else if dw, ok := wr.(pio.DiscardableWriter); ok {
			_ = dw.Discard()
		}
		if err != nil {
			writeExportError(w, err, "export_failed", p.rel)
			return
		}
		// A writer that encodes at Close (.sav) raises its diagnostics
		// there: re-read them after Close, as the pulse CLI does.
		if twe, ok := wr.(pio.TargetWarningEmitter); ok {
			rep.TargetWarnings = twe.Warnings()
		}
		fillExportReport(&resp.Report, rep)
		resp.Report.Fields = len(p.req.Fields)
	}
	data, err := afero.ReadFile(mem, out)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "export_failed", "the export produced no file: "+err.Error(), map[string]any{"cohort": p.rel})
		return
	}
	resp.Report.Bytes = int64(len(data))
	resp.Report.ElapsedMS = time.Since(start).Milliseconds()
	report, _ := json.Marshal(resp)

	ctype := mime.TypeByExtension(filepath.Ext(file))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	h := w.Header()
	h.Set("Content-Type", ctype)
	h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file}))
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("Cache-Control", "no-store")
	h.Set(exportReportHeader, encodeURIComponent(string(report)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// encodeURIComponent percent-encodes s like JavaScript's
// encodeURIComponent, so the UI decodes it with decodeURIComponent.
func encodeURIComponent(s string) string {
	const keep = "-_.!~*'()"
	var b strings.Builder
	for _, c := range []byte(s) {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.IndexByte(keep, c) >= 0 {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}

func fillExportReport(b *exportReportBody, rep *pio.ExportReport) {
	b.Rows = rep.RowsExported
	b.RowErrorCount = len(rep.RowErrors)
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
	for _, list := range [][]*perrors.CodedError{rep.TargetWarnings, rep.OverlayWarnings} {
		for _, ce := range list {
			b.Warnings = append(b.Warnings, codedOf(ce))
		}
	}
	for _, lw := range rep.LabelWarnings {
		cb := codedBody{Code: lw.Code, Message: lw.Message, Details: lw.Details}
		if f, ok := lw.Details["field"].(string); ok {
			cb.Column = f
		}
		b.Warnings = append(b.Warnings, cb)
	}
}

// writeExportError: cancelled 499, a Pulse coded error 422 with the
// Pulse code (+ cohort in details), else 422 fallback.
func writeExportError(w http.ResponseWriter, err error, fallback, cohort string) {
	if errors.Is(err, context.Canceled) {
		WriteError(w, 499, "cancelled", "request cancelled", nil)
		return
	}
	cb := toCoded(err, fallback)
	details := map[string]any{}
	for k, v := range cb.Details {
		details[k] = v
	}
	details["cohort"] = cohort
	WriteError(w, http.StatusUnprocessableEntity, cb.Code, cb.Message, details)
}
