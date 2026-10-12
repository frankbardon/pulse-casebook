package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/frankbardon/pulse-casebook/studio/internal/scope"
)

func newTestServer(t *testing.T, built bool) *Server {
	t.Helper()
	root, err := scope.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ui := fstest.MapFS{
		"index.html":    {Data: []byte("<!doctype html><title>Pulse Studio</title>")},
		"assets/app.js": {Data: []byte("console.log(1)")},
	}
	return New(root, nil, Config{PreviewTimeout: 10 * time.Second, AutoPreviewRows: 1_000_000}, ui, built)
}

func TestRoutes(t *testing.T) {
	s := newTestServer(t, true)
	tests := []struct {
		name     string
		path     string
		status   int
		contains string
	}{
		{"health", "/api/health", 200, `"status":"ok"`},
		{"unknown api", "/api/nope", 404, `"code":"not_found"`},
		{"index", "/", 200, "Pulse Studio"},
		{"asset", "/assets/app.js", 200, "console.log"},
		{"spa fallback", "/some/route", 200, "Pulse Studio"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d", rec.Code, tc.status)
			}
			if !strings.Contains(rec.Body.String(), tc.contains) {
				t.Fatalf("body %q does not contain %q", rec.Body.String(), tc.contains)
			}
		})
	}
}

func TestHealthBody(t *testing.T) {
	s := newTestServer(t, true)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["preview_timeout_ms"] != float64(10000) || body["auto_preview_rows"] != float64(1_000_000) {
		t.Fatalf("unexpected health body: %v", body)
	}
}

func TestUINotBuilt(t *testing.T) {
	s := newTestServer(t, false)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if !strings.Contains(rec.Body.String(), "make studio") {
		t.Fatalf("expected build hint, got %q", rec.Body.String())
	}
}
