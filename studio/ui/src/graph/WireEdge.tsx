import { use, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStoreApi, type EdgeProps, type ReactFlowState } from '@xyflow/react'
import type { GraphEdge } from './requestGraph.ts'
import { focusCss, highlightOf, type FocusEdge, type FocusStore } from './focus.ts'
import { buildScene, fitEnds, roundedPath, sceneKey, type SceneEdge, type SceneHandle, type SceneNode, type Side } from './routing.ts'
import type { RouteJob, RouteReply } from './route.worker.ts'
import { RouteContext, type RouteStore } from './wires.ts'
import { fmtCount } from './previews.ts'
import { usePreview } from './usePreviews.ts'

const noSub = () => () => {}
const CORNER = 6

// WireEdge draws a wire: its route when one is current for the wire's
// live end points, else the plain curve (curves mode, before the first
// route lands, while an end is being dragged, or when routing failed).
// Classes, selection, deletion and the wide hit area are React Flow's
// own (BaseEdge), so every edge semantic is kept.
export function WireEdge(p: EdgeProps<GraphEdge>) {
  const store = use(RouteContext)
  const route = useSyncExternalStore(
    store ? (fn) => store.subscribe(p.id, fn) : noSub,
    () => store?.get(p.id),
  )
  const pts = route
    ? fitEnds(route.points, { x: p.sourceX, y: p.sourceY }, { x: p.targetX, y: p.targetY }, p.sourcePosition as Side, p.targetPosition as Side)
    : null
  const d = pts
    ? roundedPath(pts, CORNER)
    : getBezierPath({
        sourceX: p.sourceX,
        sourceY: p.sourceY,
        sourcePosition: p.sourcePosition,
        targetX: p.targetX,
        targetY: p.targetY,
        targetPosition: p.targetPosition,
      })[0]
  const edge = (
    <BaseEdge
      id={p.id}
      path={d}
      style={p.style}
      markerStart={p.markerStart}
      markerEnd={p.markerEnd}
      interactionWidth={p.interactionWidth ?? 20}
      className={pts ? 'routed' : undefined}
    />
  )
  if (p.data?.role !== 'scope' || !p.data.lead) return edge
  return (
    <>
      {edge}
      <ScopeLabel group={p.source} keyColumn={p.data.ref} x={p.sourceX} y={p.sourceY} />
    </>
  )
}

// ScopeLabel names a group's fan-out just below its fan-out handle, on
// the group's lead scope wire: "per region", and "×4" once the group's
// preview knows its bucket count.
function ScopeLabel({ group, keyColumn, x, y }: { group: string; keyColumn: string; x: number; y: number }) {
  const { state } = usePreview(group)
  const probe = state?.status === 'ok' ? state.probe : state?.status === 'loading' ? state.last : undefined
  const n = probe?.table?.total_rows
  return (
    <EdgeLabelRenderer>
      <div className="scope-label" data-testid="scope-label" data-group={group} style={{ transform: `translate(-50%, 0) translate(${x}px, ${y + 6}px)` }}>
        per {keyColumn || 'group'}
        {n !== undefined && <span className="scope-count"> ×{fmtCount(n)}</span>}
      </div>
    </EdgeLabelRenderer>
  )
}

// sceneOf reads the router's input from React Flow's internal store:
// parent-relative positions, measured sizes and handle bounds.
function sceneOf(s: ReactFlowState): { nodes: SceneNode[]; edges: SceneEdge[]; dragging: boolean } {
  const nodes: SceneNode[] = []
  let dragging = false
  for (const [id, n] of s.nodeLookup) {
    if (n.hidden) continue
    if (n.dragging) dragging = true
    const hb = n.internals.handleBounds
    const handles: SceneHandle[] = [
      ...(hb?.source ?? []).map((h) => ({ ...h, type: 'source' as const, position: h.position as Side })),
      ...(hb?.target ?? []).map((h) => ({ ...h, type: 'target' as const, position: h.position as Side })),
    ]
    nodes.push({
      id,
      position: n.position,
      ...(n.parentId !== undefined && { parentId: n.parentId }),
      width: n.measured.width ?? 0,
      height: n.measured.height ?? 0,
      lane: n.type === 'lane',
      handles,
    })
  }
  return { nodes, edges: s.edges, dragging }
}

export type RouteStatus = { state: 'pending' | 'ready' | 'failed'; ms?: number; error?: string }

const DEBOUNCE = 120

// EdgeRouter (inside <ReactFlow>) watches node geometry and wiring and
// reroutes after it settles: on measure, layout, lane changes and after a
// drag ends (never during one: the dragged node's wires fall back to
// curves until the drop). Routing runs in a worker loaded on first use.
export function EdgeRouter({ store, enabled, onStatus }: { store: RouteStore; enabled: boolean; onStatus: (s: RouteStatus) => void }) {
  const rf = useStoreApi()
  const status = useRef(onStatus)
  useEffect(() => {
    status.current = onStatus
  }, [onStatus])

  useEffect(() => {
    if (!enabled) {
      store.replace(new Map())
      return
    }
    let worker: Worker | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastKey = ''
    let seq = 0
    let alive = true

    const send = () => {
      const { nodes, edges, dragging } = sceneOf(rf.getState())
      if (dragging) return
      const key = sceneKey(nodes, edges)
      if (key === lastKey) return
      lastKey = key
      const scene = buildScene(nodes, edges)
      if (!worker) {
        try {
          worker = new Worker(new URL('./route.worker.ts', import.meta.url), { type: 'module' })
        } catch (e) {
          status.current({ state: 'failed', error: String(e) })
          return
        }
        worker.onmessage = (ev: MessageEvent<RouteReply>) => {
          if (!alive || ev.data.seq !== seq) return
          if ('error' in ev.data) {
            store.replace(new Map())
            status.current({ state: 'failed', error: ev.data.error })
            return
          }
          store.replace(new Map(ev.data.routes))
          status.current({ state: 'ready', ms: ev.data.ms })
        }
        worker.onerror = (ev) => {
          status.current({ state: 'failed', error: ev.message })
        }
      }
      status.current({ state: 'pending' })
      const job: RouteJob = { seq: ++seq, scene }
      worker.postMessage(job)
    }

    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(send, DEBOUNCE)
    }
    // Store updates also fire on pan and zoom; the scene key filters those
    // out cheaply in send(). Drags keep pushing the timer back until the
    // drop.
    const unsub = rf.subscribe(schedule)
    schedule()
    return () => {
      alive = false
      unsub()
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [enabled, rf, store])
  return null
}

// FocusStyle renders the focus highlight (focus.ts) as a stylesheet; it is
// the only component that re-renders on hover.
export function FocusStyle({ focus, edges }: { focus: FocusStore; edges: readonly FocusEdge[] }) {
  const f = useSyncExternalStore(focus.subscribe, focus.get)
  const css = useMemo(() => focusCss(highlightOf(f, edges)), [f, edges])
  return <style data-testid="wire-focus-style">{css}</style>
}
