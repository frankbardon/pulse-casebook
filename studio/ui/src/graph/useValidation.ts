import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { postExplain, postPredict, type CohortField, type ExplainStep } from '../api.ts'
import type { Catalog } from './paramForms.ts'
import { emitModelText, type GraphModel } from './model.ts'
import { attach, clientIssues, type Issue, type NodeValidation } from './validation.ts'

// Quiet time after the last edit before the document is re-validated.
export const VALIDATE_DEBOUNCE_MS = 300

// Validation is what node components read through ValidationContext.
// Like previews (PreviewContext), results travel by context and never
// through node data, so a verdict arriving never rebuilds the controlled
// React Flow node array (measured dimensions stay intact).
export type Validation = {
  get: (id: string) => NodeValidation | undefined
  // Issues no graph node covers (request level).
  request: Issue[]
  summary?: string
  // Why the engine verdict is missing, when it is.
  failed?: string
}

export const ValidationContext = createContext<Validation>({ get: () => undefined, request: [] })

export function useNodeValidation(id: string): NodeValidation | undefined {
  return useContext(ValidationContext).get(id)
}

const NONE: readonly Issue[] = []

type Engine = { text: string; issues: Issue[]; steps: ExplainStep[]; summary?: string; failed?: string }

// useValidation validates the editor's in-memory document. Manifest
// checks (operator names, required params, field types) run on every
// model change; the engine's predict and explain run 300 ms after the
// last edit, a newer edit aborting the calls in flight. Engine results
// are only shown for the document text they were computed for.
export function useValidation(
  path: string,
  model: GraphModel | null,
  nodeIds: readonly string[],
  catalog: Catalog,
  cohortFields: CohortField[] | undefined,
  // Client findings computed outside the manifest checks (joins.ts).
  extra: readonly Issue[] = NONE,
): Validation {
  const [engine, setEngine] = useState<Engine | null>(null)
  const text = useMemo(() => (model ? emitModelText(model) : null), [model])

  useEffect(() => {
    if (text === null) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      const issues = postPredict(path, text, ctl.signal).then((r) => r.issues.map((i): Issue => ({ ...i, source: 'engine' })))
      // Explain is only hover text: its failure never hides predict's issues.
      const explain = postExplain(path, text, ctl.signal).catch((e: unknown) => {
        if (ctl.signal.aborted) throw e
        return { steps: [] as ExplainStep[], summary: undefined }
      })
      Promise.all([issues, explain])
        .then(([iss, ex]) => setEngine({ text, issues: iss, steps: ex.steps, ...(ex.summary && { summary: ex.summary }) }))
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return
          setEngine({ text, issues: [], steps: [], failed: e instanceof Error ? e.message : String(e) })
        })
    }, VALIDATE_DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [path, text])

  const client = useMemo(() => (model ? [...clientIssues(model, catalog, cohortFields), ...extra] : []), [model, catalog, cohortFields, extra])
  // Engine issues for an older text would point at nodes that may have
  // moved; until the current text is validated only client issues show.
  // Explain text is kept across edits (it is descriptive, not a verdict).
  const current = engine !== null && engine.text === text
  const attached = useMemo(
    () => attach(nodeIds, client, current ? engine.issues : [], engine?.steps ?? []),
    [nodeIds, client, current, engine],
  )
  const get = useCallback((id: string) => attached.byNode.get(id), [attached])
  return useMemo(
    () => ({
      get,
      request: attached.request,
      ...(engine?.summary && { summary: engine.summary }),
      ...(current && engine.failed && { failed: engine.failed }),
    }),
    [get, attached, engine, current],
  )
}
