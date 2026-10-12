#!/usr/bin/env bash
# One-time setup for render.sh. Video-only renders need just Node + ffmpeg (steps 1–2);
# narration (--narrate) also needs Python + Kokoro (steps 3–4).
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "install ffmpeg first (needs libx264 + libmp3lame)" >&2; exit 1; }
npm install                                   # 1. playwright (pinned in package.json)
npx playwright install chromium               # 2. headless browser (skip if you set CHROMIUM)
if [ "${1:-}" = "--with-narration" ]; then
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt     # 3. kokoro-onnx, soundfile, numpy
  mkdir -p models                                                          # 4. Kokoro v1.0 model (~350 MB)
  base=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
  [ -f models/kokoro-v1.0.onnx ] || curl -L -o models/kokoro-v1.0.onnx "$base/kokoro-v1.0.onnx"
  [ -f models/voices-v1.0.bin ]  || curl -L -o models/voices-v1.0.bin  "$base/voices-v1.0.bin"
fi
echo "ready: ./render.sh pulse-filters"
