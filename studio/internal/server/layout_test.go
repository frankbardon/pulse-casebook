package server

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLayoutSidecar(t *testing.T) {
	s := newTestServer(t, false)
	dir := s.Root().Dir()
	if err := os.MkdirAll(filepath.Join(dir, "req"), 0o755); err != nil {
		t.Fatal(err)
	}
	req := []byte("{\n  \"cohort\": \"a.pulse\"\n}\n")
	if err := os.WriteFile(filepath.Join(dir, "req/01.json"), req, 0o644); err != nil {
		t.Fatal(err)
	}

	// No sidecar yet: layout is null, not an error.
	status, body := get(t, s, "/api/layout?path=req/01.json")
	if status != 200 || body["layout"] != nil || body["path"] != "req/01.layout.json" {
		t.Fatalf("missing sidecar: %d %v", status, body)
	}

	// Save writes house style beside the request and leaves it alone.
	status, body = put(t, s, "/api/layout?path=req/01.json", []byte(`{"version":1,"nodes":{"filterers[0]":{"x":10,"y":-4.5}}}`))
	if status != 200 {
		t.Fatalf("save: %d %v", status, body)
	}
	got, err := os.ReadFile(filepath.Join(dir, "req/01.layout.json"))
	if err != nil {
		t.Fatal(err)
	}
	want := "{\n  \"version\": 1,\n  \"nodes\": {\"filterers[0]\": {\"x\": 10, \"y\": -4.5}}\n}\n"
	if string(got) != want {
		t.Errorf("sidecar bytes:\n%s\nwant:\n%s", got, want)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "req/01.json")); string(b) != string(req) {
		t.Errorf("request changed: %s", b)
	}

	status, body = get(t, s, "/api/layout?path=req/01.json")
	nodes, _ := body["layout"].(map[string]any)["nodes"].(map[string]any)
	if status != 200 || nodes["filterers[0]"] == nil {
		t.Fatalf("reload: %d %v", status, body)
	}

	// Compose files keep their infix.
	status, body = get(t, s, "/api/layout?path=req/02.compose.json")
	if status != 200 || body["path"] != "req/02.compose.layout.json" {
		t.Fatalf("compose sidecar path: %d %v", status, body)
	}

	// A broken sidecar degrades to null with a reason.
	if err := os.WriteFile(filepath.Join(dir, "req/01.layout.json"), []byte("[1,"), 0o644); err != nil {
		t.Fatal(err)
	}
	status, body = get(t, s, "/api/layout?path=req/01.json")
	if status != 200 || body["layout"] != nil || body["invalid"] == nil {
		t.Fatalf("broken sidecar: %d %v", status, body)
	}
}

func TestLayoutErrors(t *testing.T) {
	s := newTestServer(t, false)
	cases := []struct {
		method, path, body string
		status             int
		code               string
	}{
		{"GET", "/api/layout", "", 400, "missing_path"},
		{"GET", "/api/layout?path=a.pulse", "", 400, "not_request"},
		{"GET", "/api/layout?path=a.layout.json", "", 400, "not_request"},
		{"GET", "/api/layout?path=../a.json", "", 403, "path_outside"},
		{"PUT", "/api/layout?path=a.json", "[]", 400, "invalid_layout"},
		{"PUT", "/api/layout?path=a.json", "{", 400, "invalid_json"},
		{"PUT", "/api/layout?path=nope/a.json", "{}", 404, "not_found"},
	}
	for _, c := range cases {
		var status int
		var body map[string]any
		if c.method == "GET" {
			status, body = get(t, s, c.path)
		} else {
			status, body = put(t, s, c.path, []byte(c.body))
		}
		e, _ := body["error"].(map[string]any)
		if status != c.status || e == nil || e["code"] != c.code {
			t.Errorf("%s %s: %d %v, want %d %s", c.method, c.path, status, body, c.status, c.code)
		}
	}
}
