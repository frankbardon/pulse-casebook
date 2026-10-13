import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { ApiCallError, saveRun } from '../api.ts'
import { fmtCount } from './previews.ts'
import type { ResultSection, ResultTable } from './results.ts'
import {
  RESULTS_HEIGHT,
  clampHeight,
  escapeRestores,
  heightBounds,
  readStoredHeight,
  stepHeight,
  writeStoredHeight,
  type HeightBounds,
} from './resultsSize.ts'
import { useRunHeadline, type Run } from './useRun.ts'
import { useArea } from '../area.ts'

// ResultsPanel is the bottom panel of a full run: per-response result
// tables (one tab per compose slot or chain stage), the raw envelope,
// and Save to out/. Results live only in memory until Save is clicked.
// Its top edge is a resize handle (height remembered per viewer); the
// header's Maximise fills the graph area until Restore or Esc.
export function ResultsPanel({
  run,
  onClose,
  maximised,
  onMaximise,
}: {
  run: Run
  onClose: () => void
  maximised: boolean
  onMaximise: (max: boolean) => void
}) {
  const last = run.last
  const [tab, setTab] = useState<'tables' | 'raw'>('tables')
  const [section, setSection] = useState(0)
  const sections = last?.view.sections ?? []
  const shown = sections[Math.min(section, Math.max(0, sections.length - 1))]
  const panelRef = useRef<HTMLElement>(null)
  const size = usePanelHeight(panelRef)

  useEffect(() => {
    if (!maximised) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!escapeRestores(e)) return
      e.preventDefault()
      onMaximise(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximised, onMaximise])

  return (
    <section
      ref={panelRef}
      className={'results' + (maximised ? ' max' : '') + (size.dragging ? ' resizing' : '')}
      style={maximised ? undefined : { height: size.height }}
      data-testid="results-panel"
      data-maximised={maximised ? 'true' : undefined}
      aria-label="Run results"
    >
      {!maximised && (
        <div
          className="results-grip"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize results"
          aria-valuenow={size.height}
          aria-valuemin={size.bounds.min}
          aria-valuemax={size.bounds.max}
          tabIndex={0}
          title="Drag to resize results; double-click to reset"
          data-testid="results-resize"
          onPointerDown={size.onPointerDown}
          onPointerMove={size.onPointerMove}
          onPointerUp={size.onPointerEnd}
          onPointerCancel={size.onPointerEnd}
          onLostPointerCapture={size.onPointerEnd}
          onDoubleClick={size.reset}
          onKeyDown={size.onKeyDown}
        />
      )}
      <header className="results-head">
        <strong>Results</strong>
        <RunStatus run={run} />
        <span className="results-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'tables'} className={tab === 'tables' ? 'on' : undefined} onClick={() => setTab('tables')} data-testid="results-tab-tables">
            Tables
          </button>
          <button type="button" role="tab" aria-selected={tab === 'raw'} className={tab === 'raw' ? 'on' : undefined} onClick={() => setTab('raw')} data-testid="results-tab-raw">
            Raw envelope
          </button>
        </span>
        <span className="results-spacer" />
        {last && <SaveToOut key={last.result.run_id} runId={last.result.run_id} outDir={last.result.out_dir} outName={last.result.out_name} />}
        <button
          type="button"
          className="results-icon"
          data-testid="results-maximise"
          aria-pressed={maximised}
          aria-label={maximised ? 'Restore' : 'Maximise results'}
          title={maximised ? 'Restore (Esc)' : 'Maximise results'}
          onClick={() => onMaximise(!maximised)}
        >
          <MaxIcon restore={maximised} />
        </button>
        <button type="button" className="results-icon" onClick={onClose} title="Hide results (they stay in memory)" aria-label="Hide results">
          ×
        </button>
      </header>
      <div className="results-body">
        {!last && run.phase === 'running' && <p className="muted">Running…</p>}
        {!last && run.phase !== 'running' && <p className="muted">No results yet.</p>}
        {last && tab === 'raw' && (
          <pre className="results-raw" data-testid="results-raw">
            {last.result.text}
          </pre>
        )}
        {last && tab === 'tables' && (
          <>
            <Entries kind="error" list={last.view.errors} />
            <Entries kind="warning" list={last.view.warnings} />
            {sections.length > 1 && (
              <nav className="results-sections" data-testid="results-sections">
                {sections.map((s, i) => (
                  <button key={s.id} type="button" className={s === shown ? 'on' : undefined} onClick={() => setSection(i)} data-testid="results-section">
                    {s.title}
                  </button>
                ))}
              </nav>
            )}
            {shown && <SectionView section={shown} />}
          </>
        )}
      </div>
    </section>
  )
}

// MaxIcon: one square (maximise) or two offset squares (restore).
function MaxIcon({ restore }: { restore: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      {restore ? (
        <>
          <rect x="1.5" y="3.5" width="7" height="7" />
          <path d="M3.5 3.5V1.5h7v7h-2" />
        </>
      ) : (
        <rect x="1.5" y="1.5" width="9" height="9" />
      )}
    </svg>
  )
}

// usePanelHeight is the panel's height: the viewer's remembered height,
// clamped to the room under the graph bar (re-measured whenever the graph
// area resizes). A drag writes the height straight to the DOM once per
// animation frame and commits it to state (and storage) on release, so
// the result tables never re-render mid-drag.
function usePanelHeight(ref: RefObject<HTMLElement | null>) {
  const [pref, setPref] = useState(readStoredHeight)
  const [available, setAvailable] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; y: number; h: number; next: number; frame: number } | null>(null)

  const bounds = useMemo(
    (): HeightBounds => (available > 0 ? heightBounds(available) : { min: RESULTS_HEIGHT.MIN, max: Math.max(RESULTS_HEIGHT.MIN, pref) }),
    [available, pref],
  )
  const height = clampHeight(pref, bounds)

  useLayoutEffect(() => {
    const panel = ref.current
    const parent = panel?.parentElement
    if (!panel || !parent) return
    const bar = parent.querySelector<HTMLElement>(':scope > .graph-bar')
    const measure = () => {
      const top = bar ? bar.getBoundingClientRect().bottom : parent.getBoundingClientRect().top
      setAvailable(Math.max(0, Math.floor(parent.getBoundingClientRect().bottom - top)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    if (bar) ro.observe(bar)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])

  const commit = useCallback((h: number) => {
    setPref(h)
    writeStoredHeight(h)
  }, [])

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || drag.current) return
      e.preventDefault()
      e.currentTarget.focus()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { id: e.pointerId, y: e.clientY, h: height, next: height, frame: 0 }
      setDragging(true)
    },
    [height],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      d.next = clampHeight(d.h + d.y - e.clientY, bounds)
      if (d.frame) return
      const grip = e.currentTarget
      d.frame = requestAnimationFrame(() => {
        d.frame = 0
        const panel = ref.current
        if (!panel) return
        panel.style.height = `${d.next}px`
        grip.setAttribute('aria-valuenow', String(d.next))
      })
    },
    [ref, bounds],
  )

  const onPointerEnd = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      drag.current = null
      if (d.frame) cancelAnimationFrame(d.frame)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      if (ref.current) ref.current.style.height = `${d.next}px`
      setDragging(false)
      if (d.next !== d.h) commit(d.next)
    },
    [ref, commit],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const next = stepHeight(height, e.key, e.shiftKey, bounds)
      if (next === null) return
      e.preventDefault()
      e.stopPropagation()
      commit(next)
    },
    [height, bounds, commit],
  )

  const reset = useCallback(() => commit(RESULTS_HEIGHT.DEFAULT), [commit])

  return { height, bounds, dragging, onPointerDown, onPointerMove, onPointerEnd, onKeyDown, reset }
}

function RunStatus({ run }: { run: Run }) {
  const last = run.last
  let text: string
  let cls = 'muted'
  switch (run.phase) {
    case 'running':
      text = last ? 'running… (showing the previous run)' : 'running…'
      break
    case 'cancelled':
      text = last ? 'cancelled (showing the previous run)' : 'cancelled'
      break
    case 'error':
      text = `run failed: ${run.error ?? ''}`
      cls = 'err'
      break
    default:
      if (!last) return null
      text = `${last.result.ok ? 'ok' : 'failed'} · ${fmtCount(last.result.elapsed_ms)} ms`
      if (!last.result.ok) cls = 'err'
  }
  return (
    <span className={'results-status ' + cls} data-testid="run-status" data-phase={run.phase}>
      {text}
      {run.stale && run.phase !== 'running' && <span className="results-stale"> · edited since this run</span>}
    </span>
  )
}

function Entries({ kind, list }: { kind: 'error' | 'warning'; list: { code: string; message: string }[] }) {
  if (list.length === 0) return null
  return (
    <ul className={'results-entries ' + kind} data-testid={`results-${kind}s`}>
      {list.map((e, i) => (
        <li key={i}>
          <code>{e.code}</code> {e.message}
        </li>
      ))}
    </ul>
  )
}

function SectionView({ section }: { section: ResultSection }) {
  return (
    <div className="results-section" data-testid="results-section-body" data-section={section.id}>
      {section.summary && <p className="muted">{section.summary}</p>}
      {section.tables.length === 0 && section.other.length === 0 && <p className="muted">No result tables.</p>}
      {section.tables.map((t) => (
        <TableView key={t.key} table={t} />
      ))}
      {section.other.map((o) => (
        <details key={o.title} className="results-other">
          <summary>{o.title}</summary>
          <pre>{o.json}</pre>
        </details>
      ))}
    </div>
  )
}

function TableView({ table }: { table: ResultTable }) {
  return (
    <div className="results-table" data-testid={`results-table-${table.key}`}>
      <h4>{table.title}</h4>
      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.note && <p className="muted">{table.note}</p>}
    </div>
  )
}

type SaveState = { phase: 'idle' | 'saving' | 'exists' | 'saved' | 'error'; message?: string }

// SaveToOut writes the run's envelope to <case>/out/<name>. Nothing is
// written until the button is clicked; an existing file is replaced only
// after an explicit Overwrite.
function SaveToOut({ runId, outDir, outName }: { runId: string; outDir: string; outName: string }) {
  const area = useArea()
  const [name, setName] = useState(outName)
  const [st, setSt] = useState<SaveState>({ phase: 'idle' })
  const save = async (overwrite: boolean) => {
    setSt({ phase: 'saving' })
    try {
      const res = await saveRun(area, runId, name.trim(), overwrite)
      setSt({ phase: 'saved', message: `${res.overwritten ? 'replaced' : 'saved'} ${res.path}` })
    } catch (e) {
      if (e instanceof ApiCallError && e.code === 'exists') setSt({ phase: 'exists', message: `${outDir}/${name.trim()} exists` })
      else setSt({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }
  return (
    <span className="results-save">
      <label>
        <span className="muted">{outDir}/</span>
        <input
          aria-label="Output file name"
          data-testid="save-out-name"
          value={name}
          spellCheck={false}
          onChange={(e) => {
            setName(e.target.value)
            setSt({ phase: 'idle' })
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      {st.phase === 'exists' ? (
        <>
          <span className="err" data-testid="save-out-exists">
            {st.message}
          </span>
          <button type="button" data-testid="save-out-overwrite" onClick={() => void save(true)}>
            Overwrite
          </button>
          <button type="button" onClick={() => setSt({ phase: 'idle' })}>
            Keep
          </button>
        </>
      ) : (
        <button type="button" data-testid="save-out" disabled={st.phase === 'saving' || name.trim() === ''} onClick={() => void save(false)}>
          Save to out/
        </button>
      )}
      {st.phase === 'saved' && (
        <span className="muted" data-testid="save-out-done">
          {st.message}
        </span>
      )}
      {st.phase === 'error' && <span className="err">{st.message}</span>}
    </span>
  )
}

// NodeRunHeadline is a terminal node's headline number from the latest
// full run, pinned to the node's bottom edge (absolutely positioned, so
// the node's measured size never changes).
export function NodeRunHeadline({ id }: { id: string }) {
  const { headline, stale } = useRunHeadline(id)
  if (!headline) return null
  return (
    <span
      className={'gnode-run' + (headline.tone ? ' ' + headline.tone : '') + (stale ? ' stale' : '')}
      data-testid="node-run"
      title={stale ? 'Full-run result (the analysis was edited since)' : 'Full-run result'}
    >
      {headline.text}
    </span>
  )
}
