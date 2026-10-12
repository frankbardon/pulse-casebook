import type { FileKind, WorkspaceFile } from './api.ts'

export type FileGroup = { kind: FileKind; title: string; files: WorkspaceFile[] }

// Sidebar section order and titles. Unopenable files go last.
const GROUPS: { kind: FileKind; title: string }[] = [
  { kind: 'request', title: 'Requests' },
  { kind: 'compose', title: 'Compose' },
  { kind: 'facet', title: 'Facet' },
  { kind: 'chain', title: 'Chain' },
  { kind: 'cohort', title: 'Cohorts' },
  { kind: 'unopenable', title: 'Other' },
]

// groupFiles buckets files by kind in sidebar order, dropping empty groups
// and keeping the server's path order within a group.
export function groupFiles(files: WorkspaceFile[]): FileGroup[] {
  return GROUPS.map((g) => ({ ...g, files: files.filter((f) => f.kind === g.kind) })).filter(
    (g) => g.files.length > 0,
  )
}

// isOpenable reports whether the builder can open a file from the sidebar.
export function isOpenable(f: WorkspaceFile): boolean {
  return f.kind !== 'unopenable'
}
