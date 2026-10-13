/// <reference types="node" />
// Integration: open a showcase request, edit one param through the
// inspector's form logic, save through the real save API, and check the
// file diff is the one line holding that param. Runs against temp copies;
// the showcase files are never written.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from '../api.ts'
import { emitModelText, parseModel, updateNode } from './model.ts'
import { applyField, buildForm } from './paramForms.ts'

const studioDir = resolve(import.meta.dirname, '../../..')
const repoDir = resolve(studioDir, '..')
const catalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'testdata/catalog.slim.json'), 'utf8'),
) as { manifest: Manifest; schema: unknown }

type Case = { file: string; node: string; param: string; input: string; line: number; before: string; after: string }

const cases: Case[] = [
  // House style: change a value inside an inline params object.
  {
    file: 'showcase/ab-test-readout/req/04_metric_battery.json',
    node: 'tests[1]',
    param: 'success',
    input: 'no',
    line: 7,
    before: '"params": {"success": "yes"}',
    after: '"params": {"success": "no"}',
  },
  // House style: add a param that was absent (top-level per the schema).
  {
    file: 'showcase/ab-test-readout/req/04_metric_battery.json',
    node: 'tests[2]',
    param: 'alpha',
    input: '0.01',
    line: 8,
    before: '"label": "revenue_per_user"}',
    after: '"label": "revenue_per_user", "alpha": 0.01}',
  },
  // Compose slot, house style: a number param.
  {
    file: 'showcase/ab-test-readout/req/05_revenue_shape.compose.json',
    node: 'requests[1].aggregations[3]',
    param: 'percentile',
    input: '90',
    line: 25,
    before: '{"percentile": 95}',
    after: '{"percentile": 90}',
  },
  // Expanded style (JSON.stringify shape) keeps its style.
  {
    file: 'showcase/multi-timezone-ops/req/08_weekly_on_time_trend.json',
    node: 'requests[0].post_tests[0]',
    param: 'alpha',
    input: '0.01',
    line: 49,
    before: '"alpha": 0.05,',
    after: '"alpha": 0.01,',
  },
]

const hasGo = spawnSync('go', ['version']).status === 0

describe.skipIf(!hasGo)('inspector edit + save', () => {
  let dir = ''
  let server: ChildProcess | undefined
  let base = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'studio-inspector-'))
    for (const c of cases) cpSync(join(repoDir, c.file), join(dir, 'ws', c.file))
    const bin = join(dir, 'studio')
    const build = spawnSync('go', ['build', '-o', bin, '.'], { cwd: studioDir, encoding: 'utf8' })
    if (build.status !== 0) throw new Error(`go build failed: ${build.stderr}`)
    server = spawn(bin, [join(dir, 'ws'), '--port', '0', '--no-git'], { stdio: ['ignore', 'ignore', 'pipe'] })
    base = await new Promise<string>((ok, fail) => {
      let log = ''
      server!.stderr!.on('data', (chunk: Buffer) => {
        log += chunk.toString()
        const m = /at (http:\/\/127\.0\.0\.1:\d+)\//.exec(log)
        if (m) ok(m[1])
      })
      server!.on('exit', (code) => fail(new Error(`studio exited (${code}): ${log}`)))
    })
  }, 120_000)

  afterAll(() => {
    server?.kill()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it.each(cases)('$node.$param in $file: one-line diff', async (c) => {
    const path = join(dir, 'ws', c.file)
    const original = readFileSync(path, 'utf8')
    const model = parseModel(original)
    const node = model.nodes.get(c.node)!
    expect(node, c.node).toBeDefined()
    const field = buildForm(node, catalog)
      .sections.flatMap((s) => s.fields)
      .find((f) => f.key === c.param)!
    const r = applyField(field, node.value, c.input)
    expect(r.error).toBeUndefined()
    const res = await fetch(`${base}/api/file?path=${encodeURIComponent(c.file)}`, {
      method: 'PUT',
      body: emitModelText(updateNode(model, c.node, r.value)),
    })
    expect(res.status).toBe(200)
    const saved = readFileSync(path, 'utf8')
    expect(((await res.json()) as { text: string }).text).toBe(saved)

    const a = original.split('\n')
    const b = saved.split('\n')
    expect(b.length).toBe(a.length)
    const changed = a.flatMap((l, i) => (l === b[i] ? [] : [i + 1]))
    expect(changed).toEqual([c.line])
    expect(a[c.line - 1]).toContain(c.before)
    expect(b[c.line - 1]).toBe(a[c.line - 1].replace(c.before, c.after))
  })
})
