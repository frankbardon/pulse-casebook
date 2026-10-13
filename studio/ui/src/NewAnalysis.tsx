import { useState } from 'react'
import { createFile, type NewRoot, type WorkspaceFile } from './api.ts'
import { useArea } from './area.ts'
import { newFilePath } from './files.ts'
import { MODES } from './modes.ts'

type Props = {
  // The workspace's files (its own cohorts plus the global ones,
  // "_global/cohorts/...").
  files: WorkspaceFile[]
  // The cohort the form starts on (e.g. "New analysis on this cohort").
  initialCohort?: string
  onCreated: (f: WorkspaceFile) => void
  onCancel: () => void
}

// NewAnalysis is the "New analysis" form: a mode, a cohort (this
// workspace's own, or a global one) and a name under analyses/. The
// server writes the file (never over an existing one) with the cohort
// bound; the new analysis is then opened. (W5 replaces this form with a
// wizard that explains each mode; App opens whichever it is.)
export function NewAnalysis({ files, initialCohort, onCreated, onCancel }: Props) {
  const area = useArea()
  const local = files.filter((f) => f.kind === 'cohort' && f.scope !== 'global')
  const global = files.filter((f) => f.kind === 'cohort' && f.scope === 'global')
  const cohorts = [...local, ...global]
  const [root, setRoot] = useState<NewRoot>('request')
  const [cohort, setCohort] = useState(initialCohort ?? cohorts[0]?.path ?? '')
  const [dir, setDir] = useState('analyses')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (cohorts.length === 0) {
    return (
      <div className="new-request" data-testid="new-request">
        <p className="muted">No cohorts yet: import data in Cohorts (into this workspace or Global) first.</p>
        <button type="button" onClick={onCancel}>
          Close
        </button>
      </div>
    )
  }

  const path = newFilePath(dir.replace(/\/+$/, ''), name, root)
  const mode = MODES.find((m) => m.root === root)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!path || !cohort || busy) return
    setBusy(true)
    setError(null)
    createFile(area, path, root, cohort)
      .then((f) => onCreated({ path: f.path, kind: f.kind, reason: f.reason }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  const option = (c: WorkspaceFile) => (
    <option key={c.path} value={c.path}>
      {c.path.replace(/^_global\//, '')}
    </option>
  )
  return (
    <form className="new-request" data-testid="new-request" onSubmit={submit}>
      <label>
        Mode
        <select value={root} onChange={(e) => setRoot(e.target.value as NewRoot)} data-testid="new-root">
          {MODES.map((m) => (
            <option key={m.root} value={m.root}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {mode && (
        <p className="muted new-mode-runs" data-testid="new-mode-runs">
          Runs {mode.runs}.
        </p>
      )}
      <label>
        Cohort
        <select value={cohort} onChange={(e) => setCohort(e.target.value)} data-testid="new-cohort">
          {local.length > 0 && <optgroup label="This workspace">{local.map(option)}</optgroup>}
          {global.length > 0 && <optgroup label="Global">{global.map(option)}</optgroup>}
        </select>
      </label>
      <label>
        Folder
        <input value={dir} onChange={(e) => setDir(e.target.value)} data-testid="new-dir" />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my_analysis" autoFocus data-testid="new-name" />
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
