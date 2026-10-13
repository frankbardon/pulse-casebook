import { createContext } from 'react'
import type { Route } from './routing.ts'

// Wire drawing: "routed" draws orthogonal wires routed around nodes
// (libavoid in a worker), "curves" React Flow's plain bezier curves.
export type WireMode = 'routed' | 'curves'

const WIRE_MODE_KEY = 'studio.wires'

export function readWireMode(): WireMode {
  try {
    return localStorage.getItem(WIRE_MODE_KEY) === 'curves' ? 'curves' : 'routed'
  } catch {
    return 'routed'
  }
}

export function writeWireMode(m: WireMode): void {
  try {
    localStorage.setItem(WIRE_MODE_KEY, m)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

// RouteStore holds the latest routes outside React state; each wire
// subscribes to its own route, so a reroute re-renders only the wires
// whose path changed.
export class RouteStore {
  private routes = new Map<string, Route>()
  private subs = new Map<string, Set<() => void>>()

  get = (id: string): Route | undefined => this.routes.get(id)

  subscribe(id: string, fn: () => void): () => void {
    let s = this.subs.get(id)
    if (!s) this.subs.set(id, (s = new Set()))
    s.add(fn)
    return () => s.delete(fn)
  }

  replace(next: Map<string, Route>): void {
    const prev = this.routes
    this.routes = next
    for (const id of new Set([...prev.keys(), ...next.keys()])) {
      if (samePoints(prev.get(id), next.get(id))) {
        // Keep the old object so unchanged wires do not re-render.
        const old = prev.get(id)
        if (old) next.set(id, old)
        continue
      }
      for (const fn of this.subs.get(id) ?? []) fn()
    }
  }
}

function samePoints(a: Route | undefined, b: Route | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.points.length !== b.points.length) return false
  return a.points.every((p, i) => Math.abs(p.x - b.points[i].x) < 0.01 && Math.abs(p.y - b.points[i].y) < 0.01)
}

export const RouteContext = createContext<RouteStore | null>(null)
