#!/usr/bin/env bash
# Rebuilds narration + both videos from pages/pulse-lifecycle.html.
# Needs: node + playwright (with a Chromium; set CHROMIUM=/path to override), ffmpeg,
#        python3 with kokoro-onnx, soundfile, numpy, and the Kokoro model files in build/models/.
set -euo pipefail
cd "$(dirname "$0")"
PAGE=../pages/pulse-lifecycle.html
VOICE=${VOICE:-af_heart}
mkdir -p vo models
[ -f models/kokoro-v1.0.onnx ] || curl -sSL -o models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
[ -f models/voices-v1.0.bin ]  || curl -sSL -o models/voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

python3 inject.py "$PAGE" --reset          # 1. un-timed film: one cue per spoken line
node cues.js "$PAGE" cues.json
python3 tts.py "$VOICE"                    # 2. one WAV per line -> vo/, lengths -> vo/lens.json
python3 inject.py "$PAGE"                  # 3. bake lengths into the page; timeline stretches to fit
node cues.js "$PAGE" cues.json             #    cue start times on the stretched timeline
node dur.js "$PAGE"
python3 mix.py                             # 4. narration.wav aligned to the cues
ffmpeg -v error -y -i narration.wav -c:a libmp3lame -b:a 128k ../pages/narration.mp3
node encode.js "$PAGE" ../video/pulse-lifecycle-narrated.mp4 1920 30   # 5. frames -> H.264 + AAC
echo "done: ../video/pulse-lifecycle-narrated.mp4"
