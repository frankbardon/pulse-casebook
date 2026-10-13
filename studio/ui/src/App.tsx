import { useEffect, useState } from 'react'
import { getStatus, type GitStatus, type ImportResult, type WorkspaceFile } from './api.ts'
import { useCatalog } from './catalog.ts'
import { Sidebar, type NewRequestOpen } from './Sidebar.tsx'
import { RequestView } from './graph/RequestView.tsx'
import { ImportWizard, type WizardStart } from './importer/ImportWizard.tsx'
import { CohortView, ImportSpecView, SchemaView, type Recheck } from './importer/views.tsx'
import { ExportDialog } from './exporter/ExportDialog.tsx'
import './App.css'

// The canvas shows the selected file, or the import wizard (n remounts
// it for each new start).
type Main = { mode: 'file' } | { mode: 'import'; start: WizardStart; n: number }

export function App() {
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  const [main, setMain] = useState<Main>({ mode: 'file' })
  // Bumps make the sidebar re-list (imports and rebuilds add files).
  const [reload, setReload] = useState(0)
  const [seq, setSeq] = useState(0)
  const [newRequest, setNewRequest] = useState<NewRequestOpen | null>(null)
  const [justImported, setJustImported] = useState<ImportResult | null>(null)
  // The open export dialog (n remounts it for each open).
  const [exporting, setExporting] = useState<{ cohort: string; n: number } | null>(null)
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

  const startImport = (start: WizardStart) => {
    setSeq((n) => n + 1)
    setMain({ mode: 'import', start, n: seq + 1 })
  }
  const select = (f: WorkspaceFile) => {
    setSelected(f)
    // A source opens the wizard on it; everything else opens as a file.
    if (f.kind === 'source') return startImport({ source: f.path })
    setMain({ mode: 'file' })
  }
  const openNewRequest = (open: { cohort?: string } | null) => {
    setSeq((n) => n + 1)
    setNewRequest(open ? { ...open, n: seq + 1 } : null)
  }
  const openExport = (cohort: string) => {
    setSeq((n) => n + 1)
    setExporting({ cohort, n: seq + 1 })
  }
  const recheck = (r: Recheck) => startImport({ source: r.source, schema: r.schema, target: r.target })
  const filesChanged = () => setReload((n) => n + 1)
  const dir = health?.dir ?? ''

  let canvas: React.ReactNode
  if (main.mode === 'import') {
    canvas = (
      <ImportWizard
        key={main.n}
        start={main.start}
        onClose={() => setMain({ mode: 'file' })}
        onImported={(r) => {
          setJustImported(r)
          filesChanged()
          setSelected(r.file)
          setMain({ mode: 'file' })
        }}
      />
    )
  } else if (selected?.kind === 'cohort') {
    canvas = (
      <CohortView
        key={selected.path}
        file={selected}
        dir={dir}
        justImported={justImported ?? undefined}
        onNewRequest={(cohort) => openNewRequest({ cohort })}
        onExport={openExport}
        onFilesChanged={filesChanged}
        onRecheck={recheck}
      />
    )
  } else if (selected?.kind === 'import') {
    canvas = <ImportSpecView key={selected.path} file={selected} dir={dir} onOpen={select} onFilesChanged={filesChanged} onRecheck={recheck} />
  } else if (selected?.kind === 'schema') {
    canvas = <SchemaView key={selected.path} file={selected} />
  } else {
    canvas = <RequestView file={selected} catalog={catalog} history={git?.enabled ?? false} />
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Pulse Studio</h1>
        <span className="dir" data-testid="studio-dir">
          {dir}
        </span>
        {error && <span className="err">{error}</span>}
        {git && !git.enabled && (
          <span className="history-off" data-testid="history-banner" title={git.reason}>
            No history: {git.reason ?? 'git is off'}
          </span>
        )}
      </header>
      <aside className="sidebar">
        <Sidebar
          selected={main.mode === 'file' ? (selected?.path ?? null) : null}
          onSelect={select}
          reload={reload}
          newRequest={newRequest}
          onNewRequest={openNewRequest}
          onImport={(file) => startImport({ file })}
          onExport={openExport}
        />
      </aside>
      <main className="canvas">{canvas}</main>
      {exporting && <ExportDialog key={exporting.n} cohort={exporting.cohort} onClose={() => setExporting(null)} onExported={filesChanged} />}
    </div>
  )
}
