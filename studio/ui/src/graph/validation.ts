// validation holds the pure parts of node validation: the client-side
// checks against the engine manifest (operator names, required params,
// field types), and how client and engine issues (POST /api/predict) and
// explain steps (POST /api/explain) attach to graph nodes. Fetching and
// state live in useValidation.ts.
//
// Engine issues carry the most precise node path the server could
// locate (`aggregations[1].field`, `requests[0].cohort`, `` for the
// request as a whole). An issue attaches to the nearest graph node whose
// id is a path prefix of it; issues no node covers are request-level.

import type { CohortField, ExplainStep, Manifest, PredictIssue } from '../api.ts'
import { getIn } from './jsonEdit.ts'
import { stringValue } from './jsonTree.ts'
import type { GraphModel } from './model.ts'
import { isPathPrefix } from './nodePath.ts'
import { buildForm, formProblems, type Catalog } from './paramForms.ts'
import { refusal, slotsFor } from './ports.ts'
import { sectionInfo } from './requestGraph.ts'

export type Severity = 'error' | 'warning' | 'hint'

// Issue is one finding on a node path. source tells the manifest check
// (client) from the engine's predict (engine).
export type Issue = PredictIssue & { source: 'client' | 'engine' }

// NodeValidation is what a node shows: its issues (badges, hover list)
// and the engine's explain text for it (hover).
export type NodeValidation = { issues: Issue[]; explain?: string }

// clientIssues checks every entry against the manifest: an operator the
// manifest does not list (predict does not refuse those crisply; it
// answers valid:false with a buffered-path hint), missing required params
// and exactly_one_of groups the manifest declares (the inspector form's
// own check), and cohort fields wired into inputs that refuse their
// type. Without a manifest nothing is checked.
export function clientIssues(model: GraphModel, catalog: Catalog, cohortFields?: CohortField[]): Issue[] {
  const manifest = catalog.manifest
  if (!manifest) return []
  const types = new Map(cohortFields?.map((f) => [f.name, f.type]) ?? [])
  const out: Issue[] = []
  for (const node of model.nodes.values()) {
    if (node.kind !== 'entry' || node.value.type !== 'object') continue
    const form = buildForm(node, catalog)
    const op = form.op
    if (op === undefined) continue
    if (form.opKnown === false) {
      const proposed = closestOperators(manifest, node.section, op)
      out.push({
        path: node.id,
        severity: 'error',
        code: 'UNKNOWN_OPERATOR',
        message: `${op} is not an operator the engine knows`,
        current: op,
        ...(proposed.length > 0 && { proposed }),
        source: 'client',
      })
      continue
    }
    // Required params as the manifest declares them (generated forms
    // only: hand-written forms mark inputs required that some operators
    // of the family leave out, e.g. a row-scope overlay's ref).
    for (const p of form.mode === 'generated' ? formProblems(form, node.value) : []) {
      out.push({ path: node.id, severity: 'error', code: 'MISSING_PARAM', message: p, source: 'client' })
    }
    if (types.size === 0) continue
    for (const slot of slotsFor(manifest, node.section, op)) {
      const v = getIn(node.value, [slot.key])
      const refs: [string, string][] = []
      if (v?.type === 'string') refs.push([slot.key, stringValue(v) ?? ''])
      else if (v?.type === 'array') v.items.forEach((x, i) => x.type === 'string' && refs.push([`${slot.key}[${i}]`, stringValue(x) ?? '']))
      for (const [key, name] of refs) {
        const why = refusal(slot.accept, types.get(name))
        if (why) {
          out.push({
            path: `${node.id}.${key}`,
            severity: 'error',
            code: 'FIELD_TYPE',
            message: `${key} ${why} (${name})`,
            current: name,
            source: 'client',
          })
        }
      }
    }
  }
  return out
}

// closestOperators proposes up to three manifest operators of the
// section nearest to an unknown name by edit distance.
export function closestOperators(manifest: Manifest, section: string, op: string): string[] {
  const list = sectionInfo(section)?.catalog?.(manifest) ?? []
  const names = [...new Set(list.map((o) => o.family ?? o.name ?? o.kind ?? '').filter((n) => n !== ''))]
  const limit = Math.max(3, Math.floor(op.length / 2))
  return names
    .map((n) => ({ n, d: distance(op.toUpperCase(), n.toUpperCase()) }))
    .filter((x) => x.d <= limit)
    .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
    .slice(0, 3)
    .map((x) => x.n)
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

// ownerOf is the node an issue path belongs to: the longest node id that
// is a path prefix of it, or undefined (request level).
export function ownerOf(path: string, nodeIds: readonly string[]): string | undefined {
  let best: string | undefined
  for (const id of nodeIds) {
    if (id === '' || !prefixOf(id, path)) continue
    if (best === undefined || id.length > best.length) best = id
  }
  return best
}

function prefixOf(id: string, path: string): boolean {
  try {
    return isPathPrefix(id, path)
  } catch {
    return false
  }
}

export type Attached = {
  byNode: Map<string, NodeValidation>
  // Issues no node covers: shown on the request bar.
  request: Issue[]
}

// attach groups client issues, engine issues and explain steps by node.
// An engine issue repeating a client unknown-operator error (the engine's
// "unknown test type" for the same node) is dropped.
export function attach(nodeIds: readonly string[], client: Issue[], engine: Issue[], steps: ExplainStep[]): Attached {
  const byNode = new Map<string, NodeValidation>()
  const request: Issue[] = []
  const entry = (id: string) => {
    let v = byNode.get(id)
    if (!v) byNode.set(id, (v = { issues: [] }))
    return v
  }
  const unknownOp = new Map<string, string>()
  const add = (is: Issue) => {
    const id = ownerOf(is.path, nodeIds)
    if (id === undefined) {
      request.push(is)
      return
    }
    if (is.source === 'client' && is.code === 'UNKNOWN_OPERATOR' && typeof is.current === 'string') unknownOp.set(id, is.current)
    if (is.source === 'engine' && is.severity !== 'hint') {
      const op = unknownOp.get(id)
      if (op !== undefined && is.message.includes(op)) return
    }
    const v = entry(id)
    if (!v.issues.some((x) => x.severity === is.severity && x.message === is.message && x.path === is.path)) v.issues.push(is)
  }
  client.forEach(add)
  engine.forEach(add)
  for (const s of steps) {
    const id = s.path === '' ? undefined : ownerOf(s.path, nodeIds)
    if (id === undefined || !s.text) continue
    const v = entry(id)
    v.explain = v.explain ? `${v.explain}\n${s.text}` : s.text
  }
  for (const v of byNode.values()) v.issues.sort((a, b) => RANK[a.severity] - RANK[b.severity])
  request.sort((a, b) => RANK[a.severity] - RANK[b.severity])
  return { byNode, request }
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, hint: 2 }

// worst is the most severe badge-worthy severity of a node's issues
// (hints never badge).
export function worst(issues: readonly Issue[]): 'error' | 'warning' | undefined {
  if (issues.some((i) => i.severity === 'error')) return 'error'
  if (issues.some((i) => i.severity === 'warning')) return 'warning'
  return undefined
}

// proposal renders a suggestion's proposed values for display.
export function proposal(is: Pick<PredictIssue, 'proposed'>): string | undefined {
  if (!is.proposed || is.proposed.length === 0) return undefined
  const shown = is.proposed.slice(0, 5).map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
  return shown.join(', ') + (is.proposed.length > 5 ? `, … (${is.proposed.length - 5} more)` : '')
}
