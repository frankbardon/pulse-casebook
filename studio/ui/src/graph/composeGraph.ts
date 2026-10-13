// composeGraph maps a Compose root to parallel lanes: one lane per
// `requests[]` slot and one per `fits[]` entry, each drawn by
// buildRequestGraph with its own stage columns, plus a root lane for the
// compose-level sections (overlays, multiplicity, return; anything else
// raw). Fits bind across lanes: a slot entry whose `params.fit` names a
// fit (ATTR_REG_PREDICT) gets a wire from that fit's regression.
//
// Node ids stay JSON paths (`requests[1].tests[0]`,
// `fits[0].request.regressions[0]`), so previews, validation, the
// inspector and the layout sidecar work per lane unchanged. Lane ids are
// the frame paths `requests[i]` and `fits[j]`; the root lane is
// ROOT_LANE.
//
// Lanes are React Flow parent nodes. Content positions are relative to
// their lane (x on shared stage columns, y below the lane header), so a
// lane moves as a whole when lanes are reordered or one above grows. The
// sidecar stores these relative positions and the lane order (`lanes`).
//
// Pure and deterministic, like buildRequestGraph.

import type { CohortField, Manifest } from '../api.ts'
import type { RightSide } from './joins.ts'
import { formatPath, type PathSegment } from './nodePath.ts'
import {
  buildRequestGraph,
  COLUMNS,
  LAYOUT,
  rawNode,
  sectionInfo,
  type ColumnKey,
  type GraphEdge,
  type GraphNode,
  type OpNode,
  type ResultNode,
} from './requestGraph.ts'
import { composeResponse, type ComposeFit, type ComposeSlot } from './resultGraph.ts'
import { bindsFit, FIT_HANDLE, FIT_ROW } from './wiring.ts'

export const ROOT_LANE = '(compose)'

export type LaneRole = 'root' | 'slot' | 'fit' | 'stage'

export type Lane = {
  id: string
  role: LaneRole
  // Slot or fit index; -1 for the root lane.
  index: number
  // Path of the lane's request ([] for the root lane).
  base: PathSegment[]
  // Slot label, fit name or "Compose".
  title: string
  // Whether the title comes from the document (a slot label may be absent).
  named: boolean
  // A fit's save path.
  save?: string
  // Stage columns the lane draws.
  columns: ColumnKey[]
}

export type ComposeGraph = {
  lanes: Lane[]
  // Content nodes (not the lanes), each with parentId = its lane id and a
  // lane-relative auto-layout position.
  nodes: GraphNode[]
  edges: GraphEdge[]
  // Shared stage columns, lane-relative x.
  columns: { key: ColumnKey; title: string; x: number }[]
}

export type ComposeOptions = {
  manifest?: Manifest
  // Cohort fields of a lane, from inspecting its cohort.
  fieldsFor?: (laneId: string) => CohortField[] | undefined
  // A join's right cohort fields by its `right` path.
  rightFields?: (right: string) => RightSide
}

// Lane geometry (px). head is the lane header: title row plus space
// above the lane's first nodes.
export const LANE = { pad: 16, head: 60, gap: 28, minBody: 48 }

export function buildComposeGraph(req: unknown, opts: ComposeOptions = {}): ComposeGraph {
  if (!isObject(req)) throw new Error('request must be a JSON object')
  const lanes: Lane[] = []
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const add = (lane: Omit<Lane, 'columns'>, g: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
    lanes.push({ ...lane, columns: [] })
    for (const n of g.nodes) nodes.push({ ...n, parentId: lane.id } as GraphNode)
    edges.push(...g.edges)
  }
  const graphOpts = (laneId: string, base: PathSegment[]) => ({
    manifest: opts.manifest,
    cohortFields: opts.fieldsFor?.(laneId),
    basePath: base,
    rightFields: opts.rightFields,
  })

  const requests = objectList(req.requests)
  const fits = objectList(req.fits)

  // Root lane: everything at the compose root but the lanes themselves,
  // and the compose-level Response node (added once the lanes exist).
  // Drawn when the root has sections of its own or fits (whose results
  // land in the compose response); a root of slots alone has none.
  const rootDoc = Object.fromEntries(
    Object.entries(req).filter(([k]) => !((k === 'requests' && requests) || (k === 'fits' && fits))),
  )
  const hasRoot = Object.keys(rootDoc).length > 0 || (fits?.length ?? 0) > 0
  const rootGraph = hasRoot ? buildRequestGraph(rootDoc, { manifest: opts.manifest, withCohort: false }) : null
  if (rootGraph) add({ id: ROOT_LANE, role: 'root', index: -1, base: [], title: 'Compose', named: false }, rootGraph)

  // Fit lanes.
  const fitSources = new Map<string, string>()
  const fitParts: ComposeFit[] = []
  fits?.forEach((fit, j) => {
    const id = formatPath(['fits', j])
    const base: PathSegment[] = ['fits', j, 'request']
    const name = typeof fit.name === 'string' ? fit.name : undefined
    const g: { nodes: GraphNode[]; edges: GraphEdge[] } = isObject(fit.request)
      ? buildRequestGraph(fit.request, graphOpts(id, base))
      : { nodes: [rawNode(formatPath(base), 'request', fit.request)], edges: [] }
    for (const [k, v] of Object.entries(fit)) {
      if (k !== 'name' && k !== 'save' && k !== 'request') g.nodes.push(rawNode(formatPath(['fits', j, k]), k, v))
    }
    const reg = g.nodes.find((n) => n.type === 'op' && n.data.section === 'regressions')
    if (name !== undefined && reg?.type === 'op') {
      reg.data.fit = name
      if (!fitSources.has(name)) fitSources.set(name, reg.id)
    }
    // Its result lands in the compose response's `fits`: a `response`
    // source handle wired into the root Response node.
    if (reg?.type === 'op') reg.data.response = true
    fitParts.push({ name: name ?? `fit ${j + 1}`, ...(reg && { source: reg.id }) })
    add(
      {
        id,
        role: 'fit',
        index: j,
        base,
        title: name ?? `fit ${j + 1}`,
        named: name !== undefined,
        ...(typeof fit.save === 'string' && { save: fit.save }),
      },
      g,
    )
  })

  // Slot lanes. The label is the lane title, not a node.
  const slotParts: ComposeSlot[] = []
  requests?.forEach((slot, i) => {
    const id = formatPath(['requests', i])
    const body = Object.fromEntries(Object.entries(slot).filter(([k]) => k !== 'label'))
    // Each slot returns its own table: its Result node (fits do not).
    // Its tests inherit the root multiplicity block.
    const g = buildRequestGraph(body, { ...graphOpts(id, ['requests', i]), result: true, inheritedMultiplicity: req.multiplicity })
    for (const n of g.nodes) if (n.type === 'op') bindFit(n, opts.manifest, fitSources, edges)
    const label = typeof slot.label === 'string' ? slot.label : undefined
    add({ id, role: 'slot', index: i, base: ['requests', i], title: label ?? `request_${i + 1}`, named: label !== undefined }, g)
    slotParts.push({ title: label ?? `request_${i + 1}`, result: g.nodes.find((n): n is ResultNode => n.type === 'result') })
  })

  // The compose response: slots, Compose-host overlays, fits, ranking.
  if (rootGraph) {
    const rootOps = rootGraph.nodes.filter((n): n is OpNode => n.type === 'op')
    const node = composeResponse(req, rootOps, slotParts, fitParts, edges)
    nodes.push({ ...node, parentId: ROOT_LANE })
  }

  return buildComposeLayout(lanes, nodes, edges)
}

// buildComposeLayout puts lane content on shared stage columns (so stages
// line up vertically across lanes) at lane-relative positions below the
// lane header, and lists each lane's columns. Shared by compose and chain
// lanes (chainGraph.ts).
export function buildComposeLayout(lanes: Lane[], nodes: GraphNode[], edges: GraphEdge[]): ComposeGraph {
  const used = COLUMNS.filter((c) => nodes.some((n) => n.data.column === c.key))
  const columns = used.map((c, i) => ({ ...c, x: LANE.pad + i * (LAYOUT.nodeWidth + LAYOUT.columnGap) }))
  const xOf = new Map(columns.map((c) => [c.key, c.x]))
  for (const n of nodes) n.position = { x: xOf.get(n.data.column) ?? LANE.pad, y: LANE.head + n.position.y }
  for (const lane of lanes) {
    const own = new Set(nodes.filter((n) => n.parentId === lane.id).map((n) => n.data.column))
    lane.columns = used.filter((c) => own.has(c.key)).map((c) => c.key)
  }
  return { lanes, nodes, edges, columns }
}

// bindFit marks a slot entry's `params.fit` row as a fit binding and
// wires it from the fit's regression (never a grouper's fit enum, see
// wiring.bindsFit); an operator whose manifest requires
// a `fit` param and has none gets an empty fit input.
function bindFit(n: GraphNode & { type: 'op' }, manifest: Manifest | undefined, fits: Map<string, string>, edges: GraphEdge[]): void {
  // A grouper's params.fit is its global | within enum, not a binding.
  if (!bindsFit(n.data.section, n.data.op, manifest)) return
  const row = n.data.rows.find((r) => r.key === FIT_ROW)
  if (row) {
    if (row.port) return
    row.fit = true
    row.ref = row.value
    const src = fits.get(row.value)
    row.resolved = src !== undefined
    if (src !== undefined) {
      const targetHandle = `in:${FIT_ROW}`
      edges.push({
        id: `${src}|${FIT_HANDLE}->${n.id}|${targetHandle}`,
        source: src,
        sourceHandle: FIT_HANDLE,
        target: n.id,
        targetHandle,
        className: 'fit-binding',
        data: { ref: row.value, role: 'fit' },
      })
    }
    return
  }
  const list = manifest ? sectionInfo(n.data.section)?.catalog?.(manifest) : undefined
  const op = list?.find((o) => (o.name ?? o.kind) === n.data.op)
  if (op?.params?.some((p) => p.name === 'fit' && p.required)) {
    n.data.rows.push({ key: FIT_ROW, value: '', port: 'empty', fit: true, accepts: 'a compose fit' })
  }
}

// laneOrder is the drawing order of the non-root lanes: the saved order
// (sidecar `lanes`) for lanes that still exist, then the rest in default
// order (fits first, as they run first, then slots).
export function laneOrder(lanes: readonly Lane[], saved?: readonly string[]): string[] {
  const ids = lanes.filter((l) => l.role !== 'root').map((l) => l.id)
  const live = new Set(ids)
  const out = (saved ?? []).filter((id, k, a) => live.has(id) && a.indexOf(id) === k)
  for (const id of ids) if (!out.includes(id)) out.push(id)
  return out
}

// moveLane moves lane id by delta places in order (clamped).
export function moveLane(order: readonly string[], id: string, delta: number): string[] {
  const from = order.indexOf(id)
  if (from < 0) return [...order]
  const to = Math.max(0, Math.min(order.length - 1, from + delta))
  const out = [...order]
  out.splice(from, 1)
  out.splice(to, 0, id)
  return out
}

export type LaneBox = { id: string; x: number; y: number; width: number; height: number }

// stackLanes places lanes top to bottom: the root lane first, then order.
// bodyHeight is each lane's content extent below its header (from the
// nodes' actual positions and sizes), width the shared lane width.
export function stackLanes(order: readonly string[], hasRoot: boolean, bodyHeight: (id: string) => number, width: number): LaneBox[] {
  const ids = hasRoot ? [ROOT_LANE, ...order] : [...order]
  const out: LaneBox[] = []
  let y = 0
  for (const id of ids) {
    const height = LANE.head + Math.max(LANE.minBody, bodyHeight(id)) + LANE.pad
    out.push({ id, x: 0, y, width, height })
    y += height + LANE.gap
  }
  return out
}

// laneAt finds the lane box containing flow point y (nearest when between).
export function laneAt(boxes: readonly LaneBox[], y: number): LaneBox | undefined {
  let best: { box: LaneBox; d: number } | undefined
  for (const b of boxes) {
    const d = y < b.y ? b.y - y : y > b.y + b.height ? y - b.y - b.height : 0
    if (!best || d < best.d) best = { box: b, d }
  }
  return best?.box
}

function objectList(v: unknown): Record<string, unknown>[] | null {
  return Array.isArray(v) && v.every(isObject) ? (v as Record<string, unknown>[]) : null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
