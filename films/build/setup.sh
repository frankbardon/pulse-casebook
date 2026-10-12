#!/usr/bin/env bash
# One-time setup for render.sh. Video-only renders need just Node + ffmpeg (steps 1–2);
# narration (--narrate) also needs the Kokoro model (step 3).
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "install ffmpeg first (needs libx264 + libmp3lame)" >&2; exit 1; }
npm install                                   # 1. playwright + kokoro-js (pinned in package.json)
npx playwright install chromium               # 2. headless browser (skip if you set CHROMIUM)
if [ "${1:-}" = "--with-narration" ]; then
  KOKORO_DIR=models node tts.js --fetch       # 3. Kokoro v1.0 model (~330 MB) into models/
fi
echo "ready: ./render.sh filters"
