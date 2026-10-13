// The Cohorts area's view of GET /api/cohorts: global and local items
// kept apart, local ones tagged with their workspace.
import { GLOBAL_AREA, type Area, type CatalogEntry, type CohortsCatalog, type Workspace } from './api.ts'

export type ScopeFilter = 'all' | 'global' | 'local'

export type CatalogKind = 'cohort' | 'schema' | 'import' | 'source'

// areaOf is the area an entry's path is relative to (its API area).
export function areaOf(e: CatalogEntry): Area {
  return e.scope === 'global' ? GLOBAL_AREA : (e.workspace ?? GLOBAL_AREA)
}

// entryKey identifies an entry across areas.
export function entryKey(kind: CatalogKind, e: CatalogEntry): string {
  return `${kind}:${areaOf(e)}:${e.path}`
}

export type ScopeSection = {
  // "global", or the workspace slug.
  id: string
  scope: 'global' | 'local'
  // "Global", or the workspace's name.
  title: string
  entries: CatalogEntry[]
}

// workspaceName is a workspace's display name (its slug when unknown).
export function workspaceName(slug: string | undefined, workspaces: Workspace[]): string {
  if (!slug) return ''
  return workspaces.find((w) => w.slug === slug)?.name ?? slug
}

// matches: the entry's name or path contains every query term.
function matches(e: CatalogEntry, terms: string[]): boolean {
  const hay = `${e.name} ${e.path}`.toLowerCase()
  return terms.every((t) => hay.includes(t))
}

// sectionsOf groups entries into Global first, then one section per
// workspace (in workspace order), dropping empty sections, filtered by
// scope and query.
export function sectionsOf(entries: CatalogEntry[], workspaces: Workspace[], scope: ScopeFilter, query = ''): ScopeSection[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const kept = entries.filter((e) => (scope === 'all' || e.scope === scope) && matches(e, terms))
  const out: ScopeSection[] = []
  const global = kept.filter((e) => e.scope === 'global')
  if (global.length > 0) out.push({ id: 'global', scope: 'global', title: 'Global', entries: global })
  const order = [...workspaces.map((w) => w.slug)]
  for (const e of kept) if (e.scope === 'local' && e.workspace && !order.includes(e.workspace)) order.push(e.workspace)
  for (const slug of order) {
    const local = kept.filter((e) => e.scope === 'local' && e.workspace === slug)
    if (local.length > 0) out.push({ id: slug, scope: 'local', title: workspaceName(slug, workspaces), entries: local })
  }
  return out
}

// catalogCounts counts entries per scope (for the filter).
export function catalogCounts(c: CohortsCatalog): { global: number; local: number } {
  const all = [...c.cohorts, ...c.schemas]
  return { global: all.filter((e) => e.scope === 'global').length, local: all.filter((e) => e.scope === 'local').length }
}

// canMakeGlobal: only a workspace's local cohort under its cohorts/
// folder, or a local saved schema, can be made global (there is no way
// back).
export function canMakeGlobal(kind: CatalogKind, e: CatalogEntry): boolean {
  if (e.scope !== 'local' || !e.workspace) return false
  if (kind === 'cohort') return e.path.startsWith('cohorts/')
  return kind === 'schema'
}
