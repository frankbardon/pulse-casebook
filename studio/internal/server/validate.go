package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"maps"
	"net/http"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/descriptor"
	pulseerrors "github.com/frankbardon/pulse/errors"

	"github.com/frankbardon/pulse-casebook/studio/internal/preview"
	"github.com/frankbardon/pulse-casebook/studio/internal/validate"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// validateBody is the POST /api/predict and POST /api/explain request:
//
//	{
//	  "path": "case/req/04.json",   request file (resolves its cohorts)
//	  "request": { ... }            the in-memory request document
//	}
//
// The document is validated as sent (the editor's unsaved state), never
// the file on disk; path only anchors cohort resolution, exactly as for
// /api/preview.
type validateBody struct {
	Path    string          `json:"path"`
	Request json.RawMessage `json:"request"`
}

// predictResponse is POST /api/predict: the root's no-execute verdict
// with every refusal and suggestion mapped to a node path ("" = the
// request as a whole; see validate.Locate).
type predictResponse struct {
	Root   string           `json:"root"`
	Valid  bool             `json:"valid"`
	Issues []validate.Issue `json:"issues"`
}

// explainStep is one explain step keyed by the node path of its slot.
type explainStep struct {
	Path     string   `json:"path"`
	Operator string   `json:"operator,omitempty"`
	Fields   []string `json:"fields,omitempty"`
	Text     string   `json:"text"`
}

// explainResponse is POST /api/explain: the plain-language summary and
// one step per slot (the node hover text).
type explainResponse struct {
	Root    string        `json:"root"`
	Summary string        `json:"summary"`
	Valid   *bool         `json:"valid,omitempty"`
	Steps   []explainStep `json:"steps"`
	Caveats []string      `json:"caveats,omitempty"`
}

// readValidateBody decodes the shared body, writing the error itself.
func (s *Server) readValidateBody(w http.ResponseWriter, r *http.Request) (validateBody, workspace.Kind, map[string]any, bool) {
	var body validateBody
	if s.engine == nil {
		WriteError(w, http.StatusServiceUnavailable, "engine_unavailable", "pulse engine is not running", nil)
		return body, "", nil, false
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return body, "", nil, false
	}
	if len(raw) > workspace.MaxRequestBytes {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "request body is too large", map[string]any{"max": workspace.MaxRequestBytes})
		return body, "", nil, false
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return body, "", nil, false
	}
	if len(body.Request) == 0 {
		WriteError(w, http.StatusBadRequest, "missing_request", "body.request is required", nil)
		return body, "", nil, false
	}
	kind, reason := workspace.ClassifyJSON(body.Request)
	if kind == workspace.KindUnopenable {
		WriteError(w, http.StatusBadRequest, "not_request", "body.request is not a Pulse request: "+reason, nil)
		return body, "", nil, false
	}
	doc, err := preview.DecodeDoc(body.Request)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return body, "", nil, false
	}
	return body, kind, doc, true
}

// engineDoc copies doc with every cohort object rewritten to the
// root-relative file the engine opens (the request's own, each Compose
// slot's and each fit request's). A cohort that resolves to no workspace
// file is reported as an issue on its cohort node and dropped from the
// copy, so Explain still describes the rest.
func (s *Server) engineDoc(requestPath string, doc map[string]any, kind workspace.Kind) (map[string]any, []validate.Issue) {
	resolve := s.cohortResolver(requestPath)
	var issues []validate.Issue
	fix := func(obj map[string]any, at []preview.Segment) map[string]any {
		c, ok := obj["cohort"]
		if !ok {
			return obj
		}
		out := maps.Clone(obj)
		got, err := resolve(c)
		if err != nil {
			delete(out, "cohort")
			issues = append(issues, validate.Issue{
				Path:     preview.FormatPath(append(at, preview.Key("cohort"))),
				Severity: validate.Error,
				Code:     "cohort_not_found",
				Message:  "the cohort file was not found in the workspace",
			})
			return out
		}
		out["cohort"] = got
		return out
	}
	out := fix(doc, nil)
	if kind == workspace.KindCompose {
		if list, ok := doc["requests"].([]any); ok {
			reqs := make([]any, len(list))
			for i, e := range list {
				if m, ok := e.(map[string]any); ok {
					reqs[i] = fix(m, []preview.Segment{preview.Key("requests"), preview.Index(i)})
				} else {
					reqs[i] = e
				}
			}
			out["requests"] = reqs
		}
		if list, ok := doc["fits"].([]any); ok {
			fits := make([]any, len(list))
			for i, e := range list {
				fit, ok := e.(map[string]any)
				req, ok2 := fit["request"].(map[string]any)
				if !ok || !ok2 {
					fits[i] = e
					continue
				}
				fit = maps.Clone(fit)
				fit["request"] = fix(req, []preview.Segment{preview.Key("fits"), preview.Index(i), preview.Key("request")})
				fits[i] = fit
			}
			out["fits"] = fits
		}
	}
	return out, issues
}

// handlePredict is POST /api/predict: run the root's Predict* on the
// in-memory document and map refusals and suggestions to node paths.
func (s *Server) handlePredict(w http.ResponseWriter, r *http.Request) {
	body, kind, doc, ok := s.readValidateBody(w, r)
	if !ok {
		return
	}
	edoc, issues := s.engineDoc(body.Path, doc, kind)
	res := predictResponse{Root: string(kind), Issues: []validate.Issue{}}
	if len(issues) > 0 {
		res.Issues = issues
		WriteJSON(w, http.StatusOK, res)
		return
	}
	data, err := json.Marshal(edoc)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "predict_failed", err.Error(), nil)
		return
	}
	decodeIssue := func(err error) {
		res.Issues = append(res.Issues, validate.Issue{
			Path: validate.DecodePath(doc, "", err), Severity: validate.Error,
			Code: "invalid_request", Message: err.Error(),
		})
	}
	engineIssue := func(err error) {
		code := "PREDICT_FAILED"
		var ce *pulseerrors.CodedError
		if errors.As(err, &ce) {
			code = string(ce.Code)
		}
		res.Issues = append(res.Issues, validate.Issue{Path: "", Severity: validate.Error, Code: code, Message: err.Error()})
	}
	located := func(entries []*descriptor.EnvelopeEntry, severity string) {
		for _, e := range entries {
			if e == nil {
				continue
			}
			for _, p := range validate.Locate(doc, string(kind), e.Details) {
				res.Issues = append(res.Issues, validate.Issue{Path: p, Severity: severity, Code: e.Code, Message: e.Message})
			}
		}
	}
	ctx := r.Context()
	switch kind {
	case workspace.KindCompose:
		var req pulse.ComposedRequest
		if err := json.Unmarshal(data, &req); err != nil {
			decodeIssue(err)
			break
		}
		env, err := s.engine.PredictCompose(ctx, &req)
		if err != nil {
			engineIssue(err)
			break
		}
		located(env.Errors, validate.Error)
		located(env.Warnings, validate.Warning)
	case workspace.KindFacet:
		var req pulse.FacetRequest
		if err := json.Unmarshal(data, &req); err != nil {
			decodeIssue(err)
			break
		}
		env, err := s.engine.PredictFacet(ctx, &req)
		if err != nil {
			engineIssue(err)
			break
		}
		located(env.Errors, validate.Error)
		located(env.Warnings, validate.Warning)
	case workspace.KindChain:
		var req pulse.ChainRequest
		if err := json.Unmarshal(data, &req); err != nil {
			decodeIssue(err)
			break
		}
		env, err := s.engine.PredictChain(ctx, &req)
		if err != nil {
			engineIssue(err)
			break
		}
		located(env.Errors, validate.Error)
		located(env.Warnings, validate.Warning)
	default:
		var req pulse.Request
		if err := json.Unmarshal(data, &req); err != nil {
			decodeIssue(err)
			break
		}
		// Predict returns the verdict and suggestions but not the
		// refusals; Explain re-runs the same header-only predict and
		// reports them (Refusals), so both are asked.
		pr, err := s.engine.Predict(ctx, &req)
		if err != nil {
			engineIssue(err)
			break
		}
		ex, err := s.engine.Explain(ctx, descriptor.ExplainRequest{Request: &req})
		if err == nil {
			refusals := make([]*descriptor.EnvelopeEntry, len(ex.Refusals))
			for i := range ex.Refusals {
				refusals[i] = &ex.Refusals[i]
			}
			located(refusals, validate.Error)
		}
		if !pr.Valid && !hasError(res.Issues) {
			res.Issues = append(res.Issues, validate.Issue{Path: "", Severity: validate.Error, Code: "PREDICT_INVALID", Message: "predict reports the request invalid"})
		}
		for _, sg := range pr.Suggestions {
			res.Issues = append(res.Issues, validate.Issue{
				Path:       validate.SuggestionPath("", sg.Path),
				Severity:   validate.SuggestionSeverity(sg.Reason),
				Code:       "SUGGESTION",
				Message:    sg.Reason,
				Current:    sg.Current,
				Proposed:   sg.Proposed,
				Confidence: sg.Confidence,
			})
		}
	}
	res.Issues = validate.Dedupe(res.Issues)
	res.Valid = !hasError(res.Issues)
	WriteJSON(w, http.StatusOK, res)
}

func hasError(issues []validate.Issue) bool {
	for _, is := range issues {
		if is.Severity == validate.Error {
			return true
		}
	}
	return false
}

// handleExplain is POST /api/explain: the engine's plain-language
// description of the in-memory document, one step per slot keyed by the
// slot's node path (the UI's node hover text).
func (s *Server) handleExplain(w http.ResponseWriter, r *http.Request) {
	body, kind, doc, ok := s.readValidateBody(w, r)
	if !ok {
		return
	}
	edoc, _ := s.engineDoc(body.Path, doc, kind)
	data, err := json.Marshal(edoc)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "explain_failed", err.Error(), nil)
		return
	}
	var req descriptor.ExplainRequest
	switch kind {
	case workspace.KindCompose:
		req.Composed = &pulse.ComposedRequest{}
		err = json.Unmarshal(data, req.Composed)
	case workspace.KindFacet:
		req.Facet = &pulse.FacetRequest{}
		err = json.Unmarshal(data, req.Facet)
	case workspace.KindChain:
		req.Chain = &pulse.ChainRequest{}
		err = json.Unmarshal(data, req.Chain)
	default:
		req.Request = &pulse.Request{}
		err = json.Unmarshal(data, req.Request)
	}
	if err != nil {
		WriteError(w, http.StatusUnprocessableEntity, "invalid_request", err.Error(), map[string]any{"path": validate.DecodePath(doc, "", err)})
		return
	}
	ex, err := s.engine.Explain(r.Context(), req)
	if err != nil {
		code := "explain_failed"
		var ce *pulseerrors.CodedError
		if errors.As(err, &ce) {
			code = string(ce.Code)
		}
		WriteError(w, http.StatusUnprocessableEntity, code, err.Error(), nil)
		return
	}
	out := explainResponse{Root: string(kind), Summary: ex.Summary, Valid: ex.Valid, Steps: []explainStep{}, Caveats: ex.Caveats}
	for _, st := range ex.Steps {
		path := st.Slot
		if _, err := preview.ParsePath(path); err != nil {
			path = ""
		}
		out.Steps = append(out.Steps, explainStep{Path: path, Operator: st.Operator, Fields: st.Fields, Text: st.Text})
	}
	WriteJSON(w, http.StatusOK, out)
}
