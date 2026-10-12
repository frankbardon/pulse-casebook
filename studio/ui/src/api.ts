export type Health = {
  status: string
  dir: string
  preview_timeout_ms: number
  auto_preview_rows: number
}

export type ApiError = { error: { code: string; message: string; details?: unknown } }

export function isApiError(v: unknown): v is ApiError {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false
  const e = (v as { error: unknown }).error
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal })
  const body: unknown = await res.json()
  if (!res.ok || isApiError(body)) {
    const msg = isApiError(body) ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

export type FileKind = 'request' | 'compose' | 'facet' | 'chain' | 'cohort' | 'unopenable'

export type WorkspaceFile = {
  path: string
  kind: FileKind
  reason?: string
}

export type FileListing = {
  files: WorkspaceFile[]
  truncated?: boolean
}

export type FileContent = {
  path: string
  kind: FileKind
  reason?: string
  text: string
}

export function listFiles(signal?: AbortSignal): Promise<FileListing> {
  return getJSON<FileListing>('/api/files', signal)
}

export function readFile(path: string, signal?: AbortSignal): Promise<FileContent> {
  return getJSON<FileContent>(`/api/file?path=${encodeURIComponent(path)}`, signal)
}

// saveFile PUTs a JSON document. The server re-formats it (house style, or
// the existing file's expanded style) and writes it atomically; the result
// carries the exact bytes now on disk.
export async function saveFile(path: string, text: string, signal?: AbortSignal): Promise<FileContent> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: text,
    signal,
  })
  const body: unknown = await res.json()
  if (!res.ok || isApiError(body)) {
    const msg = isApiError(body) ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as FileContent
}

// Catalog is /api/catalog. Only the manifest parts the graph reads are typed;
// the rest passes through untyped.
export type ManifestOperator = { name?: string; kind?: string; category?: string }

export type Manifest = {
  components?: Partial<
    Record<'aggregators' | 'attributes' | 'features' | 'filterers' | 'groupers' | 'windows', ManifestOperator[]>
  >
  tests?: ManifestOperator[]
  post_tests?: ManifestOperator[]
  regressions?: ManifestOperator[]
  matrices?: ManifestOperator[]
  overlays?: ManifestOperator[]
  [key: string]: unknown
}

export type Catalog = {
  pulse_version: string
  feature_set_digest: string
  manifest: Manifest
  schema: unknown
}

export function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  return getJSON<Catalog>('/api/catalog', signal)
}

export type CohortField = {
  name: string
  type: string
  categorical?: boolean
  description?: string
}

export type CohortInspect = {
  field_count: number
  record_count?: number
  fields: CohortField[]
}

export function inspectCohort(path: string, signal?: AbortSignal): Promise<CohortInspect> {
  return getJSON<CohortInspect>(`/api/cohort/inspect?path=${encodeURIComponent(path)}`, signal)
}
