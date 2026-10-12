import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from './api.ts'
import { groupFiles, isOpenable } from './files.ts'

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
