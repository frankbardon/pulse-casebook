import { useEffect, useState } from 'react'
import { getCatalog, getJSON, type Catalog, type Health, type WorkspaceFile } from './api.ts'
import { Sidebar } from './Sidebar.tsx'
import { RequestView } from './graph/RequestView.tsx'
import './App.css'

export function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  const [catalog, setCatalog] = useState<Catalog | undefined>(undefined)

  useEffect(() => {
    const ctl = new AbortController()
    getJSON<Health>('/api/health', ctl.signal)
      .then(setHealth)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    // The catalog annotates nodes (known operators) and drives inspector
    // forms; the graph renders without it, so a failure is not surfaced
    // as an error.
    getCatalog(ctl.signal)
      .then(setCatalog)
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
      </header>
      <aside className="sidebar">
        <Sidebar selected={selected?.path ?? null} onSelect={setSelected} />
      </aside>
      <main className="canvas">
        <RequestView file={selected} catalog={catalog} />
      </main>
    </div>
  )
}
