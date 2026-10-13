import { useEffect, useMemo, useState } from 'react'
import { getCohorts, GLOBAL_AREA, type Area, type CatalogEntry, type CohortsCatalog, type ImportResult, type Workspace, type WorkspaceFile } from './api.ts'
import { AreaContext } from './area.ts'
import { areaOf, canMakeGlobal, catalogCounts, entryKey, sectionsOf, workspaceName, type CatalogKind, type ScopeFilter } from './cohortsCatalog.ts'
import { ExportDialog } from './exporter/ExportDialog.tsx'
import { fileBadge } from './files.ts'
import { ImportWizard, type WizardStart } from './importer/ImportWizard.tsx'
import { CohortView, ImportSpecView, SchemaView, type Recheck, type ScopeInfo } from './importer/views.tsx'
import { formatBytes } from './importer/format.ts'
import { MakeGlobal } from './MakeGlobal.tsx'
import './Sidebar.css'

type Selected = { kind: CatalogKind; entry: CatalogEntry }

type Props = {
  libraryName: string
  workspaces: Workspace[]
  // "New analysis on this cohort": the cohort as a workspace refers to
  // it, and the workspace it is local to (null for a global cohort).
  onNewAnalysisOn: (refPath: string, workspace: string | null) => void
  // Open the import wizard (into area) when n changes.
  importAsk?: { area?: Area; n: number } | null
}

const KINDS: { kind: CatalogKind; title: string; key: keyof Omit<CohortsCatalog, 'truncated'> }[] = [
  { kind: 'cohort', title: 'Cohorts', key: 'cohorts' },
  { kind: 'schema', title: 'Schemas', key: 'schemas' },
  { kind: 'import', title: 'Imports', key: 'imports' },
  { kind: 'source', title: 'Sources', key: 'sources' },
]

const FILE_KIND: Record<CatalogKind, WorkspaceFile['kind']> = { cohort: 'cohort', schema: 'schema', import: 'import', source: 'source' }

function fileOf(kind: CatalogKind, e: CatalogEntry): WorkspaceFile {
  return { path: e.path, kind: FILE_KIND[kind], spec: e.spec, target: e.target, state: e.state, reason: e.reason, format: e.format, size: e.size }
}

// entryOf builds the catalog entry of an item in an area (before the
// catalog is reloaded).
function entryOf(area: Area, path: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  const global = area === GLOBAL_AREA
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.(pulse|schema\.json|import\.json)$/, '')
  return { path, name, scope: global ? 'global' : 'local', ...(!global && { workspace: area }), ref_path: global ? `_global/${path}` : path, ...extra }
}

// CohortsView is the Cohorts tab: every cohort, saved schema, import
// spec and source of the library, Global and each workspace's Local
// ones apart (local ones tagged with their workspace), the import
// wizard (into Global or a workspace), and the selected item's view
// (Rebuild, Export, Make global for local items).
export function CohortsView({ libraryName, workspaces, onNewAnalysisOn, importAsk }: Props) {
  const [catalog, setCatalog] = useState<CohortsCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [selected, setSelected] = useState<Selected | null>(null)
  const [wizard, setWizard] = useState<{ start: WizardStart; n: number } | null>(null)
  const [justImported, setJustImported] = useState<ImportResult | null>(null)
  const [exporting, setExporting] = useState<{ cohort: string; area: Area; n: number } | null>(null)
  const [making, setMaking] = useState<Selected | null>(null)
  const [seq, setSeq] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [askedImport, setAskedImport] = useState<number | null>(null)
  if (importAsk && importAsk.n !== askedImport) {
    // Asked from elsewhere (New analysis with no cohorts): open Import.
    setAskedImport(importAsk.n)
    setWizard({ start: importAsk.area ? { area: importAsk.area } : {}, n: -importAsk.n })
  }

  useEffect(() => {
    const ctl = new AbortController()
    getCohorts(ctl.signal)
      .then((c) => {
        setCatalog(c)
        setError(null)
        // The selected item as the catalog now lists it (e.g. its spec).
        setSelected((sel) => {
          if (!sel) return sel
          const key = entryKey(sel.kind, sel.entry)
          const list = c[KINDS.find((k) => k.kind === sel.kind)!.key]
          const fresh = list.find((e) => entryKey(sel.kind, e) === key)
          return fresh ? { kind: sel.kind, entry: fresh } : sel
        })
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [reload])

  const next = () => {
    setSeq((n) => n + 1)
    return seq + 1
  }
  const changed = () => setReload((n) => n + 1)
  const startImport = (start: WizardStart) => setWizard({ start, n: next() })
  const select = (s: Selected) => {
    setWizard(null)
    if (s.kind === 'source') return startImport({ source: s.entry.path, area: areaOf(s.entry) })
    setSelected(s)
  }
  const targets = useMemo(
    () => [{ area: GLOBAL_AREA, label: 'Global (every workspace)' }, ...workspaces.map((w) => ({ area: w.slug, label: `Workspace: ${w.name}` }))],
    [workspaces],
  )
  const counts = catalog ? catalogCounts(catalog) : { global: 0, local: 0 }
  const scopeOf = (e: CatalogEntry): ScopeInfo => ({ global: e.scope === 'global', workspace: workspaceName(e.workspace, workspaces) })
  const dirOf = (e: CatalogEntry) => (e.scope === 'global' ? libraryName : `${libraryName}/workspaces/${e.workspace}`)

  let detail: React.ReactNode
  if (wizard) {
    detail = (
      <ImportWizard
        key={wizard.n}
        start={wizard.start}
        targets={targets}
        onClose={() => setWizard(null)}
        onImported={(r, area) => {
          setJustImported(r)
          setWizard(null)
          setSelected({ kind: 'cohort', entry: entryOf(area, r.file.path, { spec: r.spec }) })
          changed()
        }}
      />
    )
  } else if (selected) {
    const { kind, entry } = selected
    const area = areaOf(entry)
    const file = fileOf(kind, entry)
    const makeGlobal = canMakeGlobal(kind, entry) ? () => setMaking(selected) : undefined
    const recheck = (r: Recheck) => startImport({ source: r.source, schema: r.schema, target: r.target, area: r.area })
    let view: React.ReactNode
    if (kind === 'cohort')
      view = (
        <CohortView
          key={entryKey(kind, entry)}
          file={file}
          dir={dirOf(entry)}
          scope={scopeOf(entry)}
          onMakeGlobal={makeGlobal}
          justImported={justImported ?? undefined}
          onNewRequest={() => onNewAnalysisOn(entry.ref_path, entry.scope === 'local' ? (entry.workspace ?? null) : null)}
          onExport={(cohort) => setExporting({ cohort, area, n: next() })}
          onFilesChanged={changed}
          onRecheck={recheck}
        />
      )
    else if (kind === 'import')
      view = (
        <ImportSpecView
          key={entryKey(kind, entry)}
          file={file}
          dir={dirOf(entry)}
          scope={scopeOf(entry)}
          onOpen={(f) => select({ kind: 'cohort', entry: entryOf(area, f.path, { spec: f.spec }) })}
          onFilesChanged={changed}
          onRecheck={recheck}
        />
      )
    else view = <SchemaView key={entryKey(kind, entry)} file={file} scope={scopeOf(entry)} onMakeGlobal={makeGlobal} />
    detail = <AreaContext.Provider value={area}>{view}</AreaContext.Provider>
  } else {
    detail = (
      <div className="empty-state" data-testid="cohorts-empty-detail">
        <h2>Cohorts and schemas</h2>
        <p className="muted">
          Global cohorts and schemas are shared by every workspace; local ones belong to one workspace (Make global shares them). Pick
          one on the left, or import data.
        </p>
      </div>
    )
  }

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <>
      <aside className="sidebar">
        <nav
          className={'files' + (dragging ? ' dropping' : '')}
          aria-label="Cohorts"
          data-testid="cohorts-sidebar"
          onDragOver={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            if (!dragging) setDragging(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) startImport({ file: f })
          }}
        >
          {dragging && (
            <div className="drop-hint" data-testid="sidebar-drop">
              Drop to import
            </div>
          )}
          <div className="sidebar-actions">
            <button
              type="button"
              className="new-request-open"
              data-testid="import-open"
              title="Upload a CSV, Parquet, Excel, SPSS … file and import it as a cohort (or drop a file here)"
              onClick={() => startImport({})}
            >
              Import data
            </button>
          </div>
          <div className="list-filters">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search cohorts" data-testid="cohorts-search" />
            <div className="scope-filter" role="group" aria-label="Scope" data-testid="scope-filter">
              {(['all', 'global', 'local'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={scope === s ? 'on' : undefined}
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  data-testid={`scope-${s}`}
                >
                  {s === 'all' ? 'All' : s === 'global' ? `Global ${counts.global}` : `Local ${counts.local}`}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="err">{error}</p>}
          {!catalog && !error && <p className="muted">Loading…</p>}
          {catalog &&
            KINDS.map(({ kind, title, key }) => {
              const sections = sectionsOf(catalog[key], workspaces, scope, query)
              const n = sections.reduce((a, s) => a + s.entries.length, 0)
              if (n === 0) {
                if (kind !== 'cohort') return null
                return (
                  <section key={kind} className="file-group" data-kind={kind}>
                    <h2>{title}</h2>
                    <p className="muted" data-testid="cohorts-none">
                      {catalog.cohorts.length === 0 ? 'No cohorts yet. Import data to get started.' : 'None match.'}
                    </p>
                  </section>
                )
              }
              return (
                <section key={kind} className="file-group" data-kind={kind}>
                  <h2>
                    {title} <span className="count">{n}</span>
                  </h2>
                  {sections.map((sec) => (
                    <div key={sec.id} className="scope-section" data-testid="scope-section" data-scope={sec.scope} data-workspace={sec.scope === 'local' ? sec.id : undefined}>
                      <h3 className={'scope-head ' + sec.scope}>{sec.scope === 'global' ? 'Global' : `Local · ${sec.title}`}</h3>
                      <ul>
                        {sec.entries.map((e) => {
                          const k = entryKey(kind, e)
                          const isSel = selected !== null && !wizard && entryKey(selected.kind, selected.entry) === k
                          const badge = fileBadge({ kind: FILE_KIND[kind], state: e.state, spec: e.spec })
                          return (
                            <li key={k} className={kind === 'cohort' ? 'file-row' : undefined}>
                              <button
                                type="button"
                                className={'file' + (isSel ? ' selected' : '')}
                                title={`${e.scope === 'global' ? 'Global' : workspaceName(e.workspace, workspaces)}: ${e.path}`}
                                aria-current={isSel ? 'true' : undefined}
                                data-testid="catalog-row"
                                data-kind={kind}
                                data-path={e.path}
                                data-scope={e.scope}
                                data-workspace={e.workspace}
                                onClick={() => select({ kind, entry: e })}
                              >
                                <span className="file-name">{e.name}</span>
                                {kind === 'source' && e.size !== undefined && <span className="muted file-size">{formatBytes(e.size)}</span>}
                                {badge && (
                                  <span className={'file-badge ' + badge.tone} data-testid="file-badge">
                                    {badge.text}
                                  </span>
                                )}
                                <span className={'scope-tag ' + e.scope} data-testid="scope-tag">
                                  {e.scope === 'global' ? 'Global' : workspaceName(e.workspace, workspaces)}
                                </span>
                              </button>
                              {kind === 'cohort' && (
                                <button
                                  type="button"
                                  className="file-action"
                                  title={`Export ${e.path}…`}
                                  data-testid="cohort-export"
                                  data-path={e.path}
                                  data-scope={e.scope}
                                  onClick={() => setExporting({ cohort: e.path, area: areaOf(e), n: next() })}
                                >
                                  Export…
                                </button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              )
            })}
          {catalog?.truncated && <p className="muted">Listing truncated.</p>}
        </nav>
      </aside>
      <main className="canvas">{detail}</main>
      {exporting && (
        <AreaContext.Provider value={exporting.area}>
          <ExportDialog key={exporting.n} cohort={exporting.cohort} onClose={() => setExporting(null)} />
        </AreaContext.Provider>
      )}
      {making && making.entry.workspace && (
        <MakeGlobal
          kind={making.kind === 'cohort' ? 'cohort' : 'schema'}
          workspace={making.entry.workspace}
          workspaceName={workspaceName(making.entry.workspace, workspaces)}
          name={making.kind === 'cohort' ? making.entry.path : making.entry.name}
          onClose={() => setMaking(null)}
          onDone={(r) => {
            setMaking(null)
            setJustImported(null)
            setSelected({ kind: making.kind, entry: entryOf(GLOBAL_AREA, r.item.global_path) })
            changed()
          }}
        />
      )}
    </>
  )
}
