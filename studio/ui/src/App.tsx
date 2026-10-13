import { useEffect, useState } from 'react'
import { getLibrary, getStatus, type GitStatus, type LibraryInfo } from './api.ts'
import { useCatalog } from './catalog.ts'
import { AnalysesView, type NewAnalysisOpen } from './AnalysesView.tsx'
import { CohortsView } from './CohortsView.tsx'
import { WorkspaceSwitcher } from './WorkspaceSwitcher.tsx'
import { loadPrefs, pickWorkspace, savePrefs, type Tab } from './prefs.ts'
import './App.css'
import './shell.css'

// App is the library shell: the header (Analyses | Cohorts, and on
// Analyses the workspace switcher) over the open tab. The last
// workspace and tab are remembered per viewer.
export function App() {
  // The catalog annotates nodes (known operators), drives inspector forms
  // and the palette, and is reloaded when the engine changes.
  const { health, catalog, error } = useCatalog()
  const [prefs] = useState(loadPrefs)
  const [lib, setLib] = useState<LibraryInfo | null>(null)
  const [libError, setLibError] = useState<string | null>(null)
  const [libReload, setLibReload] = useState(0)
  const [tab, setTabState] = useState<Tab>(prefs.tab ?? 'analyses')
  const [ws, setWsState] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newAnalysis, setNewAnalysis] = useState<NewAnalysisOpen | null>(null)
  const [seq, setSeq] = useState(0)
  // Cohorts › Import asked for from elsewhere (New analysis with no
  // cohorts): n opens the import wizard once per ask.
  const [importAsk, setImportAsk] = useState<{ area?: string; n: number } | null>(null)
  // Git-backed history of the open workspace (or of the global area when
  // there is none): on unless --no-git or git is missing (then a banner
  // says why and the History panel is not offered).
  const [wsGit, setWsGit] = useState<{ ws: string; git: GitStatus } | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    getLibrary(ctl.signal)
      .then((l) => {
        setLib(l)
        setLibError(null)
        setWsState((cur) => pickWorkspace(cur ?? prefs.workspace, l.workspaces.map((w) => w.slug), l.default))
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setLibError(String(e))
      })
    return () => ctl.abort()
  }, [libReload, prefs.workspace])

  useEffect(() => {
    if (!ws) return
    const ctl = new AbortController()
    getStatus(ws, ctl.signal)
      .then((s) => setWsGit({ ws, git: s.git }))
      .catch(() => {})
    return () => ctl.abort()
  }, [ws, libReload])
  const git = ws ? (wsGit?.ws === ws ? wsGit.git : null) : (lib?.git ?? null)

  const setTab = (t: Tab) => {
    setTabState(t)
    setImportAsk(null)
    savePrefs({ tab: t })
  }
  const setWs = (slug: string) => {
    setWsState(slug)
    setNewAnalysis(null)
    savePrefs({ workspace: slug })
  }
  // openNewAnalysis opens New analysis (the mode wizard) in the open
  // workspace, optionally on a cohort.
  const openNewAnalysis = (open: { cohort?: string } | null) => {
    setSeq((n) => n + 1)
    setNewAnalysis(open ? { ...open, n: seq + 1 } : null)
  }
  // "New analysis on this cohort" from Cohorts: a local cohort opens in
  // its workspace, a global one in the open workspace.
  const newAnalysisOn = (refPath: string, workspace: string | null) => {
    setTab('analyses')
    if (workspace) setWs(workspace)
    if (!workspace && !ws) {
      setCreating(true)
      return
    }
    setSeq((n) => n + 1)
    setNewAnalysis({ cohort: refPath, n: seq + 1 })
  }
  // openImport goes to Cohorts › Import, into the open workspace.
  const openImport = () => {
    setTabState('cohorts')
    savePrefs({ tab: 'cohorts' })
    setSeq((n) => n + 1)
    setImportAsk({ area: ws ?? undefined, n: seq + 1 })
  }
  const workspaces = lib?.workspaces ?? []
  const current = workspaces.find((w) => w.slug === ws)

  let body: React.ReactNode
  if (!lib) {
    body = (
      <main className="canvas wide">
        {libError ? <p className="err">{libError}</p> : <p className="muted pad">Loading the library…</p>}
      </main>
    )
  } else if (tab === 'cohorts') {
    body = <CohortsView libraryName={lib.name} workspaces={workspaces} onNewAnalysisOn={newAnalysisOn} importAsk={importAsk} />
  } else if (!current) {
    body = (
      <main className="canvas wide">
        <div className="empty-state" data-testid="no-workspaces">
          <h2>No workspaces yet</h2>
          <p className="muted">
            A workspace holds a set of analyses (and, if you like, cohorts and schemas of its own). Cohorts and schemas in the global
            area are shared by every workspace.
          </p>
          <button type="button" className="primary" onClick={() => setCreating(true)} data-testid="empty-create-workspace">
            Create workspace
          </button>
        </div>
      </main>
    )
  } else {
    body = (
      <AnalysesView
        key={current.slug}
        workspace={current.slug}
        workspaceName={current.name}
        catalog={catalog}
        history={git?.enabled ?? false}
        newAnalysis={newAnalysis}
        onNewAnalysis={openNewAnalysis}
        onImport={openImport}
      />
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Pulse Studio</h1>
        <nav className="tabs" role="tablist" aria-label="Studio">
          {(['analyses', 'cohorts'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'on' : undefined}
              onClick={() => setTab(t)}
              data-testid={`nav-${t}`}
            >
              {t === 'analyses' ? 'Analyses' : 'Cohorts'}
            </button>
          ))}
        </nav>
        {lib && (tab === 'analyses' || creating) && (
          <WorkspaceSwitcher
            workspaces={workspaces}
            current={ws}
            onSwitch={setWs}
            creating={creating}
            onCreatingChange={setCreating}
            onChanged={(slug) => {
              if (slug) {
                setWs(slug)
                setTab('analyses')
              }
              setLibReload((n) => n + 1)
            }}
          />
        )}
        <span className="dir" data-testid="studio-dir" title="Library folder">
          {health?.dir ?? lib?.name ?? ''}
        </span>
        {(error || libError) && <span className="err">{error ?? libError}</span>}
        {git && !git.enabled && (
          <span className="history-off" data-testid="history-banner" title={git.reason}>
            No history: {git.reason ?? 'git is off'}
          </span>
        )}
      </header>
      {body}
    </div>
  )
}
