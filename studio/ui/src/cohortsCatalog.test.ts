import { describe, expect, it } from 'vitest'
import type { CatalogEntry, Workspace } from './api.ts'
import { areaOf, canMakeGlobal, catalogCounts, entryKey, sectionsOf, workspaceName } from './cohortsCatalog.ts'

const workspaces: Workspace[] = [
  { slug: 'lab', name: 'Lab' },
  { slug: 'sales', name: 'Sales 2026' },
]

const g = (name: string): CatalogEntry => ({ path: `cohorts/${name}.pulse`, name, scope: 'global', ref_path: `_global/cohorts/${name}.pulse` })
const l = (ws: string, name: string, path = `cohorts/${name}.pulse`): CatalogEntry => ({ path, name, scope: 'local', workspace: ws, ref_path: path })

const cohorts = [g('orders'), g('ab'), l('lab', 'orders'), l('sales', 'leads'), l('ghost', 'x'), l('lab', 'nested', 'data/nested.pulse')]

describe('sectionsOf', () => {
  it('puts Global first, then each workspace by name, local ones tagged', () => {
    const s = sectionsOf(cohorts, workspaces, 'all')
    expect(s.map((x) => [x.scope, x.id, x.title, x.entries.length])).toEqual([
      ['global', 'global', 'Global', 2],
      ['local', 'lab', 'Lab', 2],
      ['local', 'sales', 'Sales 2026', 1],
      ['local', 'ghost', 'ghost', 1],
    ])
  })

  it('filters by scope and query', () => {
    expect(sectionsOf(cohorts, workspaces, 'global').map((x) => x.id)).toEqual(['global'])
    expect(sectionsOf(cohorts, workspaces, 'local').map((x) => x.id)).toEqual(['lab', 'sales', 'ghost'])
    const q = sectionsOf(cohorts, workspaces, 'all', 'ORD')
    expect(q.map((x) => [x.id, x.entries.map((e) => e.name)])).toEqual([
      ['global', ['orders']],
      ['lab', ['orders']],
    ])
    expect(sectionsOf(cohorts, workspaces, 'all', 'data/')).toHaveLength(1)
    expect(sectionsOf([], workspaces, 'all')).toEqual([])
  })
})

describe('areas and keys', () => {
  it('maps entries to their API area', () => {
    expect(areaOf(g('ab'))).toBe('_global')
    expect(areaOf(l('lab', 'x'))).toBe('lab')
    expect(entryKey('cohort', g('orders'))).not.toBe(entryKey('cohort', l('lab', 'orders')))
    expect(workspaceName('sales', workspaces)).toBe('Sales 2026')
    expect(workspaceName('nope', workspaces)).toBe('nope')
  })

  it('counts cohorts and schemas per scope', () => {
    expect(catalogCounts({ cohorts, schemas: [{ ...g('s'), path: 'schemas/s.schema.json' }], imports: [], sources: [] })).toEqual({ global: 3, local: 4 })
  })
})

describe('canMakeGlobal', () => {
  it('only offers local cohorts under cohorts/ and local schemas; never global → local', () => {
    expect(canMakeGlobal('cohort', l('lab', 'orders'))).toBe(true)
    expect(canMakeGlobal('cohort', l('lab', 'nested', 'data/nested.pulse'))).toBe(false)
    expect(canMakeGlobal('cohort', g('orders'))).toBe(false)
    expect(canMakeGlobal('schema', { ...l('lab', 's'), path: 'schemas/s.schema.json' })).toBe(true)
    expect(canMakeGlobal('schema', { ...g('s'), path: 'schemas/s.schema.json' })).toBe(false)
    expect(canMakeGlobal('import', l('lab', 'x'))).toBe(false)
  })
})
