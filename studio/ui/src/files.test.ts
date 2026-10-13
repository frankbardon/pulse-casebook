import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from './api.ts'
import { fileBadge, fileLabel, newFilePath } from './files.ts'

const files: WorkspaceFile[] = [
  { path: 'data.pulse', kind: 'cohort' },
  { path: 'out/x.predict.json', kind: 'unopenable', reason: 'sidecar' },
  { path: 'req/01.json', kind: 'request' },
  { path: 'req/02.facet.json', kind: 'facet' },
  { path: 'req/03.json', kind: 'request' },
  { path: 'req/04.compose.json', kind: 'compose' },
  { path: 'imports/orders.import.json', kind: 'import', target: 'orders.pulse', state: 'needs_rebuild' },
  { path: 'schemas/retail.schema.json', kind: 'schema' },
  { path: 'sources/orders.csv', kind: 'source', format: 'csv', size: 10 },
]

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

describe('fileLabel and fileBadge', () => {
  it('shortens sources, schemas and import specs', () => {
    expect(files.map(fileLabel).slice(6)).toEqual(['orders', 'retail', 'orders.csv'])
    expect(fileLabel({ path: 'req/01.json', kind: 'request' })).toBe('req/01.json')
  })

  it('tags import states and imported cohorts', () => {
    expect(fileBadge(files[6])).toEqual({ text: 'needs rebuild', tone: 'warn' })
    expect(fileBadge({ path: 'imports/x.import.json', kind: 'import', state: 'ok' })).toBeNull()
    expect(fileBadge({ path: 'imports/x.import.json', kind: 'import', state: 'invalid' })?.tone).toBe('danger')
    expect(fileBadge({ path: 'x.pulse', kind: 'cohort', spec: 'imports/x.import.json' })?.text).toBe('imported')
    expect(fileBadge({ path: 'x.pulse', kind: 'cohort' })).toBeNull()
  })
})
