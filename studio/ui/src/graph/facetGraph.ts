// facetGraph maps a Facet root (FacetRequest) to the stage-column graph:
// the cohort, the facet's filterers and overlays as ordinary nodes
// (buildRequestGraph), and one facet node standing for the facet's
// output. The facet node carries the fields it summarizes, each wired
// from its cohort field, and the facet settings (top-k, percentiles,
// histogram options); its preview is the facet result itself.
//
// The facet node's id is FACET_NODE (`fields`, the JSON path of the
// field list), so POST /api/preview runs the whole facet for it and
// predict issues on `fields[1]` land on it. Issues on the other settings
// (`discrete_top_k`, ...) attach to it too: the view passes FACET_PROPS
// as extra validation ids and the node shows them all.
//
// Pure and deterministic, like buildRequestGraph.

import type { CohortField, Manifest } from '../api.ts'
import { getIn, setIn } from './jsonEdit.ts'
import { toPlain, type JsonNode } from './jsonTree.ts'
import { buildModel, emitModel, type GraphModel } from './model.ts'
import { buildRequestGraph, layoutNodes, LAYOUT, type FacetNode, type GraphEdge, type ParamRow, type RequestGraph } from './requestGraph.ts'

export const FACET_NODE = 'fields'

// FACET_PROPS are the facet settings the facet node shows and the facet
// inspector edits, in display order (model.ts models them as props).
export const FACET_PROPS = [
  'fields',
  'additive_fields',
  'discrete_top_k',
  'numeric_percentiles',
  'include_histogram',
  'histogram_bins',
  'histogram_range',
  'time_zone',
] as const

export type FacetProp = (typeof FACET_PROPS)[number]

const PROP_SET = new Set<string>(FACET_PROPS)

export type FacetOptions = { manifest?: Manifest; cohortFields?: CohortField[] }

export function buildFacetGraph(req: unknown, opts: FacetOptions = {}): RequestGraph {
  if (typeof req !== 'object' || req === null || Array.isArray(req)) throw new Error('request must be a JSON object')
  const doc = req as Record<string, unknown>
  // Everything but the settings draws as in a plain request: the cohort,
  // filterers, overlays, raw extras (labels, models).
  const rest = Object.fromEntries(Object.entries(doc).filter(([k]) => !PROP_SET.has(k)))
  const g = buildRequestGraph(rest, { manifest: opts.manifest, cohortFields: opts.cohortFields })

  const known = opts.cohortFields
  const names = new Set(known?.map((f) => f.name))
  const fields = Array.isArray(doc.fields) ? doc.fields : null
  const rows: ParamRow[] = []
  const edges: GraphEdge[] = []
  const cohort = g.nodes.find((n) => n.type === 'cohort')
  if (fields) {
    fields.forEach((f, i) => {
      const key = `fields[${i}]`
      if (typeof f !== 'string') {
        rows.push({ key, value: JSON.stringify(f) })
        return
      }
      const resolved = !known || names.has(f)
      rows.push({ key, value: f, ref: f, resolved })
      if (!resolved || cohort?.type !== 'cohort') return
      const fieldRow = cohort.data.fields.find((x) => x.name === f)
      if (fieldRow) fieldRow.used = true
      else cohort.data.fields.push({ name: f, type: '', used: true })
      const targetHandle = `in:${key}`
      edges.push({
        id: `${cohort.id}|field:${f}->${FACET_NODE}|${targetHandle}`,
        source: cohort.id,
        sourceHandle: `field:${f}`,
        target: FACET_NODE,
        targetHandle,
        data: { ref: f, role: 'fields' },
      })
    })
  } else {
    rows.push({ key: 'fields', value: JSON.stringify(doc.fields ?? null) })
  }
  for (const k of FACET_PROPS) {
    if (k === 'fields' || !(k in doc)) continue
    const v = doc[k]
    rows.push({ key: k, value: clip(Array.isArray(v) ? `[${v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ')}]` : typeof v === 'string' ? v : JSON.stringify(v)) })
  }
  const node: FacetNode = { id: FACET_NODE, type: 'facet', position: { x: 0, y: 0 }, data: { path: FACET_NODE, column: 'analysis', rows } }
  const nodes = [...g.nodes, node]
  const columns = layoutNodes(nodes)
  return { nodes, edges: [...g.edges, ...edges], columns }
}

function clip(s: string): string {
  return s.length > LAYOUT.valueMax ? s.slice(0, LAYOUT.valueMax - 1) + '…' : s
}

// setFacetProp sets (or, with undefined, removes) one facet setting on
// the emitted tree and rebuilds the model. A new key is appended; an
// existing one keeps its place. Values are jsonTree nodes (parsed from
// what the user typed, so number spellings survive).
export function setFacetProp(model: GraphModel, key: FacetProp, value: JsonNode | undefined): GraphModel {
  if (model.kind !== 'facet') throw new Error('not a facet request')
  if (key === 'fields' && (value?.type !== 'array' || value.items.length === 0)) throw new Error('a facet needs at least one field')
  const root = emitModel(model)
  if (value === undefined && getIn(root, [key]) === undefined) return model
  return buildModel(setIn(root, [key], value), model.kind)
}

// facetValue reads one facet setting from the model as plain JSON.
export function facetValue(model: GraphModel, key: FacetProp): unknown {
  const v = getIn(emitModel(model), [key])
  return v === undefined ? undefined : toPlain(v)
}
