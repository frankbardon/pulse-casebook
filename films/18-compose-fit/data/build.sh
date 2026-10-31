# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js; imp m; imp h
node requests.js
# saved files are outputs too: start clean, so no run warns PULSE_MODEL_OVERWRITTEN
rm -rf models pops
for r in fit unknown bind norank mmm popsave; do api compose $r; done
api predict-compose fit predict; api predict-compose bind predict
node requests.js load
api process load; api process popload
# the Bayesian media-mix fit: about 6 s each on 4 chains; rng_seed 18 makes them reproducible
api process bayes; api process bayes99
