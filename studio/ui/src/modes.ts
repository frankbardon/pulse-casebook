// Analysis modes: the user-facing names of the four request roots (the
// approved table). File kinds, JSON and test ids keep the root names;
// everything people read says the mode.
import type { FileKind, NewRoot, WorkspaceFile } from './api.ts'

export type ModeId = 'standalone' | 'composed' | 'faceted' | 'chained'

export type Mode = {
  id: ModeId
  // The request root (file kind) the mode is.
  root: NewRoot
  label: string
  // What it runs, in one line.
  runs: string
}

export const MODES: readonly Mode[] = [
  { id: 'standalone', root: 'request', label: 'Standalone', runs: 'one cohort, one pass, one result' },
  { id: 'composed', root: 'compose', label: 'Composed', runs: 'several standalone runs together, results side by side' },
  { id: 'faceted', root: 'facet', label: 'Faceted', runs: 'summaries of the chosen fields' },
  { id: 'chained', root: 'chain', label: 'Chained', runs: "steps, each reading the previous step's result table" },
]

const BY_ROOT = new Map<string, Mode>(MODES.map((m) => [m.root, m]))

// modeOf is the mode of a file kind (undefined for non-analyses).
export function modeOf(kind: FileKind | string): Mode | undefined {
  return BY_ROOT.get(kind)
}

// modeLabel is a root kind's mode name ("compose" → "Composed"), or the
// kind itself when it is not an analysis root.
export function modeLabel(kind: FileKind | string): string {
  return modeOf(kind)?.label ?? kind
}

export function isAnalysis(f: { kind: FileKind }): boolean {
  return modeOf(f.kind) !== undefined
}

// The analyses folder of a library workspace: listed paths drop it.
export const ANALYSES_DIR = 'analyses'

// analysisName is how an analysis is listed: its file name without
// the folder, the analyses/ prefix or the .json / .compose.json /
// .facet.json suffix.
export function analysisName(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base.replace(/\.(compose|facet)\.json$/i, '').replace(/\.json$/i, '')
}

// analysisFolder is the folder an analysis is listed under, relative to
// analyses/ ("" = top level).
export function analysisFolder(path: string): string {
  const rel = path.startsWith(ANALYSES_DIR + '/') ? path.slice(ANALYSES_DIR.length + 1) : path
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

export type ModeFilter = ModeId | 'all'

// filterAnalyses keeps the analyses whose name (or folder) contains the
// query (case-insensitive, whitespace-separated terms all match) and
// whose mode is the filter's.
export function filterAnalyses(files: WorkspaceFile[], query: string, mode: ModeFilter): WorkspaceFile[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return files.filter((f) => {
    const m = modeOf(f.kind)
    if (!m || (mode !== 'all' && m.id !== mode)) return false
    const hay = `${analysisFolder(f.path)}/${analysisName(f.path)}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

export type AnalysisFolder = { folder: string; files: WorkspaceFile[] }

// groupByFolder lists analyses by folder: top level first, then folders
// alphabetically; files by name within a folder.
export function groupByFolder(files: WorkspaceFile[]): AnalysisFolder[] {
  const by = new Map<string, WorkspaceFile[]>()
  for (const f of files) {
    const k = analysisFolder(f.path)
    const list = by.get(k) ?? []
    list.push(f)
    by.set(k, list)
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({ folder, files: [...list].sort((x, y) => analysisName(x.path).localeCompare(analysisName(y.path))) }))
}

// modeCounts counts analyses per mode (for the filter's labels).
export function modeCounts(files: WorkspaceFile[]): Record<ModeId, number> {
  const out: Record<ModeId, number> = { standalone: 0, composed: 0, faceted: 0, chained: 0 }
  for (const f of files) {
    const m = modeOf(f.kind)
    if (m) out[m.id]++
  }
  return out
}
