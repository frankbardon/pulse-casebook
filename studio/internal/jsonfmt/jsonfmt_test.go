package jsonfmt

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// TestShowcaseGolden is the round-trip invariant: every showcase request
// file re-formats byte-identically in the style it is detected as.
func TestShowcaseGolden(t *testing.T) {
	files, err := filepath.Glob("../../../showcase/*/req/*.json")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) < 75 {
		t.Fatalf("found %d showcase request files, want at least 75", len(files))
	}
	counts := map[Style]int{}
	for _, f := range files {
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		style := Detect(src)
		counts[style]++
		got, err := Reformat(src, style)
		if err != nil {
			t.Errorf("%s: %v", f, err)
			continue
		}
		if !bytes.Equal(got, src) {
			t.Errorf("%s (%s style) does not round-trip:\n%s", f, style, firstDiff(src, got))
		}
	}
	if counts[House] == 0 || counts[Expanded] == 0 {
		t.Errorf("expected both styles in the corpus, got %v", counts)
	}
}

func firstDiff(want, got []byte) string {
	wl := strings.Split(string(want), "\n")
	gl := strings.Split(string(got), "\n")
	for i := 0; i < len(wl) || i < len(gl); i++ {
		var w, g string
		if i < len(wl) {
			w = wl[i]
		}
		if i < len(gl) {
			g = gl[i]
		}
		if w != g {
			return "line " + strconv.Itoa(i+1) + "\n  want: " + w + "\n  got:  " + g
		}
	}
	return "(no line difference)"
}

func TestPreservesOrderUnknownKeysAndLiterals(t *testing.T) {
	src := `{"z": 1, "a": {"zz": 1.50, "aa": 1e-7, "dup": 1, "dup": 2}, "x_unknown": "caf\u00e9 \"q\" é", "n": null, "t": [true, false, -0.0]}`
	want := `{
  "z": 1,
  "a": {"zz": 1.50, "aa": 1e-7, "dup": 1, "dup": 2},
  "x_unknown": "caf\u00e9 \"q\" é",
  "n": null,
  "t": [true, false, -0.0]
}
`
	got, err := Reformat([]byte(src), House)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestHouseRules(t *testing.T) {
	long := strings.Repeat("x", 120)
	tests := []struct {
		name, src, want string
	}{
		{"empty containers", `{"a":{},"b":[]}`, "{\n  \"a\": {},\n  \"b\": []\n}\n"},
		{"empty root", `{}`, "{}\n"},
		{"scalar root", ` 7 `, "7\n"},
		{"root array expanded", `[1,2]`, "[\n  1,\n  2\n]\n"},
		{"scalar array always inline", `{"a":["` + long + `","y"]}`, "{\n  \"a\": [\"" + long + "\", \"y\"]\n}\n"},
		{"one-object array inline", `{"a":[{"k":1}]}`, "{\n  \"a\": [{\"k\": 1}]\n}\n"},
		{"two-object array one per line", `{"a":[{"k":1},{"k":2}]}`, "{\n  \"a\": [\n    {\"k\": 1},\n    {\"k\": 2}\n  ]\n}\n"},
		{"long object expands", `{"a":{"k":"` + long + `"}}`, "{\n  \"a\": {\n    \"k\": \"" + long + "\"\n  }\n}\n"},
		{"long one-object array expands", `{"a":[{"k":"` + long[:110] + `"}]}`, "{\n  \"a\": [\n    {\"k\": \"" + long[:110] + "\"}\n  ]\n}\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Reformat([]byte(tt.src), House)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tt.want {
				t.Errorf("got:\n%s\nwant:\n%s", got, tt.want)
			}
		})
	}
}

func TestLineWidthBoundary(t *testing.T) {
	// `  "a": {"k": "…"}` is 2+5+9+len(s) columns; LineWidth fits exactly.
	s := strings.Repeat("v", LineWidth-16)
	got, _ := Reformat([]byte(`{"a":{"k":"`+s+`"}}`), House)
	if want := "{\n  \"a\": {\"k\": \"" + s + "\"}\n}\n"; string(got) != want {
		t.Errorf("at width: got\n%s", got)
	}
	s += "v"
	got, _ = Reformat([]byte(`{"a":{"k":"`+s+`"}}`), House)
	if strings.Contains(string(got), `{"k"`) {
		t.Errorf("over width stayed inline:\n%s", got)
	}
}

func TestExpandedMatchesMarshalIndent(t *testing.T) {
	src := []byte(`{"a":[{"b":1,"c":[]},{}],"d":"e","f":[1,2]}`)
	var v any
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatal(err)
	}
	// Keys here are already sorted, so MarshalIndent's order matches.
	want, _ := json.MarshalIndent(v, "", "  ")
	got, err := Reformat(src, Expanded)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want)+"\n" {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
	if Detect(got) != Expanded {
		t.Error("expanded output not detected as expanded")
	}
	house, _ := Reformat(src, House)
	if Detect(house) != House {
		t.Error("house output detected as expanded")
	}
}

func TestParseErrors(t *testing.T) {
	bad := []string{
		``, `{`, `{"a"}`, `{"a":1,}`, `[1,]`, `[1 2]`, `{"a":1}x`, `01`, `1.`, `1e`, `-`,
		`"abc`, `"\x"`, `"\u12"`, "\"a\tb\"", `tru`, `{a:1}`, "\"\xff\"",
		strings.Repeat("[", maxDepth+2) + strings.Repeat("]", maxDepth+2),
	}
	for _, s := range bad {
		_, err := Parse([]byte(s))
		var se *SyntaxError
		if !errors.As(err, &se) {
			t.Errorf("Parse(%q) = %v, want SyntaxError", s, err)
		}
	}
}

func TestParseAgreesWithStdlib(t *testing.T) {
	good := []string{`0`, `-1.5E+3`, `"\/\b\f\n\r\t\u00FF"`, `[[],{}]`, ` {"a" : [ 1 , 2 ] } `}
	for _, s := range good {
		if !json.Valid([]byte(s)) {
			t.Fatalf("test input %q is not valid JSON", s)
		}
		if _, err := Parse([]byte(s)); err != nil {
			t.Errorf("Parse(%q): %v", s, err)
		}
	}
}
