import { useEffect, useMemo, useState } from 'react'
import { listFiles, type Catalog, type FileListing, type WorkspaceFile } from './api.ts'
import { AreaContext } from './area.ts'
import { RequestView } from './graph/RequestView.tsx'
import { analysisName, filterAnalyses, groupByFolder, isAnalysis, modeCounts, modeOf, MODES, type ModeFilter } from './modes.ts'
import { NewAnalysis } from './NewAnalysis.tsx'
import './Sidebar.css'

// NewAnalysisOpen is an open New analysis: the cohort it starts on, if
// any (a workspace path: "cohorts/x.pulse" or "_global/cohorts/x.pulse").
// n remounts it when asked for again.
export type NewAnalysisOpen = { cohort?: string; n: number }

type Props = {
  workspace: string
  catalog?: Catalog
  // The workspace is kept in git: the History panel is offered.
  history: boolean
  newAnalysis: NewAnalysisOpen | null
  onNewAnalysis: (open: { cohort?: string } | null) => void
}

// AnalysesView is the Analyses tab for one workspace: its analyses
// listed together (by folder) with their mode, search and a mode filter,
// and the editor for the selected one.
export function AnalysesView({ workspace, catalog, history, newAnalysis, onNewAnalysis }: Props) {
  const [listing, setListing] = useState<FileListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ModeFilter>('all')
  const [created, setCreated] = useState(0)

  useEffect(() => {
    const ctl = new AbortController()
    listFiles(workspace, ctl.signal)
      .then((l) => {
        setListing(l)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [workspace, created])

  const analyses = useMemo(() => (listing ? listing.files.filter(isAnalysis) : []), [listing])
  const shown = useMemo(() => groupByFolder(filterAnalyses(analyses, query, mode)), [analyses, query, mode])
  const counts = useMemo(() => modeCounts(analyses), [analyses])

  let list: React.ReactNode
  if (error) list = <p className="err">{error}</p>
  else if (!listing) list = <p className="muted">Loading analyses…</p>
  else if (analyses.length === 0)
    list = (
      <div className="empty-list" data-testid="analyses-empty">
        <p className="muted">No analyses yet.</p>
        {!newAnalysis && (
          <button type="button" className="primary" onClick={() => onNewAnalysis({})} data-testid="empty-new-analysis">
            New analysis
          </button>
        )}
      </div>
    )
  else
    list = (
      <>
        <div className="list-filters">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search analyses"
            aria-label="Search analyses"
            data-testid="analyses-search"
          />
          <select value={mode} onChange={(e) => setMode(e.target.value as ModeFilter)} aria-label="Mode" data-testid="analyses-mode">
            <option value="all">All modes ({analyses.length})</option>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({counts[m.id]})
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 && <p className="muted">No analyses match.</p>}
        {shown.map((g) => (
          <section key={g.folder} className="file-group" data-folder={g.folder}>
            {g.folder !== '' && <h2 className="folder">{g.folder}/</h2>}
            <ul>
              {g.files.map((f) => {
                const m = modeOf(f.kind)!
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      className={'file analysis' + (f.path === selected?.path ? ' selected' : '')}
                      title={`${f.path}\n${m.label}: ${m.runs}`}
                      aria-current={f.path === selected?.path ? 'true' : undefined}
                      data-path={f.path}
                      data-mode={m.id}
                      data-testid="analysis-row"
                      onClick={() => setSelected(f)}
                    >
                      <span className="analysis-line">
                        <span className="file-name">{analysisName(f.path)}</span>
                        <span className={'mode-badge mode-' + m.id} data-testid="mode-badge">
                          {m.label}
                        </span>
                      </span>
                      <span className="analysis-runs">{m.runs}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {listing.truncated && <p className="muted">Listing truncated.</p>}
      </>
    )

  return (
    <AreaContext.Provider value={workspace}>
      <aside className="sidebar">
        <nav className="files" aria-label="Analyses" data-testid="sidebar">
          {newAnalysis && listing ? (
            <NewAnalysis
              key={newAnalysis.n}
              files={listing.files}
              initialCohort={newAnalysis.cohort}
              onCancel={() => onNewAnalysis(null)}
              onCreated={(f) => {
                onNewAnalysis(null)
                setCreated((n) => n + 1)
                setSelected(f)
              }}
            />
          ) : (
            <div className="sidebar-actions">
              <button type="button" className="new-request-open" data-testid="new-request-open" onClick={() => onNewAnalysis({})}>
                New analysis
              </button>
            </div>
          )}
          {list}
        </nav>
      </aside>
      <main className="canvas">
        <RequestView file={selected} catalog={catalog} history={history} />
      </main>
    </AreaContext.Provider>
  )
}
