import { describe, expect, it } from 'vitest'
import type { PreviewResult } from '../api.ts'
import { fromPlain, parseJson, toPlain } from './jsonTree.ts'
import { emitModel, parseModel, updateNode, type GraphModel } from './model.ts'
import { batches, changedIds, fingerprints, fmtCount, fmtNum, fmtPct, headlines, invalidated, tableSummary } from './previews.ts'
import { buildRequestGraph } from './requestGraph.ts'
import { land } from './usePreviews.ts'

const REQ = `{
  "cohort": {"filename": "c.pulse"},
  "features": [{"type": "FEAT_LOG", "field": "spend", "label": "log_spend"}],
  "filterers": [
    {"type": "FILTER_NULL", "field": "age", "values": ["is_not_null"]},
    {"type": "FILTER_RANGE", "field": "age", "params": {"min": 18}}
  ],
  "attributes": [
    {"type": "ATTR_FORMULA", "field": "spend", "label": "spend2", "expression": "spend * 2"},
    {"type": "ATTR_FORMULA", "field": "spend2", "label": "spend4", "expression": "spend2 * 2"}
  ],
  "groups": [{"type": "GROUP_CATEGORY", "field": "region"}],
  "aggregations": [{"type": "AGG_AVERAGE", "field": "spend4", "label": "avg"}],
  "tests": [
    {"type": "TEST_WELCH", "field": "spend", "split_by": "arm", "label": "t0"},
    {"type": "TEST_WELCH", "field": "spend2", "split_by": "arm", "label": "t1"}
  ],
  "regressions": [
    {"type": "REG_OLS", "name": "r0", "target": "spend", "predictors": ["age"]},
    {"type": "REG_OLS", "name": "r1", "target": "spend", "predictors": ["age"]}
  ],
  "multiplicity": {"method": "holm"},
  "return": {"include": ["data"]}
}`

const FIELDS = ['spend', 'age', 'region', 'arm'].map((name) => ({ name, type: 'f64' }))

function graphOf(m: GraphModel) {
  return buildRequestGraph(toPlain(emitModel(m)), { cohortFields: FIELDS })
}

// edit replaces one node's value via the lossless model and returns the
// ids the change invalidates.
function staleAfter(id: string, patch: (v: Record<string, unknown>) => unknown): string[] {
  const m = parseModel(REQ, 'request')
  const before = fingerprints(m)
  const plain = toPlain(m.nodes.get(id)!.value) as Record<string, unknown>
  const next = updateNode(m, id, fromPlain(patch(plain)))
  const changed = changedIds(before, fingerprints(next))
  expect([...changed]).toEqual([id])
  return [...invalidated(changed, graphOf(next))].sort()
}

describe('invalidated', () => {
  it('editing a filter stales it, later filters and later stages only', () => {
    const stale = staleAfter('filterers[1]', (v) => ({ ...v, params: { min: 21 } }))
    expect(stale).toContain('filterers[1]')
    expect(stale).not.toContain('filterers[0]')
    expect(stale).not.toContain('features[0]')
    expect(stale).not.toContain('cohort')
    expect(stale).toEqual(
      expect.arrayContaining(['attributes[0]', 'attributes[1]', 'groups[0]', 'aggregations[0]', 'tests[0]', 'tests[1]', 'regressions[0]', 'multiplicity']),
    )
  })

  it('the first filter stales the second', () => {
    const stale = staleAfter('filterers[0]', (v) => ({ ...v, values: ['is_null'] }))
    expect(stale).toEqual(expect.arrayContaining(['filterers[0]', 'filterers[1]']))
    expect(stale).not.toContain('features[0]')
  })

  it('an attribute does not stale filters or earlier attributes', () => {
    const stale = staleAfter('attributes[1]', (v) => ({ ...v, expression: 'spend2 * 4' }))
    expect(stale).not.toContain('attributes[0]')
    expect(stale).not.toContain('filterers[0]')
    expect(stale).toEqual(expect.arrayContaining(['attributes[1]', 'aggregations[0]', 'tests[0]']))
  })

  it('a test stales its whole multiplicity family but not regressions', () => {
    const stale = staleAfter('tests[1]', (v) => ({ ...v, split_by: 'region' }))
    expect(stale).toEqual(expect.arrayContaining(['tests[0]', 'tests[1]']))
    expect(stale).not.toContain('regressions[0]')
    expect(stale).not.toContain('aggregations[0]')
  })

  it('regressions are independent of their siblings', () => {
    const stale = staleAfter('regressions[0]', (v) => ({ ...v, target: 'age' }))
    expect(stale).toContain('regressions[0]')
    expect(stale).not.toContain('regressions[1]')
    expect(stale).not.toContain('tests[0]')
  })

  it('multiplicity stales the tests', () => {
    const stale = staleAfter('multiplicity', () => ({ method: 'bh' }))
    expect(stale).toEqual(['tests[0]', 'tests[1]'])
  })

  it('return stales nothing that previews', () => {
    expect(staleAfter('return', () => ({ include: ['tests'] }))).toEqual(['return'])
  })

  it('the cohort stales every node', () => {
    const m = parseModel(REQ, 'request')
    const g = graphOf(m)
    expect(invalidated(['cohort'], g).size).toBe(g.nodes.length)
  })

  it('follows wires out of the edited node, whatever the column', () => {
    // A synthetic wire from a regression back to a filter column node:
    // edges are followed regardless of column.
    const m = parseModel(REQ, 'request')
    const g = graphOf(m)
    const edges = [...g.edges, { id: 'x', source: 'regressions[1]', target: 'filterers[0]' }]
    const stale = invalidated(['regressions[1]'], { nodes: g.nodes, edges })
    expect(stale).toContain('filterers[0]')
    expect(stale).not.toContain('filterers[1]')
    expect(stale).not.toContain('regressions[0]')
  })

  it('a removed entry stales what came after it', () => {
    const m = parseModel(REQ, 'request')
    const before = fingerprints(m)
    const doc = toPlain(emitModel(m)) as Record<string, unknown[]>
    doc.filterers = doc.filterers.slice(0, 1)
    const next = parseModel(JSON.stringify(doc), 'request')
    const changed = changedIds(before, fingerprints(next))
    expect([...changed]).toEqual(['filterers[1]'])
    const stale = invalidated(changed, graphOf(next))
    expect(stale.has('filterers[0]')).toBe(false)
    expect(stale.has('attributes[0]')).toBe(true)
  })

  it('a top-level context key such as weight stales everything', () => {
    const m = parseModel(REQ.replace('"cohort"', '"weight": {"field": "w"}, "cohort"'), 'request')
    const g = graphOf(m)
    const next = updateNode(m, 'weight', parseJson('{"field":"w2"}'))
    expect(invalidated(changedIds(fingerprints(m), fingerprints(next)), g).size).toBe(g.nodes.length)
  })
})

describe('batches', () => {
  it('groups previewable nodes by section in pipeline order', () => {
    const g = graphOf(parseModel(REQ, 'request'))
    const all = g.nodes.map((n) => n.id).reverse()
    expect(batches(all, g.nodes)).toEqual([
      ['cohort'],
      ['features[0]'],
      ['filterers[0]', 'filterers[1]'],
      ['attributes[0]', 'attributes[1]'],
      ['groups[0]'],
      ['aggregations[0]'],
      ['tests[0]', 'tests[1]'],
      ['regressions[0]', 'regressions[1]'],
    ])
  })

  it('skips nodes without a probe', () => {
    const g = graphOf(parseModel(REQ, 'request'))
    expect(batches(['multiplicity', 'return', 'tests[1]'], g.nodes)).toEqual([['tests[1]']])
  })
})

describe('land', () => {
  const res = (over: Partial<PreviewResult>): PreviewResult => ({ status: 'ok', verb: 'process', cost: 'cheap', probes: [], elapsed_ms: 1, ...over })

  it('applies results only to nodes still current', () => {
    const out = land(
      new Map(),
      ['filterers[0]', 'filterers[1]'],
      res({ probes: [
        { node: 'filterers[0]', kind: 'filter', filter: { n_in: 10, n_out: 5, n_null_input: 0 } },
        { node: 'filterers[1]', kind: 'filter', filter: { n_in: 5, n_out: 4, n_null_input: 0 } },
      ] }),
      (id) => id === 'filterers[1]',
    )
    expect(out.has('filterers[0]')).toBe(false)
    expect(out.get('filterers[1]')).toMatchObject({ status: 'ok' })
  })

  it('maps deferred, timed out and cancelled statuses', () => {
    const d = land(new Map(), ['tests[0]'], res({ status: 'deferred', record_count: 1_200_000, probes: [{ node: 'tests[0]', kind: 'test', reason: 'expensive' }] }), () => true)
    expect(d.get('tests[0]')).toEqual({ status: 'deferred', reason: 'expensive', rows: 1_200_000 })
    expect(land(new Map(), ['a'], res({ status: 'timed_out' }), () => true).get('a')).toEqual({ status: 'timed_out' })
    expect(land(new Map(), ['a'], res({ status: 'cancelled' }), () => true).get('a')).toEqual({ status: 'cancelled' })
  })

  it('keeps the deferred parts of a cheapened probe', () => {
    const out = land(new Map(), ['attributes[0]'], res({ deferred: ['quantiles'], probes: [{ node: 'attributes[0]', kind: 'attribute', stats: { n: 3 } }] }), () => true)
    expect(out.get('attributes[0]')).toMatchObject({ status: 'ok', deferred: ['quantiles'] })
  })
})

describe('formatting', () => {
  it('formats counts, measures and percentages', () => {
    expect(fmtCount(40000)).toBe('40,000')
    expect(fmtCount(1_234_567)).toBe('1.23M')
    expect(fmtNum(8.07225599750017)).toBe('8.072')
    expect(fmtNum(0.00012)).toBe('1.2e-4')
    expect(fmtNum(null)).toBe('–')
    expect(fmtPct(4818, 6000)).toBe('80.3%')
    expect(fmtPct(6000, 6000)).toBe('100%')
  })

  it('picks test and regression headlines', () => {
    expect(headlines({ node: 't', kind: 'test', result: { p_value: 0.01714, statistic: 2.3836, df: 3, details: { diff: 0.0938 } } })).toEqual([
      { k: 'p', v: '0.0171' },
      { k: 'stat', v: '2.38' },
      { k: 'diff', v: '0.0938' },
    ])
    expect(headlines({ node: 'r', kind: 'regression', result: { r2: 0.00014, n_obs: 40000, coefficients: { '(intercept)': 8, is_variant: 0.0938 } } })).toEqual([
      { k: 'r²', v: '1.4e-4' },
      { k: 'n', v: '40,000' },
      { k: 'is_variant', v: '0.0938' },
    ])
  })

  it('summarizes tables by label', () => {
    const probe = { node: 'a', kind: 'aggregation', table: { rows: [{ nps: -5.01, wave: 'W1' }, { nps: 0.95, wave: 'W2' }], total_rows: 2 } }
    expect(tableSummary(probe, 'nps')).toEqual({ count: '2 rows', detail: 'nps -5.01…0.95' })
    const group = { node: 'g', kind: 'group', table: { rows: [{ __probe0_n: 3, wave: 'W1' }], total_rows: 1 } }
    expect(tableSummary(group, undefined)).toEqual({ count: '1 group', detail: 'W1' })
  })
})
