package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"

	"github.com/frankbardon/pulse-casebook/studio/internal/preview"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// previewCatalog caches the manifest slice the probe builder needs, per
// engine feature set.
type previewCatalog struct {
	mu     sync.Mutex
	digest string
	cat    *preview.Catalog
}

func (s *Server) probeCatalog(ctx context.Context) *preview.Catalog {
	digest := s.engine.FeatureSetDigest()
	s.previewCat.mu.Lock()
	defer s.previewCat.mu.Unlock()
	if s.previewCat.cat == nil || s.previewCat.digest != digest {
		s.previewCat.cat = preview.CatalogFromManifest(s.engine.Manifest(ctx))
		s.previewCat.digest = digest
	}
	return s.previewCat.cat
}

// previewBody is the POST /api/preview request.
//
//	{
//	  "path": "req/04.json",          request file (resolves its cohort)
//	  "request": { ... },             the full request document
//	  "node": "filterers[0]",         one node id, or
//	  "nodes": ["attributes[0]", ...] several nodes of one section
//	  "quantiles": true,              attribute/feature percentiles (default true)
//	  "facet": {"fields": [...]}      cohort/filter nodes: run a facet probe
//	}
type previewBody struct {
	Path      string          `json:"path"`
	Request   json.RawMessage `json:"request"`
	Node      string          `json:"node"`
	Nodes     []string        `json:"nodes"`
	Quantiles *bool           `json:"quantiles"`
	Facet     map[string]any  `json:"facet"`
}

// handlePreview is POST /api/preview: build the node's truncated
// sub-request, run it with one engine call, return the typed probes.
func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	if s.engine == nil {
		WriteError(w, http.StatusServiceUnavailable, "engine_unavailable", "pulse engine is not running", nil)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return
	}
	if len(raw) > workspace.MaxRequestBytes {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", "preview body is too large", map[string]any{"max": workspace.MaxRequestBytes})
		return
	}
	var body previewBody
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return
	}
	if len(body.Request) == 0 {
		WriteError(w, http.StatusBadRequest, "missing_request", "body.request is required", nil)
		return
	}
	nodes := body.Nodes
	if body.Node != "" {
		nodes = append([]string{body.Node}, nodes...)
	}
	kind, reason := workspace.ClassifyJSON(body.Request)
	if kind == workspace.KindUnopenable {
		WriteError(w, http.StatusBadRequest, "not_request", "body.request is not a Pulse request: "+reason, nil)
		return
	}
	doc, err := preview.DecodeDoc(body.Request)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return
	}
	opts := preview.Options{
		Quantiles:     body.Quantiles == nil || *body.Quantiles,
		Facet:         body.Facet,
		ResolveCohort: s.cohortResolver(body.Path),
	}
	plan, err := preview.Build(doc, string(kind), nodes, s.probeCatalog(r.Context()), opts)
	if err != nil {
		writePreviewError(w, err)
		return
	}

	ctx := r.Context()
	if s.cfg.PreviewTimeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, s.cfg.PreviewTimeout)
		defer cancel()
	}
	res, err := preview.Run(ctx, s.engine, plan)
	if err != nil {
		writePreviewError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, res)
}

func writePreviewError(w http.ResponseWriter, err error) {
	var be *preview.Error
	var ee *preview.EngineError
	switch {
	case errors.As(err, &be):
		status := http.StatusBadRequest
		switch be.Code {
		case "node_not_found", "cohort_not_found":
			status = http.StatusNotFound
		case "unsupported_node":
			status = http.StatusUnprocessableEntity
		}
		WriteError(w, status, be.Code, be.Message, be.Details)
	case errors.As(err, &ee):
		WriteError(w, http.StatusUnprocessableEntity, ee.Code, ee.Message, ee.Details)
	case errors.Is(err, context.DeadlineExceeded):
		WriteError(w, http.StatusGatewayTimeout, "timed_out", "preview exceeded the preview timeout", nil)
	case errors.Is(err, context.Canceled):
		WriteError(w, 499, "cancelled", "preview was cancelled", nil)
	default:
		WriteError(w, http.StatusInternalServerError, "preview_failed", err.Error(), nil)
	}
}

// cohortResolver rewrites a request's cohort {filename, data_dir} to the
// root-relative filename the engine opens. Candidates mirror the UI's
// cohortCandidates (studio/ui/src/graph/cohortPath.ts): data_dir against
// the root, then the request's directory, then its parent.
func (s *Server) cohortResolver(requestPath string) func(any) (any, error) {
	return func(c any) (any, error) {
		cands := cohortCandidates(requestPath, c)
		for _, cand := range cands {
			abs, err := s.root.Resolve(cand)
			if err != nil {
				continue
			}
			if info, err := os.Stat(abs); err == nil && info.Mode().IsRegular() {
				return map[string]any{"filename": cand}, nil
			}
		}
		return nil, &preview.Error{Code: "cohort_not_found", Message: "the request's cohort file was not found in the workspace",
			Details: map[string]any{"candidates": cands}}
	}
}

func cohortCandidates(requestPath string, cohort any) []string {
	obj, ok := cohort.(map[string]any)
	if !ok {
		return []string{}
	}
	filename, _ := obj["filename"].(string)
	if filename == "" {
		return []string{}
	}
	dataDir, ok := obj["data_dir"].(string)
	if !ok {
		dataDir = "."
	}
	if isAbsPath(dataDir) || isAbsPath(filename) {
		return []string{}
	}
	reqDir := slashDir(requestPath)
	out := []string{}
	for _, base := range []string{"", reqDir, slashDir(reqDir)} {
		p, ok := normalizeRel(base + "/" + dataDir + "/" + filename)
		if ok && !slices.Contains(out, p) {
			out = append(out, p)
		}
	}
	return out
}

func isAbsPath(p string) bool {
	return strings.HasPrefix(p, "/") || strings.HasPrefix(p, `\`) ||
		(len(p) >= 2 && p[1] == ':' && ((p[0] >= 'A' && p[0] <= 'Z') || (p[0] >= 'a' && p[0] <= 'z')))
}

func slashDir(p string) string {
	i := strings.LastIndex(p, "/")
	if i < 0 {
		return ""
	}
	return p[:i]
}

// normalizeRel resolves "." and ".." in a relative slash path; false if
// it escapes the root or is empty.
func normalizeRel(p string) (string, bool) {
	var stack []string
	for _, seg := range strings.Split(p, "/") {
		switch seg {
		case "", ".":
		case "..":
			if len(stack) == 0 {
				return "", false
			}
			stack = stack[:len(stack)-1]
		default:
			stack = append(stack, seg)
		}
	}
	if len(stack) == 0 {
		return "", false
	}
	return strings.Join(stack, "/"), true
}
