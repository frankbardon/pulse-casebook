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

export type FileKind =
  | 'request'
  | 'compose'
  | 'facet'
  | 'chain'
  | 'cohort'
  | 'source'
  | 'schema'
  | 'import'
  | 'unopenable'

// ImportState is an import spec's state: ok (its cohort is on disk),
// needs_rebuild (the spec is there, the .pulse is not) or invalid.
export type ImportState = 'ok' | 'needs_rebuild' | 'invalid'

export type WorkspaceFile = {
  path: string
  kind: FileKind
  reason?: string
  // source: detected format ("" if unrecognised) and size in bytes.
  format?: string
  size?: number
  // import: the cohort the spec builds and its state.
  target?: string
  state?: ImportState
  // cohort: the import spec that built it (offer Rebuild).
  spec?: string
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

export type PreviewVector = {
  members: string[]
  means?: (number | null)[] | null
  element_n?: number[]
  n?: number
  n_null?: number
}

export type PreviewProbe = {
  node: string
  kind: string
  reason?: string
  rows?: { total: number; filtered: number }
  filter?: { n_in: number; n_out: number; n_null_input: number }
  stats?: PreviewStats
  // Vector probes: per-member means and answered counts, member order.
  vector?: PreviewVector
  table?: { rows: Record<string, unknown>[]; total_rows: number; truncated?: boolean }
  component?: unknown
  facet?: unknown
  result?: unknown
  // A grouped test, matrix or post-test: its entries, one per group (or
  // partition) in Data row order, capped; results_total counts them all.
  results?: unknown[]
  results_total?: number
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

// RunResult is POST /api/run: one full run of the in-memory document.
// text is the envelope exactly as `pulse api <verb> -r <file> --json`
// prints it (and as Save writes it); ok is false when it carries errors.
// out_dir/out_name are where Save writes by default (the casebook's
// <case>/out/<request name>.json).
export type RunResult = {
  run_id: string
  root: string
  path: string
  elapsed_ms: number
  ok: boolean
  out_dir: string
  out_name: string
  text: string
}

// ApiCallError is a failed API call with the server's error code (e.g.
// "exists" for a Save that would overwrite).
export class ApiCallError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(`${code}: ${message}`)
    this.name = 'ApiCallError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function postJSON<T>(url: string, body: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal })
  const out: unknown = await res.json()
  if (!res.ok || isApiError(out)) {
    if (isApiError(out)) throw new ApiCallError(res.status, out.error.code, out.error.message, out.error.details)
    throw new ApiCallError(res.status, 'http_error', `HTTP ${res.status}`)
  }
  return out as T
}

// postRun runs the in-memory document (emitModelText, spliced in
// verbatim) with its root's engine call. Aborting signal cancels the run
// on the server; a newer run of the same file from this page supersedes
// an in-flight one.
export function postRun(path: string, requestText: string, signal?: AbortSignal): Promise<RunResult> {
  return postJSON<RunResult>(
    '/api/run',
    `{"path":${JSON.stringify(path)},"client":${JSON.stringify(PREVIEW_CLIENT)},"request":${requestText}}`,
    signal,
  )
}

export type SavedRun = { path: string; bytes: number; overwritten: boolean }

// saveRun writes a run's envelope into its request's out/ directory as
// name (default: the derived name). Without overwrite an existing file
// is refused with ApiCallError code "exists".
export function saveRun(runId: string, name: string, overwrite: boolean, signal?: AbortSignal): Promise<SavedRun> {
  return postJSON<SavedRun>('/api/run/save', JSON.stringify({ run_id: runId, name, overwrite }), signal)
}

// GitStatus is /api/status `git`: whether the workspace is kept in git
// (studio writes auto-commit) and, when not, why.
export type GitStatus = {
  available: boolean
  enabled: boolean
  repo_root?: string
  prefix?: string
  initialized?: boolean
  reason?: string
}

export function getStatus(signal?: AbortSignal): Promise<{ git: GitStatus }> {
  return getJSON<{ git: GitStatus }>('/api/status', signal)
}

// HistoryCommit is one commit touching a file (newest first); time is the
// author date in RFC 3339.
export type HistoryCommit = { rev: string; short: string; time: string; author: string; email: string; message: string }

export function getHistory(path: string, signal?: AbortSignal): Promise<{ path: string; commits: HistoryCommit[] }> {
  return getJSON(`/api/history?path=${encodeURIComponent(path)}`, signal)
}

// getHistoryFile is the file's text at rev (404 not_found when it did not
// exist then).
export function getHistoryFile(path: string, rev: string, signal?: AbortSignal): Promise<{ path: string; rev: string; text: string }> {
  return getJSON(`/api/history/file?path=${encodeURIComponent(path)}&rev=${encodeURIComponent(rev)}`, signal)
}

// Restored is POST /api/history/restore: the file as now on disk (GET
// /api/file shape) and the restore commit (absent when nothing changed).
export type Restored = FileContent & { rev: string; commit?: HistoryCommit }

export function restoreHistory(path: string, rev: string, signal?: AbortSignal): Promise<Restored> {
  return postJSON<Restored>('/api/history/restore', JSON.stringify({ path, rev }), signal)
}

// ---------------------------------------------------------------- import (G1)

// SchemaField is one entry of a schema document, the format `pulse
// import schema-template` writes. precision/scale apply to decimal128.
export type SchemaField = {
  name: string
  type: string
  description: string
  nullable: boolean
  precision?: number
  scale?: number
}

export type GroupDecl = { key?: string[]; members: string[] }

// ImportOptions is the options object of predict/import requests (also
// stored in import specs). Only the options the wizard edits are named.
export type ImportOptions = {
  sheet?: string
  sample_rows?: number
  float_width?: 'f64' | 'f32'
  overrides?: Record<string, string>
  set_delimiters?: Record<string, string>
  source_tz?: string
  ignore_extra?: boolean
  groups?: GroupDecl[]
  suggest_groups?: boolean
  [key: string]: unknown
}

export type UploadedSource = {
  path: string
  name: string
  size: number
  sha256: string
  format: string
  sheets?: string[]
  existing?: boolean
}

// uploadSource posts a file to /api/sources (multipart, part `file`)
// with upload progress (fetch has none, hence XHR). Errors are
// ApiCallError with the server's code.
export function uploadSource(
  file: Blob & { name?: string },
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<UploadedSource> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/sources')
    xhr.responseType = 'json'
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size)
    xhr.onload = () => {
      const out: unknown = xhr.response
      if (xhr.status >= 200 && xhr.status < 300 && !isApiError(out)) return resolve(out as UploadedSource)
      if (isApiError(out)) return reject(new ApiCallError(xhr.status, out.error.code, out.error.message, out.error.details))
      reject(new ApiCallError(xhr.status, 'http_error', `HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new ApiCallError(0, 'network', 'upload failed'))
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    const form = new FormData()
    form.append('file', file, file.name ?? 'upload')
    xhr.send(form)
  })
}

export type ColumnStats = {
  sampled: number
  nulls: number
  null_pct: number
  distinct: number
  distinct_capped?: boolean
  min?: number
  max?: number
}

export type PredictColumn = {
  name: string
  index: number
  included: boolean
  generated?: boolean
  type?: string
  nullable?: boolean
  description?: string
  precision?: number
  scale?: number
  stats?: ColumnStats
  samples: (string | null)[]
  warnings: string[]
}

export type CodedWarning = { code: string; message: string; details?: Record<string, unknown>; column?: string }

export type MatchDiff = { added: string[]; missing: string[]; retyped: { name: string; saved: string; input: string }[] }

export type MergedField = SchemaField & { new?: boolean }

// SchemaMatch is a saved schema ranked against the source's columns.
export type SchemaMatch = {
  name: string
  path: string
  score: number
  exact: boolean
  suggest: boolean
  diff: MatchDiff
  merged: MergedField[]
}

export type GroupCandidate = {
  label: string
  key: string[]
  members: string[]
  declaration: string
  suggested: boolean
  overlaps_with?: string
}

export type ImportPredict = {
  source: string
  format: string
  sheet?: string
  sheets?: string[]
  valid: boolean
  refusal?: CodedWarning
  header: string[]
  rows: (string | null)[][]
  sample: { rows: number; more: boolean; sample_rows: number }
  estimated_rows: number
  columns: PredictColumn[]
  schema: SchemaField[]
  schema_ref?: { ref?: string; path?: string; sha256?: string }
  warnings: { column: string; message: string }[]
  coded_warnings: CodedWarning[]
  group_candidates?: { candidates: GroupCandidate[]; suggested: string[] }
  matches: SchemaMatch[]
  field_types: string[]
  options: ImportOptions
}

// PredictBody is POST /api/import/predict: schema is a saved schema's
// name, an inline document, or absent (infer).
export type PredictBody = {
  source: string
  schema?: string | SchemaField[]
  overrides?: Record<string, string>
  options?: ImportOptions
  preview_rows?: number
}

export function predictImport(body: PredictBody, signal?: AbortSignal): Promise<ImportPredict> {
  return postJSON<ImportPredict>('/api/import/predict', JSON.stringify(body), signal)
}

export type SavedSchemaInfo = {
  name: string
  path: string
  sha256: string
  fields: number
  fingerprint: { name: string; type: string }[]
  invalid?: string
}

export function listSchemas(signal?: AbortSignal): Promise<{ schemas: SavedSchemaInfo[]; field_types: string[] }> {
  return getJSON('/api/schemas', signal)
}

export type SavedSchema = {
  name: string
  path: string
  sha256: string
  text: string
  created: boolean
  commit?: HistoryCommit
}

// saveSchema writes schemas/<name>.schema.json. An existing schema is
// refused with ApiCallError code "exists" (details.text = the file now)
// unless overwrite.
export function saveSchema(name: string, schema: SchemaField[], overwrite: boolean, signal?: AbortSignal): Promise<SavedSchema> {
  return postJSON<SavedSchema>('/api/schemas', JSON.stringify({ name, schema, overwrite }), signal)
}

export type ImportReport = {
  rows_imported: number
  row_error_count: number
  row_errors: { row: number; message: string; code?: string }[]
  promoted_fields: string[]
  elided_constants?: string[]
  warnings: CodedWarning[]
  schema: SchemaField[]
  cohort_bytes: number
  elapsed_ms: number
}

export type ImportSpecDoc = {
  version: number
  target: string
  source: { path: string; sha256: string; size: number; format: string }
  schema?: { ref?: string; path?: string; sha256?: string; inline?: SchemaField[] }
  options: ImportOptions
  last_import?: {
    at: string
    pulse_version: string
    rows_imported: number
    row_errors: number
    warnings: number
    fields: number
    promoted_fields?: string[]
    cohort_bytes?: number
  }
}

export type ImportResult = {
  target: string
  spec: string
  spec_doc: ImportSpecDoc
  report: ImportReport
  file: WorkspaceFile
  commit?: HistoryCommit
  source_changed?: boolean
  schema_changed?: boolean
}

export type ImportBody = {
  source: string
  schema?: string | SchemaField[]
  options?: ImportOptions
  target: string
  overwrite?: boolean
}

export function runImport(body: ImportBody, signal?: AbortSignal): Promise<ImportResult> {
  return postJSON<ImportResult>('/api/import', JSON.stringify(body), signal)
}

// rebuildImport re-runs an import spec. A changed source is refused
// (ApiCallError source_changed) unless force; a missing one is
// source_missing.
export function rebuildImport(spec: string, force: boolean, signal?: AbortSignal): Promise<ImportResult> {
  return postJSON<ImportResult>('/api/import/rebuild', JSON.stringify({ spec, force }), signal)
}
