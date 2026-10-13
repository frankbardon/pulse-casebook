import { useState } from 'react'
import type { SchemaMatch } from '../api.ts'
import { isSuperset, rankMatches, scorePct } from './match.ts'

// Applied is the saved schema the editor took its types from.
export type Applied = { name: string; score: number; exact: boolean }

type Props = {
  matches: SchemaMatch[]
  applied: Applied | null
  onApply: (m: SchemaMatch, dropNew?: boolean) => void
  // Back to Pulse's inference.
  onRevert: () => void
}

// MatchPanel is the schema step's saved-schema reuse (G3): a banner for
// the applied schema ("Matches saved schema x — 100%"), or the ranked
// close matches with their differences and Apply.
export function MatchPanel({ matches, applied, onApply, onRevert }: Props) {
  const [openDiff, setOpenDiff] = useState<string | null>(null)
  const { exact, suggestions } = rankMatches(matches)
  return (
    <>
      {applied && (
        <div className={'notice match ' + (applied.exact ? 'ok' : 'info')} data-testid="match-banner" data-exact={applied.exact}>
          <span>
            {applied.exact ? 'Matches saved schema' : 'Applied saved schema'} <code>{applied.name}</code> — {scorePct(applied.score)}
            {!applied.exact && '. Columns it does not know are flagged new.'}
          </span>
          <button type="button" className="link" onClick={onRevert} data-testid="match-undo">
            Use inferred types instead
          </button>
        </div>
      )}
      {!applied && suggestions.length > 0 && (
        <div className="notice info" data-testid="match-suggestions">
          <p>
            <strong>Similar saved schemas.</strong> Apply one to reuse its types: matching columns take the saved type, new
            columns keep what Pulse inferred.
          </p>
          <ul className="matches">
            {suggestions.map((m) => (
              <li key={m.name} data-match={m.name}>
                <div className="match-row">
                  <code>{m.name}</code>
                  <span className="score">{scorePct(m.score)}</span>
                  {isSuperset(m) && <span className="tag">has all its fields</span>}
                  <span className="muted">
                    {m.diff.added.length} new, {m.diff.missing.length} missing, {m.diff.retyped.length} retyped
                  </span>
                  <button type="button" className="link push" onClick={() => setOpenDiff(openDiff === m.name ? null : m.name)} data-testid="match-diff-toggle">
                    {openDiff === m.name ? 'Hide differences' : 'Show differences'}
                  </button>
                  {isSuperset(m) && (
                    <button
                      type="button"
                      onClick={() => onApply(m, true)}
                      title={`Apply and exclude ${m.diff.added.join(', ')}, as the saved schema does`}
                      data-testid="match-apply-drop"
                    >
                      Apply, drop {m.diff.added.length} new
                    </button>
                  )}
                  <button type="button" className="primary" onClick={() => onApply(m)} data-testid="match-apply">
                    Apply
                  </button>
                </div>
                {openDiff === m.name && <MatchDiffView m={m} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {exact && !applied && (
        <p className="muted">
          Saved schema <code>{exact.name}</code> matches these columns exactly.{' '}
          <button type="button" className="link" onClick={() => onApply(exact)}>
            Use it
          </button>
        </p>
      )}
    </>
  )
}

function MatchDiffView({ m }: { m: SchemaMatch }) {
  return (
    <div className="match-diff" data-testid="match-diff">
      {m.diff.added.length > 0 && (
        <p>
          <span className="tag new">new</span> {m.diff.added.join(', ')} <span className="muted">(not in the saved schema; keep inferred types)</span>
        </p>
      )}
      {m.diff.missing.length > 0 && (
        <p>
          <span className="tag missing">missing</span> {m.diff.missing.join(', ')} <span className="muted">(in the saved schema, not in this file)</span>
        </p>
      )}
      {m.diff.retyped.length > 0 && (
        <p>
          <span className="tag">retyped</span>{' '}
          {m.diff.retyped.map((r) => `${r.name}: ${r.input} → ${r.saved}`).join(', ')}
        </p>
      )}
      {m.diff.added.length + m.diff.missing.length + m.diff.retyped.length === 0 && <p className="muted">Same columns; only type widths differ.</p>}
    </div>
  )
}
