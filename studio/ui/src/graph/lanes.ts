// lanes holds the lossless model edits behind compose lanes: adding a
// slot, removing a slot or fit, and renaming one (a slot's `label`, a
// fit's `name`, which its bindings follow). Every edit goes through
// jsonEdit.setIn on the emitted tree and rebuilds the model, the route
// wiring.deleteNode and palette.placeNode take; nothing is round-tripped
// through JSON.parse/stringify. Lane order is not a document edit: it
// lives in the layout sidecar (composeGraph.laneOrder / moveLane).

import { getIn, setIn } from './jsonEdit.ts'
import { stringValue, type JsonNode } from './jsonTree.ts'
import { buildModel, emitModel, type GraphModel } from './model.ts'
import { formatPath, parsePath, type PathSegment } from './nodePath.ts'
import { FIT_ROW } from './wiring.ts'

const str = (s: string): JsonNode => ({ type: 'string', raw: JSON.stringify(s) })

// laneKey splits a lane id (`requests[1]`, `fits[0]`) into its list key
// and index.
function laneKey(id: string): { key: 'requests' | 'fits'; index: number } {
  const segs = parsePath(id)
  if (segs.length === 2 && (segs[0] === 'requests' || segs[0] === 'fits') && typeof segs[1] === 'number') {
    return { key: segs[0], index: segs[1] }
  }
  throw new Error(`${id} is not a lane`)
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
  if (model.kind !== 'compose') throw new Error('only compose requests have lanes')
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

// removable says whether lane id may be removed: any fit, and any slot
// but the last one (a compose needs at least one request).
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

// renameLane sets a slot's label or a fit's name. An empty slot label
// removes the key (the engine then defaults it to request_<n>); a fit
// needs a name. Renaming a fit rewrites the slot entries bound to the old
// name (`params.fit`), so its bindings follow.
export function renameLane(model: GraphModel, id: string, name: string): GraphModel {
  const { key, index } = laneKey(id)
  let root = emitModel(model)
  if (getIn(root, [key, index])?.type !== 'object') throw new Error(`${id} is not a lane`)
  if (key === 'requests') {
    root = setIn(root, ['requests', index, 'label'], name === '' ? undefined : str(name))
    return buildModel(root, model.kind)
  }
  if (name === '') throw new Error('a fit needs a name')
  const old = stringValue(getIn(root, ['fits', index, 'name']))
  root = setIn(root, ['fits', index, 'name'], str(name))
  if (old !== undefined && old !== name) {
    const fitPath = parsePath(FIT_ROW)
    for (const n of model.nodes.values()) {
      if (n.kind !== 'entry' || !n.id.startsWith('requests[')) continue
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
