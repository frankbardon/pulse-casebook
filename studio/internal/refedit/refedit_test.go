package refedit

import (
	"testing"
)

type mapTo map[string]string

func (m mapTo) Map(_ string, cands []string) (string, string, *Issue) {
	for _, c := range cands {
		if to, ok := m[c]; ok {
			return c, to, nil
		}
	}
	return "", "", &Issue{Code: "ref_missing", Message: "not mapped"}
}

func TestRewriteAnalysis(t *testing.T) {
	src := "{\"cohort\":{\"filename\":\"a.pulse#s1.pulse\" , \"data_dir\":\"d\"},\r\n \"x\": 1.0e2,\n \"stages\": [{\"request\": {\"joins\": [{\"right\": \"d/a.pulse\"}]}}],\n \"overlays\": [{\"ref\": {\"population\": {\"cohort\": \"b.pulse\"}}}],\n \"requests\": [{\"cohort\": {\"filename\": \"a.pulse\"}}]}"
	m := mapTo{"d/a.pulse": "_global/c/a.pulse", "b.pulse": "c/b2.pulse"}
	out, w, err := Rewrite([]byte(src), "r.json", m, Analysis)
	if err != nil {
		t.Fatal(err)
	}
	want := "{\"cohort\":{\"filename\":\"a.pulse#s1.pulse\" , \"data_dir\":\"_global/c\"},\r\n \"x\": 1.0e2,\n \"stages\": [{\"request\": {\"joins\": [{\"right\": \"_global/c/a.pulse\"}]}}],\n \"overlays\": [{\"ref\": {\"population\": {\"cohort\": \"c/b2.pulse\"}}}],\n \"requests\": [{\"cohort\": {\"filename\": \"a.pulse\"}}]}"
	if string(out) != want {
		t.Fatalf("got\n%q\nwant\n%q", out, want)
	}
	if w.Refs != 4 || len(w.Changes) != 3 || len(w.Issues) != 1 || w.Issues[0].Pointer != "/requests/0/cohort" || w.Issues[0].Ref != "a.pulse" {
		t.Fatalf("walk: refs %d changes %+v issues %+v", w.Refs, w.Changes, w.Issues)
	}
	// Nothing to change: nil.
	if out, _, err := Rewrite([]byte(`{"cohort": {"filename": "z.pulse"}}`), "r.json", m, Analysis); err != nil || out != nil {
		t.Fatalf("unchanged: %q %v", out, err)
	}
	// A missing data_dir is inserted; a renamed file changes filename too.
	out, _, _ = Rewrite([]byte(`{"cohort": {"filename": "b.pulse"}}`), "r.json", m, Analysis)
	if string(out) != `{"cohort": {"filename": "b2.pulse", "data_dir": "c"}}` {
		t.Fatalf("insert: %s", out)
	}
}

func TestCandidates(t *testing.T) {
	got := Candidates("analyses/q/x.json", "../cohorts", "a.pulse")
	if len(got) != 2 || got[0] != "analyses/cohorts/a.pulse" || got[1] != "cohorts/a.pulse" {
		t.Fatalf("%v", got)
	}
}
