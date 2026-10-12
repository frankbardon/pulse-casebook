#!/usr/bin/env bash
# Contact sheets of film stills, for checking layouts before narrating.
# usage: ./shots.sh overlays sheet 10 40 70 100   → sheet0.jpg (2x2 stills per sheet)
# Times are seconds; every four make one sheet. Needs ImageMagick's montage.
cd "$(dirname "$0")"; source ./film.sh
page="$(film_dir "$1")/index.html" || exit 1; pre=$2; shift 2
rm -f still_*.jpg
NODE_PATH=$(npm root -g) node stills.js "$page" "$@" | grep -v ERR_FILE_NOT_FOUND
files=(); for t in "$@"; do files+=(still_${t/./_}.jpg); done
i=0; while [ $((i*4)) -lt ${#files[@]} ]; do montage "${files[@]:$((i*4)):4}" -tile 2x2 -geometry 960x540+4+4 ${pre}$i.jpg; i=$((i+1)); done
