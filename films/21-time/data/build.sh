# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
node generate.js; imp o; imp h; imp p
"$PULSE" cohort inspect -i p.pulse --json > p.inspect.json
# w.csv holds naive wall clocks: import it four ways, then export what each stored.
wimp() { out=$1; shift; "$PULSE" import csv -i w.csv -o "$out.pulse" --json "$@" > "$out.import.json" || true; }
wimp w_naive
wimp w_err --source-tz Europe/Berlin                        # refused: 02:30 on 29 March does not exist in Berlin
wimp w_earlier --source-tz Europe/Berlin --dst-policy earlier
wimp w_rows --source-tz-field zone --dst-policy later
for f in w_naive w_earlier w_rows; do "$PULSE" export csv -i "$f.pulse" -o "$f.export.csv" >/dev/null; done
"$PULSE" export csv -i w_rows.pulse --tz Europe/Berlin -o w_rows.berlin.csv >/dev/null
for r in day_utc day_ny day_field badzone dst_utc dst_berlin spring fall spring_utc spring_day cal panel trans markov retention june winfirst; do api process "$r"; done
for r in resolve winfirst bare; do api predict "$r" predict; done
"$PULSE" manifest --json | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const m=JSON.parse(s).data;console.log(JSON.stringify({pulse_version:m.pulse_version,tzdata_version:m.tzdata_version}))})' > manifest.tz.json
