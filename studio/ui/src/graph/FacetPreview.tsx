import { facetFields, fmtCount, fmtNum, type DiscreteSummary, type NumericSummary } from './previews.ts'
import { usePreview } from './usePreviews.ts'

// FacetResult shows a facet node's live output: per field, the top
// values with their share (discrete fields) or the range, mean,
// percentiles and histogram (numeric fields). It has a fixed height and
// scrolls inside, so a result arriving never resizes the node.
export function FacetResult({ id }: { id: string }) {
  const { enabled, state } = usePreview(id)
  const probe = state?.status === 'ok' ? state.probe : state?.status === 'loading' ? state.last : undefined
  const fields = probe ? facetFields(probe) : []
  return (
    <div
      className={'facet-result nowheel' + (state?.status === 'loading' ? ' pv-stale' : '')}
      data-testid="facet-result"
      data-state={enabled ? (state?.status ?? 'idle') : 'off'}
    >
      {fields.length === 0 && <p className="muted">{enabled ? (probe ? 'no fields' : 'waiting for the facet…') : 'no preview'}</p>}
      {fields.map((f) => (
        <section key={f.name} className="facet-field" data-field={f.name}>
          <header>
            <span className="k">{f.name}</span>
            <span className="v type">{f.type}</span>
            {f.nulls > 0 && <span className="pv-muted">null {fmtCount(f.nulls)}</span>}
          </header>
          {f.discrete && <Discrete d={f.discrete} />}
          {f.numeric && <Numeric n={f.numeric} />}
        </section>
      ))}
    </div>
  )
}

const TOP = 6

function Discrete({ d }: { d: DiscreteSummary }) {
  const total = d.values.reduce((a, v) => a + v.count, 0)
  return (
    <ul className="facet-values">
      {d.values.slice(0, TOP).map((v) => (
        <li key={v.value}>
          <span className="k" title={v.value}>
            {v.value}
          </span>
          <span className="facet-bar" aria-hidden>
            <span style={{ width: total ? `${((v.count / total) * 100).toFixed(1)}%` : 0 }} />
          </span>
          <span className="v">{fmtCount(v.count)}</span>
        </li>
      ))}
      {(d.distinct > TOP || d.truncated > 0) && (
        <li className="pv-muted">
          {fmtCount(d.distinct)} distinct{d.truncated > 0 ? ` · ${fmtCount(d.truncated)} cut by top-k` : ''}
        </li>
      )}
    </ul>
  )
}

function Numeric({ n }: { n: NumericSummary }) {
  const peak = n.bins ? Math.max(1, ...n.bins) : 1
  return (
    <div className="facet-numeric">
      <div>
        {fmtNum(n.min)}…{fmtNum(n.max)} <span className="pv-muted">μ</span> {fmtNum(n.mean)} <span className="pv-muted">σ</span> {fmtNum(n.stddev)}
      </div>
      {n.percentiles.length > 0 && (
        <div className="pv-muted">
          {n.percentiles.map(([p, v]) => (
            <span key={p}>
              p{Number(p) * 100} {fmtNum(v)}{' '}
            </span>
          ))}
        </div>
      )}
      {n.bins && (
        <svg className="facet-hist" viewBox={`0 0 ${n.bins.length} 20`} preserveAspectRatio="none" aria-hidden>
          {n.bins.map((b, i) => (
            <rect key={i} x={i + 0.1} width={0.8} y={20 - (b / peak) * 20} height={(b / peak) * 20} />
          ))}
        </svg>
      )}
    </div>
  )
}
