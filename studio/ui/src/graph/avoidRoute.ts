// avoidRoute routes a scene (routing.ts) with libavoid: orthogonal wires
// around fixed obstacles, pinned at handle positions, with parallel
// segments nudged apart. It takes the loaded libavoid instance so the
// worker (route.worker.ts) and tests can each load the library their own
// way. Every run builds and frees its own router.

import type { Pin, Route, Scene, Side } from './routing.ts'

// The libavoid surface used here (libavoid-js ships loose typings).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Avoid = any

// libavoid ConnDirFlags.
const DIR: Record<Side, number> = { top: 1, bottom: 2, left: 4, right: 8 }
const ORTHOGONAL = 2

export const ROUTE_PARAMS = {
  // Clearance kept around nodes.
  buffer: 10,
  // Spacing between nudged parallel segments.
  nudge: 6,
}

export function routeScene(A: Avoid, scene: Scene): Map<string, Route> {
  const router = new A.Router(ORTHOGONAL)
  const temps: { delete(): void }[] = []
  const tmp = <T extends { delete(): void }>(o: T): T => {
    temps.push(o)
    return o
  }
  try {
    router.setRoutingParameter(A.RoutingParameter.shapeBufferDistance, ROUTE_PARAMS.buffer)
    router.setRoutingParameter(A.RoutingParameter.idealNudgingDistance, ROUTE_PARAMS.nudge)
    router.setRoutingOption(A.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, false)
    router.setRoutingOption(A.RoutingOption.nudgeSharedPathsWithCommonEndPoint, false)

    const shapes = new Map<string, { ref: any; x: number; y: number }>()
    for (const o of scene.obstacles) {
      const rect = tmp(new A.Rectangle(tmp(new A.Point(o.x, o.y)), tmp(new A.Point(o.x + o.width, o.y + o.height))))
      shapes.set(o.id, { ref: new A.ShapeRef(router, rect), x: o.x, y: o.y })
    }

    // One pin per distinct wire end (class ids are per router); several
    // wires may share a pin (one field feeding many inputs).
    const pins = new Map<string, number>()
    let nextClass = 1
    const endOf = (p: Pin): any => {
      const shape = shapes.get(p.node)
      if (!shape) return tmp(new A.ConnEnd(tmp(new A.Point(p.x, p.y))))
      const key = `${p.node}|${p.x},${p.y}|${p.side}`
      let cls = pins.get(key)
      if (cls === undefined) {
        cls = nextClass++
        pins.set(key, cls)
        const pin = new A.ShapeConnectionPin(shape.ref, cls, p.x - shape.x, p.y - shape.y, false, 0, DIR[p.side])
        pin.setExclusive(false)
      }
      return tmp(new A.ConnEnd(shape.ref, cls))
    }

    const conns: [string, any][] = []
    for (const e of scene.edges) {
      const c = new A.ConnRef(router, endOf(e.source), endOf(e.target))
      conns.push([e.id, c])
    }
    router.processTransaction()

    const out = new Map<string, Route>()
    for (const [id, c] of conns) {
      const line = c.displayRoute()
      const points = []
      for (let i = 0; i < line.size(); i++) {
        const p = line.at(i)
        points.push({ x: p.x, y: p.y })
      }
      if (points.length >= 2) out.set(id, { points })
    }
    return out
  } finally {
    for (const t of temps) t.delete()
    // The router owns and frees its shapes, pins and connectors.
    router.delete()
  }
}
