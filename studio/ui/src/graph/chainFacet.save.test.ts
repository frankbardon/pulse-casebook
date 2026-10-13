/// <reference types="node" />
// Integration: chain and facet roots open, edit and save through the
// real save API byte-identically; predict-chain and predict-facet errors
// land on node paths; the facet node's preview is the facet result.
// Runs against a temp workspace; the showcase files are never written.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PreviewResult } from '../api.ts'
import { FACET_NODE, setFacetProp } from './facetGraph.ts'
import { setIn } from './jsonEdit.ts'
import { parseJson } from './jsonTree.ts'
import { addLane, renameLane } from './lanes.ts'
import { emitModelText, parseModel, updateNode } from './model.ts'
import { facetFields } from './previews.ts'
import { ownerOf } from './validation.ts'

const studioDir = resolve(import.meta.dirname, '../../..')
const repoDir = resolve(studioDir, '..')
const abDir = join(repoDir, 'showcase/ab-test-readout')
const chainRel = 'retail/req/05_retention_chain.json'
const facetRel = 'req/02_srm_gof.facet.json'
const hasGo = spawnSync('go', ['version']).status === 0
const hasCohort = existsSync(join(abDir, 'ab_test.pulse'))

// A small chain over the ab-test cohort: users per arm, then the total.
const abChain = JSON.stringify({
  cohort: { filename: 'ab_test.pulse', data_dir: '.' },
  stages: [
    { name: 'per_arm', request: { groups: [{ type: 'GROUP_CATEGORY', field: 'arm' }], aggregations: [{ type: 'AGG_COUNT', field: 'user_id', label: 'users' }] } },
    { name: 'total', request: { aggregations: [{ type: 'AGG_SUM', field: 'users', label: 'all_users' }] } },
  ],
})
const abChainRel = 'req/90_arms.chain.json'

describe.skipIf(!hasGo)('chain and facet roots through the save API', () => {
  let dir = ''
  let server: ChildProcess | undefined
  let base = ''

  const call = async (method: string, url: string, body: string) => {
    const res = await fetch(`${base}${url}`, { method, body })
    expect(res.status, await res.clone().text()).toBe(200)
    return res.json()
  }
  const put = (rel: string, text: string) => call('PUT', `/api/w/ws/file?path=${encodeURIComponent(rel)}`, text) as Promise<{ kind: string; text: string }>
  const predict = (rel: string, text: string) =>
    call('POST', '/api/w/ws/predict', `{"path":${JSON.stringify(rel)},"request":${text}}`) as Promise<{
      root: string
      valid: boolean
      issues: { path: string; severity: string; message: string }[]
    }>
  const preview = (rel: string, text: string, nodes: string[]) =>
    call('POST', '/api/w/ws/preview', `{"path":${JSON.stringify(rel)},"nodes":${JSON.stringify(nodes)},"force":true,"request":${text}}`) as Promise<PreviewResult>

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'studio-chain-facet-'))
    const ws = join(dir, 'lib', 'workspaces', 'ws')
    cpSync(join(abDir, 'req'), join(ws, 'req'), { recursive: true })
    mkdirSync(join(ws, 'retail/req'), { recursive: true })
    cpSync(join(repoDir, 'showcase/retail-at-scale/req'), join(ws, 'retail/req'), { recursive: true })
    if (hasCohort) {
      cpSync(join(abDir, 'ab_test.pulse'), join(ws, 'ab_test.pulse'))
      cpSync(join(abDir, 'design.pulse'), join(ws, 'design.pulse'))
    }
    const bin = join(dir, 'studio')
    const build = spawnSync('go', ['build', '-o', bin, '.'], { cwd: studioDir, encoding: 'utf8' })
    if (build.status !== 0) throw new Error(`go build failed: ${build.stderr}`)
    // A library with one workspace, ws (the copies above).
    mkdirSync(join(dir, 'lib', 'workspaces', 'ws'), { recursive: true })
    writeFileSync(join(dir, 'lib', 'library.json'), '{"version": 1}\n')
    server = spawn(bin, [join(dir, 'lib'), '--port', '0', '--no-git'], { stdio: ['ignore', 'ignore', 'pipe'] })
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

  it('round-trips 05_retention_chain and saves stage edits', async () => {
    const original = readFileSync(join(repoDir, 'showcase/retail-at-scale/req/05_retention_chain.json'), 'utf8')
    const m = parseModel(original, 'chain')
    expect((await put(chainRel, emitModelText(m))).text).toBe(original)

    let edited = renameLane(m, 'stages[1]', 'cohorts')
    const id = 'stages[1].request.aggregations[1]'
    edited = updateNode(edited, id, setIn(edited.nodes.get(id)!.value, ['type'], { type: 'string', raw: '"AGG_MAX"' }))
    edited = addLane(edited).model
    const saved = await put(chainRel, emitModelText(edited))
    expect(saved.kind).toBe('chain')
    const doc = JSON.parse(saved.text)
    expect(doc.stages.map((s: { name: string }) => s.name)).toEqual(['per_customer', 'cohorts', 'stage_3'])
    expect(doc.stages[1].request.aggregations[1].type).toBe('AGG_MAX')
    expect(doc.stages[2].request.aggregations[0]).toEqual({ type: 'AGG_COUNT', field: 'first_month', label: 'n' })
    // Only the edited lines changed.
    const before = original.split('\n')
    const after = saved.text.split('\n')
    expect(after.slice(0, before.indexOf('      "name": "by_first_month",'))).toEqual(before.slice(0, before.indexOf('      "name": "by_first_month",')))
  })

  it('round-trips 02_srm_gof and saves facet setting edits', async () => {
    const original = readFileSync(join(abDir, facetRel), 'utf8')
    const m = parseModel(original, 'facet')
    expect((await put(facetRel, emitModelText(m))).text).toBe(original)
    const edited = setFacetProp(setFacetProp(m, 'discrete_top_k', parseJson('3')), 'fields', parseJson('["arm","device"]'))
    const saved = await put(facetRel, emitModelText(edited))
    expect(saved.kind).toBe('facet')
    expect(JSON.parse(saved.text)).toMatchObject({ fields: ['arm', 'device'], discrete_top_k: 3 })
    expect(saved.text.split('\n')[0]).toBe(original.split('\n')[0])
    await put(facetRel, original)
  })

  it.skipIf(!hasCohort)('maps predict-chain errors to stage nodes', async () => {
    await put(abChainRel, abChain)
    const ok = await predict(abChainRel, abChain)
    expect(ok.root).toBe('chain')
    expect(ok.issues.filter((i) => i.severity === 'error')).toEqual([])

    const nodes = ['cohort', 'stages[0]', 'stages[1]', 'stages[0].request.groups[0]', 'stages[0].request.aggregations[0]', 'stages[1].request.aggregations[0]']
    const m = parseModel(abChain, 'chain')
    const id = 'stages[1].request.aggregations[0]'
    const bad = updateNode(m, id, setIn(m.nodes.get(id)!.value, ['field'], { type: 'string', raw: '"no_such_column"' }))
    const v = await predict(abChainRel, emitModelText(bad))
    expect(v.valid).toBe(false)
    const errors = v.issues.filter((i) => i.severity === 'error')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((i) => ownerOf(i.path, nodes)?.startsWith('stages[1]'))).toBe(true)

    const g0 = 'stages[0].request.aggregations[0]'
    const median = updateNode(m, g0, setIn(m.nodes.get(g0)!.value, ['type'], { type: 'string', raw: '"AGG_MEDIAN"' }))
    const v2 = await predict(abChainRel, emitModelText(median))
    expect(v2.valid).toBe(false)
    expect(v2.issues.some((i) => i.severity === 'error' && ownerOf(i.path, nodes)?.startsWith('stages[0]'))).toBe(true)
  })

  it.skipIf(!hasCohort)('previews a chain stage', async () => {
    const res = await preview(abChainRel, abChain, ['stages[1].request.aggregations[0]'])
    expect(res.status).toBe('ok')
    expect(res.probes[0].table?.rows[0]).toMatchObject({ all_users: 40000 })
  })

  it.skipIf(!hasCohort)('maps predict-facet errors to the facet node', async () => {
    const m = setFacetProp(parseModel(readFileSync(join(abDir, facetRel), 'utf8'), 'facet'), 'fields', parseJson('["no_such_field"]'))
    const v = await predict(facetRel, emitModelText(m))
    expect(v.root).toBe('facet')
    expect(v.valid).toBe(false)
    const nodes = ['cohort', 'overlays[0]', FACET_NODE, 'discrete_top_k']
    expect(v.issues.some((i) => i.severity === 'error' && ownerOf(i.path, nodes) === FACET_NODE)).toBe(true)
  })

  it.skipIf(!hasCohort)('previews the facet output on the facet node', async () => {
    const text = readFileSync(join(abDir, facetRel), 'utf8')
    const res = await preview(facetRel, text, [FACET_NODE])
    expect(res.status).toBe('ok')
    const [arm] = facetFields(res.probes[0])
    expect(arm.name).toBe('arm')
    expect(arm.discrete?.values.length).toBeGreaterThan(1)
    expect(res.probes[0].rows?.filtered).toBeGreaterThan(0)
  })
})
