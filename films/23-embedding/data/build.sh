# Sourced by films/build/data.sh from this folder, with imp (CSV -> .pulse) and
# api (pulse api <cmd> -r <req>.json > <req>.<suffix>.json) defined. See ../../DATA.md.
# Film 23 records the embedder API: a Go harness (harness/) drives the published
# github.com/frankbardon/pulse module at v1.0.0-alpha.33 as a library, and mcp.js drives
# `pulse mcp` with its OTLP and Prometheus exports switched on. See README.md.
rm -f -- *.pulse
node generate.js
imp orders; imp more

# The stock binary's manifest: its extensions block (every list empty: nothing registered)
"$PULSE" manifest --json | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const m = JSON.parse(s), d = m.data || m;
    process.stdout.write(JSON.stringify({ pulse_version: d.pulse_version, extensions: d.extensions }, null, 2) + "\n"); });' > manifest_ext.out.json || true

# The Go harness: pulse.New, Options.Extensions, the probe, panic recovery, ProcessStreamResult,
# Watch, Request.Hash, ExpressionReads / RequestReads, observe hooks, observe/prom, observe/otel.
# Without Go it is skipped, and the committed .out.json files stand.
if command -v go >/dev/null 2>&1; then
  (cd harness && go run . ..) || echo "harness failed; the committed outputs stand" >&2
else
  echo "go not found: skipping the harness (the committed harness outputs stand)" >&2
fi

# pulse mcp with OTEL_EXPORTER_OTLP_ENDPOINT and --metrics-addr
node mcp.js "$PULSE" || true
rm -f -- *.pulse
