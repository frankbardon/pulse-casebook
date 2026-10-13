// Global setup builds the e2e library templates under
// .playwright/workspaces/: each is a Studio library (library.json, a
// global area, one workspace named after the template) written directly
// in the library layout from tracked copies of a showcase case:
//
//   <template>/library.json
//   <template>/cohorts/<global cohorts>
//   <template>/workspaces/<template>/
//     workspace.json
//     analyses/**     the case's req/ (the req/ level dropped)
//     cohorts/        the case's local cohorts
//     ...             every other tracked file at its relative path
//
// Cohort references are rewritten to the library form: a local cohort
// {"filename": "x.pulse", "data_dir": "cohorts"}, a global one
// "_global/cohorts" (joins' right and overlay populations likewise).
// Cohorts are synthesized from the cases' committed specs with fixed
// seeds (cohorts are gitignored, so nothing depends on a developer's
// local build). showcase/ itself is never written. Tests never touch a
// template: harness.ts copies one into a temp dir per worker (read-only
// smoke) or per test (tests that write files).
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO, STUDIO_BIN, TEMPLATES } from './harness.ts'

// Cohorts each template gets: [committed spec (repo-relative), cohort
// file name, seed, rows (0 = the spec's row_count), scope (default
// local: the workspace's cohorts/; global: the library's cohorts/)].
type Cohort = [spec: string, out: string, seed: number, rows: number, scope?: 'global' | 'local']

type Template = {
  // Showcase case whose tracked files are copied.
  from: string
  // Only these tracked sub-paths of the case (default: all).
  only?: string[]
  cohorts: Cohort[]
}

export const TEMPLATE_SPECS: Record<string, Template> = {
  // The flagship case as REPRODUCE.md builds it: ab_test seed 64 (40,000
  // rows, byte-identical to `pulse synth from-schema --seed 64`), design
  // seed 1.
  'ab-test-readout': {
    from: 'showcase/ab-test-readout',
    cohorts: [
      ['showcase/ab-test-readout/data/ab_test.synth.json', 'ab_test.pulse', 64, 0],
      // Global: the case's analyses reach it through _global/cohorts.
      ['showcase/ab-test-readout/data/design.synth.json', 'design.pulse', 1, 0, 'global'],
    ],
  },
  // Retail chains over a small single-file orders cohort (the real
  // orders.pulse is a 13-shard, 22M-row archive): one month's spec,
  // its run-all.sh seed, 20,000 rows.
  'retail-chain': {
    from: 'showcase/retail-at-scale',
    only: ['req/'],
    cohorts: [['showcase/retail-at-scale/synth/orders-2025-01.synth.json', 'orders.pulse', 202501, 20_000]],
  },
  // Privacy-safe sharing's vector and join requests over small cohorts
  // synthesized from the case's emitted twin spec (the real
  // customers.pulse is imported from CSV): a source and a twin, 2,000
  // rows each.
  'privacy-safe-sharing': {
    from: 'showcase/privacy-safe-sharing',
    only: ['req/'],
    cohorts: [
      ['showcase/privacy-safe-sharing/synth/spec.json', 'customers.pulse', 7, 2_000],
      ['showcase/privacy-safe-sharing/synth/spec.json', 'twin.pulse', 11, 2_000],
    ],
  },
}

const LIBRARY_JSON = '{"version": 1}\n'

// rewriteRefs turns a showcase request's cohort references (bare file
// names beside the case: data_dir ".") into the library form. Showcase
// files are house style, so plain text edits keep every other byte.
export function rewriteRefs(text: string, global: Set<string>): string {
  const dir = (file: string) => (global.has(file) ? '_global/cohorts' : 'cohorts')
  return text
    .replace(/("filename": "([^"]+)",\s*"data_dir": )"\."/g, (_m, head: string, file: string) => `${head}"${dir(file)}"`)
    .replace(/"(right|cohort)": "([^"/]+\.pulse(#[^"]*)?)"/g, (_m, key: string, ref: string) => `"${key}": "${dir(ref.split('#')[0])}/${ref}"`)
}

export default function globalSetup(): void {
  if (!STUDIO_BIN.exists()) throw new Error(`${STUDIO_BIN.path} is missing: run \`make studio\` first`)
  const tool = join(REPO, '.playwright', 'bin', 'synthcohort')
  execFileSync('go', ['build', '-o', tool, './cmd/synthcohort'], { cwd: join(REPO, 'studio'), stdio: 'inherit' })

  rmSync(TEMPLATES, { recursive: true, force: true })
  for (const [name, t] of Object.entries(TEMPLATE_SPECS)) {
    const lib = join(TEMPLATES, name)
    const ws = join(lib, 'workspaces', name)
    for (const d of ['cohorts', 'schemas', 'imports', 'sources']) mkdirSync(join(lib, d), { recursive: true })
    for (const d of ['analyses', 'cohorts', 'schemas', 'imports', 'sources']) mkdirSync(join(ws, d), { recursive: true })
    writeFileSync(join(lib, 'library.json'), LIBRARY_JSON)
    writeFileSync(join(ws, 'workspace.json'), `{\n  "name": "${name}",\n  "created": "2026-01-01T00:00:00Z"\n}\n`)
    const global = new Set(t.cohorts.filter((c) => c[4] === 'global').map((c) => c[1]))
    const tracked = execFileSync('git', ['ls-files', '-z', '--', t.from], { cwd: REPO, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    for (const file of tracked) {
      const rel = file.slice(t.from.length + 1)
      if (t.only && !t.only.some((p) => rel.startsWith(p))) continue
      const to = rel.startsWith('req/') ? join(ws, 'analyses', rel.slice(4)) : join(ws, rel)
      mkdirSync(dirname(to), { recursive: true })
      if (rel.startsWith('req/') && rel.endsWith('.json')) writeFileSync(to, rewriteRefs(readFileSync(join(REPO, file), 'utf8'), global))
      else cpSync(join(REPO, file), to)
    }
    for (const [spec, out, seed, rows, scope] of t.cohorts) {
      const to = join(scope === 'global' ? lib : ws, 'cohorts', out)
      execFileSync(tool, [`-rows=${rows}`, join(REPO, spec), to, String(seed)], { stdio: 'inherit' })
    }
  }
}
