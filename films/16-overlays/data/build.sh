# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js; imp o; imp o2025
for r in A A0 B B2 C F G H I; do api process $r; done
api facet D; api compose E
for r in B G; do api predict $r predict; done
