export type Health = {
  status: string
  dir: string
  preview_timeout_ms: number
  auto_preview_rows: number
  // Present when the engine is running; a change from the catalog's
  // values means the catalog is stale (see catalog.ts).
  pulse_version?: string
  feature_set_digest?: string
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
export function saveFile(path: string, text: string, signal?: AbortSignal): Promise<FileContent> {
  return putJSON<FileContent>(`/api/file?path=${encodeURIComponent(path)}`, text, signal)
}

// NewRoot is the request root a new file is created with.
export type NewRoot = 'request' | 'compose' | 'facet' | 'chain'

// CreatedFile is POST /api/file/new: the new file (GET /api/file shape),
// the cohort object written into it and the engine's predict verdict.
export type CreatedFile = FileContent & {
  cohort: { filename: string; data_dir: string }
  predict: { valid: boolean; errors?: { code: string; message: string }[] }
}

// createFile creates a new request file of the given root bound to a
// workspace cohort. The server refuses to overwrite (409 exists).
export async function createFile(
  path: string,
  root: NewRoot,
  cohort: string,
  signal?: AbortSignal,
): Promise<CreatedFile> {
  const res = await fetch('/api/file/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, root, cohort }),
    signal,
  })
  const body: unknown = await res.json()
  if (!res.ok || isApiError(body)) {
    const msg = isApiError(body) ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as CreatedFile
}

// LayoutFile is /api/layout: the sidecar of a request (foo.layout.json
// beside foo.json). layout is null when there is none or it is unusable
// (invalid says why); see graph/layout.ts for the schema.
export type LayoutFile = { path: string; layout: unknown; invalid?: string }

export function readLayout(path: string, signal?: AbortSignal): Promise<LayoutFile> {
  return getJSON<LayoutFile>(`/api/layout?path=${encodeURIComponent(path)}`, signal)
}

// saveLayout PUTs the sidecar object for the request at path.
export function saveLayout(path: string, text: string, signal?: AbortSignal): Promise<LayoutFile> {
  return putJSON<LayoutFile>(`/api/layout?path=${encodeURIComponent(path)}`, text, signal)
}

async function putJSON<T>(url: string, text: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
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
  return body as T
}

// Catalog is /api/catalog. Only the manifest parts the graph reads are typed;
// the rest passes through untyped.
export type ManifestParam = {
  name: string
  type: string
  required?: boolean
  default?: unknown
  enum_values?: string[]
  exactly_one_of?: string
  field_filter?: string
}

export type ManifestOperator = {
  name?: string
  kind?: string
  category?: string
  // The operator's one-line description (the only prose the slim
  // catalog keeps); the palette searches and shows it.
  description?: string
  // Tier-2 post_tests list one entry per variant, named `<family>/<variant>`.
  family?: string
  // Tier-2 post_tests: the variant written to params.variant.
  variant?: string
  // null for operators whose params are free-form or absent.
  params?: ManifestParam[] | null
  // Overlays: the scopes the kind accepts.
  scopes?: string[]
  // Overlays: the OverlayRef families the kind reads (Go field names,
  // e.g. `Margin`); empty when the kind takes no ref.
  ref_kinds?: string[]
  // Cohort field types the operator's field input takes (absent for
  // tests, whose input rules come from requires).
  accepts_types?: string[]
  // Field type of the column the operator writes (features, attributes,
  // windows); absent when it varies or the operator writes none.
  emits_type?: string
  // Tests and post-tests: the inputs the engine requires, by Go field
  // name (`Field`, `SplitBy`, `Rows`, ...).
  requires?: string[]
}

// CohortType is one entry of manifest.cohort_types: a cohort field type
// and the operators that take it.
export type CohortType = {
  name: string
  categorical?: boolean
  compatible_aggregators?: string[]
  compatible_attributes?: string[]
  compatible_features?: string[]
  compatible_filterers?: string[]
  compatible_groupers?: string[]
  compatible_windows?: string[]
}

export type Manifest = {
  components?: Partial<
    Record<'aggregators' | 'attributes' | 'features' | 'filterers' | 'groupers' | 'windows', ManifestOperator[]>
  >
  tests?: ManifestOperator[]
  post_tests?: ManifestOperator[]
  regressions?: ManifestOperator[]
  matrices?: ManifestOperator[]
  overlays?: ManifestOperator[]
  cohort_types?: CohortType[]
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

// Preview is POST /api/preview (studio/internal/server/preview.go). A
// preview that was deferred (large cohort, expensive probe), timed out
// or superseded still answers 200 with that status; its probes then
// carry only node and kind (and reason when deferred).
export type PreviewStatus = 'ok' | 'deferred' | 'timed_out' | 'cancelled'

export type PreviewStats = {
  field?: string
  n?: number
  n_null?: number
  min?: number | null
  max?: number | null
  mean?: number | null
  stddev?: number | null
  quantiles?: { p: number; value: number | null }[]
  note?: string
}

export type PreviewProbe = {
  node: string
  kind: string
  reason?: string
  rows?: { total: number; filtered: number }
  filter?: { n_in: number; n_out: number; n_null_input: number }
  stats?: PreviewStats
  table?: { rows: Record<string, unknown>[]; total_rows: number; truncated?: boolean }
  component?: unknown
  facet?: unknown
  result?: unknown
}

export type PreviewResult = {
  status: PreviewStatus
  verb: string
  cost: 'cheap' | 'expensive' | string
  cached?: boolean
  deferred?: string[]
  record_count?: number
  probes: PreviewProbe[]
  elapsed_ms: number
}

export type PreviewQuery = {
  path: string
  nodes: string[]
  // The full request document as emitted by the lossless model
  // (emitModelText). It is spliced into the body verbatim, never
  // re-serialized, so number spellings and key order reach the server
  // exactly as edited.
  requestText: string
  // Run expensive probes even on cohorts over --auto-preview-rows.
  force?: boolean
}

// PREVIEW_CLIENT identifies this page load to the preview scheduler, sent
// as body.client. The server supersedes (cancels) an in-flight preview
// only for a newer one from the same client of the same path + nodes, so
// two tabs (or parallel test workers) on one file never cancel each
// other; the result cache stays shared.
export const PREVIEW_CLIENT = newClientId()

function newClientId(): string {
  const c = globalThis.crypto
  // randomUUID needs a secure context; plain http on a LAN host lacks it.
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  if (typeof c?.getRandomValues === 'function') {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function postPreview(q: PreviewQuery, signal?: AbortSignal): Promise<PreviewResult> {
  const body = `{"path":${JSON.stringify(q.path)},"nodes":${JSON.stringify(q.nodes)},"force":${q.force ? 'true' : 'false'},"client":${JSON.stringify(PREVIEW_CLIENT)},"request":${q.requestText}}`
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  })
  const out: unknown = await res.json()
  if (!res.ok || isApiError(out)) {
    const msg = isApiError(out) ? `${out.error.code}: ${out.error.message}` : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return out as PreviewResult
}

// PredictIssue is one finding of POST /api/predict, on the most precise
// node path the server located ("" = the request as a whole). Warnings
// and hints are predict suggestions: proposed holds the suggested values.
export type PredictIssue = {
  path: string
  severity: 'error' | 'warning' | 'hint'
  code?: string
  message: string
  current?: unknown
  proposed?: unknown[]
  confidence?: number
}

export type PredictVerdict = { root: string; valid: boolean; issues: PredictIssue[] }

// ExplainStep is one slot of POST /api/explain, keyed by its node path.
export type ExplainStep = { path: string; operator?: string; fields?: string[]; text: string }

export type ExplainResult = { root: string; summary: string; valid?: boolean; steps: ExplainStep[]; caveats?: string[] }

// The in-memory document (emitModelText) is spliced in verbatim, so the
// server validates exactly what the editor holds, never the saved file.
async function postValidate<T>(endpoint: string, path: string, requestText: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: `{"path":${JSON.stringify(path)},"request":${requestText}}`,
    signal,
  })
  const out: unknown = await res.json()
  if (!res.ok || isApiError(out)) {
    const msg = isApiError(out) ? `${out.error.code}: ${out.error.message}` : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return out as T
}

export function postPredict(path: string, requestText: string, signal?: AbortSignal): Promise<PredictVerdict> {
  return postValidate<PredictVerdict>('/api/predict', path, requestText, signal)
}

export function postExplain(path: string, requestText: string, signal?: AbortSignal): Promise<ExplainResult> {
  return postValidate<ExplainResult>('/api/explain', path, requestText, signal)
}
