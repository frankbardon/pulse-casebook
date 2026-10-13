import { describe, expect, it } from 'vitest'
import {
  absolutePositions,
  buildScene,
  fitEnds,
  LANE_HEADER,
  roundedPath,
  sceneKey,
  simplify,
  type SceneHandle,
  type SceneNode,
} from './routing.ts'

const h = (id: string, type: 'source' | 'target', y: number, position: SceneHandle['position'] = type === 'source' ? 'right' : 'left'): SceneHandle => ({
  id,
  type,
  x: position === 'right' ? 196 : position === 'left' ? -4 : 96,
  y: position === 'bottom' ? 96 : y,
  width: 8,
  height: 8,
  position,
})

describe('absolutePositions', () => {
  it('adds parent offsets at any depth, in any order', () => {
    const nodes: SceneNode[] = [
      { id: 'child', position: { x: 10, y: 70 }, parentId: 'lane', width: 1, height: 1, handles: [] },
      { id: 'lane', position: { x: 0, y: 500 }, parentId: 'outer', width: 1, height: 1, lane: true, handles: [] },
      { id: 'outer', position: { x: 100, y: 5 }, width: 1, height: 1, handles: [] },
      { id: 'orphan', position: { x: 3, y: 4 }, parentId: 'missing', width: 1, height: 1, handles: [] },
    ]
    const abs = absolutePositions(nodes)
    expect(abs.get('child')).toEqual({ x: 110, y: 575 })
    expect(abs.get('lane')).toEqual({ x: 100, y: 505 })
    expect(abs.get('orphan')).toEqual({ x: 3, y: 4 })
  })
})

describe('buildScene', () => {
  const lane: SceneNode = { id: 'requests[1]', position: { x: 0, y: 400 }, width: 1200, height: 300, lane: true, titles: [16, 346], handles: [] }
  const cohort: SceneNode = {
    id: 'requests[1].cohort',
    parentId: 'requests[1]',
    position: { x: 16, y: 60 },
    width: 200,
    height: 100,
    handles: [h('field:arm', 'source', 36), h('field:revenue', 'source', 56)],
  }
  const test: SceneNode = {
    id: 'requests[1].tests[0]',
    parentId: 'requests[1]',
    position: { x: 676, y: 60 },
    width: 200,
    height: 100,
    handles: [h('in:field', 'target', 36), h('in:split_by', 'target', 56), h('fit', 'source', 0, 'bottom')],
  }

  it('pins wires on node borders in absolute coordinates (lane offsets applied)', () => {
    const scene = buildScene(
      [lane, cohort, test],
      [
        { id: 'e1', source: cohort.id, sourceHandle: 'field:arm', target: test.id, targetHandle: 'in:split_by' },
        { id: 'e2', source: test.id, sourceHandle: 'fit', target: cohort.id, targetHandle: null },
      ],
    )
    expect(scene.edges).toEqual([
      {
        id: 'e1',
        source: { node: cohort.id, x: 216, y: 400 + 60 + 40, side: 'right' },
        target: { node: test.id, x: 676, y: 400 + 60 + 60, side: 'left' },
      },
      // e2 is left out: the cohort has no target handle to pin it to.
    ])
  })

  it('takes the first handle of its type when an edge names none', () => {
    const tgt: SceneNode = { ...cohort, id: 'x', handles: [h('in:a', 'target', 16), h('in:b', 'target', 36)] }
    const scene = buildScene([test, tgt], [{ id: 'e', source: test.id, sourceHandle: 'fit', target: 'x' }])
    expect(scene.edges[0].source).toEqual({ node: test.id, x: 676 + 100, y: 60 + 100, side: 'bottom' })
    expect(scene.edges[0].target.y).toBe(60 + 20)
  })

  it('skips self loops, lanes, unmeasured nodes and unknown handles', () => {
    const unmeasured = { ...test, id: 'u', width: 0, height: 0 }
    const scene = buildScene(
      [lane, cohort, test, unmeasured],
      [
        { id: 'self', source: cohort.id, sourceHandle: 'field:arm', target: cohort.id, targetHandle: 'in:x' },
        { id: 'lane', source: lane.id, target: test.id, targetHandle: 'in:field' },
        { id: 'unmeasured', source: cohort.id, sourceHandle: 'field:arm', target: 'u', targetHandle: 'in:field' },
        { id: 'nohandle', source: cohort.id, sourceHandle: 'field:gone', target: test.id, targetHandle: 'in:field' },
      ],
    )
    expect(scene.edges).toEqual([])
  })

  it('makes content nodes and lane header strips obstacles, never lane bodies', () => {
    const scene = buildScene([lane, cohort, test], [])
    const ids = scene.obstacles.map((o) => o.id)
    expect(ids).toEqual(['requests[1]#title', 'requests[1]#tools', 'requests[1]#col0', 'requests[1]#col1', cohort.id, test.id])
    expect(scene.obstacles[0]).toEqual({ id: 'requests[1]#title', x: 0, y: 400, width: LANE_HEADER.title, height: LANE_HEADER.height })
    expect(scene.obstacles[1]).toMatchObject({ x: 1200 - LANE_HEADER.tools, y: 400 })
    expect(scene.obstacles[3]).toMatchObject({ x: 346, y: 400 + LANE_HEADER.colTitle.top })
    expect(scene.obstacles.find((o) => o.id === test.id)).toEqual({ id: test.id, x: 676, y: 460, width: 200, height: 100 })
  })
})

describe('sceneKey', () => {
  const n: SceneNode = { id: 'a', position: { x: 1, y: 2 }, width: 10, height: 10, handles: [h('out', 'source', 1)] }
  it('changes with geometry and wiring only', () => {
    const k = sceneKey([n], [{ id: 'e', source: 'a', target: 'b' }])
    expect(sceneKey([{ ...n }], [{ id: 'e', source: 'a', target: 'b' }])).toBe(k)
    expect(sceneKey([{ ...n, position: { x: 2, y: 2 } }], [{ id: 'e', source: 'a', target: 'b' }])).not.toBe(k)
    expect(sceneKey([{ ...n, height: 11 }], [{ id: 'e', source: 'a', target: 'b' }])).not.toBe(k)
    expect(sceneKey([n], [])).not.toBe(k)
  })
})

describe('fitEnds (route vs. live wire ends)', () => {
  const route = [
    { x: 200, y: 50 },
    { x: 260, y: 50 },
    { x: 260, y: 150 },
    { x: 400, y: 150 },
  ]
  it('snaps a current route onto React Flow handle points, keeping segments axis-aligned', () => {
    const pts = fitEnds(route, { x: 204, y: 50 }, { x: 396, y: 150 }, 'right', 'left')
    expect(pts).toEqual([
      { x: 204, y: 50 },
      { x: 260, y: 50 },
      { x: 260, y: 150 },
      { x: 396, y: 150 },
    ])
  })
  it('rejects a stale route (an end moved): caller falls back to the curve', () => {
    expect(fitEnds(route, { x: 204, y: 80 }, { x: 396, y: 150 }, 'right', 'left')).toBeNull()
    expect(fitEnds(route, { x: 204, y: 50 }, { x: 500, y: 150 }, 'right', 'left')).toBeNull()
    expect(fitEnds([{ x: 0, y: 0 }], { x: 0, y: 0 }, { x: 0, y: 0 }, 'right', 'left')).toBeNull()
  })
  it('matches a downward end along y', () => {
    const down = [
      { x: 100, y: 100 },
      { x: 100, y: 140 },
      { x: 300, y: 140 },
    ]
    expect(fitEnds(down, { x: 100, y: 104 }, { x: 300, y: 140 }, 'bottom', 'left')).not.toBeNull()
    expect(fitEnds(down, { x: 103, y: 104 }, { x: 300, y: 140 }, 'bottom', 'left')).toBeNull()
  })
})

describe('path generation', () => {
  it('simplifies repeated and collinear points but keeps reversals', () => {
    expect(
      simplify([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
    expect(simplify([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }])).toHaveLength(3)
  })
  it('rounds corners, never by more than half a segment', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 6)).toBe('M 0 0 L 94 0 Q 100 0 100 6 L 100 50')
    expect(roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 50 }], 6)).toBe('M 0 0 L 2 0 Q 4 0 4 2 L 4 50')
    expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 6)).toBe('M 0 0 L 10 0')
    expect(roundedPath([], 6)).toBe('')
  })
})
