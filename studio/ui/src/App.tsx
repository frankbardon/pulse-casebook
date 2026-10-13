import { useEffect, useState } from 'react'
import { getStatus, type GitStatus, type WorkspaceFile } from './api.ts'
import { useCatalog } from './catalog.ts'
import { Sidebar } from './Sidebar.tsx'
import { RequestView } from './graph/RequestView.tsx'
import './App.css'

export function App() {
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  // The catalog annotates nodes (known operators), drives inspector forms
  // and the palette, and is reloaded when the engine changes.
  const { health, catalog, error } = useCatalog()
  // Git-backed history: on unless --no-git or git is missing (then a
  // banner says why and the History panel is not offered).
  const [git, setGit] = useState<GitStatus | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    getStatus(ctl.signal)
      .then((s) => setGit(s.git))
      .catch(() => {})
    return () => ctl.abort()
  }, [])

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Pulse Studio</h1>
        <span className="dir" data-testid="studio-dir">
          {health?.dir ?? ''}
        </span>
        {error && <span className="err">{error}</span>}
        {git && !git.enabled && (
          <span className="history-off" data-testid="history-banner" title={git.reason}>
            No history: {git.reason ?? 'git is off'}
          </span>
        )}
      </header>
      <aside className="sidebar">
        <Sidebar selected={selected?.path ?? null} onSelect={setSelected} />
      </aside>
      <main className="canvas">
        <RequestView file={selected} catalog={catalog} history={git?.enabled ?? false} />
      </main>
    </div>
  )
}
