// routing turns the canvas into an orthogonal edge-routing problem and
// routed polylines back into SVG paths. Pure: the router itself
// (libavoid, avoidRoute.ts) runs in a worker (route.worker.ts) and
// WireEdge.tsx draws the result.
//
// The scene is built in absolute flow coordinates. Lane views (compose,
// chain) draw content nodes inside parent lane nodes (`parentId`), so a
// child's absolute position is the sum of its ancestors' positions.
// Obstacles are content nodes and the title and tool strips of lane
// headers, never lane bodies (wires run through lanes). Each wire is
// pinned at its handle on the node border: sources leave on the side
// their handle sits on (rightward for ports, downward for a fit handle),
// targets are entered from the left.

export type XY = { x: number; y: number }
export type Side = 'left' | 'right' | 'top' | 'bottom'

// SceneHandle is a handle's box relative to its node (React Flow's
// internals.handleBounds entries).
export type SceneHandle = {
  id?: string | null
  type: 'source' | 'target'
  x: number
  y: number
  width: number
  height: number
  position: Side
}

// SceneNode is a node as the router sees it: position relative to its
// parent (if any), measured size, handles. Lanes are parents, not
// obstacles (only their header strips are).
export type SceneNode = {
  id: string
  position: XY
  parentId?: string
  width: number
  height: number
  lane?: boolean
  // A lane's stage column titles (lane-relative x), drawn under its
  // header: wires keep off them too.
  titles?: number[]
  handles: SceneHandle[]
}

export type SceneEdge = {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
}

export type Rect = { id: string; x: number; y: number; width: number; height: number }

// Pin is a wire end: the obstacle it is attached to, the absolute point
// on that obstacle's border, and the side the wire leaves or enters by.
export type Pin = { node: string; x: number; y: number; side: Side }

export type RouteRequest = { id: string; source: Pin; target: Pin }

export type Scene = { obstacles: Rect[]; edges: RouteRequest[] }

// A routed wire: its polyline from source pin to target pin.
export type Route = { points: XY[] }

// Lane header geometry: the header strip (.lane-head) is 30px tall; its title
// sits at the left, its tools at the right. Only those parts block wires,
// so wires between lanes still cross the header's empty middle.
export const LANE_HEADER = { height: 30, title: 320, tools: 100, colTitle: { top: 34, height: 20, width: 110 } }

// absolutePositions resolves parent-relative positions to absolute ones
// (any depth; a missing parent counts as the origin, a cycle is cut).
export function absolutePositions(nodes: readonly SceneNode[]): Map<string, XY> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, XY>()
  const resolve = (n: SceneNode, seen: Set<string>): XY => {
    const known = out.get(n.id)
    if (known) return known
    let at = n.position
    const parent = n.parentId !== undefined ? byId.get(n.parentId) : undefined
    if (parent && !seen.has(parent.id)) {
      seen.add(n.id)
      const p = resolve(parent, seen)
      at = { x: p.x + n.position.x, y: p.y + n.position.y }
    }
    out.set(n.id, at)
    return at
  }
  for (const n of nodes) resolve(n, new Set())
  return out
}

// findHandle mirrors React Flow's handle lookup: by id, else the first
// handle of that type when the edge names none.
function findHandle(n: SceneNode, type: SceneHandle['type'], id: string | null | undefined): SceneHandle | undefined {
  const of = n.handles.filter((h) => h.type === type)
  if (id === null || id === undefined) return of[0]
  return of.find((h) => h.id === id)
}

// pinOf places a handle's wire end on its node's border (the handle's
// center projected onto the side it sits on).
export function pinOf(n: SceneNode, at: XY, h: SceneHandle): Pin {
  const cx = clamp(h.x + h.width / 2, 0, n.width)
  const cy = clamp(h.y + h.height / 2, 0, n.height)
  switch (h.position) {
    case 'right':
      return { node: n.id, x: at.x + n.width, y: at.y + cy, side: 'right' }
    case 'left':
      return { node: n.id, x: at.x, y: at.y + cy, side: 'left' }
    case 'bottom':
      return { node: n.id, x: at.x + cx, y: at.y + n.height, side: 'bottom' }
    case 'top':
      return { node: n.id, x: at.x + cx, y: at.y, side: 'top' }
  }
}

// buildScene extracts the routing problem: obstacles (content nodes and
// lane header strips, absolute) and one request per edge whose two ends
// resolve to measured handles. Unmeasured nodes and edges without
// resolvable handles are left out (they keep their plain curve).
export function buildScene(nodes: readonly SceneNode[], edges: readonly SceneEdge[]): Scene {
  const abs = absolutePositions(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const obstacles: Rect[] = []
  for (const n of nodes) {
    if (!(n.width > 0 && n.height > 0)) continue
    const at = abs.get(n.id)!
    if (!n.lane) {
      obstacles.push({ id: n.id, x: at.x, y: at.y, width: n.width, height: n.height })
      continue
    }
    const h = Math.min(LANE_HEADER.height, n.height)
    const title = Math.min(LANE_HEADER.title, n.width)
    obstacles.push({ id: `${n.id}#title`, x: at.x, y: at.y, width: title, height: h })
    if (n.width > title + LANE_HEADER.tools) {
      obstacles.push({ id: `${n.id}#tools`, x: at.x + n.width - LANE_HEADER.tools, y: at.y, width: LANE_HEADER.tools, height: h })
    }
    const ct = LANE_HEADER.colTitle
    for (const [i, x] of (n.titles ?? []).entries()) {
      if (n.height < ct.top + ct.height) break
      obstacles.push({ id: `${n.id}#col${i}`, x: at.x + x, y: at.y + ct.top, width: ct.width, height: ct.height })
    }
  }
  const out: RouteRequest[] = []
  for (const e of edges) {
    if (e.source === e.target) continue
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t || s.lane || t.lane || !(s.width > 0 && t.width > 0)) continue
    const sh = findHandle(s, 'source', e.sourceHandle)
    const th = findHandle(t, 'target', e.targetHandle)
    if (!sh || !th) continue
    out.push({ id: e.id, source: pinOf(s, abs.get(s.id)!, sh), target: pinOf(t, abs.get(t.id)!, th) })
  }
  return { obstacles, edges: out }
}

// sceneKey is a cheap fingerprint of everything a route depends on, so
// the router reruns only when geometry or wiring changed (not on pan or
// zoom).
export function sceneKey(nodes: readonly SceneNode[], edges: readonly SceneEdge[]): string {
  const parts: string[] = []
  for (const n of nodes) {
    let hs = ''
    for (const h of n.handles) hs += `${h.id ?? ''}@${r1(h.x)},${r1(h.y)};`
    parts.push(`${n.id}|${n.parentId ?? ''}|${r1(n.position.x)},${r1(n.position.y)}|${r1(n.width)}x${r1(n.height)}|${hs}|${n.titles?.join(',') ?? ''}`)
  }
  for (const e of edges) parts.push(e.id)
  return parts.join('\n')
}

// Tolerances for matching a route to React Flow's live handle points:
// React Flow puts a wire end at the handle's outer edge, a few pixels
// outside the border pin; across the wire it must match exactly.
const ALONG = 12
const ACROSS = 1.5

// fitEnds re-attaches a route to the wire ends React Flow draws now
// (sourceX/Y, targetX/Y), or returns null when the route is stale (its
// node moved or resized since routing): the caller then draws the plain
// curve until the next route lands.
export function fitEnds(points: readonly XY[], source: XY, target: XY, sourceSide: Side, targetSide: Side): XY[] | null {
  if (points.length < 2) return null
  if (!near(points[0], source, sourceSide) || !near(points[points.length - 1], target, targetSide)) return null
  const pts = points.map((p) => ({ ...p }))
  attach(pts, 0, 1, source)
  attach(pts, pts.length - 1, pts.length - 2, target)
  return pts
}

function near(p: XY, q: XY, side: Side): boolean {
  const horizontal = side === 'left' || side === 'right'
  const along = Math.abs(horizontal ? p.x - q.x : p.y - q.y)
  const across = Math.abs(horizontal ? p.y - q.y : p.x - q.x)
  return along <= ALONG && across <= ACROSS
}

// attach moves end point i to `to`, carrying its neighbour j along so the
// first (or last) segment stays axis-aligned.
function attach(pts: XY[], i: number, j: number, to: XY): void {
  const p = pts[i]
  const q = pts[j]
  if (Math.abs(q.y - p.y) < 0.5) q.y = to.y
  else if (Math.abs(q.x - p.x) < 0.5) q.x = to.x
  pts[i] = { x: to.x, y: to.y }
}

// simplify drops repeated points and the middle of collinear runs.
export function simplify(points: readonly XY[]): XY[] {
  const out: XY[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = last
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)
      const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y)
      if (Math.abs(cross) < 0.01 && dot >= 0) {
        out[out.length - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

// roundedPath draws a polyline as an SVG path with corners rounded by up
// to radius (never more than half of either adjoining segment).
export function roundedPath(points: readonly XY[], radius: number): string {
  const pts = simplify(points)
  if (pts.length === 0) return ''
  let d = `M ${n2(pts[0].x)} ${n2(pts[0].y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const lin = Math.hypot(b.x - a.x, b.y - a.y)
    const lout = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(radius, lin / 2, lout / 2)
    if (r <= 0.01) {
      d += ` L ${n2(b.x)} ${n2(b.y)}`
      continue
    }
    const p1 = { x: b.x - ((b.x - a.x) / lin) * r, y: b.y - ((b.y - a.y) / lin) * r }
    const p2 = { x: b.x + ((c.x - b.x) / lout) * r, y: b.y + ((c.y - b.y) / lout) * r }
    d += ` L ${n2(p1.x)} ${n2(p1.y)} Q ${n2(b.x)} ${n2(b.y)} ${n2(p2.x)} ${n2(p2.y)}`
  }
  const last = pts[pts.length - 1]
  if (pts.length > 1) d += ` L ${n2(last.x)} ${n2(last.y)}`
  return d
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function r1(v: number): number {
  return Math.round(v * 10) / 10
}

function n2(v: number): string {
  return String(Math.round(v * 100) / 100)
}
