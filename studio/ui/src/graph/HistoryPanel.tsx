import { useEffect, useMemo, useState } from 'react'
import { ApiCallError, getHistory, getHistoryFile, readFile, restoreHistory, type HistoryCommit, type Restored } from '../api.ts'
import { commitTime, diffStats, foldDiff, lineDiff, type DiffLine } from '../history.ts'
import './history.css'

type Props = {
  path: string
  // Bumped by the view after each save or restore of the file, so the
  // list (and an open diff) refetch.
  version: number
  // The editor has unsaved changes a restore would discard.
  dirty: boolean
  onRestored: (f: Restored) => void
  onClose: () => void
}

// The selected commit's diff: the file on disk → that commit's version,
// i.e. what Restore would change. missing: the file did not exist then.
type Diff = { rev: string; lines?: DiffLine[]; missing?: true; error?: string }

// HistoryPanel lists the commits that touched the open file (newest
// first). Clicking one shows a read-only diff from the file on disk to
// that version; Restore writes it back (a new commit) and the view
// reloads the restored content as it does after a save.
export function HistoryPanel({ path, version, dirty, onRestored, onClose }: Props) {
  const [commits, setCommits] = useState<HistoryCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    getHistory(path, ctl.signal)
      .then((h) => {
        setCommits(h.commits)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [path, version])

  useEffect(() => {
    if (selected === null) return
    const ctl = new AbortController()
    Promise.all([
      getHistoryFile(path, selected, ctl.signal).then(
        (f) => f.text,
        (e: unknown) => {
          if (String(e).includes('not_found:')) return null
          throw e
        },
      ),
      readFile(path, ctl.signal).then(
        (f) => f.text,
        (e: unknown) => {
          if (String(e).includes('not_found:')) return ''
          throw e
        },
      ),
    ])
      .then(([old, current]) => {
        setDiff(old === null ? { rev: selected, missing: true } : { rev: selected, lines: lineDiff(current, old) })
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setDiff({ rev: selected, error: String(e) })
      })
    return () => ctl.abort()
  }, [path, selected, version])

  const restore = async (rev: string) => {
    if (dirty && !window.confirm('Restoring replaces the file and discards your unsaved changes. Restore?')) return
    setRestoring(true)
    setRestoreError(null)
    try {
      onRestored(await restoreHistory(path, rev))
    } catch (e) {
      setRestoreError(e instanceof ApiCallError ? e.message : String(e))
    } finally {
      setRestoring(false)
    }
  }

  const shown = diff && diff.rev === selected ? diff : null
  const rows = useMemo(() => (shown?.lines ? foldDiff(shown.lines) : []), [shown])
  const stats = shown?.lines ? diffStats(shown.lines) : null
  const commit = commits?.find((c) => c.rev === selected)

  return (
    <aside className="history-panel" data-testid="history-panel">
      <div className="history-head">
        <span className="insp-title">History</span>
        <span className="history-path" title={path}>
          {path}
        </span>
        <button type="button" className="history-close" data-testid="history-close" onClick={onClose} title="Close history">
          ×
        </button>
      </div>
      {error && <p className="err">{error}</p>}
      {!commits && !error && <p className="muted">Loading history…</p>}
      {commits && commits.length === 0 && (
        <p className="muted" data-testid="history-empty">
          No commits touch this file yet. Saving it creates the first one.
        </p>
      )}
      {commits && commits.length > 0 && (
        <ol className="history-list" data-testid="history-list">
          {commits.map((c) => (
            <li key={c.rev}>
              <button
                type="button"
                className={'history-item' + (c.rev === selected ? ' selected' : '')}
                data-testid="history-item"
                data-rev={c.rev}
                aria-pressed={c.rev === selected}
                onClick={() => setSelected(c.rev === selected ? null : c.rev)}
                title={`${c.rev}\n${c.author} <${c.email}>\n${c.time}`}
              >
                <span className="history-msg">{c.message}</span>
                <span className="history-meta">
                  <code>{c.short}</code> · {commitTime(c.time)} · {c.author}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {selected !== null && (
        <section className="history-diff" data-testid="history-diff" data-rev={selected}>
          <div className="history-diff-head">
            <span>
              on disk → <code>{commit?.short ?? selected.slice(0, 7)}</code>
              {stats && (
                <span className="history-stats" data-testid="history-stats">
                  {' '}
                  <span className="add">+{stats.added}</span> <span className="del">−{stats.removed}</span>
                </span>
              )}
            </span>
            <button
              type="button"
              className="history-restore"
              data-testid="history-restore"
              disabled={restoring || !shown?.lines || (stats !== null && stats.added + stats.removed === 0)}
              onClick={() => void restore(selected)}
              title="Write this version back to the file (committed as a restore)"
            >
              {restoring ? 'Restoring…' : 'Restore'}
            </button>
          </div>
          {restoreError && <p className="err">{restoreError}</p>}
          {!shown && <p className="muted">Loading diff…</p>}
          {shown?.error && <p className="err">{shown.error}</p>}
          {shown?.missing && <p className="muted">The file did not exist at this commit.</p>}
          {shown?.lines && rows.length === 0 && (
            <p className="muted" data-testid="history-same">
              Same as the file on disk.
            </p>
          )}
          {rows.length > 0 && (
            <pre className="history-lines">
              {rows.map((r, i) =>
                r.op === 'skip' ? (
                  <div key={i} className="dl skip">
                    ⋯ {r.count} unchanged line{r.count === 1 ? '' : 's'}
                  </div>
                ) : (
                  <div key={i} className={'dl' + (r.op === '+' ? ' add' : r.op === '-' ? ' del' : '')} data-op={r.op}>
                    <span className="dl-op">{r.op}</span>
                    {r.text}
                  </div>
                ),
              )}
            </pre>
          )}
        </section>
      )}
    </aside>
  )
}
