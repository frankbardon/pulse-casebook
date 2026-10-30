# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js
imp a
imp p
imp s
imp z
imp h
api process ar
for q in count centre ci9 ci8 ci4 ci2 ci1 rowratio acc shape shapenull sets weights; do api process "$q"; done
