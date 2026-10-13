// lanes holds the lossless model edits behind compose and chain lanes:
// adding a slot or stage, removing a slot, fit or stage, renaming one (a
// slot's `label`, a fit's or stage's `name`; fit bindings follow), and
// moving a chain stage (stage order is the document's, unlike compose
// lane order). Every edit goes through
// jsonEdit.setIn on the emitted tree and rebuilds the model, the route
// wiring.deleteNode and palette.placeNode take; nothing is round-tripped
// through JSON.parse/stringify. Lane order is not a document edit: it
// lives in the layout sidecar (composeGraph.laneOrder / moveLane).

import { getIn, setIn } from './jsonEdit.ts'
import { stringValue, type JsonNode } from './jsonTree.ts'
import { buildModel, emitModel, type GraphModel } from './model.ts'
import { formatPath, parsePath, type PathSegment } from './nodePath.ts'
import { bindsFit, FIT_ROW } from './wiring.ts'

const str = (s: string): JsonNode => ({ type: 'string', raw: JSON.stringify(s) })

// laneKey splits a lane id (`requests[1]`, `fits[0]`) into its list key
// and index.
function laneKey(id: string): { key: 'requests' | 'fits' | 'stages'; index: number } {
  const segs = parsePath(id)
  if (segs.length === 2 && (segs[0] === 'requests' || segs[0] === 'fits' || segs[0] === 'stages') && typeof segs[1] === 'number') {
    return { key: segs[0], index: segs[1] }
  }
  throw new Error(`${id} is not a slot, fit or stage`)
}

// laneNoun names what a lane id holds in user-visible text: a compose
// slot (`requests[i]`), a fit (`fits[j]`) or a chain stage (`stages[k]`).
// Anything else (the root lane) is the request kind itself.
export function laneNoun(id: string, kind?: string): string {
  if (id.startsWith('requests[')) return 'slot'
  if (id.startsWith('fits[')) return 'fit'
  if (id.startsWith('stages[')) return 'stage'
  return kind === 'chain' ? 'chain' : 'compose'
}

// slotLabels lists the labels the compose slots use.
function slotLabels(root: JsonNode): string[] {
  const reqs = getIn(root, ['requests'])
  if (reqs?.type !== 'array') return []
  return reqs.items.map((r) => stringValue(getIn(r, ['label']))).filter((l): l is string => l !== undefined)
}

// addLane appends a compose slot labelled slot_<n> (unique) that reads
// the last slot's cohort (copied verbatim), and returns its lane id.
export function addLane(model: GraphModel): { model: GraphModel; id: string } {
  if (model.kind === 'chain') return addStage(model)
  if (model.kind !== 'compose') throw new Error('only compose requests have slots and only chain requests have stages')
  const root = emitModel(model)
  const reqs = getIn(root, ['requests'])
  if (reqs !== undefined && reqs.type !== 'array') throw new Error('requests is not a list')
  const items = reqs?.items ?? []
  const n = items.length
  const taken = new Set(slotLabels(root))
  let label = `slot_${n + 1}`
  for (let k = 2; taken.has(label); k++) label = `slot_${n + 1}_${k}`
  let slot: JsonNode = setIn({ type: 'object', members: [] }, ['label'], str(label))
  const cohort = n > 0 ? getIn(items[n - 1], ['cohort']) : undefined
  if (cohort !== undefined) slot = setIn(slot, ['cohort'], cohort)
  const next = setIn(root, reqs ? ['requests', n] : ['requests'], reqs ? slot : { type: 'array', items: [slot] })
  return { model: buildModel(next, model.kind), id: formatPath(['requests', n]) }
}

// addStage appends a chain stage named stage_<n> (unique) that counts the
// previous stage's rows: AGG_COUNT over its first output column (group
// field, else aggregation label), labelled n, the same shape as the new
// chain template. Without an output column to count the stage starts
// empty and validation says what it needs.
function addStage(model: GraphModel): { model: GraphModel; id: string } {
  const root = emitModel(model)
  const stages = getIn(root, ['stages'])
  if (stages !== undefined && stages.type !== 'array') throw new Error('stages is not a list')
  const items = stages?.items ?? []
  const n = items.length
  const taken = new Set(items.map((s) => stringValue(getIn(s, ['name']))).filter((x): x is string => x !== undefined))
  let name = `stage_${n + 1}`
  for (let k = 2; taken.has(name); k++) name = `stage_${n + 1}_${k}`
  const prev = n > 0 ? getIn(items[n - 1], ['request']) : undefined
  const column = firstOutput(prev)
  let req: JsonNode = { type: 'object', members: [] }
  if (column !== undefined) {
    let agg: JsonNode = setIn({ type: 'object', members: [] }, ['type'], str('AGG_COUNT'))
    agg = setIn(agg, ['field'], str(column))
    agg = setIn(agg, ['label'], str('n'))
    req = setIn(req, ['aggregations'], { type: 'array', items: [agg] })
  }
  let stage: JsonNode = setIn({ type: 'object', members: [] }, ['name'], str(name))
  stage = setIn(stage, ['request'], req)
  const next = setIn(root, stages ? ['stages', n] : ['stages'], stages ? stage : { type: 'array', items: [stage] })
  return { model: buildModel(next, model.kind), id: formatPath(['stages', n]) }
}

// firstOutput is a stage request's first output column: its first group
// field, else its first aggregation label.
function firstOutput(req: JsonNode | undefined): string | undefined {
  for (const [section, key] of [
    ['groups', 'field'],
    ['aggregations', 'label'],
  ] as const) {
    const arr = getIn(req, [section])
    if (arr?.type !== 'array') continue
    for (const e of arr.items) {
      const v = stringValue(getIn(e, [key]))
      if (v !== undefined) return v
    }
  }
  return undefined
}

// removable says whether lane id may be removed: any fit, and any slot
// or stage but the last one (a compose needs at least one request, a
// chain one stage).
export function removable(model: GraphModel, id: string): boolean {
  try {
    const { key } = laneKey(id)
    const list = getIn(emitModel(model), [key])
    return list?.type === 'array' && (key === 'fits' || list.items.length > 1)
  } catch {
    return false
  }
}

// removeLane removes a slot or fit. renames maps every id that shifted
// (later lanes and their nodes) to its new id, for the layout sidecar;
// an emptied `fits` list is removed.
export function removeLane(model: GraphModel, id: string): { model: GraphModel; renames: Map<string, string> } {
  if (!removable(model, id)) throw new Error(`cannot remove ${id}`)
  const { key, index } = laneKey(id)
  let root = setIn(emitModel(model), [key, index], undefined)
  const list = getIn(root, [key])
  if (list?.type === 'array' && list.items.length === 0) root = setIn(root, [key], undefined)
  const renames = new Map<string, string>()
  const shift = (other: string) => {
    const segs = parsePath(other)
    if (segs[0] !== key || typeof segs[1] !== 'number' || segs[1] <= index) return
    renames.set(other, formatPath([key, segs[1] - 1, ...segs.slice(2)]))
  }
  for (const other of model.nodes.keys()) shift(other)
  const count = getIn(emitModel(model), [key])
  if (count?.type === 'array') for (let k = index + 1; k < count.items.length; k++) shift(formatPath([key, k]))
  return { model: buildModel(root, model.kind), renames }
}

// renameLane sets a slot's label or a fit's or stage's name. An empty
// slot label or stage name removes the key (the engine then defaults a
// slot to request_<n>; a stage name is only diagnostic); a fit needs a
// name. Renaming a fit rewrites the slot entries bound to the old
// name (`params.fit`), so its bindings follow (a grouper's `params.fit`
// is its global | within enum and is left alone).
export function renameLane(model: GraphModel, id: string, name: string): GraphModel {
  const { key, index } = laneKey(id)
  let root = emitModel(model)
  if (getIn(root, [key, index])?.type !== 'object') throw new Error(`${id} is not a slot, fit or stage`)
  if (key === 'requests' || key === 'stages') {
    root = setIn(root, [key, index, key === 'requests' ? 'label' : 'name'], name === '' ? undefined : str(name))
    return buildModel(root, model.kind)
  }
  if (name === '') throw new Error('a fit needs a name')
  const old = stringValue(getIn(root, ['fits', index, 'name']))
  root = setIn(root, ['fits', index, 'name'], str(name))
  if (old !== undefined && old !== name) {
    const fitPath = parsePath(FIT_ROW)
    for (const n of model.nodes.values()) {
      if (n.kind !== 'entry' || !n.id.startsWith('requests[') || !bindsFit(n.section, '')) continue
      if (stringValue(getIn(n.value, fitPath)) !== old) continue
      const at: PathSegment[] = [...parsePath(n.id), ...fitPath]
      root = setIn(root, at, str(name))
    }
  }
  return buildModel(root, model.kind)
}

// renameLaneIds follows a lane removal in the sidecar's lane order.
export function renameLaneIds(order: readonly string[] | undefined, removed: string, renames: ReadonlyMap<string, string>): string[] | undefined {
  if (order === undefined) return undefined
  return order.filter((id) => id !== removed).map((id) => renames.get(id) ?? id)
}

// moveStage moves chain stage id by delta places (clamped): stage order
// is pipeline order, so it is a document edit. renames maps every node id
// of each stage that changed place (and the lane ids) to its new id, for
// the layout sidecar.
export function moveStage(model: GraphModel, id: string, delta: number): { model: GraphModel; renames: Map<string, string> } {
  const { key, index } = laneKey(id)
  if (key !== 'stages') throw new Error(`${id} is not a chain stage`)
  const root = emitModel(model)
  const list = getIn(root, ['stages'])
  if (list?.type !== 'array') throw new Error('stages is not a list')
  const to = Math.max(0, Math.min(list.items.length - 1, index + delta))
  const renames = new Map<string, string>()
  if (to === index) return { model, renames }
  const items = [...list.items]
  const [moved] = items.splice(index, 1)
  items.splice(to, 0, moved)
  // Old index -> new index for every stage that shifted.
  const place = new Map<number, number>()
  for (let k = Math.min(index, to); k <= Math.max(index, to); k++) {
    place.set(k, k === index ? to : index < to ? k - 1 : k + 1)
  }
  const follow = (other: string) => {
    const segs = parsePath(other)
    if (segs[0] !== 'stages' || typeof segs[1] !== 'number') return
    const at = place.get(segs[1])
    if (at !== undefined) renames.set(other, formatPath(['stages', at, ...segs.slice(2)]))
  }
  for (const other of model.nodes.keys()) follow(other)
  for (const k of place.keys()) follow(formatPath(['stages', k]))
  return { model: buildModel(setIn(root, ['stages'], { ...list, items }), model.kind), renames }
}
