# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js
imp sem
api process fit
api process ladder
api predict pair predict
api process pair
api process bad
api process ord
api process score
