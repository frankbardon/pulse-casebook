import { useEffect, useState } from 'react'
import { getHistory, type HistoryCommit } from './api.ts'
import { useArea } from './area.ts'
import { commitTime } from './history.ts'

// FileHistory lists the commits of a versioned file of the Cohorts area
// (a saved schema or an import spec) from the repository that owns it:
// the global repository for a global file, the workspace's for a local
// one. Read-only; nothing shows without history.
export function FileHistory({ path, version = 0 }: { path: string; version?: number }) {
  const area = useArea()
  const [commits, setCommits] = useState<HistoryCommit[] | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    getHistory(area, path, ctl.signal)
      .then((h) => setCommits(h.commits))
      .catch(() => {
        if (!ctl.signal.aborted) setCommits([])
      })
    return () => ctl.abort()
  }, [area, path, version])
  if (!commits || commits.length === 0) return null
  return (
    <section className="file-view-section">
      <h3>History</h3>
      <ul className="file-history" data-testid="file-history">
        {commits.slice(0, 20).map((c) => (
          <li key={c.rev} data-rev={c.rev}>
            <span className="mono muted">{c.short}</span> <span title={c.time}>{commitTime(c.time)}</span> {c.message}
          </li>
        ))}
      </ul>
    </section>
  )
}
