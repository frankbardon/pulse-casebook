import type { ImportReport } from '../api.ts'
import { formatBytes, formatCount } from './format.ts'

// ImportReportView is an import's (or rebuild's) report: headline
// figures, then row errors and warnings when there are any.
export function ImportReportView({ report }: { report: ImportReport }) {
  return (
    <div className="import-report" data-testid="import-report">
      <dl className="report-figures">
        <div>
          <dt>Rows imported</dt>
          <dd data-testid="report-rows">{formatCount(report.rows_imported)}</dd>
        </div>
        <div>
          <dt>Fields</dt>
          <dd>{report.schema.length}</dd>
        </div>
        <div>
          <dt>Row errors</dt>
          <dd className={report.row_error_count > 0 ? 'warn' : undefined}>{formatCount(report.row_error_count)}</dd>
        </div>
        <div>
          <dt>Cohort size</dt>
          <dd>{formatBytes(report.cohort_bytes)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{report.elapsed_ms} ms</dd>
        </div>
      </dl>
      {report.promoted_fields.length > 0 && (
        <p className="muted">Promoted to nullable while importing: {report.promoted_fields.join(', ')}</p>
      )}
      {report.row_errors.length > 0 && (
        <details>
          <summary>
            {report.row_error_count} row{report.row_error_count === 1 ? '' : 's'} skipped
            {report.row_error_count > report.row_errors.length && ` (first ${report.row_errors.length} shown)`}
          </summary>
          <ul className="report-list">
            {report.row_errors.map((e, i) => (
              <li key={i}>
                <span className="mono">row {e.row}</span> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.warnings.length > 0 && (
        <ul className="report-list">
          {report.warnings.map((w, i) => (
            <li key={i} className="warn">
              {w.column && <span className="mono">{w.column}: </span>}
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
