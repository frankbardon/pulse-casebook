// requestGraph maps a plain Pulse Request to React Flow nodes and edges.
//
// One node per section entry, placed in fixed stage columns that encode the
// engine's pipeline order (Load -> Features -> Filter -> Attributes -> Group
// -> Aggregate -> Windows -> Sort, with the analysis and output sections
// hanging off the end). Every node id is the entry's JSON path (see
// nodePath.ts), e.g. `tests[2]`, `cohort`, `crosstab`. Field wires run from
// the cohort's fields and from upstream labels to the params that name them.
// Sections the builder does not model render as raw JSON nodes.
//
// The function is pure and deterministic: same input, same graph.

import type { Edge, Node } from '@xyflow/react'
import type { CohortField, Manifest, ManifestOperator } from '../api.ts'
import { formatPath, type PathSegment } from './nodePath.ts'
import { describeAccept, slotFor, slotsFor } from './ports.ts'

export type ColumnKey =
  | 'source'
  | 'features'
  | 'filterers'
  | 'attributes'
  | 'groups'
  | 'aggregations'
  | 'windows'
  | 'sort'
  | 'analysis'
  | 'output'

export const COLUMNS: { key: ColumnKey; title: string }[] = [
  { key: 'source', title: 'Cohort' },
  { key: 'features', title: 'Features' },
  { key: 'filterers', title: 'Filters' },
  { key: 'attributes', title: 'Attributes' },
  { key: 'groups', title: 'Group' },
  { key: 'aggregations', title: 'Aggregate' },
  { key: 'windows', title: 'Windows' },
  { key: 'sort', title: 'Sort' },
  { key: 'analysis', title: 'Analysis' },
  { key: 'output', title: 'Output' },
]

// ParamRow is one line of a node's compact body. key is the JSON path of
// the value relative to the entry (`field`, `params.success`,
// `predictors[1]`, `rows[0].field`). ref is set when the value names a
// field or label; resolved says whether a wire was found for it. port
// marks an input the entry does not fill yet: `empty` for a missing
// required field, `append` for the next item of a list input
// (`predictors[2]`). accepts is the input's type rule, for its handle
// tooltip, when the manifest declares one.
export type ParamRow = {
  key: string
  value: string
  ref?: string
  resolved?: boolean
  port?: 'empty' | 'append'
  accepts?: string
}

export type OpNodeData = {
  path: string
  column: ColumnKey
  section: string
  title: string
  op: string
  opKnown?: boolean
  name?: string
  rows: ParamRow[]
  produces: boolean
}

export type CohortFieldRow = { name: string; type: string; used: boolean }

export type CohortNodeData = {
  path: string
  column: ColumnKey
  filename?: string
  dataDir?: string
  fields: CohortFieldRow[]
  fieldsKnown: boolean
}

export type RawNodeData = { path: string; column: ColumnKey; section: string; json: string }

export type OpNode = Node<OpNodeData, 'op'>
export type CohortNode = Node<CohortNodeData, 'cohort'>
export type RawNode = Node<RawNodeData, 'raw'>
export type GraphNode = OpNode | CohortNode | RawNode
export type GraphEdge = Edge<{ ref: string; role: string }>

export type RequestGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  columns: { key: ColumnKey; title: string; x: number }[]
}

export type BuildOptions = {
  // Slim manifest from /api/catalog; marks operators known/unknown.
  manifest?: Manifest
  // Fields from cohort inspect. Without them the cohort lists the names
  // the request references and every unresolved ref wires to it.
  cohortFields?: CohortField[]
  // Prefix for every node id, e.g. ['requests', 1] for a compose slot.
  basePath?: PathSegment[]
}

type SectionSpec = {
  key: string
  title: string
  column: ColumnKey
  single?: boolean
  opKey?: 'type' | 'kind' | 'method'
  opFallback: string
  catalog?: (m: Manifest) => ManifestOperator[] | undefined
  nameKey?: 'label' | 'name'
  produces?: boolean
  // Producer sections whose names refs in this section can see, beyond
  // the cohort (always visible).
  sees: string[]
  seesSelf?: boolean
}

const ROW_LEVEL = ['features', 'attributes']

// Stage order. Also the order nodes stack within a column and the order
// producers are searched (downstream-most visible producer wins).
const SECTIONS: SectionSpec[] = [
  { key: 'features', title: 'Feature', column: 'features', opKey: 'type', opFallback: 'FEATURE', catalog: (m) => m.components?.features, nameKey: 'label', produces: true, sees: [], seesSelf: true },
  { key: 'filterers', title: 'Filter', column: 'filterers', opKey: 'type', opFallback: 'FILTER', catalog: (m) => m.components?.filterers, sees: ['features'] },
  { key: 'attributes', title: 'Attribute', column: 'attributes', opKey: 'type', opFallback: 'ATTRIBUTE', catalog: (m) => m.components?.attributes, nameKey: 'label', produces: true, sees: ['features'], seesSelf: true },
  { key: 'groups', title: 'Group', column: 'groups', opKey: 'type', opFallback: 'GROUP', catalog: (m) => m.components?.groupers, sees: ROW_LEVEL },
  { key: 'aggregations', title: 'Aggregate', column: 'aggregations', opKey: 'type', opFallback: 'AGGREGATE', catalog: (m) => m.components?.aggregators, nameKey: 'label', produces: true, sees: ROW_LEVEL },
  { key: 'windows', title: 'Window', column: 'windows', opKey: 'type', opFallback: 'WINDOW', catalog: (m) => m.components?.windows, nameKey: 'label', produces: true, sees: [...ROW_LEVEL, 'aggregations'], seesSelf: true },
  { key: 'sort', title: 'Sort', column: 'sort', opFallback: 'SORT', sees: [...ROW_LEVEL, 'aggregations', 'windows'] },
  { key: 'tests', title: 'Test', column: 'analysis', opKey: 'type', opFallback: 'TEST', catalog: (m) => m.tests, nameKey: 'label', sees: ROW_LEVEL },
  { key: 'regressions', title: 'Regression', column: 'analysis', opKey: 'type', opFallback: 'REGRESSION', catalog: (m) => m.regressions, nameKey: 'name', sees: ROW_LEVEL },
  { key: 'vectors', title: 'Vector', column: 'analysis', opFallback: 'VECTOR', nameKey: 'name', produces: true, sees: ROW_LEVEL },
  { key: 'matrices', title: 'Matrix', column: 'analysis', opKey: 'type', opFallback: 'MATRIX', catalog: (m) => m.matrices, nameKey: 'name', sees: ROW_LEVEL },
  { key: 'crosstab', title: 'Crosstab', column: 'analysis', single: true, opFallback: 'CROSSTAB', sees: ROW_LEVEL },
  { key: 'post_tests', title: 'Post-test', column: 'output', opKey: 'type', opFallback: 'POST_TEST', catalog: (m) => m.post_tests, nameKey: 'label', sees: [...ROW_LEVEL, 'aggregations', 'windows'] },
  { key: 'overlays', title: 'Overlay', column: 'output', opKey: 'kind', opFallback: 'OVERLAY', catalog: (m) => m.overlays, nameKey: 'name', sees: [] },
  { key: 'multiplicity', title: 'Multiplicity', column: 'output', single: true, opKey: 'method', opFallback: 'MULTIPLICITY', sees: [] },
  { key: 'return', title: 'Return', column: 'output', single: true, opFallback: 'RETURN', sees: [] },
]

const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]))

// SectionInfo is what the inspector needs about a modeled section: where
// the operator name and label live and which manifest list describes it.
export type SectionInfo = Pick<SectionSpec, 'key' | 'title' | 'column' | 'opKey' | 'nameKey' | 'catalog' | 'single'>

export function sectionInfo(key: string): SectionInfo | undefined {
  return SECTION_BY_KEY.get(key)
}

// REQUEST_SECTIONS lists the Request sections drawn as op nodes: array
// sections (one node per entry) and single-object sections. The graph
// model (model.ts) uses the same table, so both agree on which keys are
// modeled and which become raw nodes.
export const REQUEST_SECTIONS: ReadonlyMap<string, { single: boolean }> = new Map(
  SECTIONS.map((s) => [s.key, { single: !!s.single }]),
)

// PREVIEW_SECTIONS are the sections whose entries get a live preview
// (POST /api/preview has a probe for them). The cohort node is previewed
// too; vectors, multiplicity and return have no probe.
export const PREVIEW_SECTIONS: ReadonlySet<string> = new Set([
  'features',
  'filterers',
  'attributes',
  'groups',
  'aggregations',
  'windows',
  'sort',
  'tests',
  'post_tests',
  'regressions',
  'matrices',
  'crosstab',
  'overlays',
])

// hasPreview says whether a node carries a preview footer.
export function hasPreview(n: GraphNode): boolean {
  return n.type === 'cohort' || (n.type === 'op' && PREVIEW_SECTIONS.has(n.data.section))
}

// Keys (last named path segment, outside `params`) whose values are field
// or label references.
const REF_KEYS = new Set(['field', 'split_by', 'rows', 'cols', 'predictors', 'target', 'fields', 'vector'])

// Layout constants (px). Heights estimate the rendered node so columns
// stack without overlap; React Flow measures the real size.
export const LAYOUT = {
  nodeWidth: 240,
  columnGap: 72,
  rowGap: 16,
  headerHeight: 44,
  rowHeight: 18,
  padding: 8,
  rawLineHeight: 15,
  rawMaxLines: 12,
  valueMax: 40,
  // Fixed height of a node's preview footer, so previews arriving never
  // change a node's size or the column stacking.
  previewHeight: 38,
}

type Producer = { section: string; index: number; name: string; id: string }

export function buildRequestGraph(req: unknown, opts: BuildOptions = {}): RequestGraph {
  if (typeof req !== 'object' || req === null || Array.isArray(req)) {
    throw new Error('request must be a JSON object')
  }
  const doc = req as Record<string, unknown>
  const base = opts.basePath ?? []
  const idOf = (...segs: PathSegment[]) => formatPath([...base, ...segs])

  const ops: OpNode[] = []
  const raws: RawNode[] = []
  const producers = new Map<string, Producer[]>()

  // Pass 1: op and raw nodes, producer registry.
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'cohort') continue
    const spec = SECTION_BY_KEY.get(key)
    const entries: [PathSegment[], unknown][] | null = !spec
      ? null
      : spec.single
        ? isObject(value)
          ? [[[key], value]]
          : null
        : Array.isArray(value) && value.every(isObject)
          ? value.map((v, i) => [[key, i], v])
          : null
    if (!spec || !entries) {
      raws.push(rawNode(idOf(key), key, value))
      continue
    }
    entries.forEach(([segs, entry], index) => {
      const e = entry as Record<string, unknown>
      const id = idOf(...segs)
      const opVal = spec.opKey ? e[spec.opKey] : undefined
      const op = typeof opVal === 'string' ? opVal : spec.opFallback
      const nameVal = spec.nameKey ? e[spec.nameKey] : undefined
      const name = typeof nameVal === 'string' ? nameVal : undefined
      const omit = new Set<string>()
      if (typeof opVal === 'string' && spec.opKey) omit.add(spec.opKey)
      if (name !== undefined && spec.nameKey) omit.add(spec.nameKey)
      const rows: ParamRow[] = []
      for (const [k, v] of Object.entries(e)) if (!omit.has(k)) flatten(v, [k], rows)
      if (opts.manifest) addPorts(opts.manifest, key, op, e, rows)
      const list = opts.manifest && spec.catalog ? spec.catalog(opts.manifest) : undefined
      const opKnown =
        typeof opVal === 'string' && list ? list.some((o) => (o.name ?? o.kind) === opVal) : undefined
      ops.push({
        id,
        type: 'op',
        position: { x: 0, y: 0 },
        data: {
          path: id,
          column: spec.column,
          section: key,
          title: spec.title,
          op,
          ...(opKnown !== undefined && { opKnown }),
          ...(name !== undefined && { name }),
          rows,
          produces: !!spec.produces && name !== undefined,
        },
      })
      if (spec.produces && name !== undefined) {
        const list = producers.get(key) ?? []
        list.push({ section: key, index, name, id })
        producers.set(key, list)
      }
    })
  }

  // Stage order within columns, independent of key order in the file.
  const rank = (n: OpNode) => SECTIONS.findIndex((s) => s.key === n.data.section)
  ops.sort((a, b) => rank(a) - rank(b))

  // Pass 2: resolve refs into edges.
  const cohortId = idOf('cohort')
  const known = opts.cohortFields
  const knownNames = new Set(known?.map((f) => f.name))
  const referenced: string[] = []
  const edges: GraphEdge[] = []
  for (const node of ops) {
    const spec = SECTION_BY_KEY.get(node.data.section)!
    const index = indexOf(node.id)
    for (const row of node.data.rows) {
      if (row.ref === undefined) continue
      const ref = row.ref
      const src = resolve(spec, index, ref, lastName(row.key), producers, knownNames, !!known)
      row.resolved = src !== null
      if (!src) continue
      if (src === 'cohort') {
        if (!referenced.includes(ref)) referenced.push(ref)
        edges.push(edge(cohortId, `field:${ref}`, node.id, row.key, ref))
      } else {
        edges.push(edge(src, 'out', node.id, row.key, ref))
      }
    }
  }

  const cohortVal = doc.cohort
  const cohort: CohortNode = {
    id: cohortId,
    type: 'cohort',
    position: { x: 0, y: 0 },
    data: {
      path: cohortId,
      column: 'source',
      ...(isObject(cohortVal) && typeof cohortVal.filename === 'string' && { filename: cohortVal.filename }),
      ...(isObject(cohortVal) && typeof cohortVal.data_dir === 'string' && { dataDir: cohortVal.data_dir }),
      fields: known
        ? known.map((f) => ({ name: f.name, type: f.type, used: referenced.includes(f.name) }))
        : referenced.map((name) => ({ name, type: '', used: true })),
      fieldsKnown: !!known,
    },
  }
  const nodes: GraphNode[] = [cohort, ...raws, ...ops]
  const columns = layout(nodes)
  return { nodes, edges, columns }
}

// canSee says whether an entry of section at index may name the label of
// the producer entry (producerSection, producerIndex): the producer's
// section is upstream of it, or an earlier entry of its own section for
// sections that see themselves. Vector refs only see vectors.
export function canSee(section: string, index: number, producerSection: string, producerIndex: number, role = ''): boolean {
  if (role === 'vector') return producerSection === 'vectors'
  const spec = SECTION_BY_KEY.get(section)
  if (!spec) return false
  if (spec.sees.includes(producerSection)) return true
  return !!spec.seesSelf && producerSection === section && producerIndex < index
}

// addPorts appends rows for the field inputs the manifest declares but
// the entry does not fill (an empty required input, the next slot of a
// list input) and notes each ref row's type rule for its tooltip.
function addPorts(manifest: Manifest, section: string, op: string, e: Record<string, unknown>, rows: ParamRow[]): void {
  for (const row of rows) {
    if (row.ref === undefined) continue
    const slot = slotFor(manifest, section, op, row.key)
    if (slot.accept.types || slot.accept.kinds) row.accepts = describeAccept(slot)
  }
  for (const slot of slotsFor(manifest, section, op)) {
    if (!slot.required) continue
    const v = e[slot.key]
    const accepts = slot.accept.types || slot.accept.kinds ? { accepts: describeAccept(slot) } : {}
    if (!slot.list) {
      if (v === undefined) rows.push({ key: slot.key, value: '', port: 'empty', ...accepts })
    } else if (v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) {
      const n = Array.isArray(v) ? v.length : 0
      rows.push({ key: formatPath([slot.key, n]), value: '', port: 'append', ...accepts })
    }
  }
}

function resolve(
  spec: SectionSpec,
  index: number,
  ref: string,
  role: string,
  producers: Map<string, Producer[]>,
  knownNames: Set<string>,
  fieldsKnown: boolean,
): string | 'cohort' | null {
  if (role === 'vector') {
    return findLast(producers.get('vectors') ?? [], (p) => p.name === ref)?.id ?? null
  }
  // Downstream-most visible producer first.
  const visible: Producer[] = []
  for (const s of spec.sees) visible.push(...(producers.get(s) ?? []))
  if (spec.seesSelf) visible.push(...(producers.get(spec.key) ?? []).filter((p) => p.index < index))
  const exact = findLast(visible, (p) => p.name === ref)
  if (exact) return exact.id
  if (fieldsKnown && knownNames.has(ref)) return 'cohort'
  // Expanding features (one-hot, etc.) emit `<label>_<suffix>` columns.
  const prefixed = findLast(visible, (p) => p.section === 'features' && ref.startsWith(p.name + '_'))
  if (prefixed) return prefixed.id
  return fieldsKnown ? null : 'cohort'
}

function edge(source: string, sourceHandle: string, target: string, role: string, ref: string): GraphEdge {
  const targetHandle = `in:${role}`
  return {
    id: `${source}|${sourceHandle}->${target}|${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: { ref, role },
  }
}

// flatten turns an entry value into compact body rows, descending into
// objects and arrays of objects up to three levels.
function flatten(v: unknown, segs: PathSegment[], rows: ParamRow[]): void {
  const key = formatPath(segs)
  const isRef = segs[0] !== 'params' && REF_KEYS.has(lastNameOf(segs))
  if (Array.isArray(v)) {
    if (v.every(isScalar)) {
      if (isRef && v.length > 0) v.forEach((item, i) => flatten(item, [...segs, i], rows))
      else rows.push({ key, value: clip(`[${v.map(display).join(', ')}]`) })
      return
    }
    if (segs.length < 3) v.forEach((item, i) => flatten(item, [...segs, i], rows))
    else rows.push({ key, value: clip(JSON.stringify(v)) })
    return
  }
  if (isObject(v)) {
    const entries = Object.entries(v)
    if (entries.length === 0 || segs.length >= 3) rows.push({ key, value: clip(JSON.stringify(v)) })
    else for (const [k, child] of entries) flatten(child, [...segs, k], rows)
    return
  }
  const row: ParamRow = { key, value: clip(display(v)) }
  if (isRef && typeof v === 'string') row.ref = v
  rows.push(row)
}

function rawNode(id: string, section: string, value: unknown): RawNode {
  let lines = (JSON.stringify(value, null, 2) ?? 'undefined').split('\n')
  if (lines.length > LAYOUT.rawMaxLines) lines = [...lines.slice(0, LAYOUT.rawMaxLines - 1), '…']
  return {
    id,
    type: 'raw',
    position: { x: 0, y: 0 },
    data: { path: id, column: 'source', section, json: lines.join('\n') },
  }
}

// layout assigns positions: non-empty columns left to right in fixed stage
// order, nodes stacked top-down in model order.
function layout(nodes: GraphNode[]): RequestGraph['columns'] {
  const used = COLUMNS.filter((c) => nodes.some((n) => n.data.column === c.key))
  const columns = used.map((c, i) => ({ ...c, x: i * (LAYOUT.nodeWidth + LAYOUT.columnGap) }))
  const yByColumn = new Map<ColumnKey, number>()
  for (const n of nodes) {
    const col = columns.find((c) => c.key === n.data.column)!
    const y = yByColumn.get(col.key) ?? 0
    n.position = { x: col.x, y }
    yByColumn.set(col.key, y + estimateHeight(n) + LAYOUT.rowGap)
  }
  return columns
}

export function estimateHeight(n: GraphNode): number {
  const { headerHeight, rowHeight, padding, rawLineHeight } = LAYOUT
  const preview = hasPreview(n) ? LAYOUT.previewHeight : 0
  switch (n.type) {
    case 'op':
      return headerHeight + n.data.rows.length * rowHeight + padding + preview
    case 'cohort':
      return headerHeight + Math.max(1, n.data.fields.length) * rowHeight + padding + preview
    case 'raw':
      return 28 + n.data.json.split('\n').length * rawLineHeight + padding
  }
}

function findLast<T>(xs: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = xs.length - 1; i >= 0; i--) if (pred(xs[i])) return xs[i]
  return undefined
}

function indexOf(id: string): number {
  const m = /\[(\d+)\]$/.exec(id)
  return m ? Number(m[1]) : 0
}

function lastNameOf(segs: PathSegment[]): string {
  for (let i = segs.length - 1; i >= 0; i--) if (typeof segs[i] === 'string') return segs[i] as string
  return ''
}

function lastName(key: string): string {
  const m = /([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])*$/.exec(key)
  return m ? m[1] : key
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function display(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

function clip(s: string): string {
  return s.length > LAYOUT.valueMax ? s.slice(0, LAYOUT.valueMax - 1) + '…' : s
}
