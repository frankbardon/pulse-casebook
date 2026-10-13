// chainGraph maps a Chain root (ChainRequest) to ordered, stacked lanes:
// one lane per stage (`stages[i]`), top to bottom in stage order, each
// drawn by buildRequestGraph with the shared stage columns, plus a root
// lane for the chain-level sections (whole-chain overlays; anything else
// raw). It returns the same lane graph shape as composeGraph, so the view
// draws, lays out, previews and validates both the same way.
//
// Stage 0 reads the chain's cohort: the cohort node (id `cohort`, its
// JSON path at the chain root) sits in the first stage's lane and wires
// into it. Every later stage reads the previous stage's output rows (its
// group fields and aggregation labels), not a cohort: refs naming those
// columns resolve without a cohort wire, and a ref naming an aggregation
// label of the previous stage is wired from that aggregation across the
// lane boundary.
//
// Node ids stay JSON paths (`stages[1].request.aggregations[0]`); lane
// ids are `stages[i]`; the root lane is ROOT_LANE. Pure and
// deterministic.

import type { CohortField, Manifest } from '../api.ts'
import { formatPath, type PathSegment } from './nodePath.ts'
import { buildComposeLayout, ROOT_LANE, type ComposeGraph, type Lane } from './composeGraph.ts'
import type { RightSide } from './joins.ts'
import { buildRequestGraph, rawNode, type GraphEdge, type GraphNode } from './requestGraph.ts'

export type ChainGraph = ComposeGraph & {
  // The input columns of each stage lane: the cohort's fields for the
  // first stage (when inspected), the previous stage's output after.
  inputs: Map<string, CohortField[] | undefined>
}

export type ChainOptions = {
  manifest?: Manifest
  cohortFields?: CohortField[]
  // A join's right cohort fields by its `right` path (first stage only).
  rightFields?: (right: string) => RightSide
}

export function buildChainGraph(req: unknown, opts: ChainOptions = {}): ChainGraph {
  if (!isObject(req)) throw new Error('request must be a JSON object')
  const lanes: Lane[] = []
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const inputs = new Map<string, CohortField[] | undefined>()
  const add = (lane: Omit<Lane, 'columns'>, g: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
    lanes.push({ ...lane, columns: [] })
    for (const n of g.nodes) nodes.push({ ...n, parentId: lane.id } as GraphNode)
    edges.push(...g.edges)
  }

  const stages = Array.isArray(req.stages) && req.stages.length > 0 && req.stages.every(isObject) ? (req.stages as Record<string, unknown>[]) : null

  // Root lane: chain-level sections. The cohort moves into the first
  // stage's lane when there is one.
  const rootDoc = Object.fromEntries(Object.entries(req).filter(([k]) => !(stages && (k === 'stages' || k === 'cohort'))))
  if (Object.keys(rootDoc).length > 0) {
    add(
      { id: ROOT_LANE, role: 'root', index: -1, base: [], title: 'Chain', named: false },
      buildRequestGraph(rootDoc, { manifest: opts.manifest, cohortFields: opts.cohortFields, withCohort: !stages && 'cohort' in req }),
    )
  }

  let input: CohortField[] | undefined = opts.cohortFields
  let upstream = new Map<string, string>()
  stages?.forEach((stage, i) => {
    const id = formatPath(['stages', i])
    const base: PathSegment[] = ['stages', i, 'request']
    inputs.set(id, input)
    const r = stage.request
    let g: { nodes: GraphNode[]; edges: GraphEdge[] }
    if (!isObject(r)) {
      g = { nodes: [rawNode(formatPath(base), 'request', r)], edges: [] }
    } else {
      const body = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'cohort'))
      if (i === 0) {
        g = buildRequestGraph({ ...body, cohort: req.cohort }, { manifest: opts.manifest, cohortFields: input, basePath: base, rightFields: opts.rightFields })
        rehomeCohort(g, formatPath([...base, 'cohort']))
      } else {
        g = buildRequestGraph(body, { manifest: opts.manifest, cohortFields: input ?? [], basePath: base, withCohort: false, implicitFields: true })
        wireUpstream(g, upstream)
      }
      // A stage's own cohort is ignored by the engine; keep it visible.
      if ('cohort' in r) g.nodes.push(rawNode(formatPath([...base, 'cohort']), 'cohort', r.cohort))
    }
    for (const [k, v] of Object.entries(stage)) {
      if (k !== 'name' && k !== 'request') g.nodes.push(rawNode(formatPath(['stages', i, k]), k, v))
    }
    const name = typeof stage.name === 'string' ? stage.name : undefined
    add({ id, role: 'stage', index: i, base, title: name ?? `stage ${i + 1}`, named: name !== undefined }, g)
    const out = stageOutput(isObject(r) ? r : {}, base)
    input = out.fields
    upstream = out.producers
  })

  return { ...buildComposeLayout(lanes, nodes, edges), inputs }
}

// rehomeCohort gives the first stage's cohort node its chain-root id
// (`cohort`), the model's id for the chain cohort.
function rehomeCohort(g: { nodes: GraphNode[]; edges: GraphEdge[] }, from: string): void {
  const c = g.nodes.find((n) => n.id === from)
  if (!c || c.type !== 'cohort') return
  c.id = 'cohort'
  c.data = { ...c.data, path: 'cohort' }
  g.edges = g.edges.map((e) => (e.source === from ? { ...e, source: 'cohort', id: e.id.replace(from + '|', 'cohort|') } : e))
}

// wireUpstream draws a wire into a later stage's input from the previous
// stage's aggregation whose label it names.
function wireUpstream(g: { nodes: GraphNode[]; edges: GraphEdge[] }, producers: ReadonlyMap<string, string>): void {
  const wired = new Set(g.edges.map((e) => `${e.target}|${e.targetHandle}`))
  for (const n of g.nodes) {
    if (n.type !== 'op') continue
    for (const row of n.data.rows) {
      if (row.ref === undefined || !row.resolved) continue
      const targetHandle = `in:${row.key}`
      if (wired.has(`${n.id}|${targetHandle}`)) continue
      const src = producers.get(row.ref)
      if (src === undefined) continue
      g.edges.push({
        id: `${src}|out->${n.id}|${targetHandle}`,
        source: src,
        sourceHandle: 'out',
        target: n.id,
        targetHandle,
        className: 'stage-wire',
        data: { ref: row.ref, role: 'stage' },
      })
    }
  }
}

// stageOutput lists the columns a stage hands the next one, typed as the
// engine synthesizes them: its group keys (categorical_u32) then its
// aggregation labels (f64), plus the aggregation node ids by label.
export function stageOutput(
  r: Record<string, unknown>,
  base: PathSegment[],
): { fields: CohortField[]; producers: Map<string, string> } {
  const fields: CohortField[] = []
  const producers = new Map<string, string>()
  const seen = new Set<string>()
  const push = (name: string, type: string) => {
    if (seen.has(name)) return
    seen.add(name)
    fields.push({ name, type })
  }
  if (Array.isArray(r.groups)) {
    for (const g of r.groups) {
      if (isObject(g) && typeof g.field === 'string') push(g.field, 'categorical_u32')
    }
  }
  if (Array.isArray(r.aggregations)) {
    r.aggregations.forEach((a, j) => {
      if (!isObject(a) || typeof a.label !== 'string') return
      push(a.label, 'f64')
      producers.set(a.label, formatPath([...base, 'aggregations', j]))
    })
  }
  return { fields, producers }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
