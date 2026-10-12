import { useState } from 'react'
import { ApiCallError, saveRun } from '../api.ts'
import { fmtCount } from './previews.ts'
import type { ResultSection, ResultTable } from './results.ts'
import { useRunHeadline, type Run } from './useRun.ts'

// ResultsPanel is the bottom panel of a full run: per-response result
// tables (one tab per compose slot or chain stage), the raw envelope,
// and Save to out/. Results live only in memory until Save is clicked.
export function ResultsPanel({ run, onClose }: { run: Run; onClose: () => void }) {
  const last = run.last
  const [tab, setTab] = useState<'tables' | 'raw'>('tables')
  const [section, setSection] = useState(0)
  const sections = last?.view.sections ?? []
  const shown = sections[Math.min(section, Math.max(0, sections.length - 1))]

  return (
    <section className="results" data-testid="results-panel" aria-label="Run results">
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
        <button type="button" onClick={onClose} title="Hide results (they stay in memory)" aria-label="Hide results">
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
  const [name, setName] = useState(outName)
  const [st, setSt] = useState<SaveState>({ phase: 'idle' })
  const save = async (overwrite: boolean) => {
    setSt({ phase: 'saving' })
    try {
      const res = await saveRun(runId, name.trim(), overwrite)
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
      title={stale ? 'Full-run result (the request was edited since)' : 'Full-run result'}
    >
      {headline.text}
    </span>
  )
}
