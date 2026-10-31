# Embedding Pulse: recorded runs

- **Cohort** (`generate.js`, seed 23): `orders.csv`, 24 illustrative orders with `order_id`, `region` (North, South, East, West, six each), `channel` (web, store), `amount` and `items`. `more.csv` holds the same 24 orders plus four more, so a rewrite of the cohort gives the watcher a real content change (24 → 28 records).
- **Steps:** `build.sh` regenerates the CSVs, imports `orders.pulse` and `more.pulse` with the stock binary, records the stock manifest's `extensions` block, runs the Go harness, and drives `pulse mcp` with `mcp.js`. Every `.pulse` it writes is deleted at the end.
- **Go harness** (`harness/`, its own Go module): most of this film is library API, so `harness/main.go` drives the published module `github.com/frankbardon/pulse` at `v1.0.0-alpha.33` (pinned in `harness/go.mod` and `go.sum`; no `replace`, no local checkout). `build.sh` runs it with `go run . ..` from `harness/` when `go` is on the PATH. Without Go it prints a notice and skips, and the committed `.out.json` files stand. To re-run it by hand: import the two cohorts, then `cd harness && go run . ..`.
- **Determinism:** the harness leaves out every wall-clock figure (durations, timestamps, elapsed ms) and every file:line of a stack, so a re-run writes the same bytes. `mcp.js` writes the loopback ports it picks as `PORT` and drops the `_seconds` series from its scrape.

The film copies its figures from these runs into `scenes.js`, next to a comment naming the run. The Go on screen is the harness's own code, trimmed.

## The harness (`harness/main.go`)

The extensions are an aggregator `AGG_ACME_MIDRANGE` ((min + max) / 2, `Streamable` and `Mergeable`), an expression function `with_tax(amount, rate)` and a lookup table `tax_rate` (North 0.20, South 0.10, East 0.15, West 0.05).

| Output | Library calls | What it shows |
|---|---|---|
| `ext_manifest.out.json` | `pulse.New(Options{Extensions})`, `p.Manifest` | the manifest's `extensions` block: the aggregator (`namespace` ACME, `streamable`, `mergeable`, `accepts`), `expr_functions` (`with_tax`, signature, `pure`) and `lookup_tables` (`tax_rate`, `has_rows_data`) |
| `ext_process.out.json` | `p.Process(ext_process)` | `AGG_ACME_MIDRANGE` beside `AGG_MIN` and `AGG_MAX` by region: East 63.29 (48.30, 78.28), North 55.41, South 47.455, West 45.47. Its components are the floor alone (n 6, n_null 0 per group): it declares no `ComponentSchema` |
| `ext_formula.out.json` | `p.Process(ext_formula)` | `ATTR_FORMULA` `with_tax(amount, lookup("tax_rate", region))`, summed by region: net / gross East 364.95 / 419.69, North 361.40 / 433.68, South 282.03 / 310.24, West 263.69 / 276.89 |
| `probe.out.json` | `pulse.New` with one broken registration each | `PULSE_EXTENSION_STREAMABLE_MISMATCH` (Streamable without an OnlineAggregator), `PULSE_EXTENSION_FACTORY_PANIC` (a factory that reads `schema.Fields[0]`: index out of range over the probe's empty schema), `PULSE_EXTENSION_NAME_COLLISION` (`AGG_SUM`), `PULSE_EXTENSION_NAME_INVALID` (`midrange`, with the name pattern) |
| `panic.out.json` | `p.Process(panic)`, then `p.Process(ext_process)` on the same instance | `AGG_ACME_BRITTLE` writes to a nil map on an amount over 75: `PROCESSING_PANIC`, `op` process, `panic_type` runtime.plainError, first frame `main.brittle.UpdateRow` (frames kept as function names only). The next request returns its 4 rows |
| `stream.out.json` | `p.ProcessStreamResult(stream)`, `(stream_grouped)` | header `RequestHash` (equal to `req.Hash()`) and `EstimatedTotal` 24. Grouped: four chunks, one per region; the aggregations' components are the floor (n 24, n_null 0) until the terminal chunk, which carries the per-group figures. Terminator: completed, `TotalRows` 4. The terminal chunk's components equal a buffered `p.Process`'s: `true` |
| `watch.out.json` | `p.WatchWithOptions("live.pulse", PollInterval 50 ms)` | `created` (the first tick reports the copy of `orders.pulse` already there, hash 6aabf686…), `modified` after `more.pulse` is copied over it (hash 27aaec8c…; `CountRecords` 28), `removed` after deletion (empty hash) |
| `hash.out.json` | `req.Hash()` | `hash_a` and `hash_b` (the same request, keys reordered) both a19baa73d704199c0bacad113520a9c4; `hash_c` (grouped by channel) b08186f55bbfe3babe42ec7641730518 |
| `filter_to_file.out.json` | `p.FilterToFileWithRequest`, each twice | `amount > 50`: `6aabf6867c9729e0_0345937ff897b099.pulse`, 15 rows, written then `reused`. `with_tax(amount, 0.1) > 55` (embedder code): written both times, never reused |
| `reads.out.json` | `pulse.ExpressionReads`, `p.RequestReads(reads)` | the formula reads vars amount, region, param fee, funcs lookup, with_tax; a `let`-bound name is not a var; `amount * (` is `PULSE_FORMULA_COMPILE_ERROR` with an empty read set. `RequestReads` lists each slot's path, key, columns, params and funcs |
| `observe_hooks.out.json` | `Options.Hooks`, `p.Process(ext_process)` then `(observe_bad)` | start (kind process, scope top, cohort, request hash), phases plan, open, scan, end (code ok, arm streaming, 24 scanned, 24 matched, 4 out, 1 worker). The refused request: phases plan, open, end code `SERVICE_VALIDATION` |
| `observe_prom.out.json` | `Options.Metrics = prompulse.Metrics(reg)` (`observe/prom`), `reg.Gather()` | `pulse_operations_total` ok 1 and SERVICE_VALIDATION 1, `pulse_rows_scanned_total` 24, `pulse_bytes_read_total` 466, the two duration histograms (sample counts only) |
| `observe_otel.out.json` | `Options.Hooks = otelpulse.Hooks(tp)` (`observe/otel`), an in-memory span recorder | two `pulse.process` spans: attributes (arm, rows, request hash, code) and one event per phase; the refused one has status Error, `SERVICE_VALIDATION` |

## The stock binary and `pulse mcp`

| Output | Command | What it shows |
|---|---|---|
| `manifest_ext.out.json` | `pulse manifest --json` | the stock binary's `extensions` block: every list empty |
| `mcp_observe.out.json` | `node mcp.js $PULSE`: `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:PORT pulse mcp --data-dir . --no-cohort-scan --metrics-addr 127.0.0.1:0`, one `pulse_process` call (`hash_a.json`) | the startup notice (`metrics: 127.0.0.1:PORT, otlp: traces+metrics`), the `/metrics` scrape (`pulse_operations_total{op="process",code="ok",scope="top"} 1`, rows scanned 24, bytes read 466), and the OTLP/HTTP posts the stand-in collector received: `/v1/traces` (with the `pulse.process` span) and `/v1/metrics`, both `application/x-protobuf` |
