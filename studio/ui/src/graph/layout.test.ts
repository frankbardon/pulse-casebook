import { describe, expect, it } from 'vitest'
import { buildRequestGraph } from './requestGraph.ts'
import {
  emptyLayout,
  layoutText,
  moveNode,
  parseLayout,
  positionOf,
  pruneLayout,
} from './layout.ts'

describe('layout sidecar', () => {
  it('falls back to an empty layout for missing or unusable sidecars', () => {
    for (const v of [null, undefined, [], 'x', { version: 2, nodes: { a: { x: 1, y: 2 } } }, {}]) {
      expect(parseLayout(v)).toEqual(emptyLayout())
    }
  })

  it('drops malformed entries and keeps unknown keys', () => {
    const l = parseLayout({
      version: 1,
      nodes: { 'filterers[0]': { x: 1, y: 2, collapsed: true, note: 'n' }, bad: { x: 'a', y: 1 }, worse: 3 },
      lanes: ['requests[1]', 'requests[0]'],
      extra: { k: 1 },
    })
    expect(l.nodes).toEqual({ 'filterers[0]': { x: 1, y: 2, collapsed: true, note: 'n' } })
    expect(l.lanes).toEqual(['requests[1]', 'requests[0]'])
    expect(l.extra).toEqual({ k: 1 })
    expect(parseLayout({ version: 1, nodes: {}, lanes: [1] }).lanes).toBeUndefined()
  })

  it('records rounded moves and keeps per-node state', () => {
    let l = parseLayout({ version: 1, nodes: { a: { x: 0, y: 0, collapsed: true } } })
    l = moveNode(l, 'a', { x: 10.4, y: -3.6 })
    l = moveNode(l, 'b', { x: 1, y: 2 })
    expect(l.nodes).toEqual({ a: { x: 10, y: -4, collapsed: true }, b: { x: 1, y: 2 } })
    expect(layoutText(l)).toBe('{"version":1,"nodes":{"a":{"x":10,"y":-4,"collapsed":true},"b":{"x":1,"y":2}}}')
  })

  it('ignores stale ids on load and prunes them on save', () => {
    const g = buildRequestGraph({ cohort: 'a.pulse', filterers: [{ type: 'FILTER_NULL', field: 'x' }] })
    const l = parseLayout({ version: 1, nodes: { 'filterers[0]': { x: 5, y: 6 }, 'filterers[9]': { x: 1, y: 1 }, 'constructor': { x: 0, y: 0 } } })
    const placed = g.nodes.map((n) => positionOf(l, n.id) ?? n.position)
    expect(placed[g.nodes.findIndex((n) => n.id === 'filterers[0]')]).toEqual({ x: 5, y: 6 })
    expect(positionOf(emptyLayout(), 'toString')).toBeUndefined()
    expect(Object.keys(pruneLayout(l, g.nodes.map((n) => n.id)).nodes)).toEqual(['filterers[0]'])
  })

})
