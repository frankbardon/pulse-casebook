# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# Steps that need CLI flags call "$PULSE" directly and record its --json envelope.
P() { "$PULSE" "$@" || true; }
rm -f -- *.pulse *.sav *.idx *.indexes.json *.spss.json
node generate.js

# 1. the file: header bytes, inferred schema, nulls and empty sets
imp m
xxd -l 9 m.pulse > m.head.txt
P cohort inspect -i m.pulse --json > m.inspect.json
for q in nul emp sel; do api process "$q"; done

# 2. import warnings: inferred promotion, then a declared schema (partial, strict, unmapped)
P import csv -i w.csv -o w.pulse --sample-rows 50 > w.import.txt 2>&1
rm -f w.pulse; P import csv -i w.csv -o w.pulse --sample-rows 50 --json > w.import.json
P import csv -i w.csv -o ws.pulse --schema w.schema.json --json > ws.import.json
P import csv -i w.csv -o wst.pulse --schema w.schema.json --strict --json > wst.import.json
P import csv -i w.csv -o wx.pulse --schema wx.schema.json --json > wx.import.json
ls ws.pulse wst.pulse wx.pulse > w.written.txt 2>&1 || true

# 3. parent groups (format 0x02) and a vector field
P import csv -i m.csv -o mg.pulse --group store:region,format,sqft,opened --json > mg.import.json
P import csv -i m.csv -o mn.pulse --group store:format --json > mn.import.json
P import csv -i m.csv -o mb.pulse --group store:region,format,sqft,opened,age --json > mb.import.json
xxd -l 9 mg.pulse > mg.head.txt
P cohort inspect -i mg.pulse --json > mg.inspect.json
wc -c m.pulse mg.pulse > mg.sizes.txt
for q in rs rsg; do api process "$q"; done
P import csv -i m.csv -o mv.pulse --vector sat:q1,q2,q3,q4 --vector-kind sat:scale:1:5 --json > mv.import.json
P cohort inspect -i mv.pulse --json > mv.inspect.json
for q in vrej vcor; do api process "$q"; done

# 4. SPSS: export a survey, declare its missing codes as a survey tool would, import, export again
imp sv
PULSE_LABEL_TABLES_DIR=$PWD/labels P export spss -i sv.pulse -o sv0.sav --labels region=regions --labels income=income_codes --uncompressed --json > sv0.export.json
node patch-sav.js sv0.sav sv.sav income 998 999
P import spss -i sv.sav -o svi.pulse --json > svi.import.json
P cohort inspect -i svi.pulse --json --full-dict > svi.inspect.json
for q in svm svn sve; do api process "$q"; done
P export spss -i svi.pulse -o sv2.sav --json > sv2.export.json
P import spss -i sv2.sav -o svi2.pulse --json > svi2.import.json
shasum -a 256 svi.pulse svi2.pulse > svi.roundtrip.txt

# 5. shard archives: inferred quarters disagree; a shared schema joins them
for q in 1 2 3 4; do P import csv -i "s$q.csv" -o "i$q.pulse" >/dev/null; done
P shard create si.pulse -i i1.pulse -i i2.pulse -i i3.pulse --json > sales.mismatch.json
for q in 1 2 3 4; do P import csv -i "s$q.csv" -o "q$q.pulse" --schema sales.schema.json >/dev/null; done
P shard create sales.pulse -i q1.pulse -i q2.pulse -i q3.pulse --json > sales.create.json
P shard add sales.pulse q4.pulse --json > sales.add.json
P cohort inspect -i sales.pulse --json > sales.inspect.json
P cohort filter -i sales.pulse -o flat.pulse --flatten --json > flat.filter.json
PULSE_DATA_DIR=$PWD P --shard-workers 1 api process -r sum.json --json > sum.serial.out.json
PULSE_DATA_DIR=$PWD P --shard-workers 4 api process -r sum.json --json > sum.out.json
PULSE_DATA_DIR=$PWD P --decode-workers 1 api process -r sumf.json --json > sumf.serial.out.json
PULSE_DATA_DIR=$PWD P --decode-workers 4 api process -r sumf.json --json > sumf.out.json
api process anc

# 6. the sidecar index on the archive, kept in step by shard remove and add
P index build -i sales.pulse --key id --json > idx.build.json
P api lookup -i sales.pulse --key id=90001 --json > look.out.json
P shard remove sales.pulse q4.pulse --json > rm.json
P api lookup -i sales.pulse --key id=90001 --json > look.rm.out.json
P shard add sales.pulse q4.pulse --json > readd.json
P api lookup -i sales.pulse --key id=90001 --json > look.readd.out.json

# the quarter CSVs, .sav files and sidecars are rebuilt every time; only the recorded outputs are kept
rm -f -- s1.csv s2.csv s3.csv s4.csv *.sav *.idx *.indexes.json *.spss.json
