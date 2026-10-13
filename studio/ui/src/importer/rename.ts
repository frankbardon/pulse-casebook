// Column renames on import. PULSE-GAP(column-rename)
//
// Pulse (alpha.10) matches an import schema to source columns by exact
// name and cannot rename, so the studio does it (server package
// internal/importer/rename wraps the source reader). Rule: the editor
// keys every column by its SOURCE name (EditColumn.name); everything
// sent to Pulse (schema fields, overrides, set delimiters, groups) uses
// the NEW name, fieldName(c). The map {"<source column>": "<field
// name>"} travels as options.rename and is saved in the schema's object
// form {fields, rename}. See studio/README.md, "Removing the rename shim".
import type { SchemaField } from '../api.ts'

export type RenameMap = Record<string, string>

type Named = { name: string; rename?: string }
type Col = Named & { index: number; include: boolean }

// fieldName is the name Pulse sees for a column.
export function fieldName(c: Named): string {
  return c.rename ?? c.name
}

// isRenamed: the column has a new name that differs from its source.
export function isRenamed(c: Named): boolean {
  return fieldName(c) !== c.name
}

// renameOf is the map to send: included source columns whose name
// changed (an excluded column's rename is irrelevant and left out).
export function renameOf(cols: Col[]): RenameMap | undefined {
  const m: RenameMap = {}
  for (const c of cols) if (c.include && c.index >= 0 && isRenamed(c)) m[c.name] = fieldName(c)
  return Object.keys(m).length > 0 ? m : undefined
}

// sourceNamer maps a name Pulse reported back to its source column,
// under the rename a predict was sent with.
export function sourceNamer(m: RenameMap | undefined): (n: string) => string {
  const inv = new Map(Object.entries(m ?? {}).map(([k, v]) => [v, k]))
  return (n) => inv.get(n) ?? n
}

// fieldNamer maps a source column to the name Pulse sees.
export function fieldNamer(cols: Col[]): (n: string) => string {
  const m = renameOf(cols) ?? {}
  return (n) => m[n] ?? n
}

// setRename sets a column's name; the source name clears the rename ("" is
// kept, as an empty name being typed, and reported by nameIssues).
export function setRename<T extends Named>(cols: T[], name: string, rename: string): T[] {
  return cols.map((c) => {
    if (c.name !== name) return c
    const next = { ...c }
    if (rename === c.name) delete next.rename
    else next.rename = rename
    return next
  })
}

// suggestName is a clean snake_case field name: lower case, every run of
// other characters one "_", trimmed, "c_" before a leading digit ("List
// Price ($)" → list_price). "" when nothing is left. Mirrors the
// server's rename.Suggest.
export function suggestName(header: string): string {
  const s = header
    .toLowerCase()
    .split(/[^\p{L}\p{Nd}]+/u)
    .filter(Boolean)
    .join('_')
  return /^\d/.test(s) ? `c_${s}` : s
}

// suggestAll renames every included source column to its suggestion,
// made unique (_2, _3, …) against the other columns' names.
export function suggestAll<T extends Col>(cols: T[]): T[] {
  const taken = new Set(cols.filter((c) => !c.include || c.index < 0).map((c) => c.name))
  return cols.map((c) => {
    if (!c.include || c.index < 0) return c
    const base = suggestName(c.name) || 'column'
    let n = base
    for (let i = 2; taken.has(n); i++) n = `${base}_${i}`
    taken.add(n)
    const next = { ...c }
    if (n === c.name) delete next.rename
    else next.rename = n
    return next
  })
}

export type NameIssue = { reason: 'empty' | 'whitespace' | 'too_long' | 'duplicate'; message: string }

// MAX_NAME_BYTES: a .pulse field name has a u16 length prefix.
const MAX_NAME_BYTES = 65_535

// checkName mirrors the server's rename.CheckName.
export function checkName(n: string): NameIssue | null {
  if (n.trim() === '') return { reason: 'empty', message: 'Name cannot be empty.' }
  if (n.trim() !== n) return { reason: 'whitespace', message: 'Name starts or ends with a space.' }
  if (new TextEncoder().encode(n).length > MAX_NAME_BYTES) return { reason: 'too_long', message: 'Name is too long.' }
  return null
}

// nameIssues checks every renamed, included column (keyed by source
// name): an acceptable name that no other column has after renaming.
// Excluded columns keep their source name (their rename is not sent);
// duplicates the source itself has are Pulse's to judge.
export function nameIssues(cols: Col[]): Map<string, NameIssue> {
  const out = new Map<string, NameIssue>()
  const eff = cols.map((c) => (c.include && c.index >= 0 ? fieldName(c) : c.name))
  cols.forEach((c, i) => {
    if (!c.include || c.index < 0 || !isRenamed(c)) return
    const bad = checkName(eff[i])
    if (bad) return out.set(c.name, bad)
    const j = eff.findIndex((n, k) => k !== i && n === eff[i])
    if (j >= 0) out.set(c.name, { reason: 'duplicate', message: `Column ${cols[j].name} is also called ${eff[i]}.` })
  })
  return out
}

// parseSavedSchema reads a saved schema file: the plain field array, or
// the object {fields, rename} a schema with renamed columns is saved as.
// Keep this when the shim goes: files keep their rename key.
export function parseSavedSchema(text: string): { fields: SchemaField[]; rename?: RenameMap } {
  const v = JSON.parse(text) as SchemaField[] | { fields: SchemaField[]; rename?: RenameMap }
  return Array.isArray(v) ? { fields: v } : { fields: v.fields ?? [], ...(v.rename && { rename: v.rename }) }
}

// renameDiff lists source columns whose saved rename differs.
export function renameDiff(saved: RenameMap | undefined, next: RenameMap | undefined): { name: string; from: string; to: string }[] {
  const a = saved ?? {}
  const b = next ?? {}
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  return keys.filter((k) => a[k] !== b[k]).map((k) => ({ name: k, from: a[k] ?? k, to: b[k] ?? k }))
}
