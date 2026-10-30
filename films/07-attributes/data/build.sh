# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See README.md.
node generate.js
for c in m p reg mv w; do imp "$c"; done
for q in scores stats formula formula_err total total_fw total_pw recodes topbox topbox_inc \
         prev prev_window prev_filter reg reg_sums mv post post_refused; do api process "$q"; done
api predict total_pw predict
api predict post predict
