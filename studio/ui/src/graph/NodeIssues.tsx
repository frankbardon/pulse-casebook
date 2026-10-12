import { useNodeValidation } from './useValidation.ts'
import { proposal, worst, type Issue } from './validation.ts'

// NodeIssues decorates a node with its validation: a corner badge
// (worst severity and count of errors / warnings) and a hover card with
// the engine's explain text, then each issue with its suggestion. Both
// are absolutely positioned, so they never change the node's measured
// size, and take no pointer events (the badge's title is for the
// accessibility tree; the card shows on node hover).
export function NodeIssues({ id }: { id: string }) {
  const v = useNodeValidation(id)
  if (!v) return null
  const sev = worst(v.issues)
  const shown = v.issues.filter((i) => i.severity !== 'hint')
  return (
    <>
      {sev && (
        <span
          className={'gnode-badge ' + sev}
          data-testid="node-badge"
          data-severity={sev}
          title={shown.map(line).join('\n')}
        >
          {sev === 'error' ? '!' : '?'}
          {shown.length > 1 ? ` ${shown.length}` : ''}
        </span>
      )}
      {(v.explain || v.issues.length > 0) && (
        <div className="gnode-tip" data-testid="node-tip" role="tooltip">
          {v.explain && <p className="tip-explain">{v.explain}</p>}
          {v.issues.length > 0 && (
            <ul className="tip-issues">
              {v.issues.map((i, k) => (
                <IssueLine key={k} issue={i} />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

function IssueLine({ issue }: { issue: Issue }) {
  const p = proposal(issue)
  return (
    <li className={'tip-issue ' + issue.severity} data-severity={issue.severity}>
      <span className="tip-msg">{issue.message}</span>
      {p !== undefined && (
        <span className="tip-proposed" data-testid="node-suggestion">
          {' '}
          → try <code>{p}</code>
        </span>
      )}
    </li>
  )
}

function line(i: Issue): string {
  const p = proposal(i)
  return p === undefined ? i.message : `${i.message} (try ${p})`
}
