# Sourced by the build scripts. FILMS is the films/ folder.
FILMS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# film_dir NAME: the film folder for filters, pulse-filters, 04 or 04-filters.
film_dir() {
  local n="${1%/}" d b; n="${n##*/}"; n="${n#pulse-}"
  for d in "$FILMS"/[0-9][0-9]-*/; do
    d="${d%/}"; b="${d##*/}"
    if [ "$b" = "$n" ] || [ "${b#*-}" = "$n" ] || [ "${b%%-*}" = "$n" ]; then echo "$d"; return 0; fi
  done
  echo "no such film: $1" >&2; return 1
}

# film_names: every film folder name, in series order.
film_names() { (cd "$FILMS" && ls -d [0-9][0-9]-*/ | tr -d /); }
