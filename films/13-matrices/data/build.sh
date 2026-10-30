# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js
imp m
# the same cohort with the six items folded into one native vec_f64 field "items" (kind scale, 1..7)
"$PULSE" import csv -i m.csv -o mv.pulse --vector "items:s1,s2,s3,v1,v2,v3" --vector-kind "items:scale:1:7" >/dev/null
api process mr
api process mi
api process mv
api process mc
api predict mp predict
api process mp
