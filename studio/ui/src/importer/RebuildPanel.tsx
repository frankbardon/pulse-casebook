import { useState } from 'react'
import { ApiCallError, rebuildImport, uploadSource, type ImportResult, type ImportSpecDoc } from '../api.ts'
import { formatBytes } from './format.ts'
import { ImportReportView } from './report.tsx'

type Props = {
  specPath: string
  spec: ImportSpecDoc
  // The workspace directory (for "put the file at ..." advice).
  dir: string
  onRebuilt: (r: ImportResult) => void
  // Opens the import wizard on the spec's source, its saved schema and
  // target, to review the schema against changed data.
  onRecheck: () => void
}

type Changed = { expected_size?: number; actual_size?: number; expected_sha256?: string; actual_sha256?: string }

type State =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'changed'; details: Changed }
  | { phase: 'missing'; uploadError?: string; uploading?: boolean }
  | { phase: 'error'; message: string }
  | { phase: 'done'; result: ImportResult }

// RebuildPanel re-runs an import spec. A changed source is not rebuilt
// silently: the user re-checks the schema in the wizard or forces it. A
// missing source says where the file belongs and takes it again.
export function RebuildPanel({ specPath, spec, dir, onRebuilt, onRecheck }: Props) {
  const [st, setSt] = useState<State>({ phase: 'idle' })

  const rebuild = (force: boolean) => {
    setSt({ phase: 'running' })
    rebuildImport(specPath, force)
      .then((r) => {
        setSt({ phase: 'done', result: r })
        onRebuilt(r)
      })
      .catch((e: unknown) => {
        if (e instanceof ApiCallError && e.code === 'source_changed') return setSt({ phase: 'changed', details: (e.details ?? {}) as Changed })
        if (e instanceof ApiCallError && e.code === 'source_missing') return setSt({ phase: 'missing' })
        setSt({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
      })
  }

  const putBack = (file: File) => {
    setSt({ phase: 'missing', uploading: true })
    uploadSource(file)
      .then((up) => {
        if (up.path !== spec.source.path) {
          setSt({
            phase: 'missing',
            uploadError: `The file was stored as ${up.path}, not ${spec.source.path} (a file with that name is already there). Import it with Import data instead.`,
          })
          return
        }
        rebuild(false)
      })
      .catch((e: unknown) => setSt({ phase: 'missing', uploadError: e instanceof Error ? e.message : String(e) }))
  }

  return (
    <div className="rebuild" data-testid="rebuild-panel" data-phase={st.phase}>
      <div className="rebuild-row">
        <button type="button" className="primary" disabled={st.phase === 'running'} onClick={() => rebuild(false)} data-testid="rebuild">
          {st.phase === 'running' ? 'Rebuilding…' : 'Rebuild cohort'}
        </button>
        <span className="muted">Re-imports {spec.source.path} with the saved settings.</span>
      </div>
      {st.phase === 'changed' && (
        <div className="notice warn" data-testid="rebuild-changed">
          <p>
            <strong>The source file changed</strong> since this cohort was imported
            {st.details.expected_size !== undefined && st.details.actual_size !== undefined && (
              <>
                {' '}
                ({formatBytes(st.details.expected_size)} → {formatBytes(st.details.actual_size)})
              </>
            )}
            . New or retyped columns may not fit the saved schema.
          </p>
          <div className="rebuild-row">
            <button type="button" className="primary" onClick={onRecheck} data-testid="rebuild-recheck">
              Re-check schema
            </button>
            <button type="button" onClick={() => rebuild(true)} data-testid="rebuild-force">
              Rebuild anyway
            </button>
          </div>
        </div>
      )}
      {st.phase === 'missing' && (
        <div className="notice warn" data-testid="rebuild-missing">
          <p>
            <strong>The source file is missing.</strong> Uploaded sources are not kept in git, so a fresh checkout has none. Put the
            original file back at this path inside the workspace folder{dir && <> ({dir})</>}:
          </p>
          <code className="path">{spec.source.path}</code>
          <p className="muted">
            (sha256 {spec.source.sha256.slice(0, 12)}…, {formatBytes(spec.source.size)}), then rebuild, or choose it here:
          </p>
          <label className="file-pick">
            <input
              type="file"
              disabled={st.uploading}
              data-testid="rebuild-upload"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) putBack(f)
              }}
            />
          </label>
          {st.uploading && <p className="muted">Uploading…</p>}
          {st.uploadError && <p className="err">{st.uploadError}</p>}
        </div>
      )}
      {st.phase === 'error' && (
        <p className="err" data-testid="rebuild-error">
          {st.message}
        </p>
      )}
      {st.phase === 'done' && (
        <div className="notice ok" data-testid="rebuild-done">
          <p>
            Rebuilt {st.result.target}.{st.result.source_changed && ' The new source hash is recorded.'}
            {st.result.schema_changed && ' The saved schema changed since the last import; its current version was used.'}
          </p>
          <ImportReportView report={st.result.report} />
        </div>
      )}
    </div>
  )
}
