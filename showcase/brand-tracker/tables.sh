#!/usr/bin/env bash
# Rewrites every generated table in README.md and REPRODUCE.md from the Pulse output in ./out.
# Run after run.sh. Each table sits between a pair of markers:
#   <!-- BEGIN generated:NAME (tables.sh) --> ... <!-- END generated:NAME -->
# Nothing in a marked block is typed by hand: the figures, the significance letters and the
# pair counts are all read from out/*.json. Usage: ./tables.sh [--check | --print NAME]
# --check fails (exit 1) when a document is out of date instead of rewriting it;
# --print NAME writes one table to stdout.
set -euo pipefail
cd "$(dirname "$0")"
check=0; [[ "${1:-}" == "--check" ]] && check=1

# Shared jq helpers: number formatting and the label tables.
LIB='
def fixed(d): (. * pow(10; d) | round) as $i | ($i | fabs) as $a | (pow(10; d)) as $s
  | (if $i < 0 then "−" else "" end) + (($a / $s) | floor | tostring)
  + (if d > 0 then "." + (($a % $s) | tostring | ([range(d - length)] | map("0") | join("")) + .) else "" end);
def comma: tostring | if length > 3 then (.[:length-3] | comma) + "," + .[length-3:] else . end;
def int: round | comma;
def pct: (. * 100) | fixed(1) + "%";
def pts: (. * 100) as $v | (if $v > 0 then "+" else "" end) + ($v | fixed(1)) + " pts";
def signed(d): (if . > 0 then "+" else "" end) + fixed(d);
def pval: if . == null then "–" elif . < 0.001 then "< 0.001" else fixed(3) end;
def peq: if . < 0.001 then "p < 0.001" else "p = " + fixed(3) end;
def wave: $waves[.] // .;
def region: $regions[.] // .;
def col: $regions[.] // .;
'
LABELS=(--argjson waves "$(jq '.rows' labels/wave_names.json)"
        --argjson regions "$(jq '.rows' labels/region_names.json)"
        --argjson ages "$(jq '.rows' labels/age_names.json)")
q() { jq -r "${LABELS[@]}" "$LIB $1" "${@:2}"; }

gen_rake() {  # Step 0: the rake efficiency report, per wave and overall
  q '
  "| Wave | Respondents | Sweeps | Min weight | Max weight | Kish n_eff | Design effect | Efficiency |",
  "|---|---|---|---|---|---|---|---|",
  (.data.groups | sort_by(.value)[] |
    "| \(.value | wave) | \(.efficiency.n | int) | \(.iterations) | \(.efficiency.weight_min | fixed(2)) | \(.efficiency.weight_max | fixed(2)) | \(.efficiency.n_eff | int) | \(.efficiency.deff_kish | fixed(2)) | \(.efficiency.efficiency_pct | round)% |"),
  (.data.efficiency | "| All waves | \(.n | int) | – | \(.weight_min | fixed(2)) | \(.weight_max | fixed(2)) | \(.n_eff | int) | \(.deff_kish | fixed(2)) | \(.efficiency_pct | round)% |")
  ' out/00_rake.json
}

gen_rake_fit() {  # Step 0: sample share before raking vs the share each wave reaches
  q '
  def share_range: (map(pct) | unique) as $u | if ($u | length) == 1 then $u[0] else "\(min | pct) – \(max | pct)" end;
  "| Margin | Category | Census target | Sample share, all waves | Sample share, by wave | Weighted share, every wave |",
  "|---|---|---|---|---|---|",
  (.data.margins[] as $m | ($m.categories | sort_by(.values[0]))[] as $c |
    ([.data.groups[].margins[] | select(.fields == $m.fields) | .categories[] | select(.values == $c.values)]) as $g |
    "| \($m.fields[0]) | \($c.values[0] | col) | \($c.target | pct) | \($c.observed | pct) | \($g | map(.observed) | share_range) | \($g | map(.achieved) | share_range) |")
  ' out/00_rake.json
}

gen_age() {  # Step 1: age share by wave, unweighted -> weighted
  q '
  .data.responses as $r |
  ($r[0].crosstab.matrix) as $u | ($r[4].crosstab.matrix) as $w |
  ($r[1].crosstab.matrix) as $ut | ($r[5].crosstab.matrix) as $wt |
  "| Age | " + ([$u.column_keys[][0] | wave] | join(" | ")) + " | All waves |",
  "|---|" + ([$u.column_keys[] | "---|"] | join("")) + "---|",
  ($u.row_keys | to_entries[] | .key as $i |
    "| \(.value[0]) | " + ([range($u.column_keys | length) as $j | "\($u.cells[$i][$j].value | pct) → \($w.cells[$i][$j].value | pct)"] | join(" | "))
    + " | \($ut.cells[$i][0].value | pct) → \($wt.cells[$i][0].value | pct) |")
  ' out/01_sample_vs_census.json
}

gen_mix() {  # Step 1: gender and region, all waves
  q '
  .data.responses as $r |
  "| Margin | Category | Unweighted | Weighted |",
  "|---|---|---|---|",
  ([[2, 6, "gender"], [3, 7, "region"]][] as [$a, $b, $name] |
    $r[$a].crosstab.matrix as $u | $r[$b].crosstab.matrix as $w |
    $u.row_keys | to_entries[] |
    "| \($name) | \(.value[0] | col) | \($u.cells[.key][0].value | pct) | \($w.cells[.key][0].value | pct) |")
  ' out/01_sample_vs_census.json
}

gen_funnel() {  # Step 2
  q '
  "| Wave | Respondents | Aided awareness | Unaided awareness | Consideration (aware base) |",
  "|---|---|---|---|---|",
  (.data.data[] |
    "| \(.wave) | \(.respondents | int) | \(.aided_unweighted | pct) / \(.aided_weighted | pct) | \(.unaided_unweighted | pct) / \(.unaided_weighted | pct) | \(.consider_unweighted | pct) / \(.consider_weighted | pct) |")
  ' out/02_funnel_by_wave.json
}

gen_pairs() {  # Step 3
  q '
  .data.responses as $r |
  ($r[0].overlays[0].payload.matrix) as $u | ($r[1].overlays[0].payload.matrix) as $w |
  ($r[0].crosstab.matrix) as $uc | ($r[1].crosstab.matrix) as $wc |
  ([$uc.row_keys[][0]]) as $keys |
  "| Wave pair | Unweighted p | Weighted p |",
  "|---|---|---|",
  ($u.row_keys | to_entries[] | .key as $i | .value as [$a, $b] |
    ($keys | index($a)) as $ia | ($keys | index($b)) as $ib |
    "| \($a | wave) vs \($b | wave) | \($u.cells[$i][0].value | pval) (\($uc.cells[$ia][0].value | pct) → \($uc.cells[$ib][0].value | pct)) | \($w.cells[$i][0].value | pval) (\($wc.cells[$ia][0].value | pct) → \($wc.cells[$ib][0].value | pct)) |")
  ' out/03_unaided_phantom_gain.json
}

gen_nps() {  # Step 4
  q '
  .data.responses as $r |
  def row(name): "| \(name) | \(.respondents | int) | \(.nps_unweighted | signed(1)) (\(.nps_ci_low_unweighted | signed(1)) to \(.nps_ci_high_unweighted | signed(1))) | \(.nps_weighted | signed(1)) (\(.nps_ci_low_weighted | signed(1)) to \(.nps_ci_high_weighted | signed(1))) |";
  "| Base | Respondents | NPS unweighted (95% CI) | NPS weighted (95% CI) |",
  "|---|---|---|---|",
  ($r[0].data[0] | row("**All aware**")),
  ($r[1].data[] | row(.age_band))
  ' out/04_nps_reversal.json
}

gen_tracker() {  # Step 5: one Process, vs-prior tests, Holm across the request
  q '
  .data as $d |
  def ov(n): $d.overlays[] | select(.name == n) | .payload.series.entries;
  def fmt(k; is_nps): if is_nps then (. | signed(1)) else pct end;
  [["Aided awareness", "aided", false], ["Unaided awareness", "unaided", false], ["Consideration", "consider", false],
   ["Intent top-2-box", "intent_t2b", false], ["NPS", "nps", true]] as $kpis |
  ($d.data | map(.wave)) as $waves_k |
  "| KPI | " + ([$waves_k[] | wave] | join(" | ")) + " | " + ([range(1; $waves_k | length) as $i | "\($waves_k[$i-1] | wave | sub("2025 "; ""))→\($waves_k[$i] | wave | sub("2025 "; ""))"] | join(" | ")) + " |",
  "|---|" + ([$waves_k[] | "---|"] | join("")) + ([range(1; $waves_k | length) | "---|"] | join("")),
  ($kpis[] as [$name, $k, $isnps] |
    (ov($k + "_change")) as $chg | (ov($k + "_test")) as $tst |
    "| \($name) | " + ([$d.data[] | .[$k] | fmt($k; $isnps)] | join(" | ")) + " | "
    + ([range(1; $waves_k | length) as $i |
        ($chg[$i].summary.statistic) as $delta | ($tst[$i].summary) as $s |
        (if $isnps then ($delta | signed(1)) else ($delta | pts) end) + " · " + ($s.p_value | pval) + " · " + ($s.p_adjusted | pval)
        | if $s.significant_adjusted then "**" + . + "**" else . end] | join(" | ")) + " |"),
  "",
  "Each change cell is the change, the raw p and the Holm p; **bold** survives Holm. \([$d.overlays[] | select(.multiplicity) | .multiplicity.m] | first) tests in the family (\($kpis | length) KPIs × \(($waves_k | length) - 1) wave steps)."
  ' out/05_kpi_tracker.json
}

# Banner helpers: map every stitched cell to its slot overlay so a raw letter (raw p < alpha
# in the direction Pulse reports) can be told apart from a corrected one (the letters part).
BANNER_LIB='
.data.responses as $resp |
def blockof($s; $j): $s.blocks[] | select(.start <= $j and $j < .start + .count);
def slot($label): $resp[] | select(.label == $label);
def rawletters($s; $L; $r; $j): ($L.cells[$r][$j].value) as $cell |
  if $cell == null then [] else
    blockof($s; $j) as $b | slot($b.slot) as $sl | ($sl.overlays[0].payload.matrix) as $pm |
    ([$sl.crosstab.matrix.column_keys[][0]]) as $cols | ($cols[$j - $b.start]) as $me |
    ($s.row_keys[$r]) as $rk | ([$pm.row_keys[] | . == $rk] | index(true)) as $pr |
    [$cell.higher[] as $other |
      (([range($b.start; $b.start + $b.count)] | map(select($L.cells[$r][.].value.letter == $other)) | first) - $b.start) as $oj |
      ($cols[$oj]) as $them |
      ($pm.column_keys | map(. == [$me, $them] or . == [$them, $me]) | index(true)) as $pc |
      select($pm.cells[$pr][$pc].value < 0.05) | $other]
  end;
def lettered($s; $L; $r; $j): ($L.cells[$r][$j].value) as $cell |
  if $cell == null then "" else
    ($cell.above) as $adj | rawletters($s; $L; $r; $j) as $raw |
    ($adj | sort | join("")) as $kept |
    ([$raw[] | select(. as $x | $adj | index($x) | not)] | sort | map("~~\(.)~~")) as $struck |
    ([$kept] + $struck) | map(select(. != "")) | join(" ") | if . == "" then "" else " " + . end
  end;
def header($s; $L):
  "| | " + ([range($s.column_keys | length) as $j |
      ($L.cells[0][$j].value.letter) as $l | ($s.column_keys[$j][0] | col) as $c |
      if $l then "\($l) \($c)" else $c end] | join(" | ")) + " |";
'

gen_kpi_banner() {  # Step 6
  q "$BANNER_LIB"'
  .data.responses as $resp | .data.banner.sections as $secs |
  {aided: "Aided awareness", unaided: "Unaided awareness", consider: "Consideration", intent_t2b: "Intent top-2-box", nps: "NPS"} as $names |
  ($secs[0]) as $s0 |
  header($s0; $s0.letters[0]), "|---|" + ([$s0.column_keys[] | "---|"] | join("")),
  ($secs[] as $s | $s.letters[0] as $L |
    ([range($s.column_keys | length) as $j | blockof($s; $j) as $b | slot($b.slot).components.crosstab.cell_components[0][$j - $b.start].n | int]) as $base |
    "| *Base: \(if $s.label == "aware" then "aided-aware" else "all adults" end) (unweighted n)* | " + ($base | map("*\(.)*") | join(" | ")) + " |",
    ($s.row_keys | to_entries[] | .key as $r | (.value[-1]) as $m |
      "| \($names[$m] // $m) | " + ([range($s.column_keys | length) as $j | $s.cells[$r][$j].value as $v |
        (if $m == "nps" then ($v | signed(1)) else ($v | pct) end) + lettered($s; $L; $r; $j)] | join(" | ")) + " |")),
  "",
  ([$secs[] | .letters[0] as $L | . as $s | range($s.row_keys | length) as $r | range($s.column_keys | length) as $j |
     {raw: (rawletters($s; $L; $r; $j) | length), adj: ($L.cells[$r][$j].value.above // [] | length)}]) as $n |
  ([$resp[] | .overlays[0].multiplicity.m // empty] | first) as $m |
  "Raw p < 0.05: \($n | map(.raw) | add) significant pairs. After Holm across all \($m) tests: \($n | map(.adj) | add)."
  ' out/06_q4_banner.json
}

gen_image_banner() {  # Step 7: Holm letters, raw-only letters struck, BH letters where they differ
  jq -r "${LABELS[@]}" --slurpfile bh out/08_image_banner_bh.json "$LIB $BANNER_LIB"'
  .data.responses as $resp | .data.banner.sections[0] as $s | $s.letters[0] as $L |
  ($bh[0].data.banner.sections[0].letters[0]) as $LB |
  header($s; $L), "|---|" + ([$s.column_keys[] | "---|"] | join("")),
  ([range($s.column_keys | length) as $j | blockof($s; $j) as $b | slot($b.slot).components.crosstab.column_margin_components[$j - $b.start].n | int]) as $base |
  "| *Base: aided-aware (unweighted n)* | " + ($base | map("*\(.)*") | join(" | ")) + " |",
  ($s.row_keys | to_entries[] | .key as $r |
    "| \(.value[0]) | " + ([range($s.column_keys | length) as $j |
      ($L.cells[$r][$j].value.above // []) as $h | ($LB.cells[$r][$j].value.above // []) as $b |
      ($s.cells[$r][$j].value | pct) + lettered($s; $L; $r; $j)
      + (if $h != $b then " (BH: \(if $b == [] then "–" else $b | join("") end))" else "" end)] | join(" | ")) + " |"),
  "",
  ([range($s.row_keys | length) as $r | range($s.column_keys | length) as $j |
     {raw: (rawletters($s; $L; $r; $j) | length), holm: ($L.cells[$r][$j].value.above // [] | length), bh: ($LB.cells[$r][$j].value.above // [] | length)}]) as $n |
  ([$resp[] | .overlays[0].multiplicity.m // empty] | first) as $m |
  "Raw p < 0.05: \($n | map(.raw) | add) significant pairs. Of the \($m) tests, Holm keeps \($n | map(.holm) | add) and Benjamini–Hochberg keeps \($n | map(.bh) | add)."
  ' out/07_image_banner_holm.json
}

gen_image_wave() {  # Step 8
  q '
  .data.crosstab.matrix as $m |
  "| Attribute (% of aware, weighted) | " + ([$m.column_keys[][0]] | join(" | ")) + " |",
  "|---|" + ([$m.column_keys[] | "---|"] | join("")),
  ($m.row_keys | to_entries[] | .key as $i | "| \(.value[0]) | " + ([$m.cells[$i][] | .value | pct] | join(" | ")) + " |"),
  "| *Weighted base* | " + ([$m.column_margins[] | .value | int] | join(" | ")) + " |"
  ' out/09_image_by_wave.json
}

gen_eco() {  # Step 9
  q '
  .data.responses as $r |
  ($r[0].overlays[0].payload) as $p | ($r[0].crosstab.matrix) as $c |
  "| Wave | Eco-friendly association | Consideration: ticked Eco-friendly | Consideration: did not tick it |",
  "|---|---|---|---|",
  ([range($r[1].data | length)] | .[] as $i |
    "| \($r[1].data[$i].wave | wave) | \($c.cells[$i][0].value | pct) | \($r[1].data[$i].consider | pct) (n = \($r[1].data[$i].respondents | int)) | \($r[2].data[$i].consider | pct) (n = \($r[2].data[$i].respondents | int)) |"),
  "",
  "Wave-pair tests on the association (Holm within the layer): " +
  ([$p.matrix.row_keys | to_entries[] | .key as $i | .value as [$a, $b] |
    "\($a | wave | sub("2025 "; "")) vs \($b | wave | sub("2025 "; "")) \($p.matrix.cells[$i][0].value | peq) (Holm \($p.p_adjusted.cells[$i][0].value | pval))"] | join("; ")) + "."
  ' out/10_eco_driver.json
}

gen_key_figures() {  # REPRODUCE.md: every expected.tsv row with the value this run produced
  echo "| Output | Figure | Value |"
  echo "|---|---|---|"
  local file expr want meaning got
  while IFS=$'\t' read -r file expr want meaning; do
    [[ -z "$file" || "$file" == \#* ]] && continue
    got=$(jq -r "($expr) * 1000 | round / 1000" "$file")
    echo "| \`$file\` | $meaning | $got |"
  done < expected.tsv
}

# splice FILE NAME: replace the block between the NAME markers with gen_NAME's output.
splice() {
  local file=$1 name=$2 frag; frag=$(mktemp)
  "gen_$name" > "$frag"
  grep -q "<!-- BEGIN generated:$name " "$file" || { echo "missing marker generated:$name in $file" >&2; rm -f "$frag"; exit 1; }
  awk -v name="$name" -v frag="$frag" '
    index($0, "<!-- BEGIN generated:" name " ") { print; while ((getline line < frag) > 0) print line; skip = 1; next }
    index($0, "<!-- END generated:" name " ")   { skip = 0 }
    !skip { print }' "$file" > "$file.tmp"
  mv "$file.tmp" "$file"; rm -f "$frag"
}

if [[ "${1:-}" == "--print" ]]; then "gen_$2"; exit 0; fi

stale=0
for doc in README.md REPRODUCE.md; do
  cp "$doc" "$doc.orig"
  for name in $(grep -o '<!-- BEGIN generated:[a-z_]* ' "$doc" | sed 's/.*generated://; s/ $//'); do
    splice "$doc" "$name"
  done
  if ! cmp -s "$doc" "$doc.orig"; then
    stale=1
    if (( check )); then mv "$doc.orig" "$doc"; echo "out of date: $doc (run ./tables.sh)" >&2; continue; fi
    echo "rewrote $doc"
  fi
  rm -f "$doc.orig"
done
(( check )) && exit $stale
exit 0
