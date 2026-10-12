#!/usr/bin/env bash
# Usage: render-film.sh <page.html> <script-with-NARR-slot> <name>
# Narrates and renders one film: <name>-narration.mp3 beside the page, video/<name>.mp4 and video/<name>.srt.
set -euo pipefail
cd "$(dirname "$0")"
PAGE=$1 SCRIPT=$2 NAME=$3 VOICE=${VOICE:-af_heart} PY=${PY:-python3}
rm -rf vo && mkdir -p vo ../video
python3 inject.py "$SCRIPT" --reset
node cues.js "$PAGE" cues.json
$PY tts.py "$VOICE"
python3 inject.py "$SCRIPT"
node cues.js "$PAGE" cues.json
node dur.js "$PAGE"
$PY mix.py
ffmpeg -v error -y -i narration.wav -c:a libmp3lame -b:a 128k "$(dirname "$PAGE")/$NAME-narration.mp3"
python3 - "$NAME" <<'PY'
import json, sys
cues = json.load(open('cues.json')); lens = json.load(open('vo/lens.json'))['lens']
ts = lambda x: f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round((x%1)*1000)):03d}"
open(f'../video/{sys.argv[1]}.srt', 'w').write('\n'.join(f"{i+1}\n{ts(c['t'])} --> {ts(c['t']+l+0.2)}\n{c['say']}\n" for i, (c, l) in enumerate(zip(cues, lens))))
PY
AUDIO=narration.wav node encode.js "$PAGE" "../video/$NAME.mp4" 1920 30
echo "done: video/$NAME.mp4"
