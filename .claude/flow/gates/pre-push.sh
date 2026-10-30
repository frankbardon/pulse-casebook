#!/usr/bin/env bash
# Pre-push gate for the casebook: syntax-checks the film JavaScript, renders a few
# stills of one film headless, and builds the site. Runs everything every time.
# FLOW_GATE_SCOPE (changed|full) and FLOW_BASE_REF are accepted and ignored.
# Needs node, films/build/node_modules (films/build/setup.sh) and site/node_modules.
# Env: GATE_FILM=<topic> picks the smoke film (default: concepts).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
: "${FLOW_GATE_SCOPE:=full}" "${FLOW_BASE_REF:=}"

step() { printf '\n· %s\n' "$*"; }
fail() { echo "pre-push: $*" >&2; exit 1; }

step "node --check: kit, build and scenes JavaScript"
shopt -s nullglob
js=(films/kit/*.js films/build/*.js films/[0-9][0-9]-*/scenes.js films/[0-9][0-9]-*/data/*.js)
[ ${#js[@]} -gt 0 ] || fail "no JavaScript found under films/"
for f in "${js[@]}"; do node --check "$f" || fail "syntax error in $f"; done
echo "  ${#js[@]} files ok"

step "stills.js smoke"
[ -d films/build/node_modules/playwright ] || fail "films/build/node_modules missing: run films/build/setup.sh"
# Use CHROMIUM if set; else Playwright's own browser; else a locally installed Chrome.
if [ -z "${CHROMIUM:-}" ]; then
  pw="$(cd films/build && node -e 'process.stdout.write(require("playwright").chromium.executablePath())' 2>/dev/null || true)"
  if [ -z "$pw" ] || [ ! -x "$pw" ]; then
    for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
             "/Applications/Chromium.app/Contents/MacOS/Chromium" \
             "$(command -v google-chrome || true)" "$(command -v chromium || true)" "$(command -v chromium-browser || true)"; do
      [ -n "$c" ] && [ -x "$c" ] && { export CHROMIUM="$c"; echo "  Playwright's browser is not installed; using $c"; break; }
    done
    [ -n "${CHROMIUM:-}" ] || fail "no Chromium: run films/build/setup.sh or set CHROMIUM"
  fi
fi
film="$(bash -c 'source films/build/film.sh && film_dir "$1"' _ "${GATE_FILM:-concepts}")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
out="$(cd "$tmp" && NODE_PATH="$ROOT/films/build/node_modules" node "$ROOT/films/build/stills.js" "$film/index.html" 5 30 2>&1)" \
  || { echo "$out" >&2; fail "stills.js failed on ${film##*/}"; }
echo "$out" | grep -q '^errors: \[\]$' || { echo "$out" >&2; fail "page errors in ${film##*/}"; }
for t in 5 30; do [ -s "$tmp/still_$t.jpg" ] || fail "no still at ${t}s for ${film##*/}"; done
echo "  ${film##*/}: stills at 5s and 30s, no page errors"

step "site: npm run build"
[ -d site/node_modules ] || (cd site && npm ci)
(cd site && npm run build >"$tmp/site.log" 2>&1) || { tail -40 "$tmp/site.log" >&2; fail "site build failed"; }
tail -1 "$tmp/site.log"

step "pre-push gate passed"
