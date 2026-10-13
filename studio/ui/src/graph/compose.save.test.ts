/// <reference types="node" />
// Integration: the flagship compose file opens and saves byte-identically,
// a lane added in the editor saves as a Compose request the engine
// accepts (predict-compose), predict-compose errors land on lane node
// paths, and the layout sidecar keeps the lane order. Runs against a temp
// copy of the ab-test case; the showcase files are never written.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setIn } from './jsonEdit.ts'
import { addLane } from './lanes.ts'
import { emitModelText, parseModel, updateNode } from './model.ts'

const studioDir = resolve(import.meta.dirname, '../../..')
const caseDir = resolve(studioDir, '../showcase/ab-test-readout')
const rel = 'req/11_readout.compose.json'
const hasGo = spawnSync('go', ['version']).status === 0
const hasCohort = existsSync(join(caseDir, 'ab_test.pulse'))

describe.skipIf(!hasGo)('compose lanes through the save API', () => {
  let dir = ''
  let server: ChildProcess | undefined
  let base = ''
  const original = readFileSync(join(caseDir, rel), 'utf8')

  const put = async (url: string, body: string) => {
    const res = await fetch(`${base}${url}`, { method: 'PUT', body })
    expect(res.status).toBe(200)
    return res.json()
  }
  const predict = async (text: string) => {
    const res = await fetch(`${base}/api/predict`, { method: 'POST', body: `{"path":${JSON.stringify(rel)},"request":${text}}` })
    expect(res.status).toBe(200)
    return (await res.json()) as { root: string; valid: boolean; issues: { path: string; severity: string }[] }
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'studio-compose-'))
    const ws = join(dir, 'ws')
    cpSync(join(caseDir, 'req'), join(ws, 'req'), { recursive: true })
    if (hasCohort) cpSync(join(caseDir, 'ab_test.pulse'), join(ws, 'ab_test.pulse'))
    const bin = join(dir, 'studio')
    const build = spawnSync('go', ['build', '-o', bin, '.'], { cwd: studioDir, encoding: 'utf8' })
    if (build.status !== 0) throw new Error(`go build failed: ${build.stderr}`)
    server = spawn(bin, [ws, '--port', '0', '--no-git'], { stdio: ['ignore', 'ignore', 'pipe'] })
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

  it('round-trips 11_readout byte-identically', async () => {
    const body = (await put(`/api/file?path=${encodeURIComponent(rel)}`, emitModelText(parseModel(original, 'compose')))) as { text: string }
    expect(body.text).toBe(original)
  })

  it('saves an added lane as valid Compose JSON', async () => {
    const r = addLane(parseModel(original, 'compose'))
    const body = (await put(`/api/file?path=${encodeURIComponent(rel)}`, emitModelText(r.model))) as { kind: string; text: string }
    expect(body.kind).toBe('compose')
    const doc = JSON.parse(body.text)
    expect(doc.requests).toHaveLength(5)
    expect(doc.requests[4].label).toBe('request_5')
    // Only the new slot was added: the first four are untouched on disk.
    expect(body.text.startsWith(original.slice(0, original.lastIndexOf('    }\n  ]')))).toBe(true)
    if (!hasCohort) return
    const v = await predict(body.text)
    expect(v.root).toBe('compose')
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(v.valid).toBe(true)
  })

  it.skipIf(!hasCohort)('maps predict-compose errors to the lane node', async () => {
    const m = parseModel(original, 'compose')
    const id = 'requests[2].tests[0]'
    const bad = updateNode(m, id, setIn(m.nodes.get(id)!.value, ['field'], { type: 'string', raw: '"no_such_field"' }))
    const v = await predict(emitModelText(bad))
    expect(v.valid).toBe(false)
    expect(v.issues.some((i) => i.severity === 'error' && i.path.startsWith('requests[2]'))).toBe(true)
  })

  it('keeps the lane order in the layout sidecar', async () => {
    const lanes = ['requests[3]', 'requests[0]', 'requests[1]', 'requests[2]']
    await put(`/api/layout?path=${encodeURIComponent(rel)}`, JSON.stringify({ version: 1, nodes: {}, lanes }))
    const res = await fetch(`${base}/api/layout?path=${encodeURIComponent(rel)}`)
    const got = (await res.json()) as { layout: { lanes: string[] } }
    expect(got.layout.lanes).toEqual(lanes)
  })
})
