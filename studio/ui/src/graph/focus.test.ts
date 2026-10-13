import { describe, expect, it, vi } from 'vitest'
import { createFocusStore, cssString, focusCss, highlightOf, type FocusEdge } from './focus.ts'

const E = (source: string, sh: string, target: string, th: string): FocusEdge => ({
  id: `${source}|${sh}->${target}|${th}`,
  source,
  sourceHandle: sh,
  target,
  targetHandle: th,
})

// One cohort field feeding two tests; an aggregation label feeding a third.
const arm1 = E('cohort', 'field:arm', 'tests[0]', 'in:split_by')
const arm2 = E('cohort', 'field:arm', 'tests[1]', 'in:split_by')
const rev = E('cohort', 'field:revenue', 'tests[1]', 'in:field')
const agg = E('aggregations[0]', 'out', 'tests[2]', 'in:field')
const edges = [arm1, arm2, rev, agg]

describe('highlightOf', () => {
  it('is null without focus, or when the focus touches no wire', () => {
    expect(highlightOf({}, edges)).toBeNull()
    expect(highlightOf({ hoverNode: 'filters[0]' }, edges)).toBeNull()
    expect(highlightOf({ selectedNode: 'filters[0]' }, edges)).toBeNull()
  })

  it('lights every wire of a hovered node, passively (no hit area over its handles)', () => {
    const h = highlightOf({ hoverNode: 'tests[1]' }, edges)!
    expect([...h.edges].sort()).toEqual([arm2.id, rev.id].sort())
    expect(h.passive).toEqual(h.edges)
    expect(h.rows).toContainEqual({ node: 'cohort', handle: 'field:arm' })
    expect(h.rows).toContainEqual({ node: 'tests[1]', handle: 'in:field' })
  })

  it('lights only the wires of a hovered port row', () => {
    expect([...highlightOf({ hoverHandle: { node: 'cohort', handle: 'field:arm' } }, edges)!.edges].sort()).toEqual([arm1.id, arm2.id].sort())
    expect([...highlightOf({ hoverHandle: { node: 'tests[1]', handle: 'in:field' } }, edges)!.edges]).toEqual([rev.id])
    // The out handle is a port too.
    expect([...highlightOf({ hoverHandle: { node: 'aggregations[0]', handle: 'out' } }, edges)!.edges]).toEqual([agg.id])
    // A target row only matches wires entering that node.
    expect(highlightOf({ hoverHandle: { node: 'tests[0]', handle: 'in:field' } }, edges)).toBeNull()
  })

  it('lights a selected wire and its two end rows, keeping its hit area', () => {
    const h = highlightOf({ selectedEdge: rev.id }, edges)!
    expect([...h.edges]).toEqual([rev.id])
    expect(h.passive.size).toBe(0)
    expect(h.rows).toEqual([
      { node: 'cohort', handle: 'field:revenue' },
      { node: 'tests[1]', handle: 'in:field' },
    ])
  })

  it('lights a selected node until a hover takes over', () => {
    expect([...highlightOf({ selectedNode: 'tests[0]' }, edges)!.edges]).toEqual([arm1.id])
    expect([...highlightOf({ selectedNode: 'tests[0]', hoverNode: 'tests[2]' }, edges)!.edges]).toEqual([agg.id])
    expect([...highlightOf({ selectedNode: 'tests[0]', hoverEdge: agg.id }, edges)!.edges].sort()).toEqual([arm1.id, agg.id].sort())
  })

  it('lists each end row once', () => {
    const h = highlightOf({ hoverNode: 'cohort' }, edges)!
    expect(h.rows.filter((r) => r.node === 'cohort' && r.handle === 'field:arm')).toHaveLength(1)
  })
})

describe('focusCss', () => {
  it('is empty without a highlight', () => {
    expect(focusCss(null)).toBe('')
  })

  it('dims all wires, lights and raises the focused ones, marks end rows', () => {
    const css = focusCss(highlightOf({ hoverHandle: { node: 'tests[1]', handle: 'in:field' } }, edges))
    expect(css).toContain('.graph-flow .react-flow__edge { opacity: var(--wire-dim); }')
    expect(css).toContain(`.react-flow__edge[data-id=${cssString(rev.id)}] .react-flow__edge-path`)
    expect(css).toContain(`.react-flow__edges > svg:has(> [data-id=${cssString(rev.id)}])`)
    expect(css).toContain('pointer-events: none')
    expect(css).toContain(`.react-flow__node[data-id="tests[1]"] .gnode-row:has(> .react-flow__handle[data-handleid="in:field"])`)
    expect(css).not.toContain(cssString(arm1.id))
  })

  it('keeps a selected wire clickable', () => {
    expect(focusCss(highlightOf({ selectedEdge: rev.id }, edges))).not.toContain('pointer-events')
  })

  it('quotes ids safely inside attribute selectors', () => {
    expect(cssString('requests[1].x["odd \\"key"]')).toBe('"requests[1].x[\\"odd \\\\\\"key\\"]"')
  })
})

describe('createFocusStore', () => {
  it('notifies only on real changes', () => {
    const s = createFocusStore()
    const fn = vi.fn()
    s.subscribe(fn)
    s.set({ hoverNode: 'a' })
    s.set({ hoverNode: 'a' })
    s.set({ hoverHandle: { node: 'a', handle: 'out' } })
    s.set({ hoverHandle: { node: 'a', handle: 'out' } })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(s.get()).toEqual({ hoverNode: 'a', hoverHandle: { node: 'a', handle: 'out' } })
  })
})
