# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# Film 19 records materialize runs (written with -o), recommend, a process chain,
# joins and pulse cohort filter (the CLI face of Pulse.FilterToFileWithOptions).
P() { "$PULSE" "$@" || true; }
mat() { PULSE_DATA_DIR=$PWD "$PULSE" api materialize -r "$1.json" -o "$2" --overwrite --json > "$1.out.json" || true; }
matp() { PULSE_DATA_DIR=$PWD "$PULSE" api materialize -r "$1.json" --predict --json > "$1.predict.json" || true; }
rm -f -- *.pulse
node generate.js
for c in w st tx; do P import csv -i "$c.csv" -o "$c.pulse" --schema "$c.schema.json" >/dev/null; done
P import csv -i st.csv -o stf.pulse --schema stf.schema.json >/dev/null                 # the store table keyed as f64
P import csv -i w.csv -o wg.pulse --schema w.schema.json --group store:region,format,opened >/dev/null

# 1. a derived column lives only in its request; materialize writes it as a field
api process rnfilter
matp mat; mat mat wd.pulse
P cohort inspect -i wd.pulse --json > wd.inspect.json
P export csv -i wd.pulse -o wd.rows.csv >/dev/null
api process top
PULSE_DATA_DIR=$PWD P api materialize -r mat.json -o wd.pulse --json > exists.out.json   # wd.pulse is already there, no --overwrite

# 2. the output schema: pick, rename, retype, bucket, recode; the refusals
matp shape; mat shape ws.pulse
P export csv -i ws.pulse -o ws.rows.csv >/dev/null
for q in castfail castnull recodebad slot noderiv; do mat "$q" "o_$q.pulse"; done

# 3. the container: a shard archive with constants elided; parent groups kept, lost, declared
matp shard; mat shard nm.pulse
P cohort inspect -i nm.pulse --json > nm.inspect.json
matp grp; matp grpre
for q in grp grpre grpdecl; do mat "$q" "o_$q.pulse"; done

# 4. recommend drafts the materialize step; the two steps, filled in and run
P recommend --intent distribution_shape --cohort w.pulse --field revenue --top 30 --json > rec.out.json
mat rs1 wl.pulse
api process rs2
api process same            # the same model with the feature in one request (see README)

# 5. a process chain, and one it refuses
api process-chain chain
api process-chain chainwin

# 6. joins
for q in join joinf joinleft joincol; do api process "$q"; done
for q in join joinf; do api predict "$q" predict; done

# 7. filter to file: the archive filtered on the materialized rank, then flattened; a zone-read day
P cohort filter -i nm.pulse -o nmtop.pulse --filter 'rank <= 2' --json > nmtop.filter.json
P cohort inspect -i nmtop.pulse --json > nmtop.inspect.json
P cohort filter -i nmtop.pulse -o nmflat.pulse --flatten --json > nmflat.filter.json
P export csv -i nmflat.pulse -o nmflat.rows.csv >/dev/null
P cohort filter -i tx.pulse -o txw_utc.pulse --filter 'weekday(to_day(at)) >= 6' --json > txutc.filter.json
P cohort filter -i tx.pulse -o txw_ny.pulse --filter 'weekday(to_day(at)) >= 6' --time-zone America/New_York --json > txny.filter.json
P cohort filter -i tx.pulse -o txw_bad.pulse --filter 'weekday(to_day(at)) >= 6' --time-zone Mars/Olympus --json > txbad.filter.json
for z in utc ny; do P export csv -i "txw_$z.pulse" -o "txw_$z.rows.csv" >/dev/null; done
rm -f -- *.pulse
