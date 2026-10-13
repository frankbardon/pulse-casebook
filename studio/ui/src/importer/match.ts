// Saved schema reuse (G3) in the schema editor: POST /api/import/predict
// ranks the saved schemas against the source's columns (server-side
// fingerprints); this picks the one to auto-select, the ones to suggest,
// and merges a chosen one into the editor.
import type { SchemaMatch } from '../api.ts'
import type { EditColumn } from './schemaEdit.ts'

// applyMatch merges a saved schema into the editor: columns the saved
// schema names take its type, nullability and description (matched);
// the others keep their type and are flagged new. Input names win
// (Pulse matches schema fields to columns by exact name).
//
// The saved schema's renames (PULSE-GAP(column-rename)) are applied to
// the columns it names: merged names are the input's SOURCE names.
//
// dropNew also excludes the new columns: for a file that holds every
// field of a saved schema plus columns it left out (an earlier import
// that excluded them, via ignore_extra).
export function applyMatch(cols: EditColumn[], m: SchemaMatch, dropNew = false): EditColumn[] {
  const byName = new Map(m.merged.map((f) => [f.name, f]))
  return cols.map((c) => {
    const f = byName.get(c.name)
    if (!f) return c
    if (f.new) return { ...c, fromMatch: 'new', ...(dropNew && c.index >= 0 && { include: false }) }
    const next: EditColumn = { ...c, type: f.type, nullable: f.nullable, description: f.description, fromMatch: 'matched' }
    const renamed = m.rename?.[c.name]
    if (renamed !== undefined && renamed !== c.name) next.rename = renamed
    else delete next.rename
    if (f.type === 'decimal128') {
      next.precision = f.precision
      next.scale = f.scale
    } else {
      delete next.precision
      delete next.scale
    }
    return next
  })
}

// isSuperset: the file has every field of the saved schema, with the
// same coarse types, plus columns the schema does not name. A schema
// saved with excluded columns looks like this to the next upload of
// the same data, however low its score.
export function isSuperset(m: SchemaMatch): boolean {
  return !m.exact && m.diff.missing.length === 0 && m.diff.retyped.length === 0 && m.diff.added.length > 0 && m.merged.some((f) => !f.new)
}

// rankMatches picks the saved schema to auto-select (an exact match),
// and the suggestions: the other close matches (score >= the server's
// threshold) and supersets, best first.
export function rankMatches(matches: SchemaMatch[]): { exact?: SchemaMatch; suggestions: SchemaMatch[] } {
  const exact = matches.find((m) => m.exact)
  return { exact, suggestions: matches.filter((m) => !m.exact && (m.suggest || isSuperset(m))) }
}

export function scorePct(score: number): string {
  return `${Math.round(score * 100)}%`
}
