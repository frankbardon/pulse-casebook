import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from './api.ts'
import { analysisFolder, analysisName, filterAnalyses, groupByFolder, isAnalysis, modeCounts, modeLabel, modeOf, MODES } from './modes.ts'

const files: WorkspaceFile[] = [
  { path: 'analyses/readout.compose.json', kind: 'compose' },
  { path: 'analyses/srm.facet.json', kind: 'facet' },
  { path: 'analyses/q1/retention.json', kind: 'chain' },
  { path: 'analyses/q1/arms.json', kind: 'request' },
  { path: 'analyses/a.layout.json', kind: 'unopenable' },
  { path: 'cohorts/ab.pulse', kind: 'cohort' },
  { path: '_global/cohorts/g.pulse', kind: 'cohort', scope: 'global' },
]

describe('modes', () => {
  it('names the four roots with the approved table', () => {
    expect(MODES.map((m) => [m.root, m.label, m.runs])).toEqual([
      ['request', 'Standalone', 'one cohort, one pass, one result'],
      ['compose', 'Composed', 'several standalone runs together, results side by side'],
      ['facet', 'Faceted', 'summaries of the chosen fields'],
      ['chain', 'Chained', "steps, each reading the previous step's result table"],
    ])
    expect(modeLabel('compose')).toBe('Composed')
    expect(modeLabel('cohort')).toBe('cohort')
    expect(modeOf('chain')?.id).toBe('chained')
    expect(files.filter(isAnalysis).map((f) => f.kind)).toEqual(['compose', 'facet', 'chain', 'request'])
  })

  it('lists analyses by name and folder', () => {
    expect(analysisName('analyses/readout.compose.json')).toBe('readout')
    expect(analysisName('analyses/q1/retention.json')).toBe('retention')
    expect(analysisName('x.FACET.json')).toBe('x')
    expect(analysisFolder('analyses/q1/retention.json')).toBe('q1')
    expect(analysisFolder('analyses/readout.compose.json')).toBe('')
    expect(analysisFolder('case/req/a.json')).toBe('case/req')
  })
})

describe('filterAnalyses', () => {
  it('filters by mode and by every search term (name or folder)', () => {
    const paths = (q: string, m: Parameters<typeof filterAnalyses>[2]) => filterAnalyses(files, q, m).map((f) => f.path)
    expect(paths('', 'all')).toHaveLength(4)
    expect(paths('', 'composed')).toEqual(['analyses/readout.compose.json'])
    expect(paths('Q1', 'all')).toEqual(['analyses/q1/retention.json', 'analyses/q1/arms.json'])
    expect(paths('q1 ret', 'all')).toEqual(['analyses/q1/retention.json'])
    expect(paths('q1', 'faceted')).toEqual([])
    expect(paths('ab', 'all')).toEqual([])
  })

  it('counts per mode', () => {
    expect(modeCounts(files)).toEqual({ standalone: 1, composed: 1, faceted: 1, chained: 1 })
  })
})

describe('groupByFolder', () => {
  it('puts the top level first, folders sorted, files by name', () => {
    const g = groupByFolder(files.filter(isAnalysis))
    expect(g.map((x) => x.folder)).toEqual(['', 'q1'])
    expect(g[0].files.map((f) => f.path)).toEqual(['analyses/readout.compose.json', 'analyses/srm.facet.json'])
    expect(g[1].files.map((f) => f.path)).toEqual(['analyses/q1/arms.json', 'analyses/q1/retention.json'])
    expect(groupByFolder([])).toEqual([])
  })
})
