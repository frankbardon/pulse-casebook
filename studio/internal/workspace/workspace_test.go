package workspace

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// showcaseDir is the casebook's showcase tree relative to this package.
const showcaseDir = "../../../showcase"

// TestClassifyShowcase pins the classification of every request file in
// the casebook corpus. A new file under showcase/*/req must be added here.
func TestClassifyShowcase(t *testing.T) {
	want := []struct {
		path string
		kind Kind
	}{
		{"ab-test-readout/req/01_predict_battery.json", KindRequest},
		{"ab-test-readout/req/02_srm_gof.facet.json", KindFacet},
		{"ab-test-readout/req/03_srm_by_week_and_balance.json", KindRequest},
		{"ab-test-readout/req/04_metric_battery.json", KindRequest},
		{"ab-test-readout/req/05_revenue_shape.compose.json", KindCompose},
		{"ab-test-readout/req/06_revenue_tests.json", KindRequest},
		{"ab-test-readout/req/07_regression_adjustment.json", KindRequest},
		{"ab-test-readout/req/08_cuped_welch.json", KindRequest},
		{"ab-test-readout/req/09_segments.compose.json", KindCompose},
		{"ab-test-readout/req/10_heterogeneity.json", KindRequest},
		{"ab-test-readout/req/11_readout.compose.json", KindCompose},
		{"brand-tracker/req/01_sample_vs_census.json", KindCompose},
		{"brand-tracker/req/02_funnel_by_wave.json", KindRequest},
		{"brand-tracker/req/03_unaided_phantom_gain.json", KindCompose},
		{"brand-tracker/req/04_nps_reversal.json", KindCompose},
		{"brand-tracker/req/05_kpi_tracker.json", KindCompose},
		{"brand-tracker/req/06_q4_banner.json", KindCompose},
		{"brand-tracker/req/07_image_banner_holm.json", KindCompose},
		{"brand-tracker/req/08_image_banner_bh.json", KindCompose},
		{"brand-tracker/req/09_image_by_wave.json", KindRequest},
		{"brand-tracker/req/10_eco_driver.json", KindCompose},
		{"brand-tracker/req/12_roundtrip_check.json", KindRequest},
		{"credit-risk-model/req/01_profile.json", KindRequest},
		{"credit-risk-model/req/02a_emp_length_missing.json", KindRequest},
		{"credit-risk-model/req/02b_emp_length_present.json", KindRequest},
		{"credit-risk-model/req/03_rate_by_band.json", KindRequest},
		{"credit-risk-model/req/04_rate_by_purpose.json", KindRequest},
		{"credit-risk-model/req/05_leak_check.json", KindRequest},
		{"credit-risk-model/req/06_features_split.json", KindRequest},
		{"credit-risk-model/req/06b_dti_buckets.json", KindRequest},
		{"credit-risk-model/req/07_target_encode_predict.json", KindRequest},
		{"credit-risk-model/req/08_leaky_vs_clean_fit.json", KindRequest},
		{"credit-risk-model/req/08b_in_sample_fitted_ks.json", KindRequest},
		{"credit-risk-model/req/09_stepwise_bic.json", KindRequest},
		{"credit-risk-model/req/10_purpose_rates_train_only.json", KindRequest},
		{"credit-risk-model/req/10b_train_default_rate.json", KindRequest},
		{"credit-risk-model/req/11_stepwise_bic_with_safe_te.json", KindRequest},
		{"credit-risk-model/req/12_final_model_bootstrap.json", KindRequest},
		{"credit-risk-model/req/13_holdout_deciles.json", KindRequest},
		{"credit-risk-model/req/13b_holdout_deciles_leaky.json", KindRequest},
		{"credit-risk-model/req/14_holdout_ks_and_calibration.json", KindRequest},
		{"multi-timezone-ops/req/01_weekday_volume_utc.json", KindRequest},
		{"multi-timezone-ops/req/02_weekday_volume_local.json", KindCompose},
		{"multi-timezone-ops/req/03_syd_incident_week_utc_vs_local.json", KindCompose},
		{"multi-timezone-ops/req/04_syd_incident_periods.json", KindCompose},
		{"multi-timezone-ops/req/05_daily_anomaly_screen.json", KindCompose},
		{"multi-timezone-ops/req/06_syd_daily_windows.json", KindRequest},
		{"multi-timezone-ops/req/07_syd_screen_utc_vs_local.json", KindCompose},
		{"multi-timezone-ops/req/08_weekly_on_time_trend.json", KindCompose},
		{"multi-timezone-ops/req/09_daily_trend_raw_vs_smoothed.json", KindCompose},
		{"multi-timezone-ops/req/10_peak_hours_utc.json", KindRequest},
		{"multi-timezone-ops/req/11_peak_hours_local.json", KindCompose},
		{"multi-timezone-ops/req/12_nyc_dst_hour_shift.json", KindCompose},
		{"multi-timezone-ops/req/13_syd_dst_night.json", KindCompose},
		{"multi-timezone-ops/req/14_nyc_dst_night.json", KindCompose},
		{"privacy-safe-sharing/req/01_source_overview.json", KindRequest},
		{"privacy-safe-sharing/req/02_twin_equals_scored_rows.json", KindCompose},
		{"privacy-safe-sharing/req/03_business_rule_violations.json", KindCompose},
		{"privacy-safe-sharing/req/04_headline_metrics.json", KindCompose},
		{"privacy-safe-sharing/req/04b_headline_twin_vs_source.json", KindCompose},
		{"privacy-safe-sharing/req/05_segments_twin_vs_source.json", KindCompose},
		{"privacy-safe-sharing/req/06_churn_crosstab_twin_vs_source.json", KindCompose},
		{"privacy-safe-sharing/req/07_chisq_tests.json", KindCompose},
		{"privacy-safe-sharing/req/08_churn_logistic_model.json", KindCompose},
		{"privacy-safe-sharing/req/08b_churn_logistic_conditional_only_twin.json", KindCompose},
		{"privacy-safe-sharing/req/09_correlation_matrix.json", KindCompose},
		{"privacy-safe-sharing/req/10_exact_record_match.json", KindCompose},
		{"privacy-safe-sharing/req/11_profile_match_vs_chance.json", KindCompose},
		{"retail-at-scale/req/01_year_kpis.json", KindRequest},
		{"retail-at-scale/req/02_monthly_trend.json", KindRequest},
		{"retail-at-scale/req/03_customer_scan.json", KindRequest},
		{"retail-at-scale/req/04_dashboard_compose.json", KindCompose},
		{"retail-at-scale/req/05_retention_chain.json", KindChain},
		{"retail-at-scale/req/06_spend_distribution_chain.json", KindChain},
		{"retail-at-scale/req/07_lookup_customer.json", KindUnopenable},
	}
	seen := map[string]bool{}
	for _, tc := range want {
		seen[tc.path] = true
		t.Run(tc.path, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(showcaseDir, tc.path))
			if err != nil {
				t.Fatal(err)
			}
			if got, reason := Classify(tc.path, data); got != tc.kind {
				t.Fatalf("Classify = %s (%s), want %s", got, reason, tc.kind)
			}
		})
	}
	files, err := filepath.Glob(filepath.Join(showcaseDir, "*", "req", "*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no showcase request files found")
	}
	for _, f := range files {
		rel, _ := filepath.Rel(showcaseDir, f)
		if !seen[filepath.ToSlash(rel)] {
			t.Errorf("showcase file %s is not in the classification table", rel)
		}
	}
}

// TestShowcaseNonRequests checks that the JSON lying around the showcase
// outside req/ (synth specs, schemas, run envelopes) is never offered as a
// request.
func TestShowcaseNonRequests(t *testing.T) {
	err := filepath.WalkDir(showcaseDir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(p) != ".json" || filepath.Base(filepath.Dir(p)) == "req" {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if got, _ := Classify(p, data); got != KindUnopenable {
			t.Errorf("%s classified as %s, want unopenable", p, got)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestClassify(t *testing.T) {
	tests := []struct {
		name string
		data string
		want Kind
	}{
		{"a.json", `{"cohort":{"filename":"x.pulse"},"aggregations":[]}`, KindRequest},
		{"a.json", `{}`, KindRequest},
		{"a.json", `{"requests":[]}`, KindCompose},
		{"a.compose.json", `{"requests":[],"multiplicity":{}}`, KindCompose},
		{"a.json", `{"cohort":{},"stages":[]}`, KindChain},
		{"a.facet.json", `{"fields":["x"]}`, KindFacet},
		{"a.synth.json", `{"row_count":10,"fields":[{"name":"x"}]}`, KindUnopenable},
		{"a.json", `{"requests":[],"data":{}}`, KindUnopenable},
		{"a.json", `{"cohort":{},"field":"id","value":"1"}`, KindUnopenable},
		{"a.json", `{"format_version":"1.1","data":{}}`, KindUnopenable},
		{"a.json", `[1,2]`, KindUnopenable},
		{"a.json", `null`, KindUnopenable},
		{"a.json", `not json`, KindUnopenable},
		{"a.layout.json", `{"nodes":[]}`, KindUnopenable},
		{"a.out.json", `{"aggregations":[]}`, KindUnopenable},
		{"a.predict.json", `{"aggregations":[]}`, KindUnopenable},
		{"a.pulse", "\x01binary", KindCohort},
		{"README.md", "# hi", KindUnopenable},
	}
	for _, tc := range tests {
		t.Run(tc.name+" "+tc.data, func(t *testing.T) {
			if got, _ := Classify(tc.name, []byte(tc.data)); got != tc.want {
				t.Fatalf("Classify(%q) = %s, want %s", tc.name, got, tc.want)
			}
		})
	}
}

func TestList(t *testing.T) {
	dir := t.TempDir()
	write := func(rel, data string) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(data), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("req/01.json", `{"cohort":{}}`)
	write("req/01.layout.json", `{}`)
	write("req/02.compose.json", `{"requests":[]}`)
	write("data.pulse", "x")
	write("notes.md", "skip me")
	write(".hidden/x.json", `{}`)
	write("node_modules/y.json", `{}`)

	got, err := List(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := []File{
		{Path: "data.pulse", Kind: KindCohort},
		{Path: "req/01.json", Kind: KindRequest},
		{Path: "req/01.layout.json", Kind: KindUnopenable, Reason: "sidecar or output file (.layout.json)"},
		{Path: "req/02.compose.json", Kind: KindCompose},
	}
	if !reflect.DeepEqual(got.Files, want) || got.Truncated {
		t.Fatalf("List = %+v, want %+v", got, want)
	}
}

func TestLayoutPath(t *testing.T) {
	cases := []struct {
		in, want string
		ok       bool
	}{
		{"req/01.json", "req/01.layout.json", true},
		{"req/11_readout.compose.json", "req/11_readout.compose.layout.json", true},
		{"req/01.layout.json", "", false},
		{"out/01.out.json", "", false},
		{"a.pulse", "", false},
	}
	for _, c := range cases {
		got, ok := LayoutPath(c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("LayoutPath(%q) = %q, %v; want %q, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestImportLayout(t *testing.T) {
	dir := t.TempDir()
	write := func(rel, content string) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("sources/sales.csv", "a\n1\n")
	write("sources/raw.bin.gz", "x")
	write("sources/.upload-1.tmp", "partial")
	write("schemas/sales.schema.json", `[{"name":"a","type":"u8"}]`)
	write("schemas/notes.json", `{"x":1}`)
	write("imports/sales.import.json", `{"version":1,"target":"cohorts/sales.pulse","source":{"path":"sources/sales.csv"}}`)
	write("imports/gone.import.json", `{"version":1,"target":"gone.pulse","source":{"path":"sources/sales.csv"}}`)
	write("imports/bad.import.json", `{"version":1,"target":"../../etc.pulse"}`)
	write("cohorts/sales.pulse", "PULSE")
	write("other.pulse", "PULSE")
	write("data/x.csv", "a\n")             // non-JSON outside sources/: not listed
	write("exports/sales.pulse.zst", "zz") // exports are no longer stored: plain data
	write("workspaces/w/a.json", `{}`)

	listing, err := List(dir)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]File{}
	for _, f := range listing.Files {
		got[f.Path] = f
	}
	want := map[string]File{
		"sources/sales.csv":         {Path: "sources/sales.csv", Kind: KindSource, Format: "csv", Size: 4},
		"sources/raw.bin.gz":        {Path: "sources/raw.bin.gz", Kind: KindSource, Size: 1},
		"schemas/sales.schema.json": {Path: "schemas/sales.schema.json", Kind: KindSchema},
		"imports/sales.import.json": {Path: "imports/sales.import.json", Kind: KindImport, Target: "cohorts/sales.pulse", State: StateOK},
		"imports/gone.import.json":  {Path: "imports/gone.import.json", Kind: KindImport, Target: "gone.pulse", State: StateNeedsRebuild},
		"cohorts/sales.pulse":       {Path: "cohorts/sales.pulse", Kind: KindCohort, Spec: "imports/sales.import.json"},
		"other.pulse":               {Path: "other.pulse", Kind: KindCohort},
		"workspaces/w/a.json":       {Path: "workspaces/w/a.json", Kind: KindRequest},
	}
	for p, w := range want {
		if got[p] != w {
			t.Errorf("%s = %+v, want %+v", p, got[p], w)
		}
	}
	if b := got["imports/bad.import.json"]; b.State != StateInvalid || b.Reason == "" {
		t.Errorf("bad spec = %+v", b)
	}
	if n := got["schemas/notes.json"]; n.Kind != KindUnopenable {
		t.Errorf("schemas/notes.json = %+v", n)
	}
	for _, p := range []string{"sources/.upload-1.tmp", "data/x.csv", "exports/sales.pulse.zst"} {
		if _, ok := got[p]; ok {
			t.Errorf("%s listed", p)
		}
	}
	// A library's global area skips workspaces/.
	skipped, err := ListWith(dir, ListOptions{Skip: []string{"workspaces"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range skipped.Files {
		if strings.HasPrefix(f.Path, "workspaces/") {
			t.Errorf("ListWith Skip listed %s", f.Path)
		}
	}
	if len(skipped.Files) != len(listing.Files)-1 {
		t.Errorf("ListWith Skip: %d files, want %d", len(skipped.Files), len(listing.Files)-1)
	}
	// Classify (GET /api/file) agrees by path.
	if k, _ := Classify("schemas/sales.schema.json", []byte(`[]`)); k != KindSchema {
		t.Errorf("Classify schema = %s", k)
	}
	if k, _ := Classify("req/sales.schema.json", []byte(`[]`)); k != KindUnopenable {
		t.Errorf("schema outside schemas/ = %s", k)
	}
}
