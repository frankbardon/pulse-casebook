import { useEffect, useState } from 'react'
import { listFiles, type FileListing, type WorkspaceFile } from './api.ts'
import { groupFiles, isOpenable } from './files.ts'
import './Sidebar.css'

type Props = {
  selected: string | null
  onSelect: (f: WorkspaceFile) => void
}

// Sidebar lists the scoped directory's files grouped by type. Unopenable
// files are shown greyed out and cannot be selected.
export function Sidebar({ selected, onSelect }: Props) {
  const [listing, setListing] = useState<FileListing | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    listFiles(ctl.signal)
      .then(setListing)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [])

  if (error) return <p className="err">{error}</p>
  if (!listing) return <p className="muted">Loading files…</p>
  const groups = groupFiles(listing.files)
  if (groups.length === 0) return <p className="muted">No request or cohort files.</p>

  return (
    <nav className="files" aria-label="Files">
      {groups.map((g) => (
        <section key={g.kind} className="file-group" data-kind={g.kind}>
          <h2>
            {g.title} <span className="count">{g.files.length}</span>
          </h2>
          <ul>
            {g.files.map((f) => {
              const open = isOpenable(f)
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    className={'file' + (f.path === selected ? ' selected' : '')}
                    disabled={!open}
                    title={open ? f.path : `${f.path}: ${f.reason ?? 'cannot be opened'}`}
                    aria-current={f.path === selected ? 'true' : undefined}
                    onClick={() => onSelect(f)}
                  >
                    {f.path}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {listing.truncated && <p className="muted">Listing truncated.</p>}
    </nav>
  )
}
