// harness runs every e2e test against bin/studio serving a temp copy of a
// workspace template (built by global-setup.ts), on a free port:
//
//   - by default, one read-only ab-test-readout copy and server per
//     worker (`test` from this module);
//   - with `test.use({ workspace: '<template>' })`, a fresh copy and
//     server per test, so the test may write files (save, create, layout,
//     save-to-out) and read them back from `studio.dir`.
//
// Each copy is kept in git as `studio <dir>` does (git init + snapshot,
// auto-commit on save), with git isolated from the developer's config:
// an empty global config, no system config, and no repository discovery
// above the temp dir, so commits use the "Pulse Studio" fallback author
// and land only in the copy. `test.use({ git: false })` serves with
// --no-git instead.
//
// Temp copies are removed after use; failures keep their Playwright trace
// under .playwright/ (see playwright.config.ts).
import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const REPO = resolve(import.meta.dirname, '..', '..', '..')
export const TEMPLATES = join(REPO, '.playwright', 'workspaces')
const bin = join(REPO, 'bin', 'studio')
export const STUDIO_BIN = { path: bin, exists: () => existsSync(bin) }

export type Studio = {
  // Base URL, e.g. http://127.0.0.1:53211.
  url: string
  // The served directory (a temp copy of the template).
  dir: string
  // Reads a workspace file as text.
  read: (rel: string) => string
  exists: (rel: string) => boolean
  // Runs git in the served directory (same isolated config as the
  // studio) and returns its trimmed stdout.
  git: (...args: string[]) => string
}

type Running = Studio & { stop: () => Promise<void> }

// copyTemplate copies a workspace template into a fresh temp dir named
// after it (the sidebar shows the directory's base name).
function copyTemplate(name: string): { dir: string; cleanup: () => void } {
  const src = join(TEMPLATES, name)
  if (!existsSync(src)) throw new Error(`workspace template ${name} is missing (global setup builds ${TEMPLATES})`)
  const parent = mkdtempSync(join(tmpdir(), 'studio-e2e-'))
  const dir = join(parent, name)
  cpSync(src, dir, { recursive: true })
  return { dir, cleanup: () => rmSync(parent, { recursive: true, force: true }) }
}

// gitEnv isolates the git the studio runs in dir (see the header).
function gitEnv(dir: string): NodeJS.ProcessEnv {
  const parent = dirname(dir)
  const config = join(parent, '.gitconfig-e2e')
  writeFileSync(config, '')
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: parent }
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) delete env[k]
  return env
}

// startStudio launches bin/studio on dir with --port 0 (and --no-git
// unless git) and resolves once it logs its address and /api/health
// answers.
async function startStudio(dir: string, git: boolean): Promise<Running> {
  const args = [dir, '--port', '0', ...(git ? [] : ['--no-git'])]
  const env = gitEnv(dir)
  const proc: ChildProcess = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], env })
  let log = ''
  const url = await new Promise<string>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`studio did not start within 20s:\n${log}`)), 20_000)
    proc.stderr!.on('data', (chunk: Buffer) => {
      log += chunk.toString()
      const m = /serving .* at (http:\/\/127\.0\.0\.1:\d+)\//.exec(log)
      if (m) {
        clearTimeout(timer)
        ok(m[1])
      }
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      fail(new Error(`studio exited (${code}) before serving:\n${log}`))
    })
  })
  // Keep draining stderr so the child never blocks on a full pipe.
  proc.stderr!.on('data', () => {})
  for (let i = 0; ; i++) {
    const ok = await fetch(`${url}/api/health`).then((r) => r.ok, () => false)
    if (ok) break
    if (i > 100) throw new Error(`studio at ${url} never became healthy`)
    await new Promise((r) => setTimeout(r, 100))
  }
  const stop = () =>
    new Promise<void>((done) => {
      if (proc.exitCode !== null) return done()
      proc.once('exit', () => done())
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 5_000).unref()
    })
  return {
    url,
    dir,
    read: (rel) => readFileSync(join(dir, rel), 'utf8'),
    exists: (rel) => existsSync(join(dir, rel)),
    git: (...a) => execFileSync('git', a, { cwd: dir, env, encoding: 'utf8' }).trim(),
    stop,
  }
}

async function serve(name: string, git: boolean, provide: (s: Studio) => Promise<void>): Promise<void> {
  const ws = copyTemplate(name)
  let s: Running | undefined
  try {
    s = await startStudio(ws.dir, git)
    await provide(s)
  } finally {
    await s?.stop()
    ws.cleanup()
  }
}

export const test = base.extend<{ workspace: string; git: boolean; studio: Studio }, { sharedStudio: Studio }>({
  // 'shared' = the worker's read-only ab-test-readout server; a template
  // name = a fresh copy and server for this test alone.
  workspace: ['shared', { option: true }],
  // Keep the copy in git (default); false serves it with --no-git. Only
  // applies to a per-test workspace (the shared server keeps git on).
  git: [true, { option: true }],
  // (`provide` is Playwright's `use`, renamed for the React hooks lint.)
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures destructure their deps
  sharedStudio: [async ({}, provide) => serve('ab-test-readout', true, provide), { scope: 'worker' }],
  studio: async ({ workspace, git, sharedStudio }, provide) => {
    if (workspace === 'shared') return provide(sharedStudio)
    await serve(workspace, git, provide)
  },
  baseURL: async ({ studio }, provide) => provide(studio.url),
})

export { expect }

// drag presses on from's centre and moves to to's centre; the returned
// function releases (so a test can look at the in-flight drag first).
export async function drag(page: Page, from: Locator, to: Locator): Promise<() => Promise<void>> {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  return async () => page.mouse.up()
}
