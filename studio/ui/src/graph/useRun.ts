import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { postRun, type RunResult } from '../api.ts'
import { toPlain } from './jsonTree.ts'
import { emitModel, emitModelText, type GraphModel } from './model.ts'
import { readRun, type RunHeadline, type RunView } from './results.ts'

// A finished run: the server's result (envelope text, run id for Save),
// its panel model, and the document text that was run (to tell when the
// editor has moved on).
export type RunDone = { result: RunResult; view: RunView; ranText: string }

export type RunState = {
  phase: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  // The latest finished run; kept while a new run is in flight or after
  // one fails or is cancelled.
  last?: RunDone
  error?: string
}

export type Run = RunState & {
  // The editor's document differs from what last ran.
  stale: boolean
  run: () => void
  cancel: () => void
}

// useRun runs the whole in-memory document (emitModelText, never the
// file on disk) through POST /api/run and keeps the result in memory.
// Cancel aborts the request, which cancels the engine call server-side.
export function useRun(path: string, model: GraphModel | null): Run {
  const [state, setState] = useState<RunState>({ phase: 'idle' })
  const ctl = useRef<AbortController | null>(null)
  const modelRef = useRef(model)
  useEffect(() => {
    modelRef.current = model
  }, [model])
  useEffect(
    () => () => {
      ctl.current?.abort()
    },
    [],
  )

  const run = useCallback(() => {
    const m = modelRef.current
    if (!m) return
    ctl.current?.abort()
    const mine = new AbortController()
    ctl.current = mine
    const text = emitModelText(m)
    // toPlain is fine here: the request is only read to map results onto
    // node ids.
    const plain = toPlain(emitModel(m))
    setState((s) => ({ phase: 'running', last: s.last }))
    postRun(path, text, mine.signal)
      .then((result) => {
        if (ctl.current !== mine) return
        ctl.current = null
        let view: RunView
        try {
          view = readRun(result.root, result.text, plain)
        } catch (e) {
          setState((s) => ({ phase: 'error', last: s.last, error: `unreadable envelope: ${String(e)}` }))
          return
        }
        setState({ phase: 'done', last: { result, view, ranText: text } })
      })
      .catch((e: unknown) => {
        if (ctl.current !== mine) return
        ctl.current = null
        if (mine.signal.aborted) {
          setState((s) => ({ phase: 'cancelled', last: s.last }))
          return
        }
        setState((s) => ({ phase: 'error', last: s.last, error: e instanceof Error ? e.message : String(e) }))
      })
  }, [path])

  const cancel = useCallback(() => {
    ctl.current?.abort()
  }, [])

  const current = useMemo(() => (model ? emitModelText(model) : ''), [model])
  const stale = state.last !== undefined && state.last.ranText !== current
  return { ...state, stale, run, cancel }
}

// RunResults is what nodes read through RunContext: the latest run's
// headline per node id. Like previews, results travel by context, never
// by node data, so a run finishing never rebuilds the React Flow nodes.
export type RunResults = { get: (id: string) => RunHeadline | undefined; stale: boolean }

export const RunContext = createContext<RunResults>({ get: () => undefined, stale: false })

export function useRunHeadline(id: string): { headline?: RunHeadline; stale: boolean } {
  const r = useContext(RunContext)
  return { headline: r.get(id), stale: r.stale }
}
