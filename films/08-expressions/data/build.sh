# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See README.md.
# e.csv is hand-written; its schema (decimal128 money, a date and a datetime) is explicit.
node requests.js .
"$PULSE" import csv -i e.csv -o e.pulse --schema e.schema.json >/dev/null
for q in bind bind_bad nul_eq nul_ne nul_gt nul_guard nul_tern ops sets vec maths \
         dec_eq dec_feq dec_round dec_mod dec_str dec_zero cal_utc cal_ny cal_bare \
         par par_sum par_undecl total_site lookup nonbool; do api process "$q"; done
for q in bind_bad dec_mod cal_bare par_undecl total_site lookup nonbool; do api predict "$q" predict; done
# The manifest's extensions block: what this instance registered (the stock CLI registers nothing).
"$PULSE" manifest --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).data.extensions,null,1)))' > manifest.extensions.json
