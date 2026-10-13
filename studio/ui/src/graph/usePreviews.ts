import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { postPreview, type PreviewResult } from '../api.ts'
import { emitModelText, type GraphModel } from './model.ts'
import { batches, changedIds, fingerprints, invalidated, type PreviewState } from './previews.ts'
import type { RequestGraph } from './requestGraph.ts'
import { useArea } from '../area.ts'

// Quiet time after the last edit before stale previews are re-requested.
export const PREVIEW_DEBOUNCE_MS = 300

// Previews is what node components read through PreviewContext. Previews
// travel by context, not node data, so results arriving never rebuild the
// controlled React Flow node array.
export type Previews = {
  enabled: boolean
  // Why previews are off, when they are.
  off?: string
  get: (id: string) => PreviewState | undefined
  // run forces one node's preview (the deferred / timed-out button).
  run: (id: string) => void
}

export const PreviewContext = createContext<Previews>({ enabled: false, get: () => undefined, run: () => {} })

export function usePreview(id: string): { enabled: boolean; off?: string; state?: PreviewState; run: () => void } {
  const p = useContext(PreviewContext)
  return { enabled: p.enabled, off: p.off, state: p.get(id), run: () => p.run(id) }
}

type Flight = { gens: Map<string, number>; ctl: AbortController }

// The server keys supersession by client (api.ts PREVIEW_CLIENT, one per
// page load) + path + node ids, so other tabs no longer cancel this one
// and this view's own newer sends only cancel calls it no longer wants.
// A cancelled preview this view still wants is therefore rare (e.g. a
// second hook instance in the same page sending the same nodes); it is
// retried a few times with jitter, by when the other run is usually
// cached. Retries are bounded, so a real fault still lands as cancelled.
const CANCEL_RETRIES = 3

// usePreviews keeps node previews in step with the model. 300 ms after
// the last edit it diffs the model against what was last previewed and
// re-requests only the nodes downstream of what changed, one call per
// section. Each node carries a generation; a response only lands on
// nodes whose generation it was sent with, and a call whose nodes have
// all moved on is aborted.
export function usePreviews(
  path: string,
  model: GraphModel | null,
  graph: RequestGraph | null,
  off: string | undefined,
): Previews {
  const area = useArea()
  const enabled = off === undefined && model !== null && graph !== null
  const [states, setStates] = useState<ReadonlyMap<string, PreviewState>>(new Map())
  const sent = useRef<Map<string, string> | null>(null)
  const gens = useRef(new Map<string, number>())
  const flights = useRef(new Set<Flight>())
  const disposed = useRef(false)
  const latest = useRef<{ model: GraphModel | null; graph: RequestGraph | null }>({ model, graph })
  useEffect(() => {
    latest.current = { model, graph }
  }, [model, graph])

  const dispatch = useCallback(
    function send(groups: string[][], requestText: string, force: boolean, attempt = 0) {
      for (const nodes of groups) {
        if (nodes.length === 0) continue
        const mine = new Map<string, number>()
        for (const id of nodes) {
          const g = (gens.current.get(id) ?? 0) + 1
          gens.current.set(id, g)
          mine.set(id, g)
        }
        for (const f of flights.current) {
          if ([...f.gens].every(([id, g]) => gens.current.get(id) !== g)) {
            f.ctl.abort()
            flights.current.delete(f)
          }
        }
        setStates((m) => {
          const next = new Map(m)
          for (const id of nodes) {
            const was = m.get(id)
            const last = was?.status === 'ok' ? was.probe : was?.status === 'loading' ? was.last : undefined
            next.set(id, { status: 'loading', ...(last && { last }) })
          }
          return next
        })
        const flight: Flight = { gens: mine, ctl: new AbortController() }
        flights.current.add(flight)
        const current = (id: string) => gens.current.get(id) === mine.get(id)
        postPreview(area, { path, nodes, requestText, force }, flight.ctl.signal)
          .then((res) => {
            const retry = res.status === 'cancelled' && attempt < CANCEL_RETRIES ? nodes.filter(current) : []
            if (retry.length > 0) {
              const delay = 100 * (attempt + 1) + Math.random() * 200
              setTimeout(() => {
                const still = retry.filter(current)
                if (!disposed.current && still.length > 0) send([still], requestText, force, attempt + 1)
              }, delay)
              return
            }
            setStates((m) => land(m, nodes, res, current))
          })
          .catch((e: unknown) => {
            if (flight.ctl.signal.aborted) return
            const message = e instanceof Error ? e.message : String(e)
            setStates((m) => {
              const next = new Map(m)
              for (const id of nodes) if (current(id)) next.set(id, { status: 'error', message })
              return next
            })
          })
          .finally(() => flights.current.delete(flight))
      }
    },
    [area, path],
  )

  // Edits: debounce, diff, re-request what is downstream of the change.
  useEffect(() => {
    if (!enabled || model === null || graph === null) return
    const first = sent.current === null
    const t = setTimeout(
      () => {
        const fp = fingerprints(model)
        const prev = sent.current
        const stale = prev === null ? new Set(graph.nodes.map((n) => n.id)) : invalidated(changedIds(prev, fp), graph)
        sent.current = fp
        if (stale.size > 0) dispatch(batches(stale, graph.nodes), emitModelText(model), false)
      },
      first ? 0 : PREVIEW_DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [enabled, model, graph, dispatch])

  useEffect(() => {
    const live = flights.current
    disposed.current = false
    return () => {
      disposed.current = true
      for (const f of live) f.ctl.abort()
      live.clear()
    }
  }, [])

  const run = useCallback(
    (id: string) => {
      const { model: m, graph: g } = latest.current
      if (m === null || g === null) return
      dispatch(batches([id], g.nodes), emitModelText(m), true)
    },
    [dispatch],
  )

  const get = useCallback((id: string) => states.get(id), [states])
  return { enabled, ...(off !== undefined && { off }), get, run }
}

// land applies a preview response to the nodes it is still current for.
export function land(
  m: ReadonlyMap<string, PreviewState>,
  nodes: string[],
  res: PreviewResult,
  current: (id: string) => boolean,
): Map<string, PreviewState> {
  const next = new Map(m)
  const byNode = new Map(res.probes.map((p) => [p.node, p]))
  for (const id of nodes) {
    if (!current(id)) continue
    const probe = byNode.get(id)
    switch (res.status) {
      case 'deferred':
        next.set(id, { status: 'deferred', ...(probe?.reason && { reason: probe.reason }), ...(res.record_count !== undefined && { rows: res.record_count }) })
        break
      case 'timed_out':
        next.set(id, { status: 'timed_out' })
        break
      case 'cancelled':
        next.set(id, { status: 'cancelled' })
        break
      default:
        if (!probe) next.set(id, { status: 'error', message: 'no probe for this node' })
        else if (probe.kind === 'none') next.set(id, { status: 'none', ...(probe.reason && { reason: probe.reason }) })
        else next.set(id, { status: 'ok', probe, ...(res.deferred?.length && { deferred: res.deferred }), ...(res.cached && { cached: true }) })
    }
  }
  return next
}
