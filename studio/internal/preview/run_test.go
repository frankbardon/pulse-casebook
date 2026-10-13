package preview

import (
	"encoding/json"
	"testing"
)

func TestSetEntries(t *testing.T) {
	raw := func(ss ...string) []json.RawMessage {
		out := make([]json.RawMessage, len(ss))
		for i, s := range ss {
			out[i] = json.RawMessage(s)
		}
		return out
	}
	grouped := raw(`{"label":"a","group_key":["x"]}`, `{"label":"a","group_key":["y"]}`,
		`{"label":"b","group_key":["x"]}`, `{"label":"b","group_key":["y"]}`)
	cases := []struct {
		name    string
		list    []json.RawMessage
		index   int
		count   int
		result  string
		results []string
	}{
		{"ungrouped", raw(`{"label":"a"}`, `{"label":"b"}`), 1, 2, `{"label":"b"}`, nil},
		{"grouped first", grouped, 0, 2, "", []string{`{"label":"a","group_key":["x"]}`, `{"label":"a","group_key":["y"]}`}},
		{"grouped second", grouped, 1, 2, "", []string{`{"label":"b","group_key":["x"]}`, `{"label":"b","group_key":["y"]}`}},
		{"one group", raw(`{"label":"a","group_key":["x"]}`), 0, 1, "", []string{`{"label":"a","group_key":["x"]}`}},
		{"uneven falls back", raw(`{"label":"a","group_key":["x"]}`, `{"label":"a","group_key":["y"]}`, `{"label":"b","group_key":["x"]}`), 1, 2, `{"label":"a","group_key":["y"]}`, nil},
		{"empty", nil, 0, 2, "", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &Probe{}
			p.setEntries(c.list, &NodePlan{Index: c.index, Count: c.count})
			if string(p.Result) != c.result {
				t.Fatalf("result = %s, want %s", p.Result, c.result)
			}
			if len(p.Results) != len(c.results) || (c.results != nil && p.ResultsTotal != len(c.results)) {
				t.Fatalf("results = %s (total %d), want %v", p.Results, p.ResultsTotal, c.results)
			}
			for i := range c.results {
				if string(p.Results[i]) != c.results[i] {
					t.Fatalf("results[%d] = %s, want %s", i, p.Results[i], c.results[i])
				}
			}
		})
	}
}
