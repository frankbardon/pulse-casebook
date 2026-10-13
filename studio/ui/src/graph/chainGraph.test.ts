import { describe, expect, it } from 'vitest'
import type { Manifest } from '../api.ts'
import { buildChainGraph } from './chainGraph.ts'
import { chainRefusal, processChain } from './chainRules.ts'
import { LANE } from './composeGraph.ts'
import { stringValue } from './jsonTree.ts'
import { addLane, moveStage, removable, removeLane, renameLane } from './lanes.ts'
import { emitModelText, parseModel } from './model.ts'
import { invalidated } from './previews.ts'
import type { GraphNode, OpNode } from './requestGraph.ts'
import { clientIssues } from './validation.ts'
import { checkConnection } from './wiring.ts'
import catalogText from './testdata/catalog.slim.json?raw'
import retention from '../../../../showcase/retail-at-scale/req/05_retention_chain.json?raw'
import spend from '../../../../showcase/retail-at-scale/req/06_spend_distribution_chain.json?raw'

const { manifest } = JSON.parse(catalogText) as { manifest: Manifest }
const orders = [
  { name: 'customer_id', type: 'u32' },
  { name: 'order_id', type: 'u32' },
  { name: 'order_date', type: 'date' },
  { name: 'net_amount', type: 'f64' },
  { name: 'loyalty_member', type: 'bool' },
]

function op(nodes: GraphNode[], id: string): OpNode {
  const n = nodes.find((x) => x.id === id)
  if (!n || n.type !== 'op') throw new Error(`no op node ${id}`)
  return n
}

describe('buildChainGraph', () => {
  it('draws 05_retention_chain as two stacked stage lanes', () => {
    const g = buildChainGraph(JSON.parse(retention), { manifest, cohortFields: orders })
    expect(g.lanes.map((l) => [l.id, l.role, l.title])).toEqual([
      ['stages[0]', 'stage', 'per_customer'],
      ['stages[1]', 'stage', 'by_first_month'],
    ])
    // The chain cohort keeps its root id and sits in the first stage.
    const cohort = g.nodes.find((n) => n.id === 'cohort')
    expect(cohort?.parentId).toBe('stages[0]')
    expect(g.edges.some((e) => e.source === 'cohort' && e.target === 'stages[0].request.groups[0]')).toBe(true)
    // Every other node lives in its stage lane, keyed by its JSON path.
    for (const n of g.nodes) if (n.id !== 'cohort') expect(n.id.startsWith(`${n.parentId}.request${n.type === 'result' ? '[' : '.'}`)).toBe(true)
    // The second stage reads the first stage's output: its group field
    // is wired from the aggregation that makes first_month.
    const group = op(g.nodes, 'stages[1].request.groups[0]')
    expect(group.data.rows.find((r) => r.key === 'field')).toMatchObject({ ref: 'first_month', resolved: true })
    const wire = g.edges.find((e) => e.target === 'stages[1].request.groups[0]')
    expect(wire?.source).toBe('stages[0].request.aggregations[2]')
    // Every ref of the second stage resolves against stage 0's output.
    for (const n of g.nodes) {
      if (n.type !== 'op' || n.parentId !== 'stages[1]') continue
      for (const r of n.data.rows) if (r.ref !== undefined) expect(r.resolved, `${n.id} ${r.key}`).toBe(true)
    }
    expect(g.inputs.get('stages[0]')).toBe(orders)
    expect(g.inputs.get('stages[1]')?.map((f) => f.name).slice(0, 3)).toEqual(['customer_id', 'spend', 'orders'])
    expect(g.inputs.get('stages[1]')?.map((f) => f.type).slice(0, 2)).toEqual(['categorical_u32', 'f64'])
    // Lane-relative positions on shared columns.
    expect(op(g.nodes, 'stages[1].request.aggregations[0]').position.y).toBeGreaterThanOrEqual(LANE.head)
  })

  it('marks a later-stage ref to a column the previous stage does not output', () => {
    const doc = JSON.parse(spend)
    doc.stages[1].request.attributes[0].field = 'net_amount'
    const g = buildChainGraph(doc, { manifest, cohortFields: orders })
    const attr = op(g.nodes, 'stages[1].request.attributes[0]')
    expect(attr.data.rows.find((r) => r.key === 'field')?.resolved).toBe(false)
  })

  it('draws chain-level overlays in a root lane', () => {
    const doc = JSON.parse(retention)
    doc.overlays = [{ name: 'growth', kind: 'OVERLAY_INDEX_VS_STAGE', scope: 'total' }]
    const g = buildChainGraph(doc, { manifest })
    expect(g.lanes[0]).toMatchObject({ role: 'root', title: 'Chain' })
    expect(g.nodes.find((n) => n.id === 'overlays[0]')?.parentId).toBe('(compose)')
    expect(g.nodes.find((n) => n.id === 'cohort')?.parentId).toBe('stages[0]')
  })
})

describe('chain wiring', () => {
  const g = buildChainGraph(JSON.parse(retention), { manifest, cohortFields: orders })
  it('lets the cohort feed the first stage and an aggregation the next stage only', () => {
    expect(checkConnection(g, { source: 'cohort', sourceHandle: 'field:order_id', target: 'stages[0].request.aggregations[0]', targetHandle: 'in:field' }).ok).toBe(true)
    expect(checkConnection(g, { source: 'cohort', sourceHandle: 'field:order_id', target: 'stages[1].request.aggregations[0]', targetHandle: 'in:field' }).ok).toBe(false)
    const ok = checkConnection(g, {
      source: 'stages[0].request.aggregations[1]',
      sourceHandle: 'out',
      target: 'stages[1].request.groups[0]',
      targetHandle: 'in:field',
    })
    expect(ok).toMatchObject({ ok: true, ref: 'orders' })
    const back = checkConnection(g, {
      source: 'stages[1].request.aggregations[1]',
      sourceHandle: 'out',
      target: 'stages[0].request.groups[0]',
      targetHandle: 'in:field',
    })
    expect(back).toMatchObject({ ok: false, reason: 'a chain stage reads only the stage before it' })
  })
})

describe('chain gate', () => {
  it('refuses features, windows, tests, post-tests and regressions', () => {
    for (const [section, opName] of [
      ['features', 'FEAT_BUCKETIZE'],
      ['windows', 'WINDOW_LAG'],
      ['tests', 'TEST_WELCH'],
      ['post_tests', 'TEST_X'],
      ['regressions', 'REG_OLS'],
    ]) {
      expect(chainRefusal(manifest, section, opName), section).toMatch(/chain stage cannot/)
    }
  })

  it('takes mergeable aggregators and groupers and row-local attributes only', () => {
    expect(chainRefusal(manifest, 'aggregations', 'AGG_SUM')).toBeNull()
    expect(chainRefusal(manifest, 'aggregations', 'AGG_MEDIAN')).toMatch(/not a mergeable aggregator/)
    expect(chainRefusal(manifest, 'groups', 'GROUP_CATEGORY')).toBeNull()
    expect(chainRefusal(manifest, 'groups', 'GROUP_QUANTILE')).toMatch(/mergeable grouper/)
    expect(chainRefusal(manifest, 'attributes', 'ATTR_FORMULA')).toBeNull()
    expect(chainRefusal(manifest, 'attributes', 'ATTR_ZSCORE')).toMatch(/row-local/)
    expect(chainRefusal(manifest, 'filterers', 'FILTER_RANGE')).toBeNull()
    expect(chainRefusal(manifest, 'overlays', 'OVERLAY_INDEX_VS_STAGE')).toMatch(/whole-chain/)
    expect(chainRefusal(manifest, 'matrices', 'MAT_CORRELATION', 0)).toBeNull()
    expect(chainRefusal(manifest, 'matrices', 'MAT_CORRELATION', 1)).toMatch(/first chain stage/)
  })

  it('reads the lists from the manifest process_chain block', () => {
    const m = { ...manifest, process_chain: { mergeable_aggregators: ['AGG_COUNT'] } } as Manifest
    expect(processChain(m).mergeable_aggregators).toEqual(['AGG_COUNT'])
    expect(chainRefusal(m, 'aggregations', 'AGG_SUM')).toMatch(/AGG_COUNT/)
  })

  it('flags disallowed operators already in a stage', () => {
    const doc = JSON.parse(retention)
    doc.stages[1].request.aggregations[0].type = 'AGG_MEDIAN'
    const issues = clientIssues(parseModel(JSON.stringify(doc)), { manifest })
    expect(issues.find((i) => i.code === 'CHAIN_STAGE')).toMatchObject({ path: 'stages[1].request.aggregations[0]', severity: 'error' })
  })
})

describe('chain stage edits', () => {
  it('adds a stage counting the previous stage output', () => {
    const r = addLane(parseModel(retention))
    expect(r.id).toBe('stages[2]')
    const doc = JSON.parse(emitModelText(r.model))
    expect(doc.stages[2]).toEqual({ name: 'stage_3', request: { aggregations: [{ type: 'AGG_COUNT', field: 'first_month', label: 'n' }] } })
  })

  it('renames, removes (never the last) and moves stages', () => {
    let m = parseModel(spend)
    m = renameLane(m, 'stages[0]', 'customers')
    expect(stringValue(m.nodes.get('stages[0].name')?.value)).toBe('customers')
    m = renameLane(m, 'stages[0]', '')
    expect(m.nodes.has('stages[0].name')).toBe(false)

    const mv = moveStage(parseModel(spend), 'stages[1]', -1)
    const doc = JSON.parse(emitModelText(mv.model))
    expect(doc.stages.map((s: { name: string }) => s.name)).toEqual(['by_spend_band', 'per_customer'])
    expect(mv.renames.get('stages[1].request.groups[0]')).toBe('stages[0].request.groups[0]')
    expect(mv.renames.get('stages[0].request.filterers[0]')).toBe('stages[1].request.filterers[0]')
    expect(mv.renames.get('stages[0]')).toBe('stages[1]')

    let one = parseModel(spend)
    expect(removable(one, 'stages[1]')).toBe(true)
    one = removeLane(one, 'stages[1]').model
    expect(removable(one, 'stages[0]')).toBe(false)
  })
})

describe('chain previews', () => {
  it('an edit in a stage stales every later stage, not earlier ones', () => {
    const g = buildChainGraph(JSON.parse(retention), { manifest, cohortFields: orders })
    const stale = invalidated(['stages[0].request.aggregations[3]'], g)
    expect(stale.has('stages[1].request.groups[0]')).toBe(true)
    expect(stale.has('stages[0].request.groups[0]')).toBe(false)
    const late = invalidated(['stages[1].request.aggregations[0]'], g)
    expect([...late].every((id) => id.startsWith('stages[1]'))).toBe(true)
  })
})
