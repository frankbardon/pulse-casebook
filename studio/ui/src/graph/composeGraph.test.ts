import { describe, expect, it } from 'vitest'
import type { Manifest } from '../api.ts'
import { buildComposeGraph, LANE, laneAt, laneOrder, moveLane, ROOT_LANE, stackLanes } from './composeGraph.ts'
import type { GraphNode, OpNode } from './requestGraph.ts'
import abFields from './testdata/ab_test.fields.json?raw'
import catalogText from './testdata/catalog.slim.json?raw'
import fitsCompose from './testdata/fits.compose.json?raw'
import readout from '../../../../showcase/ab-test-readout/req/11_readout.compose.json?raw'

const fields = JSON.parse(abFields) as { name: string; type: string }[]
const { manifest } = JSON.parse(catalogText) as { manifest: Manifest }

function op(nodes: GraphNode[], id: string): OpNode {
  const n = nodes.find((x) => x.id === id)
  if (!n || n.type !== 'op') throw new Error(`no op node ${id}`)
  return n
}

describe('buildComposeGraph', () => {
  it('draws 11_readout as four labeled slot lanes', () => {
    const g = buildComposeGraph(JSON.parse(readout), { manifest, fieldsFor: () => fields })
    expect(g.lanes.map((l) => [l.id, l.role, l.title])).toEqual([
      ['requests[0]', 'slot', 'guardrails'],
      ['requests[1]', 'slot', 'scorecard'],
      ['requests[2]', 'slot', 'revenue_sensitivity'],
      ['requests[3]', 'slot', 'regression_adjustment'],
    ])
    // Every node lives in its lane, keyed by its JSON path.
    for (const n of g.nodes) expect(n.id.startsWith(`${n.parentId}.`)).toBe(true)
    expect(g.nodes.some((n) => n.id === 'requests[0].label')).toBe(false)
    expect(op(g.nodes, 'requests[1].tests[3]').data).toMatchObject({ op: 'TEST_WELCH', name: 'pages_viewed_cuped' })
    expect(op(g.nodes, 'requests[0].multiplicity').data.column).toBe('output')
    // Wires stay inside their lane: the CUPED attribute feeds its test.
    const cuped = g.edges.find((e) => e.target === 'requests[1].tests[3]' && e.targetHandle === 'in:field')
    expect(cuped?.source).toBe('requests[1].attributes[0]')
    for (const e of g.edges) expect(e.source.split('.')[0]).toBe(e.target.split('.')[0])
    // Shared stage columns; each lane lists the ones it uses.
    expect(g.columns.map((c) => c.key)).toEqual(['source', 'attributes', 'aggregations', 'analysis', 'output'])
    expect(g.lanes[2].columns).toEqual(['source', 'aggregations', 'analysis'])
    // Positions are lane-relative: below the header, on the shared columns.
    const t = op(g.nodes, 'requests[3].regressions[1]')
    expect(t.position.x).toBe(g.columns.find((c) => c.key === 'analysis')!.x)
    expect(t.position.y).toBeGreaterThanOrEqual(LANE.head)
  })

  it('draws fits as lanes bound to the slots that read them', () => {
    const g = buildComposeGraph(JSON.parse(fitsCompose), { manifest, fieldsFor: () => fields })
    expect(g.lanes.map((l) => [l.id, l.role, l.title])).toEqual([
      [ROOT_LANE, 'root', 'Compose'],
      ['fits[0]', 'fit', 'pages_model'],
      ['requests[0]', 'slot', 'train'],
      ['requests[1]', 'slot', 'holdout'],
    ])
    expect(op(g.nodes, 'multiplicity').parentId).toBe(ROOT_LANE)
    expect(g.nodes.some((n) => n.id === 'cohort')).toBe(false)
    const reg = op(g.nodes, 'fits[0].request.regressions[0]')
    expect(reg.data.fit).toBe('pages_model')
    const bind = g.edges.find((e) => e.data?.role === 'fit')
    expect(bind).toMatchObject({
      source: 'fits[0].request.regressions[0]',
      sourceHandle: 'fit',
      target: 'requests[0].attributes[0]',
      targetHandle: 'in:params.fit',
      className: 'fit-binding',
    })
    const row = op(g.nodes, 'requests[0].attributes[0]').data.rows.find((r) => r.key === 'params.fit')
    expect(row).toMatchObject({ fit: true, ref: 'pages_model', resolved: true })
    // An unbound ATTR_REG_PREDICT offers an empty fit input.
    const port = op(g.nodes, 'requests[1].attributes[0]').data.rows.find((r) => r.key === 'params.fit')
    expect(port).toMatchObject({ port: 'empty', fit: true })
  })

  it('marks a binding to a missing fit unresolved', () => {
    const doc = JSON.parse(fitsCompose)
    doc.requests[0].attributes[0].params.fit = 'nope'
    const g = buildComposeGraph(doc, { manifest })
    expect(g.edges.some((e) => e.data?.role === 'fit')).toBe(false)
    expect(op(g.nodes, 'requests[0].attributes[0]').data.rows.find((r) => r.key === 'params.fit')?.resolved).toBe(false)
  })
})

describe('lane order and stacking', () => {
  const lanes = buildComposeGraph(JSON.parse(fitsCompose), { manifest }).lanes

  it('defaults to fits then slots and honours a saved order', () => {
    expect(laneOrder(lanes)).toEqual(['fits[0]', 'requests[0]', 'requests[1]'])
    expect(laneOrder(lanes, ['requests[1]', 'gone', 'requests[1]', 'fits[0]'])).toEqual(['requests[1]', 'fits[0]', 'requests[0]'])
  })

  it('moves a lane, clamped to the ends', () => {
    expect(moveLane(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveLane(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveLane(['a', 'b', 'c'], 'a', 5)).toEqual(['b', 'c', 'a'])
  })

  it('stacks lanes by content height and finds the lane at a point', () => {
    const boxes = stackLanes(['a', 'b'], true, (id) => (id === 'a' ? 200 : 0), 900)
    expect(boxes.map((b) => b.id)).toEqual([ROOT_LANE, 'a', 'b'])
    expect(boxes[1].y).toBe(boxes[0].height + LANE.gap)
    expect(boxes[1].height).toBe(LANE.head + 200 + LANE.pad)
    expect(boxes[2].height).toBe(LANE.head + LANE.minBody + LANE.pad)
    expect(laneAt(boxes, boxes[2].y + 10)?.id).toBe('b')
    expect(laneAt(boxes, boxes[1].y - 5)?.id).toBe('a')
  })
})
