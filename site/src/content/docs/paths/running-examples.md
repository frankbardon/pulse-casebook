---
title: Running the examples
description: Build Pulse once, then run any case study or rebuild any film's data.
sidebar:
  order: 3
---

Everything here runs from a clone of this repository. You need Go, to build Pulse, plus `bash` and `jq`.

## Build Pulse

```sh
make pulse
```

This builds Pulse from the committed `main` of a local Pulse checkout (`../pulse` by default; set `PULSE_SRC` and `PULSE_REF` to change it) and installs it as `bin/pulse`. Every script on this site uses `bin/pulse` unless you set `PULSE`.

## Run a case study

```sh
cd showcase/ab-test-readout
./run_all.sh            # writes every response envelope to out/
```

The script names differ slightly between case studies; each case study's **Reproduce** page has the exact commands and what each step checks.

## Rebuild a film's data

Films 6 to 10 quote real Pulse runs. To re-run them:

```sh
make data                 # every film
make data FILM=overlays   # one film
```

A newer Pulse can change an output; diff it before trusting a figure. See [Film data](/reference/film-data/).
