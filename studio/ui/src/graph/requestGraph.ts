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
import { describeAccept, isGlob, isVectorRole, readsMembers, slotFor, slotsFor, VECTOR2_INPUT, VECTOR_INPUT } from './ports.ts'
import { groupKeyColumn, type GroupEntry } from './partition.ts'
import { joinBodyLines, joinedFields, joinKeyRefusal, type RightSide } from './joins.ts'
import { addDerived } from './resultGraph.ts'
import type { PartKey } from './responseParts.ts'

export type ColumnKey =
  | 'source'
  | 'joins'
  | 'features'
  | 'filterers'
  | 'attributes'
  | 'groups'
  | 'aggregations'
  | 'windows'
  | 'sort'
  | 'analysis'
  | 'output'
  | 'result'

export const COLUMNS: { key: ColumnKey; title: string }[] = [
  { key: 'source', title: 'Cohort' },
  // Joins sit right of the cohort so key wires run straight across.
  { key: 'joins', title: 'Join' },
  { key: 'features', title: 'Features' },
  { key: 'filterers', title: 'Filters' },
  { key: 'attributes', title: 'Attributes' },
  { key: 'groups', title: 'Group' },
  { key: 'aggregations', title: 'Aggregate' },
  { key: 'windows', title: 'Windows' },
  { key: 'sort', title: 'Sort' },
  { key: 'analysis', title: 'Analysis' },
  { key: 'output', title: 'Output' },
  // The view-only Response node (resultGraph.ts): what the frame returns.
  { key: 'result', title: 'Response' },
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
  // The row binds a compose fit by name (`params.fit`), not a field.
  fit?: true
  // The value is known to be wrong (a join's right_field the right
  // cohort lacks): drawn like an unresolved ref.
  invalid?: true
}

// JoinInfo is a join node's output side: the joined fields it adds to
// the request (the right cohort's fields, prefixed with `as`), each a
// source handle `field:<name>` like the cohort's. state says whether the
// right cohort's fields are known, still being inspected, could not be
// read (no such file), or are unknown (a shard anchor whose archive
// exists but whose shard inspect could not read: never flagged); without
// them fields lists only the joined names the request references.
export type JoinInfo = {
  right?: string
  as: string
  state: 'known' | 'pending' | 'missing' | 'unknown'
  fields: CohortFieldRow[]
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
  // Set on a compose fit's regression: the fit name it binds, drawn as a
  // `fit` source handle (composeGraph.ts).
  fit?: string
  // Set on a join: the joined fields it outputs.
  join?: JoinInfo
  // View-only, derived by resultGraph.ts. A group's key column (its
  // `key` and fan-out `scope` source handles); an entry that runs once
  // per group bucket (its `scope:in` target handle); a labelled
  // attribute's output column and whether anything reads it.
  keyColumn?: string
  perGroup?: true
  output?: { used: boolean }
  // View-only: the entry lands in a part of its frame's Response node
  // (its `response` source handle, wired into that part's row or header).
  response?: true
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

// FacetNodeData is a Facet root's output node (facetGraph.ts): the
// fields it summarizes (wired from the cohort) and its settings, with a
// live preview of the facet result.
export type FacetNodeData = { path: string; column: ColumnKey; rows: ParamRow[] }

// ResultColumn is one column of a frame's result table: a group key, an
// aggregation label or a window label, wired from source when known;
// trimmed when the frame's `return` drops it.
export type ResultColumn = { name: string; kind: 'key' | 'aggregation' | 'window'; source?: string; trimmed?: boolean }

// ResponseRow is one entry's row in a Response part (responseParts.ts):
// id is the entry id relative to its frame (`tests[0]`, the row's
// `part:` handle), source the entry's node; fanout names the group whose
// preview counts the groups / partitions it runs over; adjusted marks a
// test whose p-values the frame's multiplicity block corrects.
export type ResponseRow = {
  id: string
  source: string
  label: string
  detail?: string
  fanout?: { from: string; noun: 'groups' | 'partitions' }
  adjusted?: true
  trimmed?: true
}

// ResponsePart is one non-empty part of the Response below its table.
export type ResponsePart = { key: PartKey; title: string; rows: ResponseRow[]; trimmed?: true }

// ResultNodeData is a frame's view-only Response node (resultGraph.ts):
// its data table (columns in order, whether the output is row-level, the
// node whose preview probe holds the whole table: the sort, else the
// last window, aggregation or group; table false when the response has
// no `data`), then every other part of the response with a row per
// entry. ret: the frame has a `return` block (wired into the header);
// trims: it drops something here.
export type ResultNodeData = {
  path: string
  column: ColumnKey
  columns: ResultColumn[]
  rowLevel: boolean
  previewFrom?: string
  table: boolean
  // The table holds a long crosstab's cells (resultGraph.tableShape).
  cells?: true
  tableTrimmed?: true
  parts: ResponsePart[]
  ret?: true
  trims?: true
}

export type OpNode = Node<OpNodeData, 'op'>
export type CohortNode = Node<CohortNodeData, 'cohort'>
export type RawNode = Node<RawNodeData, 'raw'>
export type FacetNode = Node<FacetNodeData, 'facet'>
export type ResultNode = Node<ResultNodeData, 'result'>
export type GraphNode = OpNode | CohortNode | RawNode | FacetNode | ResultNode
// role: the input row's name for field wires, or `fit`, `stage`, and the
// view-only `scope` (group fan-out; lead marks one wire per group, which
// carries the label) and `result` (into the Result node).
export type GraphEdge = Edge<{ ref: string; role: string; lead?: boolean }>

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
  // false leaves out the cohort node (a compose root has no cohort of its
  // own); refs then never wire to it.
  withCohort?: boolean
  // With withCohort false: refs naming one of cohortFields count as
  // resolved without a wire (a chain stage reads the previous stage's
  // rows, not a cohort node).
  implicitFields?: boolean
  // A join's right cohort fields by its `right` path (joins.RightSide).
  rightFields?: (right: string) => RightSide
  // Add the frame's view-only Result node (plain requests, compose slots
  // and chain stages; not fits or a compose / chain root).
  result?: boolean
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
  // Joins run at load, in their own column right of the cohort: their
  // keys read the left cohort only; every later section sees the joined
  // fields.
  { key: 'joins', title: 'Join', column: 'joins', opKey: 'kind', opFallback: 'JOIN', sees: [] },
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
// too; multiplicity and return have no probe.
export const PREVIEW_SECTIONS: ReadonlySet<string> = new Set([
  'joins',
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
  'vectors',
  'crosstab',
  'overlays',
])

// hasPreview says whether a node carries a preview footer.
export function hasPreview(n: GraphNode): boolean {
  return n.type === 'cohort' || n.type === 'facet' || (n.type === 'op' && PREVIEW_SECTIONS.has(n.data.section))
}

// Keys (last named path segment, outside `params`) whose values are field
// or label references.
const REF_KEYS = new Set(['field', 'split_by', 'rows', 'cols', 'predictors', 'target', 'fields', 'vector', 'fields2', 'vector2', 'left_field'])

// PARAM_REF_KEYS are the `params` members of a section whose values are
// field references: a post-test's partition_by (group key columns).
// Not `params.fit`: that binds a compose fit by name (composeGraph.ts).
const PARAM_REF_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  post_tests: new Set(['partition_by']),
}

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
  // Fixed height of a facet node's result preview (scrolls inside).
  facetPreviewHeight: 200,
  // Fixed height of a Result node's preview (row count + a few rows).
  resultPreviewHeight: 74,
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
  // Group key columns, in groups order (post-test partition_by names a
  // leading prefix of them).
  const groupKeys = Array.isArray(doc.groups) ? doc.groups.filter(isObject).map((g) => groupKeyColumn(g as GroupEntry)) : []

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
      const paramRefs = PARAM_REF_KEYS[key]
      for (const [k, v] of Object.entries(e)) if (!omit.has(k)) flatten(v, [k], rows, paramRefs)
      // Glob members (`q_*`) of a vector or of inline fields expand over
      // the schema: no wire.
      if (key === 'vectors' || readsMembers(opts.manifest, key, op)) {
        for (const r of rows) if (r.ref !== undefined && isGlob(r.ref) && /^fields2?\[/.test(r.key)) delete r.ref
      }
      if (opts.manifest) addPorts(opts.manifest, key, op, e, rows, groupKeys)
      const join = key === 'joins' ? joinInfo(e, rows, opts.rightFields) : undefined
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
          ...(join && { join }),
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
  const joins = ops.filter((n) => n.data.join !== undefined)
  for (const node of ops) {
    const spec = SECTION_BY_KEY.get(node.data.section)!
    const index = indexOf(node.id)
    for (const row of node.data.rows) {
      if (row.ref === undefined) continue
      const ref = row.ref
      const role = lastName(row.key)
      // A join's keys read the left cohort only.
      const src =
        spec.key === 'joins'
          ? !known || knownNames.has(ref)
            ? 'cohort'
            : null
          : resolve(spec, index, ref, role, producers, knownNames, !!known, joins)
      row.resolved = src !== null
      if (!src) continue
      const viaJoin = src !== 'cohort' ? joins.find((j) => j.id === src) : undefined
      if (viaJoin) {
        const info = viaJoin.data.join!
        const f = info.fields.find((x) => x.name === ref)
        if (f) f.used = true
        else info.fields.push({ name: ref, type: '', used: true })
        edges.push(edge(viaJoin.id, `field:${ref}`, node.id, row.key, ref))
        continue
      }
      if (src === 'cohort') {
        if (opts.withCohort === false) {
          row.resolved = !!opts.implicitFields && knownNames.has(ref)
          continue
        }
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
  const result = addDerived(doc, ops, edges, base, !!opts.result)
  const nodes: GraphNode[] = [...(opts.withCohort === false ? [] : [cohort]), ...raws, ...ops, ...(result ? [result] : [])]
  const columns = layoutNodes(nodes)
  return { nodes, edges, columns }
}

// canSee says whether an entry of section at index may name the label of
// the producer entry (producerSection, producerIndex): the producer's
// section is upstream of it, or an earlier entry of its own section for
// sections that see themselves. Vector refs only see vectors.
export function canSee(section: string, index: number, producerSection: string, producerIndex: number, role = ''): boolean {
  if (isVectorRole(role)) return producerSection === 'vectors'
  // partition_by names group key columns: what the groupers see.
  if (role === 'partition_by') return ROW_LEVEL.includes(producerSection)
  const spec = SECTION_BY_KEY.get(section)
  if (!spec) return false
  if (spec.sees.includes(producerSection)) return true
  return !!spec.seesSelf && producerSection === section && producerIndex < index
}

// addPorts appends rows for the field inputs the manifest declares but
// the entry does not fill (an empty required input, the next slot of a
// list input) and notes each ref row's type rule for its tooltip. A
// post-test's partition_by gets an add row while the request has group
// keys it does not list yet.
function addPorts(manifest: Manifest, section: string, op: string, e: Record<string, unknown>, rows: ParamRow[], groupKeys: readonly string[]): void {
  if (section === 'joins') {
    // Each left key is an input; the next pair is an append port.
    const accepts = 'left_field: a left cohort key (not a set column; its type must compare with right_field)'
    for (const row of rows) if (row.ref !== undefined) row.accepts = accepts
    const on = e.on
    if (on === undefined || (Array.isArray(on) && on.every(isObject))) {
      rows.push({ key: `on[${Array.isArray(on) ? on.length : 0}].left_field`, value: '', port: 'append', accepts })
    }
    return
  }
  for (const row of rows) {
    if (row.ref === undefined) continue
    const slot = slotFor(manifest, section, op, row.key)
    if (slot.accept.types || slot.accept.kinds || slot.groupKey) row.accepts = describeAccept(slot)
  }
  // A matrix or vector-input operator names its members by vector or by
  // inline fields, exactly one: neither set offers both inputs, either
  // set asks for nothing. The optional second set (vector2 / fields2,
  // TEST_HOTELLING_T2's paired form) likewise offers a vector2 input
  // while neither is set.
  const members = readsMembers(manifest, section, op)
  const membersBy = members ? (e.vector !== undefined ? 'vector' : e.fields !== undefined ? 'fields' : null) : undefined
  if (membersBy === null) rows.push({ key: 'vector', value: '', port: 'empty', accepts: VECTOR_INPUT })
  if (members?.second && e.vector2 === undefined && e.fields2 === undefined) {
    rows.push({ key: 'vector2', value: '', port: 'empty', accepts: VECTOR2_INPUT })
  }
  for (const slot of slotsFor(manifest, section, op)) {
    const v = plainAt(e, slot.key)
    if (slot.groupKey) {
      const list = v === undefined || v === null ? [] : v
      if (Array.isArray(list) && list.every((x) => typeof x === 'string') && list.length < groupKeys.length) {
        rows.push({ key: formatPath([...slot.key.split('.'), list.length]), value: '', port: 'append', accepts: describeAccept(slot) })
      }
      continue
    }
    // An optional list already started (fields2) takes more items.
    if (!slot.required && !(slot.list && Array.isArray(v))) continue
    // A vector names its members by fields or by pattern, never both.
    if (section === 'vectors' && e.pattern !== undefined) continue
    if (slot.key === 'fields' && membersBy === 'vector') continue
    const accepts = slot.accept.types || slot.accept.kinds ? { accepts: describeAccept(slot) } : {}
    if (!slot.list) {
      if (v === undefined) rows.push({ key: slot.key, value: '', port: 'empty', ...accepts })
    } else if (v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) {
      const n = Array.isArray(v) ? v.length : 0
      rows.push({ key: formatPath([slot.key, n]), value: '', port: 'append', ...accepts })
    }
  }
}

// plainAt reads a dotted key (`params.partition_by`) from an entry.
function plainAt(e: Record<string, unknown>, key: string): unknown {
  let cur: unknown = e
  for (const k of key.split('.')) cur = isObject(cur) ? cur[k] : undefined
  return cur
}

function resolve(
  spec: SectionSpec,
  index: number,
  ref: string,
  role: string,
  producers: Map<string, Producer[]>,
  knownNames: Set<string>,
  fieldsKnown: boolean,
  joins: readonly OpNode[] = [],
): string | 'cohort' | null {
  if (isVectorRole(role)) {
    return findLast(producers.get('vectors') ?? [], (p) => p.name === ref)?.id ?? null
  }
  // Downstream-most visible producer first. partition_by names group
  // key columns, which resolve where the groupers' fields do.
  const visible: Producer[] = []
  for (const s of role === 'partition_by' ? ROW_LEVEL : spec.sees) visible.push(...(producers.get(s) ?? []))
  if (spec.seesSelf && role !== 'partition_by') visible.push(...(producers.get(spec.key) ?? []).filter((p) => p.index < index))
  const exact = findLast(visible, (p) => p.name === ref)
  if (exact) return exact.id
  if (fieldsKnown && knownNames.has(ref)) return 'cohort'
  // A joined field: the right cohort's, prefixed with the join's `as`.
  const joined = joins.find((j) => j.data.join!.state === 'known' && j.data.join!.fields.some((f) => f.name === ref))
  if (joined) return joined.id
  // Expanding features (one-hot, etc.) emit `<label>_<suffix>` columns.
  const prefixed = findLast(visible, (p) => p.section === 'features' && ref.startsWith(p.name + '_'))
  if (prefixed) return prefixed.id
  // A join whose right fields are not known yet takes the names that
  // carry its prefix, and (with the left fields known) any other name.
  const open = joins.filter((j) => j.data.join!.state !== 'known')
  const byPrefix = open.find((j) => j.data.join!.as !== '' && ref.startsWith(j.data.join!.as))
  if (byPrefix) return byPrefix.id
  if (fieldsKnown) return open.find((j) => j.data.join!.as === '')?.id ?? null
  return 'cohort'
}

// joinInfo derives a join entry's output side from its right cohort's
// fields, and marks on[] right_field rows naming no right field, or
// whose key types do not compare, invalid.
function joinInfo(e: Record<string, unknown>, rows: ParamRow[], rightFields?: (right: string) => RightSide): JoinInfo {
  const right = typeof e.right === 'string' && e.right !== '' ? e.right : undefined
  const as = typeof e.as === 'string' ? e.as : ''
  const side = right !== undefined && rightFields ? rightFields(right) : right === undefined ? null : undefined
  if (side === 'unknown') return { right, as, state: 'unknown', fields: [] }
  if (!side) return { ...(right !== undefined && { right }), as, state: side === null ? 'missing' : 'pending', fields: [] }
  const types = new Map(side.map((f) => [f.name, f.type]))
  for (const row of rows) {
    if (!/^on\[\d+\]\.right_field$/.test(row.key)) continue
    if (!types.has(row.value)) row.invalid = true
  }
  return {
    ...(right !== undefined && { right }),
    as,
    state: 'known',
    fields: joinedFields(side, as).map((f) => ({ name: f.name, type: f.type, used: false })),
  }
}

// joinKeyType is the type a join's on[i] right_field names (for the
// left_field input's key-type rule), when the right fields are known.
export function joinKeyType(node: OpNode, rowKey: string): string | undefined {
  const info = node.data.join
  const m = /^on\[(\d+)\]\.left_field$/.exec(rowKey)
  if (!info || info.state !== 'known' || !m) return undefined
  const r = node.data.rows.find((x) => x.key === `on[${m[1]}].right_field`)?.value
  return r === undefined ? undefined : info.fields.find((f) => f.name === info.as + r)?.type
}

// joinKeyCheck is the left_field input's rule: a key type the pair's
// right_field compares with (joins.joinKeyRefusal).
export function joinKeyCheck(node: OpNode, rowKey: string, leftType: string | undefined): string | null {
  return joinKeyRefusal(leftType, joinKeyType(node, rowKey))
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
function flatten(v: unknown, segs: PathSegment[], rows: ParamRow[], paramRefs?: ReadonlySet<string>): void {
  const key = formatPath(segs)
  const isRef =
    segs[0] !== 'params'
      ? REF_KEYS.has(lastNameOf(segs))
      : !!paramRefs?.has(segs[1] as string) && (segs.length === 2 || (segs.length === 3 && typeof segs[2] === 'number'))
  if (Array.isArray(v)) {
    if (v.every(isScalar)) {
      if (isRef && v.length > 0) v.forEach((item, i) => flatten(item, [...segs, i], rows, paramRefs))
      else rows.push({ key, value: clip(`[${v.map(display).join(', ')}]`) })
      return
    }
    if (segs.length < 3) v.forEach((item, i) => flatten(item, [...segs, i], rows, paramRefs))
    else rows.push({ key, value: clip(JSON.stringify(v)) })
    return
  }
  if (isObject(v)) {
    const entries = Object.entries(v)
    if (entries.length === 0 || segs.length >= 3) rows.push({ key, value: clip(JSON.stringify(v)) })
    else for (const [k, child] of entries) flatten(child, [...segs, k], rows, paramRefs)
    return
  }
  const row: ParamRow = { key, value: clip(display(v)) }
  if (isRef && typeof v === 'string') row.ref = v
  rows.push(row)
}

export function rawNode(id: string, section: string, value: unknown): RawNode {
  let lines = (JSON.stringify(value, null, 2) ?? 'undefined').split('\n')
  if (lines.length > LAYOUT.rawMaxLines) lines = [...lines.slice(0, LAYOUT.rawMaxLines - 1), '…']
  return {
    id,
    type: 'raw',
    position: { x: 0, y: 0 },
    data: { path: id, column: 'source', section, json: lines.join('\n') },
  }
}

// layoutNodes assigns positions: non-empty columns left to right in fixed
// stage order, nodes stacked top-down in model order.
export function layoutNodes(nodes: GraphNode[]): RequestGraph['columns'] {
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
      // A join draws its key pairs one line each and its joined fields
      // collapsed (nodes.tsx JoinedFields); measured sizes take over once
      // a node is drawn, expanded or not.
      return (
        headerHeight +
        ((n.data.join ? joinBodyLines(n.data.rows, n.data.join, false) : n.data.rows.length) + extraLines(n)) * rowHeight +
        padding +
        preview
      )
    case 'cohort':
      return headerHeight + Math.max(1, n.data.fields.length) * rowHeight + padding + preview
    case 'raw':
      return 28 + n.data.json.split('\n').length * rawLineHeight + padding
    case 'facet':
      return headerHeight + n.data.rows.length * rowHeight + padding + LAYOUT.facetPreviewHeight
    case 'result':
      return headerHeight + Math.max(1, responseLines(n)) * rowHeight + padding + (n.data.table ? LAYOUT.resultPreviewHeight : 0)
  }
}

// responseLines counts a Response node's body lines: the table's header
// and columns (or its row-level line), then each part's header and rows.
function responseLines(n: ResultNode): number {
  const table = n.data.table ? 1 + Math.max(1, n.data.columns.length) : 0
  return table + n.data.parts.reduce((k, p) => k + 1 + p.rows.length, 0)
}

// extraLines counts an op node's view-only rows: a group's key column
// row, an attribute's output column row.
function extraLines(n: OpNode): number {
  return (n.data.keyColumn !== undefined ? 1 : 0) + (n.data.output !== undefined ? 1 : 0)
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
