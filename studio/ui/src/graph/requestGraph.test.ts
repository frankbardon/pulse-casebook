import { describe, expect, it } from 'vitest'
import type { Manifest } from '../api.ts'
import { buildRequestGraph, type GraphNode, type OpNode } from './requestGraph.ts'
import abFields from './testdata/ab_test.fields.json?raw'
import metricBattery from '../../../../showcase/ab-test-readout/req/04_metric_battery.json?raw'
import cupedWelch from '../../../../showcase/ab-test-readout/req/08_cuped_welch.json?raw'
import holdoutDeciles from '../../../../showcase/credit-risk-model/req/13_holdout_deciles.json?raw'

const fields = JSON.parse(abFields) as { name: string; type: string }[]

// A slim manifest with the operators the ab-test fixtures use (TEST_WELCH
// deliberately missing to show the unknown-operator flag).
const manifest: Manifest = {
  components: {
    aggregators: [{ name: 'AGG_COUNT' }],
    attributes: [{ name: 'ATTR_FORMULA' }],
  },
  tests: [{ name: 'TEST_PROP_Z' }],
}

function op(nodes: GraphNode[], id: string): OpNode {
  const n = nodes.find((x) => x.id === id)
  if (!n || n.type !== 'op') throw new Error(`no op node ${id}`)
  return n
}

describe('buildRequestGraph', () => {
  it('maps 04_metric_battery', () => {
    const g = buildRequestGraph(JSON.parse(metricBattery), { manifest, cohortFields: fields })
    expect(g.columns.map((c) => c.title)).toEqual(['Cohort', 'Aggregate', 'Analysis', 'Output'])
    expect(op(g.nodes, 'tests[2]').data).toMatchObject({ op: 'TEST_WELCH', opKnown: false, name: 'revenue_per_user' })
    expect(op(g.nodes, 'tests[0]').data.opKnown).toBe(true)
    // Every test wires field and split_by from the cohort.
    expect(g.edges.filter((e) => e.target.startsWith('tests[')).length).toBe(12)
    expect(g).toMatchSnapshot()
  })

  it('maps 08_cuped_welch with a label wire from the attribute', () => {
    const g = buildRequestGraph(JSON.parse(cupedWelch), { manifest, cohortFields: fields })
    const e = g.edges.find((x) => x.target === 'tests[1]' && x.targetHandle === 'in:field')
    expect(e).toMatchObject({ source: 'attributes[0]', sourceHandle: 'out' })
    const raw = g.edges.find((x) => x.target === 'tests[0]' && x.targetHandle === 'in:field')
    expect(raw).toMatchObject({ source: 'cohort', sourceHandle: 'field:pages_viewed' })
    expect(g).toMatchSnapshot()
  })

  it('maps 13_holdout_deciles without inspect data', () => {
    const g = buildRequestGraph(JSON.parse(holdoutDeciles))
    const cohort = g.nodes.find((n) => n.id === 'cohort')!
    expect(cohort.type).toBe('cohort')
    expect(g).toMatchSnapshot()
  })

  it('is deterministic', () => {
    const a = buildRequestGraph(JSON.parse(holdoutDeciles))
    const b = buildRequestGraph(JSON.parse(holdoutDeciles))
    expect(a).toEqual(b)
  })

  it('places columns in stage order regardless of key order', () => {
    const g = buildRequestGraph({
      sort: [{ field: 'n' }],
      aggregations: [{ type: 'AGG_COUNT', field: 'x', label: 'n' }],
      filterers: [{ type: 'FILTER_INCLUDE', field: 'x', values: ['a'] }],
      cohort: { filename: 'c.pulse' },
    })
    expect(g.columns.map((c) => c.key)).toEqual(['source', 'filterers', 'aggregations', 'sort'])
    const xs = ['filterers[0]', 'aggregations[0]', 'sort[0]'].map((id) => g.nodes.find((n) => n.id === id)!.position.x)
    expect(xs).toEqual([...xs].sort((p, q) => p - q))
    expect(g.edges.find((e) => e.target === 'sort[0]')?.source).toBe('aggregations[0]')
  })

  it('renders unmodeled sections as raw nodes keyed by path', () => {
    const g = buildRequestGraph({
      cohort: { filename: 'c.pulse' },
      weight: { field: 'w', kind: 'probability' },
      joins: [{ right: 'r.pulse' }],
      tests: 'not-an-array',
    })
    const raws = g.nodes.filter((n) => n.type === 'raw').map((n) => n.id)
    expect(raws).toEqual(['weight', 'joins', 'tests'])
  })

  it('does not wire a label to entries before it', () => {
    const g = buildRequestGraph(
      {
        attributes: [
          { type: 'ATTR_FORMULA', field: 'later', label: 'early' },
          { type: 'ATTR_FORMULA', field: 'x', label: 'later' },
        ],
      },
      { cohortFields: [{ name: 'x', type: 'f64' }] },
    )
    const row = op(g.nodes, 'attributes[0]').data.rows.find((r) => r.key === 'field')!
    expect(row.resolved).toBe(false)
    expect(g.edges.some((e) => e.target === 'attributes[0]')).toBe(false)
  })

  it('wires one-hot feature columns by label prefix and matrices to vectors', () => {
    const g = buildRequestGraph(
      {
        features: [{ type: 'FEAT_ONE_HOT', field: 'band', label: 'band' }],
        vectors: [{ name: 'v', fields: ['x', 'band_A'] }],
        matrices: [{ type: 'MAT_CORRELATION', name: 'm', vector: 'v' }],
      },
      { cohortFields: [{ name: 'x', type: 'f64' }, { name: 'band', type: 'categorical_u8' }] },
    )
    const into = (t: string, h: string) => g.edges.find((e) => e.target === t && e.targetHandle === h)?.source
    expect(into('vectors[0]', 'in:fields[0]')).toBe('cohort')
    expect(into('vectors[0]', 'in:fields[1]')).toBe('features[0]')
    expect(into('matrices[0]', 'in:vector')).toBe('vectors[0]')
  })

  it('prefixes ids with basePath', () => {
    const g = buildRequestGraph({ tests: [{ type: 'TEST_WELCH', field: 'x', split_by: 'g' }] }, { basePath: ['requests', 1] })
    expect(g.nodes.map((n) => n.id)).toEqual(['requests[1].cohort', 'requests[1].tests[0]'])
    expect(g.edges.every((e) => e.source === 'requests[1].cohort')).toBe(true)
  })
})
