#!/usr/bin/env bash
# Render a Pulse film from the committed sources.
#
#   ./render.sh filters                  # MP4 using the committed narration (no TTS needed)
#   ./render.sh --preview 20 filters     # only the first 20 seconds, for a quick look
#   ./render.sh --narrate filters        # re-synthesize narration first, then render
#   ./render.sh --narrate-only filters   # re-synthesize narration + subtitles, no video
#   ./render.sh --all                    # every film, using the committed narration
#
# A film is named by its folder: filters, 04 or 04-filters (pulse-filters also works).
# Output: films/<film>/render/pulse-<topic>.mp4 (and .srt when narrating).
# Env: CHROMIUM=/path/to/chrome (optional), VOICE=af_heart, RES=1920, FPS=30.
set -euo pipefail
BUILD="$(cd "$(dirname "$0")" && pwd)"; source "$BUILD/film.sh"
MODE=video PREVIEW=""
while [ $# -gt 0 ]; do case "$1" in
  --narrate) MODE=full; shift;; --narrate-only) MODE=narrate; shift;;
  --preview) PREVIEW="$2"; shift 2;; --all) shift; set -- $(film_names);
    for f in "$@"; do "$0" ${PREVIEW:+--preview $PREVIEW} "$f"; done; exit 0;;
  -h|--help) sed -n 2,12p "$0"; exit 0;; *) break;; esac; done
DIR="$(film_dir "${1:?film name required, e.g. filters}")"
FILM="${DIR##*/}"; NAME="pulse-${FILM#*-}"
PAGE="$DIR/index.html"; SCRIPT="$DIR/scenes.js"; [ -f "$SCRIPT" ] || SCRIPT="$PAGE"   # film 1 keeps its script inline
MP3="$DIR/narration.mp3"; OUTDIR="$DIR/render"
VOICE=${VOICE:-af_heart} RES=${RES:-1920} FPS=${FPS:-30}
export KOKORO_DIR=${KOKORO_DIR:-$BUILD/models}
WORK="$BUILD/work/$FILM"; rm -rf "$WORK"; mkdir -p "$WORK/vo" "$OUTDIR"
cd "$WORK"

if [ "$MODE" != video ]; then
  echo "· narrating $FILM with voice $VOICE"
  node "$BUILD/inject.js" "$SCRIPT" --reset            # untimed: one cue per spoken line
  node "$BUILD/cues.js" "$PAGE" cues.json
  node "$BUILD/tts.js" "$VOICE"                        # vo/NN.wav + vo/lens.json
  node "$BUILD/inject.js" "$SCRIPT"                    # bake lengths into the film's NARR slot
  node "$BUILD/cues.js" "$PAGE" cues.json              # cue start times on the stretched timeline
  node "$BUILD/dur.js" "$PAGE"
  node "$BUILD/mix.js"                                 # narration.wav aligned to the cues
  ffmpeg -v error -y -i narration.wav -c:a libmp3lame -b:a 128k "$MP3"
  node "$BUILD/srt.js" "$OUTDIR/$NAME.srt"
  echo "· wrote $FILM/narration.mp3 and $FILM/render/$NAME.srt"
  [ "$MODE" = narrate ] && exit 0
else
  [ -f "$MP3" ] || { echo "missing $MP3 — run with --narrate" >&2; exit 1; }
  ffmpeg -v error -y -i "$MP3" -ar 48000 narration.wav
fi

OUT="$OUTDIR/$NAME${PREVIEW:+-preview}.mp4"
echo "· rendering $OUT at ${RES}px, ${FPS} fps${PREVIEW:+, first ${PREVIEW}s}"
AUDIO=narration.wav LIMIT="$PREVIEW" node "$BUILD/encode.js" "$PAGE" "$OUT" "$RES" "$FPS"
echo "done: $OUT"
