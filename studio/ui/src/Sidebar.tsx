import { useEffect, useState } from 'react'
import { listFiles, type FileListing, type WorkspaceFile } from './api.ts'
import { fileBadge, fileLabel, groupFiles, isOpenable } from './files.ts'
import { NewRequest } from './NewRequest.tsx'
import './Sidebar.css'

// NewRequestOpen is the open New request form: the cohort it starts on
// (the selected cohort, or the one "New request on this cohort" names).
// n remounts the form when it is asked for again.
export type NewRequestOpen = { cohort?: string; n: number }

type Props = {
  selected: string | null
  onSelect: (f: WorkspaceFile) => void
  // Bumped by the app to re-list (after an import or rebuild).
  reload: number
  newRequest: NewRequestOpen | null
  onNewRequest: (open: { cohort?: string } | null) => void
  // Starts the import wizard, with a dropped file when there is one.
  onImport: (file?: File) => void
}

// Sidebar lists the scoped directory's files grouped by type. Unopenable
// files are shown greyed out and cannot be selected. Dropping a file on
// it starts an import.
export function Sidebar({ selected, onSelect, reload, newRequest, onNewRequest, onImport }: Props) {
  const [listing, setListing] = useState<FileListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped to re-list after a file is created.
  const [created, setCreated] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const ctl = new AbortController()
    listFiles(ctl.signal)
      .then(setListing)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [reload, created])

  if (error) return <p className="err">{error}</p>
  if (!listing) return <p className="muted">Loading files…</p>
  const groups = groupFiles(listing.files)
  const selectedCohort = listing.files.find((f) => f.path === selected && f.kind === 'cohort')

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <nav
      className={'files' + (dragging ? ' dropping' : '')}
      aria-label="Files"
      data-testid="sidebar"
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) onImport(f)
      }}
    >
      {dragging && (
        <div className="drop-hint" data-testid="sidebar-drop">
          Drop to import
        </div>
      )}
      {newRequest ? (
        <NewRequest
          key={newRequest.n}
          files={listing.files}
          initialCohort={newRequest.cohort ?? selectedCohort?.path}
          onCancel={() => onNewRequest(null)}
          onCreated={(f) => {
            onNewRequest(null)
            setCreated((n) => n + 1)
            onSelect(f)
          }}
        />
      ) : (
        <div className="sidebar-actions">
          <button type="button" className="new-request-open" data-testid="new-request-open" onClick={() => onNewRequest({})}>
            New request
          </button>
          <button
            type="button"
            className="new-request-open"
            data-testid="import-open"
            title="Upload a CSV, Parquet, Excel, SPSS … file and import it as a cohort (or drop a file here)"
            onClick={() => onImport()}
          >
            Import data
          </button>
        </div>
      )}
      {groups.length === 0 && <p className="muted">No files yet. Import data to get started.</p>}
      {groups.map((g) => (
        <section key={g.kind} className="file-group" data-kind={g.kind}>
          <h2>
            {g.title} <span className="count">{g.files.length}</span>
          </h2>
          <ul>
            {g.files.map((f) => {
              const open = isOpenable(f)
              const badge = fileBadge(f)
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    className={'file' + (f.path === selected ? ' selected' : '')}
                    disabled={!open}
                    title={open ? f.path : `${f.path}: ${f.reason ?? 'cannot be opened'}`}
                    aria-current={f.path === selected ? 'true' : undefined}
                    data-path={f.path}
                    onClick={() => onSelect(f)}
                  >
                    <span className="file-name">{fileLabel(f)}</span>
                    {badge && (
                      <span className={'file-badge ' + badge.tone} data-testid="file-badge">
                        {badge.text}
                      </span>
                    )}
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
