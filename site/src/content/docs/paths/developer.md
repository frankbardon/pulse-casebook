---
title: The developer path
description: For developers integrating Pulse. How a request runs, then the CLI, synthetic data and the Go library at scale.
sidebar:
  order: 2
---

You are wiring Pulse into a product or a pipeline. This path starts with how a request executes, then shows the CLI and the library on real workloads.

## 1. See how a request runs

Watch [Film 1: Lifecycle](/films/lifecycle/). One request goes from bytes on disk to a JSON envelope: admitted, checked against the schema, routed to an execution arm, and streamed through the record loop across shards.

Then [Film 2: Concepts](/films/concepts/) names the parts of a request you will be writing.

## 2. Run the examples

Set up once with [Running the examples](/paths/running-examples/). Every case study has a script that runs its requests through the `pulse` CLI and writes the JSON envelopes to `out/`.

## 3. Pick the workload closest to yours

- [Retail at scale](/case-studies/retail-at-scale/): 51 million order lines in one shard archive, header-only metadata, archive point lookups, per-customer chains over every customer, and `--shard-workers` / `--decode-workers` timings.
- [Privacy-safe data sharing](/case-studies/privacy-safe-sharing/): profile a table, generate a synthetic twin with `pulse synth`, and check it for fidelity and disclosure risk.
- [Multi-time-zone operations](/case-studies/multi-timezone-ops/): time-zone-aware requests over UTC instants, and how daylight saving changes the answer.
- [Credit risk model](/case-studies/credit-risk-model/): `pulse api predict` to validate a request before it reads records, then `process` and `explain`.

Each case study's **Reproduce** page lists every command, and its **Files** page links every request, so you can copy a request as a starting point.
