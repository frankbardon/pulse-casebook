// paramForms builds the inspector form for a model node and turns form
// input back into lossless jsonTree edits.
//
// Forms come from the engine manifest: each operator's declared `params`
// (name, type, required, default, enum_values, exactly_one_of) becomes one
// field. A param lives at the entry's top level when the request schema
// gives the entry a property of that name (a regression's `target`, a
// test's `alpha`), else under `params` (a test's `params.success`).
// Operators whose manifest params are null but which do take
// configuration get hand-written forms (filters' `values`, the date-range
// filter's `params.ranges`, formulas' `expression`, overlays' `scope` and
// `ref`). Everything else is edited as JSON text.

import type { Manifest, ManifestOperator, ManifestParam } from '../api.ts'
import { getIn, parseEdit, prettyJson, sameJson, setIn, stringItems } from './jsonEdit.ts'
import { fromPlain, stringValue, type JsonNode } from './jsonTree.ts'
import type { ModelNode } from './model.ts'
import type { PathSegment } from './nodePath.ts'
import { sectionInfo } from './requestGraph.ts'
import { joinKinds, type CohortOption } from './joins.ts'

export type FieldType =
  | 'number' // float
  | 'int'
  | 'string'
  | 'field' // a cohort field name
  | 'bool'
  | 'enum'
  | 'json' // list / any / object: JSON text
  | 'strings' // string array, one value per line
  | 'enumItem' // one-element string array chosen from options
  | 'expression' // multi-line string
  | 'ranges' // [{label,start,end}] date ranges
  | 'keys' // string array of group key columns (post-test partition_by)
  | 'cohortFile' // a cohort file path (a join's right side)
  | 'pairs' // [{left_field, right_field}] join keys

export type FormField = {
  key: string
  // Path of the value relative to the node's value.
  rel: PathSegment[]
  type: FieldType
  required?: boolean
  default?: unknown
  options?: string[]
  // exactly_one_of group name.
  oneOf?: string
  // strings: exact item count.
  count?: number
  hint?: string
  // Choosing the default on an entry that does not have the key leaves
  // it out (the engine default applies); an entry that already has the
  // key keeps it. Clearing the field removes it either way.
  omitDefault?: true
}

export type FormSection = { title: string; fields: FormField[] }

export type FormMode =
  | 'generated' // manifest params
  | 'handwritten' // free-form operator with a hand-written form
  | 'none' // operator without params, or a section edited as JSON
  | 'raw' // raw / prop node: JSON text only

export type NodeForm = {
  mode: FormMode
  op?: string
  // false when the manifest is loaded and does not list the operator.
  opKnown?: boolean
  sections: FormSection[]
  note?: string
}

export type Catalog = { manifest?: Manifest; schema?: unknown }

// FormContext is what a form needs from the rest of the request: the
// group key columns of the node's request frame (in groups order), the
// options of a post-test's partition_by.
export type FormContext = {
  groupKeys?: readonly string[]
  // The workspace's cohort files, as a join's right side would name them
  // from this request (joins.cohortOptions).
  cohortOptions?: readonly CohortOption[]
}

// buildForm returns the inspector form for a node.
export function buildForm(node: ModelNode, catalog: Catalog = {}, ctx: FormContext = {}): NodeForm {
  if (node.kind === 'cohort') {
    return {
      mode: 'handwritten',
      sections: [
        {
          title: 'Cohort',
          fields: [
            { key: 'filename', rel: ['filename'], type: 'string', required: true },
            { key: 'data_dir', rel: ['data_dir'], type: 'string' },
          ],
        },
      ],
    }
  }
  if (node.kind !== 'entry' || node.value.type !== 'object') {
    const note = node.reason === 'templated' ? 'Templated entry: edit as JSON.' : undefined
    return { mode: 'raw', sections: [], ...(note && { note }) }
  }
  const info = sectionInfo(node.section)
  const value = node.value
  const op = info?.opKey ? stringValue(getIn(value, [info.opKey])) : undefined
  const slot: FormField[] = []
  if (info?.nameKey) slot.push({ key: info.nameKey, rel: [info.nameKey], type: 'string' })
  const top = topLevelKeys(catalog.schema, node.section)
  const ops = op && info?.catalog && catalog.manifest ? matchOps(info.catalog(catalog.manifest), op) : undefined
  const opKnown = ops === undefined ? undefined : ops.length > 0
  const declared = ops ? mergeParams(ops) : undefined
  const declares = (k: string) => !!declared?.some((p) => p.name === k)
  if ((top ? top.has('field') : getIn(value, ['field']) !== undefined) && !declares('field')) {
    slot.push({ key: 'field', rel: ['field'], type: 'field' })
  }
  if (node.section === 'windows') {
    slot.push(
      { key: 'frame.mode', rel: ['frame', 'mode'], type: 'enum', options: ['rows', 'range'] },
      { key: 'frame.preceding', rel: ['frame', 'preceding'], type: 'int' },
      { key: 'frame.following', rel: ['frame', 'following'], type: 'int' },
      { key: 'partition_by', rel: ['partition_by'], type: 'strings' },
      { key: 'order_by', rel: ['order_by'], type: 'json', required: true },
    )
  }
  const sections: FormSection[] = [{ title: 'Slot', fields: slot }]
  const base = { op, ...(opKnown !== undefined && { opKnown }) }

  if (node.section === 'multiplicity') {
    // The block's keys are its own (no manifest operator): pulse
    // types.Multiplicity. Empty method/family inherit.
    sections.push({ title: 'Correction', fields: MULTIPLICITY_FIELDS })
    return { mode: 'handwritten', ...base, sections }
  }
  if (node.section === 'joins') {
    // A join has no manifest operator: pulse types.JoinSpec, kinds from
    // the manifest's join envelope.
    sections.push({ title: 'Join', fields: joinFields(catalog.manifest, ctx) })
    return { mode: 'handwritten', ...base, sections }
  }
  if (node.section === 'vectors') {
    // A vector has no manifest operator: pulse types.VectorSpec.
    sections.push({ title: 'Members', fields: VECTOR_MEMBER_FIELDS }, { title: 'Meaning', fields: VECTOR_MEANING_FIELDS })
    return { mode: 'handwritten', ...base, sections }
  }
  const hand = op ? HANDWRITTEN[op] ?? (node.section === 'overlays' ? overlayForm : undefined) : undefined
  if (hand) {
    const fields = hand(ops ?? [])
    sections.push({ title: 'Params', fields })
    addOtherParams(sections, value, fields)
    return { mode: 'handwritten', ...base, sections }
  }
  if (declared && declared.length > 0) {
    const fields = declared.map((p) => refineParam(node.section, op, paramField(p, value, top), ctx))
    sections.push({ title: 'Params', fields })
    addOtherParams(sections, value, fields)
    return { mode: 'generated', ...base, sections }
  }
  addOtherParams(sections, value, [])
  const note = !op
    ? 'No operator form for this section: edit as JSON.'
    : opKnown === false
      ? `${op} is not in the engine manifest: edit as JSON.`
      : ops
        ? `${op} takes no operator params.`
        : 'Engine catalog not loaded: edit params as JSON.'
  return { mode: 'none', ...base, sections, note }
}

// matchOps finds the manifest entries for an operator. Tier-2 post_tests
// list one entry per variant (`TEST_X/variant`, family TEST_X).
function matchOps(list: ManifestOperator[] | undefined, op: string): ManifestOperator[] {
  return (list ?? []).filter((o) => (o.name ?? o.kind) === op || o.family === op)
}

function mergeParams(ops: ManifestOperator[]): ManifestParam[] {
  const out: ManifestParam[] = []
  for (const o of ops) for (const p of o.params ?? []) if (!out.some((q) => q.name === p.name)) out.push(p)
  return out
}

// paramField maps one manifest param to a form field.
export function paramField(p: ManifestParam, value: JsonNode, top: Set<string> | undefined): FormField {
  const rel = paramPath(p.name, value, top)
  const f: FormField = { key: p.name, rel, type: fieldType(p) }
  if (p.required) f.required = true
  if (p.default !== undefined) f.default = p.default
  if (p.enum_values) f.options = p.enum_values
  if (p.exactly_one_of) f.oneOf = p.exactly_one_of
  return f
}

// refineParam gives manifest params that need more than their declared
// type a first-class field: a grouper's `fit` (GROUP_KMEANS,
// GROUP_QUANTILE) explains global vs within and never writes its
// default unasked; a post-test's `partition_by` is a list of group key
// columns.
function refineParam(section: string, op: string | undefined, f: FormField, ctx: FormContext): FormField {
  if (section === 'groups' && f.key === 'fit' && f.type === 'enum') {
    const what = op === 'GROUP_KMEANS' ? 'centroids' : op === 'GROUP_QUANTILE' ? 'cut points' : 'the grouper'
    return {
      ...f,
      omitDefault: true,
      hint: `global: fit ${what} once over the filtered set. within: refit per bucket of the groupers before this one (a no-op on the first grouper).`,
    }
  }
  if (section === 'post_tests' && f.key === 'partition_by') {
    const keys = ctx.groupKeys ?? []
    const implicit = keys.length > 1 ? keys.slice(0, -1).join(', ') : ''
    return {
      ...f,
      type: 'keys',
      options: [...keys],
      hint:
        keys.length === 0
          ? 'Group key columns to run the test per partition of; the request has no groups.'
          : `Leading group keys to run the test per partition of. Unset: ${implicit ? `every key but the last (${implicit})` : 'one run (a single grouper)'}; [] = no partition. Same on every post-test.`,
    }
  }
  return f
}

function fieldType(p: ManifestParam): FieldType {
  switch (p.type) {
    case 'float':
      return 'number'
    case 'int':
      return 'int'
    case 'string':
      return 'string'
    case 'field':
      return 'field'
    case 'bool':
      return 'bool'
    case 'enum':
      return p.enum_values ? 'enum' : 'string'
    case 'array':
      return p.name === 'ranges' ? 'ranges' : 'json'
    default:
      return 'json'
  }
}

// paramPath places a param: where the entry already has it, else top
// level when the schema gives the entry that property, else `params`.
function paramPath(name: string, value: JsonNode, top: Set<string> | undefined): PathSegment[] {
  if (getIn(value, ['params', name]) !== undefined) return ['params', name]
  if (getIn(value, [name]) !== undefined) return [name]
  return top?.has(name) && name !== 'params' ? [name] : ['params', name]
}

// topLevelKeys returns the property names the request schema allows on
// an entry of section, or undefined without a schema.
export function topLevelKeys(schema: unknown, section: string): Set<string> | undefined {
  const defs = (schema as { $defs?: Record<string, { properties?: Record<string, unknown> }> } | undefined)?.$defs
  const prop = defs?.Request?.properties?.[section] as { $ref?: string; items?: { $ref?: string } } | undefined
  const ref = prop?.items?.$ref ?? prop?.$ref
  const def = ref ? defs?.[ref.replace('#/$defs/', '')] : undefined
  return def?.properties ? new Set(Object.keys(def.properties)) : undefined
}

// addOtherParams lists `params` members no field covers, so nothing in
// the entry's params is hidden from the form.
function addOtherParams(sections: FormSection[], value: JsonNode, covered: FormField[]): void {
  const params = getIn(value, ['params'])
  if (params?.type !== 'object') return
  const extra = params.members
    .filter((m) => !covered.some((f) => f.rel.length === 2 && f.rel[0] === 'params' && f.rel[1] === m.key))
    .map((m): FormField => ({ key: m.key, rel: ['params', m.key], type: 'json', hint: 'not declared by the manifest' }))
  if (extra.length > 0) sections.push({ title: 'Other params', fields: extra })
}

// MULTIPLICITY_FIELDS edit a multiplicity block (pulse
// types.MultiplicityMethod / MultiplicityFamily values).
const MULTIPLICITY_FIELDS: FormField[] = [
  { key: 'method', rel: ['method'], type: 'enum', options: ['holm', 'bonferroni', 'bh', 'by', 'none'], hint: 'empty inherits' },
  { key: 'family', rel: ['family'], type: 'enum', options: ['request', 'compose', 'layer', 'row', 'column'], hint: 'which p-values are corrected together' },
  { key: 'alpha', rel: ['alpha'], type: 'number', hint: 'overlay significance level, in (0, 1)' },
]

// VECTOR_COERCES and VECTOR_KINDS are pulse's closed VectorCoerce and
// VectorKind enums (types/vector.go, payload-schema "Vector slot").
export const VECTOR_COERCES = ['binary'] as const
export const VECTOR_KINDS = ['measure', 'scale', 'composition', 'binary'] as const

// VECTOR_MEMBER_FIELDS edit which columns a vector holds: exactly one of
// fields (names and globs) and pattern (a Go regular expression).
const VECTOR_MEMBER_FIELDS: FormField[] = [
  {
    key: 'fields',
    rel: ['fields'],
    type: 'strings',
    oneOf: 'members',
    hint: 'integer or float columns, one per line (or wire fields into the node); globs like q_* expand in schema order',
  },
  { key: 'pattern', rel: ['pattern'], type: 'string', oneOf: 'members', hint: 'Go regular expression over column names, schema order' },
  { key: 'coerce', rel: ['coerce'], type: 'enum', options: [...VECTOR_COERCES], hint: 'binary admits packed_bool members, read as 0 / 1' },
  { key: 'labels', rel: ['labels'], type: 'strings', hint: 'one display label per member, in member order' },
]

// VECTOR_MEANING_FIELDS say what the members' values mean (the default
// metric of distance and similarity operators) and a scale's range.
const VECTOR_MEANING_FIELDS: FormField[] = [
  { key: 'kind', rel: ['kind'], type: 'enum', options: [...VECTOR_KINDS], hint: 'what the values mean; fills a metric operator\'s default metric' },
  { key: 'scale_min', rel: ['scale_min'], type: 'number', hint: 'kind scale only; both or neither, min below max' },
  { key: 'scale_max', rel: ['scale_max'], type: 'number', hint: 'kind scale only; both or neither, min below max' },
]

// joinFields edit a JoinSpec: the right cohort (picked from the
// workspace's cohort files), the kind, the `as` prefix and the key pairs.
function joinFields(manifest: Manifest | undefined, ctx: FormContext): FormField[] {
  const kinds = joinKinds(manifest)
  return [
    {
      key: 'right',
      rel: ['right'],
      type: 'cohortFile',
      required: true,
      options: (ctx.cohortOptions ?? []).map((o) => o.value),
      hint: 'cohort joined in, held in memory: put the smaller cohort on the right',
    },
    {
      key: 'kind',
      rel: ['kind'],
      type: 'enum',
      options: kinds,
      hint: `the engine runs ${kinds.join(', ')}; an inner join drops unmatched left rows`,
    },
    { key: 'as', rel: ['as'], type: 'string', hint: 'prefix on every right field name: as r_ turns bonus into r_bonus' },
    { key: 'on', rel: ['on'], type: 'pairs', required: true, hint: 'equi-join keys, AND-ed; wire left keys from the cohort' },
  ]
}

type Handwritten = (ops: ManifestOperator[]) => FormField[]

const valuesList: Handwritten = () => [{ key: 'values', rel: ['values'], type: 'strings', required: true }]
const expression: Handwritten = () => [{ key: 'expression', rel: ['expression'], type: 'expression', required: true }]

// overlayForm edits scope and ref. `ref` is required only when the
// kind's manifest entry lists ref_kinds (the OverlayRef families the
// engine insists on, e.g. Margin); kinds with none — the pairwise
// row/column family, χ², formula, ... — legitimately omit it.
function overlayForm(ops: ManifestOperator[]): FormField[] {
  const scopes = ops.flatMap((o) => o.scopes ?? [])
  const refKinds = [...new Set(ops.flatMap((o) => o.ref_kinds ?? []))]
  const ref: FormField =
    refKinds.length > 0
      ? { key: 'ref', rel: ['ref'], type: 'json', required: true, hint: `ref family: ${refKinds.join(' | ')}` }
      : { key: 'ref', rel: ['ref'], type: 'json' }
  return [
    scopes.length > 0
      ? { key: 'scope', rel: ['scope'], type: 'enum', options: [...new Set(scopes)], required: true }
      : { key: 'scope', rel: ['scope'], type: 'string', required: true },
    ref,
  ]
}

// HANDWRITTEN covers operators whose manifest params are null but which
// take configuration (see the op-* skills).
export const HANDWRITTEN: Readonly<Record<string, Handwritten>> = {
  FILTER_DATE_RANGES: () => [
    { key: 'ranges', rel: ['params', 'ranges'], type: 'ranges', oneOf: 'source', hint: 'ISO dates; empty bound = open; inclusive' },
    { key: 'table', rel: ['params', 'table'], type: 'string', oneOf: 'source', hint: 'registered range table' },
    { key: 'tz', rel: ['tz'], type: 'string', hint: 'IANA zone; overrides time_zone' },
  ],
  FILTER_INCLUDE: valuesList,
  FILTER_EXCLUDE: valuesList,
  FILTER_SET_CONTAINS_ALL: valuesList,
  FILTER_SET_CONTAINS_ANY: valuesList,
  FILTER_SET_CONTAINS_NONE: valuesList,
  FILTER_SET_EQUALS: valuesList,
  FILTER_RANGE: () => [{ key: 'values', rel: ['values'], type: 'strings', required: true, count: 2, hint: 'low, high' }],
  FILTER_NULL: () => [
    { key: 'values', rel: ['values'], type: 'enumItem', required: true, options: ['is_null', 'is_not_null'] },
  ],
  FILTER_EXPRESSION: expression,
  ATTR_FORMULA: expression,
}

// ---- Values: form input <-> jsonTree ----

// fieldText renders a node's current value at f as input text.
export function fieldText(f: FormField, value: JsonNode): string {
  const v = getIn(value, f.rel)
  if (v === undefined) return ''
  switch (f.type) {
    case 'number':
    case 'int':
    case 'bool':
      return v.type === 'object' || v.type === 'array' ? prettyJson(v) : v.raw
    case 'string':
    case 'field':
    case 'enum':
    case 'expression':
    case 'cohortFile':
      return v.type === 'string' ? (stringValue(v) as string) : prettyJson(v)
    case 'enumItem':
      return v.type === 'array' && v.items.length === 1 && v.items[0].type === 'string'
        ? (stringValue(v.items[0]) as string)
        : prettyJson(v)
    case 'strings':
    case 'keys':
      return v.type === 'array' && v.items.every((x) => x.type === 'string')
        ? v.items.map((x) => stringValue(x) as string).join('\n')
        : prettyJson(v)
    case 'json':
    case 'ranges':
    case 'pairs':
      return prettyJson(v)
  }
}

const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/
const INT = /^-?(?:0|[1-9][0-9]*)$/

export type Encoded = { value: JsonNode | undefined } | { error: string }

// encodeField turns input text into the value to store at f; undefined
// means remove. A value equal to the current one returns the current
// node, so an unchanged field never changes spelling.
export function encodeField(f: FormField, text: string, current: JsonNode | undefined): Encoded {
  const enc = encodeRaw(f, text, current)
  if ('error' in enc || enc.value === undefined || current === undefined) return enc
  return sameValue(enc.value, current) ? { value: current } : enc
}

function encodeRaw(f: FormField, text: string, current: JsonNode | undefined): Encoded {
  const t = f.type === 'expression' || f.type === 'string' || f.type === 'field' || f.type === 'cohortFile' ? text : text.trim()
  if (t === '') return { value: undefined }
  switch (f.type) {
    case 'number':
      return NUMBER.test(t) ? { value: { type: 'number', raw: t } } : { error: 'not a number' }
    case 'int':
      return INT.test(t) ? { value: { type: 'number', raw: t } } : { error: 'not an integer' }
    case 'bool':
      return t === 'true' || t === 'false' ? { value: { type: 'boolean', raw: t } } : { error: 'true or false' }
    case 'string':
    case 'field':
    case 'enum':
    case 'expression':
    case 'cohortFile':
      return { value: { type: 'string', raw: JSON.stringify(t) } }
    case 'enumItem':
      return { value: stringItems(current, [t]) }
    case 'keys':
      if (t === '[]') return { value: { type: 'array', items: [] } }
      return { value: stringItems(current, t.split('\n').map((s) => s.trim()).filter((s) => s !== '')) }
    case 'strings': {
      const items = t.split('\n').map((s) => s.trim()).filter((s) => s !== '')
      if (f.count !== undefined && items.length !== f.count) return { error: `needs exactly ${f.count} values` }
      return { value: stringItems(current, items) }
    }
    case 'json':
    case 'ranges':
    case 'pairs': {
      const r = parseEdit(t)
      return 'error' in r ? r : { value: r.value }
    }
  }
}

// sameValue compares decoded scalars (so `"é"` equals `"é"` and
// `1.0` equals `1.0`) and containers structurally.
function sameValue(a: JsonNode, b: JsonNode): boolean {
  if (a.type === 'string' && b.type === 'string') return stringValue(a) === stringValue(b)
  return sameJson(a, b)
}

// applyField sets f on value from input text. It returns the new value,
// or an error and the value unchanged.
export function applyField(f: FormField, value: JsonNode, text: string): { value: JsonNode; error?: string } {
  const current = getIn(value, f.rel)
  const enc = encodeField(f, text, current)
  if ('error' in enc) return { value, error: enc.error }
  if (enc.value === current) return { value }
  if (f.omitDefault && current === undefined && enc.value !== undefined && f.default !== undefined && sameValue(enc.value, fromPlain(f.default))) {
    return { value }
  }
  return { value: setIn(value, f.rel, enc.value) }
}

// formProblems lists validation problems a form can see: missing
// required fields and exactly_one_of groups not set exactly once.
export function formProblems(form: NodeForm, value: JsonNode): string[] {
  const out: string[] = []
  const groups = new Map<string, FormField[]>()
  for (const s of form.sections) {
    for (const f of s.fields) {
      if (f.oneOf) groups.set(f.oneOf, [...(groups.get(f.oneOf) ?? []), f])
      else if (f.required && getIn(value, f.rel) === undefined) out.push(`${f.key} is required`)
    }
  }
  for (const [, fs] of groups) {
    const set = fs.filter((f) => getIn(value, f.rel) !== undefined).length
    if (set !== 1) out.push(`exactly one of ${fs.map((f) => f.key).join(', ')}`)
  }
  return out
}
