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
studio <dir> [--port N] [--preview-timeout D] [--auto-preview-rows N] [--no-git]
```

| Flag | Default | Meaning |
|---|---|---|
| `--port` | `4317` | Localhost port. `0` picks a free port; the chosen address is printed. |
| `--preview-timeout` | `10s` | Hard time limit for one preview probe. A probe that exceeds it shows as timed out with a retry button. |
| `--auto-preview-rows` | `1000000` | Cohort row count above which expensive previews do not run on their own. They wait for **Run to here**. |
| `--no-git` | off | Do not keep the directory in git: no auto-commit, no history panel. |

Flags may come before or after the directory. Exactly one directory is required.

Cohorts (`.pulse` files) referenced by a request must already exist under the directory. Studio does
not build them. The showcase cases document how (see each case's `REPRODUCE.md`).

### History (git)

The directory is kept in git, locally (no remote). On start, Studio runs `git init` in a directory
that is not in a repository yet, and commits a snapshot of its JSON files. A directory inside an
existing repository (a showcase case in this casebook, say) uses that repository instead: there is
no nested repository, and Studio only ever commits paths inside the directory.

Every Studio write is committed on its own, with a generated message such as
`studio: save req/08_cuped_welch.json`: saving a request or its layout, creating a request, and
saving a run to `out/`. Only the written paths are committed. Changes you make outside Studio,
staged or not, are left alone. The author is your git `user.name` and `user.email`, or
`Pulse Studio <studio@localhost>` when those are not set. Studio commits skip git hooks and
commit signing.

Studio keeps a managed block in the directory's `.gitignore`. It ignores cohorts (`*.pulse`),
uploaded sources (`sources/`), cohort exports (`exports/`), Studio's caches (`.studio/`) and temp
files. Lines outside the block
are yours and are never changed.

The **History** button on an open request lists the commits that touched the file. Click one to
see its diff against the file on disk, and **Restore** to write that version back. A restore is
committed as `studio: restore <path> to <commit>`. Without git installed, or with `--no-git`,
Studio works the same without history and says so in the top bar.

## Using it

The left sidebar lists the directory's files. Request files open in the graph. **New request** creates
a Request, Compose, Facet or Chain file from a cohort you pick, with a minimal valid body. It never
overwrites an existing file.

### The graph model

A request is drawn as a set of nodes, one node per entry in the request JSON:

- **Stage layout.** A request first opens laid out left to right in the order Pulse evaluates it:
  Cohort, Features, Filters, Attributes, Group, Aggregate, Windows, Sort, Analysis, Output. After that
  nodes go wherever you drag them; the layout is saved next to the request.
- **Field wires.** A wire means "this node reads that field". It is the label (or cohort field) that
  the downstream entry names in the JSON. Ports are type-checked against the engine's operator
  catalog, and a connection that the engine would refuse is rejected with the reason. Dragging a wire
  to empty canvas opens a menu of operators that accept that field's type.
- **Response node.** Each request (each compose slot, each chain stage) ends in a **Response** node
  that mirrors the Pulse response, one part per section, shown only when the request fills it:
  - **Table**: the `data` rows, one per group key combination. Its columns are listed in order (group
    key columns marked `key`, then aggregation labels, then window labels), each wired from the node
    that produces it. The header reads `Table · N rows` once a preview knows the count, and the
    footer previews the first rows. Pulse returns `data` only for groups, aggregations, windows or a
    long crosstab. Windows with no groups or aggregations return one row per record (**Row-level
    output**). A `"shape": "long"` crosstab puts its cells in the table (row keys, column keys, cell
    label). A request with none of these (tests, regressions or matrices only, or just filters,
    attributes or sort) has no Table. With no parts at all the node reads **No output**.
  - **Tests**, **Regressions**, **Matrices**, **Crosstab**, **Post-tests**, **Overlays**: one row per
    entry (its label, or the operator), wired from that entry. Tests and matrices in a grouped request
    read `× N groups`; post-tests that run per partition read `× N partitions`. Overlays note where
    their layer sits (crosstab cells, or the series over groups). Vectors feed other nodes and add no
    part.
  - Once a preview or a Run has the result, a row shows a headline: `p = 0.031` for tests and
    post-tests (the largest p over the groups when grouped, `×4`), `R² 0.41` for regressions, the
    shape (`5×5`) for matrices and the crosstab. A grouped test, matrix or post-test previews every
    group. Its node footer reads `p = 0.31 ×4 · 1/4 sig.` over a list of each group's p (or each
    matrix's first correlation).
  - A row reads `adj.` when a `multiplicity` block corrects its p-values. Each key falls through on
    its own: the test's own block, then the request's, then (in a compose slot) the compose root's.
    `method: none` opts out, and `TEST_TUKEY_HSD` is never adjusted. The request's block wires into
    the Tests (and Post-tests) header. A compose root's block wires into the header of every slot
    whose tests inherit it. Hover `adj.` to see which block applies.
  - A `return` block wires into the node header. Parts, rows and table columns it drops (by the
    documented `include` / `exclude` paths) are struck through with "trimmed by return". A `return`
    Studio cannot read is left alone: nothing is struck.

  The Response node is not part of the request JSON: it has no inspector and cannot be deleted (you
  can move it; its position is saved like any node's, under the same id the earlier Result node
  used).
- **Compose Response node.** A compose file's root section, labelled **compose** (drawn when the
  root has its own sections or any fits), ends in a Response node for the compose response:
  - **Slots** lists `responses[i]`, one row per slot (each slot's own Response node has the details).
  - **Overlays** has one row per compose overlay, wired from it. The root `return` only shapes this
    part.
  - **Fits** has one row per fit, wired from the fit's regression. Pulse returns each fit's
    result under `fits.<name>`, outside `return`.
  - **Ranking** appears for a ranked sweep.

  The root `multiplicity` wires into the Overlays header, and the root `return` wires into the node
  header. After a Run, rows show headlines (a slot's row count, a fit's R²).
- **Group fan-out.** A group's bottom handle draws thick dotted "scope" wires to everything that runs
  once per group bucket: aggregations, tests and matrices, plus post-tests when there are two or more
  groupers. The first wire is labelled `per <key>` and, once the group's preview has run, the bucket
  count (`×4`). Regressions, vectors, windows and the crosstab do not run per group and get none.
  Scope wires are drawn only; they cannot be selected, dragged or deleted.
- **Attribute columns.** An attribute's output handle reads `+ column <label>`. If nothing in the
  request reads that column (no wire out, and no later expression names it), the handle gets a dashed
  stub and the node a warning: "computed, but nothing uses this column". It is only a warning; Run and
  Save still work. Drag from the handle to empty canvas to add a group or aggregation that reads it.
- **Palette.** The side palette lists every operator the connected Pulse engine offers, searchable by
  name and description. Drag one onto the canvas (or click it to add it at its stage's spot). Studio fills required parameters with defaults and
  flags what is still missing.
- **Raw JSON nodes.** Anything Studio does not model (unknown keys, odd shapes, templated values) is
  kept as a raw node whose JSON you edit as text. Nothing in your file is dropped.
- **Other request kinds.** Compose requests draw each **slot** (an entry of `requests[]`)
  and each **fit** as a parallel band; an unlabelled slot is shown as `request_<n>` (1-based) and
  **+ Slot** adds one. A regression's fit is shown as a dashed link to the slots that use it. Chain
  requests draw each **stage** as a band (an unnamed stage is `stage_<n>`) with dashed wires carrying
  outputs to later stages. Facet requests are a single node with
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

### Exporting a cohort

**Export…** on a cohort (the button on the cohort view, or on the cohort's row in the sidebar) writes
it to a file in `exports/`. You can pick any format Pulse writes: CSV, TSV, NDJSON, a JSON array,
Parquet, Arrow, Excel or an SPSS `.sav`. You can also pick a Pulse transfer artifact (`.pulse.zst`,
the cohort's exact bytes compressed with zstd).

- **Fields.** All fields are checked by default. Use the filter, **All** and **None** to export a
  subset. The output keeps the cohort's field order.
- **Format options.** Each format shows only its own options, with Pulse's help text. SPSS has
  sanitize names, charset, uncompressed and ignore sidecar. The transfer artifact has a
  compression level from 1 to 22.
- **Time zone.** An IANA zone (for example `Asia/Kolkata`) writes datetime columns as that zone's
  local time, with the offset. SPSS supports UTC only and refuses any other zone.
- **Labels.** When a `labels/` directory sits beside the cohort or above it, a categorical field can
  have its codes replaced with the table's labels, or get an extra `<field>_label` column.
- **Preflight.** While you edit, a check shows the row count, Pulse's warnings and any refusal (an
  illegal SPSS name, a non-UTC zone for SPSS, too many rows for one Excel sheet). Export stays
  disabled while there is a refusal.

The file name defaults to `<cohort>.<ext>`. An existing file is replaced only after you confirm.
The finished export shows its report and a **Download** link. Exports are listed under **Exports**
in the sidebar, where each row downloads the file. `exports/` is ignored by git and nothing is
committed. The dialog remembers the last format and options you used for each cohort, in this
browser only.

### Sidecars

Studio only ever writes two kinds of files: the request JSON, and a layout sidecar next to it.

- **`<request>.layout.json`** (for example `04_metric_battery.layout.json`, or
  `05_x.compose.layout.json`) stores node positions you dragged and compose slot order. Only
  nodes you moved are stored; everything else is auto-laid-out. A missing, broken or stale sidecar
  is ignored and the graph falls back to auto-layout. Delete the file to reset the layout.
- **`out/<name>.json`** is written only when you click **Save to out/**.

Sidecars (`*.layout.json`, `*.out.json`, `*.predict.json`) are listed in the sidebar as not openable.
Tools in this repository that walk the showcase request files skip `*.layout.json`.

## Known limitations

- **Unsaved edits are dropped when you switch files**, without a prompt. Save first.
- **The sidebar does not refresh after Save to out/.** The new file is on disk; reload the page to
  see it listed.
- **No "add fit" for Compose.** You can add, remove, rename and reorder slots, but a new fit
  has to be added in the JSON.
- **`coef("fit", ...)` references inside `ATTR_FORMULA` expressions are not drawn as wires.**
  Formula expressions are not parsed, so only fields named in explicit slots are wired.
- **The Response table preview needs an aggregation, window, sort, group or long crosstab to preview.**
  It reuses that node's preview. Run shows the full result.
- **Slot Response nodes are not wired into the compose Response node.** Both sit in the same column,
  so the root lists the slots by name instead.
- **Renaming a Compose slot label does not update overlays that name it.**
- **Some inspectors are incomplete.** The test inspector lacks `split_by`, `rows` and `cols` fields
  (set them in the JSON), and `ATTR_FORMULA` has no field port row until a field is set.
- **Not in the palette:** sort, crosstab and return have no operators in the manifest, so edit them
  as raw nodes. Multiplicity is available once per request and not in chains.
- **Label-table load errors appear only in the server log.** If a case's `labels/` directory fails
  to load, Studio falls back to the shared engine and logs why; the UI does not say so.
- **Exports are built in memory.** Pulse's writers buffer the whole output before writing it, so a
  very large cohort needs memory to match. Exports cannot be deleted from the UI; remove files from
  `exports/` by hand.
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
