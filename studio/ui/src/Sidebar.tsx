import { useEffect, useState } from 'react'
import { listFiles, type FileListing, type WorkspaceFile } from './api.ts'
import { groupFiles, isOpenable } from './files.ts'
import { NewRequest } from './NewRequest.tsx'
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

  // Bumped to re-list after a file is created.
  const [reload, setReload] = useState(0)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const ctl = new AbortController()
    listFiles(ctl.signal)
      .then(setListing)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [reload])

  if (error) return <p className="err">{error}</p>
  if (!listing) return <p className="muted">Loading files…</p>
  const groups = groupFiles(listing.files)
  const selectedCohort = listing.files.find((f) => f.path === selected && f.kind === 'cohort')

  return (
    <nav className="files" aria-label="Files">
      {creating ? (
        <NewRequest
          files={listing.files}
          initialCohort={selectedCohort?.path}
          onCancel={() => setCreating(false)}
          onCreated={(f) => {
            setCreating(false)
            setReload((n) => n + 1)
            onSelect(f)
          }}
        />
      ) : (
        <button type="button" className="new-request-open" data-testid="new-request-open" onClick={() => setCreating(true)}>
          New request
        </button>
      )}
      {groups.length === 0 && <p className="muted">No request or cohort files.</p>}
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
