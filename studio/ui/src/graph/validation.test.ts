import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest } from '../api.ts'
import { detectRootKind, parseModel } from './model.ts'
import { parseJson } from './jsonTree.ts'
import { attach, clientIssues, closestOperators, ownerOf, proposal, worst, type Issue } from './validation.ts'
import catalogText from './testdata/catalog.slim.json?raw'
import abFields from './testdata/ab_test.fields.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema?: unknown }
const cohortFields = JSON.parse(abFields) as CohortField[]

const corpus = Object.entries(
  import.meta.glob('../../../../showcase/*/req/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
).map(([path, text]) => [path.replace(/^(\.\.\/)+/, ''), text] as const)

const request = (body: string) =>
  parseModel(`{"cohort": {"filename": "ab_test.pulse", "data_dir": "."}, ${body}}`, 'request')

describe('clientIssues', () => {
  it('flags no errors on the showcase corpus', () => {
    for (const [path, text] of corpus) {
      if (path.endsWith('.layout.json')) continue
      let model
      try {
        model = parseModel(text, detectRootKind(parseJson(text)))
      } catch {
        continue
      }
      const fields = path.includes('ab-test-readout/') ? cohortFields : undefined
      const errors = clientIssues(model, catalog, fields).filter((i) => i.severity === 'error')
      expect(errors, path).toEqual([])
    }
  })

  it('flags an unknown operator and proposes manifest names', () => {
    const issues = clientIssues(request(`"aggregations": [{"type": "AGG_AVERAG", "field": "revenue", "label": "m"}]`), catalog, cohortFields)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ path: 'aggregations[0]', severity: 'error', code: 'UNKNOWN_OPERATOR', current: 'AGG_AVERAG' })
    expect(issues[0].proposed).toContain('AGG_AVERAGE')
  })

  it('flags AGG_NOPE', () => {
    const issues = clientIssues(request(`"aggregations": [{"type": "AGG_NOPE", "field": "revenue", "label": "m"}]`), catalog)
    expect(issues.map((i) => [i.path, i.code])).toEqual([['aggregations[0]', 'UNKNOWN_OPERATOR']])
  })

  it('flags a missing required param', () => {
    const issues = clientIssues(request(`"tests": [{"type": "TEST_PROP_Z", "field": "trial_started", "split_by": "arm"}]`), catalog, cohortFields)
    expect(issues.some((i) => i.path === 'tests[0]' && i.code === 'MISSING_PARAM' && i.message.includes('success'))).toBe(true)
  })

  it('flags a cohort field of a refused type', () => {
    const issues = clientIssues(request(`"tests": [{"type": "TEST_WELCH", "field": "arm", "split_by": "arm"}]`), catalog, cohortFields)
    expect(issues).toContainEqual(expect.objectContaining({ path: 'tests[0].field', code: 'FIELD_TYPE', current: 'arm' }))
  })

  it('checks nothing without a manifest', () => {
    expect(clientIssues(request(`"aggregations": [{"type": "AGG_NOPE"}]`), {})).toEqual([])
  })
})

describe('closestOperators', () => {
  it('ranks by edit distance', () => {
    expect(closestOperators(catalog.manifest, 'tests', 'TEST_WELSH')[0]).toBe('TEST_WELCH')
  })
})

describe('attach', () => {
  const ids = ['cohort', 'filterers[0]', 'aggregations[0]', 'aggregations[1]', 'tests[1]', 'tests[10]']
  const engine = (path: string, severity: Issue['severity'], message: string, extra: Partial<Issue> = {}): Issue => ({
    path,
    severity,
    message,
    source: 'engine',
    ...extra,
  })

  it('attaches an issue to the nearest node prefix', () => {
    expect(ownerOf('aggregations[1].field', ids)).toBe('aggregations[1]')
    expect(ownerOf('tests[10].split_by', ids)).toBe('tests[10]')
    expect(ownerOf('cohort', ids)).toBe('cohort')
    expect(ownerOf('', ids)).toBeUndefined()
    expect(ownerOf('weight', ids)).toBeUndefined()
    expect(ownerOf('not a path', ids)).toBeUndefined()
  })

  it('groups issues and explain text by node, request-level the rest', () => {
    const a = attach(
      ids,
      [],
      [
        engine('aggregations[1].field', 'warning', 'field revenu is not in the schema', { proposed: ['revenue'], current: 'revenu' }),
        engine('aggregations[1].field', 'error', 'aggregation references unknown field: revenu'),
        engine('', 'error', 'request-wide'),
        engine('aggregations[0].type', 'hint', 'forces the buffered path'),
      ],
      [
        { path: 'aggregations[1]', text: 'Aggregation 2 runs AGG_MEAN on `revenu`.' },
        { path: 'filterers[0]', text: 'Filter 1 keeps rows.' },
      ],
    )
    const agg = a.byNode.get('aggregations[1]')!
    expect(agg.issues.map((i) => i.severity)).toEqual(['error', 'warning'])
    expect(agg.explain).toBe('Aggregation 2 runs AGG_MEAN on `revenu`.')
    expect(worst(agg.issues)).toBe('error')
    expect(proposal(agg.issues[1])).toBe('revenue')
    expect(a.byNode.get('filterers[0]')).toEqual({ issues: [], explain: 'Filter 1 keeps rows.' })
    expect(worst(a.byNode.get('aggregations[0]')!.issues)).toBeUndefined()
    expect(a.request.map((i) => i.message)).toEqual(['request-wide'])
  })

  it('drops an engine error repeating a client unknown operator', () => {
    const client: Issue[] = [{ path: 'tests[1]', severity: 'error', code: 'UNKNOWN_OPERATOR', message: 'TEST_NOPE is not an operator the engine knows', current: 'TEST_NOPE', source: 'client' }]
    const a = attach(ids, client, [engine('tests[1]', 'error', 'unknown test type: TEST_NOPE')], [])
    expect(a.byNode.get('tests[1]')!.issues).toHaveLength(1)
  })
})
