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
import { formatPath, frameOf, parsePath, type PathSegment } from './nodePath.ts'
import { FACET_NODE } from './facetGraph.ts'
import { emitsType, findOperator, refusal, slotFor, vectorMemberRefusal } from './ports.ts'
import { groupKeyColumn, PARTITION_PATH, removePartitionItem, wireRefusal, type GroupEntry } from './partition.ts'
import { canSee, joinKeyCheck, LAYOUT, type ColumnKey, type RequestGraph } from './requestGraph.ts'

// FIT_HANDLE is the source handle of a compose fit's regression; a wire
// from it into an entry's `params.fit` input binds the fit by name.
export const FIT_HANDLE = 'fit'

// FIT_ROW is the input row a fit binding writes (ATTR_REG_PREDICT `fit`).
export const FIT_ROW = 'params.fit'

// bindsFit says whether an entry's `params.fit` names a compose fit. Not
// every `params.fit` does: GROUP_KMEANS / GROUP_QUANTILE take a `fit`
// enum (global | within: fit centroids / cut points once over the
// filtered set, or per bucket of the groupers before it), which is a
// plain param, never a fit binding. Groupers are excluded outright; any
// other operator whose manifest `fit` param is an enum is too.
export function bindsFit(section: string, op: string, manifest?: Manifest): boolean {
  if (section === 'groups') return false
  const p = findOperator(manifest, section, op)?.params?.find((x) => x.name === 'fit')
  return p === undefined || p.type !== 'enum'
}

// Wire is a connection as React Flow reports it.
export type Wire = {
  source: string | null
  sourceHandle?: string | null
  target: string | null
  targetHandle?: string | null
}

export type WireContext = { manifest?: Manifest; cohortFields?: CohortField[] }

// also lists further writes the wire implies (a new join pair's
// same-named right_field), applied with connectWire after the wire.
export type WireCheck =
  | { ok: true; ref: string; rowKey: string; sourceType?: string; also?: { rowKey: string; ref: string }[] }
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

  // Compose fits bind across lanes: a fit's regression into a slot
  // entry's fit input, and nothing else into that input.
  if (wire.sourceHandle === FIT_HANDLE) {
    if (src.type !== 'op' || src.data.fit === undefined) return { ok: false, reason: 'not a compose fit' }
    if (rowKey !== FIT_ROW || !bindsFit(section, op, ctx.manifest)) return { ok: false, reason: `fit ${src.data.fit} binds only a fit input` }
    if (!frameOf(tgt.id).startsWith('requests[')) return { ok: false, reason: 'only compose slots read fits' }
    return { ok: true, ref: src.data.fit, rowKey }
  }
  if (rowKey === FIT_ROW) return { ok: false, reason: `${op} fit takes a compose fit: wire it from a fit's regression` }
  // Each lane (compose slot or fit) is its own request: it cannot see
  // another lane's fields or labels. A chain stage reads the stage before
  // it: the first stage the chain cohort, a later stage the previous
  // stage's aggregation labels.
  const across = frameOf(src.id) !== frameOf(tgt.id)
  if (across && !feedsStage(src, tgt)) {
    return { ok: false, reason: stageOf(tgt.id) !== undefined ? 'a chain stage reads only the stage before it' : 'lanes cannot see each other\'s fields or labels' }
  }

  let ref: string
  let type: string | undefined
  let from: string
  // A join's keys read the left cohort: only its left_field inputs, and
  // only from the cohort.
  if (section === 'joins') {
    if (!/^on\[\d+\]\.left_field$/.test(rowKey)) return { ok: false, reason: 'a join takes cohort fields only as left_field keys' }
    if (src.type !== 'cohort' || !wire.sourceHandle?.startsWith('field:')) {
      return { ok: false, reason: 'a join\'s left_field reads the left cohort, not joined fields or labels' }
    }
  }
  if (src.type === 'cohort' && wire.sourceHandle?.startsWith('field:')) {
    ref = wire.sourceHandle.slice('field:'.length)
    if (role === 'vector') return { ok: false, reason: 'vector inputs take a vector, not a cohort field' }
    type = ctx.cohortFields?.find((f) => f.name === ref)?.type
    from = `field ${ref}`
    if (section === 'joins') {
      const why = joinKeyCheck(tgt, rowKey, type)
      if (why) return { ok: false, reason: `join ${rowKey}: ${why} (${from})` }
      const pair = /^on\[(\d+)\]/.exec(rowKey)![0]
      const info = tgt.data.join
      // A new pair takes the same-named right field when there is one.
      const fill =
        !tgt.data.rows.some((r) => r.key === `${pair}.right_field`) && info?.state === 'known' && info.fields.some((f) => f.name === info.as + ref)
          ? [{ rowKey: `${pair}.right_field`, ref }]
          : undefined
      return { ok: true, ref, rowKey, ...(type && { sourceType: type }), ...(fill && { also: fill }) }
    }
  } else if (src.type === 'op' && wire.sourceHandle?.startsWith('field:') && src.data.join) {
    // A joined field, from its join node.
    ref = wire.sourceHandle.slice('field:'.length)
    if (role === 'vector') return { ok: false, reason: 'vector inputs take a vector, not a joined field' }
    type = src.data.join.fields.find((f) => f.name === ref)?.type || undefined
    from = `joined field ${ref}`
  } else if (src.type === 'op' && wire.sourceHandle === 'out' && src.data.name !== undefined) {
    ref = src.data.name
    if (!across && !canSee(section, indexOf(tgt.id), src.data.section, indexOf(src.id), role)) {
      return { ok: false, reason: `${tgt.data.title.toLowerCase()} runs before ${src.data.title.toLowerCase()} ${ref} exists` }
    }
    type = emitsType(ctx.manifest, src.data.section, src.data.op)
    from = `${src.data.title.toLowerCase()} ${ref}`
  } else {
    return { ok: false, reason: 'not a field or label output' }
  }

  const slot = slotFor(ctx.manifest, section, op, rowKey)
  const why =
    section === 'vectors' && slot.key === 'fields'
      ? vectorMemberRefusal(type, tgt.data.rows.find((r) => r.key === 'coerce')?.value)
      : refusal(slot.accept, type)
  if (why) return { ok: false, reason: `${op} ${slot.key} ${why} (${from})` }
  if (slot.groupKey) {
    const keys = groupKeysOfGraph(graph.nodes, frameOf(tgt.id))
    const at = /\[(\d+)\]$/.exec(rowKey)
    const refused = wireRefusal(ref, at ? Number(at[1]) : 0, keys)
    if (refused) return { ok: false, reason: `${op} ${refused}` }
  }
  return { ok: true, ref, rowKey, ...(type && { sourceType: type }) }
}

// groupKeysOfGraph lists the group key columns of a request frame from
// its grouper nodes, in groups order.
export function groupKeysOfGraph(nodes: RequestGraph['nodes'], frame: string): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type !== 'op' || n.data.section !== 'groups' || frameOf(n.id) !== frame) continue
    const at = (k: string) => {
      const r = n.data.rows.find((x) => x.key === k)
      return r ? (r.ref ?? r.value) : undefined
    }
    const first = at('fields[0]')
    const g: GroupEntry = { type: n.data.op, field: at('field'), vector: at('vector'), ...(first !== undefined && { fields: [first] }) }
    out.push(groupKeyColumn(g))
  }
  return out
}

// stageOf is the chain stage index of a node id (`stages[1].request.…`).
function stageOf(id: string): number | undefined {
  const m = /^stages\[(\d+)\]\.request$/.exec(frameOf(id))
  return m ? Number(m[1]) : undefined
}

// feedsStage says whether src may wire into tgt across chain stages: the
// chain cohort into the first stage, or an aggregation into the next.
function feedsStage(src: RequestGraph['nodes'][number], tgt: RequestGraph['nodes'][number]): boolean {
  const t = stageOf(tgt.id)
  if (t === undefined) return false
  if (src.type === 'cohort') return src.id === 'cohort' && t === 0
  return src.type === 'op' && src.data.section === 'aggregations' && stageOf(src.id) === t - 1
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
  // A key inside a list item one past the end (a join's next
  // `on[2].left_field`) appends the item.
  let value = node.value
  const item = rel.slice(0, -1)
  const at = item[item.length - 1]
  if (typeof last === 'string' && typeof at === 'number' && getIn(value, item) === undefined) {
    const empty: JsonNode = { type: 'object', members: [] }
    if (getIn(value, item.slice(0, -1)) === undefined) {
      if (at !== 0) throw new Error(`index [${at}] out of range`)
      value = setIn(value, item.slice(0, -1), { type: 'array', items: [empty] })
    } else value = setIn(value, item, empty)
  }
  return updateNode(model, id, setIn(value, rel, str))
}

// disconnectWire clears the value at rowKey: the member is removed, or
// the list item spliced out. Removing a post-test's last partition key
// removes partition_by (back to the implicit default, not `[]` = no
// partition), and a `params` object that leaves empty goes too.
export function disconnectWire(model: GraphModel, id: string, rowKey: string): GraphModel {
  const node = model.nodes.get(id)
  if (!node) throw new Error(`model has no node ${id}`)
  const rel = parsePath(rowKey)
  if (getIn(node.value, rel) === undefined) return model
  if (rel.length === 3 && rel[0] === PARTITION_PATH[0] && rel[1] === PARTITION_PATH[1] && typeof rel[2] === 'number') {
    return updateNode(model, id, removePartitionItem(node.value, rel[2]))
  }
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
// entries and raw sections can, the cohort and a facet's fields cannot.
export function deletable(model: GraphModel, id: string): boolean {
  const n = model.nodes.get(id)
  // A facet's field list is the facet itself (edit it in the inspector).
  return !!n && n.kind !== 'cohort' && !(model.kind === 'facet' && id === FACET_NODE)
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
