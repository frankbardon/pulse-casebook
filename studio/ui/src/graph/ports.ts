// ports describes the field inputs of a section entry and which cohort
// field types each one takes. It is the type side of wiring (wiring.ts
// adds graph visibility and the model edits) and of the type-aware
// palette: pure, manifest-driven, no React.
//
// Rules, in order of authority:
//   - Component sections (features, filterers, attributes, groups,
//     aggregations, windows): the operator's `accepts_types`, else the
//     inverse of `cohort_types[].compatible_<section>`.
//   - Regressions: `target` and `predictors` take the operator's
//     `accepts_types`.
//   - Matrices: `fields` take the operator's `accepts_types`.
//   - Vectors (`vectors[i].fields`, no manifest operator): integer and
//     float columns (pulse payload-schema "Vector slot"); packed_bool
//     only beside `coerce: "binary"` (vectorMemberRefusal).
//   - Tests and post-tests declare no accepts_types; their inputs come
//     from `requires` and follow the engine's predict rules
//     (pulse internal/guide testSlot): `field`/`field2` numeric
//     (TEST_PROP_Z's `field` categorical), split_by/rows/cols/
//     subject_field a grouping field (categorical; integer and bool
//     codes are let through, floats, dates and sets are refused).
//   - Post-tests that declare a `partition_by` param (pulse alpha.10)
//     take a list of GROUP KEY COLUMNS under `params.partition_by`: a
//     leading prefix of the request's grouper key columns (pulse
//     groupedtests.PostTestDepth / seriespartition.PrefixDepth). Any
//     field type can be a group key (a quantile or k-means grouper keys
//     on a numeric field, GROUP_DATE on a date), so the slot has no type
//     rule; membership and prefix order are checked by partition.ts.
//
// A field whose type is not known (no inspect, a label whose operator
// declares no emits_type) is never refused: the engine's own validation
// is the backstop.

import type { CohortType, Manifest, ManifestOperator } from '../api.ts'

export type FieldKind = 'numeric' | 'categorical' | 'date' | 'bool' | 'set'

// fieldKind maps a cohort field type to its coarse kind (mirrors pulse
// descriptor.FieldKindOf). Unknown types yield undefined.
export function fieldKind(type: string | undefined): FieldKind | undefined {
  if (!type) return undefined
  if (/^(u4|u8|u16|u32|u64|f32|f64|decimal128)$/.test(type)) return 'numeric'
  if (type.startsWith('categorical_')) return 'categorical'
  if (type === 'date' || type === 'datetime') return 'date'
  if (type === 'packed_bool') return 'bool'
  if (type.startsWith('set_')) return 'set'
  return undefined
}

const INTEGER = /^u(4|8|16|32|64)$/

// Accept is what an input takes. types, when set, lists the exact field
// types; kinds the coarse kinds (both must hold when both are set);
// integers additionally lets unsigned-integer types through a kinds
// check. what names the rule for refusal messages.
export type Accept = { types?: readonly string[]; kinds?: readonly FieldKind[]; integers?: boolean; what: string }

// Slot is one field input of an operator. key is the entry key the
// field name is written to (a dotted path for inputs under `params`,
// e.g. `params.partition_by`); list slots hold an array of names.
// groupKey marks an input that names group key columns (post-test
// partition_by): it is wired from the field a grouper keys on, never
// offered by the type-aware palette.
export type Slot = { key: string; list: boolean; required: boolean; accept: Accept; groupKey?: true }

// PARTITION_KEY is the post-test input naming its partition keys.
export const PARTITION_KEY = 'params.partition_by'

const GROUP_KEY: Accept = { what: 'a group key column (a grouper\'s field, leading prefix)' }

const ANY: Accept = { what: 'any field' }
const NUMERIC: Accept = { kinds: ['numeric'], what: 'a numeric field' }
const GROUPING: Accept = { kinds: ['categorical', 'bool'], integers: true, what: 'a categorical (grouping) field' }
const CATEGORICAL: Accept = { kinds: ['categorical', 'bool'], what: 'a categorical field' }

// VECTOR_MEMBER is what a vector's `fields` take: integer or float
// columns, plus packed_bool, which the vector admits only with
// `coerce: "binary"` (vectorMemberRefusal adds that rule).
export const VECTOR_MEMBER: Accept = {
  types: ['u4', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'packed_bool'],
  what: 'an integer or float field (packed_bool with coerce binary)',
}

// vectorMemberRefusal checks a vector member's type against the vector's
// coerce: VECTOR_MEMBER, and packed_bool only when coerce is binary.
export function vectorMemberRefusal(type: string | undefined, coerce: string | undefined): string | null {
  const why = refusal(VECTOR_MEMBER, type)
  if (why) return why
  if (type === 'packed_bool' && coerce !== 'binary') return 'takes packed_bool only with coerce: "binary"'
  return null
}

// isGlob says whether a vector member entry is a glob (`q_*`), which
// expands over the cohort's columns rather than naming one.
export function isGlob(name: string): boolean {
  return /[*?[]/.test(name)
}

// Go field names of test `requires` -> entry key and accept rule.
const REQUIRES: Record<string, { key: string; accept: Accept }> = {
  Field: { key: 'field', accept: NUMERIC },
  Field2: { key: 'field2', accept: NUMERIC },
  SplitBy: { key: 'split_by', accept: GROUPING },
  Rows: { key: 'rows', accept: GROUPING },
  Cols: { key: 'cols', accept: GROUPING },
  SubjectField: { key: 'subject_field', accept: GROUPING },
}

// Component sections and the manifest list / cohort_types key of each.
const COMPONENTS: Record<string, { list: string; compat: keyof CohortType }> = {
  features: { list: 'features', compat: 'compatible_features' },
  filterers: { list: 'filterers', compat: 'compatible_filterers' },
  attributes: { list: 'attributes', compat: 'compatible_attributes' },
  groups: { list: 'groupers', compat: 'compatible_groupers' },
  aggregations: { list: 'aggregators', compat: 'compatible_aggregators' },
  windows: { list: 'windows', compat: 'compatible_windows' },
}

function componentOf(section: string): { list: string; compat: keyof CohortType } | undefined {
  return Object.hasOwn(COMPONENTS, section) ? COMPONENTS[section] : undefined
}

// operatorsOf returns the manifest list for a section.
export function operatorsOf(manifest: Manifest | undefined, section: string): ManifestOperator[] | undefined {
  if (!manifest) return undefined
  const comp = componentOf(section)
  if (comp) return manifest.components?.[comp.list as keyof NonNullable<Manifest['components']>]
  switch (section) {
    case 'tests':
    case 'post_tests':
    case 'regressions':
    case 'matrices':
    case 'overlays':
      return manifest[section]
  }
  return undefined
}

// findOperator looks an operator up by name (or overlay kind). A tier-2
// post-test written as its family (`TEST_ANOVA_F`, variant in
// params.variant) matches the family's first variant entry.
export function findOperator(manifest: Manifest | undefined, section: string, op: string): ManifestOperator | undefined {
  const list = operatorsOf(manifest, section)
  return list?.find((o) => (o.name ?? o.kind) === op) ?? (section === 'post_tests' ? list?.find((o) => o.family === op) : undefined)
}

// declaresParam says whether an operator's manifest entry (any variant
// of a post-test family) declares a param.
export function declaresParam(manifest: Manifest | undefined, section: string, op: string, param: string): boolean {
  const list = operatorsOf(manifest, section) ?? []
  return list.some((o) => ((o.name ?? o.kind) === op || (section === 'post_tests' && o.family === op)) && !!o.params?.some((p) => p.name === param))
}

// acceptedTypes lists the cohort field types a component operator takes:
// accepts_types, else the cohort_types entries that list it.
export function acceptedTypes(manifest: Manifest | undefined, section: string, op: string): string[] | undefined {
  const o = findOperator(manifest, section, op)
  if (o?.accepts_types && o.accepts_types.length > 0) return o.accepts_types
  const comp = componentOf(section)
  if (!comp || !manifest?.cohort_types) return undefined
  const types = manifest.cohort_types
    .filter((t) => (t[comp.compat] as string[] | undefined)?.includes(op))
    .map((t) => t.name)
  return types.length > 0 ? types : undefined
}

// slotsFor lists the field inputs of an operator. Without a manifest
// entry it knows only the generic `field` input of component sections.
export function slotsFor(manifest: Manifest | undefined, section: string, op: string): Slot[] {
  const o = findOperator(manifest, section, op)
  const typed = (what: string): Accept => {
    const types = acceptedTypes(manifest, section, op)
    return types ? { types, what } : ANY
  }
  switch (section) {
    case 'tests':
    case 'post_tests': {
      const slots: Slot[] = (o?.requires ?? [])
        .filter((r) => Object.hasOwn(REQUIRES, r))
        .map((r) => {
          const s = REQUIRES[r]
          const accept = s.key === 'field' && (o?.family ?? o?.name) === 'TEST_PROP_Z' ? CATEGORICAL : s.accept
          return { key: s.key, list: false, required: true, accept }
        })
      if (section === 'post_tests' && declaresParam(manifest, section, op, 'partition_by')) {
        slots.push({ key: PARTITION_KEY, list: true, required: false, accept: GROUP_KEY, groupKey: true })
      }
      return slots
    }
    case 'regressions':
      if (!o) return []
      return [
        { key: 'target', list: false, required: true, accept: typed(`a ${op} target type`) },
        { key: 'predictors', list: true, required: true, accept: typed(`a ${op} predictor type`) },
      ]
    case 'matrices':
      if (!o) return []
      return [{ key: 'fields', list: true, required: true, accept: typed(`a ${op} input type`) }]
    case 'vectors':
      return [{ key: 'fields', list: true, required: true, accept: VECTOR_MEMBER }]
  }
  if (componentOf(section)) return [{ key: 'field', list: false, required: false, accept: typed(`a ${op} input type`) }]
  return []
}

// slotFor finds the slot a row key (`field`, `predictors[1]`) belongs to.
// Keys that are no declared slot (crosstab `rows[0].field`, sort refs)
// get an any-field slot, so they stay wireable but unchecked.
export function slotFor(manifest: Manifest | undefined, section: string, op: string, rowKey: string): Slot {
  const bare = rowKey.replace(/(\[\d+\])+$/, '')
  if (bare.includes('.')) {
    const dotted = slotsFor(manifest, section, op).find((s) => s.key === bare)
    if (dotted) return dotted
  }
  const head = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rowKey)?.[0] ?? rowKey
  const nested = rowKey.length > head.length && !/^\[\d+\]$/.test(rowKey.slice(head.length))
  const slot = nested ? undefined : slotsFor(manifest, section, op).find((s) => s.key === head)
  return slot ?? { key: head, list: false, required: false, accept: ANY }
}

// refusal checks a field type against a rule and returns why it is
// refused, or null when it is taken (or the type is unknown).
export function refusal(accept: Accept, type: string | undefined): string | null {
  if (!type) return null
  if (accept.types && !accept.types.includes(type)) return `takes ${accept.what}, not ${type}`
  if (accept.kinds) {
    const kind = fieldKind(type)
    if (kind === undefined) return null
    if (!accept.kinds.includes(kind) && !(accept.integers && INTEGER.test(type))) {
      return `takes ${accept.what}, not ${type}`
    }
  }
  return null
}

// describeAccept is the tooltip text of an input handle.
export function describeAccept(slot: Slot): string {
  const a = slot.accept
  const types = a.types ? ` (${a.types.join(', ')})` : ''
  return `${slot.key}${slot.list ? '[]' : ''}: ${a.what}${types}`
}

// emitsType is the field type of the column a producer writes, when the
// manifest declares one.
export function emitsType(manifest: Manifest | undefined, section: string, op: string): string | undefined {
  return findOperator(manifest, section, op)?.emits_type
}

// compatibleOperators lists the operators of a section with a field
// input that takes a field of the given type. For the type-aware palette
// (E4-S2); an unknown type keeps every operator.
export function compatibleOperators(manifest: Manifest | undefined, section: string, type: string | undefined): ManifestOperator[] {
  const ops = operatorsOf(manifest, section) ?? []
  return ops.filter((o) => {
    const name = o.name ?? o.kind ?? ''
    const slots = slotsFor(manifest, section, name).filter((s) => !s.groupKey)
    if (slots.length === 0) return true
    return slots.some((s) => refusal(s.accept, type) === null)
  })
}
