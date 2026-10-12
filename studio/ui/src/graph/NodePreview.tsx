import type { MouseEvent, ReactNode } from 'react'
import type { PreviewProbe, PreviewStats } from '../api.ts'
import { fmtCount, fmtNum, fmtPct, headlines, tableSummary, type PreviewState } from './previews.ts'
import { usePreview } from './usePreviews.ts'

// NodePreview is a node's fixed-height preview footer: two lines of
// tabular numbers (or a status with a one-click run). Its height never
// changes with content, so previews arriving leave the node's measured
// size and the column layout alone.
export function NodePreview({ id, label }: { id: string; label?: string }) {
  const { enabled, off, state, run } = usePreview(id)
  const onRun = (e: MouseEvent) => {
    e.stopPropagation()
    run()
  }
  const runButton = (text: string, title?: string) => (
    <button type="button" className="pv-run nodrag nopan" onClick={onRun} data-testid="preview-run" title={title}>
      {text}
    </button>
  )
  let status: string
  let body: ReactNode
  if (!enabled) {
    status = 'off'
    body = <Line muted>{off ?? 'no preview'}</Line>
  } else if (!state) {
    status = 'idle'
    body = <Line muted>…</Line>
  } else {
    status = state.status
    body = stateBody(state, label, runButton)
  }
  return (
    <div className={'gnode-preview pv-' + status} data-testid="preview" data-state={status} title={titleOf(state)}>
      {body}
    </div>
  )
}

function stateBody(state: PreviewState, label: string | undefined, runButton: (t: string, title?: string) => ReactNode): ReactNode {
  switch (state.status) {
    case 'loading':
      return state.last ? (
        <div className="pv-stale">
          <ProbeBody probe={state.last} label={label} />
        </div>
      ) : (
        <Line muted>running…</Line>
      )
    case 'ok':
      return <ProbeBody probe={state.probe} label={label} deferred={state.deferred} runButton={runButton} />
    case 'deferred':
      return (
        <>
          <Line muted>{state.rows !== undefined ? `large cohort · ${fmtCount(state.rows)} rows` : 'deferred'}</Line>
          <Line>{runButton('Run to here')}</Line>
        </>
      )
    case 'timed_out':
      return (
        <>
          <Line muted>timed out</Line>
          <Line>{runButton('Run again')}</Line>
        </>
      )
    case 'cancelled':
      return (
        <>
          <Line muted>superseded</Line>
          <Line>{runButton('Run')}</Line>
        </>
      )
    case 'none':
      return <Line muted>{state.reason ?? 'no preview'}</Line>
    case 'error':
      return (
        <>
          <Line className="pv-err">{state.message}</Line>
          <Line>{runButton('Retry')}</Line>
        </>
      )
  }
}

function titleOf(state: PreviewState | undefined): string | undefined {
  if (!state) return undefined
  switch (state.status) {
    case 'error':
      return state.message
    case 'deferred':
      return state.reason ?? 'expensive preview on a large cohort'
    case 'none':
      return state.reason
    case 'ok':
      return state.deferred?.length ? `left out to keep it cheap: ${state.deferred.join(', ')}` : undefined
    default:
      return undefined
  }
}

function ProbeBody({
  probe,
  label,
  deferred,
  runButton,
}: {
  probe: PreviewProbe
  label?: string
  deferred?: string[]
  runButton?: (t: string, title?: string) => ReactNode
}) {
  switch (probe.kind) {
    case 'facet': {
      // A facet root's nodes: the records the facet (up to this node) counts.
      const r = probe.rows
      if (!r) return <Line muted>facet ready</Line>
      return (
        <Line>
          <span>
            {fmtCount(r.filtered)} of {fmtCount(r.total)} records
          </span>
          <span className="pv-strong">{fmtPct(r.filtered, r.total)}</span>
        </Line>
      )
    }
    case 'cohort':
      return <Line>{probe.rows ? `${fmtCount(probe.rows.total)} rows` : '–'}</Line>
    case 'filter': {
      const f = probe.filter
      if (!f) return <Line muted>no counts</Line>
      const kept = f.n_in ? Math.min(1, f.n_out / f.n_in) : 0
      return (
        <>
          <Line>
            <span>
              {fmtCount(f.n_in)} → {fmtCount(f.n_out)}
            </span>
            <span className="pv-strong">{fmtPct(f.n_out, f.n_in)} kept</span>
          </Line>
          <Line>
            <span className="pv-funnel" aria-hidden>
              <span style={{ width: `${(kept * 100).toFixed(1)}%` }} />
            </span>
            {f.n_null_input > 0 && <span className="pv-muted">null {fmtCount(f.n_null_input)}</span>}
          </Line>
        </>
      )
    }
    case 'feature':
    case 'attribute': {
      const s = probe.stats
      if (!s) return <Line muted>no stats</Line>
      const quantilesDeferred = deferred?.includes('quantiles')
      return (
        <>
          <Line>
            <QuantileStrip stats={s} />
            {quantilesDeferred && runButton ? runButton('q', 'Quantiles were left out on this large cohort: compute them') : null}
          </Line>
          <Line>
            <span>n {fmtCount(s.n)}</span>
            {s.n_null !== undefined && s.n_null > 0 && <span className="pv-muted">null {fmtCount(s.n_null)}</span>}
            <span>μ {fmtNum(s.mean)}</span>
          </Line>
        </>
      )
    }
    case 'group':
    case 'aggregation':
    case 'window':
    case 'sort': {
      const t = tableSummary(probe, label)
      return (
        <>
          <Line>
            <span className="pv-strong">{t.count}</span>
            {probe.rows && <span className="pv-muted">of {fmtCount(probe.rows.filtered)} records</span>}
          </Line>
          {t.detail !== undefined && <Line>{t.detail}</Line>}
        </>
      )
    }
    default: {
      const hs = headlines(probe)
      if (hs.length === 0) return <Line muted>{probe.kind} ready</Line>
      return (
        <Line>
          {hs.map((h) => (
            <span key={h.k}>
              <span className="pv-muted">{h.k}</span> <span className="pv-strong">{h.v}</span>
            </span>
          ))}
        </Line>
      )
    }
  }
}

// QuantileStrip draws min..max with the p5–p95 whisker, the p25–p75 box
// and a p50 tick; without quantiles, mean ± one standard deviation.
function QuantileStrip({ stats }: { stats: PreviewStats }) {
  const lo = num(stats.min)
  const hi = num(stats.max)
  const label = (
    <span className="pv-range">
      {fmtNum(stats.min)}…{fmtNum(stats.max)}
    </span>
  )
  if (lo === undefined || hi === undefined) return label
  const w = 90
  const span = hi - lo || 1
  const x = (v: number | undefined) => (v === undefined ? undefined : Math.max(0, Math.min(w, ((v - lo) / span) * w)))
  const q = new Map((stats.quantiles ?? []).map((p) => [p.p, num(p.value)]))
  let whisker: [number | undefined, number | undefined]
  let box: [number | undefined, number | undefined]
  let mid: number | undefined
  if (q.size > 0) {
    whisker = [x(q.get(5)), x(q.get(95))]
    box = [x(q.get(25)), x(q.get(75))]
    mid = x(q.get(50))
  } else {
    const m = num(stats.mean)
    const sd = num(stats.stddev) ?? 0
    whisker = [undefined, undefined]
    box = m === undefined ? [undefined, undefined] : [x(m - sd), x(m + sd)]
    mid = x(m)
  }
  return (
    <>
      <svg className="pv-strip" width={w} height={10} viewBox={`0 0 ${w} 10`} aria-hidden>
        <line className="pv-axis" x1={0} x2={w} y1={5} y2={5} />
        {whisker[0] !== undefined && whisker[1] !== undefined && (
          <line className="pv-whisker" x1={whisker[0]} x2={whisker[1]} y1={5} y2={5} />
        )}
        {box[0] !== undefined && box[1] !== undefined && (
          <rect className={q.size > 0 ? 'pv-box' : 'pv-box pv-sd'} x={box[0]} y={2} width={Math.max(1, box[1] - box[0])} height={6} />
        )}
        {mid !== undefined && <line className="pv-mid" x1={mid} x2={mid} y1={0} y2={10} />}
      </svg>
      {label}
    </>
  )
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function Line({ children, muted, className }: { children: ReactNode; muted?: boolean; className?: string }) {
  return <div className={'pv-line' + (muted ? ' pv-muted' : '') + (className ? ' ' + className : '')}>{children}</div>
}
