import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
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
  listFiles,
  readFile,
  readLayout,
  saveFile,
  saveLayout,
  type Catalog,
  type CohortField,
  type FileContent,
  type WorkspaceFile,
} from '../api.ts'
import { cohortCandidates } from './cohortPath.ts'
import { anchorUnreadable, cohortOptions, joinIssues, rightKey, type RightSide } from './joins.ts'
import { toPlain, type JsonNode } from './jsonTree.ts'
import { emitModel, emitModelText, parseModel, updateNode, type GraphModel } from './model.ts'
import { buildRequestGraph, estimateHeight, LAYOUT, type GraphEdge, type GraphNode, type RequestGraph } from './requestGraph.ts'
import { emptyLayout, layoutText, moveNode, parseLayout, positionOf, pruneLayout, renameNodes, type Layout } from './layout.ts'
import { frameOf, isPathPrefix, parsePath, type PathSegment } from './nodePath.ts'
import { buildChainGraph, type ChainGraph } from './chainGraph.ts'
import { chainRefusal } from './chainRules.ts'
import { buildFacetGraph, FACET_NODE, FACET_PROPS } from './facetGraph.ts'
import { FacetInspector } from './FacetInspector.tsx'
import { buildComposeGraph, LANE, laneAt, laneOrder, moveLane, ROOT_LANE, stackLanes, type ComposeGraph, type LaneBox } from './composeGraph.ts'
import { addLane, laneNoun, moveStage, removable, removeLane, renameLane, renameLaneIds } from './lanes.ts'
import { LaneActionsContext, type LaneActions } from './laneActions.ts'
import { JoinViewContext, type JoinView } from './joinView.ts'
import {
  checkConnection,
  connectWire,
  deletable,
  deleteNode,
  disconnectWires,
  type Wire,
  type WireCheck,
} from './wiring.ts'
import { CohortNodeView, FacetNodeView, LaneNodeView, OpNodeView, RawNodeView, type LaneNode } from './nodes.tsx'
import { ResultNodeView } from './ResponseNode.tsx'
import { Inspector } from './Inspector.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { groupKeysOfModel } from './partition.ts'
import { vectorNamesOfModel } from './paramForms.ts'
import { Palette } from './Palette.tsx'
import { itemsForPort, PALETTE_MIME, paletteItems, placeNode, type PaletteItem, type PortSource } from './palette.ts'
import { emitsType } from './ports.ts'
import { PreviewContext, usePreviews } from './usePreviews.ts'
import { useValidation, ValidationContext } from './useValidation.ts'
import { RunContext, useRun, type RunResults } from './useRun.ts'
import { ResultsPanel } from './ResultsPanel.tsx'
import { proposal, unusedColumnIssues, worst, type Issue } from './validation.ts'
import { createFocusStore, hoverTarget } from './focus.ts'
import { EdgeRouter, FocusStyle, WireEdge, type RouteStatus } from './WireEdge.tsx'
import { readWireMode, RouteContext, RouteStore, writeWireMode, type WireMode } from './wires.ts'
import './graph.css'
import { useArea } from '../area.ts'
import { modeOf } from '../modes.ts'

const nodeTypes = { op: OpNodeView, cohort: CohortNodeView, raw: RawNodeView, facet: FacetNodeView, lane: LaneNodeView, result: ResultNodeView }
const edgeTypes = { wire: WireEdge }

// FlowNode is what the canvas draws: graph nodes plus lanes (parent
// nodes holding a compose slot's or fit's, or a chain stage's, nodes).
type FlowNode = GraphNode | LaneNode

// The request roots the graph view opens.
type ViewKind = 'request' | 'compose' | 'chain' | 'facet'

// history: the workspace is kept in git, so the History panel is offered.
type Props = { file: WorkspaceFile | null; catalog?: Catalog; history?: boolean }

// RequestView opens the selected file. Plain requests render as a
// stage-column graph with an inspector; compose requests as parallel
// lanes of such graphs (composeGraph.ts); chains as stacked stage lanes
// (chainGraph.ts); facets as the cohort, filters and a facet output node
// (facetGraph.ts). A cohort file is data, not a request: it points at
// New request.
export function RequestView({ file, catalog, history = false }: Props) {
  if (!file) return <Empty title="No analysis open" body="Pick an analysis from the list, or start a New analysis." />
  if (file.kind === 'cohort') {
    return (
      <Empty
        testId="cohort-file"
        title="Cohort file"
        body={`${file.path} is a cohort. Use New analysis to build an analysis on it.`}
      />
    )
  }
  if (file.kind === 'unopenable') return <Empty testId="unopenable" title="Cannot open" body={file.reason ?? file.path} />
  // Import files have their own views (importer/views.tsx).
  if (file.kind === 'source' || file.kind === 'schema' || file.kind === 'import') return <Empty title="Not an analysis" body={file.path} />
  return <RequestGraphView key={file.path} path={file.path} kind={file.kind} catalog={catalog} history={history} />
}

// The canvas graph: a plain request's or facet's graph, or the lanes of
// a compose or chain root (inputs: each chain stage's input columns).
type ViewGraph = RequestGraph & { compose?: ComposeGraph; inputs?: ChainGraph['inputs'] }

// Cohort inspection of one distinct cohort reference (keyed by its JSON).
// unreadable: a join's anchored right (`archive.pulse#shard.pulse`)
// whose archive exists but whose shard inspect could not read; its
// fields are unknown, which is not the same as a missing file.
type CohortState = { fields?: CohortField[]; error?: string; unreadable?: true }

// Editing state of an open file. model is the lossless graph model every
// edit goes through; saved is the compact JSON of what is on disk, so
// dirty is a plain comparison.
type Doc = { model: GraphModel; saved: string }

// Layout state: the sidecar's current contents and the text of what is
// on disk (layoutText of an empty layout when there is no sidecar).
type LayoutDoc = { layout: Layout; saved: string }

const EMPTY_LAYOUT: LayoutDoc = { layout: emptyLayout(), saved: layoutText(emptyLayout()) }

function RequestGraphView({ path, kind, catalog, history }: { path: string; kind: ViewKind; catalog?: Catalog; history: boolean }) {
  const area = useArea()
  const [doc, setDoc] = useState<Doc | null>(null)
  // The history panel, and a counter bumped by every save or restore so
  // it refetches the file's commits.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Inspected cohorts by cohort-reference JSON (one per plain request,
  // one per distinct cohort across compose lanes).
  const [cohorts, setCohorts] = useState<ReadonlyMap<string, CohortState>>(new Map())
  const asked = useRef(new Set<string>())
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
  const rf = useRef<ReactFlowInstance<FlowNode, GraphEdge> | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The workspace's cohort files, offered as a join's right side.
  const [cohortFiles, setCohortFiles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lay, setLay] = useState<LayoutDoc>(EMPTY_LAYOUT)
  // Measured node sizes, fed back from React Flow's dimension changes.
  // The nodes prop is controlled and rebuilt on every layout, selection or
  // model change; a node handed back without measured is treated as
  // unmeasured and stays hidden until its size changes, which may never
  // happen.
  const [measured, setMeasured] = useState<ReadonlyMap<string, Dimensions>>(new Map())
  // Wires: routed around nodes or plain curves (per viewer), the latest
  // routes, and the hover/selection focus that lights a node's wires.
  // Routes and focus live outside React state: neither rebuilds the
  // controlled node or edge arrays.
  const [wireMode, setWireMode] = useState<WireMode>(readWireMode)
  const [routes] = useState(() => new RouteStore())
  const [focus] = useState(createFocusStore)
  const routeStatus = useCallback((st: RouteStatus) => {
    const el = flowBox.current
    if (!el) return
    el.dataset.routing = st.state
    if (st.ms !== undefined) el.dataset.routeMs = st.ms.toFixed(1)
    if (st.error !== undefined) el.title = `Wire routing unavailable: ${st.error}`
  }, [])
  const toggleWires = useCallback(() => {
    setWireMode((m) => {
      const next = m === 'routed' ? 'curves' : 'routed'
      writeWireMode(next)
      return next
    })
  }, [])
  useEffect(() => {
    focus.set({ selectedNode: selected ?? undefined, selectedEdge: selectedEdge ?? undefined })
  }, [focus, selected, selectedEdge])

  useEffect(() => {
    const ctl = new AbortController()
    listFiles(area, ctl.signal)
      .then((l) => setCohortFiles(l.files.filter((f) => f.kind === 'cohort').map((f) => f.path)))
      .catch(() => {})
    return () => ctl.abort()
  }, [area, path])
  const cohortChoices = useMemo(() => cohortOptions(path, cohortFiles), [path, cohortFiles])

  useEffect(() => {
    const ctl = new AbortController()
    // A missing or unreadable sidecar means auto-layout, never an error.
    readLayout(area, path, ctl.signal)
      .then((f) => {
        const layout = parseLayout(f.layout)
        setLay({ layout, saved: layoutText(layout) })
      })
      .catch(() => {})
    readFile(area, path, ctl.signal)
      .then((f) => {
        let model: GraphModel
        try {
          model = parseModel(f.text, kind)
        } catch (e) {
          throw new Error(`invalid JSON: ${String(e)}`, { cause: e })
        }
        setDoc({ model, saved: emitModelText(model) })
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [area, path, kind])

  const text = useMemo(() => (doc ? emitModelText(doc.model) : ''), [doc])
  const textDirty = doc !== null && text !== doc.saved
  const layoutDirty = layoutText(lay.layout) !== lay.saved
  const dirty = textDirty || layoutDirty

  // toPlain is fine here: the graph and cohort refs are read-only renderings.
  const plain = useMemo(() => (doc ? toPlain(emitModel(doc.model)) : null), [doc])

  // Each lane's cohort reference, by lane id ('' for a plain request).
  const cohortRefs = useMemo(() => cohortRefsOf(plain, kind), [plain, kind])
  // Every join's right cohort, inspected like a cohort for its fields.
  const joinRights = useMemo(() => joinRightsOf(plain), [plain])
  const cohortKeys = useMemo(
    () => [...new Set([...cohortRefs.values(), ...joinRights.map(rightKey)])].sort().join('\n'),
    [cohortRefs, joinRights],
  )

  // Inspect every distinct cohort the document names (again after an
  // edit names a new one).
  useEffect(() => {
    const ctl = new AbortController()
    const seen = asked.current
    // Keys this run is still inspecting: an abort (unmount, or a newer
    // key set) hands them back so the next run asks again.
    const mine = new Set<string>()
    for (const key of cohortKeys === '' ? [] : cohortKeys.split('\n')) {
      if (seen.has(key)) continue
      seen.add(key)
      mine.add(key)
      void (async () => {
        let last: unknown = new Error('request names no cohort file')
        let unreadable = false
        const ref = JSON.parse(key) as unknown
        for (const c of cohortCandidates(path, ref)) {
          try {
            const res = await inspectCohort(area, c, ctl.signal)
            mine.delete(key)
            setCohorts((m) => new Map(m).set(key, { fields: res.fields }))
            return
          } catch (e) {
            if (ctl.signal.aborted) return
            last = e
            if (anchorUnreadable(ref, e)) unreadable = true
          }
        }
        mine.delete(key)
        setCohorts((m) => new Map(m).set(key, { error: `cohort not inspected: ${String(last)}`, ...(unreadable && { unreadable: true as const }) }))
      })()
    }
    return () => {
      ctl.abort()
      for (const key of mine) seen.delete(key)
    }
  }, [area, cohortKeys, path])

  const fieldsFor = useCallback(
    (lane: string) => {
      const key = cohortRefs.get(lane)
      return key === undefined ? undefined : cohorts.get(key)?.fields
    },
    [cohortRefs, cohorts],
  )
  // A join's right cohort: its fields, null when it could not be read,
  // undefined while it is being inspected.
  const rightFields = useCallback(
    (right: string): RightSide => {
      const st = cohorts.get(rightKey(right))
      return st === undefined ? undefined : (st.fields ?? (st.unreadable ? 'unknown' : null))
    },
    [cohorts],
  )
  const laneKeys = [...new Set(cohortRefs.values())]
  const cohortStates = laneKeys.map((k) => cohorts.get(k))
  const cohortError = cohortStates.find((c) => c?.error !== undefined)?.error ?? null
  // One cohort shared by the whole document: its fields (plain requests,
  // facets, and compose files whose lanes all read the same cohort). A
  // chain's later stages read stage output, not the cohort, so a chain
  // gets no document-wide field types.
  const fields = laneKeys.length === 1 && kind !== 'chain' ? cohorts.get(laneKeys[0])?.fields : undefined
  const previewsOff =
    laneKeys.length === 0
      ? 'no cohort, no preview'
      : cohortStates.some((c) => c === undefined)
        ? 'waiting for cohort'
        : cohortStates.every((c) => c?.fields === undefined)
          ? 'no cohort, no preview'
          : undefined

  const graph = useMemo((): ViewGraph | string | null => {
    if (plain === null) return null
    try {
      if (kind === 'compose') {
        const compose = buildComposeGraph(plain, { manifest: catalog?.manifest, fieldsFor, rightFields })
        return { nodes: compose.nodes, edges: compose.edges, columns: compose.columns, compose }
      }
      if (kind === 'chain') {
        const chain = buildChainGraph(plain, { manifest: catalog?.manifest, cohortFields: fieldsFor(''), rightFields })
        return { nodes: chain.nodes, edges: chain.edges, columns: chain.columns, compose: chain, inputs: chain.inputs }
      }
      if (kind === 'facet') return buildFacetGraph(plain, { manifest: catalog?.manifest, cohortFields: fieldsFor('') })
      return buildRequestGraph(plain, { manifest: catalog?.manifest, cohortFields: fieldsFor(''), rightFields, result: true })
    } catch (e) {
      return String(e)
    }
  }, [plain, kind, catalog, fieldsFor, rightFields])

  // Live previews need the cohort: until it is inspected they are off.
  const previews = usePreviews(path, doc?.model ?? null, graph !== null && typeof graph !== 'string' ? graph : null, previewsOff)

  const compose = graph !== null && typeof graph !== 'string' ? graph.compose : undefined
  // Chain stages run in document order; only compose lanes reorder by
  // the sidecar.
  const order = useMemo(
    () => (compose ? laneOrder(compose.lanes, kind === 'compose' ? lay.layout.lanes : undefined) : []),
    [compose, kind, lay.layout.lanes],
  )
  const laneById = useMemo(() => new Map(compose?.lanes.map((l) => [l.id, l]) ?? []), [compose])
  const inputs = graph !== null && typeof graph !== 'string' ? graph.inputs : undefined
  // The lane a node is drawn in ('' without lanes).
  const parentOf = useMemo(
    () => new Map(graph !== null && typeof graph !== 'string' ? graph.nodes.map((n) => [n.id, n.parentId ?? '']) : []),
    [graph],
  )
  const laneOf = useCallback((id: string) => parentOf.get(id) ?? laneOfId(kind, id), [parentOf, kind])
  // The fields a lane's entries read: a chain stage's input columns, else
  // its cohort's fields.
  const laneFields = useCallback((lane: string) => (inputs ? inputs.get(lane) : fieldsFor(lane)), [inputs, fieldsFor])

  // Validation (manifest checks + engine predict / explain of the
  // in-memory document) reaches nodes by context, like previews. Compose
  // lanes take the issues of their slot or fit that no node covers.
  const nodeIds = useMemo(
    () =>
      graph !== null && typeof graph !== 'string'
        ? [
            ...(graph.compose?.lanes.filter((l) => l.role !== 'root').map((l) => l.id) ?? []),
            ...graph.nodes.map((n) => n.id),
            // A facet node shows the issues of every facet setting.
            ...(kind === 'facet' ? FACET_PROPS.filter((k) => k !== FACET_NODE) : []),
          ]
        : [],
    [graph, kind],
  )
  const validationCatalog = useMemo(() => catalog ?? {}, [catalog])
  // Joins are checked against both cohorts' fields (joins.ts).
  // ... and attributes whose column nothing reads are warned about
  // (resultGraph.columnUsed).
  const joinFindings = useMemo(
    () =>
      doc
        ? [
            ...joinIssues(doc.model, {
              manifest: catalog?.manifest,
              rightFields,
              leftFields: (frame) => laneFields(laneOfId(kind, frame === '' ? 'joins[0]' : `${frame}.joins[0]`)),
            }),
            ...(graph !== null && typeof graph !== 'string' ? unusedColumnIssues(graph.nodes) : []),
          ]
        : [],
    [doc, catalog, rightFields, laneFields, kind, graph],
  )
  const validation = useValidation(path, doc?.model ?? null, nodeIds, validationCatalog, fields, joinFindings)

  // Full run of the in-memory document; results stay in memory (bottom
  // panel) and reach terminal nodes by context, like previews.
  const run = useRun(path, doc?.model ?? null)
  const [resultsOpen, setResultsOpen] = useState(false)
  // A maximised results panel hides the graph body (display:none, so React
  // Flow skips measuring it) and keeps the bar; Restore brings both back.
  const [resultsMax, setResultsMax] = useState(false)
  const runResults = useMemo(
    (): RunResults => ({ get: (id) => run.last?.view.headlines.get(id), response: (frame) => run.last?.view.responses.get(frame), stale: run.stale }),
    [run.last, run.stale],
  )
  const runNow = run.run
  const startRun = useCallback(() => {
    setResultsOpen(true)
    runNow()
  }, [runNow])

  // Sidecar positions override auto-layout, verbatim; ids the
  // graph no longer has are simply never looked up. Compose content positions are relative to
  // their lane; lanes stack top to bottom in lane order, each as tall as
  // its content (measured where React Flow has measured it).
  const content = useMemo((): GraphNode[] => {
    if (graph === null || typeof graph === 'string') return []
    return graph.nodes.map((n) => {
      const saved = positionOf(lay.layout, n.id)
      return {
        ...n,
        position: saved ?? n.position,
        selected: n.id === selected,
        measured: measured.get(n.id),
      }
    })
  }, [graph, lay.layout, selected, measured])

  const boxes = useMemo((): LaneBox[] => {
    if (!compose) return []
    const bottom = new Map<string, number>()
    let right = LANE.pad + LAYOUT.nodeWidth
    for (const n of content) {
      const h = n.measured?.height ?? estimateHeight(n)
      const lane = n.parentId ?? ''
      bottom.set(lane, Math.max(bottom.get(lane) ?? 0, n.position.y + h - LANE.head))
      right = Math.max(right, n.position.x + (n.measured?.width ?? LAYOUT.nodeWidth))
    }
    const hasRoot = compose.lanes.some((l) => l.role === 'root')
    return stackLanes(order, hasRoot, (id) => bottom.get(id) ?? 0, right + LANE.pad)
  }, [compose, content, order])

  const nodes = useMemo((): FlowNode[] => {
    if (!compose) return content
    const lanes: LaneNode[] = boxes.map((b) => {
      const lane = laneById.get(b.id)!
      return {
        id: b.id,
        type: 'lane',
        position: { x: b.x, y: b.y },
        width: b.width,
        height: b.height,
        selectable: false,
        draggable: false,
        deletable: false,
        connectable: false,
        measured: measured.get(b.id),
        data: {
          role: lane.role,
          title: lane.title,
          named: lane.named,
          ...(lane.save !== undefined && { save: lane.save }),
          place: order.indexOf(b.id),
          count: order.length,
          removable: doc !== null && removable(doc.model, b.id),
          ...(kind === 'chain' && lane.role === 'root' && { roleLabel: 'chained' }),
        },
      }
    })
    // Parents come before their children.
    return [...lanes, ...content]
  }, [compose, content, boxes, laneById, order, measured, doc, kind])

  // Lanes take their height from measured content, which arrives after
  // React Flow's initial fitView: fit once more when every node has a
  // size, so the bottom lane does not start off-screen.
  const refitted = useRef(false)
  useEffect(() => {
    if (refitted.current || !compose || content.length === 0 || !content.every((n) => n.measured)) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        refitted.current = true
        void rf.current?.fitView()
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [compose, content])

  const edges = useMemo((): GraphEdge[] => {
    if (graph === null || typeof graph === 'string') return []
    return graph.edges.map((e) => ({ ...e, type: 'wire', ...(e.id === selectedEdge && { selected: true }) }))
  }, [graph, selectedEdge])

  // Column lookup for drags: a node stays inside its own stage column.
  const placed = graph !== null && typeof graph !== 'string' ? graph : null
  const contentIds = useMemo(() => new Set(placed?.nodes.map((n) => n.id)), [placed])

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
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
        if (!contentIds.has(c.id)) continue
        // A lane's nodes stay below its header.
        const pos = placed?.compose ? { x: c.position.x, y: Math.max(LANE.head, c.position.y) } : c.position
        layout = moveNode(layout, c.id, pos)
      }
      return { ...l, layout }
    })
  }, [contentIds, placed])

  // A wire's field types come from the target lane's cohort.
  const check = useCallback(
    (w: Wire): WireCheck =>
      placed
        ? checkConnection(placed, w, { manifest: catalog?.manifest, cohortFields: laneFields(laneOf(w.target ?? '')) })
        : { ok: false, reason: 'no graph' },
    [placed, catalog, laneFields, laneOf],
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
      setDoc((d) => {
        if (!d || !c.target) return d
        let model = connectWire(d.model, c.target, r.rowKey, r.ref)
        for (const w of r.also ?? []) model = connectWire(model, c.target, w.rowKey, w.ref)
        return { ...d, model }
      })
    },
    [check, note],
  )

  // A wire dropped on an input that refuses it leaves the reason on screen.
  const onConnectEnd = useCallback(
    (ev: MouseEvent | TouchEvent, s: FinalConnectionState) => {
      if (!s.toHandle && s.fromHandle?.type === 'source' && onPane(ev)) {
        const lane = laneOf(s.fromHandle.nodeId)
        const src = placed ? portSource(placed.nodes, s.fromHandle, catalog?.manifest, laneFields(lane)) : null
        const box = flowBox.current?.getBoundingClientRect()
        if (!src || !box || !rf.current) return
        const { clientX, clientY } = pointOf(ev)
        portOpened.current = Date.now()
        setPortPick({
          src,
          lane,
          at: { left: clientX - box.left, top: clientY - box.top, width: box.width, height: box.height },
          flow: rf.current.screenToFlowPosition({ x: clientX, y: clientY }),
        })
        return
      }
      if (s.isValid !== false || !s.fromHandle || !s.toHandle) return
      const r = check(wireOf(s.fromHandle, s.toHandle))
      if (!r.ok) note(r.reason)
    },
    [check, note, placed, catalog, laneFields, laneOf],
  )

  // Deleting a node removes its JSON (and so its wires); deleting a wire
  // clears the param it fed. The cohort is never deleted.
  const onBeforeDelete = useCallback(
    async ({ nodes: ns, edges: es }: { nodes: FlowNode[]; edges: GraphEdge[] }) => {
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
    ({ nodes: ns, edges: es }: { nodes: FlowNode[]; edges: GraphEdge[] }) => remove(ns.map((n) => n.id), es),
    [remove],
  )

  const edit = useCallback(
    (id: string, value: JsonNode) => setDoc((d) => (d ? { ...d, model: updateNode(d.model, id, value) } : d)),
    [],
  )

  // The palette is generated from the catalog: a catalog reload (engine
  // or feature-set change) regenerates it. A chain stage lists only what
  // the chain gate accepts; a facet takes filters and overlays.
  const items = useMemo(() => {
    const all = paletteItems(catalog?.manifest)
    // Chain stages run no tests, so no multiplicity block either.
    if (kind === 'chain') return all.filter((it) => it.section !== 'multiplicity' && chainRefusal(catalog?.manifest, it.section, it.type) === null)
    if (kind === 'facet') return all.filter((it) => it.section === 'filterers' || it.section === 'overlays')
    return all
  }, [catalog, kind])
  const baseOf = useCallback((lane: string): PathSegment[] => laneById.get(lane)?.base ?? [], [laneById])
  const portItems = useMemo(
    () => (portPick && doc ? itemsForPort(items, catalog?.manifest, doc.model, portPick.src, baseOf(portPick.lane)) : []),
    [portPick, doc, items, catalog, baseOf],
  )

  // The lane a palette pick without a drop point goes into: the selected
  // node's lane, else the first slot lane.
  const pickLane = useCallback((): string => {
    if (!compose) return ''
    const own = selected !== null ? laneOf(selected) : undefined
    if (own !== undefined && own !== ROOT_LANE && laneById.has(own)) return own
    return order.find((id) => ['slot', 'stage'].includes(laneById.get(id)?.role ?? '')) ?? order[0] ?? ''
  }, [compose, selected, laneOf, laneById, order])

  // place appends a new entry for item (wired, when a port drag opened
  // the palette) to the request of lane ('' for a plain request) and
  // selects it. With a drop point the node sits there; without one it is
  // auto-laid out in its stage's column.
  const place = useCallback(
    (item: PaletteItem, lane: string, at?: { x: number; y: number }, wire?: { rowKey: string; ref: string }) => {
      if (!doc) return
      const gate = kind === 'chain' ? chainRefusal(catalog?.manifest, item.section, item.type, laneById.get(lane)?.index) : null
      if (gate !== null) {
        show({ text: `Cannot add ${item.op}: ${gate}`, testId: 'place-refused' })
        return
      }
      let r: { model: GraphModel; id: string }
      try {
        r = placeNode(doc.model, item, {
          manifest: catalog?.manifest,
          schema: catalog?.schema,
          cohortFields: laneFields(lane),
          wire,
          base: baseOf(lane),
        })
      } catch (e) {
        show({ text: `Cannot add ${item.op}: ${e instanceof Error ? e.message : String(e)}`, testId: 'place-refused' })
        return
      }
      setDoc({ ...doc, model: r.model })
      // Compose: the drop point is made relative to the node's lane.
      const box = boxes.find((b) => b.id === lane)
      const pos = at && (compose ? box && { x: at.x - box.x, y: Math.max(LANE.head, at.y - box.y) } : at)
      setLay((l) => {
        // A stale sidecar entry for the reused id never positions the new node.
        const layout = renameNodes(l.layout, (x) => x === r.id, new Map())
        return { ...l, layout: pos ? moveNode(layout, r.id, pos) : layout }
      })
      setSelected(r.id)
      setSelectedEdge(null)
      show(null)
    },
    [doc, catalog, laneFields, baseOf, boxes, compose, show, kind, laneById],
  )

  // A palette item dropped on the canvas lands where it is dropped.
  const onDrop = useCallback(
    (e: DragEvent) => {
      const key = e.dataTransfer.getData(PALETTE_MIME)
      const item = key ? items.find((i) => i.key === key) : undefined
      if (!item || !rf.current || !placed) return
      e.preventDefault()
      const pos = rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      // Compose: the lane under the drop point takes the node.
      let lane = ''
      if (compose) {
        const box = laneAt(boxes, pos.y)
        if (!box || box.id === ROOT_LANE) {
          show({ text: `${item.op} goes into a ${kind === 'chain' ? 'stage' : 'slot'}: drop it in one`, testId: 'place-refused' })
          return
        }
        lane = box.id
      }
      place(item, lane, pos)
    },
    [items, placed, place, show, compose, boxes, kind],
  )

  // Join nodes whose joined fields are expanded (view state only).
  const [joinsOpen, setJoinsOpen] = useState<ReadonlySet<string>>(() => new Set())
  const joinView = useMemo(
    (): JoinView => ({
      expanded: joinsOpen,
      toggle: (id) =>
        setJoinsOpen((s) => {
          const next = new Set(s)
          if (!next.delete(id)) next.add(id)
          return next
        }),
    }),
    [joinsOpen],
  )
  // Lane edits: rename, remove and add change the document; reordering
  // only the sidecar's lane order.
  const laneActions = useMemo((): LaneActions => {
    const fail = (what: string, e: unknown) => show({ text: `Cannot ${what}: ${e instanceof Error ? e.message : String(e)}`, testId: 'lane-refused' })
    return {
      rename: (id, name) => {
        if (!doc) return
        try {
          setDoc({ ...doc, model: renameLane(doc.model, id, name) })
        } catch (e) {
          fail(`rename ${laneNoun(id, kind)}`, e)
        }
      },
      remove: (id) => {
        if (!doc) return
        let r: ReturnType<typeof removeLane>
        try {
          r = removeLane(doc.model, id)
        } catch (e) {
          fail(`remove ${laneNoun(id, kind)}`, e)
          return
        }
        setDoc({ ...doc, model: r.model })
        setLay((l) => {
          const layout = renameNodes(l.layout, (x) => isPathPrefix(id, x), r.renames)
          const lanes = renameLaneIds(l.layout.lanes, id, r.renames)
          return { ...l, layout: lanes === undefined ? layout : { ...layout, lanes } }
        })
        setSelected(null)
        setSelectedEdge(null)
      },
      move: (id, delta) => {
        if (!compose) return
        if (kind !== 'chain') {
          setLay((l) => ({ ...l, layout: { ...l.layout, lanes: moveLane(laneOrder(compose.lanes, l.layout.lanes), id, delta) } }))
          return
        }
        // A chain stage moves in the document; positions follow its nodes.
        if (!doc) return
        let r: ReturnType<typeof moveStage>
        try {
          r = moveStage(doc.model, id, delta)
        } catch (e) {
          fail('move stage', e)
          return
        }
        setDoc({ ...doc, model: r.model })
        setLay((l) => ({ ...l, layout: renameNodes(l.layout, () => false, r.renames) }))
        setSelected(null)
        setSelectedEdge(null)
      },
    }
  }, [doc, compose, show, kind])

  const newLane = useCallback(() => {
    if (!doc) return
    try {
      setDoc({ ...doc, model: addLane(doc.model).model })
    } catch (e) {
      show({ text: `Cannot add ${kind === 'chain' ? 'stage' : 'slot'}: ${e instanceof Error ? e.message : String(e)}`, testId: 'lane-refused' })
    }
  }, [doc, show, kind])

  const save = useCallback(async () => {
    if (!doc || saving || !dirty) return
    setSaving(true)
    setSaveError(null)
    try {
      if (textDirty) {
        const sent = text
        const res = await saveFile(area, path, sent)
        const onDisk = parseModel(res.text, kind)
        // Edits made while the save was in flight stay dirty.
        setDoc((d) => (d && emitModelText(d.model) === sent ? { model: onDisk, saved: emitModelText(onDisk) } : d && { ...d, saved: sent }))
      }
      // The sidecar is written beside the request when the layout changed;
      // entries for nodes that no longer exist are dropped.
      if (layoutDirty && graph !== null && typeof graph !== 'string') {
        const sent = layoutText(lay.layout)
        let pruned = pruneLayout(lay.layout, graph.nodes.map((n) => n.id))
        if (graph.compose && pruned.lanes !== undefined) pruned = { ...pruned, lanes: laneOrder(graph.compose.lanes, pruned.lanes) }
        const res = await saveLayout(area, path, layoutText(pruned))
        const onDisk = parseLayout(res.layout)
        const savedText = layoutText(onDisk)
        setLay((l) => (layoutText(l.layout) === sent ? { layout: onDisk, saved: savedText } : { ...l, saved: savedText }))
      }
      setHistoryVersion((v) => v + 1)
    } catch (e) {
      setSaveError(`save failed: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [area, doc, saving, dirty, textDirty, layoutDirty, text, lay, graph, path, kind])

  // A restore from the history panel replaces the document the way a
  // save's response does: the restored bytes become the saved model, and
  // any unsaved text edits are dropped (the panel confirmed that).
  const restored = useCallback(
    (f: FileContent) => {
      const model = parseModel(f.text, kind)
      setDoc({ model, saved: emitModelText(model) })
      setSelected(null)
      setSelectedEdge(null)
      setHistoryVersion((v) => v + 1)
    },
    [kind],
  )

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

  // The selected node's request-frame group keys (post-test partition_by
  // options in the inspector).
  const selectedGroupKeys = useMemo(
    () => (doc && selected !== null ? groupKeysOfModel(doc.model, frameOf(selected)) : undefined),
    [doc, selected],
  )
  // ... and its vectors' names (a `vector` input's options).
  const selectedVectorNames = useMemo(
    () => (doc && selected !== null ? vectorNamesOfModel(doc.model, frameOf(selected)) : undefined),
    [doc, selected],
  )

  if (error) return <Empty title="Cannot open" body={error} />
  if (graph === null || doc === null) return <Empty title="Loading…" body={path} />
  if (typeof graph === 'string') return <Empty title="Cannot open" body={graph} />
  const node = selected !== null ? doc.model.nodes.get(selected) : undefined

  return (
    <div className="graph" data-testid="request-graph">
      <div className="graph-bar">
        <span className="graph-path">{path}</span>
        {modeOf(kind) && (
          <span className={'mode-badge mode-' + modeOf(kind)!.id} title={`${modeOf(kind)!.label}: ${modeOf(kind)!.runs}`} data-testid="graph-mode">
            {modeOf(kind)!.label}
          </span>
        )}
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
        {run.phase === 'running' ? (
          <button type="button" className="run on" data-testid="run-cancel" onClick={run.cancel} title="Cancel the run">
            Cancel run
          </button>
        ) : (
          <button type="button" className="run" data-testid="run-button" onClick={startRun} title="Run the whole analysis as edited (nothing is written)">
            ▶ Run
          </button>
        )}
        {!resultsOpen && run.last && (
          <button type="button" data-testid="results-toggle" onClick={() => setResultsOpen(true)}>
            Results
          </button>
        )}
        <button
          type="button"
          className="wire-mode"
          data-testid="wire-mode"
          data-mode={wireMode}
          aria-pressed={wireMode === 'routed'}
          onClick={toggleWires}
          title={wireMode === 'routed' ? 'Wires are routed around nodes: switch to plain curves' : 'Wires are plain curves: route them around nodes'}
        >
          <span className={wireMode === 'curves' ? 'on' : undefined}>Curves</span>
          <span className={wireMode === 'routed' ? 'on' : undefined}>Routed</span>
        </button>
        {compose && kind === 'compose' && (
          <button type="button" data-testid="lane-add" onClick={newLane} title="Add a slot to the composed analysis (reads the last slot's cohort)">
            + Slot
          </button>
        )}
        {kind === 'chain' && (
          <button type="button" data-testid="lane-add" onClick={newLane} title="Add a stage to the chained analysis (reads the last stage's output)">
            + Stage
          </button>
        )}
        {history && (
          <button
            type="button"
            className={historyOpen ? 'on' : undefined}
            data-testid="history-toggle"
            aria-pressed={historyOpen}
            onClick={() => setHistoryOpen((o) => !o)}
            title="Commits that touched this file: diff and restore"
          >
            History
          </button>
        )}
        {saveError && <span className="err">{saveError}</span>}
        {cohortError && <span className="err">{cohortError}</span>}
        <RequestIssues issues={validation.request} failed={validation.failed} />
      </div>
      <div className={'graph-body' + (resultsOpen && resultsMax ? ' hidden-by-results' : '')}>
        {paletteOpen && (
          <Palette
            items={items}
            heading="Add node"
            testId="palette"
            className="palette-panel"
            draggable
            onPick={(it) => place(it, pickLane())}
            onClose={() => setPaletteOpen(false)}
          />
        )}
        <div
          className="graph-flow"
          ref={flowBox}
          data-wires={wireMode}
          onPointerOver={(e) => focus.set(hoverTarget(e.target instanceof Element ? e.target : null))}
          onPointerLeave={() => focus.set({ hoverNode: undefined, hoverHandle: undefined, hoverEdge: undefined })}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(PALETTE_MIME)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={onDrop}
        >
          <PreviewContext value={previews}>
            <RunContext value={runResults}>
            <ValidationContext value={validation}>
              <WireCheckContext value={check}>
                <LaneActionsContext value={laneActions}>
                <JoinViewContext value={joinView}>
                <RouteContext value={routes}>
                <ReactFlow<FlowNode, GraphEdge>
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
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
                    setSelected(n.type === 'lane' ? null : n.id)
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
                  onInit={(i: ReactFlowInstance<FlowNode, GraphEdge>) => {
                    rf.current = i
                  }}
                  fitView
                  minZoom={0.2}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background />
                  <Controls showInteractive={false} />
                  <RemeasureUnready />
                  <EdgeRouter store={routes} enabled={wireMode === 'routed'} onStatus={routeStatus} />
                </ReactFlow>
                </RouteContext>
                </JoinViewContext>
                <FocusStyle focus={focus} edges={edges} />
                </LaneActionsContext>
              </WireCheckContext>
            </ValidationContext>
            </RunContext>
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
                place(it, portPick.lane, portPick.flow, { rowKey: it.rowKey, ref: portPick.src.ref })
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
        {node && kind === 'facet' && node.id === FACET_NODE && (
          <FacetInspector model={doc.model} cohortFields={fields} onChange={(m) => setDoc({ ...doc, model: m })} onClose={() => setSelected(null)} />
        )}
        {node && !(kind === 'facet' && node.id === FACET_NODE) && (
          <Inspector
            node={node}
            catalog={catalog ?? {}}
            onChange={(v) => edit(node.id, v)}
            onClose={() => setSelected(null)}
            onDelete={deletable(doc.model, node.id) ? () => remove([node.id], []) : undefined}
            groupKeys={selectedGroupKeys}
            cohortOptions={node.section === 'joins' ? cohortChoices : undefined}
            vectorNames={selectedVectorNames}
          />
        )}
        {history && historyOpen && (
          <HistoryPanel path={path} version={historyVersion} dirty={textDirty} onRestored={restored} onClose={() => setHistoryOpen(false)} />
        )}
      </div>
      {resultsOpen && (
        <ResultsPanel
          run={run}
          maximised={resultsMax}
          onMaximise={setResultsMax}
          onClose={() => {
            setResultsOpen(false)
            setResultsMax(false)
          }}
        />
      )}
    </div>
  )
}

const DELETE_KEYS = ['Backspace', 'Delete']

// laneOfId is the lane a node id belongs to when the graph has no such
// node: '' without lanes; in a compose, its slot (`requests[1]`), its fit
// (`fits[0]`) or ROOT_LANE; in a chain, its stage (`stages[2]`) or
// ROOT_LANE.
function laneOfId(kind: ViewKind, id: string): string {
  if (kind === 'chain') {
    const frame = frameOf(id)
    return frame === '' ? ROOT_LANE : frame.slice(0, frame.indexOf(']') + 1)
  }
  if (kind !== 'compose') return ''
  const frame = frameOf(id)
  if (frame === '') return ROOT_LANE
  return frame.startsWith('fits[') ? frame.slice(0, frame.indexOf(']') + 1) : frame
}

// joinRightsOf lists the right cohorts of every join in the document:
// the request's, each compose slot's and fit's, each chain stage's.
function joinRightsOf(plain: unknown): string[] {
  const out = new Set<string>()
  const scan = (req: unknown) => {
    const joins = typeof req === 'object' && req !== null ? (req as { joins?: unknown }).joins : undefined
    if (!Array.isArray(joins)) return
    for (const j of joins) {
      const right = typeof j === 'object' && j !== null ? (j as { right?: unknown }).right : undefined
      if (typeof right === 'string' && right !== '') out.add(right)
    }
  }
  if (typeof plain !== 'object' || plain === null) return []
  const doc = plain as Record<string, unknown>
  scan(doc)
  for (const key of ['requests', 'fits', 'stages']) {
    const list = doc[key]
    if (!Array.isArray(list)) continue
    for (const e of list) scan(key === 'requests' ? e : typeof e === 'object' && e !== null ? (e as { request?: unknown }).request : undefined)
  }
  return [...out].sort()
}

// cohortRefsOf maps each lane to its cohort reference as JSON (the key
// cohorts are inspected and cached by): the root's cohort for a plain
// request, chain or facet (lane ''), each slot's and fit's cohort for a
// compose.
function cohortRefsOf(plain: unknown, kind: ViewKind): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof plain !== 'object' || plain === null) return out
  const doc = plain as Record<string, unknown>
  const ref = (v: unknown) => JSON.stringify((typeof v === 'object' && v !== null && (v as { cohort?: unknown }).cohort) || null)
  if (kind !== 'compose') {
    out.set('', ref(doc))
    return out
  }
  if (Array.isArray(doc.requests)) doc.requests.forEach((r, i) => out.set(`requests[${i}]`, ref(r)))
  if (Array.isArray(doc.fits)) {
    doc.fits.forEach((f, j) => out.set(`fits[${j}]`, ref(typeof f === 'object' && f !== null ? (f as { request?: unknown }).request : null)))
  }
  return out
}

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
function WireLine({ fromX, fromY, toX, toY, fromPosition, toPosition, fromHandle, toHandle, connectionStatus }: ConnectionLineComponentProps<FlowNode>) {
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
  // Lane the drag started in ('' for a plain request).
  lane: string
  at: { left: number; top: number; width: number; height: number }
  flow: { x: number; y: number }
}

// portSource describes the port a drag started from: a cohort field (its
// inspected type), a joined field (its right cohort type) or a
// producer's label (its manifest emits_type).
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
    return { ref, ...(type && { type }), cohort: true }
  }
  if (n?.type === 'op' && from.id?.startsWith('field:') && n.data.join) {
    // A joined field: typed by the right cohort, read by every section.
    const ref = from.id.slice('field:'.length)
    const type = n.data.join.fields.find((f) => f.name === ref)?.type
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
