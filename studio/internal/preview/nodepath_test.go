package preview

import (
	"reflect"
	"testing"
)

// Cases mirror studio/ui/src/graph/nodePath.test.ts so the Go and
// TypeScript grammars cannot drift apart.
var pathCases = []struct {
	segs []Segment
	id   string
}{
	{nil, ""},
	{[]Segment{Key("cohort")}, "cohort"},
	{[]Segment{Key("tests"), Index(2)}, "tests[2]"},
	{[]Segment{Key("requests"), Index(1), Key("filterers"), Index(0)}, "requests[1].filterers[0]"},
	{[]Segment{Key("crosstab"), Key("rows"), Index(0), Key("field")}, "crosstab.rows[0].field"},
	{[]Segment{Key("odd key")}, `["odd key"]`},
	{[]Segment{Key("a"), Key("b.c"), Index(3)}, `a["b.c"][3]`},
	{[]Segment{Key("0")}, `["0"]`},
	{[]Segment{Index(0), Key("x")}, "[0].x"},
	{[]Segment{Key(`q"uote`)}, `["q\"uote"]`},
	{[]Segment{Key("a<b&c")}, `["a<b&c"]`},
	{[]Segment{Key("line sep")}, "[\"line sep\"]"},
}

func TestFormatPath(t *testing.T) {
	for _, c := range pathCases {
		if got := FormatPath(c.segs); got != c.id {
			t.Errorf("FormatPath(%v) = %q, want %q", c.segs, got, c.id)
		}
	}
}

func TestParsePath(t *testing.T) {
	for _, c := range pathCases {
		got, err := ParsePath(c.id)
		if err != nil {
			t.Errorf("ParsePath(%q): %v", c.id, err)
			continue
		}
		if !reflect.DeepEqual(got, c.segs) {
			t.Errorf("ParsePath(%q) = %v, want %v", c.id, got, c.segs)
		}
	}
}

func TestParsePathRejects(t *testing.T) {
	for _, id := range []string{".a", "a..b", "a[01]", "a[-1]", "a[x]", "a b", "1a", `a.["x y"]`, `a["ident"]`, `a["open`, "a]", `a["x"`} {
		if segs, err := ParsePath(id); err == nil {
			t.Errorf("ParsePath(%q) = %v, want error", id, segs)
		}
	}
}
