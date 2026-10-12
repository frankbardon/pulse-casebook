// model is the editable graph model of a request document: JSON -> model
// -> JSON, lossless, for all four request roots (Request, Compose
// including `fits`, Chain, Facet).
//
// The model splits a document into nodes and the outline that holds them.
//
//   - A node is one piece of request JSON the builder treats as a unit: a
//     cohort, one section entry (`tests[2]`, `crosstab`), a scalar
//     property of a structural object (a fit's `name`, a stage's `name`, a
//     facet's `fields`), or a raw node. Its id is the JSON path of the
//     piece (nodePath.ts), so ids are the same ids the canvas uses and stay
//     stable across round-trips. Its value is the verbatim jsonTree.
//   - Raw nodes hold anything the builder does not model, verbatim: unknown
//     sections, wrongly-shaped sections, `sweep`, and entries that carry
//     templating (`for_each`, `{"$var": ...}`, `{{axis}}` placeholders).
//   - The outline is the object/array skeleton between nodes: the root,
//     section arrays, compose slots, fits and chain stages. It keeps every
//     key in document order, so emitting walks it and drops each node's
//     value back in place.
//
// Root detection matches the workspace classifier (studio/internal/
// workspace ClassifyJSON): `requests` = Compose, else `stages` = Chain,
// else `fields` = Facet, else Request.

import { member, parseJson, stringifyJson, type JsonNode, type JsonObject } from './jsonTree.ts'
import { formatPath, type PathSegment } from './nodePath.ts'
import { REQUEST_SECTIONS } from './requestGraph.ts'

export type RootKind = 'request' | 'compose' | 'chain' | 'facet'

export type NodeKind = 'cohort' | 'entry' | 'prop' | 'raw'

// Why a raw node is raw.
export type RawReason = 'unmodeled' | 'shape' | 'templated'

export type ModelNode = {
  id: string
  kind: NodeKind
  // Section key for entries (`tests`), the member key otherwise.
  section: string
  value: JsonNode
  reason?: RawReason
}

export type FrameRole = RootKind | 'fit' | 'stage'

// Body is one position in the outline.
export type Body =
  | { as: 'node'; id: string }
  | { as: 'list'; id: string; items: Body[] }
  | { as: 'frame'; id: string; role: FrameRole; members: Member[] }
  // A repeated key in a structural object. Its path would collide with
  // the first occurrence's, so it gets no node and is carried verbatim.
  | { as: 'verbatim'; value: JsonNode }

export type Member = { key: string; rawKey?: string; body: Body }

export type Frame = Extract<Body, { as: 'frame' }>

export type GraphModel = {
  kind: RootKind
  root: Frame
  // Every node by id, in document order.
  nodes: Map<string, ModelNode>
}

// detectRootKind mirrors workspace.ClassifyJSON's root detection.
export function detectRootKind(doc: JsonNode): RootKind {
  if (doc.type !== 'object') throw new Error('request must be a JSON object')
  const has = (k: string) => doc.members.some((m) => m.key === k)
  if (has('requests')) return 'compose'
  if (has('stages')) return 'chain'
  if (has('fields')) return 'facet'
  return 'request'
}

// parseModel parses request text into a model. kind defaults to the
// detected root kind.
export function parseModel(text: string, kind?: RootKind): GraphModel {
  return buildModel(parseJson(text), kind)
}

// buildModel builds the model of a parsed request document.
export function buildModel(doc: JsonNode, kind: RootKind = detectRootKind(doc)): GraphModel {
  if (doc.type !== 'object') throw new Error('request must be a JSON object')
  const b = new Builder()
  const root = b.frame(doc, [], kind)
  return { kind, root, nodes: b.nodes }
}

// emitModel turns a model back into a JSON tree.
export function emitModel(model: GraphModel): JsonNode {
  const emit = (body: Body): JsonNode => {
    switch (body.as) {
      case 'node': {
        const n = model.nodes.get(body.id)
        if (!n) throw new Error(`model has no node ${body.id}`)
        return n.value
      }
      case 'list':
        return { type: 'array', items: body.items.map(emit) }
      case 'frame':
        return { type: 'object', members: body.members.map((m) => ({ key: m.key, ...(m.rawKey && { rawKey: m.rawKey }), value: emit(m.body) })) }
      case 'verbatim':
        return body.value
    }
  }
  return emit(model.root)
}

// emitModelText emits compact JSON; the save API applies house style.
export function emitModelText(model: GraphModel): string {
  return stringifyJson(emitModel(model))
}

// Keys of structural objects that are modeled as plain property nodes.
const FIT_PROPS = new Set(['name', 'save'])
const STAGE_PROPS = new Set(['name'])
const FACET_PROPS = new Set([
  'fields',
  'additive_fields',
  'discrete_top_k',
  'numeric_percentiles',
  'include_histogram',
  'histogram_bins',
  'histogram_range',
  'time_zone',
])
// Entry-list sections at the Compose, Chain and Facet roots.
const COMPOSE_SECTIONS: ReadonlyMap<string, { single: boolean }> = new Map([
  ['overlays', { single: false }],
  ['multiplicity', { single: true }],
  ['return', { single: true }],
])
const CHAIN_SECTIONS: ReadonlyMap<string, { single: boolean }> = new Map([['overlays', { single: false }]])
const FACET_SECTIONS: ReadonlyMap<string, { single: boolean }> = new Map([
  ['filterers', { single: false }],
  ['overlays', { single: false }],
])

class Builder {
  nodes = new Map<string, ModelNode>()

  frame(obj: JsonObject, path: PathSegment[], role: FrameRole): Frame {
    const seen = new Set<string>()
    const members: Member[] = obj.members.map((m) => {
      const key = { key: m.key, ...(m.rawKey && { rawKey: m.rawKey }) }
      if (seen.has(m.key)) return { ...key, body: { as: 'verbatim', value: m.value } }
      seen.add(m.key)
      return { ...key, body: this.member(role, m.key, m.value, [...path, m.key]) }
    })
    return { as: 'frame', id: formatPath(path), role, members }
  }

  member(role: FrameRole, key: string, value: JsonNode, path: PathSegment[]): Body {
    switch (role) {
      case 'request':
        if (key === 'cohort') return this.cohort(value, path)
        return this.section(REQUEST_SECTIONS, key, value, path)
      case 'compose':
        if (key === 'requests') return this.list(value, path, (item, p) => this.frame(item, p, 'request'))
        if (key === 'fits') return this.list(value, path, (item, p) => this.frame(item, p, 'fit'))
        return this.section(COMPOSE_SECTIONS, key, value, path)
      case 'chain':
        if (key === 'cohort') return this.cohort(value, path)
        if (key === 'stages') return this.list(value, path, (item, p) => this.frame(item, p, 'stage'))
        return this.section(CHAIN_SECTIONS, key, value, path)
      case 'facet':
        if (key === 'cohort') return this.cohort(value, path)
        if (FACET_PROPS.has(key)) return this.node(path, 'prop', key, value)
        return this.section(FACET_SECTIONS, key, value, path)
      case 'fit':
      case 'stage':
        if (key === 'request') {
          return value.type === 'object' ? this.frame(value, path, 'request') : this.raw(path, key, value, 'shape')
        }
        if ((role === 'fit' ? FIT_PROPS : STAGE_PROPS).has(key)) return this.node(path, 'prop', key, value)
        return this.raw(path, key, value, 'unmodeled')
    }
  }

  cohort(value: JsonNode, path: PathSegment[]): Body {
    return value.type === 'object' ? this.node(path, 'cohort', 'cohort', value) : this.raw(path, 'cohort', value, 'shape')
  }

  // section models a known entry section (array of objects, or a single
  // object) and leaves everything else raw.
  section(table: ReadonlyMap<string, { single: boolean }>, key: string, value: JsonNode, path: PathSegment[]): Body {
    const spec = table.get(key)
    if (!spec) return this.raw(path, key, value, 'unmodeled')
    const entry = (v: JsonNode, p: PathSegment[]) =>
      isTemplated(v) ? this.raw(p, key, v, 'templated') : this.node(p, 'entry', key, v)
    if (spec.single) return value.type === 'object' ? entry(value, path) : this.raw(path, key, value, 'shape')
    return this.list(value, path, entry, key)
  }

  // list models an array whose items are all objects; anything else is a
  // raw node at the array's own path.
  list(value: JsonNode, path: PathSegment[], item: (v: JsonObject, p: PathSegment[]) => Body, section = String(path[path.length - 1])): Body {
    if (value.type !== 'array' || !value.items.every((v) => v.type === 'object')) {
      return this.raw(path, section, value, 'shape')
    }
    return { as: 'list', id: formatPath(path), items: value.items.map((v, i) => item(v as JsonObject, [...path, i])) }
  }

  raw(path: PathSegment[], section: string, value: JsonNode, reason: RawReason): Body {
    return this.node(path, 'raw', section, value, reason)
  }

  node(path: PathSegment[], kind: NodeKind, section: string, value: JsonNode, reason?: RawReason): Body {
    const id = formatPath(path)
    this.nodes.set(id, { id, kind, section, value, ...(reason && { reason }) })
    return { as: 'node', id }
  }
}

const PLACEHOLDER = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/

// isTemplated reports whether an entry uses sweep/for_each templating:
// a `for_each` key, a `{"$var": ...}` value or a `{{axis}}` placeholder
// in any string. Such entries only mean something after expansion, so the
// builder keeps them as raw JSON.
export function isTemplated(v: JsonNode): boolean {
  switch (v.type) {
    case 'object':
      if (v.members.length === 1 && v.members[0].key === '$var') return true
      if (member(v, 'for_each') !== undefined) return true
      return v.members.some((m) => PLACEHOLDER.test(m.key) || isTemplated(m.value))
    case 'array':
      return v.items.some(isTemplated)
    case 'string':
      return PLACEHOLDER.test(v.raw)
    default:
      return false
  }
}
