# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js
imp c
imp s
imp r
for q in feat spine pass1 agg win tr sm; do api process "$q"; done
