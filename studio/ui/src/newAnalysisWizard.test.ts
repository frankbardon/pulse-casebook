import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceFile } from './api.ts'
import { MODES } from './modes.ts'
import {
  cohortGroups,
  cohortLabel,
  folderError,
  folderOptions,
  initialCohort,
  initialState,
  loadLastMode,
  MODE_GUIDE,
  modeById,
  nameError,
  nextStep,
  prevStep,
  saveLastMode,
  stepError,
  targetPath,
} from './newAnalysisWizard.ts'

const files: WorkspaceFile[] = [
  { path: 'analyses/readout.compose.json', kind: 'compose' },
  { path: 'analyses/base.json', kind: 'request' },
  { path: 'analyses/q1/deep/summary.facet.json', kind: 'facet' },
  { path: 'analyses/q1/steps.json', kind: 'chain' },
  { path: 'analyses/base.layout.json', kind: 'unopenable' },
  { path: 'cohorts/sales.pulse', kind: 'cohort' },
  { path: 'cohorts/ab_test.pulse', kind: 'cohort' },
  { path: '_global/cohorts/design.pulse', kind: 'cohort', scope: 'global' },
  { path: 'schemas/x.schema.json', kind: 'schema' },
]
const standalone = modeById('standalone')
const composed = modeById('composed')

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('mode guide', () => {
  it('explains every mode', () => {
    for (const m of MODES) {
      const g = MODE_GUIDE[m.id]
      for (const v of [g.reads, g.returns, g.runs, g.example]) expect(v.length).toBeGreaterThan(10)
    }
  })
})

describe('last mode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is remembered, and only a known mode comes back', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadLastMode()).toBeNull()
    saveLastMode('chained')
    expect(loadLastMode()).toBe('chained')
    localStorage.setItem('studio.newAnalysis.mode', 'bogus')
    expect(loadLastMode()).toBeNull()
  })

  it('survives throwing storage', () => {
    const boom = () => {
      throw new Error('denied')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom })
    expect(() => saveLastMode('faceted')).not.toThrow()
    expect(loadLastMode()).toBeNull()
  })
})

describe('cohorts', () => {
  it('groups this workspace first, then global, sorted, with search', () => {
    const g = cohortGroups(files, '')
    expect(g.map((x) => [x.scope, x.cohorts.map((c) => c.path)])).toEqual([
      ['local', ['cohorts/ab_test.pulse', 'cohorts/sales.pulse']],
      ['global', ['_global/cohorts/design.pulse']],
    ])
    expect(cohortGroups(files, 'DES').map((x) => x.scope)).toEqual(['global'])
    expect(cohortGroups(files, 'nothing')).toEqual([])
    expect(cohortLabel('_global/cohorts/design.pulse')).toBe('design')
  })

  it('starts on the asked cohort, else the first own, else the first global', () => {
    expect(initialCohort(files, '_global/cohorts/design.pulse')).toBe('_global/cohorts/design.pulse')
    expect(initialCohort(files, 'cohorts/gone.pulse')).toBe('cohorts/ab_test.pulse')
    expect(initialCohort(files.filter((f) => f.scope === 'global'))).toBe('_global/cohorts/design.pulse')
    expect(initialCohort([])).toBeNull()
  })
})

describe('folders and names', () => {
  it('offers analyses/ and every folder holding analyses', () => {
    expect(folderOptions(files)).toEqual(['', 'q1', 'q1/deep'])
  })

  it('validates folders', () => {
    expect(folderError('')).toBeNull()
    expect(folderError('q2/north')).toBeNull()
    expect(folderError('/q2/')).toBeNull()
    expect(folderError('../out')).not.toBeNull()
    expect(folderError('a//b')).not.toBeNull()
    expect(folderError('bad name')).not.toBeNull()
  })

  it('builds the target path with the mode suffix', () => {
    expect(targetPath('', 'readout', composed)).toBe('analyses/readout.compose.json')
    expect(targetPath('q1/', 'x', modeById('faceted'))).toBe('analyses/q1/x.facet.json')
    expect(targetPath('', 'x', modeById('chained'))).toBe('analyses/x.json')
    expect(targetPath('', '', standalone)).toBeNull()
    expect(targetPath('..', 'x', standalone)).toBeNull()
    expect(targetPath('', 'x', undefined)).toBeNull()
  })

  it('requires a valid name, unique in its folder whatever the mode', () => {
    expect(nameError('', '', standalone, files)).toMatch(/name/)
    expect(nameError('a/b', '', standalone, files)).toMatch(/letters/)
    expect(nameError('x.layout.json', '', standalone, files)).toMatch(/reserved/)
    expect(nameError('fresh one', '', standalone, files)).toBeNull()
    // readout.compose.json lists as "readout": a standalone "readout" clashes.
    expect(nameError('readout', '', standalone, files)).toMatch(/already exists/)
    expect(nameError('Base', '', composed, files)).toMatch(/already exists/)
    expect(nameError('steps', 'q1', standalone, files)).toMatch(/in q1\//)
    expect(nameError('steps', '', standalone, files)).toBeNull()
    expect(nameError('summary', 'q1', standalone, files)).toBeNull()
  })
})

describe('steps', () => {
  it('walks mode → cohort → name and blocks until each is complete', () => {
    let s = initialState(files, undefined, null)
    expect(s).toMatchObject({ step: 'mode', mode: null, cohort: 'cohorts/ab_test.pulse', folder: '' })
    expect(stepError(s, files)).toMatch(/mode/)
    s = { ...s, mode: 'composed' }
    expect(stepError(s, files)).toBeNull()
    s = { ...s, step: nextStep(s.step)! }
    expect(s.step).toBe('cohort')
    expect(stepError({ ...s, cohort: 'cohorts/gone.pulse' }, files)).toMatch(/cohort/)
    expect(stepError(s, [])).toMatch(/no cohorts/)
    expect(stepError(s, files)).toBeNull()
    s = { ...s, step: nextStep(s.step)! }
    expect(s.step).toBe('name')
    expect(stepError(s, files)).toMatch(/name/)
    expect(stepError({ ...s, name: 'new_one', folder: 'bad folder', newFolder: true }, files)).toMatch(/Folder/)
    expect(stepError({ ...s, name: 'new_one' }, files)).toBeNull()
    expect(nextStep('name')).toBeNull()
    expect(prevStep('name')).toBe('cohort')
    expect(prevStep('mode')).toBeNull()
  })

  it('starts on the remembered mode', () => {
    expect(initialState(files, undefined, 'faceted').mode).toBe('faceted')
  })
})
