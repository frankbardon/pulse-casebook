// Pure state of the import wizard's schema editor (ImportWizard.tsx):
// one EditColumn per source column, built from POST /api/import/predict
// and edited in place, then lowered to the request bodies.
//
// How the edits reach Pulse:
//   - type changes are sent to predict as `overrides` (column → type);
//     Pulse checks the sampled values against the forced type, so a bad
//     choice comes back as a refusal on that column. (Predict with an
//     explicit schema does not check values.)
//   - the saved schema and the import use the explicit schema document of
//     the included columns. Pulse has no per-column drop: a column is
//     excluded by leaving it out of the schema and setting
//     options.ignore_extra, which drops source columns the schema does
//     not name.
import type {
  ColumnStats,
  GroupCandidate,
  GroupDecl,
  ImportOptions,
  ImportPredict,
  PredictColumn,
  SchemaField,
} from '../api.ts'
import { fieldName, fieldNamer, renameOf, sourceNamer } from './rename.ts'

export type EditColumn = {
  // The SOURCE column name: the editor's key for a column.
  name: string
  // The field name Pulse gets, when renamed (fieldName in rename.ts).
  // PULSE-GAP(column-rename)
  rename?: string
  // Source column index; -1 for a field Pulse generates (SPSS
  // `_missing` siblings), which has no source column to exclude.
  index: number
  type: string
  nullable: boolean
  description: string
  precision?: number
  scale?: number
  include: boolean
  // Pulse's own inference for this column (no overrides): a type that
  // differs from it is sent as an override.
  inferred: string
  stats?: ColumnStats
  samples: (string | null)[]
  warnings: string[]
  // Set by applying a saved schema (match.ts): the column took the
  // saved type (matched) or is not in the saved schema (new).
  fromMatch?: 'matched' | 'new'
}

// Settings are the options the wizard edits above the table.
export type Settings = {
  sheet?: string
  floatWidth: 'f64' | 'f32'
  sourceTz: string
  // One delimiter for every included set_* column ("" = Pulse default).
  setDelimiter: string
  groups: GroupDecl[]
}

export const DEFAULT_SETTINGS: Settings = { floatWidth: 'f64', sourceTz: '', setDelimiter: '', groups: [] }

// Predict reports columns under the names Pulse saw (renamed, when
// options.rename was sent); src maps them back to source columns.
// PULSE-GAP(column-rename)
function fromPredictColumn(c: PredictColumn, src: (n: string) => string = (n) => n): EditColumn {
  return {
    name: src(c.name),
    ...(src(c.name) !== c.name && { rename: c.name }),
    index: c.index,
    type: c.type ?? '',
    nullable: c.nullable ?? false,
    description: c.description ?? '',
    ...(c.precision !== undefined && { precision: c.precision }),
    ...(c.scale !== undefined && { scale: c.scale }),
    // Every source column starts included; a column Pulse left out of
    // its predicted schema (a refusal) is still meant to be imported.
    include: true,
    inferred: c.type ?? '',
    stats: c.stats,
    samples: c.samples,
    warnings: c.warnings,
  }
}

// columnsFromPredict is the editor's first state for a source: every
// column included, typed as Pulse inferred it.
export function columnsFromPredict(p: ImportPredict): EditColumn[] {
  const src = sourceNamer(p.options?.rename)
  return p.columns.map((c) => fromPredictColumn(c, src))
}

// mergeRerun folds a re-run predict (sent with overrides) into the
// editor: include flags, descriptions and match flags stay; types come
// from the response (an override comes back as the type), except on a
// refusal, where Pulse returns no types and the user's choice is kept.
// A column turns nullable when the data says so; nullability the user
// set is not cleared. Stats, samples and warnings are the response's.
export function mergeRerun(prev: EditColumn[], p: ImportPredict): EditColumn[] {
  const byName = new Map(prev.map((c) => [c.name, c]))
  const src = sourceNamer(p.options?.rename)
  return p.columns.map((rc) => {
    const old = byName.get(src(rc.name))
    if (!old) return fromPredictColumn(rc, src)
    const typed = p.valid && rc.type !== undefined && rc.type !== ''
    return {
      ...old,
      type: typed ? rc.type! : old.type,
      nullable: old.nullable || (typed && (rc.nullable ?? false)),
      ...(typed && rc.type === 'decimal128' && old.type !== 'decimal128' && { precision: rc.precision, scale: rc.scale }),
      stats: rc.stats,
      samples: rc.samples,
      warnings: rc.warnings,
    }
  })
}

// --- edits (each returns a new array) ----------------------------------

export function setType(cols: EditColumn[], name: string, type: string): EditColumn[] {
  return cols.map((c) => {
    if (c.name !== name) return c
    const next: EditColumn = { ...c, type }
    if (type === 'decimal128') {
      next.precision = c.precision ?? 18
      next.scale = c.scale ?? 2
    } else {
      delete next.precision
      delete next.scale
    }
    return next
  })
}

export function setInclude(cols: EditColumn[], name: string, include: boolean): EditColumn[] {
  return cols.map((c) => (c.name === name && c.index >= 0 ? { ...c, include } : c))
}

// setAllIncluded includes or excludes every column the filter shows.
export function setAllIncluded(cols: EditColumn[], include: boolean, only?: Set<string>): EditColumn[] {
  return cols.map((c) => (c.index >= 0 && (!only || only.has(c.name)) ? { ...c, include } : c))
}

export function setNullable(cols: EditColumn[], name: string, nullable: boolean): EditColumn[] {
  return cols.map((c) => (c.name === name ? { ...c, nullable } : c))
}

export function setDecimal(cols: EditColumn[], name: string, precision: number, scale: number): EditColumn[] {
  return cols.map((c) => (c.name === name ? { ...c, precision, scale } : c))
}

// --- lowering ------------------------------------------------------------

// overridesOf is the predict `overrides` map: included source columns
// whose type differs from Pulse's inference.
export function overridesOf(cols: EditColumn[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of cols) {
    if (c.include && c.index >= 0 && c.type !== '' && c.type !== c.inferred) out[fieldName(c)] = c.type
  }
  return out
}

// schemaOf is the schema document of the included columns, in source
// order (the `pulse import schema-template` shape).
export function schemaOf(cols: EditColumn[]): SchemaField[] {
  return cols
    .filter((c) => c.include)
    .map((c) => {
      const f: SchemaField = { name: fieldName(c), type: c.type, description: c.description, nullable: c.nullable }
      if (c.type === 'decimal128') {
        f.precision = c.precision ?? 18
        f.scale = c.scale ?? 0
      }
      return f
    })
}

// excludedCount counts source columns left out of the schema.
export function excludedCount(cols: EditColumn[]): number {
  return cols.filter((c) => c.index >= 0 && !c.include).length
}

export function isSetType(t: string): boolean {
  return t.startsWith('set_')
}

// optionsOf lowers the settings to the options object. For an import
// (and the spec it writes), excluded columns set ignore_extra; predict
// asks Pulse for group suggestions instead. Per-column settings name
// fields by the name Pulse sees (settings.groups hold source names).
export function optionsOf(s: Settings, cols: EditColumn[], mode: 'predict' | 'import'): ImportOptions {
  const o: ImportOptions = {}
  const field = fieldNamer(cols)
  if (s.sheet) o.sheet = s.sheet
  if (s.floatWidth === 'f32') o.float_width = 'f32'
  if (s.sourceTz.trim() !== '') o.source_tz = s.sourceTz.trim()
  if (s.setDelimiter !== '') {
    const delims: Record<string, string> = {}
    for (const c of cols) if (c.include && isSetType(c.type)) delims[fieldName(c)] = s.setDelimiter
    if (Object.keys(delims).length > 0) o.set_delimiters = delims
  }
  if (s.groups.length > 0) o.groups = s.groups.map((g) => ({ ...(g.key && { key: g.key.map(field) }), members: g.members.map(field) }))
  const rename = renameOf(cols) // PULSE-GAP(column-rename)
  if (rename) o.rename = rename
  if (mode === 'predict') o.suggest_groups = true
  if (mode === 'import' && excludedCount(cols) > 0) o.ignore_extra = true
  return o
}

// --- schema diff (save over an existing schema) ------------------------------

export type FieldChange = { name: string; from: string; to: string }
// renamed: source columns whose saved field name changes (rename.ts,
// PULSE-GAP(column-rename)).
export type SchemaDiff = { added: string[]; removed: string[]; changed: FieldChange[]; renamed?: FieldChange[] }

function describe(f: SchemaField): string {
  let s = f.type
  if (f.type === 'decimal128') s += `(${f.precision ?? 0},${f.scale ?? 0})`
  if (f.nullable) s += ', nullable'
  if (f.description) s += ` "${f.description}"`
  return s
}

// schemaDiff compares a saved schema with the one about to replace it,
// field by field (by name; order is not a change).
export function schemaDiff(saved: SchemaField[], next: SchemaField[]): SchemaDiff {
  const old = new Map(saved.map((f) => [f.name, f]))
  const now = new Map(next.map((f) => [f.name, f]))
  const d: SchemaDiff = { added: [], removed: [], changed: [] }
  for (const f of next) {
    const o = old.get(f.name)
    if (!o) d.added.push(f.name)
    else if (describe(o) !== describe(f)) d.changed.push({ name: f.name, from: describe(o), to: describe(f) })
  }
  for (const f of saved) if (!now.has(f.name)) d.removed.push(f.name)
  return d
}

export function isEmptyDiff(d: SchemaDiff): boolean {
  return d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0 && (d.renamed?.length ?? 0) === 0
}

// --- groups ------------------------------------------------------------------

function groupKey(g: GroupDecl): string {
  return JSON.stringify([[...(g.key ?? [])].sort(), [...g.members].sort()])
}

// groupChips are Pulse's suggested groups not declared yet, under
// source column names (src maps the names Pulse reported back).
export function groupChips(candidates: GroupCandidate[] | undefined, declared: GroupDecl[], src: (n: string) => string = (n) => n): GroupCandidate[] {
  const have = new Set(declared.map(groupKey))
  return (candidates ?? [])
    .map((c) => ({ ...c, key: c.key.map(src), members: c.members.map(src) }))
    .filter((c) => c.suggested && !have.has(groupKey({ key: c.key, members: c.members })))
}

export function declOf(c: GroupCandidate): GroupDecl {
  return c.key.length > 0 ? { key: c.key, members: c.members } : { members: c.members }
}

export function groupLabel(g: GroupDecl): string {
  return g.key && g.key.length > 0 ? `${g.key.join('+')} → ${g.members.join(', ')}` : g.members.join(', ')
}

// --- names -------------------------------------------------------------------

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

// validName: 1-100 of [A-Za-z0-9._-], starting alphanumeric (the
// server's rule for schema names and cohort target stems).
export function validName(n: string): boolean {
  return NAME_RE.test(n)
}

// nameFromSource derives a schema or cohort name from a source path:
// the base name without its extension, other characters as "_".
export function nameFromSource(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[^A-Za-z0-9]+/, '').replace(/[._-]+$/, '')
  return stem.slice(0, 100) || 'data'
}

// --- type guidance -------------------------------------------------------------

// TYPE_HINTS is a one-line description of each Pulse field type (from
// Pulse's cohort-schema-design guide).
export const TYPE_HINTS: Record<string, string> = {
  u4: 'small whole number 0-15 (Likert, grades), half a byte',
  u8: 'whole number 0-255, 1 byte',
  u16: 'whole number 0-65,535, 2 bytes',
  u32: 'whole number up to ~4.29 billion, 4 bytes',
  u64: 'whole number up to ~1.8e19 (IDs, microseconds), 8 bytes',
  f32: 'decimal measurement, ~7 significant digits, 4 bytes',
  f64: 'decimal, ~15 significant digits (scores, wide range), 8 bytes',
  decimal128: 'exact decimal (money) with precision and scale, 16 bytes',
  date: 'calendar day (no time of day)',
  datetime: 'timestamp in epoch seconds, UTC',
  packed_bool: 'true / false, 1 bit',
  categorical_u8: 'text label, up to 256 distinct values',
  categorical_u16: 'text label, up to 65,536 distinct values',
  categorical_u32: 'text label, up to ~4.29 billion distinct values',
  set_u8: 'multi-select, up to 8 labels per cohort',
  set_u16: 'multi-select, up to 16 labels',
  set_u32: 'multi-select, up to 32 labels',
  set_u64: 'multi-select, up to 64 labels',
  set_u128: 'multi-select, up to 128 labels',
  set_u256: 'multi-select, up to 256 labels (widest)',
}

export function typeHint(t: string): string {
  return TYPE_HINTS[t] ?? ''
}

// SHORT_HINTS label the type dropdown's options (TYPE_HINTS is the
// tooltip).
const SHORT_HINTS: Record<string, string> = {
  u4: '0-15',
  u8: '0-255',
  u16: '0-65,535',
  u32: 'up to 4.29 billion',
  u64: 'up to 1.8e19',
  f32: '7 digits',
  f64: '15 digits',
  decimal128: 'exact (money)',
  date: 'calendar day',
  datetime: 'timestamp (UTC)',
  packed_bool: 'true / false',
  categorical_u8: '≤ 256 labels',
  categorical_u16: '≤ 65,536 labels',
  categorical_u32: '≤ 4.29 billion labels',
  set_u8: 'multi-select, ≤ 8',
  set_u16: 'multi-select, ≤ 16',
  set_u32: 'multi-select, ≤ 32',
  set_u64: 'multi-select, ≤ 64',
  set_u128: 'multi-select, ≤ 128',
  set_u256: 'multi-select, ≤ 256',
}

export function shortHint(t: string): string {
  return SHORT_HINTS[t] ?? ''
}

const TYPE_GROUPS: { label: string; match: (t: string) => boolean }[] = [
  { label: 'Whole numbers', match: (t) => /^u\d+$/.test(t) },
  { label: 'Decimals', match: (t) => t === 'f32' || t === 'f64' || t === 'decimal128' },
  { label: 'Text labels', match: (t) => t.startsWith('categorical_') },
  { label: 'Dates and times', match: (t) => t === 'date' || t === 'datetime' },
  { label: 'Yes / no', match: (t) => t === 'packed_bool' },
  { label: 'Multi-select', match: (t) => isSetType(t) },
]

function rungOrder(t: string): number {
  const m = /(\d+)$/.exec(t)
  return m ? Number(m[1]) : 0
}

// typeGroups sorts Pulse's type names into option groups for the type
// dropdown, narrowest rung first; names outside every group go last.
export function typeGroups(types: string[]): { label: string; types: string[] }[] {
  const out = TYPE_GROUPS.map((g) => ({
    label: g.label,
    types: types.filter(g.match).sort((a, b) => rungOrder(a) - rungOrder(b) || a.localeCompare(b)),
  }))
  const rest = types.filter((t) => !TYPE_GROUPS.some((g) => g.match(t)))
  if (rest.length > 0) out.push({ label: 'Other', types: rest })
  return out.filter((g) => g.types.length > 0)
}

const UINT_RUNGS: [string, number][] = [
  ['u4', 15],
  ['u8', 255],
  ['u16', 65_535],
  ['u32', 4_294_967_295],
  ['u64', Number.MAX_SAFE_INTEGER],
]
const CAT_RUNGS: [string, number][] = [
  ['categorical_u8', 256],
  ['categorical_u16', 65_536],
  ['categorical_u32', 4_294_967_296],
]

// compactNudge suggests a narrower rung of the column's type family when
// the sampled stats fit it (an unsigned type whose sampled max fits a
// smaller one; a categorical whose sampled distinct count does). The
// sample can miss larger values, so the UI words it as a suggestion.
export function compactNudge(c: Pick<EditColumn, 'type' | 'stats'>): { type: string; reason: string } | null {
  const s = c.stats
  if (!s) return null
  const ui = UINT_RUNGS.findIndex(([t]) => t === c.type)
  if (ui >= 0 && s.min !== undefined && s.max !== undefined && s.min >= 0 && Number.isInteger(s.max)) {
    const fit = UINT_RUNGS.findIndex(([, max]) => s.max! <= max)
    if (fit >= 0 && fit < ui) return { type: UINT_RUNGS[fit][0], reason: `sampled max ${s.max} fits ${UINT_RUNGS[fit][0]}` }
  }
  const ci = CAT_RUNGS.findIndex(([t]) => t === c.type)
  if (ci >= 0 && !s.distinct_capped) {
    const fit = CAT_RUNGS.findIndex(([, max]) => s.distinct <= max)
    if (fit >= 0 && fit < ci) return { type: CAT_RUNGS[fit][0], reason: `${s.distinct} distinct values sampled fit ${CAT_RUNGS[fit][0]}` }
  }
  return null
}

// filterColumns keeps the columns whose name (or type) contains every
// word of q, case-insensitively.
export function filterColumns(cols: EditColumn[], q: string): EditColumn[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return cols
  return cols.filter((c) => {
    const hay = `${c.name} ${c.rename ?? ''} ${c.type}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
