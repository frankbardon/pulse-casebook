#!/usr/bin/env bash
# Render a Pulse Anatomy film from the committed sources.
#
#   ./render.sh pulse-filters                  # MP4 using the committed narration (no TTS needed)
#   ./render.sh --preview 20 pulse-filters     # only the first 20 seconds, for a quick look
#   ./render.sh --narrate pulse-filters        # re-synthesize narration first, then render
#   ./render.sh --narrate-only pulse-filters   # re-synthesize narration + subtitles, no video
#   ./render.sh --all                          # every film, using the committed narration
#
# Films: pulse-lifecycle, pulse-concepts, pulse-features, pulse-filters (any films/<name>.html).
# Output: films/video/<name>.mp4 (and films/video/<name>.srt when narrating).
# Env: CHROMIUM=/path/to/chrome (optional), VOICE=af_heart, PY=python, RES=1920, FPS=30.
set -euo pipefail
BUILD="$(cd "$(dirname "$0")" && pwd)"; FILMS="$(dirname "$BUILD")"
MODE=video PREVIEW=""
while [ $# -gt 0 ]; do case "$1" in
  --narrate) MODE=full; shift;; --narrate-only) MODE=narrate; shift;;
  --preview) PREVIEW="$2"; shift 2;; --all) shift; set -- $(cd "$FILMS" && ls *.html | sed 's/\.html$//');
    for f in "$@"; do "$0" ${PREVIEW:+--preview $PREVIEW} "$f"; done; exit 0;;
  -h|--help) sed -n 2,12p "$0"; exit 0;; *) break;; esac; done
NAME="${1:?film name required, e.g. pulse-filters}"
PAGE="$FILMS/$NAME.html"; SCRIPT="$FILMS/$NAME.js"; [ -f "$SCRIPT" ] || SCRIPT="$PAGE"   # film 1 keeps its script inline
MP3="$FILMS/$NAME-narration.mp3"
[ -f "$PAGE" ] || { echo "no such film: $PAGE" >&2; exit 1; }
PY=${PY:-$( [ -x "$BUILD/.venv/bin/python" ] && echo "$BUILD/.venv/bin/python" || echo python3 )}
VOICE=${VOICE:-af_heart} RES=${RES:-1920} FPS=${FPS:-30}
export KOKORO_DIR=${KOKORO_DIR:-$BUILD/models}
WORK="$BUILD/work/$NAME"; rm -rf "$WORK"; mkdir -p "$WORK/vo" "$FILMS/video"
cd "$WORK"

if [ "$MODE" != video ]; then
  echo "· narrating $NAME with voice $VOICE"
  "$PY" "$BUILD/inject.py" "$SCRIPT" --reset            # untimed: one cue per spoken line
  node "$BUILD/cues.js" "$PAGE" cues.json
  "$PY" "$BUILD/tts.py" "$VOICE"                         # vo/NN.wav + vo/lens.json
  "$PY" "$BUILD/inject.py" "$SCRIPT"                     # bake lengths into the film's NARR slot
  node "$BUILD/cues.js" "$PAGE" cues.json                # cue start times on the stretched timeline
  node "$BUILD/dur.js" "$PAGE"
  "$PY" "$BUILD/mix.py"                                  # narration.wav aligned to the cues
  ffmpeg -v error -y -i narration.wav -c:a libmp3lame -b:a 128k "$MP3"
  "$PY" - "$FILMS/video/$NAME.srt" <<'PY'
import json, sys
cues = json.load(open('cues.json')); lens = json.load(open('vo/lens.json'))['lens']
ts = lambda x: f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round((x%1)*1000)):03d}"
open(sys.argv[1], 'w').write('\n'.join(f"{i+1}\n{ts(c['t'])} --> {ts(c['t']+l+0.2)}\n{c['say']}\n" for i, (c, l) in enumerate(zip(cues, lens))))
PY
  echo "· wrote $MP3 and films/video/$NAME.srt"
  [ "$MODE" = narrate ] && exit 0
else
  [ -f "$MP3" ] || { echo "missing $MP3 — run with --narrate" >&2; exit 1; }
  ffmpeg -v error -y -i "$MP3" -ar 48000 narration.wav
fi

OUT="$FILMS/video/$NAME${PREVIEW:+-preview}.mp4"
echo "· rendering $OUT at ${RES}px, ${FPS} fps${PREVIEW:+, first ${PREVIEW}s}"
AUDIO=narration.wav LIMIT="$PREVIEW" node "$BUILD/encode.js" "$PAGE" "$OUT" "$RES" "$FPS"
echo "done: $OUT"
