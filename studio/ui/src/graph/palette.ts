// palette is the node palette's model: every manifest operator as a
// placeable item, grouped by stage column, searchable by name and
// description, and narrowed to the operators a dragged field port can
// feed. Placing an item appends a new section entry to the request and
// rebuilds the lossless model from the emitted tree (the same route
// wiring.deleteNode takes); the wire from a dragged port is then written
// with wiring.connectWire and default params with jsonEdit.setIn +
// model.updateNode, so nothing is ever round-tripped through
// JSON.parse/stringify.
//
// The palette is derived from the catalog alone, so a catalog reload (a
// Pulse bump or a changed feature set, see catalog.ts) regenerates it
// without code changes. Pure: no React.

import type { CohortField, Manifest, ManifestOperator } from '../api.ts'
import { getIn, setIn } from './jsonEdit.ts'
import { fromPlain, stringValue, type JsonNode } from './jsonTree.ts'
import { buildModel, emitModel, updateNode, type GraphModel } from './model.ts'
import { formatPath, isPathPrefix, type PathSegment } from './nodePath.ts'
import { paramField, topLevelKeys } from './paramForms.ts'
import { maxJoins } from './joins.ts'
import { compatibleOperators, refusal, slotsFor, type Slot } from './ports.ts'
import { canSee, COLUMNS, sectionInfo, type ColumnKey } from './requestGraph.ts'
import { connectWire } from './wiring.ts'

// PALETTE_MIME carries a palette item's key in a drag onto the canvas.
export const PALETTE_MIME = 'application/x-pulse-palette'

// PALETTE_SECTIONS are the request sections whose operators the manifest
// lists, in stage order. Sections without manifest operators (sort,
// crosstab, return) are not in the palette; joins, vectors and
// multiplicity are, as fixed BLOCK_ITEMS entries.
export const PALETTE_SECTIONS = [
  'features',
  'filterers',
  'attributes',
  'groups',
  'aggregations',
  'windows',
  'tests',
  'regressions',
  'matrices',
  'post_tests',
  'overlays',
] as const

// PaletteItem is one placeable operator. op is the manifest name (or
// overlay kind); type is what the entry's operator key gets (a tier-2
// post-test variant `TEST_X/v` is written as type TEST_X with
// params.variant v).
export type PaletteItem = {
  key: string
  section: string
  column: ColumnKey
  // Section title (`Feature`, `Post-test`).
  kind: string
  op: string
  type: string
  variant?: string
  description?: string
}

// BLOCK_ITEMS are request blocks the manifest lists no operators for,
// placed as fixed items after the manifest's: a join (`{"right": "",
// "kind": "inner", "on": []}`, as many as the manifest's join envelope
// allows; the right cohort is picked in the inspector, keys wired in), a vector (a named member
// set, `{"name": <unique>, "fields": []}`; members are wired in) and the
// multiplicity block (one per request, method written to `method`;
// family and alpha are set in the inspector).
export const BLOCK_ITEMS: readonly PaletteItem[] = [
  {
    key: 'joins/JOIN',
    section: 'joins',
    column: 'source',
    kind: 'Join',
    op: 'JOIN',
    type: 'inner',
    description: "Inner hash join of a second cohort on key fields: its fields join the request's, prefixed with as.",
  },
  {
    key: 'vectors/VECTOR',
    section: 'vectors',
    column: 'analysis',
    kind: 'Vector',
    op: 'VECTOR',
    type: 'VECTOR',
    description: 'A named set of numeric member fields that matrices, k-means groups and vector aggregations read.',
  },
  {
    key: 'multiplicity/MULTIPLICITY',
    section: 'multiplicity',
    column: 'output',
    kind: 'Multiplicity',
    op: 'MULTIPLICITY',
    type: 'holm',
    description: "Multiple-comparison correction of the request's tests: method, family and alpha.",
  },
]

// paletteItems lists every manifest operator in stage order, manifest
// order within a section, then BLOCK_ITEMS.
export function paletteItems(manifest: Manifest | undefined): PaletteItem[] {
  if (!manifest) return []
  const out: PaletteItem[] = []
  for (const section of PALETTE_SECTIONS) {
    const info = sectionInfo(section)
    if (!info?.catalog) continue
    for (const o of info.catalog(manifest) ?? []) {
      const op = o.name ?? o.kind
      if (!op) continue
      const split = splitVariant(o, op)
      out.push({
        key: `${section}/${op}`,
        section,
        column: info.column,
        kind: info.title,
        op,
        ...split,
        ...(o.description && { description: o.description }),
      })
    }
  }
  out.push(...BLOCK_ITEMS)
  return out
}

function splitVariant(o: ManifestOperator, op: string): { type: string; variant?: string } {
  const slash = op.indexOf('/')
  if (slash < 0) return { type: op }
  return { type: o.family ?? op.slice(0, slash), variant: o.variant ?? op.slice(slash + 1) }
}

// searchPalette keeps the items matching every whitespace-separated word
// of query (case-insensitive) in the operator name, description or
// section title. An empty query keeps everything.
export function searchPalette<T extends PaletteItem>(items: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...items]
  return items.filter((it) => {
    const hay = `${it.op} ${it.op.replace(/_/g, ' ')} ${it.kind} ${it.description ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export type PaletteGroup<T extends PaletteItem> = { column: ColumnKey; title: string; items: T[] }

// paletteGroups groups items by stage column, in column order.
export function paletteGroups<T extends PaletteItem>(items: readonly T[]): PaletteGroup<T>[] {
  return COLUMNS.map((c) => ({ column: c.key, title: c.title, items: items.filter((it) => it.column === c.key) })).filter(
    (g) => g.items.length > 0,
  )
}

// PortSource is the field port a drag started from: a cohort field, or a
// producer's label output (producer = its section and index).
export type PortSource = { ref: string; type?: string; producer?: { section: string; index: number } }

// PortItem is a palette item a port can feed, with the input the wire
// goes into.
export type PortItem = PaletteItem & { slot: Slot; rowKey: string }

// itemsForPort narrows the palette to the operators a dragged port can
// feed: the operator has a field input that takes the port's type
// (ports.compatibleOperators, then the first such input), and, for a
// label, the new entry (appended to its section) runs after the
// producer. Operators without field inputs (overlays) are left out.
export function itemsForPort(
  items: readonly PaletteItem[],
  manifest: Manifest | undefined,
  model: GraphModel,
  src: PortSource,
  base: readonly PathSegment[] = [],
): PortItem[] {
  const compatible = new Map<string, Set<string>>()
  const out: PortItem[] = []
  for (const it of items) {
    let ok = compatible.get(it.section)
    if (!ok) {
      ok = new Set(compatibleOperators(manifest, it.section, src.type).map((o) => o.name ?? o.kind ?? ''))
      compatible.set(it.section, ok)
    }
    if (!ok.has(it.op)) continue
    const slot = slotsFor(manifest, it.section, it.op).find((s) => !s.groupKey && refusal(s.accept, src.type) === null)
    if (!slot) continue
    if (src.producer && !canSee(it.section, nextIndex(model, it.section, base), src.producer.section, src.producer.index, slot.key)) {
      continue
    }
    out.push({ ...it, slot, rowKey: slot.list ? formatPath([slot.key, 0]) : slot.key })
  }
  return out
}

// nextIndex is the index a new entry of section gets (appended) in the
// request at base ([] for a plain request, ['requests', 1] for a compose
// slot).
export function nextIndex(model: GraphModel, section: string, base: readonly PathSegment[] = []): number {
  const arr = getIn(emitModel(model), [...base, section])
  return arr?.type === 'array' ? arr.items.length : 0
}

export type PlaceOptions = {
  manifest?: Manifest
  schema?: unknown
  // Cohort fields: generated labels avoid their names too.
  cohortFields?: CohortField[]
  // Wire the new entry's input rowKey to ref (a drag from a port).
  wire?: { rowKey: string; ref: string }
  // The request the entry goes into: [] (the default) for a plain
  // request, ['requests', 1] for a compose slot, ['fits', 0, 'request']
  // for a compose fit.
  base?: readonly PathSegment[]
}

// placeNode appends a new entry for item to its section and returns the
// rebuilt model and the new node's id. The entry gets the operator, a
// unique label where the section names its entries, the wire (if any),
// required params that have a manifest default, a post-test variant and
// an overlay's only scope. Required params without a default are left
// for the inspector to flag.
export function placeNode(model: GraphModel, item: PaletteItem, opts: PlaceOptions = {}): { model: GraphModel; id: string } {
  const info = sectionInfo(item.section)
  if (!info) throw new Error(`${item.section} is not a palette section`)
  const base = opts.base ?? []
  const root = emitModel(model)
  if (base.length > 0 && getIn(root, base)?.type !== 'object') throw new Error(`${formatPath(base)} is not a request`)
  if (info.single) {
    // A one-per-request block (multiplicity): written whole, never twice.
    if (getIn(root, [...base, item.section]) !== undefined) throw new Error(`this request already has a ${info.title.toLowerCase()} block`)
    const block = info.opKey ? fromPlain({ [info.opKey]: item.type }) : fromPlain({})
    const id = formatPath([...base, item.section])
    return { model: buildModel(setIn(root, [...base, item.section], block), model.kind), id }
  }
  const arr = getIn(root, [...base, item.section])
  if (arr !== undefined && arr.type !== 'array') throw new Error(`${item.section} is not a list in this request`)
  const index = arr ? arr.items.length : 0
  if (item.section === 'joins' && index >= maxJoins(opts.manifest)) {
    throw new Error(`this request already has ${index === 1 ? 'a join' : `${index} joins`}: the engine runs ${maxJoins(opts.manifest)} per request`)
  }

  let value: JsonNode = { type: 'object', members: [] }
  const str = (s: string): JsonNode => ({ type: 'string', raw: JSON.stringify(s) })
  if (info.opKey) value = setIn(value, [info.opKey], str(item.type))
  if (info.nameKey) value = setIn(value, [info.nameKey], str(uniqueLabel(model, item, opts)))
  // A vector starts with no members; they are wired in.
  if (item.section === 'vectors') value = setIn(value, ['fields'], { type: 'array', items: [] })
  // A join in JoinSpec key order: right (picked in the inspector), kind, on.
  if (item.section === 'joins') value = fromPlain({ right: '', kind: item.type, on: [] })

  const next = setIn(root, arr ? [...base, item.section, index] : [...base, item.section], arr ? value : { type: 'array', items: [value] })
  let out = buildModel(next, model.kind)
  const id = formatPath([...base, item.section, index])
  if (opts.wire) out = connectWire(out, id, opts.wire.rowKey, opts.wire.ref)

  let v = out.nodes.get(id)!.value
  const op = (manifestOps(opts.manifest, item.section) ?? []).find((o) => (o.name ?? o.kind) === item.op)
  const top = topLevelKeys(opts.schema, item.section)
  for (const p of op?.params ?? []) {
    if (!p.required || p.default === undefined) continue
    const rel = paramField(p, v, top).rel
    if (getIn(v, rel) === undefined) v = setIn(v, rel, fromPlain(p.default))
  }
  if (item.variant !== undefined) v = setIn(v, ['params', 'variant'], str(item.variant))
  if (item.section === 'overlays' && op?.scopes?.length === 1) v = setIn(v, ['scope'], str(op.scopes[0]))
  out = updateNode(out, id, v)
  return { model: out, id }
}

function manifestOps(manifest: Manifest | undefined, section: string): ManifestOperator[] | undefined {
  const info = sectionInfo(section)
  return manifest && info?.catalog ? info.catalog(manifest) : undefined
}

// uniqueLabel derives a label from the operator (FEAT_BUCKETIZE ->
// bucketize, prefixed with the wired field: tenure_bucketize) that no
// entry label, entry name or cohort field already uses.
// With a base, only that request's entries count (each compose slot is
// its own label namespace).
export function uniqueLabel(model: GraphModel, item: PaletteItem, opts: Pick<PlaceOptions, 'wire' | 'cohortFields' | 'base'> = {}): string {
  const taken = new Set<string>(opts.cohortFields?.map((f) => f.name))
  const scope = opts.base && opts.base.length > 0 ? formatPath(opts.base) : ''
  for (const n of model.nodes.values()) {
    if (n.kind !== 'entry') continue
    if (scope !== '' && !isPathPrefix(scope, n.id)) continue
    const key = sectionInfo(n.section)?.nameKey
    const name = key ? stringValue(getIn(n.value, [key])) : undefined
    if (name !== undefined) taken.add(name)
  }
  const short = item.type.replace(/^[A-Z]+_/, '').toLowerCase()
  const base = opts.wire ? `${opts.wire.ref}_${short}` : short
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`
}
