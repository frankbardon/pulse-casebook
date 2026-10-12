import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest } from '../api.ts'
import { toPlain } from './jsonTree.ts'
import { renameNodes } from './layout.ts'
import { emitModel, emitModelText, parseModel, type GraphModel } from './model.ts'
import { buildRequestGraph, LAYOUT, type OpNode } from './requestGraph.ts'
import {
  checkConnection,
  clampToColumn,
  columnAt,
  connectWire,
  deleteNode,
  disconnectWire,
  disconnectWires,
} from './wiring.ts'
import catalogText from './testdata/catalog.slim.json?raw'
import abFields from './testdata/ab_test.fields.json?raw'
import cupedWelch from '../../../../showcase/ab-test-readout/req/08_cuped_welch.json?raw'

const manifest = (JSON.parse(catalogText) as { manifest: Manifest }).manifest
const cohortFields = JSON.parse(abFields) as CohortField[]
const ctx = { manifest, cohortFields }

const graphOf = (m: GraphModel) => buildRequestGraph(toPlain(emitModel(m)), ctx)
const plain = (m: GraphModel) => toPlain(emitModel(m)) as Record<string, Record<string, unknown>[]>

describe('checkConnection', () => {
  const model = parseModel(cupedWelch, 'request')
  const g = graphOf(model)

  it('accepts the pages_cuped label into a Welch field', () => {
    const r = checkConnection(g, { source: 'attributes[0]', sourceHandle: 'out', target: 'tests[0]', targetHandle: 'in:field' }, ctx)
    expect(r).toEqual({ ok: true, ref: 'pages_cuped', rowKey: 'field', sourceType: 'f64' })
  })

  it('accepts a numeric cohort field', () => {
    const r = checkConnection(g, { source: 'cohort', sourceHandle: 'field:revenue', target: 'tests[1]', targetHandle: 'in:field' }, ctx)
    expect(r).toMatchObject({ ok: true, ref: 'revenue', sourceType: 'f64' })
  })

  it('refuses a categorical field into a numeric-only input, with a reason', () => {
    const r = checkConnection(g, { source: 'cohort', sourceHandle: 'field:arm', target: 'tests[0]', targetHandle: 'in:field' }, ctx)
    expect(r).toEqual({ ok: false, reason: 'TEST_WELCH field takes a numeric field, not categorical_u8 (field arm)' })
  })

  it('refuses a numeric float as a split', () => {
    const r = checkConnection(g, { source: 'cohort', sourceHandle: 'field:revenue', target: 'tests[0]', targetHandle: 'in:split_by' }, ctx)
    expect(r.ok).toBe(false)
  })

  it('refuses a label the target cannot see', () => {
    // Tests run on rows; the users aggregation does not exist there.
    const r = checkConnection(g, { source: 'aggregations[0]', sourceHandle: 'out', target: 'tests[0]', targetHandle: 'in:field' }, ctx)
    expect(r).toEqual({ ok: false, reason: 'test runs before aggregate users exists' })
  })

  it('refuses non-inputs and self wires', () => {
    expect(checkConnection(g, { source: 'cohort', sourceHandle: 'field:arm', target: 'cohort', targetHandle: 'field:x' }, ctx).ok).toBe(false)
    expect(checkConnection(g, { source: 'attributes[0]', sourceHandle: 'out', target: 'attributes[0]', targetHandle: 'in:field' }, ctx).ok).toBe(false)
    expect(checkConnection(g, { source: 'nope', sourceHandle: 'out', target: 'tests[0]', targetHandle: 'in:field' }, ctx).ok).toBe(false)
  })

  it('lets unknown types through', () => {
    const bare = buildRequestGraph(toPlain(emitModel(model)), { manifest })
    const r = checkConnection(bare, { source: 'cohort', sourceHandle: 'field:pages_viewed', target: 'tests[0]', targetHandle: 'in:field' }, { manifest })
    expect(r.ok).toBe(true)
  })
})

describe('connectWire / disconnectWire', () => {
  it('wiring pages_cuped into a Welch test rewrites only its field', () => {
    const model = parseModel(cupedWelch, 'request')
    const before = emitModelText(model)
    const next = connectWire(model, 'tests[0]', 'field', 'pages_cuped')
    expect(plain(next).tests[0].field).toBe('pages_cuped')
    expect(emitModelText(next)).toBe(before.replace('"field":"pages_viewed","split_by"', '"field":"pages_cuped","split_by"'))
    // The graph now wires the attribute into tests[0].
    const e = graphOf(next).edges.find((x) => x.target === 'tests[0]' && x.targetHandle === 'in:field')
    expect(e).toMatchObject({ source: 'attributes[0]', sourceHandle: 'out' })
  })

  it('disconnecting clears the param', () => {
    const model = parseModel(cupedWelch, 'request')
    const next = disconnectWire(model, 'tests[1]', 'split_by')
    expect(plain(next).tests[1]).toEqual({ type: 'TEST_WELCH', field: 'pages_cuped', label: 'pages_cuped' })
    expect(disconnectWire(next, 'tests[1]', 'split_by')).toBe(next)
  })

  it('fills an empty port and appends to list inputs', () => {
    const text = '{"cohort":{"filename":"ab_test.pulse"},"tests":[{"type":"TEST_WELCH","field":"revenue"}],"regressions":[{"type":"REG_OLS","target":"revenue"}]}'
    let model = parseModel(text, 'request')
    const g = graphOf(model)
    const welch = g.nodes.find((n) => n.id === 'tests[0]') as OpNode
    expect(welch.data.rows.find((r) => r.key === 'split_by')).toMatchObject({ port: 'empty', value: '' })
    const reg = g.nodes.find((n) => n.id === 'regressions[0]') as OpNode
    expect(reg.data.rows.find((r) => r.port === 'append')?.key).toBe('predictors[0]')

    const split = checkConnection(g, { source: 'cohort', sourceHandle: 'field:arm', target: 'tests[0]', targetHandle: 'in:split_by' }, ctx)
    expect(split.ok).toBe(true)
    model = connectWire(model, 'tests[0]', 'split_by', 'arm')
    model = connectWire(model, 'regressions[0]', 'predictors[0]', 'is_variant')
    model = connectWire(model, 'regressions[0]', 'predictors[1]', 'prior_sessions')
    expect(plain(model).tests[0].split_by).toBe('arm')
    expect(plain(model).regressions[0].predictors).toEqual(['is_variant', 'prior_sessions'])
    const after = graphOf(model).nodes.find((n) => n.id === 'regressions[0]') as OpNode
    expect(after.data.rows.find((r) => r.port === 'append')?.key).toBe('predictors[2]')

    // Removing two items at once keeps indexes straight.
    model = disconnectWires(model, [
      { target: 'regressions[0]', rowKey: 'predictors[0]' },
      { target: 'regressions[0]', rowKey: 'predictors[1]' },
    ])
    expect(plain(model).regressions[0].predictors).toEqual([])
  })
})

describe('deleteNode', () => {
  it('removes an entry and shifts later siblings', () => {
    const model = parseModel(cupedWelch, 'request')
    const { model: next, renames } = deleteNode(model, 'tests[0]')
    expect(plain(next).tests.map((t) => t.label)).toEqual(['pages_cuped'])
    expect(renames).toEqual(new Map([['tests[1]', 'tests[0]']]))
    expect(() => JSON.parse(emitModelText(next))).not.toThrow()
  })

  it('drops an emptied section and leaves downstream refs unresolved', () => {
    const model = parseModel(cupedWelch, 'request')
    const { model: next } = deleteNode(model, 'attributes[0]')
    const doc = plain(next)
    expect('attributes' in doc).toBe(false)
    expect(Object.keys(doc)).toEqual(['cohort', 'aggregations', 'tests'])
    const g = graphOf(next)
    expect(g.edges.some((e) => e.source === 'attributes[0]')).toBe(false)
    const t1 = g.nodes.find((n) => n.id === 'tests[1]') as OpNode
    expect(t1.data.rows.find((r) => r.key === 'field')).toMatchObject({ ref: 'pages_cuped', resolved: false })
    expect(() => JSON.parse(emitModelText(next))).not.toThrow()
  })

  it('refuses to delete the cohort', () => {
    expect(() => deleteNode(parseModel(cupedWelch, 'request'), 'cohort')).toThrow()
  })

  it('carries layout entries along with renames', () => {
    const layout = { version: 1, nodes: { 'tests[0]': { x: 1, y: 1 }, 'tests[1]': { x: 2, y: 2 }, cohort: { x: 3, y: 3 } } }
    const { renames } = deleteNode(parseModel(cupedWelch, 'request'), 'tests[0]')
    const out = renameNodes(layout, (id) => id === 'tests[0]', renames)
    expect(out.nodes).toEqual({ 'tests[0]': { x: 2, y: 2 }, cohort: { x: 3, y: 3 } })
  })
})

describe('column placement', () => {
  const columns = buildRequestGraph(JSON.parse(cupedWelch), ctx).columns
  const step = LAYOUT.nodeWidth + LAYOUT.columnGap

  it('keeps a dragged node inside its own column band', () => {
    const tests = columns.find((c) => c.key === 'analysis')!
    expect(clampToColumn({ x: tests.x + 40, y: 9 }, 'analysis', columns)).toEqual({ x: tests.x + 40, y: 9 })
    const right = clampToColumn({ x: tests.x + 2 * step, y: 9 }, 'analysis', columns)
    expect(columnAt(right.x, columns)).toBe('analysis')
    const left = clampToColumn({ x: -5 * step, y: 9 }, 'analysis', columns)
    expect(columnAt(left.x, columns)).toBe('analysis')
    expect(left.y).toBe(9)
  })

  it('finds the column under an x', () => {
    expect(columnAt(0, columns)).toBe('source')
    expect(columnAt(step * 0.9, columns)).toBe(columns[1].key)
  })
})
