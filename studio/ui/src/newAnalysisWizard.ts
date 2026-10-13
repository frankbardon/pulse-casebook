// The New analysis wizard's state and validation (pure): the three
// steps (mode, cohort, name & folder), what each mode reads, returns and
// how it runs, cohort grouping and search, folder choices and the name
// rules. NewAnalysisWizard.tsx renders it.
import type { WorkspaceFile } from './api.ts'
import { newFilePath } from './files.ts'
import { ANALYSES_DIR, analysisFolder, analysisName, isAnalysis, MODES, type Mode, type ModeId } from './modes.ts'

export type Step = 'mode' | 'cohort' | 'name'

export const STEPS: { id: Step; label: string }[] = [
  { id: 'mode', label: 'Mode' },
  { id: 'cohort', label: 'Cohort' },
  { id: 'name', label: 'Name & folder' },
]

// ModeGuide explains a mode so the choice is an informed one. Every
// claim follows the Pulse guides (compose-requests, facet-design,
// process-chain, request-envelope).
export type ModeGuide = {
  reads: string
  returns: string
  runs: string
  example: string
}

export const MODE_GUIDE: Record<ModeId, ModeGuide> = {
  standalone: {
    reads: 'One cohort (plus the cohort it joins, if any).',
    returns: 'One result: a table of rows (one per group, or one overall), or a crosstab.',
    runs: 'One pass through the pipeline: filters, then groups, then aggregations (and windows, tests, sort).',
    example: 'What is the average order value per region for active customers?',
  },
  composed: {
    reads: 'One cohort per part; parts may read different cohorts.',
    returns: 'One full result per part, side by side in part order, plus any comparison between parts.',
    runs: 'Each part runs exactly as it would alone and never affects another, so Pulse can run them in parallel. Parts can share one fitted model, and finished parts can be compared.',
    example: 'Did the treatment group convert better than control, and by how much?',
  },
  faceted: {
    reads: 'One cohort, optionally filtered.',
    returns: 'One summary per chosen field: top values with counts for categories; count, min, max, mean and spread for numbers (percentiles and a histogram on request).',
    runs: 'One scan of the rows; each field is summarised on its own. No groups, crosstabs or tests: a breakdown by a combination of fields is a Standalone analysis.',
    example: 'Which regions appear, and what is the age range, among US customers?',
  },
  chained: {
    reads: 'One source cohort, read by the first step only (only it may join).',
    returns: "Every step's result; the last step's is the final answer.",
    runs: "Steps run in order; each reads the previous step's result rows as its table. A step must pass the chain gate (no windows, tests, regressions or medians); a refused step stops the chain after the earlier steps ran.",
    example: 'What is the revenue per store, and how spread out is revenue across stores?',
  },
}

// Remembered across opens: only the last chosen mode (per viewer).
const MODE_KEY = 'studio.newAnalysis.mode'

export function loadLastMode(): ModeId | null {
  try {
    const v = globalThis.localStorage?.getItem(MODE_KEY)
    return MODES.some((m) => m.id === v) ? (v as ModeId) : null
  } catch {
    return null
  }
}

export function saveLastMode(id: ModeId): void {
  try {
    globalThis.localStorage?.setItem(MODE_KEY, id)
  } catch {
    // Not remembered; the wizard starts with no mode chosen.
  }
}

export function modeById(id: ModeId | null): Mode | undefined {
  return MODES.find((m) => m.id === id)
}

// CohortGroup is one labelled group of the cohort step.
export type CohortGroup = { scope: 'local' | 'global'; label: string; cohorts: WorkspaceFile[] }

// cohortLabel is how the cohort step names a cohort: its file name
// without the cohorts/ (or _global/cohorts/) folder and .pulse.
export function cohortLabel(path: string): string {
  return path
    .replace(/^_global\//, '')
    .replace(/^cohorts\//, '')
    .replace(/\.pulse$/i, '')
}

export function isGlobalCohort(f: Pick<WorkspaceFile, 'path' | 'scope'>): boolean {
  return f.scope === 'global' || f.path.startsWith('_global/')
}

// allCohorts is the workspace's cohorts as listed: its own first, then
// global, each by name.
export function allCohorts(files: WorkspaceFile[]): WorkspaceFile[] {
  const cohorts = files.filter((f) => f.kind === 'cohort').sort((a, b) => cohortLabel(a.path).localeCompare(cohortLabel(b.path)))
  return [...cohorts.filter((f) => !isGlobalCohort(f)), ...cohorts.filter(isGlobalCohort)]
}

// cohortGroups groups the workspace's cohorts (This workspace, then
// Global; empty groups dropped), keeping those whose name or path
// contains every whitespace-separated term of the query.
export function cohortGroups(files: WorkspaceFile[], query: string): CohortGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const match = (f: WorkspaceFile) => terms.every((t) => f.path.toLowerCase().includes(t))
  const by = (pred: (f: WorkspaceFile) => boolean) => allCohorts(files).filter((f) => pred(f) && match(f))
  const groups: CohortGroup[] = [
    { scope: 'local', label: 'This workspace', cohorts: by((f) => !isGlobalCohort(f)) },
    { scope: 'global', label: 'Global', cohorts: by(isGlobalCohort) },
  ]
  return groups.filter((g) => g.cohorts.length > 0)
}

// initialCohort is the cohort the wizard starts on: the asked-for one
// if the workspace has it, else its first own cohort, else the first
// global one, else none.
export function initialCohort(files: WorkspaceFile[], asked?: string): string | null {
  const cohorts = allCohorts(files)
  if (asked && cohorts.some((c) => c.path === asked)) return asked
  return cohorts[0]?.path ?? null
}

// folderOptions are the existing folders under analyses/ that hold
// analyses ("" = analyses/ itself, always first), every parent of a
// nested folder included.
export function folderOptions(files: WorkspaceFile[]): string[] {
  const set = new Set<string>()
  for (const f of files) {
    if (!isAnalysis(f) || !f.path.startsWith(ANALYSES_DIR + '/')) continue
    const parts = analysisFolder(f.path).split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'))
  }
  return ['', ...[...set].sort((a, b) => a.localeCompare(b))]
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/

// folderError says what is wrong with a folder under analyses/ ("" is
// analyses/ itself), or null.
export function folderError(folder: string): string | null {
  const f = folder.trim().replace(/^\/+|\/+$/g, '')
  if (f === '') return null
  for (const seg of f.split('/')) {
    if (seg === '' || !SEGMENT.test(seg) || seg === '..') return 'Folder names use letters, digits, - _ and . (separated by /).'
  }
  return null
}

export function normFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, '')
}

// targetPath is the file the analysis is created at, or null when the
// name or folder is not usable.
export function targetPath(folder: string, name: string, mode: Mode | undefined): string | null {
  if (!mode || folderError(folder)) return null
  const f = normFolder(folder)
  return newFilePath(f === '' ? ANALYSES_DIR : `${ANALYSES_DIR}/${f}`, name, mode.root)
}

// nameError says what is wrong with an analysis name in a folder, or
// null: it is required, uses letters, digits, spaces, - _ and ., must not
// end in .layout.json (layout sidecars) and must be unique in the folder
// (no other analysis there lists under the same name, whatever its mode).
export function nameError(name: string, folder: string, mode: Mode | undefined, files: WorkspaceFile[]): string | null {
  const n = name.trim()
  if (n === '') return 'Give the analysis a name.'
  if (!NAME.test(n)) return 'Names use letters, digits, spaces, - _ and . (and start with a letter or digit).'
  if (/\.layout\.json$/i.test(n)) return 'Names ending in .layout.json are reserved for layouts.'
  const path = targetPath(folder, n, mode)
  if (!path) return null
  const f = normFolder(folder)
  const shown = analysisName(path).toLowerCase()
  const clash = files.find(
    (x) => x.path === path || (isAnalysis(x) && x.path.startsWith(ANALYSES_DIR + '/') && analysisFolder(x.path) === f && analysisName(x.path).toLowerCase() === shown),
  )
  if (clash) return f === '' ? `An analysis named “${analysisName(clash.path)}” already exists.` : `An analysis named “${analysisName(clash.path)}” already exists in ${f}/.`
  return null
}

// WizardState is the wizard's choices so far.
export type WizardState = {
  step: Step
  mode: ModeId | null
  cohort: string | null
  name: string
  // The folder under analyses/ ("" = analyses/ itself).
  folder: string
  // Typing a new folder rather than picking one.
  newFolder: boolean
}

export function initialState(files: WorkspaceFile[], asked?: string, lastMode: ModeId | null = null): WizardState {
  return { step: 'mode', mode: lastMode, cohort: initialCohort(files, asked), name: '', folder: '', newFolder: false }
}

// stepError says why the wizard cannot go on from its step, or null.
export function stepError(s: WizardState, files: WorkspaceFile[]): string | null {
  switch (s.step) {
    case 'mode':
      return s.mode ? null : 'Choose a mode.'
    case 'cohort':
      if (allCohorts(files).length === 0) return 'There are no cohorts yet.'
      return s.cohort && allCohorts(files).some((c) => c.path === s.cohort) ? null : 'Choose a cohort.'
    case 'name':
      return folderError(s.folder) ?? nameError(s.name, s.folder, modeById(s.mode), files)
  }
}

export function nextStep(step: Step): Step | null {
  const i = STEPS.findIndex((x) => x.id === step)
  return STEPS[i + 1]?.id ?? null
}

export function prevStep(step: Step): Step | null {
  const i = STEPS.findIndex((x) => x.id === step)
  return i > 0 ? STEPS[i - 1].id : null
}
