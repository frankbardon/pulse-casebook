// ImportWizard turns a source file into a cohort in four steps:
// Upload → Schema (review and edit what Pulse inferred, or a saved
// schema it matched) → Save (the schema, reusable for the next upload)
// → Import (into a .pulse cohort). See schemaEdit.ts for how edits are
// lowered to Pulse requests.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiCallError,
  GLOBAL_AREA,
  listFiles,
  predictImport,
  readFile,
  runImport,
  saveSchema,
  uploadSource,
  type Area,
  type ImportPredict,
  type ImportResult,
  type PredictBody,
  type SchemaField,
  type SchemaMatch,
  type UploadedSource,
  type WorkspaceFile,
} from '../api.ts'
import { formatBytes, formatCount, formatPct } from './format.ts'
import { applyMatch, rankMatches } from './match.ts'
import { MatchPanel, type Applied } from './MatchPanel.tsx'
import {
  columnsFromPredict,
  compactNudge,
  declOf,
  DEFAULT_SETTINGS,
  excludedCount,
  filterColumns,
  groupChips,
  groupLabel,
  isEmptyDiff,
  isSetType,
  mergeRerun,
  nameFromSource,
  optionsOf,
  overridesOf,
  schemaDiff,
  schemaOf,
  setAllIncluded,
  setDecimal,
  setInclude,
  setNullable,
  setType,
  shortHint,
  typeGroups,
  typeHint,
  validName,
  type EditColumn,
  type SchemaDiff,
  type Settings,
} from './schemaEdit.ts'
// PULSE-GAP(column-rename): RenameCell + rename.ts are the rename shim's UI.
import { RenameCell, SuggestNamesButton } from './RenameCell.tsx'
import { fieldName, nameIssues, parseSavedSchema, renameDiff, renameOf, setRename, sourceNamer, suggestAll, type NameIssue } from './rename.ts'
import './import.css'

// WizardStart is what the wizard opens with: a dropped file to upload,
// or a source already in the area (optionally with the saved schema to
// prefer and the cohort to rebuild, for a re-check). area is where the
// import goes (default: the global area); it can be changed on the
// Upload step, before anything is uploaded.
export type WizardStart = { file?: File; source?: string; schema?: string; target?: string; area?: Area }

// ImportTarget is one choice of the wizard's "Import into" picker.
export type ImportTarget = { area: Area; label: string }

type Props = {
  start: WizardStart
  // Where an import may go: Global and each workspace.
  targets: ImportTarget[]
  onImported: (r: ImportResult, area: Area) => void
  onClose: () => void
}

type Step = 'upload' | 'schema' | 'save' | 'import'
const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'schema', label: 'Schema' },
  { id: 'save', label: 'Save' },
  { id: 'import', label: 'Import' },
]

type Upload = { phase: 'idle' | 'uploading' | 'error'; name?: string; loaded?: number; total?: number; error?: string }

// Saved is the saved schema the import references: ref is what the
// import sends (a local schema's name, or a global schema's
// "_global/schemas/..." path).
type Saved = { name: string; path: string; ref: string; global?: boolean; json: string }
type Conflict = { name: string; diff: SchemaDiff }

function appliedOf(m: SchemaMatch): Applied {
  return { name: m.name, path: m.path, score: m.score, exact: m.exact, global: m.scope === 'global', local: m.scope === 'local' }
}

function sourceOf(path: string): UploadedSource {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return { path, name, size: 0, sha256: '', format: '' }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function ImportWizard({ start, targets, onImported, onClose }: Props) {
  const [area, setArea] = useState<Area>(start.area ?? GLOBAL_AREA)
  const [step, setStep] = useState<Step>(start.source ? 'schema' : 'upload')
  const [upload, setUpload] = useState<Upload>(start.file ? { phase: 'uploading', name: start.file.name, loaded: 0, total: start.file.size } : { phase: 'idle' })
  const [source, setSource] = useState<UploadedSource | null>(start.source ? sourceOf(start.source) : null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [pred, setPred] = useState<ImportPredict | null>(null)
  const [cols, setCols] = useState<EditColumn[]>([])
  // What the last successful predict checked (types + settings); the
  // editor is "checked" while it is unchanged.
  const [checkedKey, setCheckedKey] = useState<string | null>(null)
  const [predicting, setPredicting] = useState(!!start.source)
  const [predictError, setPredictError] = useState<string | null>(null)
  const [applied, setApplied] = useState<Applied | null>(null)
  const [filter, setFilter] = useState('')

  const [schemaName, setSchemaName] = useState(start.schema ?? '')
  const [saved, setSaved] = useState<Saved | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  // The editor's differences from the applied global schema (Use global
  // schema refused).
  const [globalDiff, setGlobalDiff] = useState<SchemaDiff | null>(null)

  const [target, setTarget] = useState(start.target ? nameFromSource(start.target) : '')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<{ code: string; message: string } | null>(null)
  const [replace, setReplace] = useState(false)
  const [existing, setExisting] = useState<WorkspaceFile[]>([])

  const predictCtl = useRef<AbortController | null>(null)
  const tableRef = useRef<HTMLDivElement | null>(null)

  const keyOf = (c: EditColumn[], s: Settings) => JSON.stringify([overridesOf(c), optionsOf(s, c, 'predict')])

  // predict runs the Pulse dry run. base null = a fresh inference (first
  // look at a source, or another sheet); otherwise the editor's types
  // go along as overrides and the answer is merged into it. then runs
  // after a valid answer (Next's re-check).
  const predict = (src: UploadedSource, s: Settings, base: EditColumn[] | null, prefer?: string, then?: () => void) => {
    setPredicting(true)
    setPredictError(null)
    sendPredict(src, s, base, prefer, then)
  }

  // sendPredict is predict's request; it sets state only in callbacks.
  const sendPredict = (src: UploadedSource, s: Settings, base: EditColumn[] | null, prefer?: string, then?: () => void) => {
    predictCtl.current?.abort()
    const ctl = new AbortController()
    predictCtl.current = ctl
    const body: PredictBody = { source: src.path, options: optionsOf(s, base ?? [], 'predict') }
    if (base) {
      const ov = overridesOf(base)
      if (Object.keys(ov).length > 0) body.overrides = ov
    }
    predictImport(area, body, ctl.signal)
      .then((p) => {
        setPred(p)
        let next: EditColumn[]
        if (base) {
          next = mergeRerun(base, p)
        } else {
          next = columnsFromPredict(p)
          // Reuse: an exact match (or the schema asked for) is applied
          // straight away; closer looks are offered as suggestions.
          const m = (prefer && (p.matches.find((x) => x.path === prefer) ?? p.matches.find((x) => x.name === prefer))) || rankMatches(p.matches).exact
          if (m) {
            next = applyMatch(next, m)
            setApplied(appliedOf(m))
            setSchemaName(m.name)
          } else {
            setApplied(null)
            setSchemaName((n) => n || nameFromSource(src.path))
          }
          setTarget((t) => t || nameFromSource(src.path))
        }
        setCols(next)
        setCheckedKey(p.valid ? keyOf(next, s) : null)
        if (p.valid && then) then()
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setPredictError(message(e))
      })
      .finally(() => {
        if (predictCtl.current === ctl) setPredicting(false)
      })
  }

  const begin = (up: UploadedSource) => {
    setSource(up)
    const s = { ...DEFAULT_SETTINGS, ...(up.sheets && up.sheets.length > 0 && { sheet: up.sheets[0] }) }
    setSettings(s)
    setSaved(null)
    setStep('schema')
    predict(up, s, null, start.schema)
  }

  const doUpload = (file: File) => {
    setUpload({ phase: 'uploading', name: file.name, loaded: 0, total: file.size })
    sendUpload(file)
  }

  const sendUpload = (file: File) => {
    uploadSource(area, file, (loaded, total) => setUpload((u) => ({ ...u, loaded, total })))
      .then((up) => {
        setUpload({ phase: 'idle' })
        begin(up)
      })
      .catch((e: unknown) => setUpload({ phase: 'error', name: file.name, error: uploadMessage(e) }))
  }

  // Opened with a dropped file: upload it; with a workspace source:
  // predict it. (State starts in the matching phase; only callbacks set
  // state here.)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (start.file) sendUpload(start.file)
    else if (start.source) sendPredict(sourceOf(start.source), DEFAULT_SETTINGS, null, start.schema)
    // Runs once per wizard (the app remounts it for a new start).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sources already in the target area, offered on the Upload step.
  useEffect(() => {
    const ctl = new AbortController()
    listFiles(area, ctl.signal)
      .then((l) => setExisting(l.files.filter((f) => f.kind === 'source' && f.scope !== 'global')))
      .catch(() => setExisting([]))
    return () => ctl.abort()
  }, [area])

  useEffect(() => () => predictCtl.current?.abort(), [])

  const schema = useMemo(() => schemaOf(cols), [cols])
  // PULSE-GAP(column-rename): renames are part of what is saved.
  const rename = useMemo(() => renameOf(cols), [cols])
  const issues = useMemo(() => nameIssues(cols), [cols])
  const schemaJson = JSON.stringify([schema, rename ?? null])
  const savedCurrent = saved !== null && saved.json === schemaJson
  const allTyped = cols.length > 0 && cols.every((c) => !c.include || c.type !== '')
  const checked = checkedKey !== null && checkedKey === keyOf(cols, settings)
  const refusal = pred && !pred.valid ? pred.refusal : undefined

  const reachable: Record<Step, boolean> = {
    upload: true,
    schema: source !== null && (pred !== null || predicting),
    save: pred !== null && allTyped,
    import: savedCurrent,
  }
  const done: Record<Step, boolean> = {
    upload: source !== null,
    schema: pred !== null && checked && allTyped,
    save: savedCurrent,
    import: false,
  }

  const edit = (f: (c: EditColumn[]) => EditColumn[]) => setCols((c) => f(c))

  const applySuggestion = (m: SchemaMatch, dropNew = false) => {
    edit((c) => applyMatch(c, m, dropNew))
    setApplied(appliedOf(m))
    setSchemaName(m.name)
  }

  const revertMatch = () => {
    if (!pred || !source) return
    setApplied(null)
    setSchemaName(nameFromSource(source.path))
    predict(source, settings, null)
  }

  const next = () => {
    if (!source) return
    if (checked) return setStep('save')
    predict(source, settings, cols, undefined, () => setStep('save'))
  }

  const doSave = (overwrite: boolean) => {
    if (!validName(schemaName)) return
    setSaving(true)
    setSaveError(null)
    saveSchema(area, schemaName, schema, overwrite, undefined, rename) // PULSE-GAP(column-rename)
      .then((s) => {
        setSaved({ name: s.name, path: s.path, ref: s.name, json: schemaJson })
        setConflict(null)
        setStep('import')
      })
      .catch((e: unknown) => {
        if (e instanceof ApiCallError && e.code === 'exists') {
          const text = (e.details as { text?: string; path?: string } | undefined)?.text ?? '[]'
          let current: { fields: SchemaField[]; rename?: Record<string, string> } = { fields: [] }
          try {
            current = parseSavedSchema(text)
          } catch {
            // An unreadable saved file: everything shows as added.
          }
          const diff: SchemaDiff = { ...schemaDiff(current.fields, schema), renamed: renameDiff(current.rename, rename) }
          if (isEmptyDiff(diff)) {
            // Same fields: reuse the saved schema as it is.
            setSaved({ name: schemaName, path: `schemas/${schemaName}.schema.json`, ref: schemaName, json: schemaJson })
            setConflict(null)
            setStep('import')
            return
          }
          setConflict({ name: schemaName, diff })
          return
        }
        setSaveError(message(e))
      })
      .finally(() => setSaving(false))
  }

  // useGlobal reuses the applied global schema as it is, without a
  // local copy: only when the editor still equals it (else the edits are
  // saved as a local schema).
  const useGlobal = () => {
    if (!applied?.global) return
    setSaving(true)
    setSaveError(null)
    readFile(area, applied.path)
      .then((f) => {
        const current = parseSavedSchema(f.text)
        const diff: SchemaDiff = { ...schemaDiff(current.fields, schema), renamed: renameDiff(current.rename, rename) }
        if (!isEmptyDiff(diff)) {
          setGlobalDiff(diff)
          return
        }
        setGlobalDiff(null)
        setSaved({ name: applied.name, path: applied.path, ref: applied.path, global: true, json: schemaJson })
        setStep('import')
      })
      .catch((e: unknown) => setSaveError(message(e)))
      .finally(() => setSaving(false))
  }

  const doImport = () => {
    if (!source || !saved || !validName(target)) return
    setImporting(true)
    setImportError(null)
    runImport(area, { source: source.path, schema: saved.ref, options: optionsOf(settings, cols, 'import'), target, overwrite: replace })
      .then((r) => onImported(r, area))
      .catch((e: unknown) => {
        if (e instanceof ApiCallError) setImportError({ code: e.code, message: e.message.replace(/^[^:]+: /, '') })
        else setImportError({ code: 'error', message: message(e) })
      })
      .finally(() => setImporting(false))
  }

  const shown = filterColumns(cols, filter)
  const included = cols.filter((c) => c.include).length
  // PULSE-GAP(column-rename): candidates come back under renamed names.
  const chips = groupChips(pred?.group_candidates?.candidates, settings.groups, sourceNamer(pred?.options?.rename))
  const setTypes = cols.some((c) => c.include && isSetType(c.type))

  const showRefused = () => {
    if (!refusal?.column) return
    setFilter('')
    requestAnimationFrame(() => {
      tableRef.current?.querySelector(`[data-field="${CSS.escape(refusal.column!)}"]`)?.scrollIntoView({ block: 'center' })
    })
  }

  return (
    <div className="wizard" data-testid="import-wizard" data-step={step}>
      <header className="wizard-head">
        <h2>Import data</h2>
        <ol className="stepper" data-testid="stepper">
          {STEPS.map((s, i) => (
            <li key={s.id} className={(step === s.id ? 'current ' : '') + (done[s.id] ? 'done' : '')}>
              <button type="button" disabled={!reachable[s.id] || step === s.id} onClick={() => setStep(s.id)} data-step={s.id}>
                <span className="step-n">{done[s.id] && step !== s.id ? '✓' : i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="wizard-close" onClick={onClose} data-testid="import-close" aria-label="Close import">
          ×
        </button>
      </header>

      {step === 'upload' && (
        <section className="wizard-body upload-step">
          <label className="field import-into">
            Import into
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={upload.phase === 'uploading'}
              data-testid="import-into"
            >
              {targets.map((t) => (
                <option key={t.area} value={t.area}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {area === GLOBAL_AREA
              ? 'Global: the cohort is shared by every workspace.'
              : 'Local to this workspace: only its analyses see the cohort (Make global shares it later).'}
          </p>
          <p className="lede">
            Choose a data file. Pulse reads CSV, TSV, NDJSON, JSON arrays, Parquet, Arrow, Excel and SPSS. It is copied into the{' '}
            <code>sources/</code> folder of the area you import into (kept out of git) and nothing is imported until the last step.
          </p>
          <label
            className="dropzone"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) doUpload(f)
            }}
          >
            <input
              type="file"
              data-testid="import-file-input"
              disabled={upload.phase === 'uploading'}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) doUpload(f)
                e.target.value = ''
              }}
            />
            <span className="dropzone-text">Drop a file here, or click to choose one</span>
          </label>
          {upload.phase === 'uploading' && (
            <div className="upload-progress" data-testid="upload-progress">
              <span className="mono">{upload.name}</span>
              <progress max={upload.total || 1} value={upload.loaded ?? 0} />
              <span className="muted">
                {formatBytes(upload.loaded ?? 0)} of {formatBytes(upload.total ?? 0)}
              </span>
            </div>
          )}
          {upload.phase === 'error' && (
            <p className="err" data-testid="upload-error">
              {upload.name}: {upload.error}
            </p>
          )}
          {existing.length > 0 && (
            <div className="existing-sources">
              <h3>Or use a file already uploaded</h3>
              <ul>
                {existing.map((f) => (
                  <li key={f.path}>
                    <button type="button" className="link" onClick={() => begin({ ...sourceOf(f.path), format: f.format ?? '', size: f.size ?? 0 })}>
                      {f.path.replace(/^sources\//, '')}
                    </button>
                    <span className="muted">
                      {f.format || 'unknown format'}
                      {f.size !== undefined && `, ${formatBytes(f.size)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {step === 'schema' && source && (
        <section className="wizard-body schema-step">
          <div className="source-line">
            <span className="mono" data-testid="source-path">
              {source.path}
            </span>
            {pred && (
              <span className="muted" data-testid="upload-format">
                {pred.format}
                {source.size > 0 && `, ${formatBytes(source.size)}`}
                {pred.valid && `, ~${formatCount(pred.estimated_rows)} rows`}, types inferred from {formatCount(pred.sample.rows)}
                {pred.sample.more ? ' sampled' : ''} rows
              </span>
            )}
            {predicting && (
              <span className="muted" data-testid="predicting">
                Checking with Pulse…
              </span>
            )}
          </div>
          {predictError && (
            <p className="err" data-testid="predict-error">
              {predictError}
            </p>
          )}

          <MatchPanel
            matches={pred?.matches ?? []}
            applied={applied}
            onApply={applySuggestion}
            onRevert={revertMatch}
          />

          {refusal && (
            <div className="notice error" data-testid="import-refusal">
              <p>
                <strong>Pulse refused these types.</strong> {refusal.message}
              </p>
              <p className="muted mono">{refusal.code}</p>
              {refusal.column && (
                <button type="button" className="link" onClick={showRefused}>
                  Show column {refusal.column}
                </button>
              )}
            </div>
          )}
          {pred && pred.coded_warnings.length > 0 && (
            <ul className="coded-warnings">
              {pred.coded_warnings.map((w, i) => (
                <li key={i} className="warn">
                  {w.column && <span className="mono">{w.column}: </span>}
                  {w.message}
                </li>
              ))}
            </ul>
          )}

          <div className="settings" data-testid="import-settings">
            {pred?.sheets && pred.sheets.length > 1 && (
              <label>
                Sheet
                <select
                  value={settings.sheet ?? ''}
                  onChange={(e) => {
                    const s = { ...settings, sheet: e.target.value }
                    setSettings(s)
                    predict(source, s, null)
                  }}
                  data-testid="sheet-select"
                >
                  {pred.sheets.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            <label title="Width Pulse infers for decimal columns">
              Floats
              <select value={settings.floatWidth} onChange={(e) => setSettings({ ...settings, floatWidth: e.target.value as 'f64' | 'f32' })}>
                <option value="f64">f64 (15 digits)</option>
                <option value="f32">f32 (7 digits, half the size)</option>
              </select>
            </label>
            <label title="IANA zone of naive timestamps in the source, e.g. Europe/Paris (default UTC)">
              Timezone
              <input value={settings.sourceTz} placeholder="UTC" onChange={(e) => setSettings({ ...settings, sourceTz: e.target.value })} />
            </label>
            <label title={setTypes ? 'Separator between labels in multi-select (set_*) columns' : 'Applies to multi-select (set_*) columns; none yet'}>
              Set delimiter
              <input
                className="narrow"
                value={settings.setDelimiter}
                placeholder=";"
                onChange={(e) => setSettings({ ...settings, setDelimiter: e.target.value })}
              />
            </label>
            <div className="groups">
              <span className="settings-label">Groups</span>
              {settings.groups.length === 0 && chips.length === 0 && <span className="muted">none suggested</span>}
              {settings.groups.map((g, i) => (
                <span key={i} className="chip on" data-testid="group-declared">
                  {groupLabel(g)}
                  <button
                    type="button"
                    aria-label="Remove group"
                    onClick={() => setSettings({ ...settings, groups: settings.groups.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </span>
              ))}
              {chips.map((c) => (
                <button
                  key={c.label + c.declaration}
                  type="button"
                  className="chip"
                  title={`Store ${c.members.join(', ')} once per ${c.key.join(' + ') || 'record'} (Pulse suggestion)`}
                  onClick={() => setSettings({ ...settings, groups: [...settings.groups, declOf(c)] })}
                  data-testid="group-chip"
                >
                  + {groupLabel(declOf(c))}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rerun"
              disabled={predicting || !pred}
              onClick={() => predict(source, settings, cols)}
              data-testid="rerun-inference"
              title="Ask Pulse to check the sample against these types and settings"
            >
              {predicting ? 'Checking…' : 'Re-run inference with these overrides'}
            </button>
            {!checked && pred && !predicting && <span className="unchecked">Changed since the last check</span>}
          </div>

          <div className="table-tools">
            <input
              type="search"
              placeholder={`Filter ${cols.length} columns`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="column-filter"
            />
            <span className="muted" data-testid="include-count">
              {included} of {cols.length} columns included
            </span>
            <button type="button" className="link" onClick={() => edit((c) => setAllIncluded(c, true, filter ? new Set(shown.map((x) => x.name)) : undefined))}>
              Include {filter ? 'shown' : 'all'}
            </button>
            <button type="button" className="link" onClick={() => edit((c) => setAllIncluded(c, false, filter ? new Set(shown.map((x) => x.name)) : undefined))}>
              Exclude {filter ? 'shown' : 'all'}
            </button>
            {/* PULSE-GAP(column-rename) */}
            <SuggestNamesButton onClick={() => edit(suggestAll)} disabled={cols.length === 0} />
          </div>
          <div className="schema-table-wrap" ref={tableRef}>
            <table className="schema-table" data-testid="schema-table">
              <thead>
                <tr>
                  <th className="c-inc" title="Import this column">
                    Use
                  </th>
                  <th>Column</th>
                  <th>Pulse type</th>
                  <th title="Allow missing values">Nulls ok</th>
                  <th className="num">Null %</th>
                  <th>Sample values</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <ColumnRow
                    key={c.name}
                    c={c}
                    types={pred?.field_types ?? []}
                    refused={refusal?.column === fieldName(c)}
                    nameIssue={issues.get(c.name)}
                    onRename={(n) => edit((x) => setRename(x, c.name, n))}
                    onType={(t) => edit((x) => setType(x, c.name, t))}
                    onInclude={(v) => edit((x) => setInclude(x, c.name, v))}
                    onNullable={(v) => edit((x) => setNullable(x, c.name, v))}
                    onDecimal={(p, s) => edit((x) => setDecimal(x, c.name, p, s))}
                  />
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      {cols.length === 0 ? (predicting ? 'Reading the source…' : 'No columns.') : 'No column matches the filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {excludedCount(cols) > 0 && (
            <p className="muted">
              {excludedCount(cols)} column{excludedCount(cols) === 1 ? ' is' : 's are'} left out of the schema and dropped on import
              (ignore extra columns).
            </p>
          )}
          <footer className="wizard-foot">
            <button type="button" onClick={() => setStep('upload')}>
              Back
            </button>
            <span className="muted">
              {!allTyped ? 'Give every included column a type.' : issues.size > 0 ? 'Fix the column names marked above.' : ''}
            </span>
            <button
              type="button"
              className="primary"
              disabled={!allTyped || predicting || included === 0 || issues.size > 0}
              onClick={next}
              data-testid="schema-next"
            >
              {checked ? 'Next: save schema' : 'Check and continue'}
            </button>
          </footer>
        </section>
      )}

      {step === 'save' && (
        <section className="wizard-body save-step">
          {applied?.global && (
            <div className="notice info" data-testid="schema-global">
              <p>
                These types come from the <strong>global</strong> schema <code>{applied.name}</code>, shared by every workspace. Use it as
                it is, or save your edits as a schema of this {area === GLOBAL_AREA ? 'area' : 'workspace'} below.
              </p>
              {globalDiff && (
                <>
                  <p data-testid="schema-global-differs">
                    <strong>The editor differs from the global schema</strong>; save it under a name below instead:
                  </p>
                  <SchemaDiffView d={globalDiff} />
                </>
              )}
              <div className="rebuild-row">
                <button type="button" className="primary" onClick={useGlobal} disabled={saving} data-testid="schema-use-global">
                  Use global schema {applied.name}
                </button>
              </div>
            </div>
          )}
          <p className="lede">
            Save the schema so the next file with these columns is recognised and typed the same way. It is stored in{' '}
            <code>schemas/</code> {area === GLOBAL_AREA ? 'of the global area' : 'of this workspace'} and kept in git.
          </p>
          <label className="field">
            Schema name
            <input
              value={schemaName}
              onChange={(e) => {
                setSchemaName(e.target.value)
                setConflict(null)
              }}
              data-testid="schema-name"
              aria-invalid={!validName(schemaName)}
            />
          </label>
          {!validName(schemaName) && <p className="err">Use letters, digits, ".", "_" or "-", starting with a letter or digit.</p>}
          <p className="muted">
            {schema.length} fields
            {applied && !applied.global && applied.name === schemaName && ` · updates saved schema ${applied.name} if anything changed`}
          </p>
          {conflict && (
            <div className="notice warn" data-testid="schema-conflict">
              <p>
                <strong>
                  A saved schema named <code>{conflict.name}</code> already exists
                </strong>{' '}
                and differs:
              </p>
              <SchemaDiffView d={conflict.diff} />
              <div className="rebuild-row">
                <button type="button" className="primary" onClick={() => doSave(true)} disabled={saving} data-testid="schema-overwrite">
                  Update {conflict.name}
                </button>
                <span className="muted">or choose another name above.</span>
              </div>
            </div>
          )}
          {saveError && (
            <p className="err" data-testid="save-error">
              {saveError}
            </p>
          )}
          <footer className="wizard-foot">
            <button type="button" onClick={() => setStep('schema')}>
              Back
            </button>
            <span />
            <button type="button" className="primary" disabled={!validName(schemaName) || saving} onClick={() => doSave(false)} data-testid="schema-save">
              {saving ? 'Saving…' : 'Save schema'}
            </button>
          </footer>
        </section>
      )}

      {step === 'import' && source && saved && (
        <section className="wizard-body import-step">
          <dl className="spec-summary">
            <div>
              <dt>Source</dt>
              <dd className="mono">{source.path}</dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>
                <code>{saved.name}</code>
                {saved.global && (
                  <span className="scope-tag global" data-testid="import-schema-global">
                    Global
                  </span>
                )}{' '}
                ({schema.length} fields
                {excludedCount(cols) > 0 && `, ${excludedCount(cols)} source columns dropped`})
              </dd>
            </div>
          </dl>
          <label className="field">
            Cohort name
            <input
              value={target}
              onChange={(e) => {
                setTarget(e.target.value)
                setImportError(null)
              }}
              data-testid="import-target"
              aria-invalid={!validName(target)}
            />
          </label>
          <p className="muted">
            Writes <code>cohorts/{target}.pulse</code> {area === GLOBAL_AREA ? 'to the global area' : 'to this workspace'} and records how it was
            built in <code>imports/{target}.import.json</code>, so it can be rebuilt later.
          </p>
          {importError && (
            <div className="notice error" data-testid="import-error" data-code={importError.code}>
              {importError.code === 'exists' ? (
                <>
                  <p>
                    <strong>{target}.pulse already exists.</strong>
                  </p>
                  <label className="inline">
                    <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} data-testid="import-replace" />
                    Replace it
                  </label>
                </>
              ) : importError.code === 'spec_conflict' ? (
                <p>Another import already writes a cohort named {target}. Choose another name.</p>
              ) : (
                <>
                  <p>{importError.message}</p>
                  <p className="muted mono">{importError.code}</p>
                </>
              )}
            </div>
          )}
          <footer className="wizard-foot">
            <button type="button" onClick={() => setStep('save')}>
              Back
            </button>
            <span />
            <button
              type="button"
              className="primary"
              disabled={!validName(target) || importing || (importError?.code === 'exists' && !replace)}
              onClick={doImport}
              data-testid="import-run"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </footer>
        </section>
      )}
    </div>
  )
}

function uploadMessage(e: unknown): string {
  if (e instanceof ApiCallError) {
    if (e.code === 'unsupported_format') {
      const formats = (e.details as { formats?: string[] } | undefined)?.formats
      return `Pulse cannot read this file type${formats ? ` (readable: ${formats.join(', ')})` : ''}.`
    }
    if (e.code === 'too_large') return 'The file is larger than this studio accepts (see --max-upload).'
  }
  return message(e)
}

type RowProps = {
  c: EditColumn
  types: string[]
  refused: boolean
  onType: (t: string) => void
  onInclude: (v: boolean) => void
  onNullable: (v: boolean) => void
  onDecimal: (precision: number, scale: number) => void
  nameIssue?: NameIssue
  onRename: (name: string) => void
}

function ColumnRow({ c, types, refused, onType, onInclude, onNullable, onDecimal, nameIssue, onRename }: RowProps) {
  const nudge = c.include ? compactNudge(c) : null
  const samples = c.samples.filter((v): v is string => v !== null && v !== '').slice(0, 4)
  const opts = c.type !== '' && !types.includes(c.type) ? [c.type, ...types] : types
  return (
    <tr
      data-col={c.name}
      data-field={fieldName(c)}
      data-refused={refused || undefined}
      data-match={c.fromMatch}
      className={(c.include ? '' : 'excluded ') + (refused ? 'refused' : '')}
    >
      <td className="c-inc">
        <input
          type="checkbox"
          checked={c.include}
          disabled={c.index < 0}
          onChange={(e) => onInclude(e.target.checked)}
          aria-label={`Include ${c.name}`}
          data-testid="col-include"
        />
      </td>
      <td className="c-name mono">
        {/* PULSE-GAP(column-rename) */}
        <RenameCell c={c} issue={nameIssue} onRename={onRename} />
        {c.fromMatch === 'new' && (
          <span className="tag new" title="Not in the applied saved schema">
            new
          </span>
        )}
        {c.index < 0 && <span className="tag">generated</span>}
      </td>
      <td className="c-type">
        <select
          value={c.type}
          disabled={!c.include}
          onChange={(e) => onType(e.target.value)}
          aria-label={`Type of ${c.name}`}
          title={typeHint(c.type)}
          data-testid="col-type"
        >
          {c.type === '' && <option value="">choose…</option>}
          {typeGroups(opts).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => (
                <option key={t} value={t} title={typeHint(t)}>
                  {t}
                  {shortHint(t) && ` — ${shortHint(t)}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {c.type === 'decimal128' && c.include && (
          <div className="decimal">
            <label>
              precision
              <input type="number" min={1} max={38} value={c.precision ?? 18} onChange={(e) => onDecimal(Number(e.target.value), c.scale ?? 0)} />
            </label>
            <label>
              scale
              <input type="number" min={0} max={38} value={c.scale ?? 0} onChange={(e) => onDecimal(c.precision ?? 18, Number(e.target.value))} />
            </label>
          </div>
        )}
        {nudge && (
          <button type="button" className="nudge" onClick={() => onType(nudge.type)} title={nudge.reason} data-testid="col-nudge">
            → {nudge.type}? <span className="muted">{nudge.reason}</span>
          </button>
        )}
        {c.include && c.type !== c.inferred && c.inferred !== '' && <div className="hint">Pulse inferred {c.inferred}</div>}
      </td>
      <td className="c-null">
        <input type="checkbox" checked={c.nullable} disabled={!c.include} onChange={(e) => onNullable(e.target.checked)} aria-label={`${c.name} may be empty`} />
      </td>
      <td className="num">{c.stats ? formatPct(c.stats.null_pct) : ''}</td>
      <td className="c-samples mono" title={c.samples.map((v) => v ?? '∅').join('\n')}>
        {samples.join(', ')}
      </td>
      <td className="c-notes">
        {c.warnings.map((w, i) => (
          <div key={i} className={refused ? 'err' : 'warn'} data-testid="col-warning">
            {w}
          </div>
        ))}
      </td>
    </tr>
  )
}

function SchemaDiffView({ d }: { d: SchemaDiff }) {
  return (
    <ul className="schema-diff" data-testid="schema-diff">
      {d.added.map((n) => (
        <li key={'a' + n} className="add">
          + {n}
        </li>
      ))}
      {d.removed.map((n) => (
        <li key={'r' + n} className="del">
          − {n}
        </li>
      ))}
      {d.changed.map((c) => (
        <li key={'c' + c.name}>
          ~ {c.name}: {c.from} → {c.to}
        </li>
      ))}
      {d.renamed?.map((c) => (
        <li key={'n' + c.name}>
          ~ column {c.name} named {c.from} → {c.to}
        </li>
      ))}
    </ul>
  )
}
