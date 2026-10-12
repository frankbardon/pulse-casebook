import { useCallback, useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow, ViewportPortal } from '@xyflow/react'
import {
  inspectCohort,
  readFile,
  saveFile,
  type Catalog,
  type CohortField,
  type FileKind,
  type WorkspaceFile,
} from '../api.ts'
import { cohortCandidates } from './cohortPath.ts'
import { toPlain, type JsonNode } from './jsonTree.ts'
import { emitModel, emitModelText, parseModel, updateNode, type GraphModel } from './model.ts'
import { buildRequestGraph } from './requestGraph.ts'
import { CohortNodeView, OpNodeView, RawNodeView } from './nodes.tsx'
import { Inspector } from './Inspector.tsx'
import './graph.css'

const nodeTypes = { op: OpNodeView, cohort: CohortNodeView, raw: RawNodeView }

const UNSUPPORTED: Partial<Record<FileKind, string>> = {
  compose: 'Compose requests',
  facet: 'Facet requests',
  chain: 'Chain requests',
  cohort: 'Cohort files',
}

type Props = { file: WorkspaceFile | null; catalog?: Catalog }

// RequestView opens the selected file. Plain requests render as a
// stage-column graph with an inspector; other kinds get a "not yet
// supported" view.
export function RequestView({ file, catalog }: Props) {
  if (!file) return <Empty title="No file open" body="Pick a request from the sidebar." />
  const unsupported = UNSUPPORTED[file.kind]
  if (unsupported) {
    return (
      <Empty
        testId="unsupported"
        title={`${unsupported} are not yet supported`}
        body={`${file.path} is a ${file.kind} file. The graph view opens plain requests only for now.`}
      />
    )
  }
  if (file.kind !== 'request') return <Empty title="Cannot open" body={file.reason ?? file.path} />
  return <RequestGraphView key={file.path} path={file.path} catalog={catalog} />
}

// Editing state of an open file. model is the lossless graph model every
// edit goes through; saved is the compact JSON of what is on disk, so
// dirty is a plain comparison.
type Doc = { model: GraphModel; saved: string }

function RequestGraphView({ path, catalog }: { path: string; catalog?: Catalog }) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<CohortField[] | undefined>(undefined)
  const [cohortError, setCohortError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    readFile(path, ctl.signal)
      .then(async (f) => {
        let model: GraphModel
        try {
          model = parseModel(f.text, 'request')
        } catch (e) {
          throw new Error(`invalid JSON: ${String(e)}`, { cause: e })
        }
        setDoc({ model, saved: emitModelText(model) })
        const plain = toPlain(emitModel(model)) as { cohort?: unknown }
        const candidates = cohortCandidates(path, plain.cohort)
        let last: unknown = new Error('request names no cohort file')
        for (const c of candidates) {
          try {
            const res = await inspectCohort(c, ctl.signal)
            setFields(res.fields)
            return
          } catch (e) {
            if (ctl.signal.aborted) return
            last = e
          }
        }
        setCohortError(`cohort not inspected: ${String(last)}`)
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [path])

  const text = useMemo(() => (doc ? emitModelText(doc.model) : ''), [doc])
  const dirty = doc !== null && text !== doc.saved

  const graph = useMemo(() => {
    if (doc === null) return null
    try {
      // toPlain is fine here: the graph is a read-only rendering.
      const g = buildRequestGraph(toPlain(emitModel(doc.model)), { manifest: catalog?.manifest, cohortFields: fields })
      for (const n of g.nodes) n.selected = n.id === selected
      return g
    } catch (e) {
      return String(e)
    }
  }, [doc, catalog, fields, selected])

  const edit = useCallback(
    (id: string, value: JsonNode) => setDoc((d) => (d ? { ...d, model: updateNode(d.model, id, value) } : d)),
    [],
  )

  const save = useCallback(async () => {
    if (!doc || saving || !dirty) return
    setSaving(true)
    setSaveError(null)
    const sent = text
    try {
      const res = await saveFile(path, sent)
      const onDisk = parseModel(res.text, 'request')
      // Edits made while the save was in flight stay dirty.
      setDoc((d) => (d && emitModelText(d.model) === sent ? { model: onDisk, saved: emitModelText(onDisk) } : d && { ...d, saved: sent }))
    } catch (e) {
      setSaveError(`save failed: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [doc, saving, dirty, text, path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (error) return <Empty title="Cannot open" body={error} />
  if (graph === null || doc === null) return <Empty title="Loading…" body={path} />
  if (typeof graph === 'string') return <Empty title="Cannot open" body={graph} />
  const node = selected !== null ? doc.model.nodes.get(selected) : undefined

  return (
    <div className="graph" data-testid="request-graph">
      <div className="graph-bar">
        <span className="graph-path">{path}</span>
        <span className={dirty ? 'dirty' : 'muted'} data-testid="dirty-state">
          {saving ? 'saving…' : dirty ? '● unsaved changes' : 'saved'}
        </span>
        <button type="button" className="save" disabled={!dirty || saving} onClick={() => void save()} title="Save (Cmd/Ctrl+S)">
          Save
        </button>
        {saveError && <span className="err">{saveError}</span>}
        {cohortError && <span className="err">{cohortError}</span>}
      </div>
      <div className="graph-body">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          onNodeClick={(_, n) => setSelected(n.id)}
          onPaneClick={() => setSelected(null)}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <ViewportPortal>
            {graph.columns.map((c) => (
              <div key={c.key} className="col-title" style={{ transform: `translate(${c.x}px, -28px)` }}>
                {c.title}
              </div>
            ))}
          </ViewportPortal>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
        {node && (
          <Inspector
            node={node}
            catalog={catalog ?? {}}
            onChange={(v) => edit(node.id, v)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}

function Empty({ title, body, testId }: { title: string; body: string; testId?: string }) {
  return (
    <div className="empty" data-testid={testId}>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
    </div>
  )
}
