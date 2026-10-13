package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/frankbardon/pulse"
	"github.com/frankbardon/pulse/descriptor"
	pulseerrors "github.com/frankbardon/pulse/errors"
	"github.com/frankbardon/pulse/types"

	"github.com/frankbardon/pulse-casebook/studio/internal/library"
	"github.com/frankbardon/pulse-casebook/studio/internal/validate"
	"github.com/frankbardon/pulse-casebook/studio/internal/workspace"
)

// A full run (POST /api/run) executes the in-memory document with the
// root's own engine call — Process, Compose, ProcessChain or FacetSchema
// — on the engine engineFor selects for the request (its case's label
// tables), exactly as predict, explain and previews do. Unlike previews
// it is never deferred by --auto-preview-rows and has no timeout: it ends
// when the engine finishes, the caller disconnects (the UI's Cancel
// aborts the fetch) or a newer run of the same client and file starts.
//
// The response carries the envelope as the exact bytes `pulse api
// <verb> -r <file> --json` would print (see envelopeBytes). Results stay
// in memory: nothing is written until POST /api/run/save names a run.

// runBody is the POST /api/run request:
//
//	{
//	  "path": "case/req/04.json",   request file (cohorts, label tables, out/)
//	  "request": { ... },           the in-memory request document
//	  "client": "6f1c..."           opaque caller id (one per UI page load)
//	}
type runBody struct {
	Path    string          `json:"path"`
	Request json.RawMessage `json:"request"`
	Client  string          `json:"client"`
}

// runResponse is POST /api/run. Text is the envelope exactly as Save
// writes it; OutDir/OutName are where Save puts it by default.
type runResponse struct {
	RunID     string `json:"run_id"`
	Root      string `json:"root"`
	Path      string `json:"path"`
	ElapsedMS int64  `json:"elapsed_ms"`
	OK        bool   `json:"ok"`
	OutDir    string `json:"out_dir"`
	OutName   string `json:"out_name"`
	Text      string `json:"text"`
}

// runSaveBody is POST /api/run/save:
//
//	{"run_id": "...", "name": "11_readout.json", "overwrite": false}
//
// name is a file name inside the run's out/ directory (default: the
// derived name); an existing file is replaced only with overwrite.
type runSaveBody struct {
	RunID     string `json:"run_id"`
	Name      string `json:"name"`
	Overwrite bool   `json:"overwrite"`
}

type runSaveResponse struct {
	Path        string `json:"path"`
	Bytes       int    `json:"bytes"`
	Overwritten bool   `json:"overwritten"`
}

// maxStoredRuns bounds the finished runs kept for Save (newest kept).
const maxStoredRuns = 8

type storedRun struct {
	id, path string
	text     []byte
}

// runState holds the in-flight runs (for supersession) and the last
// few finished envelopes (for Save).
type runState struct {
	mu       sync.Mutex
	inflight map[string]*inflightRun
	done     []storedRun
}

type inflightRun struct{ cancel context.CancelFunc }

// start registers a run under key, cancelling any in-flight run with the
// same key, and returns its context and a release func.
func (rs *runState) start(parent context.Context, key string) (context.Context, func()) {
	ctx, cancel := context.WithCancel(parent)
	me := &inflightRun{cancel: cancel}
	rs.mu.Lock()
	if rs.inflight == nil {
		rs.inflight = map[string]*inflightRun{}
	}
	if prev := rs.inflight[key]; prev != nil {
		prev.cancel()
	}
	rs.inflight[key] = me
	rs.mu.Unlock()
	return ctx, func() {
		rs.mu.Lock()
		if rs.inflight[key] == me {
			delete(rs.inflight, key)
		}
		rs.mu.Unlock()
		cancel()
	}
}

func (rs *runState) store(r storedRun) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	rs.done = append(rs.done, r)
	if len(rs.done) > maxStoredRuns {
		rs.done = rs.done[len(rs.done)-maxStoredRuns:]
	}
}

func (rs *runState) get(id string) (storedRun, bool) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	for _, r := range rs.done {
		if r.id == id {
			return r, true
		}
	}
	return storedRun{}, false
}

func newRunID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("run-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// handleRun is POST /api/run.
func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, workspace.MaxRequestBytes+1))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return
	}
	var peek runBody
	if err := json.Unmarshal(raw, &peek); err == nil && peek.Path == "" {
		WriteError(w, http.StatusBadRequest, "missing_path", "body.path is required", nil)
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	body, kind, doc, ok := s.readValidateBody(w, r)
	if !ok {
		return
	}
	rel, ok := normalizeRel(body.Path)
	if !ok {
		WriteError(w, http.StatusForbidden, "path_outside", "path escapes the workspace", map[string]any{"path": body.Path})
		return
	}
	if _, err := s.root.Resolve(rel); err != nil {
		WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": body.Path})
		return
	}
	edoc, issues := s.engineDoc(rel, doc, kind)
	if len(issues) > 0 {
		WriteError(w, http.StatusNotFound, "cohort_not_found", issues[0].Message, map[string]any{"path": issues[0].Path})
		return
	}
	s.resolvePopulationCohorts(rel, edoc)
	data, err := json.Marshal(edoc)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "run_failed", err.Error(), nil)
		return
	}
	var key string
	if peek.Client != "" {
		key = peek.Client + "\x00" + rel
	} else {
		key = "\x00" + rel
	}
	ctx, release := s.runs.start(r.Context(), key)
	defer release()
	began := time.Now()
	env, err := runEnvelope(ctx, s.engineFor(rel), kind, data)
	if err != nil {
		var de *decodeError
		switch {
		case errors.As(err, &de):
			WriteError(w, http.StatusUnprocessableEntity, "invalid_request", de.err.Error(), map[string]any{"path": validate.DecodePath(doc, "", de.err)})
		case ctx.Err() != nil:
			WriteError(w, 499, "cancelled", "run was cancelled", nil)
		default:
			var details map[string]any
			if p, ok := validate.LocateJoinRight(doc, edoc, err.Error()); ok {
				details = map[string]any{"path": p}
			}
			WriteError(w, http.StatusInternalServerError, "run_failed", err.Error(), details)
		}
		return
	}
	text, err := envelopeBytes(env)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "run_failed", err.Error(), nil)
		return
	}
	id := newRunID()
	s.runs.store(storedRun{id: id, path: rel, text: text})
	outDir, outName := outPathFor(rel)
	WriteJSON(w, http.StatusOK, runResponse{
		RunID:     id,
		Root:      string(kind),
		Path:      rel,
		ElapsedMS: time.Since(began).Milliseconds(),
		OK:        len(env.Errors) == 0,
		OutDir:    outDir,
		OutName:   outName,
		Text:      string(text),
	})
}

// resolvePopulationCohorts rewrites, in place, every overlay population
// reference (overlays[i].ref.population.cohort, at any depth: request,
// compose slot, chain stage, facet) to the root-relative file the engine
// opens, resolved like a request cohort with data_dir "." (the root, the
// request's directory, then its parent: the CLI run from the case
// directory finds "design.pulse" beside req/). A reference that resolves
// nowhere is left as written, so the engine's own error names it.
// doc is engineDoc's top-level copy; everything below it is rebuilt, so
// the caller's document is never changed.
func (s *Server) resolvePopulationCohorts(requestPath string, doc map[string]any) {
	resolve := s.cohortResolver(requestPath)
	var walk func(v any) any
	walk = func(v any) any {
		switch x := v.(type) {
		case map[string]any:
			out := make(map[string]any, len(x))
			for k, c := range x {
				out[k] = walk(c)
			}
			ref, _ := out["ref"].(map[string]any)
			if pop, ok := ref["population"].(map[string]any); ok {
				if name, ok := pop["cohort"].(string); ok && name != "" {
					if got, err := resolve(map[string]any{"filename": name, "data_dir": "."}); err == nil {
						if m, ok := got.(map[string]any); ok {
							pop["cohort"] = m["filename"]
						}
					}
				}
			}
			return out
		case []any:
			out := make([]any, len(x))
			for i, c := range x {
				out[i] = walk(c)
			}
			return out
		}
		return v
	}
	for k, v := range doc {
		doc[k] = walk(v)
	}
}

type decodeError struct{ err error }

func (e *decodeError) Error() string { return e.err.Error() }

// runEnvelope runs the engine-ready document data with the root's call
// and wraps the result as the CLI does with --json (internal/cli/api.go
// in Pulse): a success is descriptor.NewEnvelope(resp); an engine error is
// an envelope whose errors[0] carries the error's own code, or the CLI's
// per-verb placeholder (PROCESS_ERROR, COMPOSE_ERROR, PROCESS_CHAIN_ERROR,
// FACET_ERROR) when it has none. Plain requests also carry the CLI's
// categorical-aggregation warnings. A cancelled context is returned as an
// error, never as an envelope.
func runEnvelope(ctx context.Context, eng *pulse.Pulse, kind workspace.Kind, data []byte) (*descriptor.Envelope, error) {
	decode := func(v any) error {
		if err := json.Unmarshal(data, v); err != nil {
			return &decodeError{err: err}
		}
		return nil
	}
	var (
		resp     any
		err      error
		fallback string
		req      *pulse.Request
	)
	switch kind {
	case workspace.KindCompose:
		var cr pulse.ComposedRequest
		if err := decode(&cr); err != nil {
			return nil, err
		}
		fallback = "COMPOSE_ERROR"
		resp, err = eng.Compose(ctx, &cr)
	case workspace.KindChain:
		var cr pulse.ChainRequest
		if err := decode(&cr); err != nil {
			return nil, err
		}
		fallback = "PROCESS_CHAIN_ERROR"
		resp, err = eng.ProcessChain(ctx, &cr)
	case workspace.KindFacet:
		var fr pulse.FacetRequest
		if err := decode(&fr); err != nil {
			return nil, err
		}
		fallback = "FACET_ERROR"
		resp, err = eng.FacetSchema(ctx, &fr)
	default:
		req = &pulse.Request{}
		if err := decode(req); err != nil {
			return nil, err
		}
		fallback = "PROCESS_ERROR"
		resp, err = eng.Process(ctx, req)
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		env := descriptor.NewEnvelope(nil)
		var ce *pulseerrors.CodedError
		if errors.As(err, &ce) {
			env.AddError(string(ce.Code), ce.Message, ce.Details)
		} else {
			env.AddError(fallback, err.Error(), nil)
		}
		return env, nil
	}
	env := descriptor.NewEnvelope(resp)
	if req != nil && req.Cohort != nil {
		cohortPath := req.Cohort.Filename
		if req.Cohort.DataDir != "" {
			cohortPath = req.Cohort.DataDir + "/" + req.Cohort.Filename
		}
		if cohort, openErr := eng.Open(ctx, cohortPath); openErr == nil {
			for _, e := range categoricalAggregationIssues(req, cohort) {
				env.AddWarning(e.Code, e.Message, e.Details)
			}
		}
	}
	return env, nil
}

// numericAggregations mirrors Pulse's internal/descriptor list behind
// PULSE_AGG_NOT_MEANINGFUL_FOR_CATEGORICAL, the warning `pulse api
// process --json` adds to a successful envelope (the helper is internal
// to Pulse, so the studio keeps this copy).
var numericAggregations = map[types.AggregationType]bool{
	types.AGG_SUM:          true,
	types.AGG_DISTINCT_SUM: true,
	types.AGG_AVERAGE:      true,
	types.AGG_MIN:          true,
	types.AGG_MAX:          true,
	types.AGG_STDDEV:       true,
	types.AGG_RANGE:        true,
	types.AGG_ZSCORE:       true,
	types.AGG_MEDIAN:       true,
	types.AGG_VARIANCE:     true,
	types.AGG_SKEWNESS:     true,
	types.AGG_KURTOSIS:     true,
	types.AGG_PERCENTILE:   true,
}

func categoricalAggregationIssues(req *pulse.Request, cohort *pulse.Cohort) []*descriptor.EnvelopeEntry {
	schema := cohort.Schema()
	if schema == nil {
		return nil
	}
	var out []*descriptor.EnvelopeEntry
	for _, agg := range req.Aggregations {
		f := schema.Field(agg.Field)
		if f == nil || !f.Type.IsCategorical() || !numericAggregations[agg.Type] {
			continue
		}
		out = append(out, &descriptor.EnvelopeEntry{
			Code:    string(pulseerrors.PULSE_AGG_NOT_MEANINGFUL_FOR_CATEGORICAL),
			Message: "numeric aggregation " + string(agg.Type) + " is not meaningful for categorical field " + agg.Field,
			Details: map[string]any{"field": agg.Field, "aggregation": string(agg.Type)},
		})
	}
	return out
}

// envelopeBytes encodes env exactly as the Pulse CLI's writeJSON does
// (internal/cli/json.go): types.MarshalFinite (non-finite floats as
// null), then a json.Encoder with two-space indent and a trailing newline.
func envelopeBytes(env *descriptor.Envelope) ([]byte, error) {
	body, err := types.MarshalFinite(env)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	if err := enc.Encode(json.RawMessage(body)); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// outPathFor is where a run of the request at rel saves by default,
// following the casebook run scripts (showcase/*/run_all.sh, run.sh):
// requests live in <case>/req/ and envelopes in <case>/out/, named after
// the request with its .json (and .compose / .facet / .chain) suffix
// dropped — req/11_readout.compose.json → out/11_readout.json. A request
// outside a req/ directory saves to an out/ beside it. A library
// workspace's analyses save to its root out/, keeping their folder:
// analyses/q1/x.json → out/q1/x.json.
func outPathFor(rel string) (dir, name string) {
	reqDir := path.Dir(rel)
	base := path.Base(rel)
	switch {
	case strings.HasPrefix(rel, library.AnalysesDir+"/"):
		dir = "out"
		if sub := path.Dir(strings.TrimPrefix(rel, library.AnalysesDir+"/")); sub != "." {
			dir += "/" + sub
		}
	case reqDir == ".":
		dir = "out"
	case path.Base(reqDir) == "req":
		if parent := path.Dir(reqDir); parent != "." {
			dir = parent + "/out"
		} else {
			dir = "out"
		}
	default:
		dir = reqDir + "/out"
	}
	stem := base
	if strings.HasSuffix(strings.ToLower(stem), ".json") {
		stem = stem[:len(stem)-len(".json")]
	}
	for _, suf := range []string{".compose", ".facet", ".chain"} {
		if strings.HasSuffix(strings.ToLower(stem), suf) {
			stem = stem[:len(stem)-len(suf)]
			break
		}
	}
	return dir, stem + ".json"
}

// validOutName reports why name cannot be an out/ file name ("" = ok).
func validOutName(name string) string {
	switch {
	case name == "" || name == "." || name == "..":
		return "a file name is required"
	case strings.ContainsAny(name, `/\`) || strings.ContainsRune(name, 0):
		return "the name must be a file name inside out/, without directories"
	case strings.HasPrefix(name, "."):
		return "the name must not start with a dot"
	case !strings.HasSuffix(strings.ToLower(name), ".json"):
		return "the name must end in .json"
	case strings.HasSuffix(strings.ToLower(name), ".layout.json"):
		return ".layout.json names are reserved for layout sidecars"
	}
	return ""
}

// handleRunSave is POST /api/run/save: write a finished run's envelope
// bytes into the out/ directory of its request (created if missing),
// atomically, and never over an existing file unless overwrite is set
// (409 exists otherwise).
func (s *Server) handleRunSave(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "read_body_failed", err.Error(), nil)
		return
	}
	var body runSaveBody
	if err := json.Unmarshal(raw, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return
	}
	if body.RunID == "" {
		WriteError(w, http.StatusBadRequest, "missing_run", "run_id is required", nil)
		return
	}
	run, ok := s.runs.get(body.RunID)
	if !ok {
		WriteError(w, http.StatusNotFound, "run_not_found", "that run is no longer held in memory; run again", map[string]any{"run_id": body.RunID})
		return
	}
	outDir, name := outPathFor(run.path)
	if body.Name != "" {
		name = body.Name
	}
	if why := validOutName(name); why != "" {
		WriteError(w, http.StatusBadRequest, "invalid_name", why, map[string]any{"name": name})
		return
	}
	dirAbs, err := s.root.Resolve(outDir)
	if err != nil {
		WriteError(w, http.StatusForbidden, "path_outside", err.Error(), map[string]any{"path": outDir})
		return
	}
	if err := os.MkdirAll(dirAbs, 0o755); err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": outDir})
		return
	}
	rel, abs, ok := s.scopedPath(w, outDir+"/"+name)
	if !ok {
		return
	}
	if filepath.Dir(abs) != dirAbs {
		WriteError(w, http.StatusForbidden, "path_outside", "the file must be inside out/", map[string]any{"path": rel})
		return
	}
	existed := false
	if info, err := os.Lstat(abs); err == nil {
		if !info.Mode().IsRegular() {
			WriteError(w, http.StatusConflict, "exists", "something other than a file is at that path", map[string]any{"path": rel})
			return
		}
		existed = true
	} else if !errors.Is(err, fs.ErrNotExist) {
		writeFSError(w, rel, err)
		return
	}
	if existed && !body.Overwrite {
		WriteError(w, http.StatusConflict, "exists", "a file already exists at that path", map[string]any{"path": rel})
		return
	}
	if existed {
		err = writeAtomic(abs, run.text, 0o644)
	} else {
		err = createAtomic(abs, run.text, 0o644)
		if errors.Is(err, fs.ErrExist) {
			WriteError(w, http.StatusConflict, "exists", "a file already exists at that path", map[string]any{"path": rel})
			return
		}
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "write_failed", err.Error(), map[string]any{"path": rel})
		return
	}
	s.commitPaths(r.Context(), "studio: save run output "+rel, rel)
	WriteJSON(w, http.StatusOK, runSaveResponse{Path: rel, Bytes: len(run.text), Overwritten: existed})
}
