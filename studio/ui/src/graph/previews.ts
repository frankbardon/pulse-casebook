// previews holds the pure parts of live node previews: which nodes an
// edit invalidates, how invalidated nodes batch into POST /api/preview
// calls, and how probe values are formatted for the compact node body.
// The fetching and state live in usePreviews.ts.

import type { PreviewProbe } from '../api.ts'
import { stringifyJson } from './jsonTree.ts'
import type { GraphModel } from './model.ts'
import { FACET_NODE } from './facetGraph.ts'
import { frameOf, splitFrame } from './nodePath.ts'
import { COLUMNS, REQUEST_SECTIONS, hasPreview, sectionInfo, type GraphEdge, type GraphNode } from './requestGraph.ts'

// PreviewState is what a node's preview footer shows.
export type PreviewState =
  // A request is out; last is the previous result, shown dimmed.
  | { status: 'loading'; last?: PreviewProbe }
  // deferred lists parts left out to stay cheap (["quantiles"]).
  | { status: 'ok'; probe: PreviewProbe; deferred?: string[]; cached?: boolean }
  // Expensive probe on a cohort over --auto-preview-rows: run on demand.
  | { status: 'deferred'; reason?: string; rows?: number }
  | { status: 'timed_out' }
  | { status: 'cancelled' }
  // The node has no probe (vectors etc.); reason says why.
  | { status: 'none'; reason?: string }
  | { status: 'error'; message: string }

// fingerprints maps every model node id to its compact JSON, the unit of
// change detection between two edits.
export function fingerprints(model: GraphModel): Map<string, string> {
  const out = new Map<string, string>()
  for (const [id, n] of model.nodes) out.set(id, stringifyJson(n.value))
  return out
}

// changedIds lists ids whose JSON differs, including ids only one side has.
export function changedIds(prev: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>()
  for (const [id, fp] of next) if (prev.get(id) !== fp) out.add(id)
  for (const id of prev.keys()) if (!next.has(id)) out.add(id)
  return out
}

// Where an entry sits in the pipeline. frame is the request frame the
// entry belongs to (nodePath.splitFrame): "" for a plain request and the
// compose root, `requests[1]` for a compose slot, `fits[0].request` for a
// fit. Pipeline order only holds inside one frame.
type Place = { frame: string; section: string; index: number; column: number }

const COLUMN_INDEX = new Map(COLUMNS.map((c, i) => [c.key, i]))

// Sections whose entries see each other as a family: multiplicity
// adjusts every test of the request, so one edit stales them all.
const FAMILY_SECTIONS = new Set(['tests', 'post_tests'])

// Sections whose entries are independent of their siblings.
const INDEPENDENT_SECTIONS = new Set(['regressions', 'matrices', 'overlays', 'vectors'])

// placeOf locates a section entry id (`filterers[2]`, `crosstab`,
// `requests[1].tests[0]`); null for the cohort, context keys and anything
// not a modeled entry.
function placeOf(id: string): Place | null {
  // A facet's output node (facetGraph.ts) runs after its filters.
  if (id === FACET_NODE) return { frame: '', section: FACET_NODE, index: 0, column: COLUMN_INDEX.get('analysis') ?? 0 }
  let frame, segs
  try {
    ;({ frame, rest: segs } = splitFrame(id))
  } catch {
    return null
  }
  const [head, idx] = segs
  if (typeof head !== 'string') return null
  const spec = REQUEST_SECTIONS.get(head)
  const info = sectionInfo(head)
  if (!spec || !info) return null
  if (spec.single ? segs.length !== 1 : segs.length !== 2 || typeof idx !== 'number') return null
  return { frame, section: head, index: typeof idx === 'number' ? idx : 0, column: COLUMN_INDEX.get(info.column) ?? 0 }
}

// downstreamOf says whether node at p is affected by an edit at e:
// a later stage column, a later entry of a sequential section, any
// sibling of a test family, or the edit itself, all within one frame.
function downstreamOf(e: Place, p: Place): boolean {
  // A chain stage reads the previous stage's rows: everything in a later
  // stage is downstream of an edit in an earlier one.
  const es = stageOf(e.frame)
  const ps = stageOf(p.frame)
  if (es !== undefined && ps !== undefined && ps > es) return true
  if (p.frame !== e.frame) return false
  if (p.section === e.section) {
    if (p.index === e.index || FAMILY_SECTIONS.has(e.section)) return true
    if (INDEPENDENT_SECTIONS.has(e.section)) return false
    return p.index > e.index
  }
  return p.column > e.column
}

// invalidated lists the graph nodes whose previews an edit makes stale:
// for each changed id, the nodes downstream of it (later stage columns,
// later entries of the same section) plus everything wired, transitively,
// from those nodes' outputs. A change outside the modeled sections (the
// cohort, weight, joins, time_zone, a raw section) stales every node of
// its frame; outside any compose slot it stales every node.
//
// Multi-request roots: frames are independent of each other, except that
// root-frame (compose-level) overlays read every slot, a compose-level
// multiplicity block is inherited by every slot's tests, fits feed the
// slots that bind them (carried by the binding wires), and a chain stage
// feeds every later stage.
export function invalidated(changed: Iterable<string>, graph: { nodes: GraphNode[]; edges: GraphEdge[] }): Set<string> {
  const all = () => new Set(graph.nodes.map((n) => n.id))
  const out = new Set<string>()
  const places = new Map<string, Place>()
  for (const n of graph.nodes) {
    const p = placeOf(n.id)
    if (p) places.set(n.id, p)
  }
  const rootOverlays = () => {
    for (const [nid, p] of places) if (p.frame === '' && p.section === 'overlays') out.add(nid)
  }
  for (const id of changed) {
    const e = placeOf(id)
    if (!e) {
      const frame = frameOf(id)
      const stage = stageOf(frame)
      if (!frame.startsWith('requests[') && stage === undefined) return all()
      for (const n of graph.nodes) {
        const f = frameOf(n.id)
        const s = stageOf(f)
        if (f === frame || (stage !== undefined && s !== undefined && s > stage)) out.add(n.id)
      }
      rootOverlays()
      continue
    }
    if (e.section === 'multiplicity') {
      for (const [nid, p] of places) if (FAMILY_SECTIONS.has(p.section) && (e.frame === '' || p.frame === e.frame)) out.add(nid)
      continue
    }
    for (const [nid, p] of places) if (downstreamOf(e, p)) out.add(nid)
    if (e.frame !== '') rootOverlays()
  }
  // Wires carry an edit to every consumer of the edited node's output.
  const next = new Map<string, string[]>()
  for (const e of graph.edges) next.set(e.source, [...(next.get(e.source) ?? []), e.target])
  const queue = [...out]
  while (queue.length > 0) {
    for (const t of next.get(queue.pop()!) ?? []) {
      if (!out.has(t)) {
        out.add(t)
        queue.push(t)
      }
    }
  }
  return out
}

// stageOf is the chain stage index of a frame (`stages[2].request`).
function stageOf(frame: string): number | undefined {
  const m = /^stages\[(\d+)\]\.request$/.exec(frame)
  return m ? Number(m[1]) : undefined
}

// batches groups the previewable nodes among ids into preview calls: one
// per frame and section (the API batches only nodes of one request frame
// and section), in pipeline order so upstream nodes are queued first.
export function batches(ids: Iterable<string>, nodes: GraphNode[]): string[][] {
  const want = new Set(ids)
  const byKey = new Map<string, { section: string; ids: string[] }>()
  for (const n of nodes) {
    if (!want.has(n.id) || !hasPreview(n)) continue
    const section = n.type === 'op' ? n.data.section : n.type === 'facet' ? FACET_NODE : 'cohort'
    const key = `${frameOf(n.id)}|${section}`
    const b = byKey.get(key) ?? { section, ids: [] }
    b.ids.push(n.id)
    byKey.set(key, b)
  }
  const rank = (key: string) => {
    if (key === 'cohort') return -1
    return COLUMN_INDEX.get(sectionInfo(key)?.column ?? 'output') ?? 0
  }
  return [...byKey.values()].sort((a, b) => rank(a.section) - rank(b.section)).map((b) => b.ids)
}

// --- formatting -----------------------------------------------------------

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 })

// fmtCount renders a row count: grouped digits up to a million, compact
// above (1.2M).
export function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '–'
  return Math.abs(n) >= 1e6 ? COMPACT.format(n) : GROUPED.format(n)
}

// fmtNum renders a measure with `digits` significant digits; integers
// keep all digits below a million.
export function fmtNum(v: unknown, digits = 4): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v === null || v === undefined ? '–' : String(v)
  if (Number.isInteger(v) && Math.abs(v) < 1e6) return GROUPED.format(v)
  const a = Math.abs(v)
  if (a >= 1e6) return COMPACT.format(v)
  if (a !== 0 && a < 1e-3) return v.toExponential(1)
  return String(Number(v.toPrecision(digits)))
}

export function fmtPct(part: number, whole: number): string {
  if (!whole) return '–'
  const pct = (part / whole) * 100
  return `${pct >= 99.95 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`
}

// Headline is one `k v` pair of a terminal node's preview.
export type Headline = { k: string; v: string }

// headlines picks up to three numbers that summarize an analysis result
// (test, regression, matrix, crosstab, overlay, post-test).
export function headlines(probe: PreviewProbe): Headline[] {
  const r = probe.result
  if (!isObj(r)) return []
  const out: Headline[] = []
  const add = (k: string, v: unknown) => {
    // Three significant digits so three headlines fit the node width.
    if (out.length < 3 && typeof v === 'number') out.push({ k, v: fmtNum(v, 3) })
  }
  if (probe.kind === 'crosstab' && isObj(r.matrix)) {
    const m = r.matrix
    const rows = Array.isArray(m.row_keys) ? m.row_keys.length : 0
    const cols = Array.isArray(m.column_keys) ? m.column_keys.length : 0
    out.push({ k: 'cells', v: `${rows}×${cols}` })
    const cells = Array.isArray(m.cells) ? m.cells.flat() : []
    const vals = cells.filter(isObj).map((c) => c.value).filter((v): v is number => typeof v === 'number')
    if (vals.length > 0) out.push({ k: typeof m.cell_label === 'string' ? m.cell_label : 'value', v: `${fmtNum(Math.min(...vals))}…${fmtNum(Math.max(...vals))}` })
    return out
  }
  if (probe.kind === 'regression') {
    add('r²', r.r2)
    add('n', r.n_obs)
    if (isObj(r.coefficients)) {
      const term = Object.keys(r.coefficients).find((k) => k !== '(intercept)')
      if (term !== undefined) add(term, r.coefficients[term])
    }
    return out
  }
  if (typeof r.p_adjusted === 'number') add('p adj', r.p_adjusted)
  else add('p', r.p_value)
  add('stat', r.statistic)
  const d = isObj(r.details) ? r.details : {}
  add('diff', d.diff)
  // Anything else: the first top-level numbers.
  for (const [k, v] of Object.entries(r)) {
    if (k === 'alpha' || k === 'df') continue
    add(k, v)
  }
  return out
}

// tableSummary summarizes a group/aggregation/window/sort table: the row
// count, and the named column's value (one row) or range (many rows).
export function tableSummary(probe: PreviewProbe, label: string | undefined): { count: string; detail?: string } {
  const t = probe.table
  if (!t) return { count: '–' }
  const noun = probe.kind === 'group' ? 'group' : 'row'
  const count = `${fmtCount(t.total_rows)} ${noun}${t.total_rows === 1 ? '' : 's'}`
  if (probe.kind === 'group') {
    const keys = t.rows.map((row) =>
      Object.entries(row)
        .filter(([k]) => !k.startsWith('__probe'))
        .map(([, v]) => String(v))
        .join('/'),
    )
    return { count, detail: keys.join(', ') }
  }
  if (label === undefined) return { count }
  const vals = t.rows.map((row) => row[label]).filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return { count }
  if (vals.length === 1) return { count, detail: `${label} ${fmtNum(vals[0])}` }
  return { count, detail: `${label} ${fmtNum(Math.min(...vals))}…${fmtNum(Math.max(...vals))}` }
}

// --- facet results -----------------------------------------------------

export type DiscreteSummary = { values: { value: string; count: number }[]; distinct: number; truncated: number }
export type NumericSummary = {
  min?: number
  max?: number
  mean?: number
  stddev?: number
  count?: number
  percentiles: [string, number][]
  bins?: number[]
}
export type FieldSummary = { name: string; type: string; nulls: number; discrete?: DiscreteSummary; numeric?: NumericSummary }

// facetFields reads the FacetResult fields map of a facet probe, in name
// order.
export function facetFields(probe: PreviewProbe): FieldSummary[] {
  const fs = probe.facet
  if (!isObj(fs)) return []
  return Object.keys(fs)
    .sort()
    .map((name): FieldSummary => {
      const raw = fs[name]
      const f = isObj(raw) ? raw : {}
      const out: FieldSummary = { name, type: str(f.type_name), nulls: num(f.null_count) ?? 0 }
      if (isObj(f.discrete)) {
        const d = f.discrete
        out.discrete = {
          values: (Array.isArray(d.values) ? d.values : []).filter(isObj).map((v) => ({ value: str(v.value), count: num(v.count) ?? 0 })),
          distinct: num(d.distinct_count) ?? 0,
          truncated: num(d.truncated_at) ?? 0,
        }
      }
      if (isObj(f.numeric)) {
        const n = f.numeric
        const pct = isObj(n.percentiles) ? n.percentiles : {}
        const hist = isObj(n.histogram) && Array.isArray(n.histogram.bins) ? n.histogram.bins.map((b) => num(b) ?? 0) : undefined
        out.numeric = {
          min: num(n.min),
          max: num(n.max),
          mean: num(n.mean),
          stddev: num(n.stddev),
          count: num(n.count),
          percentiles: Object.entries(pct)
            .map(([p, v]): [string, number] => [p, num(v) ?? NaN])
            .sort((a, b) => Number(a[0]) - Number(b[0])),
          ...(hist && { bins: hist }),
        }
      }
      return out
    })
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
