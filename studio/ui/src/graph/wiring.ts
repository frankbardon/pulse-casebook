// wiring turns canvas gestures into lossless model edits: drawing a
// field wire into an input, removing one, deleting a node, and keeping
// dragged nodes in their stage column. checkConnection decides whether a
// wire may be drawn at all (graph visibility plus the type rules in
// ports.ts) and says why not.
//
// Handle scheme (requestGraph.ts): sources are the cohort's
// `field:<name>` handles and a producer's `out`; targets are
// `in:<row key>` where the row key is the value's path relative to the
// entry (`field`, `predictors[1]`, `rows[0].field`). A wire into a
// target writes the source's name at that path; removing the wire
// clears it. Every edit goes through jsonEdit.setIn and model.updateNode
// (or a rebuild from the emitted tree for deletes), never JSON.parse.

import type { CohortField, Manifest } from '../api.ts'
import { getIn, setIn } from './jsonEdit.ts'
import type { JsonNode } from './jsonTree.ts'
import { buildModel, emitModel, updateNode, type GraphModel } from './model.ts'
import { formatPath, parsePath, type PathSegment } from './nodePath.ts'
import { emitsType, refusal, slotFor } from './ports.ts'
import { canSee, LAYOUT, type ColumnKey, type RequestGraph } from './requestGraph.ts'

// Wire is a connection as React Flow reports it.
export type Wire = {
  source: string | null
  sourceHandle?: string | null
  target: string | null
  targetHandle?: string | null
}

export type WireContext = { manifest?: Manifest; cohortFields?: CohortField[] }

export type WireCheck =
  | { ok: true; ref: string; rowKey: string; sourceType?: string }
  | { ok: false; reason: string }

// checkConnection validates a wire against the graph: a source handle
// that names a field or label, a target input on an entry, a producer
// the target can see, and a field type the input takes.
export function checkConnection(graph: Pick<RequestGraph, 'nodes'>, wire: Wire, ctx: WireContext = {}): WireCheck {
  const src = graph.nodes.find((n) => n.id === wire.source)
  const tgt = graph.nodes.find((n) => n.id === wire.target)
  if (!src || !tgt) return { ok: false, reason: 'not a node' }
  if (tgt.type !== 'op' || !wire.targetHandle?.startsWith('in:')) return { ok: false, reason: 'not a field input' }
  if (src.id === tgt.id) return { ok: false, reason: 'a node cannot feed itself' }
  const rowKey = wire.targetHandle.slice(3)
  const role = lastName(rowKey)
  const { section, op } = tgt.data

  let ref: string
  let type: string | undefined
  let from: string
  if (src.type === 'cohort' && wire.sourceHandle?.startsWith('field:')) {
    ref = wire.sourceHandle.slice('field:'.length)
    if (role === 'vector') return { ok: false, reason: 'vector inputs take a vector, not a cohort field' }
    type = ctx.cohortFields?.find((f) => f.name === ref)?.type
    from = `field ${ref}`
  } else if (src.type === 'op' && wire.sourceHandle === 'out' && src.data.name !== undefined) {
    ref = src.data.name
    if (!canSee(section, indexOf(tgt.id), src.data.section, indexOf(src.id), role)) {
      return { ok: false, reason: `${tgt.data.title.toLowerCase()} runs before ${src.data.title.toLowerCase()} ${ref} exists` }
    }
    type = emitsType(ctx.manifest, src.data.section, src.data.op)
    from = `${src.data.title.toLowerCase()} ${ref}`
  } else {
    return { ok: false, reason: 'not a field or label output' }
  }

  const slot = slotFor(ctx.manifest, section, op, rowKey)
  const why = refusal(slot.accept, type)
  if (why) return { ok: false, reason: `${op} ${slot.key} ${why} (${from})` }
  return { ok: true, ref, rowKey, ...(type && { sourceType: type }) }
}

// connectWire writes ref at rowKey inside entry id. A list item one past
// the end appends; a missing list is created.
export function connectWire(model: GraphModel, id: string, rowKey: string, ref: string): GraphModel {
  const node = model.nodes.get(id)
  if (!node) throw new Error(`model has no node ${id}`)
  const rel = parsePath(rowKey)
  const str: JsonNode = { type: 'string', raw: JSON.stringify(ref) }
  const last = rel[rel.length - 1]
  if (typeof last === 'number' && getIn(node.value, rel.slice(0, -1)) === undefined) {
    if (last !== 0) throw new Error(`index [${last}] out of range`)
    return updateNode(model, id, setIn(node.value, rel.slice(0, -1), { type: 'array', items: [str] }))
  }
  return updateNode(model, id, setIn(node.value, rel, str))
}

// disconnectWire clears the value at rowKey: the member is removed, or
// the list item spliced out.
export function disconnectWire(model: GraphModel, id: string, rowKey: string): GraphModel {
  const node = model.nodes.get(id)
  if (!node) throw new Error(`model has no node ${id}`)
  const rel = parsePath(rowKey)
  if (getIn(node.value, rel) === undefined) return model
  return updateNode(model, id, setIn(node.value, rel, undefined))
}

// disconnectWires removes several wires, later list items first so
// earlier indexes stay valid.
export function disconnectWires(model: GraphModel, wires: { target: string; rowKey: string }[]): GraphModel {
  const sorted = [...wires].sort((a, b) => {
    if (a.target !== b.target) return a.target < b.target ? -1 : 1
    return compareDesc(parsePath(a.rowKey), parsePath(b.rowKey))
  })
  return sorted.reduce((m, w) => disconnectWire(m, w.target, w.rowKey), model)
}

// deletable says whether a node can be deleted from the canvas: section
// entries and raw sections can, the cohort cannot.
export function deletable(model: GraphModel, id: string): boolean {
  const n = model.nodes.get(id)
  return !!n && n.kind !== 'cohort'
}

// deleteNode removes a node's JSON from the document and rebuilds the
// model. An array section the removal empties is removed too. renames
// maps the ids of later siblings (and their descendants) to their new,
// shifted ids, so layout entries can follow. Wires into or out of the
// node disappear with it; params downstream that named its label keep
// the name and show as unresolved until rewired.
export function deleteNode(model: GraphModel, id: string): { model: GraphModel; renames: Map<string, string> } {
  if (!deletable(model, id)) throw new Error(`cannot delete ${id}`)
  const path = parsePath(id)
  let root = setIn(emitModel(model), path, undefined)
  const last = path[path.length - 1]
  const parent = path.slice(0, -1)
  if (typeof last === 'number') {
    const arr = getIn(root, parent)
    if (arr?.type === 'array' && arr.items.length === 0) root = setIn(root, parent, undefined)
  }
  const renames = new Map<string, string>()
  if (typeof last === 'number') {
    for (const other of model.nodes.keys()) {
      const segs = parsePath(other)
      if (segs.length < path.length || !samePrefix(segs, parent)) continue
      const i = segs[parent.length]
      if (typeof i !== 'number' || i <= last) continue
      renames.set(other, formatPath([...parent, i - 1, ...segs.slice(parent.length + 1)]))
    }
  }
  return { model: buildModel(root, model.kind), renames }
}

// Column bands: a node belongs to the column whose x it is nearest to.
// clampToColumn keeps a dragged node's x inside its own column's band,
// so it can never be dropped in a column that contradicts the pipeline
// order. columns are the graph's laid-out columns.
export function clampToColumn(
  pos: { x: number; y: number },
  column: ColumnKey,
  columns: readonly { key: ColumnKey; x: number }[],
): { x: number; y: number } {
  const col = columns.find((c) => c.key === column)
  if (!col) return pos
  const half = (LAYOUT.nodeWidth + LAYOUT.columnGap) / 2 - 1
  return { x: Math.min(col.x + half, Math.max(col.x - half, pos.x)), y: pos.y }
}

// columnAt says which laid-out column x falls in (nearest column x).
export function columnAt(x: number, columns: readonly { key: ColumnKey; x: number }[]): ColumnKey | undefined {
  let best: { key: ColumnKey; d: number } | undefined
  for (const c of columns) {
    const d = Math.abs(c.x - x)
    if (!best || d < best.d) best = { key: c.key, d }
  }
  return best?.key
}

// columnAllows says whether a node of column `own` may sit in `at`:
// only its own stage column.
export function columnAllows(own: ColumnKey, at: ColumnKey | undefined): boolean {
  return at === undefined || own === at
}

function samePrefix(segs: PathSegment[], prefix: PathSegment[]): boolean {
  return prefix.every((s, i) => segs[i] === s)
}

function compareDesc(a: PathSegment[], b: PathSegment[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue
    if (typeof a[i] === 'number' && typeof b[i] === 'number') return (b[i] as number) - (a[i] as number)
    return String(a[i]) < String(b[i]) ? -1 : 1
  }
  return b.length - a.length
}

function indexOf(id: string): number {
  const m = /\[(\d+)\]$/.exec(id)
  return m ? Number(m[1]) : 0
}

function lastName(key: string): string {
  const m = /([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])*$/.exec(key)
  return m ? m[1] : key
}
