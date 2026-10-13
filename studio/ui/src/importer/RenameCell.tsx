// The schema table's editable column name. PULSE-GAP(column-rename):
// delete with rename.ts when Pulse renames natively.
import { fieldName, isRenamed, type NameIssue } from './rename.ts'
import './rename.css'

type Props = {
  c: { name: string; rename?: string; index: number; include: boolean }
  issue?: NameIssue
  onRename: (name: string) => void
}

export function RenameCell({ c, issue, onRename }: Props) {
  const renamed = isRenamed(c)
  return (
    <div className="rename">
      <input
        className="mono"
        value={fieldName(c)}
        disabled={c.index < 0}
        onChange={(e) => onRename(e.target.value)}
        aria-label={`Field name for ${c.name}`}
        aria-invalid={issue ? true : undefined}
        title={renamed ? `Source column: ${c.name}` : 'Field name in the cohort'}
        data-testid="col-name"
      />
      {renamed && (
        <span className="rename-from">
          <span className="muted" data-testid="col-original" title="Source column">
            from <span className="mono">{c.name}</span>
          </span>
          <button type="button" className="link" onClick={() => onRename(c.name)} title="Use the source column name" data-testid="col-name-reset">
            reset
          </button>
        </span>
      )}
      {issue && c.include && (
        <div className="err" data-testid="col-name-issue" data-reason={issue.reason}>
          {issue.message}
        </div>
      )}
    </div>
  )
}

export function SuggestNamesButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="link"
      onClick={onClick}
      disabled={disabled}
      title="Rename every included column to a clean snake_case name (lower case, no spaces or punctuation)"
      data-testid="suggest-names"
    >
      Suggest clean names
    </button>
  )
}
