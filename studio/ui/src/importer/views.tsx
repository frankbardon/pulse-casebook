// Views for the Cohorts area's files: a cohort (its fields, the import
// spec that built it, Rebuild, Export, New analysis, Make global), an
// import spec, and a saved schema.
import { useEffect, useState } from 'react'
import {
  inspectCohort,
  readFile,
  type Area,
  type CohortInspect,
  type ImportResult,
  type ImportSpecDoc,
  type SchemaField,
  type WorkspaceFile,
} from '../api.ts'
import { commitTime } from '../history.ts'
import { formatBytes, formatCount } from './format.ts'
import { parseSavedSchema } from './rename.ts'
import { RebuildPanel } from './RebuildPanel.tsx'
import { ImportReportView } from './report.tsx'
import { FileHistory } from '../FileHistory.tsx'
import './import.css'
import { useArea } from '../area.ts'

// Recheck asks the app to open the wizard on a spec's source, schema
// and target.
export type Recheck = { source: string; schema?: string; target: string; area: Area }

type SpecState = { doc?: ImportSpecDoc; error?: string }

function useSpec(path: string | undefined, version: number): SpecState {
  const area = useArea()
  const [st, setSt] = useState<SpecState>({})
  useEffect(() => {
    if (!path) return
    const ctl = new AbortController()
    readFile(area, path, ctl.signal)
      .then((f) => setSt({ doc: JSON.parse(f.text) as ImportSpecDoc }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setSt({ error: String(e) })
      })
    return () => ctl.abort()
  }, [area, path, version])
  return path ? st : {}
}

function recheckOf(doc: ImportSpecDoc, area: Area): Recheck {
  // A saved schema is preferred by path (a global one is "_global/...").
  return { source: doc.source.path, schema: doc.schema?.path ?? doc.schema?.ref, target: doc.target, area }
}

// SpecSummary is one import spec in a few lines.
function SpecSummary({ doc, path }: { doc: ImportSpecDoc; path: string }) {
  const schema = doc.schema?.ref ? `saved schema ${doc.schema.ref}` : doc.schema?.inline ? 'an inline schema' : 'an inferred schema'
  const li = doc.last_import
  return (
    <dl className="spec-summary" data-testid="spec-summary">
      <div>
        <dt>Source</dt>
        <dd className="mono">
          {doc.source.path} <span className="muted">({doc.source.format}, {formatBytes(doc.source.size)})</span>
        </dd>
      </div>
      <div>
        <dt>Schema</dt>
        <dd>{schema}</dd>
      </div>
      {li && (
        <div>
          <dt>Last import</dt>
          <dd title={li.at}>
            {commitTime(li.at)}: {formatCount(li.rows_imported)} rows, {li.fields} fields
            {li.row_errors > 0 && `, ${li.row_errors} row errors`}
          </dd>
        </div>
      )}
      <div>
        <dt>Spec</dt>
        <dd className="mono muted">{path}</dd>
      </div>
    </dl>
  )
}

// ScopeInfo says where an item lives: Global, or a workspace (Local).
export type ScopeInfo = { global: boolean; workspace?: string }

function ScopeLine({ scope }: { scope?: ScopeInfo }) {
  if (!scope) return null
  return scope.global ? (
    <span className="scope-tag global" data-testid="item-scope">
      Global
    </span>
  ) : (
    <span className="scope-tag local" data-testid="item-scope" title="Local to this workspace">
      {scope.workspace}
    </span>
  )
}

function MakeGlobalButton({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null
  return (
    <button type="button" onClick={onClick} title="Move it into the global area so every workspace can use it (no way back)" data-testid="make-global">
      Make global
    </button>
  )
}

type CohortProps = {
  file: WorkspaceFile
  dir: string
  scope?: ScopeInfo
  // Offered for a workspace's local cohort only.
  onMakeGlobal?: () => void
  // The import that just created this cohort (shown as a report).
  justImported?: ImportResult
  onNewRequest: (cohort: string) => void
  onExport: (cohort: string) => void
  onFilesChanged: () => void
  onRecheck: (r: Recheck) => void
}

// CohortView inspects a cohort: record count and fields; for an
// imported cohort, its import spec and Rebuild.
export function CohortView({ file, dir, scope, onMakeGlobal, justImported, onNewRequest, onExport, onFilesChanged, onRecheck }: CohortProps) {
  const area = useArea()
  const [version, setVersion] = useState(0)
  const [inspect, setInspect] = useState<{ data?: CohortInspect; error?: string }>({})
  useEffect(() => {
    const ctl = new AbortController()
    inspectCohort(area, file.path, ctl.signal)
      .then((data) => setInspect({ data }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setInspect({ error: String(e) })
      })
    return () => ctl.abort()
  }, [area, file.path, version])
  const spec = useSpec(file.spec, version)
  const data = inspect.data

  return (
    <div className="file-view" data-testid="cohort-file" data-path={file.path}>
      <header className="file-view-head">
        <div>
          <h2>
            {file.path} <ScopeLine scope={scope} />
          </h2>
          <p className="muted">
            Cohort
            {data?.record_count !== undefined && <> · {formatCount(data.record_count)} records</>}
            {data && <> · {data.field_count} fields</>}
          </p>
        </div>
        <div className="file-view-actions">
          <button type="button" onClick={() => onExport(file.path)} data-testid="cohort-export-open">
            Export…
          </button>
          <MakeGlobalButton onClick={onMakeGlobal} />
          <button type="button" className="primary" onClick={() => onNewRequest(file.path)} data-testid="cohort-new-request">
            New analysis on this cohort
          </button>
        </div>
      </header>
      {justImported && justImported.file.path === file.path && version === 0 && (
        <section className="notice ok" data-testid="import-done">
          <p>
            <strong>Imported.</strong> {justImported.target} is ready; build an analysis on it with New analysis on this cohort.
          </p>
          <ImportReportView report={justImported.report} />
        </section>
      )}
      {file.spec && (
        <section className="file-view-section">
          <h3>Import</h3>
          {spec.error && <p className="err">{spec.error}</p>}
          {spec.doc && (
            <>
              <SpecSummary doc={spec.doc} path={file.spec} />
              <RebuildPanel
                specPath={file.spec}
                spec={spec.doc}
                dir={dir}
                onRebuilt={() => {
                  setVersion((v) => v + 1)
                  onFilesChanged()
                }}
                onRecheck={() => onRecheck(recheckOf(spec.doc!, area))}
              />
            </>
          )}
        </section>
      )}
      <section className="file-view-section">
        <h3>Fields</h3>
        {inspect.error && <p className="err">{inspect.error}</p>}
        {!data && !inspect.error && <p className="muted">Inspecting…</p>}
        {data && (
          <table className="field-table" data-testid="cohort-fields">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {data.fields.map((f) => (
                <tr key={f.name} data-field={f.name}>
                  <td className="mono">{f.name}</td>
                  <td className="mono">{f.type}</td>
                  <td className="muted">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

type SpecProps = {
  file: WorkspaceFile
  dir: string
  scope?: ScopeInfo
  onOpen: (f: WorkspaceFile) => void
  onFilesChanged: () => void
  onRecheck: (r: Recheck) => void
}

const STATE_TEXT: Record<string, string> = {
  ok: 'Cohort built',
  needs_rebuild: 'Needs rebuild: the cohort file is not on disk',
  invalid: 'Invalid spec',
}

// ImportSpecView shows an import spec (imports/<cohort>.import.json):
// what it builds from what, its state, and Rebuild.
export function ImportSpecView({ file, dir, scope, onOpen, onFilesChanged, onRecheck }: SpecProps) {
  const area = useArea()
  const [version, setVersion] = useState(0)
  const spec = useSpec(file.path, version)
  return (
    <div className="file-view" data-testid="import-spec" data-state={file.state}>
      <header className="file-view-head">
        <div>
          <h2>
            {file.target ?? file.path} <ScopeLine scope={scope} />
          </h2>
          <p className="muted">
            Import spec ·{' '}
            <span className={'state-' + (file.state ?? 'ok')} data-testid="import-state">
              {STATE_TEXT[file.state ?? 'ok']}
            </span>
            {file.reason && <> · {file.reason}</>}
          </p>
        </div>
        {file.state === 'ok' && file.target && (
          <button type="button" onClick={() => onOpen({ path: file.target!, kind: 'cohort', spec: file.path })} data-testid="spec-open-cohort">
            Open cohort
          </button>
        )}
      </header>
      {spec.error && <p className="err">{spec.error}</p>}
      {spec.doc && (
        <section className="file-view-section">
          <SpecSummary doc={spec.doc} path={file.path} />
          <RebuildPanel
            specPath={file.path}
            spec={spec.doc}
            dir={dir}
            onRebuilt={() => {
              setVersion((v) => v + 1)
              onFilesChanged()
            }}
            onRecheck={() => onRecheck(recheckOf(spec.doc!, area))}
          />
        </section>
      )}
      <FileHistory path={file.path} version={version} />
    </div>
  )
}

// SchemaView lists a saved schema's fields.
export function SchemaView({ file, scope, onMakeGlobal }: { file: WorkspaceFile; scope?: ScopeInfo; onMakeGlobal?: () => void }) {
  const area = useArea()
  const [st, setSt] = useState<{ fields?: SchemaField[]; rename?: Record<string, string>; error?: string }>({})
  useEffect(() => {
    const ctl = new AbortController()
    readFile(area, file.path, ctl.signal)
      .then((f) => setSt(parseSavedSchema(f.text)))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setSt({ error: String(e) })
      })
    return () => ctl.abort()
  }, [area, file.path])
  // PULSE-GAP(column-rename): field → the source column it was renamed from.
  const from = st.rename ? new Map(Object.entries(st.rename).map(([k, v]) => [v, k])) : null
  return (
    <div className="file-view" data-testid="schema-file">
      <header className="file-view-head">
        <div>
          <h2>
            {file.path} <ScopeLine scope={scope} />
          </h2>
          <p className="muted">
            Saved schema{st.fields && <> · {st.fields.length} fields</>}. Uploads with matching columns are offered this schema
            {scope?.global && ' in every workspace'}.
          </p>
        </div>
        <div className="file-view-actions">
          <MakeGlobalButton onClick={onMakeGlobal} />
        </div>
      </header>
      {st.error && <p className="err">{st.error}</p>}
      {st.fields && (
        <table className="field-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Nullable</th>
              <th>Description</th>
              {from && <th>Source column</th>}
            </tr>
          </thead>
          <tbody>
            {st.fields.map((f) => (
              <tr key={f.name}>
                <td className="mono">{f.name}</td>
                <td className="mono">
                  {f.type}
                  {f.type === 'decimal128' && `(${f.precision ?? 0},${f.scale ?? 0})`}
                </td>
                <td>{f.nullable ? 'yes' : ''}</td>
                <td className="muted">{f.description}</td>
                {from && (
                  <td className="mono muted" data-testid="schema-field-source">
                    {from.get(f.name) ?? ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <FileHistory path={file.path} />
    </div>
  )
}
