#!/usr/bin/env bash
# Fast pre-commit gate (seconds): gofmt and go vet for the Studio module.
# No UI build, no tests; parts whose directory does not exist are skipped.
set -euo pipefail
cd "${FLOW_REPO_DIR:-$(git rev-parse --show-toplevel)}"

if [ -d studio ]; then
  # node_modules may ship third-party .go files (e.g. flatted); not ours.
  unformatted=$(gofmt -l studio | grep -v '/node_modules/' || true)
  if [ -n "$unformatted" ]; then
    echo "gofmt: these files need formatting:" >&2
    echo "$unformatted" >&2
    exit 1
  fi
fi

if [ -f studio/go.mod ]; then
  (cd studio && go vet ./...)
fi
