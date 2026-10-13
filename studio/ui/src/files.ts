import type { FileKind, NewRoot, WorkspaceFile } from './api.ts'

export type FileGroup = { kind: FileKind; title: string; files: WorkspaceFile[] }

// Sidebar section order and titles. Unopenable files go last.
const GROUPS: { kind: FileKind; title: string }[] = [
  { kind: 'request', title: 'Requests' },
  { kind: 'compose', title: 'Compose' },
  { kind: 'facet', title: 'Facet' },
  { kind: 'chain', title: 'Chain' },
  { kind: 'cohort', title: 'Cohorts' },
  { kind: 'source', title: 'Sources' },
  { kind: 'schema', title: 'Schemas' },
  { kind: 'import', title: 'Imports' },
  { kind: 'export', title: 'Exports' },
  { kind: 'unopenable', title: 'Other' },
]

// groupFiles buckets files by kind in sidebar order, dropping empty groups
// and keeping the server's path order within a group.
export function groupFiles(files: WorkspaceFile[]): FileGroup[] {
  return GROUPS.map((g) => ({ ...g, files: files.filter((f) => f.kind === g.kind) })).filter(
    (g) => g.files.length > 0,
  )
}

// fileLabel is how the sidebar names a file: sources, schemas, import
// specs and exports drop their fixed directory (and suffix; the section
// says what they are); everything else shows its path.
export function fileLabel(f: WorkspaceFile): string {
  switch (f.kind) {
    case 'source':
      return f.path.replace(/^sources\//, '')
    case 'schema':
      return f.path.replace(/^schemas\//, '').replace(/\.schema\.json$/, '')
    case 'import':
      return f.path.replace(/^imports\//, '').replace(/\.import\.json$/, '')
    case 'export':
      return f.path.replace(/^exports\//, '')
    default:
      return f.path
  }
}

// fileBadge is the short state tag a sidebar row carries: an import
// spec's state other than ok, and "imported" on cohorts an import spec
// builds (they can be rebuilt).
export function fileBadge(f: WorkspaceFile): { text: string; tone: 'muted' | 'warn' | 'danger' } | null {
  if (f.kind === 'import') {
    if (f.state === 'needs_rebuild') return { text: 'needs rebuild', tone: 'warn' }
    if (f.state === 'invalid') return { text: 'invalid', tone: 'danger' }
    return null
  }
  if (f.kind === 'cohort' && f.spec) return { text: 'imported', tone: 'muted' }
  return null
}

// isOpenable reports whether the builder can open a file from the
// sidebar. Exports are not opened: their rows are download links.
export function isOpenable(f: WorkspaceFile): boolean {
  return f.kind !== 'unopenable' && f.kind !== 'export'
}

// Suffix a new file of each root gets (the casebook naming convention;
// the server classifies by keys, so this is for people, not detection).
const ROOT_SUFFIX: Record<NewRoot, string> = {
  request: '.json',
  compose: '.compose.json',
  facet: '.facet.json',
  chain: '.json',
}

// newFilePath joins a directory and a typed file name into the path to
// create, adding the root's suffix unless the name already ends in .json.
// Returns null for an empty name or one with path separators or dots
// that would leave the directory.
export function newFilePath(dir: string, name: string, root: NewRoot): string | null {
  const n = name.trim()
  if (n === '' || n.includes('/') || n.includes('\\') || n === '.' || n === '..') return null
  const file = n.toLowerCase().endsWith('.json') ? n : n + ROOT_SUFFIX[root]
  return dir === '' ? file : `${dir}/${file}`
}

// defaultNewDir is where a request for a cohort goes by default: the
// cohort's own req/ directory when the workspace has one (cohort beside
// req/, the casebook layout), else the cohort's directory.
export function defaultNewDir(cohortPath: string, files: WorkspaceFile[]): string {
  const i = cohortPath.lastIndexOf('/')
  const dir = i < 0 ? '' : cohortPath.slice(0, i)
  const req = dir === '' ? 'req' : `${dir}/req`
  return files.some((f) => f.path.startsWith(req + '/')) ? req : dir
}
