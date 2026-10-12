// Package server hosts the Studio HTTP API and the embedded UI.
package server

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"path/filepath"
	"time"

	"github.com/frankbardon/pulse"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
)

// Config holds the runtime options from the command line.
type Config struct {
	PreviewTimeout  time.Duration
	AutoPreviewRows int64
}

// Server wires the scoped directory, the single Pulse engine and the UI.
type Server struct {
	root   *scope.Root
	engine *pulse.Pulse
	cfg    Config
	ui     fs.FS
	uiOK   bool
	mux    *http.ServeMux
}

// New returns a Server. ui is the UI asset tree; uiBuilt says whether it
// contains a real build (otherwise a hint page is served).
func New(root *scope.Root, engine *pulse.Pulse, cfg Config, ui fs.FS, uiBuilt bool) *Server {
	s := &Server{root: root, engine: engine, cfg: cfg, ui: ui, uiOK: uiBuilt, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, http.StatusNotFound, "not_found", "no such API endpoint", map[string]any{"path": r.URL.Path})
	})
	s.mux.Handle("/", s.uiHandler())
	return s
}

// Root returns the scoped directory.
func (s *Server) Root() *scope.Root { return s.root }

// Engine returns the shared Pulse engine instance.
func (s *Server) Engine() *pulse.Pulse { return s.engine }

// Config returns the runtime options.
func (s *Server) Config() Config { return s.cfg }

// Handle registers an extra route (used by later API packages).
func (s *Server) Handle(pattern string, h http.Handler) { s.mux.Handle(pattern, h) }

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{
		"status":             "ok",
		"dir":                filepath.Base(s.root.Dir()),
		"preview_timeout_ms": s.cfg.PreviewTimeout.Milliseconds(),
		"auto_preview_rows":  s.cfg.AutoPreviewRows,
	})
}

const notBuiltPage = `<!doctype html><meta charset="utf-8"><title>Pulse Studio</title>
<p>The Studio UI is not built into this binary. Run <code>make studio</code> from the casebook root.</p>`

func (s *Server) uiHandler() http.Handler {
	if !s.uiOK {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(notBuiltPage))
		})
	}
	files := http.FileServerFS(s.ui)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Single-page app: unknown non-asset paths fall back to index.html.
		p := r.URL.Path
		if p != "/" {
			if _, err := fs.Stat(s.ui, p[1:]); err != nil {
				r2 := r.Clone(r.Context())
				r2.URL.Path = "/"
				files.ServeHTTP(w, r2)
				return
			}
		}
		files.ServeHTTP(w, r)
	})
}

// ErrorBody is the JSON error envelope: {"error":{"code","message","details"}}.
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail is the inner error object.
type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// WriteJSON writes v as JSON with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes the standard error envelope.
func WriteError(w http.ResponseWriter, status int, code, message string, details any) {
	WriteJSON(w, status, ErrorBody{Error: ErrorDetail{Code: code, Message: message, Details: details}})
}
