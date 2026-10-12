import { useState } from 'react'
import { createFile, type NewRoot, type WorkspaceFile } from './api.ts'
import { defaultNewDir, newFilePath } from './files.ts'

type Props = {
  files: WorkspaceFile[]
  // The cohort the form starts on (e.g. the selected cohort file).
  initialCohort?: string
  onCreated: (f: WorkspaceFile) => void
  onCancel: () => void
}

const ROOTS: { value: NewRoot; label: string }[] = [
  { value: 'request', label: 'Request' },
  { value: 'compose', label: 'Compose' },
  { value: 'facet', label: 'Facet' },
  { value: 'chain', label: 'Chain' },
]

// NewRequest is the "New request" form: a root type, a workspace cohort
// and a file name. The server writes the file (never over an existing
// one) with the cohort bound; the new file is then opened.
export function NewRequest({ files, initialCohort, onCreated, onCancel }: Props) {
  const cohorts = files.filter((f) => f.kind === 'cohort')
  const [root, setRoot] = useState<NewRoot>('request')
  const [cohort, setCohort] = useState(initialCohort ?? cohorts[0]?.path ?? '')
  const [dir, setDir] = useState(() => (cohort ? defaultNewDir(cohort, files) : ''))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (cohorts.length === 0) {
    return (
      <div className="new-request" data-testid="new-request">
        <p className="muted">No .pulse cohorts in this directory.</p>
        <button type="button" onClick={onCancel}>
          Close
        </button>
      </div>
    )
  }

  const path = newFilePath(dir.replace(/\/+$/, ''), name, root)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!path || !cohort || busy) return
    setBusy(true)
    setError(null)
    createFile(path, root, cohort)
      .then((f) => onCreated({ path: f.path, kind: f.kind, reason: f.reason }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  return (
    <form className="new-request" data-testid="new-request" onSubmit={submit}>
      <label>
        Root
        <select value={root} onChange={(e) => setRoot(e.target.value as NewRoot)} data-testid="new-root">
          {ROOTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cohort
        <select
          value={cohort}
          onChange={(e) => {
            setCohort(e.target.value)
            setDir(defaultNewDir(e.target.value, files))
          }}
          data-testid="new-cohort"
        >
          {cohorts.map((c) => (
            <option key={c.path} value={c.path}>
              {c.path}
            </option>
          ))}
        </select>
      </label>
      <label>
        Directory
        <input value={dir} onChange={(e) => setDir(e.target.value)} data-testid="new-dir" />
      </label>
      <label>
        File name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my_request"
          autoFocus
          data-testid="new-name"
        />
      </label>
      {path && <p className="muted new-path">{path}</p>}
      {error && (
        <p className="err" data-testid="new-error">
          {error}
        </p>
      )}
      <div className="new-actions">
        <button type="submit" disabled={!path || busy} data-testid="new-create">
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
