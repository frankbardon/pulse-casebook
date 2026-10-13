// Package importer holds the Studio's import logic that does not need
// HTTP: the editable schema document (the `pulse import schema-template`
// format), upload name rules, the source sample with per-column stats,
// the versioned import spec, and schema fingerprints with ranked
// matching (G3).
//
// Only public Pulse packages are used. The schema document decoder the
// CLI uses (internal/io.ParseSchemaJSON) is internal, so ParseSchema
// rebuilds the same thing from public parts: encoding.ParseFieldType
// resolves type names, and the layout (ByteOffset / BitPosition) is left
// zero because ImportJob re-lays out every explicit schema before use
// (internal/io resolveExplicitSchema calls LayoutFields).
package importer

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/frankbardon/pulse/encoding"
)

// SchemaField is one entry of a schema document: the JSON array
// `pulse import schema-template` writes and `pulse import --schema`
// reads (pulse internal/io.SchemaFileField). precision and scale apply
// to decimal128 only. Fields match source columns by exact name.
type SchemaField struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Nullable    bool   `json:"nullable"`
	Precision   uint8  `json:"precision,omitempty"`
	Scale       uint8  `json:"scale,omitempty"`
}

// SchemaError is a schema document refusal, located to a field when it
// is about one. Reason is a stable token: malformed, empty, missing_name,
// duplicate, unknown_type, missing_precision.
type SchemaError struct {
	Reason  string
	Field   string
	Index   int
	Type    string
	Message string
}

func (e *SchemaError) Error() string { return e.Message }

// Details is the error envelope's details object.
func (e *SchemaError) Details() map[string]any {
	d := map[string]any{"reason": e.Reason}
	if e.Index >= 0 {
		d["index"] = e.Index
	}
	if e.Field != "" {
		d["field"] = e.Field
	}
	if e.Reason == "unknown_type" {
		d["type"] = e.Type
		d["valid"] = FieldTypeNames()
	}
	return d
}

// FieldTypeNames lists every Pulse field type name in type-byte order
// (the registry walk pulse's RegisteredFieldTypeNames does).
func FieldTypeNames() []string {
	var names []string
	for ft := encoding.FieldType(0); ft.IsKnown(); ft++ {
		names = append(names, ft.String())
	}
	return names
}

// ParseSchema decodes and validates a schema document. It returns the
// decoded entries and the encoding.Schema an ImportJob takes.
func ParseSchema(raw []byte) ([]SchemaField, *encoding.Schema, error) {
	var defs []SchemaField
	if err := json.Unmarshal(raw, &defs); err != nil {
		return nil, nil, &SchemaError{Reason: "malformed", Index: -1,
			Message: "schema is not a JSON array of {name, type, nullable, description} objects: " + err.Error()}
	}
	s, err := BuildSchema(defs)
	if err != nil {
		return nil, nil, err
	}
	return defs, s, nil
}

// BuildSchema validates decoded entries and builds the encoding.Schema.
func BuildSchema(defs []SchemaField) (*encoding.Schema, error) {
	if len(defs) == 0 {
		return nil, &SchemaError{Reason: "empty", Index: -1, Message: "schema lists no fields"}
	}
	seen := make(map[string]bool, len(defs))
	fields := make([]encoding.Field, len(defs))
	for i, d := range defs {
		if strings.TrimSpace(d.Name) == "" {
			return nil, &SchemaError{Reason: "missing_name", Index: i, Message: fmt.Sprintf("schema field %d has no name", i)}
		}
		if seen[d.Name] {
			return nil, &SchemaError{Reason: "duplicate", Index: i, Field: d.Name, Message: fmt.Sprintf("schema declares field %q more than once", d.Name)}
		}
		seen[d.Name] = true
		ft, ok := encoding.ParseFieldType(d.Type)
		if !ok {
			return nil, &SchemaError{Reason: "unknown_type", Index: i, Field: d.Name, Type: d.Type,
				Message: fmt.Sprintf("schema field %q declares unknown type %q", d.Name, d.Type)}
		}
		f := encoding.Field{Name: d.Name, Type: ft, Nullable: d.Nullable, CsvColumnIdx: i, Description: d.Description}
		if ft.IsDecimal() {
			if d.Precision == 0 {
				return nil, &SchemaError{Reason: "missing_precision", Index: i, Field: d.Name,
					Message: fmt.Sprintf("decimal128 field %q needs a precision", d.Name)}
			}
			f.Precision, f.Scale = d.Precision, d.Scale
		}
		fields[i] = f
	}
	return &encoding.Schema{Fields: fields}, nil
}

// Template renders a schema as a schema document, as `pulse import
// schema-template` does (descriptions carried over when present).
func Template(s *encoding.Schema) []SchemaField {
	if s == nil {
		return nil
	}
	out := make([]SchemaField, len(s.Fields))
	for i := range s.Fields {
		f := &s.Fields[i]
		out[i] = SchemaField{Name: f.Name, Type: f.Type.String(), Nullable: f.Nullable, Description: f.Description}
		if f.Type.IsDecimal() {
			out[i].Precision, out[i].Scale = f.Precision, f.Scale
		}
	}
	return out
}
