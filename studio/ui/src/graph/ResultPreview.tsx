import type { MouseEvent } from 'react'
import type { PreviewProbe } from '../api.ts'
import { cell } from './results.ts'
import { fmtCount } from './previews.ts'
import { usePreview } from './usePreviews.ts'

// Rows of the result table shown on the Result node.
export const RESULT_PREVIEW_ROWS = 3

// ResultPreview is a Result node's fixed-height footer (LAYOUT
// resultPreviewHeight): the row count and first rows of the frame's
// result table. It reuses the preview of the node whose probe already
// holds the whole table (resultGraph.ts previewFrom: the sort, else the
// last window, aggregation or group); no probe of its own.
export function ResultPreview({ from, columns }: { from?: string; columns: string[] }) {
  const { enabled, off, state, run } = usePreview(from ?? '')
  const onRun = (e: MouseEvent) => {
    e.stopPropagation()
    run()
  }
  let status: string
  let body
  if (from === undefined) {
    status = 'none'
    body = <div className="pv-line pv-muted">one row per filtered record</div>
  } else if (!enabled) {
    status = 'off'
    body = <div className="pv-line pv-muted">{off ?? 'no preview'}</div>
  } else if (!state) {
    status = 'idle'
    body = <div className="pv-line pv-muted">…</div>
  } else if (state.status === 'ok' || (state.status === 'loading' && state.last)) {
    const probe = state.status === 'ok' ? state.probe : state.last!
    status = state.status
    body = <Table probe={probe} columns={columns} stale={state.status === 'loading'} />
  } else if (state.status === 'loading') {
    status = 'loading'
    body = <div className="pv-line pv-muted">running…</div>
  } else {
    status = state.status
    const text = state.status === 'error' ? state.message : state.status === 'none' ? (state.reason ?? 'no preview') : state.status === 'deferred' ? 'large cohort' : state.status.replace('_', ' ')
    body = (
      <>
        <div className="pv-line pv-muted">{text}</div>
        {state.status !== 'none' && (
          <div className="pv-line">
            <button type="button" className="pv-run nodrag nopan" onClick={onRun} data-testid="preview-run">
              Run to here
            </button>
          </div>
        )}
      </>
    )
  }
  return (
    <div className={'gnode-preview result-preview pv-' + status} data-testid="result-preview" data-state={status}>
      {body}
    </div>
  )
}

function Table({ probe, columns, stale }: { probe: PreviewProbe; columns: string[]; stale: boolean }) {
  const t = probe.table
  if (!t) return <div className="pv-line pv-muted">no rows</div>
  const rows = t.rows.slice(0, RESULT_PREVIEW_ROWS)
  return (
    <div className={stale ? 'pv-stale' : undefined}>
      <div className="pv-line" data-testid="result-count">
        <span className="pv-strong">
          {fmtCount(t.total_rows)} row{t.total_rows === 1 ? '' : 's'}
        </span>
        {probe.rows && <span className="pv-muted"> of {fmtCount(probe.rows.filtered)} records</span>}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="pv-line result-row" title={columns.map((c) => `${c}: ${cell(r[c])}`).join('\n')}>
          {columns.map((c) => cell(r[c])).join(' · ')}
        </div>
      ))}
    </div>
  )
}
