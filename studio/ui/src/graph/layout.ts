// Layout sidecar: foo.json keeps its graph layout in foo.layout.json
// beside it (GET/PUT /api/layout). Schema, version 1:
//
//   {
//     "version": 1,
//     "nodes": {"<node id>": {"x": 312, "y": 40, "collapsed": true}},
//     "lanes": ["<lane id>", ...]
//   }
//
// - nodes: keyed by the JSON-path node id (nodePath.ts). Only nodes the
//   user placed are listed; every other node keeps its auto-layout
//   position. x/y are React Flow positions (px, integers). collapsed is
//   optional and reserved for collapsible nodes.
// - lanes: optional lane order for multi-lane roots (compose), by lane id.
// - Unknown top-level keys and unknown per-node keys are kept as-is.
//
// Loading is forgiving: a missing, broken or wrong-version sidecar means
// auto-layout, and entries naming nodes that no longer exist are ignored.
// Stale entries are dropped the next time the sidecar is saved.

export const LAYOUT_VERSION = 1

export type NodeLayout = { x: number; y: number; collapsed?: boolean; [key: string]: unknown }

export type Layout = {
  version: number
  nodes: Record<string, NodeLayout>
  lanes?: string[]
  [key: string]: unknown
}

export function emptyLayout(): Layout {
  return { version: LAYOUT_VERSION, nodes: {} }
}

// parseLayout validates a sidecar value, dropping malformed entries. Any
// value it cannot use (null, not an object, other version) yields an empty
// layout.
export function parseLayout(v: unknown): Layout {
  if (!isObject(v) || v.version !== LAYOUT_VERSION) return emptyLayout()
  const nodes: Record<string, NodeLayout> = {}
  if (isObject(v.nodes)) {
    for (const [id, e] of Object.entries(v.nodes)) {
      if (isObject(e) && isFiniteNumber(e.x) && isFiniteNumber(e.y)) nodes[id] = { ...e, x: e.x, y: e.y }
    }
  }
  const out: Layout = { ...v, version: LAYOUT_VERSION, nodes }
  if ('lanes' in v) {
    if (Array.isArray(v.lanes) && v.lanes.every((l) => typeof l === 'string')) out.lanes = v.lanes
    else delete out.lanes
  }
  return out
}

// positionOf returns the saved position for a node id, if any.
export function positionOf(layout: Layout, id: string): { x: number; y: number } | undefined {
  const e = Object.hasOwn(layout.nodes, id) ? layout.nodes[id] : undefined
  return e && { x: e.x, y: e.y }
}

// moveNode records a user placement (rounded to whole pixels).
export function moveNode(layout: Layout, id: string, pos: { x: number; y: number }): Layout {
  const prev = Object.hasOwn(layout.nodes, id) ? layout.nodes[id] : {}
  return { ...layout, nodes: { ...layout.nodes, [id]: { ...prev, x: Math.round(pos.x), y: Math.round(pos.y) } } }
}

// pruneLayout drops node entries whose ids are not in live.
export function pruneLayout(layout: Layout, live: Iterable<string>): Layout {
  const ids = new Set(live)
  const nodes = Object.fromEntries(Object.entries(layout.nodes).filter(([id]) => ids.has(id)))
  return { ...layout, nodes }
}

// layoutText is the compact JSON sent to the server (which applies house
// style) and the basis of the dirty check.
export function layoutText(layout: Layout): string {
  const { version, nodes, ...rest } = layout
  return JSON.stringify({ version, nodes, ...rest })
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
