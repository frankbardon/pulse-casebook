# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js
imp f
imp k
imp b
imp p
for q in chain swap inc exc rng dr tru trut fal fals nul set_any set_all set_none set_equals expr par cal prev berlin utc rowtz; do api process "$q"; done
for q in bad badday; do api predict "$q" predict; api process "$q"; done
"$PULSE" cohort inspect -i f.pulse --json > f.inspect.json
api predict unk predict; api process unk
