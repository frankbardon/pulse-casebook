// Compose lanes reuse wiring, previews and the palette per lane: wires
// stay inside a lane, fits bind across lanes, previews invalidate and
// batch per lane, and palette placement goes into the lane's request.
import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest } from '../api.ts'
import { buildComposeGraph } from './composeGraph.ts'
import { toPlain } from './jsonTree.ts'
import { emitModel, emitModelText, parseModel, type GraphModel } from './model.ts'
import { paletteItems, placeNode } from './palette.ts'
import { batches, changedIds, fingerprints, invalidated } from './previews.ts'
import { checkConnection, connectWire, disconnectWire } from './wiring.ts'
import { renameLane } from './lanes.ts'
import { frameOf } from './nodePath.ts'
import abFields from './testdata/ab_test.fields.json?raw'
import catalogText from './testdata/catalog.slim.json?raw'
import fitsCompose from './testdata/fits.compose.json?raw'
import readout from '../../../../showcase/ab-test-readout/req/11_readout.compose.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema: unknown }
const manifest = catalog.manifest
const cohortFields = JSON.parse(abFields) as CohortField[]
const ctx = { manifest, cohortFields }
const graphOf = (m: GraphModel) => buildComposeGraph(toPlain(emitModel(m)), { manifest, fieldsFor: () => cohortFields })

describe('compose wiring', () => {
  const m = parseModel(fitsCompose)
  const g = graphOf(m)

  it('keeps wires inside a lane', () => {
    const own = checkConnection(g, { source: 'requests[1].cohort', sourceHandle: 'field:revenue', target: 'requests[1].aggregations[0]', targetHandle: 'in:field' }, ctx)
    expect(own).toMatchObject({ ok: true, ref: 'revenue' })
    const cross = checkConnection(g, { source: 'requests[0].cohort', sourceHandle: 'field:revenue', target: 'requests[1].aggregations[0]', targetHandle: 'in:field' }, ctx)
    expect(cross).toMatchObject({ ok: false })
    const label = checkConnection(g, { source: 'requests[0].attributes[1]', sourceHandle: 'out', target: 'requests[1].aggregations[0]', targetHandle: 'in:field' }, ctx)
    expect(label).toMatchObject({ ok: false })
  })

  it('binds a fit into a slot fit input, and only there', () => {
    const w = { source: 'fits[0].request.regressions[0]', sourceHandle: 'fit', target: 'requests[1].attributes[0]', targetHandle: 'in:params.fit' }
    const r = checkConnection(g, w, ctx)
    expect(r).toEqual({ ok: true, ref: 'pages_model', rowKey: 'params.fit' })
    expect(checkConnection(g, { ...w, targetHandle: 'in:field', target: 'requests[1].aggregations[0]' }, ctx).ok).toBe(false)
    expect(checkConnection(g, { ...w, source: 'requests[1].cohort', sourceHandle: 'field:revenue' }, ctx).ok).toBe(false)
    // Drawing it writes the name; the graph then shows the binding.
    const bound = connectWire(m, 'requests[1].attributes[0]', 'params.fit', 'pages_model')
    expect(JSON.parse(emitModelText(bound)).requests[1].attributes[0]).toEqual({ type: 'ATTR_REG_PREDICT', label: 'pred', params: { fit: 'pages_model' } })
    expect(graphOf(bound).edges.filter((e) => e.data?.role === 'fit').map((e) => e.target)).toEqual([
      'requests[0].attributes[0]',
      'requests[1].attributes[0]',
    ])
    // Deleting the binding clears the param.
    const unbound = disconnectWire(bound, 'requests[0].attributes[0]', 'params.fit')
    expect(JSON.parse(emitModelText(unbound)).requests[0].attributes[0].params).toBeUndefined()
    // Renaming the fit keeps its bindings.
    expect(graphOf(renameLane(bound, 'fits[0]', 'pv')).edges.filter((e) => e.data?.role === 'fit')).toHaveLength(2)
  })
})

describe('compose previews', () => {
  const m = parseModel(readout)
  const g = graphOf(m)
  const edit = (id: string) => {
    const before = fingerprints(m)
    const n = m.nodes.get(id)!
    const next = { ...m, nodes: new Map(m.nodes).set(id, { ...n, value: { type: 'object' as const, members: [] } }) }
    return [...invalidated(changedIds(before, fingerprints(next)), g)].sort()
  }

  it('stales only the edited lane', () => {
    const stale = edit('requests[1].attributes[0]')
    expect(stale.length).toBeGreaterThan(0)
    expect(stale.every((id) => frameOf(id) === 'requests[1]')).toBe(true)
    expect(stale).toContain('requests[1].tests[3]')
    const cohort = edit('requests[2].cohort')
    expect(cohort.every((id) => frameOf(id) === 'requests[2]')).toBe(true)
    expect(cohort).toContain('requests[2].tests[0]')
  })

  it('batches per lane and section', () => {
    const all = batches(g.nodes.map((n) => n.id), g.nodes)
    for (const b of all) {
      expect(new Set(b.map((id) => id.split('.')[0])).size).toBe(1)
    }
    expect(all.find((b) => b.includes('requests[0].tests[0]'))).toHaveLength(6)
  })
})

describe('compose palette', () => {
  it('places a node into the lane request', () => {
    const items = paletteItems(manifest)
    const it0 = items.find((i) => i.section === 'tests' && i.op === 'TEST_WELCH')!
    const m = parseModel(readout)
    const r = placeNode(m, it0, { manifest, schema: catalog.schema, cohortFields, base: ['requests', 3] })
    expect(r.id).toBe('requests[3].tests[0]')
    const doc = JSON.parse(emitModelText(r.model))
    expect(doc.requests[3].tests).toEqual([{ type: 'TEST_WELCH', label: 'welch' }])
    // Labels are unique per lane: another lane's welch does not count.
    const again = placeNode(r.model, it0, { manifest, schema: catalog.schema, cohortFields, base: ['requests', 2] })
    expect(JSON.parse(emitModelText(again.model)).requests[2].tests[1].label).toBe('welch')
  })
})
