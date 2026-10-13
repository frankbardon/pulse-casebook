// resultGraph derives the view-only parts of a request frame's graph:
// the Result node (the table the frame returns), the group fan-out
// ("scope") wires and the attribute output columns. Nothing here is ever
// written into the request JSON; it is all read off the entries the
// request already has (pulse v1.0.0-alpha.10 semantics):
//
//   - Result `data`: one row per observed group key combination; each row
//     carries every grouper's key column (groups order), then the
//     aggregation labels, then the window labels. With no groups and no
//     aggregations the request returns row-level output.
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

import { formatPath, parsePath, type PathSegment } from './nodePath.ts'
import { groupKeyColumn, type GroupEntry } from './partition.ts'
import type { GraphEdge, OpNode, ResultColumn, ResultNode } from './requestGraph.ts'

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
// fan-out wires, attribute output usage, and (with result) the Result
// node wired from its columns' sources.
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
  for (const c of cols) {
    if (c.source === undefined) continue
    const sourceHandle = c.kind === 'key' ? KEY_HANDLE : 'out'
    const targetHandle = columnHandle(c.name)
    edges.push({
      id: `${c.source}|${sourceHandle}->${id}|${targetHandle}`,
      source: c.source,
      sourceHandle,
      target: id,
      targetHandle,
      className: 'result-wire',
      deletable: false,
      data: { ref: c.name, role: 'result' },
    })
  }
  const last = (section: string) => ops.filter((n) => n.data.section === section).at(-1)?.id
  const previewFrom = last('sort') ?? last('windows') ?? last('aggregations') ?? last('groups')
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
      rowLevel: groups.length === 0 && !ops.some((n) => n.data.section === 'aggregations'),
      ...(previewFrom !== undefined && { previewFrom }),
    },
  }
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
