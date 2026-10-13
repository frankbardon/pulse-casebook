// resultGraph derives the view-only parts of a request frame's graph:
// the Response node (the table the frame returns, then every other part
// of the response: responseParts.ts), the group fan-out
// ("scope") wires and the attribute output columns. Nothing here is ever
// written into the request JSON; it is all read off the entries the
// request already has (pulse v1.0.0-alpha.10 semantics):
//
//   - Result `data`: one row per observed group key combination; each row
//     carries every grouper's key column (groups order), then the
//     aggregation labels, then the window labels. With no groups and no
//     aggregations only windows (row-level output) or a long crosstab
//     (its cells) produce data; otherwise there is none (tableShape).
//   - A grouped request runs every aggregation, tier-1 test and matrix
//     once per bucket; post-tests run once per partition when there are
//     two or more groupers (unless `params.partition_by` is []).
//     Regressions, vectors and the crosstab do not run per group
//     (RegressionResult carries no group key; vectors are names; the
//     crosstab has its own row / column groupers).
//   - An attribute adds a per-row column that only matters when a later
//     slot reads its label (a wire, or an expression naming it).
//
// Pure and deterministic, like buildRequestGraph.

import { formatPath, parsePath, splitFrame, type PathSegment } from './nodePath.ts'
import { groupKeyColumn, type GroupEntry } from './partition.ts'
import type { GraphEdge, OpNode, ResponsePart, ResponseRow, ResultColumn, ResultNode } from './requestGraph.ts'
import { crosstabLong, multiplicityOn, PART_KEYS, PART_TITLES, returnTrim, testAdjusted, type PartKey } from './responseParts.ts'

// RESULT_KEY is the last segment of a Result node's id: a quoted key no
// request section uses (`["(result)"]`, `requests[1]["(result)"]`), so
// the id parses as a path, frames like its siblings, and never names
// request JSON (the model has no node there: not editable, not deletable).
export const RESULT_KEY = '(result)'

// Handles: a group's key column (into the Result node) and its fan-out
// (into every entry that runs per group); a fan-out target's input; a
// Result column's input.
export const KEY_HANDLE = 'key'
export const SCOPE_HANDLE = 'scope'
export const SCOPE_TARGET = 'scope:in'
export const columnHandle = (name: string) => `col:${name}`
// Response node handles: a part row's input (`part:tests[0]`), a part
// header's input (`sec:tests`, multiplicity), the node header's input
// (`return`), and an entry's output into its row (`response`).
export const partHandle = (id: string) => `part:${id}`
export const sectionHandle = (key: string) => `sec:${key}`
export const HEAD_HANDLE = 'head'
export const RESPONSE_HANDLE = 'response'

// Sections whose entries run once per group bucket.
const PER_GROUP = new Set(['aggregations', 'tests', 'matrices'])

// Sections that run after attributes and may read their labels.
const READS_ATTRIBUTES = ['groups', 'aggregations', 'windows', 'sort', 'tests', 'regressions', 'vectors', 'matrices', 'crosstab', 'post_tests', 'overlays']

export function resultId(base: readonly PathSegment[]): string {
  return formatPath([...base, RESULT_KEY])
}

export function isResultId(id: string): boolean {
  try {
    return parsePath(id).at(-1) === RESULT_KEY
  } catch {
    return false
  }
}

// resultColumns lists the frame's result table columns in order: group
// keys, aggregation labels, window labels. source is the node wired into
// the column (none for an unlabelled aggregation or window, whose label
// the engine picks).
export function resultColumns(doc: Record<string, unknown>, ops: readonly OpNode[]): ResultColumn[] {
  const out: ResultColumn[] = []
  const groups = Array.isArray(doc.groups) ? doc.groups : []
  for (const n of ops) {
    if (n.data.section !== 'groups') continue
    const g = groups[indexOf(n.id)]
    const name = isObject(g) ? groupKeyColumn(g as GroupEntry) : ''
    out.push({ name: name || `(${n.data.op})`, kind: 'key', ...(name !== '' && { source: n.id }) })
  }
  for (const section of ['aggregations', 'windows'] as const) {
    for (const n of ops) {
      if (n.data.section !== section) continue
      const kind = section === 'aggregations' ? 'aggregation' : 'window'
      out.push(n.data.name !== undefined ? { name: n.data.name, kind, source: n.id } : { name: `(${n.data.op})`, kind })
    }
  }
  return out
}

// fanoutTargets lists the entries of a frame that run once per group
// bucket: none without groups; else every aggregation, test and matrix,
// plus post-tests when two or more groupers partition the rows (a
// post-test whose partition_by is [] runs once over every row).
export function fanoutTargets(doc: Record<string, unknown>, ops: readonly OpNode[]): OpNode[] {
  const groups = ops.filter((n) => n.data.section === 'groups').length
  if (groups === 0) return []
  const posts = Array.isArray(doc.post_tests) ? doc.post_tests : []
  return ops.filter((n) => {
    if (PER_GROUP.has(n.data.section)) return true
    if (n.data.section !== 'post_tests' || groups < 2) return false
    const p = posts[indexOf(n.id)]
    const params = isObject(p) ? p.params : undefined
    const partition = isObject(params) ? params.partition_by : undefined
    return !(Array.isArray(partition) && partition.length === 0)
  })
}

// columnUsed says whether something in the frame reads an attribute's
// label: a wire out of it, or a later entry whose strings name it as a
// whole word (formula expressions and other refs the graph draws no wire
// for).
export function columnUsed(doc: Record<string, unknown>, attr: OpNode, edges: readonly GraphEdge[]): boolean {
  if (edges.some((e) => e.source === attr.id)) return true
  const label = attr.data.name
  if (label === undefined || label === '') return true
  const word = new RegExp(`(^|[^A-Za-z0-9_])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_])`)
  const own = indexOf(attr.id)
  const attrs = Array.isArray(doc.attributes) ? doc.attributes : []
  if (attrs.slice(own + 1).some((a) => names(a, word))) return true
  return READS_ATTRIBUTES.some((k) => names(doc[k], word))
}

// addDerived adds a frame's view-only parts to its graph: group key and
// fan-out wires, attribute output usage, and (with result) the Response
// node: its table columns wired from their sources, a row per analysis
// entry wired from it, multiplicity into the tests' part headers and
// `return` into the node header. The node keeps R1's Result id, so
// layout sidecars saved then still place it.
export function addDerived(
  doc: Record<string, unknown>,
  ops: readonly OpNode[],
  edges: GraphEdge[],
  base: readonly PathSegment[],
  result: boolean,
): ResultNode | null {
  for (const n of ops) {
    if (n.data.section === 'attributes' && n.data.name !== undefined) n.data.output = { used: columnUsed(doc, n, edges) }
  }
  const targets = fanoutTargets(doc, ops)
  const groups = ops.filter((n) => n.data.section === 'groups')
  for (const t of targets) t.data.perGroup = true
  const cols = resultColumns(doc, ops)
  for (const g of groups) {
    const key = cols.find((c) => c.source === g.id)?.name ?? ''
    g.data.keyColumn = key
    targets.forEach((t, k) => {
      edges.push({
        id: `${g.id}|${SCOPE_HANDLE}->${t.id}|${SCOPE_TARGET}`,
        source: g.id,
        sourceHandle: SCOPE_HANDLE,
        target: t.id,
        targetHandle: SCOPE_TARGET,
        className: 'scope-wire',
        selectable: false,
        deletable: false,
        focusable: false,
        data: { ref: key, role: 'scope', ...(k === 0 && { lead: true }) },
      })
    })
  }
  if (!result) return null
  const id = resultId(base)
  const trim = returnTrim(doc.return)
  const wire = (source: string, sourceHandle: string, targetHandle: string, ref: string, extra = '') => {
    edges.push({
      id: `${source}|${sourceHandle}->${id}|${targetHandle}`,
      source,
      sourceHandle,
      target: id,
      targetHandle,
      className: 'result-wire' + extra,
      deletable: false,
      data: { ref, role: 'result' },
    })
  }
  const shape = tableShape(doc)
  if (shape.cells) cols.push(...crosstabColumns(doc))
  for (const c of cols) {
    if (trim?.column(c.name)) c.trimmed = true
    if (c.source === undefined) continue
    wire(c.source, c.kind === 'key' ? KEY_HANDLE : 'out', columnHandle(c.name), c.name)
  }
  const parts = responseParts(doc, ops, groups, targets)
  let trims = cols.some((c) => c.trimmed)
  for (const p of parts) {
    const dropped = trim?.part(p.key === 'crosstab' && crosstabLong(doc) ? 'data' : p.key)
    if (dropped) {
      p.trimmed = true
      trims = true
    }
    for (const r of p.rows) {
      if (dropped) r.trimmed = true
      const n = ops.find((o) => o.id === r.source)
      if (n) n.data.response = true
      wire(r.source, RESPONSE_HANDLE, partHandle(r.id), r.label)
    }
  }
  const single = (section: string) => ops.find((n) => n.data.section === section)
  const mult = single('multiplicity')
  if (mult) {
    // The correction acts on the tests' and post-tests' p-values; with
    // neither, on the overlays (request-family layers) or the response.
    const into = parts.filter((p) => p.key === 'tests' || p.key === 'post_tests').map((p) => sectionHandle(p.key))
    const overlays = parts.some((p) => p.key === 'overlays')
    mult.data.response = true
    for (const h of into.length > 0 ? into : [overlays ? sectionHandle('overlays') : HEAD_HANDLE]) wire(mult.id, RESPONSE_HANDLE, h, 'multiplicity', ' multiplicity-wire')
  }
  const ret = single('return')
  if (ret) {
    ret.data.response = true
    wire(ret.id, RESPONSE_HANDLE, HEAD_HANDLE, 'return', ' return-wire')
  }
  const last = (section: string) => ops.filter((n) => n.data.section === section).at(-1)?.id
  // A long crosstab's cells are the table: its preview holds them.
  const previewFrom = shape.cells ? last('crosstab') : (last('sort') ?? last('windows') ?? last('aggregations') ?? last('groups'))
  const { table, rowLevel } = shape
  return {
    id,
    type: 'result',
    position: { x: 0, y: 0 },
    deletable: false,
    connectable: false,
    data: {
      path: id,
      column: 'result',
      columns: cols,
      rowLevel,
      ...(shape.cells && { cells: true }),
      ...(previewFrom !== undefined && { previewFrom }),
      table,
      ...(table && trim?.part('data') && { tableTrimmed: true }),
      parts,
      ...(ret && { ret: true }),
      ...(trims && { trims: true }),
    },
  }
}

// tableShape says whether a frame's response has `data` and what its rows
// are. Observed with the pulse v1.0.0-alpha.10 engine on ab_test.pulse
// (`pulse api process --json`): only groups, aggregations, windows or a
// long crosstab produce `data`:
//
//   - cohort only, filterers only, attributes only, features only, sort
//     only, overlays only: no `data` key at all;
//   - tests only, regressions only, matrices only (also with sort or
//     attributes): no `data`, only the analysis part;
//   - crosstab (shape matrix, the default): `crosstab`, no `data`;
//     shape long: `data` holds the cells (row keys, column keys, cell
//     label), `crosstab` is just {"shape":"long"};
//   - windows without groups or aggregations: `data` is row-level, one
//     row per filtered record (40,000 rows) with the window columns;
//   - groups without aggregations: one row per bucket (its key);
//     aggregations without groups: one row.
export function tableShape(doc: Record<string, unknown>): { table: boolean; rowLevel: boolean; cells: boolean } {
  const has = (k: string) => Array.isArray(doc[k]) && doc[k].length > 0
  const aggregated = has('groups') || has('aggregations')
  const cells = !aggregated && isObject(doc.crosstab) && crosstabLong(doc)
  return { table: aggregated || has('windows') || cells, rowLevel: !aggregated && has('windows'), cells }
}

// crosstabColumns are a long crosstab's data columns: each row and column
// grouper's key column, then the cell label.
function crosstabColumns(doc: Record<string, unknown>): ResultColumn[] {
  const x = isObject(doc.crosstab) ? doc.crosstab : {}
  const out: ResultColumn[] = []
  for (const k of ['rows', 'columns'] as const) {
    for (const g of Array.isArray(x[k]) ? x[k] : []) {
      const name = isObject(g) ? groupKeyColumn(g as GroupEntry) : ''
      if (name !== '') out.push({ name, kind: 'key' })
    }
  }
  const cell = isObject(x.cell) && typeof x.cell.label === 'string' ? x.cell.label : undefined
  if (cell !== undefined) out.push({ name: cell, kind: 'aggregation' })
  return out
}

// responseParts lists the frame's non-empty response parts below its
// table, in Response order, one row per entry: its label (else the
// operator), where it fans out, whether multiplicity adjusts it.
// Vectors produce no part.
export function responseParts(doc: Record<string, unknown>, ops: readonly OpNode[], groups: readonly OpNode[], fanned: readonly OpNode[]): ResponsePart[] {
  const adjusting = multiplicityOn(doc) && ops.some((n) => n.data.section === 'multiplicity')
  const perGroup = new Set(fanned.map((n) => n.id))
  const lastGroup = groups.at(-1)?.id
  const out: ResponsePart[] = []
  for (const key of PART_KEYS) {
    const rows: ResponseRow[] = []
    for (const n of ops) {
      if (n.data.section !== key) continue
      const rel = formatPath(splitFrame(n.id).rest)
      const entry = entryOf(doc, key, n.id)
      const row: ResponseRow = { id: rel, source: n.id, label: n.data.name ?? (key === 'crosstab' ? 'crosstab' : `(${n.data.op})`) }
      const detail = detailOf(doc, key, groups.length > 0)
      if (detail) row.detail = detail
      if (perGroup.has(n.id) && lastGroup !== undefined) {
        row.fanout = key === 'post_tests' ? { from: partitionGroup(entry, groups), noun: 'partitions' } : { from: lastGroup, noun: 'groups' }
      }
      if (adjusting && (key === 'tests' || key === 'post_tests') && testAdjusted(entry)) row.adjusted = true
      rows.push(row)
    }
    if (rows.length > 0) out.push({ key, title: PART_TITLES[key], rows })
  }
  return out
}

// partitionGroup is the group whose preview counts a post-test's
// partitions: the last grouper of its partition_by prefix (default all
// but the last grouper).
function partitionGroup(entry: unknown, groups: readonly OpNode[]): string {
  const params = isObject(entry) ? entry.params : undefined
  const by = isObject(params) ? params.partition_by : undefined
  const k = Array.isArray(by) && by.length > 0 ? Math.min(by.length, groups.length) : groups.length - 1
  return groups[Math.max(0, k - 1)].id
}

function detailOf(doc: Record<string, unknown>, key: PartKey, grouped: boolean): string | undefined {
  if (key === 'crosstab' && crosstabLong(doc)) return 'long: cells land in data'
  // An overlay layer sits beside its host, keyed to its coordinates.
  if (key === 'overlays') return doc.crosstab !== undefined ? 'on crosstab cells' : grouped ? 'series over groups' : undefined
  return undefined
}

function entryOf(doc: Record<string, unknown>, key: string, id: string): unknown {
  const v = doc[key]
  return Array.isArray(v) ? v[indexOf(id)] : v
}

// names says whether any string inside v matches word.
function names(v: unknown, word: RegExp): boolean {
  if (typeof v === 'string') return word.test(v)
  if (Array.isArray(v)) return v.some((x) => names(x, word))
  if (isObject(v)) return Object.values(v).some((x) => names(x, word))
  return false
}

function indexOf(id: string): number {
  const m = /\[(\d+)\]$/.exec(id)
  return m ? Number(m[1]) : 0
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
