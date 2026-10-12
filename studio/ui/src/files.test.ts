import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from './api.ts'
import { defaultNewDir, groupFiles, isOpenable, newFilePath } from './files.ts'

const files: WorkspaceFile[] = [
  { path: 'data.pulse', kind: 'cohort' },
  { path: 'out/x.predict.json', kind: 'unopenable', reason: 'sidecar' },
  { path: 'req/01.json', kind: 'request' },
  { path: 'req/02.facet.json', kind: 'facet' },
  { path: 'req/03.json', kind: 'request' },
  { path: 'req/04.compose.json', kind: 'compose' },
]

describe('groupFiles', () => {
  it('groups by kind in sidebar order and drops empty groups', () => {
    const groups = groupFiles(files)
    expect(groups.map((g) => g.kind)).toEqual(['request', 'compose', 'facet', 'cohort', 'unopenable'])
    expect(groups[0].files.map((f) => f.path)).toEqual(['req/01.json', 'req/03.json'])
  })

  it('returns nothing for an empty listing', () => {
    expect(groupFiles([])).toEqual([])
  })
})

describe('isOpenable', () => {
  it.each([
    ['request', true],
    ['compose', true],
    ['cohort', true],
    ['unopenable', false],
  ] as const)('%s -> %s', (kind, want) => {
    expect(isOpenable({ path: 'x', kind })).toBe(want)
  })
})

describe('newFilePath', () => {
  it('adds the root suffix unless the name is already .json', () => {
    expect(newFilePath('case/req', 'readout', 'request')).toBe('case/req/readout.json')
    expect(newFilePath('case/req', 'readout', 'compose')).toBe('case/req/readout.compose.json')
    expect(newFilePath('case/req', 'srm', 'facet')).toBe('case/req/srm.facet.json')
    expect(newFilePath('case/req', 'roll', 'chain')).toBe('case/req/roll.json')
    expect(newFilePath('', 'x.JSON', 'compose')).toBe('x.JSON')
  })
  it('refuses empty names and names leaving the directory', () => {
    expect(newFilePath('req', '  ', 'request')).toBeNull()
    expect(newFilePath('req', '../x', 'request')).toBeNull()
    expect(newFilePath('req', '..', 'request')).toBeNull()
  })
})

describe('defaultNewDir', () => {
  it('prefers the req/ directory beside the cohort', () => {
    expect(defaultNewDir('data.pulse', files)).toBe('req')
    expect(defaultNewDir('case/c.pulse', files)).toBe('case')
    expect(defaultNewDir('case/c.pulse', [{ path: 'case/req/a.json', kind: 'request' }])).toBe('case/req')
  })
})
