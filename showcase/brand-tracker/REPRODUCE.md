# Reproducing the brand-tracker example

Everything runs through the `pulse` CLI. `jq` is used only to read figures out of the JSON responses (`run.sh` prints error counts, `verify.sh` compares figures and `tables.sh` writes the tables in `README.md`).

The example needs a Pulse build with `pulse rake`, Compose banners with significance letters, the `*_VS_PRIOR` overlays and SPSS value labels. Until those reach a tagged release, build Pulse from the `survey-tables` branch of the local checkout: `make pulse PULSE_REF=survey-tables`.

## From a fresh checkout

```sh
# 1. Build the CLI
make pulse && cp bin/pulse /tmp/pulse     # builds Pulse from the local checkout (root Makefile)

# 2. Copy the example somewhere disposable (it writes the cohorts, out/ and deliver/)
rm -rf /tmp/brand-tracker && cp -r showcase/brand-tracker /tmp/brand-tracker
cd /tmp/brand-tracker

# 3. Generate the sample, compute the weights and run every step (predict first, then execute)
PULSE=/tmp/pulse ./run.sh

# 4. Check the key figures, and that every table in README.md matches this run
./verify.sh
./tables.sh --check
```

`run.sh` does the following, in order:

| Step | Command | Output |
|---|---|---|
| 0 | `pulse synth from-schema -s spec/brand_tracker.synth.json -o brand_tracker_sample.pulse --seed 2025 --json` | `out/00_synth.json`, `brand_tracker_sample.pulse` |
| 0 | `pulse rake brand_tracker_sample.pulse -o brand_tracker.pulse --margins spec/census_targets.json --by wave --weight-field weight --json`, then `pulse cohort inspect brand_tracker.pulse --json` | `out/00_rake.json`, `out/00_inspect.json`, `brand_tracker.pulse` |
| 1–9 | For each `req/01…10_*.json`: `pulse api predict` (single request) or `pulse api predict-compose` (a file with `"requests"`, including the banners), then `pulse api process` or `pulse api compose` with `--json` | `out/<name>.predict.json`, `out/<name>.json` |
| 10 | `pulse export predict --format spss --sanitize-names` and `pulse export spss --sanitize-names`, both with `--labels wave=wave_names --labels age_band=age_names --labels gender=gender_names --labels region=region_names`; `pulse export excel --labels wave=wave_names:augment --labels region=region_names:augment`, `pulse import spss`, `pulse cohort inspect` | `out/11_*.json`, `deliver/brand_tracker_2025.sav`, `deliver/brand_tracker_2025.xlsx`, `deliver/roundtrip.pulse` (+ `.spss.json` sidecar) |
| 10 (check) | `pulse api process -r req/12_roundtrip_check.json --json` (the Step 2 request pointed at the re-imported `.sav`) | `out/12_roundtrip_check.json` |

`run.sh` exports `PULSE_LABEL_TABLES_DIR=./labels`. Steps 2, 6, 7, 8 and 10 need it, because they bind the label tables.

To run one step by hand from the example directory:

```sh
export PULSE_LABEL_TABLES_DIR=./labels
/tmp/pulse api process -r req/05_kpi_tracker.json --json
/tmp/pulse api compose -r req/06_q4_banner.json --json
```

The expected end state:

- The rake converges in every wave with no warnings.
- Every response has `"errors": []` and `"warnings": []`.
- Every predict says `"valid": true` with no errors or warnings, the round-trip predict on the re-imported `.sav` included.
- The SPSS export and its export predict report the same two expected warnings: `PULSE_SPSS_SIDECAR_ABSENT` and `PULSE_SPSS_NAME_SANITIZED`.

## Expected key figures

`verify.sh` reads each row of `expected.tsv`, evaluates the jq path against the named output and compares the result after rounding to 3 decimals. `tables.sh` writes this table from the same rows and this run's output:

<!-- BEGIN generated:key_figures (tables.sh) -->
| Output | Figure | Value |
|---|---|---|
| `out/00_synth.json` | rows synthesised | 6000 |
| `out/00_rake.json` | Q4 Kish effective sample size, from the rake report | 888.768 |
| `out/00_rake.json` | Q4 design effect from weighting | 1.666 |
| `out/00_rake.json` | Q4 largest weight | 3.376 |
| `out/01_sample_vs_census.json` | Q4 unweighted share aged 18-34 | 0.593 |
| `out/01_sample_vs_census.json` | Q4 weighted share aged 18-34 (census 0.29) | 0.29 |
| `out/01_sample_vs_census.json` | weighted share aged 55+ (all waves) | 0.38 |
| `out/01_sample_vs_census.json` | Q4 Kish effective sample size, from a request | 888.768 |
| `out/02_funnel_by_wave.json` | Q4 unaided awareness, unweighted | 0.383 |
| `out/02_funnel_by_wave.json` | Q4 unaided awareness, weighted | 0.284 |
| `out/03_unaided_phantom_gain.json` | Q1 vs Q4 unaided p, unweighted | 0.001 |
| `out/03_unaided_phantom_gain.json` | Q1 vs Q4 unaided p, weighted | 0.865 |
| `out/04_nps_reversal.json` | NPS, unweighted | 5.604 |
| `out/04_nps_reversal.json` | NPS, weighted | -3.457 |
| `out/05_kpi_tracker.json` | consideration Q3 to Q4, Holm p (m = 15) | 0.006 |
| `out/05_kpi_tracker.json` | consideration Q2 to Q3, Holm p | 0.058 |
| `out/05_kpi_tracker.json` | aided Q3 to Q4, raw p | 0.021 |
| `out/05_kpi_tracker.json` | aided Q3 to Q4, Holm p | 0.278 |
| `out/06_q4_banner.json` | Q4 top-2-box Midwest vs West, raw p | 0.047 |
| `out/06_q4_banner.json` | Q4 top-2-box Midwest vs West, Holm p (m = 50) | 1 |
| `out/06_q4_banner.json` | letters surviving Holm in the KPI banner | 8 |
| `out/07_image_banner_holm.json` | Stylish 18-34 vs 55+, raw p x 1,000,000 | 0.517 |
| `out/07_image_banner_holm.json` | Stylish: 18-34 letter C (55+) survives Holm (1 = yes) | 1 |
| `out/07_image_banner_holm.json` | Trustworthy Midwest vs South, raw p | 0.004 |
| `out/07_image_banner_holm.json` | Trustworthy Midwest vs South, Holm p (m = 72) | 0.269 |
| `out/08_image_banner_bh.json` | Trustworthy Midwest vs South, BH p | 0.037 |
| `out/09_image_by_wave.json` | Eco-friendly association, Q4 (weighted) | 0.242 |
| `out/10_eco_driver.json` | Eco-friendly Q3 vs Q4, Holm p | 0.021 |
| `out/11_export_spss.json` | cases written to the .sav | 6000 |
| `out/12_roundtrip_check.json` | Q4 (.sav wave code 4) unaided awareness, weighted, read back from the .sav | 0.284 |
| `deliver/roundtrip.pulse.spss.json` | value labels on wave, age_band, gender and region, read back from the .sav | 13 |
<!-- END generated:key_figures -->

All of the figures quoted in `README.md` come from the `out/*.json` files of this run. The tables there are written by `tables.sh`; `./tables.sh --check` fails if any of them no longer matches `out/`.

## Determinism

The synth spec has no `--fit-models` or `--fit-shape` capture, so with `--seed 2025` the sample is byte-identical between runs, and the rake is sequential, so the weights are too. On the reference run (darwin/arm64) the MD5 of `brand_tracker_sample.pulse` was `8395acb5b5cd83e75388f5bdbecaa315` and of `brand_tracker.pulse` `d3b8939aaaee660cd39d51ec434d6b31`. If a different architecture produces a different hash, `verify.sh` is the real check.
