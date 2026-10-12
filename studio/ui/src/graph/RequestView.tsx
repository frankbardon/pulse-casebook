import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ViewportPortal,
  getBezierPath,
  useStore,
  useStoreApi,
  type Connection,
  type ConnectionLineComponentProps,
  type Dimensions,
  type FinalConnectionState,
  type NodeChange,
  type ReactFlowInstance,
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
import { buildRequestGraph, type GraphEdge, type GraphNode } from './requestGraph.ts'
import { emptyLayout, layoutText, moveNode, parseLayout, positionOf, pruneLayout, renameNodes, type Layout } from './layout.ts'
import { isPathPrefix, parsePath } from './nodePath.ts'
import {
  checkConnection,
  clampToColumn,
  columnAllows,
  columnAt,
  connectWire,
  deletable,
  deleteNode,
  disconnectWires,
  type Wire,
  type WireCheck,
} from './wiring.ts'
import { CohortNodeView, OpNodeView, RawNodeView } from './nodes.tsx'
import { Inspector } from './Inspector.tsx'
import { Palette } from './Palette.tsx'
import { itemsForPort, PALETTE_MIME, paletteItems, placeNode, type PaletteItem, type PortSource } from './palette.ts'
import { emitsType } from './ports.ts'
import { PreviewContext, usePreviews } from './usePreviews.ts'
import { useValidation, ValidationContext } from './useValidation.ts'
import { proposal, worst, type Issue } from './validation.ts'
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
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // Why the last dropped wire (or palette drop) was refused, shown until
  // the next gesture.
  const [notice, setNotice] = useState<{ text: string; testId: string } | null>(null)
  // The side palette, and the palette a field port drag opened on the
  // pane (at: popup position in the canvas box; flow: drop point).
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [portPick, setPortPick] = useState<PortPick | null>(null)
  const portOpened = useRef(0)
  const flowBox = useRef<HTMLDivElement>(null)
  const rf = useRef<ReactFlowInstance<GraphNode, GraphEdge> | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
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

  // Live previews need the cohort: until it is inspected they are off.
  const previews = usePreviews(
    path,
    doc?.model ?? null,
    graph !== null && typeof graph !== 'string' ? graph : null,
    fields !== undefined ? undefined : cohortError !== null ? 'no cohort, no preview' : 'waiting for cohort',
  )

  // Validation (manifest checks + engine predict / explain of the
  // in-memory document) reaches nodes by context, like previews.
  const nodeIds = useMemo(() => (graph !== null && typeof graph !== 'string' ? graph.nodes.map((n) => n.id) : []), [graph])
  const validationCatalog = useMemo(() => catalog ?? {}, [catalog])
  const validation = useValidation(path, doc?.model ?? null, nodeIds, validationCatalog, fields)

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

  const edges = useMemo((): GraphEdge[] => {
    if (graph === null || typeof graph === 'string') return []
    return graph.edges.map((e) => (e.id === selectedEdge ? { ...e, selected: true } : e))
  }, [graph, selectedEdge])

  // Column lookup for drags: a node stays inside its own stage column.
  const placed = graph !== null && typeof graph !== 'string' ? graph : null
  const columnOf = useMemo(() => new Map(placed?.nodes.map((n) => [n.id, n.data.column]) ?? []), [placed])

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
      for (const c of moves) {
        if (c.type !== 'position' || !c.position) continue
        const column = columnOf.get(c.id)
        const pos = column && placed ? clampToColumn(c.position, column, placed.columns) : c.position
        layout = moveNode(layout, c.id, pos)
      }
      return { ...l, layout }
    })
  }, [columnOf, placed])

  const wireCtx = useMemo(() => ({ manifest: catalog?.manifest, cohortFields: fields }), [catalog, fields])
  const check = useCallback(
    (w: Wire): WireCheck => (placed ? checkConnection(placed, w, wireCtx) : { ok: false, reason: 'no graph' }),
    [placed, wireCtx],
  )

  const show = useCallback((n: { text: string; testId: string } | null) => {
    clearTimeout(noteTimer.current)
    setNotice(n)
    if (n !== null) noteTimer.current = setTimeout(() => setNotice(null), 6000)
  }, [])
  const note = useCallback((reason: string | null) => show(reason === null ? null : { text: `Wire refused: ${reason}`, testId: 'wire-refused' }), [show])
  useEffect(() => () => clearTimeout(noteTimer.current), [])

  // A wire drawn into an input writes the source's field or label name
  // there; the graph re-derives its edges from the edited model.
  const onConnect = useCallback(
    (c: Connection) => {
      const r = check(c)
      if (!r.ok) return note(r.reason)
      note(null)
      setDoc((d) => (d && c.target ? { ...d, model: connectWire(d.model, c.target, r.rowKey, r.ref) } : d))
    },
    [check, note],
  )

  // A wire dropped on an input that refuses it leaves the reason on screen.
  const onConnectEnd = useCallback(
    (ev: MouseEvent | TouchEvent, s: FinalConnectionState) => {
      if (!s.toHandle && s.fromHandle?.type === 'source' && onPane(ev)) {
        const src = placed ? portSource(placed.nodes, s.fromHandle, catalog?.manifest, fields) : null
        const box = flowBox.current?.getBoundingClientRect()
        if (!src || !box || !rf.current) return
        const { clientX, clientY } = pointOf(ev)
        portOpened.current = Date.now()
        setPortPick({
          src,
          at: { left: clientX - box.left, top: clientY - box.top, width: box.width, height: box.height },
          flow: rf.current.screenToFlowPosition({ x: clientX, y: clientY }),
        })
        return
      }
      if (s.isValid !== false || !s.fromHandle || !s.toHandle) return
      const r = check(wireOf(s.fromHandle, s.toHandle))
      if (!r.ok) note(r.reason)
    },
    [check, note, placed, catalog, fields],
  )

  // Deleting a node removes its JSON (and so its wires); deleting a wire
  // clears the param it fed. The cohort is never deleted.
  const onBeforeDelete = useCallback(
    async ({ nodes: ns, edges: es }: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
      const keep = doc ? ns.filter((n) => deletable(doc.model, n.id)) : []
      if (ns.length > 0 && keep.length === 0) return false
      return { nodes: keep, edges: es }
    },
    [doc],
  )
  const remove = useCallback(
    (nodeIds: string[], wires: GraphEdge[]) => {
      if (!doc) return
      let model = doc.model
      let layout = lay.layout
      const gone = (id: string) => nodeIds.some((g) => isPathPrefix(g, id))
      model = disconnectWires(
        model,
        wires
          .filter((e) => !gone(e.source) && !gone(e.target) && e.targetHandle?.startsWith('in:'))
          .map((e) => ({ target: e.target, rowKey: e.targetHandle!.slice(3) })),
      )
      // Later siblings first, so earlier ids stay valid.
      for (const id of [...nodeIds].sort(byPathDesc)) {
        if (!deletable(model, id)) continue
        const r = deleteNode(model, id)
        model = r.model
        layout = renameNodes(layout, (x) => isPathPrefix(id, x), r.renames)
      }
      if (model !== doc.model) setDoc({ ...doc, model })
      if (layout !== lay.layout) setLay({ ...lay, layout })
      if (selected !== null && nodeIds.includes(selected)) setSelected(null)
      setSelectedEdge(null)
    },
    [doc, lay, selected],
  )
  const onDelete = useCallback(
    ({ nodes: ns, edges: es }: { nodes: GraphNode[]; edges: GraphEdge[] }) => remove(ns.map((n) => n.id), es),
    [remove],
  )

  const edit = useCallback(
    (id: string, value: JsonNode) => setDoc((d) => (d ? { ...d, model: updateNode(d.model, id, value) } : d)),
    [],
  )

  // The palette is generated from the catalog: a catalog reload (engine
  // or feature-set change) regenerates it.
  const items = useMemo(() => paletteItems(catalog?.manifest), [catalog])
  const portItems = useMemo(
    () => (portPick && doc ? itemsForPort(items, catalog?.manifest, doc.model, portPick.src) : []),
    [portPick, doc, items, catalog],
  )

  // place appends a new entry for item (wired, when a port drag opened
  // the palette) and selects it. With a drop point the node sits there,
  // snapped to its own stage column; without one, or when that column is
  // not drawn yet, it is auto-laid out.
  const place = useCallback(
    (item: PaletteItem, at?: { x: number; y: number }, wire?: { rowKey: string; ref: string }) => {
      if (!doc) return
      let r: { model: GraphModel; id: string }
      try {
        r = placeNode(doc.model, item, { manifest: catalog?.manifest, schema: catalog?.schema, cohortFields: fields, wire })
      } catch (e) {
        show({ text: `Cannot add ${item.op}: ${e instanceof Error ? e.message : String(e)}`, testId: 'place-refused' })
        return
      }
      setDoc({ ...doc, model: r.model })
      const col = at && placed?.columns.find((c) => c.key === item.column)
      setLay((l) => {
        // A stale sidecar entry for the reused id never positions the new node.
        const layout = renameNodes(l.layout, (x) => x === r.id, new Map())
        return { ...l, layout: col ? moveNode(layout, r.id, { x: col.x, y: at.y }) : layout }
      })
      setSelected(r.id)
      setSelectedEdge(null)
      show(null)
    },
    [doc, catalog, fields, placed, show],
  )

  // A palette item dropped on the canvas lands in its own stage column
  // only (wiring.columnAt / columnAllows).
  const onDrop = useCallback(
    (e: DragEvent) => {
      const key = e.dataTransfer.getData(PALETTE_MIME)
      const item = key ? items.find((i) => i.key === key) : undefined
      if (!item || !rf.current || !placed) return
      e.preventDefault()
      const pos = rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const own = placed.columns.find((c) => c.key === item.column)
      if (own && !columnAllows(item.column, columnAt(pos.x, placed.columns))) {
        show({ text: `${item.op} is a ${item.kind.toLowerCase()}: drop it in the ${own.title} column`, testId: 'place-refused' })
        return
      }
      place(item, own ? pos : undefined)
    },
    [items, placed, place, show],
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
        <button
          type="button"
          className={paletteOpen ? 'on' : undefined}
          data-testid="palette-toggle"
          aria-pressed={paletteOpen}
          onClick={() => setPaletteOpen((o) => !o)}
          title="Add a node from the operator palette"
        >
          + Node
        </button>
        {saveError && <span className="err">{saveError}</span>}
        {cohortError && <span className="err">{cohortError}</span>}
        <RequestIssues issues={validation.request} failed={validation.failed} />
      </div>
      <div className="graph-body">
        {paletteOpen && (
          <Palette
            items={items}
            heading="Add node"
            testId="palette"
            className="palette-panel"
            draggable
            onPick={(it) => place(it)}
            onClose={() => setPaletteOpen(false)}
          />
        )}
        <div
          className="graph-flow"
          ref={flowBox}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(PALETTE_MIME)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={onDrop}
        >
          <PreviewContext value={previews}>
            <ValidationContext value={validation}>
              <WireCheckContext value={check}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  isValidConnection={(c) => check(c).ok}
                  onConnect={onConnect}
                  onConnectStart={() => note(null)}
                  onConnectEnd={onConnectEnd}
                  connectionLineComponent={WireLine}
                  connectionRadius={24}
                  deleteKeyCode={DELETE_KEYS}
                  onBeforeDelete={onBeforeDelete}
                  onDelete={onDelete}
                  onNodeClick={(_, n) => {
                    setSelected(n.id)
                    setSelectedEdge(null)
                  }}
                  onEdgeClick={(_, e) => {
                    setSelectedEdge(e.id)
                    setSelected(null)
                  }}
                  onPaneClick={() => {
                    // The click that ends a port drag on the pane must not
                    // close the palette that drag just opened.
                    if (Date.now() - portOpened.current < 300) return
                    setSelected(null)
                    setSelectedEdge(null)
                    setPortPick(null)
                  }}
                  onInit={(i) => {
                    rf.current = i
                  }}
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
              </WireCheckContext>
            </ValidationContext>
          </PreviewContext>
          {portPick && (
            <Palette
              key={`${portPick.src.ref}@${portPick.at.left},${portPick.at.top}`}
              items={portItems}
              heading={`Feed ${portPick.src.ref}${portPick.src.type ? ` (${portPick.src.type})` : ''} into…`}
              testId="port-palette"
              className="palette-popup"
              style={popupStyle(portPick.at)}
              hint={(it) => it.rowKey}
              onPick={(it) => {
                setPortPick(null)
                place(it, portPick.flow, { rowKey: it.rowKey, ref: portPick.src.ref })
              }}
              onClose={() => setPortPick(null)}
            />
          )}
          {notice && (
            <div className="wire-note" role="status" data-testid={notice.testId}>
              {notice.text}
            </div>
          )}
        </div>
        {node && (
          <Inspector
            node={node}
            catalog={catalog ?? {}}
            onChange={(v) => edit(node.id, v)}
            onClose={() => setSelected(null)}
            onDelete={deletable(doc.model, node.id) ? () => remove([node.id], []) : undefined}
          />
        )}
      </div>
    </div>
  )
}

const DELETE_KEYS = ['Backspace', 'Delete']

// RequestIssues shows, on the request bar, the issues no node covers.
function RequestIssues({ issues, failed }: { issues: Issue[]; failed?: string }) {
  const shown = issues.filter((i) => i.severity !== 'hint')
  const sev = worst(shown)
  if (failed) {
    return (
      <span className="request-issues warning" data-testid="request-issues" title={failed}>
        validation unavailable
      </span>
    )
  }
  if (!sev) return null
  const title = shown.map((i) => (proposal(i) ? `${i.message} (try ${proposal(i)})` : i.message)).join('\n')
  return (
    <span className={'request-issues ' + sev} data-testid="request-issues" data-severity={sev} title={title}>
      {shown.length} request {shown.length === 1 ? 'issue' : 'issues'}
    </span>
  )
}

// WireCheckContext hands the connection check to the connection line,
// which React Flow renders outside our props.
const WireCheckContext = createContext<((w: Wire) => WireCheck) | null>(null)

// wireOf orients a gesture's two handles as source -> target.
function wireOf(
  from: { nodeId: string; id?: string | null; type: string },
  to: { nodeId: string; id?: string | null; type: string },
): Wire {
  const [s, t] = from.type === 'source' ? [from, to] : [to, from]
  return { source: s.nodeId, sourceHandle: s.id ?? null, target: t.nodeId, targetHandle: t.id ?? null }
}

// WireLine is the wire being drawn; over an input that refuses it, it
// shows why next to the cursor.
function WireLine({ fromX, fromY, toX, toY, fromPosition, toPosition, fromHandle, toHandle, connectionStatus }: ConnectionLineComponentProps<GraphNode>) {
  const check = use(WireCheckContext)
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition, targetX: toX, targetY: toY, targetPosition: toPosition })
  const r = toHandle && connectionStatus === 'invalid' && check ? check(wireOf(fromHandle, toHandle)) : null
  const refused = r && !r.ok ? r.reason : null
  return (
    <g>
      <path d={path} fill="none" className="react-flow__connection-path" stroke={refused ? 'var(--danger)' : 'var(--accent)'} strokeWidth={1.5} />
      {refused && (
        <text x={toX + 10} y={toY - 10} className="wire-hint" data-testid="wire-hint">
          {refused}
        </text>
      )}
    </g>
  )
}

// PortPick is a palette opened by dropping a field port drag on the pane.
type PortPick = {
  src: PortSource
  at: { left: number; top: number; width: number; height: number }
  flow: { x: number; y: number }
}

// portSource describes the port a drag started from: a cohort field (its
// inspected type) or a producer's label (its manifest emits_type).
function portSource(
  nodes: GraphNode[],
  from: { nodeId: string; id?: string | null },
  manifest: Catalog['manifest'] | undefined,
  fields: CohortField[] | undefined,
): PortSource | null {
  const n = nodes.find((x) => x.id === from.nodeId)
  if (n?.type === 'cohort' && from.id?.startsWith('field:')) {
    const ref = from.id.slice('field:'.length)
    const type = fields?.find((f) => f.name === ref)?.type
    return { ref, ...(type && { type }) }
  }
  if (n?.type === 'op' && from.id === 'out' && n.data.name !== undefined) {
    const last = parsePath(n.id).at(-1)
    const type = emitsType(manifest, n.data.section, n.data.op)
    return {
      ref: n.data.name,
      ...(type && { type }),
      producer: { section: n.data.section, index: typeof last === 'number' ? last : 0 },
    }
  }
  return null
}

// onPane says whether a gesture ended on the empty canvas (not a node).
function onPane(ev: MouseEvent | TouchEvent): boolean {
  const { clientX, clientY } = pointOf(ev)
  const el = document.elementFromPoint(clientX, clientY)
  return !!el?.closest('.react-flow') && !el.closest('.react-flow__node, .react-flow__controls, .react-flow__handle')
}

function pointOf(ev: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
  return 'changedTouches' in ev ? ev.changedTouches[0] : ev
}

const POPUP = { width: 300, height: 340 }

// popupStyle keeps the port palette inside the canvas box.
function popupStyle(at: PortPick['at']): CSSProperties {
  return {
    left: Math.max(4, Math.min(at.left, at.width - POPUP.width - 4)),
    top: Math.max(4, Math.min(at.top, at.height - POPUP.height - 4)),
  }
}

// byPathDesc orders node ids so later array items come first.
function byPathDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true })
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
