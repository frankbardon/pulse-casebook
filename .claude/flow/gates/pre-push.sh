#!/usr/bin/env bash
# Full-suite gate run by flow-implement per test group: the Studio check.
set -euo pipefail
cd "${FLOW_REPO_DIR:-$(git rev-parse --show-toplevel)}"
make studio-check
