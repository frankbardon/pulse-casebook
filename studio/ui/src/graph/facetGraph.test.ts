import { describe, expect, it } from 'vitest'
import type { Manifest, PreviewProbe } from '../api.ts'
import { buildFacetGraph, FACET_NODE, setFacetProp } from './facetGraph.ts'
import { parseJson } from './jsonTree.ts'
import { emitModelText, parseModel } from './model.ts'
import { batches, facetFields, invalidated } from './previews.ts'
import { deletable } from './wiring.ts'
import abFields from './testdata/ab_test.fields.json?raw'
import catalogText from './testdata/catalog.slim.json?raw'
import srm from '../../../../showcase/ab-test-readout/req/02_srm_gof.facet.json?raw'

const fields = JSON.parse(abFields) as { name: string; type: string }[]
const { manifest } = JSON.parse(catalogText) as { manifest: Manifest }

describe('buildFacetGraph', () => {
  it('draws 02_srm_gof as cohort, facet node and overlay', () => {
    const g = buildFacetGraph(JSON.parse(srm), { manifest, cohortFields: fields })
    expect(g.nodes.map((n) => [n.id, n.type])).toEqual([
      ['cohort', 'cohort'],
      ['overlays[0]', 'op'],
      [FACET_NODE, 'facet'],
    ])
    const facet = g.nodes.find((n) => n.id === FACET_NODE)!
    expect(facet.type === 'facet' && facet.data.rows).toEqual([{ key: 'fields[0]', value: 'arm', ref: 'arm', resolved: true }])
    expect(g.edges.find((e) => e.target === FACET_NODE)).toMatchObject({ source: 'cohort', sourceHandle: 'field:arm', targetHandle: 'in:fields[0]' })
    const cohort = g.nodes.find((n) => n.id === 'cohort')!
    expect(cohort.type === 'cohort' && cohort.data.fields.find((f) => f.name === 'arm')?.used).toBe(true)
    expect(g.columns.map((c) => c.key)).toEqual(['source', 'analysis', 'output'])
  })

  it('lists the facet settings and marks unknown fields', () => {
    const doc = { ...JSON.parse(srm), fields: ['arm', 'nope'], discrete_top_k: 5, numeric_percentiles: [0.5, 0.9] }
    const g = buildFacetGraph(doc, { cohortFields: fields })
    const facet = g.nodes.find((n) => n.id === FACET_NODE)!
    if (facet.type !== 'facet') throw new Error('no facet node')
    expect(facet.data.rows.map((r) => [r.key, r.value, r.resolved])).toEqual([
      ['fields[0]', 'arm', true],
      ['fields[1]', 'nope', false],
      ['discrete_top_k', '5', undefined],
      ['numeric_percentiles', '[0.5, 0.9]', undefined],
    ])
  })
})

describe('facet edits', () => {
  it('sets and removes settings losslessly, keeping the rest of the file', () => {
    let m = parseModel(srm)
    expect(m.kind).toBe('facet')
    m = setFacetProp(m, 'discrete_top_k', parseJson('10'))
    m = setFacetProp(m, 'numeric_percentiles', parseJson('[0.10, 0.9]'))
    const text = emitModelText(m)
    expect(text).toContain('"discrete_top_k":10,"numeric_percentiles":[0.10,0.9]')
    expect(text.startsWith(emitModelText(parseModel(srm)).slice(0, -1))).toBe(true)
    m = setFacetProp(m, 'discrete_top_k', undefined)
    expect(emitModelText(m)).not.toContain('discrete_top_k')
    expect(() => setFacetProp(m, 'fields', parseJson('[]'))).toThrow()
    expect(deletable(m, FACET_NODE)).toBe(false)
    expect(deletable(m, 'overlays[0]')).toBe(true)
  })
})

describe('facet previews', () => {
  const g = buildFacetGraph({ ...JSON.parse(srm), filterers: [{ type: 'FILTER_INCLUDE', field: 'arm', values: ['a'] }] }, { cohortFields: fields })
  it('batches the facet node on its own and stales it after a filter edit', () => {
    expect(batches([FACET_NODE, 'cohort', 'filterers[0]'], g.nodes)).toEqual([['cohort'], ['filterers[0]'], [FACET_NODE]])
    const stale = invalidated(['filterers[0]'], g)
    expect(stale.has(FACET_NODE)).toBe(true)
    expect(stale.has('overlays[0]')).toBe(true)
    expect(stale.has('cohort')).toBe(false)
    expect(invalidated(['discrete_top_k'], g).has(FACET_NODE)).toBe(true)
  })

  it('reads a facet result into per-field summaries', () => {
    const probe: PreviewProbe = {
      node: FACET_NODE,
      kind: 'facet',
      facet: {
        spend: { kind: 'numeric', type_name: 'f64', null_count: 2, numeric: { min: 1, max: 9, mean: 4, stddev: 2, count: 10, sum: 40, percentiles: { '0.9': 8, '0.5': 4 }, histogram: { min: 1, max: 9, bins: [1, 3] } } },
        arm: { kind: 'discrete', type_name: 'categorical_u8', null_count: 0, discrete: { values: [{ value: 'b', count: 6 }, { value: 'a', count: 4 }], distinct_count: 2 } },
      },
    }
    const [arm, sp] = facetFields(probe)
    expect(arm).toMatchObject({ name: 'arm', type: 'categorical_u8', discrete: { values: [{ value: 'b', count: 6 }, { value: 'a', count: 4 }], distinct: 2, truncated: 0 } })
    expect(sp.numeric).toMatchObject({ min: 1, max: 9, percentiles: [['0.5', 4], ['0.9', 8]], bins: [1, 3] })
    expect(sp.nulls).toBe(2)
  })
})
