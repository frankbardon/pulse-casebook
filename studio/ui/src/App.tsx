import { useState } from 'react'
import type { WorkspaceFile } from './api.ts'
import { useCatalog } from './catalog.ts'
import { Sidebar } from './Sidebar.tsx'
import { RequestView } from './graph/RequestView.tsx'
import './App.css'

export function App() {
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  // The catalog annotates nodes (known operators), drives inspector forms
  // and the palette, and is reloaded when the engine changes.
  const { health, catalog, error } = useCatalog()

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
