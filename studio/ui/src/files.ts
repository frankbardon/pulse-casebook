import type { NewRoot, WorkspaceFile } from './api.ts'

// fileLabel is how a list names a file: sources, schemas and
// import specs drop their fixed directory (and suffix; the section
// says what they are); everything else shows its path.
export function fileLabel(f: WorkspaceFile): string {
  switch (f.kind) {
    case 'source':
      return f.path.replace(/^sources\//, '')
    case 'schema':
      return f.path.replace(/^schemas\//, '').replace(/\.schema\.json$/, '')
    case 'import':
      return f.path.replace(/^imports\//, '').replace(/\.import\.json$/, '')
    default:
      return f.path
  }
}

// fileBadge is the short state tag a list row carries: an import
// spec's state other than ok, and "imported" on cohorts an import spec
// builds (they can be rebuilt).
export function fileBadge(f: Pick<WorkspaceFile, 'kind' | 'state' | 'spec'> & { path?: string }): { text: string; tone: 'muted' | 'warn' | 'danger' } | null {
  if (f.kind === 'import') {
    if (f.state === 'needs_rebuild') return { text: 'needs rebuild', tone: 'warn' }
    if (f.state === 'invalid') return { text: 'invalid', tone: 'danger' }
    return null
  }
  if (f.kind === 'cohort' && f.spec) return { text: 'imported', tone: 'muted' }
  return null
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
