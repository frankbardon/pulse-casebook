package server

import (
	"encoding/json"
	"net/http"
	"sync"
)

// catalogCache holds the encoded /api/catalog body for one feature set.
// The manifest and schema are deterministic per engine instance, so the
// body is built once and reused until the feature_set_digest changes.
type catalogCache struct {
	mu     sync.Mutex
	digest string
	body   []byte
}

// proseKeys are dropped from the manifest to make the slim form the
// palette needs (structure only, no descriptions).
var proseKeys = map[string]bool{"description": true, "streamable_hint": true, "emits_type_note": true}

func (s *Server) handleCatalog(w http.ResponseWriter, r *http.Request) {
	if s.engine == nil {
		WriteError(w, http.StatusServiceUnavailable, "engine_unavailable", "pulse engine is not running", nil)
		return
	}
	digest := s.engine.FeatureSetDigest()
	s.catalog.mu.Lock()
	defer s.catalog.mu.Unlock()
	if s.catalog.body == nil || s.catalog.digest != digest {
		body, err := s.buildCatalog(r, digest)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "catalog_failed", err.Error(), nil)
			return
		}
		s.catalog.digest, s.catalog.body = digest, body
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(s.catalog.body)
}

func (s *Server) buildCatalog(r *http.Request, digest string) ([]byte, error) {
	m := s.engine.Manifest(r.Context())
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	var generic any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, err
	}
	schema, err := s.engine.PayloadSchema()
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"pulse_version":      m.PulseVersion,
		"feature_set_digest": digest,
		"manifest":           stripProse(generic),
		"schema":             json.RawMessage(schema),
	}
	body, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}

// stripProse removes prose keys from a decoded JSON tree in place.
func stripProse(v any) any {
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if proseKeys[k] {
				if _, isString := child.(string); isString {
					delete(t, k)
					continue
				}
			}
			t[k] = stripProse(child)
		}
	case []any:
		for i := range t {
			t[i] = stripProse(t[i])
		}
	}
	return v
}
