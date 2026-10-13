package server

// PULSE-GAP(column-rename): delete this file with the rename shim.

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const zillowCSV = "Living Space (sq ft),List Price ($),City\n1200,350000,Austin\n900,,Dallas\n1500,420000,Austin\n"

var zillowRename = map[string]any{"Living Space (sq ft)": "living_space_sq_ft", "List Price ($)": "list_price"}

var zillowSchema = []map[string]any{
	{"name": "living_space_sq_ft", "type": "u16", "nullable": false, "description": ""},
	{"name": "list_price", "type": "f64", "nullable": true, "description": ""},
	{"name": "City", "type": "categorical_u8", "nullable": false, "description": ""},
}

func TestImportRename(t *testing.T) {
	s := newImportServer(t, true)
	dir := s.Root().Dir()
	writeWS(t, s, "sources/zillow.csv", zillowCSV)

	// Predict: Pulse sees the new names, overrides use them; matches are
	// ranked under the source's own names.
	code, body := postJSON(t, s, "/api/import/predict", map[string]any{
		"source": "sources/zillow.csv", "overrides": map[string]any{"list_price": "f64"},
		"options": map[string]any{"rename": zillowRename},
	})
	if code != 200 || body["valid"] != true {
		t.Fatalf("predict: %d %v", code, body)
	}
	if h := body["header"].([]any); h[0] != "living_space_sq_ft" || h[1] != "list_price" || h[2] != "City" {
		t.Fatalf("header %v", h)
	}
	if f := body["schema"].([]any)[1].(map[string]any); f["name"] != "list_price" || f["type"] != "f64" {
		t.Fatalf("schema %v", body["schema"])
	}

	// Invalid maps are refused with a coded error.
	for _, m := range []map[string]any{
		{"City": "list_price", "List Price ($)": "list_price"},
		{"City": ""},
		{"Nope": "x"},
	} {
		code, body := postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/zillow.csv", "options": map[string]any{"rename": m}})
		if code != http.StatusUnprocessableEntity || errCode(body) != "invalid_rename" {
			t.Errorf("predict %v: %d %v", m, code, body)
		}
		code, body = postJSON(t, s, "/api/import", map[string]any{"source": "sources/zillow.csv", "target": "bad", "options": map[string]any{"rename": m}})
		if code != http.StatusUnprocessableEntity || errCode(body) != "invalid_rename" {
			t.Errorf("import %v: %d %v", m, code, body)
		}
	}

	// Save: the object form {fields, rename}; a bad map is 400.
	code, body = postJSON(t, s, "/api/schemas", map[string]any{"name": "zillow", "schema": zillowSchema, "rename": map[string]any{"City": "nope"}})
	if code != 400 || errCode(body) != "invalid_rename" {
		t.Fatalf("bad save: %d %v", code, body)
	}
	code, body = postJSON(t, s, "/api/schemas", map[string]any{"name": "zillow", "schema": zillowSchema, "rename": zillowRename})
	if code != 201 || !strings.Contains(body["text"].(string), `"rename"`) || body["rename"] == nil {
		t.Fatalf("save: %d %v", code, body)
	}

	// Import with the saved schema: the cohort has the clean names and
	// the spec carries options.rename.
	code, body = postJSON(t, s, "/api/import", map[string]any{
		"source": "sources/zillow.csv", "schema": "zillow", "target": "zillow",
		"options": map[string]any{"rename": zillowRename},
	})
	if code != 201 {
		t.Fatalf("import: %d %v", code, body)
	}
	rep := body["report"].(map[string]any)
	if f := rep["schema"].([]any)[0].(map[string]any); f["name"] != "living_space_sq_ft" || rep["rows_imported"] != float64(3) {
		t.Fatalf("report %v", rep)
	}
	raw, _ := os.ReadFile(filepath.Join(dir, "imports", "zillow.import.json"))
	if !strings.Contains(string(raw), `"rename": {`) || !strings.Contains(string(raw), `"List Price ($)": "list_price"`) {
		t.Fatalf("spec %s", raw)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/cohort/inspect?path=zillow.pulse", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "living_space_sq_ft") || strings.Contains(rec.Body.String(), "Living Space") {
		t.Fatalf("inspect: %d %s", rec.Code, rec.Body.String())
	}

	// Rebuild re-applies the spec's map.
	if err := os.Remove(filepath.Join(dir, "zillow.pulse")); err != nil {
		t.Fatal(err)
	}
	code, body = postJSON(t, s, "/api/import/rebuild", map[string]any{"spec": "imports/zillow.import.json"})
	if code != 200 || body["report"].(map[string]any)["schema"].([]any)[1].(map[string]any)["name"] != "list_price" {
		t.Fatalf("rebuild: %d %v", code, body)
	}

	// The next file with the same original headers matches the saved
	// schema exactly, and the match carries its rename map.
	writeWS(t, s, "sources/zillow2.csv", zillowCSV+"700,99000,Waco\n")
	code, body = postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/zillow2.csv"})
	if code != 200 {
		t.Fatalf("predict 2: %d %v", code, body)
	}
	ms := body["matches"].([]any)
	if len(ms) == 0 {
		t.Fatal("no match")
	}
	m := ms[0].(map[string]any)
	if m["name"] != "zillow" || m["exact"] != true || m["rename"].(map[string]any)["List Price ($)"] != "list_price" {
		t.Fatalf("match %v", m)
	}
	// Still matched after the rename is applied in predict.
	_, body = postJSON(t, s, "/api/import/predict", map[string]any{"source": "sources/zillow2.csv", "options": map[string]any{"rename": zillowRename}})
	if m := body["matches"].([]any)[0].(map[string]any); m["name"] != "zillow" || m["exact"] != true {
		t.Fatalf("match after rename %v", m)
	}
	// List shows the map.
	rec = httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/schemas", nil))
	if !strings.Contains(rec.Body.String(), `"rename":{`) {
		t.Fatalf("list %s", rec.Body.String())
	}
}

// Without renames nothing about the files changes: no rename key, the
// schema stays a plain array.
func TestImportNoRenameUnchanged(t *testing.T) {
	s := newImportServer(t, false)
	dir := s.Root().Dir()
	writeWS(t, s, "sources/sales.csv", salesCSV(10))
	code, body := postJSON(t, s, "/api/schemas", map[string]any{"name": "sales", "schema": salesSchema, "rename": map[string]any{}})
	if code != 201 || !strings.HasPrefix(body["text"].(string), "[") {
		t.Fatalf("save: %d %v", code, body)
	}
	code, body = postJSON(t, s, "/api/import", map[string]any{"source": "sources/sales.csv", "schema": "sales", "target": "sales", "options": map[string]any{"rename": map[string]any{}}})
	if code != 201 {
		t.Fatalf("import: %d %v", code, body)
	}
	raw, _ := os.ReadFile(filepath.Join(dir, "imports", "sales.import.json"))
	if strings.Contains(string(raw), "rename") {
		t.Fatalf("spec %s", raw)
	}
}
