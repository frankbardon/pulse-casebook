import { useEffect, useMemo, useRef, useState } from 'react'
import { createFile, inspectCohort, type WorkspaceFile } from './api.ts'
import { useArea } from './area.ts'
import { MODES, type ModeId } from './modes.ts'
import {
  allCohorts,
  cohortGroups,
  cohortLabel,
  folderError,
  folderOptions,
  initialState,
  isGlobalCohort,
  loadLastMode,
  MODE_GUIDE,
  modeById,
  nameError,
  nextStep,
  normFolder,
  prevStep,
  saveLastMode,
  stepError,
  STEPS,
  targetPath,
  type WizardState,
} from './newAnalysisWizard.ts'
import './exporter/export.css'
import './wizard.css'

type Props = {
  // The workspace's files (its own cohorts plus the global ones,
  // "_global/cohorts/...", and its analyses).
  files: WorkspaceFile[]
  workspaceName: string
  // The cohort to start on (e.g. "New analysis on this cohort").
  initialCohort?: string
  onCreated: (f: WorkspaceFile) => void
  onCancel: () => void
  // Cohorts › Import (there are no cohorts yet).
  onImport: () => void
}

type CohortInfo = { fields: number; rows?: number } | 'error'

// NewAnalysisWizard is New analysis: a modal in three steps. 1 Mode:
// the four modes, each with what it reads, what comes back, how it runs
// and when to use it. 2 Cohort: this workspace's own cohorts and the
// global ones. 3 Name & folder, a summary, Create: the server writes the
// file (never over an existing one) and the editor opens it.
export function NewAnalysisWizard({ files, workspaceName, initialCohort, onCreated, onCancel, onImport }: Props) {
  const area = useArea()
  const [st, setSt] = useState<WizardState>(() => initialState(files, initialCohort, loadLastMode()))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [info, setInfo] = useState<Record<string, CohortInfo>>({})
  const dialog = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)

  const cohorts = useMemo(() => allCohorts(files), [files])
  const groups = useMemo(() => cohortGroups(files, query), [files, query])
  const folders = useMemo(() => folderOptions(files), [files])
  const mode = modeById(st.mode)
  const blocked = stepError(st, files)
  const path = targetPath(st.folder, st.name, mode)
  const set = (p: Partial<WizardState>) => {
    setSt((s) => ({ ...s, ...p }))
    setError(null)
  }

  // Field and row counts, read from each cohort's header once.
  useEffect(() => {
    const ctl = new AbortController()
    for (const c of cohorts) {
      inspectCohort(area, c.path, ctl.signal)
        .then((r) => setInfo((m) => ({ ...m, [c.path]: { fields: r.field_count, rows: r.record_count } })))
        .catch(() => {
          if (!ctl.signal.aborted) setInfo((m) => ({ ...m, [c.path]: 'error' }))
        })
    }
    return () => ctl.abort()
  }, [area, cohorts])

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Tab' && dialog.current) {
        const els = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // Each step starts focused on its first control.
  useEffect(() => {
    const el = body.current?.querySelector<HTMLElement>('[data-autofocus], [aria-checked="true"], [tabindex="0"], input, select, button')
    el?.focus()
  }, [st.step])

  const go = (step: WizardState['step'] | null) => {
    if (!step) return
    setTouched(false)
    set({ step })
  }
  const create = () => {
    if (!path || !mode || !st.cohort || busy) return
    setBusy(true)
    setError(null)
    createFile(area, path, mode.root, st.cohort)
      .then((f) => onCreated({ path: f.path, kind: f.kind, reason: f.reason }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (blocked) {
      setTouched(true)
      return
    }
    const next = nextStep(st.step)
    if (next) go(next)
    else create()
  }
  const pickMode = (id: ModeId) => {
    saveLastMode(id)
    set({ mode: id })
  }
  // Arrow keys move the mode choice (a radio group).
  const modeKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const m = MODES[(i + d + MODES.length) % MODES.length]
    pickMode(m.id)
    body.current?.querySelector<HTMLElement>(`[data-mode="${m.id}"]`)?.focus()
  }

  const stepIndex = STEPS.findIndex((s) => s.id === st.step)
  const cohort = cohorts.find((c) => c.path === st.cohort)
  const nameErr = st.step === 'name' ? (folderError(st.folder) ?? nameError(st.name, st.folder, mode, files)) : null
  const showNameErr = nameErr && (touched || st.name.trim() !== '')

  let content: React.ReactNode
  if (st.step === 'mode') {
    content = (
      <>
        <p className="wiz-lead">How should this analysis run? Each mode reads, returns and runs differently.</p>
        <div className="mode-cards" role="radiogroup" aria-label="Mode" data-testid="mode-cards">
          {MODES.map((m, i) => {
            const g = MODE_GUIDE[m.id]
            const on = st.mode === m.id
            const tabbable = on || (st.mode === null && i === 0)
            return (
              <div
                key={m.id}
                role="radio"
                aria-checked={on}
                aria-label={`${m.label}: ${m.runs}`}
                tabIndex={tabbable ? 0 : -1}
                className={'mode-card' + (on ? ' on' : '')}
                data-mode={m.id}
                data-testid="mode-card"
                onClick={() => pickMode(m.id)}
                onDoubleClick={() => {
                  pickMode(m.id)
                  go('cohort')
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.preventDefault()
                    pickMode(m.id)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    pickMode(m.id)
                    go('cohort')
                  } else modeKey(e, i)
                }}
              >
                <div className="mode-card-head">
                  <ModeDiagram id={m.id} />
                  <div>
                    <h3>
                      <span className={'mode-badge mode-' + m.id}>{m.label}</span>
                    </h3>
                    <p className="mode-runs">{m.runs}</p>
                  </div>
                </div>
                <dl className="mode-facts">
                  <dt>Reads</dt>
                  <dd>{g.reads}</dd>
                  <dt>Returns</dt>
                  <dd>{g.returns}</dd>
                  <dt>Runs</dt>
                  <dd>{g.runs}</dd>
                  <dt>Use it when</dt>
                  <dd className="mode-example">“{g.example}”</dd>
                </dl>
              </div>
            )
          })}
        </div>
      </>
    )
  } else if (st.step === 'cohort') {
    content =
      cohorts.length === 0 ? (
        <div className="wiz-empty" data-testid="wizard-no-cohorts">
          <p>There are no cohorts yet. Import data first (into this workspace or Global), then start the analysis.</p>
          <button type="button" className="primary" onClick={onImport} data-testid="wizard-import">
            Go to Cohorts › Import
          </button>
        </div>
      ) : (
        <>
          <p className="wiz-lead">
            Which cohort does it read?
            {st.mode === 'composed' && ' This cohort seeds the first part; each part can use its own cohort later.'}
            {st.mode === 'chained' && ' The first step reads it; later steps read the step before.'}
          </p>
          <input
            type="search"
            className="wiz-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cohorts"
            aria-label="Search cohorts"
            data-testid="cohort-search"
          />
          <div className="cohort-choices" role="radiogroup" aria-label="Cohort" data-testid="cohort-choices">
            {groups.length === 0 && <p className="muted">No cohorts match.</p>}
            {groups.map((g) => (
              <fieldset key={g.scope} className="cohort-group" data-scope={g.scope}>
                <legend>{g.scope === 'local' ? `This workspace (${workspaceName})` : g.label}</legend>
                {g.cohorts.map((c) => {
                  const i = info[c.path]
                  return (
                    <label key={c.path} className={'cohort-choice' + (st.cohort === c.path ? ' on' : '')} data-testid="cohort-option" data-path={c.path} data-scope={g.scope}>
                      <input type="radio" name="wizard-cohort" value={c.path} checked={st.cohort === c.path} onChange={() => set({ cohort: c.path })} />
                      <span className="cohort-choice-name">{cohortLabel(c.path)}</span>
                      <span className="muted cohort-choice-info" data-testid="cohort-info">
                        {i === undefined ? '…' : i === 'error' ? 'unreadable' : `${i.fields} fields` + (i.rows !== undefined ? ` · ${i.rows.toLocaleString()} rows` : '')}
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            ))}
          </div>
        </>
      )
  } else {
    content = (
      <>
        <label className="wiz-field">
          Name
          <input
            value={st.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="my_analysis"
            data-autofocus
            aria-invalid={showNameErr ? true : undefined}
            data-testid="new-name"
          />
        </label>
        <div className="wiz-field">
          <label htmlFor="wizard-folder">Folder</label>
          <div className="wiz-folder">
            <select
              id="wizard-folder"
              value={st.newFolder ? '\u0000new' : st.folder}
              onChange={(e) => (e.target.value === '\u0000new' ? set({ newFolder: true, folder: '' }) : set({ newFolder: false, folder: e.target.value }))}
              data-testid="new-folder"
            >
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f === '' ? 'analyses/' : `analyses/${f}/`}
                </option>
              ))}
              <option value={'\u0000new'}>New folder…</option>
            </select>
            {st.newFolder && (
              <input value={st.folder} onChange={(e) => set({ folder: e.target.value })} placeholder="folder/sub" aria-label="New folder" data-testid="new-folder-input" />
            )}
          </div>
        </div>
        {showNameErr && (
          <p className="err" data-testid="new-name-error">
            {nameErr}
          </p>
        )}
        <dl className="wiz-summary" data-testid="wizard-summary">
          <dt>Mode</dt>
          <dd>
            {mode && <span className={'mode-badge mode-' + mode.id}>{mode.label}</span>} {mode?.runs}
          </dd>
          <dt>Cohort</dt>
          <dd>
            {cohort ? cohortLabel(cohort.path) : '—'} <span className="muted">({cohort && isGlobalCohort(cohort) ? 'Global' : `workspace ${workspaceName}`})</span>
          </dd>
          <dt>File</dt>
          <dd className="mono" data-testid="new-path">
            {path ?? `analyses/${normFolder(st.folder) ? normFolder(st.folder) + '/' : ''}…`}
          </dd>
        </dl>
      </>
    )
  }

  return (
    <div className="export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <section
        ref={dialog}
        className="export-dialog wiz-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        data-testid="new-analysis-wizard"
        data-step={st.step}
      >
        <header className="export-head">
          <h2 id="wizard-title">New analysis</h2>
          <ol className="wiz-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={i === stepIndex ? 'on' : i < stepIndex ? 'done' : undefined} aria-current={i === stepIndex ? 'step' : undefined}>
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>
          <button type="button" className="export-close" aria-label="Close" onClick={onCancel} disabled={busy} data-testid="wizard-cancel">
            ×
          </button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="wiz-body" ref={body}>
            {content}
            {touched && blocked && st.step !== 'name' && (
              <p className="err" data-testid="wizard-blocked">
                {blocked}
              </p>
            )}
            {error && (
              <p className="err" data-testid="new-error">
                {error}
              </p>
            )}
          </div>
          <footer className="wiz-foot">
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <span className="wiz-spacer" />
            {prevStep(st.step) && (
              <button type="button" onClick={() => go(prevStep(st.step))} disabled={busy} data-testid="wizard-back">
                Back
              </button>
            )}
            {nextStep(st.step) ? (
              <button type="submit" className="primary" disabled={!!blocked} data-testid="wizard-next">
                Next
              </button>
            ) : (
              <button type="submit" className="primary" disabled={!!blocked || busy} data-testid="new-create">
                {busy ? 'Creating…' : 'Create'}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  )
}

// ModeDiagram is a small picture of a mode: cohort → result; N cohorts
// → N results side by side; cohort → field summaries; cohort → step →
// step → result.
function ModeDiagram({ id }: { id: ModeId }) {
  const cohort = (x: number, y: number) => (
    <g key={`c${x},${y}`}>
      <ellipse cx={x + 9} cy={y + 2} rx={9} ry={2.5} className="dg-cohort" />
      <path d={`M${x} ${y + 2}v10a9 2.5 0 0 0 18 0v-10`} className="dg-cohort" />
    </g>
  )
  const box = (x: number, y: number, w = 18, h = 12, cls = 'dg-result') => <rect key={`b${x},${y}`} x={x} y={y} width={w} height={h} rx={2} className={cls} />
  const arrow = (x1: number, y: number, x2: number) => (
    <g key={`a${x1},${y}`} className="dg-arrow">
      <line x1={x1} y1={y} x2={x2 - 3} y2={y} />
      <path d={`M${x2 - 4} ${y - 3}L${x2} ${y}L${x2 - 4} ${y + 3}`} />
    </g>
  )
  let parts: React.ReactNode[]
  switch (id) {
    case 'standalone':
      parts = [cohort(8, 20), arrow(30, 27, 60), box(62, 21)]
      break
    case 'composed':
      parts = [0, 1, 2].flatMap((i) => [cohort(8, 4 + i * 17), arrow(30, 10 + i * 17, 60), box(62, 5 + i * 17, 18, 10)])
      break
    case 'faceted':
      parts = [
        cohort(8, 20),
        arrow(30, 27, 52),
        <rect key="f1" x={56} y={30} width={6} height={10} className="dg-bar" />,
        <rect key="f2" x={65} y={22} width={6} height={18} className="dg-bar" />,
        <rect key="f3" x={74} y={26} width={6} height={14} className="dg-bar" />,
        <line key="f0" x1={54} y1={40.5} x2={82} y2={40.5} className="dg-base" />,
      ]
      break
    case 'chained':
      parts = [cohort(2, 20), arrow(22, 27, 32), box(33, 22, 12, 10, 'dg-step'), arrow(46, 27, 56), box(57, 22, 12, 10, 'dg-step'), arrow(70, 27, 80), box(81, 21, 14, 12)]
      break
  }
  return (
    <svg className="mode-diagram" viewBox="0 0 96 56" width={96} height={56} aria-hidden="true" data-testid="mode-diagram">
      {parts}
    </svg>
  )
}
