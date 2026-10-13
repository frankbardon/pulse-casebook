# Pulse Studio

Pulse Studio is a local, browser-based visual builder for [Pulse](https://github.com/frankbardon/pulse)
requests. You point it at one directory (a casebook case such as `showcase/ab-test-readout`), and it
opens the request JSON files in that directory as a graph you can read, edit, preview and run. It
edits the same JSON files the `pulse` CLI runs. There is no separate project format.

Studio is one Go binary with the web UI embedded. It listens on `127.0.0.1` only and never reads or
writes outside the directory you give it.

## Build

You need Go, Node and npm. From the repository root:

```sh
make studio
```

This builds the UI (`npm run build` in `studio/ui/`, output to `studio/web/dist`) and then compiles
`bin/studio` with the UI embedded. If you run a Go build without building the UI first, the binary
still starts but serves a hint page instead of the app.

`studio/` is its own Go module. It pins the Pulse engine in `studio/go.mod`.

- **Move the pin.** The pin is a tagged Pulse release (currently `v1.0.0-alpha.10`).
  `make studio-bump PULSE_REF=<tag>` pins `studio/go.mod` to that release, for example
  `make studio-bump PULSE_REF=v1.0.0-alpha.10`. `PULSE_REF` is looked up in the local Pulse checkout
  `PULSE_SRC` (default `../pulse`). If it names a commit with no tag (the default is `main`), the pin
  becomes a Go pseudo-version of that commit. The target then runs `go mod tidy`. Rebuild with
  `make studio` afterwards.
- **Develop against a local Pulse checkout.** Create an untracked `studio/go.work` that points
  at your Pulse checkout. `studio/go.work` and `studio/go.work.sum` are gitignored. `make studio-bump`
  ignores the workspace file (`GOWORK=off`), so the pin is always written to `go.mod`.
- **Check everything.** `make studio-check` builds Studio, then runs `go vet`, `go test`, the UI
  type check, lint, unit tests and the Playwright end-to-end suite (about 25 tests against
  temporary copies of case workspaces). It downloads Chromium for Playwright on first use.
- **UI development.** `cd studio/ui && npm run dev` starts Vite, which proxies `/api` to a
  Studio on port 4317, so run `bin/studio <dir>` alongside it.

## Run

```sh
bin/studio showcase/ab-test-readout
```

Then open the address it prints (default <http://127.0.0.1:4317/>). Press Ctrl-C to stop.

```
studio <dir> [--port N] [--preview-timeout D] [--auto-preview-rows N]
```

| Flag | Default | Meaning |
|---|---|---|
| `--port` | `4317` | Localhost port. `0` picks a free port; the chosen address is printed. |
| `--preview-timeout` | `10s` | Hard time limit for one preview probe. A probe that exceeds it shows as timed out with a retry button. |
| `--auto-preview-rows` | `1000000` | Cohort row count above which expensive previews do not run on their own. They wait for **Run to here**. |

Flags may come before or after the directory. Exactly one directory is required.

Cohorts (`.pulse` files) referenced by a request must already exist under the directory. Studio does
not build them. The showcase cases document how (see each case's `REPRODUCE.md`).

## Using it

The left sidebar lists the directory's files. Request files open in the graph. **New request** creates
a Request, Compose, Facet or Chain file from a cohort you pick, with a minimal valid body. It never
overwrites an existing file.

### The graph model

A request is drawn as a set of nodes, one node per entry in the request JSON:

- **Stage columns.** Nodes sit in columns that follow how Pulse evaluates a request: Cohort, Features,
  Filters, Attributes, Group, Aggregate, Windows, Sort, Analysis, Output. A node can only be placed in
  a column that suits its kind.
- **Field wires.** A wire means "this node reads that field". It is the label (or cohort field) that
  the downstream entry names in the JSON. Ports are type-checked against the engine's operator
  catalog, and a connection that the engine would refuse is rejected with the reason. Dragging a wire
  to empty canvas opens a menu of operators that accept that field's type.
- **Palette.** The side palette lists every operator the connected Pulse engine offers, searchable by
  name and description. Drag one into its column. Studio fills required parameters with defaults and
  flags what is still missing.
- **Raw JSON nodes.** Anything Studio does not model (unknown keys, odd shapes, templated values) is
  kept as a raw node whose JSON you edit as text. Nothing in your file is dropped.
- **Other request kinds.** Compose requests draw each slot (and each fit) as a parallel lane; a
  regression's fit is shown as a dashed link to the slots that use it. Chain requests draw each stage
  as a lane with dashed wires carrying outputs to later stages. Facet requests are a single node with
  a field picker and a summary of each field.
- **Inspector.** Click a node to edit it. Forms are generated from the operator manifest; free-form
  operators have hand-written forms.
- **Save.** Cmd/Ctrl+S or the Save button writes the JSON back. Studio edits the document directly,
  so a change shows up as a small diff: number spellings, key order and the file's existing
  formatting style are kept. New files use the casebook's compact house style.

### Previews

Selecting or editing a node runs a small sub-request against the cohort and shows the result in the
node's footer: rows and nulls for filters, `n`/min/max/mean/percentiles for features and attributes,
tables for groups and aggregations, and the engine's own result for tests and regressions. Previews run
in tiers so editing stays responsive:

1. **Cheap**, always automatic: cohort rows, filter counts, and stats without percentiles.
2. **Expensive** (percentiles, buffered aggregations, tests and regressions on a large cohort):
   automatic while the cohort has no more than `--auto-preview-rows` rows. Above that, the node shows
   a deferred notice and runs only when you click **Run to here**.
3. **Run** (the toolbar button): runs the whole request with no row or time limit and shows results
   in a panel. See below.

Edits stale everything downstream of the changed node; a newer edit cancels the preview it replaces.
A preview is limited by `--preview-timeout`. Previews and validation stay off until the cohort
loads. Studio also checks the request as you edit (unknown operators, missing parameters, type
mismatches, engine validation) and shows issues on the node they belong to, with suggested fixes.

### Running and results

**Run** executes the whole file (a request, a compose, a chain, or a facet schema) with the same engine
the CLI uses, honouring the case's own `labels/` directory if it has one. Results appear in a panel
with aggregation, test and regression tables, a tab per slot or stage, and the raw envelope. A run
can be cancelled. **Save to out/** writes the envelope to `<case>/out/<name>.json` in the CLI's
output format, for example `req/11_readout.compose.json` saves as `out/11_readout.json`. It refuses
to overwrite unless you click **Overwrite**.

### Sidecars

Studio only ever writes two kinds of files: the request JSON, and a layout sidecar next to it.

- **`<request>.layout.json`** (for example `04_metric_battery.layout.json`, or
  `05_x.compose.layout.json`) stores node positions you dragged and compose lane order. Only
  nodes you moved are stored; everything else is auto-laid-out. A missing, broken or stale sidecar
  is ignored and the graph falls back to auto-layout. Delete the file to reset the layout.
- **`out/<name>.json`** is written only when you click **Save to out/**.

Sidecars (`*.layout.json`, `*.out.json`, `*.predict.json`) are listed in the sidebar as not openable.
Tools in this repository that walk the showcase request files skip `*.layout.json`.

## Known limitations

- **Unsaved edits are dropped when you switch files**, without a prompt. Save first.
- **The sidebar does not refresh after Save to out/.** The new file is on disk; reload the page to
  see it listed.
- **No "add fit" for Compose.** You can add, remove, rename and reorder slot lanes, but a new fit
  has to be added in the JSON.
- **`coef("fit", ...)` references inside `ATTR_FORMULA` expressions are not drawn as wires.**
  Formula expressions are not parsed, so only fields named in explicit slots are wired.
- **Renaming a Compose slot label does not update overlays that name it.**
- **Some inspectors are incomplete.** The test inspector lacks `split_by`, `rows` and `cols` fields
  (set them in the JSON), and `ATTR_FORMULA` has no field port row until a field is set.
- **Not in the palette:** sort, crosstab and return have no operators in the manifest, so edit them
  as raw nodes. Multiplicity is available once per request and not in chains.
- **Label-table load errors appear only in the server log.** If a case's `labels/` directory fails
  to load, Studio falls back to the shared engine and logs why; the UI does not say so.
- **Single directory, single user, local only.** No authentication and no concurrent-edit
  protection: if another tool changes a file you have open, Studio overwrites it on Save.
- **Cohorts are not built or edited.** Results are tables and the raw JSON envelope.
- **Studio's `go.mod` pin can differ from `bin/pulse`.** `make pulse` builds the CLI from `PULSE_REF`,
  while Studio uses the version pinned in `studio/go.mod`. To align them if the results differ, run
  `make pulse` and `make studio-bump` with the same `PULSE_REF`.

## Third-party software

Routed wires use [libavoid-js](https://github.com/Aksem/libavoid-js), which is licensed under the
LGPL-2.1-or-later and loaded as a separate WebAssembly module. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for its notice, licence text and how to replace it.
