# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# A synth run writes a .pulse file; its --json envelope is recorded as <spec>.out.json.
P() { "$PULSE" "$@" || true; }
syn() { rm -f -- "$1.pulse"; P synth from-schema -s "$1.json" -o "$1.pulse" --seed "${2:-22}" --json > "$1.out.json"; }
rm -f -- ./*.pulse
node generate.js; node mk.js

# 1. from-schema: one spec, seed 22; its marginals read back with ordinary requests
syn shop; syn badparam
for q in q-shop q-shop-region q-shop-member; do api process "$q"; done
P export csv -i shop.pulse -o shop.csv >/dev/null; head -6 shop.csv > shop.head.csv; rm -f -- shop.csv

# 2. the Gaussian copula: one pair, a refused marginal, an incomplete list
syn cop; syn coppois; syn copgap
for q in q-cop q-r-shop-pearson q-r-shop-spearman q-r-cop-pearson q-r-cop-spearman; do api process "$q"; done

# 3. constraints and rules, and a rule that claims a field ahead of the copula
syn cons; syn consx; syn rules; syn rulesbad; syn claim
for q in q-cons q-rules q-r-claim-pearson; do api process "$q"; done

# 4. row() and lag(): a recursive adstock, read back as CSV
syn lag
P export csv -i lag.pulse -o lag.csv >/dev/null; head -9 lag.csv > lag.head.csv; rm -f -- lag.csv

# 5. profile the generator's cohort, then top it up with 500 generated rows and score them
imp members
P profile create -i members.pulse -o members.profile.json --include-stats --include-correlations --seed 22 > /dev/null
P synth from-profile -p members.profile.json --source members.pulse -o topup.pulse --rows 500 --seed 22 \
  --fidelity-report topup.fidelity.json --emit-spec topup.spec.json --json > topup.out.json
api process q-topup
# the same with --fit-shape: spend becomes a mixture, which claims spend ahead of the correlation
P profile create -i members.pulse -o shape.profile.json --include-stats --include-correlations --fit-shape --seed 22 > /dev/null
rm -f -- shape.pulse
P synth from-profile -p shape.profile.json --source members.pulse -o shape.pulse --rows 500 --seed 22 \
  --fidelity-report shape.fidelity.json --emit-spec shape.spec.json --json > shape.out.json
# the source is opened read-only: writing over it is refused
P synth from-profile -p members.profile.json --source members.pulse -o members.pulse --rows 500 --seed 22 --json > collide.out.json 2>/dev/null

# 6. determinism: the same spec and seed twice, then seed 23; the same profile capture twice
rm -f -- shop2.pulse shop23.pulse
P synth from-schema -s shop.json -o shop2.pulse --seed 22 --json > /dev/null
P synth from-schema -s shop.json -o shop23.pulse --seed 23 --json > /dev/null
P profile create -i members.pulse -o members.profile2.json --include-stats --include-correlations --seed 22 > /dev/null
shasum -a 256 shop.pulse shop2.pulse shop23.pulse members.profile.json members.profile2.json > determinism.sha256.txt
{ cmp shop.pulse shop2.pulse && echo "shop.pulse shop2.pulse: identical"; cmp shop.pulse shop23.pulse || true; wc -c shop.pulse; } > determinism.cmp.txt 2>&1
rm -f -- members.profile2.json
