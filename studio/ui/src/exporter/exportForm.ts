// Pure state helpers for the export dialog (ExportDialog.tsx): option
// values from the server's format descriptors, the request body, the
// field checklist, and the per-cohort memory of the last format and
// options (browser localStorage, a per-viewer convenience).
import type { ExportBody, ExportFormat, ExportOption, ExportOptionValue, LabelBinding } from '../api.ts'

export type OptionValues = Record<string, ExportOptionValue>

// defaultOptions is a format's options at their defaults.
export function defaultOptions(f: ExportFormat): OptionValues {
  const out: OptionValues = {}
  for (const o of f.options) out[o.key] = o.default
  return out
}

function fits(o: ExportOption, v: unknown): v is ExportOptionValue {
  switch (o.type) {
    case 'bool':
      return typeof v === 'boolean'
    case 'string':
      return typeof v === 'string'
    case 'enum':
      return typeof v === 'string' && (o.enum ?? []).includes(v)
    case 'int':
      return typeof v === 'number'
  }
}

// optionsFor merges remembered values over a format's defaults, keeping
// only keys the format still has with values of the right type (a
// newer engine may have changed them).
export function optionsFor(f: ExportFormat, stored?: Record<string, unknown>): OptionValues {
  const out = defaultOptions(f)
  for (const o of f.options) {
    const v = stored?.[o.key]
    if (v !== undefined && fits(o, v)) out[o.key] = v
  }
  return out
}

// optionError is why an option's value cannot be sent (an int outside
// its range or not a whole number), or null.
export function optionError(o: ExportOption, v: ExportOptionValue | undefined): string | null {
  if (o.type !== 'int') return null
  if (typeof v !== 'number' || !Number.isInteger(v)) return 'a whole number'
  if ((o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max)) return `between ${o.min} and ${o.max}`
  return null
}

// changedOptions is what the body carries: options that differ from
// their default (the server applies defaults for the rest).
export function changedOptions(f: ExportFormat, values: OptionValues): OptionValues {
  const out: OptionValues = {}
  for (const o of f.options) {
    const v = values[o.key]
    if (v !== undefined && v !== o.default) out[o.key] = v
  }
  return out
}

export type LabelChoice = { table: string; mode: 'replace' | 'augment' }

export type FormState = {
  format: ExportFormat
  options: OptionValues
  // Checked fields; every field when it has them all.
  selected: ReadonlySet<string>
  timeZone: string
  labels: Record<string, LabelChoice>
  name: string
  overwrite?: boolean
}

// exportBody builds the predict / export body. Fields are sent only for
// a strict subset (in the cohort's order), the time zone and labels
// only where the format takes them; labels only for checked fields.
export function exportBody(cohort: string, allFields: readonly string[], st: FormState): ExportBody {
  const f = st.format
  const body: ExportBody = { cohort, format: f.id }
  const opts = changedOptions(f, st.options)
  if (Object.keys(opts).length > 0) body.options = opts
  if (f.supports.fields) {
    const fields = selectedInOrder(allFields, st.selected)
    if (fields.length < allFields.length) body.fields = fields
  }
  const tz = st.timeZone.trim()
  if (f.supports.time_zone && tz !== '') body.time_zone = tz
  if (f.supports.labels) {
    const labels: LabelBinding[] = []
    for (const field of allFields) {
      const c = st.labels[field]
      if (c && c.table !== '' && st.selected.has(field)) labels.push({ field, table: c.table, mode: c.mode })
    }
    if (labels.length > 0) body.labels = labels
  }
  if (st.name.trim() !== '') body.name = st.name.trim()
  if (st.overwrite) body.overwrite = true
  return body
}

// selectedInOrder lists the checked fields in the cohort's order.
export function selectedInOrder(allFields: readonly string[], selected: ReadonlySet<string>): string[] {
  return allFields.filter((f) => selected.has(f))
}

// filterFields keeps fields whose name contains q (case-insensitive).
export function filterFields(fields: readonly string[], q: string): string[] {
  const needle = q.trim().toLowerCase()
  if (needle === '') return [...fields]
  return fields.filter((f) => f.toLowerCase().includes(needle))
}

// setAll checks (on) or unchecks every field in shown, leaving the rest.
export function setAll(selected: ReadonlySet<string>, shown: readonly string[], on: boolean): Set<string> {
  const out = new Set(selected)
  for (const f of shown) {
    if (on) out.add(f)
    else out.delete(f)
  }
  return out
}

// cohortStem is a cohort path's base name without ".pulse".
export function cohortStem(cohort: string): string {
  const base = cohort.slice(cohort.lastIndexOf('/') + 1)
  return base.toLowerCase().endsWith('.pulse') ? base.slice(0, -'.pulse'.length) : base
}

// defaultName is "<cohort>.<ext>".
export function defaultName(cohort: string, f: ExportFormat): string {
  return cohortStem(cohort) + f.extension
}

// swapExtension carries a typed name across a format change: a name
// ending in the old format's extension gets the new one.
export function swapExtension(name: string, from: ExportFormat, to: ExportFormat): string {
  if (name.toLowerCase().endsWith(from.extension.toLowerCase())) return name.slice(0, -from.extension.length) + to.extension
  return name
}

// --- remembered settings (per cohort, per viewer)

export const EXPORT_MEMORY_KEY = 'studio.export.v1'

export type Store = Pick<Storage, 'getItem' | 'setItem'>

export type Remembered = { format: string; options: Record<string, Record<string, unknown>>; timeZone?: string }

function defaultStore(): Store | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function readAll(store: Store | undefined): Record<string, Remembered> {
  try {
    const raw = store?.getItem(EXPORT_MEMORY_KEY)
    if (!raw) return {}
    const v: unknown = JSON.parse(raw)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, Remembered>) : {}
  } catch {
    return {}
  }
}

// recall is the last format and options exported from cohort, if any.
export function recall(cohort: string, store: Store | undefined = defaultStore()): Remembered | null {
  const r = readAll(store)[cohort]
  if (!r || typeof r.format !== 'string' || typeof r.options !== 'object' || r.options === null) return null
  return r
}

// remember stores cohort's format and its options (other formats'
// remembered options are kept). Storage failures are ignored.
export function remember(cohort: string, format: string, options: OptionValues, timeZone: string, store: Store | undefined = defaultStore()): void {
  try {
    const all = readAll(store)
    const prev = all[cohort]?.options ?? {}
    all[cohort] = { format, options: { ...prev, [format]: options }, timeZone }
    store?.setItem(EXPORT_MEMORY_KEY, JSON.stringify(all))
  } catch {
    // Private mode, quota, blocked storage: a convenience only.
  }
}
