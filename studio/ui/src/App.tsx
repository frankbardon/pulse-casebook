import { useEffect, useState } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import { getJSON, type Health, type WorkspaceFile } from './api.ts'
import { Sidebar } from './Sidebar.tsx'
import './App.css'

export function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    getJSON<Health>('/api/health', ctl.signal)
      .then(setHealth)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
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
        <ReactFlow nodes={[]} edges={[]} proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls />
        </ReactFlow>
      </main>
    </div>
  )
}
