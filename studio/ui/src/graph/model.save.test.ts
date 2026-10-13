/// <reference types="node" />
// Integration: model emitter output, saved through the real save API (PUT
// /api/file, which re-formats with studio/internal/jsonfmt), reproduces
// every showcase request byte-for-byte. Builds the studio binary with the
// Go toolchain and serves a temp copy of the corpus.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { emitModelText, parseModel } from './model.ts'

const studioDir = resolve(import.meta.dirname, '../../..')
const repoDir = resolve(studioDir, '..')
const fixture = resolve(import.meta.dirname, 'testdata/sweep_templated.compose.json')

// Workspace-relative path -> source file.
const files: [string, string][] = [
  ...globSync('showcase/*/req/*.json', { cwd: repoDir }).sort().map((rel): [string, string] => [rel, join(repoDir, rel)]),
  ['fixtures/sweep_templated.compose.json', fixture],
]

const hasGo = spawnSync('go', ['version']).status === 0

describe.skipIf(!hasGo)('model emitter through the save API', () => {
  let dir = ''
  let server: ChildProcess | undefined
  let base = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'studio-roundtrip-'))
    const ws = join(dir, 'lib', 'workspaces', 'ws')
    for (const [rel, src] of files) cpSync(src, join(ws, rel))
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

  it('covers the corpus', () => {
    expect(files.length).toBeGreaterThanOrEqual(76)
  })

  it.each(files)('%s saves byte-identical', async (rel, src) => {
    const original = readFileSync(src, 'utf8')
    const res = await fetch(`${base}/api/w/ws/file?path=${encodeURIComponent(rel)}`, {
      method: 'PUT',
      body: emitModelText(parseModel(original)),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { text: string }
    expect(body.text).toBe(original)
    expect(readFileSync(join(dir, 'lib', 'workspaces', 'ws', rel), 'utf8')).toBe(original)
  })
})
