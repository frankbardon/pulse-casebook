import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ViewportPortal,
  useStore,
  useStoreApi,
  type Dimensions,
  type NodeChange,
  type ReactFlowState,
} from '@xyflow/react'
import {
  inspectCohort,
  readFile,
  readLayout,
  saveFile,
  saveLayout,
  type Catalog,
  type CohortField,
  type FileKind,
  type WorkspaceFile,
} from '../api.ts'
import { cohortCandidates } from './cohortPath.ts'
import { toPlain, type JsonNode } from './jsonTree.ts'
import { emitModel, emitModelText, parseModel, updateNode, type GraphModel } from './model.ts'
import { buildRequestGraph, type GraphNode } from './requestGraph.ts'
import { emptyLayout, layoutText, moveNode, parseLayout, positionOf, pruneLayout, type Layout } from './layout.ts'
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

// Layout state: the sidecar's current contents and the text of what is
// on disk (layoutText of an empty layout when there is no sidecar).
type LayoutDoc = { layout: Layout; saved: string }

const EMPTY_LAYOUT: LayoutDoc = { layout: emptyLayout(), saved: layoutText(emptyLayout()) }

function RequestGraphView({ path, catalog }: { path: string; catalog?: Catalog }) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<CohortField[] | undefined>(undefined)
  const [cohortError, setCohortError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lay, setLay] = useState<LayoutDoc>(EMPTY_LAYOUT)
  // Measured node sizes, fed back from React Flow's dimension changes.
  // The nodes prop is controlled and rebuilt on every layout, selection or
  // model change; a node handed back without measured is treated as
  // unmeasured and stays hidden until its size changes, which may never
  // happen.
  const [measured, setMeasured] = useState<ReadonlyMap<string, Dimensions>>(new Map())

  useEffect(() => {
    const ctl = new AbortController()
    // A missing or unreadable sidecar means auto-layout, never an error.
    readLayout(path, ctl.signal)
      .then((f) => {
        const layout = parseLayout(f.layout)
        setLay({ layout, saved: layoutText(layout) })
      })
      .catch(() => {})
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
  const textDirty = doc !== null && text !== doc.saved
  const layoutDirty = layoutText(lay.layout) !== lay.saved
  const dirty = textDirty || layoutDirty

  const graph = useMemo(() => {
    if (doc === null) return null
    try {
      // toPlain is fine here: the graph is a read-only rendering.
      return buildRequestGraph(toPlain(emitModel(doc.model)), { manifest: catalog?.manifest, cohortFields: fields })
    } catch (e) {
      return String(e)
    }
  }, [doc, catalog, fields])

  // Sidecar positions override auto-layout; ids the graph no longer has
  // are simply never looked up.
  const nodes = useMemo((): GraphNode[] => {
    if (graph === null || typeof graph === 'string') return []
    return graph.nodes.map((n) => ({
      ...n,
      position: positionOf(lay.layout, n.id) ?? n.position,
      selected: n.id === selected,
      measured: measured.get(n.id),
    }))
  }, [graph, lay.layout, selected, measured])

  const onNodesChange = useCallback((changes: NodeChange<GraphNode>[]) => {
    const sizes = changes.filter((c) => c.type === 'dimensions' && c.dimensions)
    if (sizes.length > 0) {
      setMeasured((m) => {
        const next = new Map(m)
        let changed = false
        for (const c of sizes) {
          if (c.type !== 'dimensions' || !c.dimensions) continue
          const was = m.get(c.id)
          if (was && was.width === c.dimensions.width && was.height === c.dimensions.height) continue
          next.set(c.id, c.dimensions)
          changed = true
        }
        return changed ? next : m
      })
    }
    const moves = changes.filter((c) => c.type === 'position' && c.position)
    if (moves.length === 0) return
    setLay((l) => {
      let layout = l.layout
      for (const c of moves) if (c.type === 'position' && c.position) layout = moveNode(layout, c.id, c.position)
      return { ...l, layout }
    })
  }, [])

  const edit = useCallback(
    (id: string, value: JsonNode) => setDoc((d) => (d ? { ...d, model: updateNode(d.model, id, value) } : d)),
    [],
  )

  const save = useCallback(async () => {
    if (!doc || saving || !dirty) return
    setSaving(true)
    setSaveError(null)
    try {
      if (textDirty) {
        const sent = text
        const res = await saveFile(path, sent)
        const onDisk = parseModel(res.text, 'request')
        // Edits made while the save was in flight stay dirty.
        setDoc((d) => (d && emitModelText(d.model) === sent ? { model: onDisk, saved: emitModelText(onDisk) } : d && { ...d, saved: sent }))
      }
      // The sidecar is written beside the request when the layout changed;
      // entries for nodes that no longer exist are dropped.
      if (layoutDirty && graph !== null && typeof graph !== 'string') {
        const sent = layoutText(lay.layout)
        const res = await saveLayout(path, layoutText(pruneLayout(lay.layout, graph.nodes.map((n) => n.id))))
        const onDisk = parseLayout(res.layout)
        const savedText = layoutText(onDisk)
        setLay((l) => (layoutText(l.layout) === sent ? { layout: onDisk, saved: savedText } : { ...l, saved: savedText }))
      }
    } catch (e) {
      setSaveError(`save failed: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [doc, saving, dirty, textDirty, layoutDirty, text, lay, graph, path])

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
          nodes={nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
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
          <RemeasureUnready />
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

// unreadyIds lists the visible nodes React Flow holds without a size or
// handle bounds, newline-joined so the selector result compares by value.
function unreadyIds(s: ReactFlowState): string {
  const ids: string[] = []
  for (const [id, n] of s.nodeLookup) {
    if (!n.hidden && (!n.measured.width || !n.measured.height || !n.internals.handleBounds)) ids.push(id)
  }
  return ids.join('\n')
}

// RemeasureUnready measures nodes React Flow is left holding unmeasured.
// Its node observer only re-measures when a node goes from measured to
// unmeasured across renders; when a nodes rebuild (layout sidecar or
// cohort fields arriving) lands in the same render as the first
// measurement, the node stays hidden or edgeless for good. Measuring here
// is a no-op for nodes that are already ready.
function RemeasureUnready() {
  const unready = useStore(unreadyIds)
  const store = useStoreApi()
  useEffect(() => {
    if (unready === '') return
    const { domNode, updateNodeInternals } = store.getState()
    const updates = new Map<string, { id: string; nodeElement: HTMLDivElement }>()
    for (const id of unready.split('\n')) {
      const el = domNode?.querySelector<HTMLDivElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
      if (el) updates.set(id, { id, nodeElement: el })
    }
    if (updates.size > 0) updateNodeInternals(updates)
  }, [unready, store])
  return null
}

function Empty({ title, body, testId }: { title: string; body: string; testId?: string }) {
  return (
    <div className="empty" data-testid={testId}>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
    </div>
  )
}
