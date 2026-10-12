// Global setup builds the e2e workspace templates under
// .playwright/workspaces/: tracked copies of showcase cases plus cohorts
// synthesized from their committed specs with fixed seeds (cohorts are
// gitignored, so nothing depends on a developer's local build). Tests
// never touch a template: harness.ts copies one into a temp dir per
// worker (read-only smoke) or per test (tests that write files).
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO, STUDIO_BIN, TEMPLATES } from './harness.ts'

// Cohorts each template gets: [committed spec (repo-relative), cohort
// path (template-relative), seed, rows (0 = the spec's row_count)].
type Cohort = [spec: string, out: string, seed: number, rows: number]

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
      ['showcase/ab-test-readout/data/design.synth.json', 'design.pulse', 1, 0],
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
}

export default function globalSetup(): void {
  if (!STUDIO_BIN.exists()) throw new Error(`${STUDIO_BIN.path} is missing: run \`make studio\` first`)
  const tool = join(REPO, '.playwright', 'bin', 'synthcohort')
  execFileSync('go', ['build', '-o', tool, './cmd/synthcohort'], { cwd: join(REPO, 'studio'), stdio: 'inherit' })

  rmSync(TEMPLATES, { recursive: true, force: true })
  for (const [name, t] of Object.entries(TEMPLATE_SPECS)) {
    const dir = join(TEMPLATES, name)
    mkdirSync(dir, { recursive: true })
    const tracked = execFileSync('git', ['ls-files', '-z', '--', t.from], { cwd: REPO, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    for (const file of tracked) {
      const rel = file.slice(t.from.length + 1)
      if (t.only && !t.only.some((p) => rel.startsWith(p))) continue
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      cpSync(join(REPO, file), join(dir, rel))
    }
    for (const [spec, out, seed, rows] of t.cohorts) {
      execFileSync(tool, [`-rows=${rows}`, join(REPO, spec), join(dir, out), String(seed)], { stdio: 'inherit' })
    }
  }
}
