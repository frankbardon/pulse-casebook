import { describe, expect, it } from 'vitest'
import { AvoidLib } from 'libavoid-js'
import { routeScene, ROUTE_PARAMS } from './avoidRoute.ts'
import { buildScene, type Rect, type SceneNode, type XY } from './routing.ts'

const load = (async () => {
  await AvoidLib.load()
  return AvoidLib.getInstance()
})()

const node = (id: string, x: number, y: number, rows: number, extra: Partial<SceneNode> = {}): SceneNode => ({
  id,
  position: { x, y },
  width: 200,
  height: 40 + rows * 20,
  handles: Array.from({ length: rows }, (_, i) => [
    { id: `in:r${i}`, type: 'target' as const, x: -4, y: 36 + i * 20, width: 8, height: 8, position: 'left' as const },
    { id: `field:r${i}`, type: 'source' as const, x: 196, y: 36 + i * 20, width: 8, height: 8, position: 'right' as const },
  ]).flat(),
  ...extra,
})

// crosses says whether an axis-aligned segment passes through a rect's
// interior.
function crosses(a: XY, b: XY, r: Rect): boolean {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return x1 > r.x + 0.5 && x0 < r.x + r.width - 0.5 && y1 > r.y + 0.5 && y0 < r.y + r.height - 0.5
}

describe('routeScene (libavoid)', () => {
  it('routes orthogonally around a node in the way, from pin to pin', async () => {
    const A = await load
    // a feeds c; b sits between them on the straight line.
    const nodes = [node('a', 0, 0, 3), node('b', 300, 0, 4), node('c', 600, 0, 3)]
    const scene = buildScene(nodes, [{ id: 'e', source: 'a', sourceHandle: 'field:r1', target: 'c', targetHandle: 'in:r1' }])
    const routes = routeScene(A, scene)
    const pts = routes.get('e')!.points
    expect(pts[0]).toEqual({ x: 200, y: 60 })
    expect(pts.at(-1)).toEqual({ x: 600, y: 60 })
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]]
      expect(Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6).toBe(true)
      expect(crosses(p, q, scene.obstacles.find((o) => o.id === 'b')!)).toBe(false)
    }
    // Leaves rightward, enters from the left.
    expect(pts[1].x).toBeGreaterThan(pts[0].x)
    expect(pts.at(-2)!.x).toBeLessThan(pts.at(-1)!.x)
  })

  it('shares a pin between wires and nudges their parallel runs apart', async () => {
    const A = await load
    const nodes = [node('src', 0, 0, 2), node('t1', 400, -100, 2), node('t2', 400, 200, 2)]
    const edges = [
      { id: 'e1', source: 'src', sourceHandle: 'field:r0', target: 't1', targetHandle: 'in:r0' },
      { id: 'e2', source: 'src', sourceHandle: 'field:r0', target: 't2', targetHandle: 'in:r0' },
      { id: 'e3', source: 'src', sourceHandle: 'field:r1', target: 't2', targetHandle: 'in:r1' },
    ]
    const routes = routeScene(A, buildScene(nodes, edges))
    expect([...routes.keys()].sort()).toEqual(['e1', 'e2', 'e3'])
    // e2 and e3 both drop to t2: their vertical runs are not on top of
    // each other.
    const vx = (id: string) => {
      const p = routes.get(id)!.points
      const i = p.findIndex((q, k) => k > 0 && Math.abs(q.x - p[k - 1].x) < 1e-6)
      return p[i].x
    }
    expect(Math.abs(vx('e2') - vx('e3'))).toBeGreaterThanOrEqual(ROUTE_PARAMS.nudge - 1e-6)
  })

  it('routes many runs without leaking or failing', async () => {
    const A = await load
    const nodes = Array.from({ length: 30 }, (_, i) => node(`n${i}`, (i % 6) * 300, Math.floor(i / 6) * 160, 4))
    const edges = Array.from({ length: 45 }, (_, i) => ({
      id: `e${i}`,
      source: `n${(i * 7) % 30}`,
      sourceHandle: `field:r${i % 4}`,
      target: `n${(i * 11 + 3) % 30}`,
      targetHandle: `in:r${(i * 3) % 4}`,
    }))
    const scene = buildScene(nodes, edges)
    let n = 0
    for (let k = 0; k < 5; k++) n = routeScene(A, scene).size
    expect(n).toBe(scene.edges.length)
  })
})
