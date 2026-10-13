// ExportDialog exports a cohort (X1): pick a format, the fields, the
// format's own options (rendered from the server's descriptors), a time
// zone and label bindings where the format takes them, and a download
// file name. A debounced Pulse preflight shows rows, warnings and any
// refusal before Export is allowed. Exports are never stored: Export
// streams the file and hands it to the browser as a download.
import { useEffect, useMemo, useState } from 'react'
import {
  getExportFormats,
  inspectCohort,
  predictExport,
  runExport,
  saveDownload,
  type CohortField,
  type ExportCommon,
  type ExportFormat,
  type ExportOptionValue,
  type ExportPredict,
  type ExportResult,
} from '../api.ts'
import { formatBytes, formatCount } from '../importer/format.ts'
import {
  defaultName,
  exportBody,
  filterFields,
  optionError,
  optionsFor,
  recall,
  remember,
  setAll,
  swapExtension,
  type LabelChoice,
  type OptionValues,
} from './exportForm.ts'
import { ExportOptionFields } from './OptionFields.tsx'
import '../importer/import.css'
import './export.css'

type Props = {
  cohort: string
  onClose: () => void
}

type Loaded = { formats: ExportFormat[]; common: ExportCommon; fields: CohortField[] }

export function ExportDialog({ cohort, onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    Promise.all([getExportFormats(ctl.signal), inspectCohort(cohort, ctl.signal)])
      .then(([f, insp]) => setLoaded({ formats: f.formats, common: f.common, fields: insp.fields }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [cohort])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="export-dialog" role="dialog" aria-modal="true" aria-label={`Export ${cohort}`} data-testid="export-dialog" data-cohort={cohort}>
        <header className="export-head">
          <h2>
            Export <span className="mono">{cohort}</span>
          </h2>
          <button type="button" className="export-close" aria-label="Close" onClick={onClose} data-testid="export-close">
            ×
          </button>
        </header>
        {error && <p className="err">{error}</p>}
        {!loaded && !error && <p className="muted">Loading…</p>}
        {loaded && <ExportForm cohort={cohort} {...loaded} />}
      </section>
    </div>
  )
}

type FormProps = Loaded & { cohort: string }

type PredictState = { key: string; data?: ExportPredict; error?: string }
type RunState =
  | { status: 'idle' }
  | { status: 'running'; ctl: AbortController }
  | { status: 'done'; result: ExportResult; url: string }
  | { status: 'error'; error: string }

function ExportForm({ cohort, formats, common, fields }: FormProps) {
  const allFields = useMemo(() => fields.map((f) => f.name), [fields])
  const [initial] = useState(() => {
    const r = recall(cohort)
    const format = formats.find((f) => f.id === r?.format) ?? formats[0]
    const values: Record<string, OptionValues> = {}
    for (const f of formats) values[f.id] = optionsFor(f, r?.options[f.id] as Record<string, unknown> | undefined)
    return { format, values, timeZone: r?.timeZone ?? '' }
  })
  const [formatId, setFormatId] = useState(initial.format.id)
  const [values, setValues] = useState(initial.values)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(allFields))
  const [query, setQuery] = useState('')
  const [timeZone, setTimeZone] = useState(initial.timeZone)
  const [labels, setLabels] = useState<Record<string, LabelChoice>>({})
  const [name, setName] = useState(() => defaultName(cohort, initial.format))
  const [predict, setPredict] = useState<PredictState>({ key: '' })
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  // The last export's object URL ("Download again") is released when
  // replaced or when the dialog closes.
  const doneUrl = run.status === 'done' ? run.url : null
  useEffect(() => {
    if (doneUrl === null) return
    return () => URL.revokeObjectURL(doneUrl)
  }, [doneUrl])

  const format = formats.find((f) => f.id === formatId) ?? formats[0]
  const opts = values[format.id]
  const optErrors = format.options.some((o) => optionError(o, opts[o.key]) !== null)
  const noFields = format.supports.fields && selected.size === 0
  const body = exportBody(cohort, allFields, { format, options: opts, selected, timeZone, labels, name })
  const bodyText = optErrors || noFields ? '' : JSON.stringify(body)
  const bodyKey = bodyText

  // Debounced preflight of the current settings.
  useEffect(() => {
    if (bodyKey === '') return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      predictExport(JSON.parse(bodyKey), ctl.signal)
        .then((data) => setPredict({ key: bodyKey, data }))
        .catch((e: unknown) => {
          if (!ctl.signal.aborted) setPredict({ key: bodyKey, error: e instanceof Error ? e.message : String(e) })
        })
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [bodyKey])

  const current = bodyKey !== '' && predict.key === bodyKey ? predict : null
  const pre = current?.data
  const running = run.status === 'running'
  const canExport = !running && pre?.valid === true

  const changeFormat = (id: string) => {
    const next = formats.find((f) => f.id === id)
    if (!next) return
    setName((n) => swapExtension(n, format, next))
    setFormatId(id)
    setRun({ status: 'idle' })
  }
  const setOption = (key: string, v: ExportOptionValue) => setValues((all) => ({ ...all, [format.id]: { ...all[format.id], [key]: v } }))

  const doExport = () => {
    const ctl = new AbortController()
    setRun({ status: 'running', ctl })
    runExport(body, ctl.signal)
      .then(({ result, file }) => {
        const url = URL.createObjectURL(file)
        saveDownload(url, result.name)
        setRun({ status: 'done', result, url })
        remember(cohort, format.id, opts, timeZone)
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return setRun({ status: 'idle' })
        setRun({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      })
  }

  const shown = filterFields(allFields, query)
  const categorical = fields.filter((f) => f.categorical && selected.has(f.name))
  const tables = pre?.label_tables ?? []

  return (
    <div className="export-body">
      <div className="export-section">
        <label className="export-row">
          <span className="export-label">Format</span>
          <select value={format.id} onChange={(e) => changeFormat(e.target.value)} data-testid="export-format">
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title} ({f.extension})
              </option>
            ))}
          </select>
        </label>
        {format.help && <p className="opt-help">{format.help}</p>}
      </div>

      {format.supports.fields && (
        <fieldset className="export-section export-fields" data-testid="export-fields">
          <legend>
            Fields{' '}
            <span className="muted" data-testid="export-field-count">
              {selected.size} of {allFields.length}
            </span>
          </legend>
          <div className="export-field-tools">
            <input
              type="search"
              placeholder="Filter fields"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="export-field-filter"
              aria-label="Filter fields"
            />
            <button type="button" onClick={() => setSelected(setAll(selected, shown, true))} data-testid="export-fields-all">
              All
            </button>
            <button type="button" onClick={() => setSelected(setAll(selected, shown, false))} data-testid="export-fields-none">
              None
            </button>
          </div>
          <ul className="export-field-list">
            {shown.map((f) => (
              <li key={f}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(f)}
                    data-testid="export-field"
                    data-field={f}
                    onChange={(e) => setSelected(setAll(selected, [f], e.target.checked))}
                  />
                  <span className="mono">{f}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="opt-help">{common.fields}</p>
          {noFields && <p className="err">Check at least one field.</p>}
        </fieldset>
      )}

      {format.options.length > 0 && (
        <div className="export-section">
          <h3>{format.title} options</h3>
          <ExportOptionFields options={format.options} values={opts} onChange={setOption} />
        </div>
      )}

      {format.supports.time_zone && (
        <div className="export-section">
          <label className="export-row">
            <span className="export-label">Time zone</span>
            <input
              type="text"
              value={timeZone}
              placeholder="UTC"
              spellCheck={false}
              onChange={(e) => setTimeZone(e.target.value)}
              data-testid="export-tz"
            />
          </label>
          <p className="opt-help">
            {common.time_zone}
            {format.utc_only && <strong> {format.title} writes UTC only: any other zone is refused.</strong>}
          </p>
        </div>
      )}

      {format.supports.labels && (
        <div className="export-section" data-testid="export-labels">
          <h3>Labels</h3>
          {tables.length === 0 ? (
            <p className="opt-help">No label tables serve this cohort. Add JSON label tables to a labels/ directory beside it (or above it) to translate categorical codes.</p>
          ) : categorical.length === 0 ? (
            <p className="opt-help">No categorical field is checked.</p>
          ) : (
            <>
              <table className="export-label-table">
                <tbody>
                  {categorical.map((f) => {
                    const c = labels[f.name] ?? { table: '', mode: 'replace' }
                    const set = (next: Partial<LabelChoice>) => setLabels((all) => ({ ...all, [f.name]: { ...c, ...next } }))
                    return (
                      <tr key={f.name}>
                        <td className="mono">{f.name}</td>
                        <td>
                          <select value={c.table} onChange={(e) => set({ table: e.target.value })} data-testid={`export-label-${f.name}`} aria-label={`Label table for ${f.name}`}>
                            <option value="">no labels</option>
                            {tables.map((t) => (
                              <option key={t.name} value={t.name}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select value={c.mode} disabled={c.table === ''} onChange={(e) => set({ mode: e.target.value as LabelChoice['mode'] })} aria-label={`Label mode for ${f.name}`}>
                            {common.label_modes.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="opt-help">{common.labels}</p>
            </>
          )}
        </div>
      )}

      <div className="export-section">
        <label className="export-row">
          <span className="export-label">File name</span>
          <input type="text" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} data-testid="export-name" />
        </label>
        {pre && (
          <p className="opt-help">
            Downloads <span className="mono" data-testid="export-path">{pre.name}</span>. Exports are not stored in the library: export again whenever you need the file.
          </p>
        )}
      </div>

      <Preflight state={bodyKey === '' ? 'blocked' : current ? (current.error ? 'error' : pre?.valid ? 'valid' : 'refused') : 'checking'} predict={current} format={format} />

      <div className="export-actions">
        <button type="button" className="primary" disabled={!canExport} onClick={doExport} data-testid="export-run">
          {running ? 'Exporting…' : 'Export'}
        </button>
        {running && (
          <button type="button" onClick={() => run.ctl.abort()} data-testid="export-cancel">
            Cancel
          </button>
        )}
      </div>
      {run.status === 'error' && (
        <p className="notice error" data-testid="export-error">
          {run.error}
        </p>
      )}
      {run.status === 'done' && <ExportResultView result={run.result} url={run.url} />}
    </div>
  )
}

function Preflight({ state, predict, format }: { state: string; predict: PredictState | null; format: ExportFormat }) {
  const d = predict?.data
  return (
    <div className={'export-preflight notice ' + (state === 'refused' || state === 'error' ? 'error' : state === 'valid' ? 'info' : '')} data-testid="export-preflight" data-state={state}>
      {state === 'blocked' && <p className="muted">Fix the settings above to check the export.</p>}
      {state === 'checking' && <p className="muted">Checking…</p>}
      {predict?.error && <p className="err">{predict.error}</p>}
      {d && (
        <>
          <p>
            <span data-testid="export-rows">{formatCount(d.rows)}</span> rows
            {format.supports.fields && <> · {d.exported_fields} fields</>} · cohort {formatBytes(d.cohort_bytes)}
          </p>
          {d.refusal && (
            <p className="err" data-testid="export-refusal">
              <span className="mono">{d.refusal.code}</span>: {d.refusal.message}
            </p>
          )}
          {d.warnings.length > 0 && <Warnings list={d.warnings} testid="export-warnings" />}
        </>
      )}
    </div>
  )
}

function Warnings({ list, testid }: { list: { code: string; message: string }[]; testid: string }) {
  return (
    <ul className="report-list" data-testid={testid}>
      {list.map((w, i) => (
        <li key={i} className="warn">
          <span className="mono">{w.code}</span>: {w.message}
        </li>
      ))}
    </ul>
  )
}

function ExportResultView({ result, url }: { result: ExportResult; url: string }) {
  const r = result.report
  return (
    <section className="notice ok export-result" data-testid="export-result">
      <p>
        <strong>Exported</strong> <span className="mono">{result.name}</span>
      </p>
      <dl className="report-figures">
        <div>
          <dt>Rows</dt>
          <dd data-testid="export-result-rows">{formatCount(r.rows)}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(r.bytes)}</dd>
        </div>
        {result.transfer && (
          <div>
            <dt>Ratio</dt>
            <dd>{result.transfer.ratio.toFixed(1)}×</dd>
          </div>
        )}
        <div>
          <dt>Time</dt>
          <dd>{r.elapsed_ms} ms</dd>
        </div>
      </dl>
      {r.row_error_count > 0 && <p className="warn">{formatCount(r.row_error_count)} rows could not be exported.</p>}
      {r.warnings.length > 0 && <Warnings list={r.warnings} testid="export-result-warnings" />}
      <p>
        <a className="export-download" href={url} download={result.name} data-testid="export-download">
          Download {result.name} again
        </a>
      </p>
    </section>
  )
}
