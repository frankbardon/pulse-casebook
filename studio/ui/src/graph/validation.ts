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
import { stringValue, type JsonNode } from './jsonTree.ts'
import type { GraphModel } from './model.ts'
import { frameOf, isPathPrefix, parsePath } from './nodePath.ts'
import { groupKeysOfModel, partitionDepth, partitionProblem, PARTITION_KEY, PARTITION_PATH } from './partition.ts'
import { chainRefusal } from './chainRules.ts'
import { buildForm, formProblems, type Catalog, type NodeForm } from './paramForms.ts'
import { isGlob, refusal, slotsFor, vectorMemberRefusal } from './ports.ts'
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
// type, and, in a chain, stage operators the chain gate rejects. Without
// a manifest nothing is checked.
export function clientIssues(model: GraphModel, catalog: Catalog, cohortFields?: CohortField[]): Issue[] {
  const manifest = catalog.manifest
  if (!manifest) return []
  const types = new Map(cohortFields?.map((f) => [f.name, f.type]) ?? [])
  const out: Issue[] = []
  const frameKeys = new Map<string, string[]>()
  const keysOf = (frame: string) => {
    let k = frameKeys.get(frame)
    if (!k) frameKeys.set(frame, (k = groupKeysOfModel(model, frame)))
    return k
  }
  for (const node of model.nodes.values()) {
    if (node.kind !== 'entry' || node.value.type !== 'object') continue
    const form = buildForm(node, catalog)
    if (node.section === 'vectors') {
      out.push(...vectorIssues(node.id, node.value, form, types))
      continue
    }
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
    // Chain stages run only what the chain gate accepts (chainRules.ts).
    if (model.kind === 'chain' && node.id.startsWith('stages[')) {
      const why = chainRefusal(manifest, node.section, op, Number(/^stages\[(\d+)\]/.exec(node.id)?.[1] ?? 0))
      if (why) out.push({ path: node.id, severity: 'error', code: 'CHAIN_STAGE', message: why, current: op, source: 'client' })
    }
    // Required params as the manifest declares them (generated forms
    // only: hand-written forms mark inputs required that some operators
    // of the family leave out, e.g. a row-scope overlay's ref).
    for (const p of form.mode === 'generated' ? formProblems(form, node.value) : []) {
      out.push({ path: node.id, severity: 'error', code: 'MISSING_PARAM', message: p, source: 'client' })
    }
    if (node.section === 'post_tests') out.push(...partitionIssues(model, node.id, node.value, keysOf))
    if (types.size === 0) continue
    for (const slot of slotsFor(manifest, node.section, op)) {
      const v = getIn(node.value, parsePath(slot.key))
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

// vectorIssues checks a vectors entry the way pulse predict does before
// any record is read (PULSE_VECTOR_*): exactly one of fields / pattern,
// members of an integer or float type (packed_bool only with coerce
// binary), one label per literal member, and a scale range only beside
// kind scale. Glob members are not checked (they expand on the engine).
function vectorIssues(id: string, value: JsonNode, form: NodeForm, types: ReadonlyMap<string, string>): Issue[] {
  const out: Issue[] = []
  const issue = (path: string, message: string, current?: string): Issue => ({
    path,
    severity: 'error',
    code: 'VECTOR',
    message,
    ...(current !== undefined && { current }),
    source: 'client',
  })
  for (const p of formProblems(form, value)) out.push(issue(id, p))
  const fields = getIn(value, ['fields'])
  const coerce = stringValue(getIn(value, ['coerce']))
  const members = fields?.type === 'array' ? fields.items.map((x) => stringValue(x)) : []
  if (types.size > 0) {
    members.forEach((name, i) => {
      if (name === undefined || isGlob(name)) return
      const why = vectorMemberRefusal(types.get(name), coerce)
      if (why) out.push(issue(`${id}.fields[${i}]`, `fields[${i}] ${why} (${name})`, name))
    })
  }
  const labels = getIn(value, ['labels'])
  if (labels?.type === 'array' && fields?.type === 'array' && !members.some((m) => m === undefined || isGlob(m)) && labels.items.length !== members.length) {
    out.push(issue(`${id}.labels`, `labels has ${labels.items.length} entries for ${members.length} members`))
  }
  const scaled = getIn(value, ['scale_min']) !== undefined || getIn(value, ['scale_max']) !== undefined
  if (scaled && stringValue(getIn(value, ['kind'])) !== 'scale') out.push(issue(id, 'scale_min / scale_max are accepted only beside kind: "scale"'))
  return out
}

// partitionIssues checks a post-test's params.partition_by against the
// request's group key columns (pulse PULSE_TEST_PARTITION_INVALID): a
// string list, each name a group key column, a leading prefix, and the
// same depth as the request's first post-test.
function partitionIssues(model: GraphModel, id: string, value: JsonNode, keysOf: (frame: string) => string[]): Issue[] {
  const frame = frameOf(id)
  const keys = keysOf(frame)
  const v = getIn(value, PARTITION_PATH)
  const p = partitionProblem(v, keys)
  const issue = (path: string, message: string, current?: string): Issue => ({
    path,
    severity: 'error',
    code: 'PARTITION_BY',
    message,
    ...(current !== undefined && { current }),
    source: 'client',
  })
  if (p) {
    const at = p.index !== undefined ? `${id}.${PARTITION_KEY}[${p.index}]` : `${id}.${PARTITION_KEY}`
    const item = p.index !== undefined && v?.type === 'array' ? stringValue(v.items[p.index]) : undefined
    return [issue(at, p.message, item)]
  }
  // Mixed depth: compare with the frame's first post-test.
  const first = [...model.nodes.values()].find((n) => n.kind === 'entry' && n.section === 'post_tests' && frameOf(n.id) === frame)
  if (!first || first.id === id || partitionProblem(getIn(first.value, PARTITION_PATH), keys)) return []
  const mine = partitionDepth(v, keys.length)
  const theirs = partitionDepth(getIn(first.value, PARTITION_PATH), keys.length)
  if (mine === theirs) return []
  return [
    issue(
      v === undefined ? id : `${id}.${PARTITION_KEY}`,
      `partitions by ${mine} group key(s) and ${first.id} by ${theirs}: every post-test of one request must partition alike`,
    ),
  ]
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
// "unknown test type" for the same node), or a client partition_by error
// (PULSE_TEST_PARTITION_INVALID), is dropped.
export function attach(nodeIds: readonly string[], client: Issue[], engine: Issue[], steps: ExplainStep[]): Attached {
  const byNode = new Map<string, NodeValidation>()
  const request: Issue[] = []
  const entry = (id: string) => {
    let v = byNode.get(id)
    if (!v) byNode.set(id, (v = { issues: [] }))
    return v
  }
  const unknownOp = new Map<string, string>()
  // Nodes with a client partition_by finding: the engine's
  // PULSE_TEST_PARTITION_INVALID for the same post-test repeats it.
  const partitioned = new Set<string>()
  const add = (is: Issue) => {
    const id = ownerOf(is.path, nodeIds)
    if (id === undefined) {
      request.push(is)
      return
    }
    if (is.source === 'client' && is.code === 'UNKNOWN_OPERATOR' && typeof is.current === 'string') unknownOp.set(id, is.current)
    if (is.source === 'client' && is.code === 'PARTITION_BY') partitioned.add(id)
    if (is.source === 'engine' && is.code === 'PULSE_TEST_PARTITION_INVALID' && partitioned.has(id)) return
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
