import { useState } from 'react'
import { createWorkspace, renameWorkspace, type Workspace } from './api.ts'

type Props = {
  workspaces: Workspace[]
  current: string | null
  onSwitch: (slug: string) => void
  // After a create (switches to it) or a rename.
  onChanged: (open?: string) => void
  // Opens the create form from outside (the empty state).
  creating?: boolean
  onCreatingChange?: (open: boolean) => void
}

type Editing = { mode: 'create' | 'rename'; name: string; busy?: boolean; error?: string }

// WorkspaceSwitcher picks the Analyses tab's workspace, creates one and
// renames the current one (its display name; the folder keeps its slug).
export function WorkspaceSwitcher({ workspaces, current, onSwitch, onChanged, creating, onCreatingChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const cur = workspaces.find((w) => w.slug === current)
  const open: Editing | null = editing ?? (creating ? { mode: 'create', name: '' } : null)

  const close = () => {
    setEditing(null)
    onCreatingChange?.(false)
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!open || open.name.trim() === '' || open.busy) return
    setEditing({ ...open, busy: true, error: undefined })
    const done =
      open.mode === 'create'
        ? createWorkspace(open.name.trim()).then((r) => r.workspace.slug)
        : renameWorkspace(current!, open.name.trim()).then(() => undefined)
    done
      .then((slug) => {
        close()
        onChanged(slug)
      })
      .catch((err: unknown) => setEditing({ ...open, busy: false, error: err instanceof Error ? err.message : String(err) }))
  }

  if (open) {
    return (
      <form className="ws-form" onSubmit={submit} data-testid="workspace-form" data-mode={open.mode}>
        <input
          value={open.name}
          onChange={(e) => setEditing({ ...open, name: e.target.value, error: undefined })}
          placeholder={open.mode === 'create' ? 'New workspace name' : 'Workspace name'}
          aria-label={open.mode === 'create' ? 'New workspace name' : 'Workspace name'}
          autoFocus
          data-testid="workspace-name-input"
        />
        <button type="submit" className="primary" disabled={open.name.trim() === '' || open.busy} data-testid="workspace-name-save">
          {open.mode === 'create' ? 'Create' : 'Rename'}
        </button>
        <button type="button" onClick={close} data-testid="workspace-name-cancel">
          Cancel
        </button>
        {open.error && (
          <span className="err" data-testid="workspace-error">
            {open.error}
          </span>
        )}
      </form>
    )
  }
  return (
    <div className="ws-switcher">
      {workspaces.length > 0 && (
        <select value={current ?? ''} onChange={(e) => onSwitch(e.target.value)} aria-label="Workspace" data-testid="workspace-select">
          {workspaces.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.name}
            </option>
          ))}
        </select>
      )}
      {cur && (
        <button type="button" className="link" onClick={() => setEditing({ mode: 'rename', name: cur.name })} data-testid="workspace-rename">
          Rename
        </button>
      )}
      <button type="button" className="link" onClick={() => setEditing({ mode: 'create', name: '' })} data-testid="workspace-create">
        New workspace
      </button>
    </div>
  )
}
