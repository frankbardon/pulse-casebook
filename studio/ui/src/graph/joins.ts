// joins holds the pure parts of first-class joins (pulse Request.Joins,
// guide skill join-design): the manifest's join envelope, the joined
// schema a join adds (the right cohort's fields, prefixed with `as`),
// OnPair key-type compatibility, the right-cohort picker's options and
// the client-side join checks. The graph side (join nodes, their field
// handles and wires) lives in requestGraph.ts and wiring.ts.

import type { CohortField, Manifest } from '../api.ts'
import { getIn } from './jsonEdit.ts'
import { stringValue } from './jsonTree.ts'
import type { GraphModel } from './model.ts'
import { frameOf, parsePath } from './nodePath.ts'
import { fieldKind } from './ports.ts'
import type { Issue } from './validation.ts'

// JoinEnvelope is the manifest `join` block (pulse descriptor
// JoinCapability): the kinds the engine runs and how many joins one
// request may carry.
export type JoinEnvelope = { kinds?: string[]; max_joins_per_request?: number }

function envelope(manifest: Manifest | undefined): JoinEnvelope | undefined {
  const j = manifest?.join
  return typeof j === 'object' && j !== null ? (j as JoinEnvelope) : undefined
}

// joinKinds lists the JoinSpec kinds the engine runs: the manifest's,
// else v1's only kind (left, outer and anti are reserved).
export function joinKinds(manifest: Manifest | undefined): string[] {
  const k = envelope(manifest)?.kinds
  return Array.isArray(k) && k.length > 0 ? k : ['inner']
}

// maxJoins is how many joins one request may carry (v1: one).
export function maxJoins(manifest: Manifest | undefined): number {
  const n = envelope(manifest)?.max_joins_per_request
  return typeof n === 'number' && n > 0 ? n : 1
}

// rightRef is the cohort reference a join's right side is inspected and
// resolved as: the path read like a cohort file with data_dir "." (the
// root, the request's directory, then its parent; cohortPath.ts and the
// server's preview.ResolveJoins agree). Its JSON is the inspect cache key.
export function rightRef(right: string): { filename: string; data_dir: string } {
  return { filename: right, data_dir: '.' }
}

export function rightKey(right: string): string {
  return JSON.stringify(rightRef(right))
}

// RightSide is what is known of a join's right cohort: its fields,
// null when it could not be inspected (no such file), undefined while
// it is being inspected.
export type RightSide = CohortField[] | null | undefined

// joinedFields is the joined schema's right half: every right field,
// renamed with the `as` prefix.
export function joinedFields(right: readonly CohortField[], as: string): CohortField[] {
  return right.map((f) => ({ ...f, name: as + f.name }))
}

// KEY_FAMILY is the numeric family OnPair keys compare across: unsigned
// ints, floats and dates are interchangeable.
const KEY_FAMILY = /^(u4|u8|u16|u32|u64|f32|f64|date)$/

// joinKeyRefusal says why a left / right key pair cannot be joined on
// (pulse PULSE_JOIN_TYPE_MISMATCH), or null: never a set column;
// identical types match; categoricals match at any width; the
// unsigned-int / float / date family is interchangeable; decimal128 and
// categoricals match nothing else. An unknown type is never refused.
export function joinKeyRefusal(left: string | undefined, right: string | undefined): string | null {
  for (const t of [left, right]) if (t && fieldKind(t) === 'set') return `a set column (${t}) cannot be a join key`
  if (!left || !right || left === right) return null
  const lk = fieldKind(left)
  const rk = fieldKind(right)
  if (lk === 'categorical' && rk === 'categorical') return null
  if (KEY_FAMILY.test(left) && KEY_FAMILY.test(right)) return null
  if (lk === undefined || rk === undefined) return null
  return `key types ${left} and ${right} do not compare`
}

// CohortOption is one entry of the right-cohort picker: the value to
// write (resolvable from the request) and the workspace path it names.
export type CohortOption = { value: string; path: string }

// cohortOptions lists the workspace's cohort files as join right sides
// for a request at requestPath: each written relative to the nearest of
// the request's parent directory, its directory or the root that holds
// it, so the right side resolves to that file.
export function cohortOptions(requestPath: string, cohorts: readonly string[]): CohortOption[] {
  const reqDir = dirname(requestPath)
  const bases = [dirname(reqDir), reqDir].filter((b) => b !== '')
  return [...cohorts]
    .sort()
    .map((path) => {
      const base = bases.find((b) => path.startsWith(b + '/'))
      return { value: base ? path.slice(base.length + 1) : path, path }
    })
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

// JoinContext is what joinIssues needs beyond the model: the right
// cohorts' fields and each request frame's left cohort fields.
export type JoinContext = {
  manifest?: Manifest
  rightFields: (right: string) => RightSide
  leftFields: (frame: string) => CohortField[] | undefined
}

// joinIssues checks every join the way pulse predict does against both
// cohorts' schemas (PULSE_JOIN_*), so the join node carries the finding
// before the engine answers: a right cohort that is missing or not in the
// workspace, a kind the engine does not run, more joins than allowed, no
// keys, keys that name no left / right field or whose types do not
// compare, and joined names colliding with left fields. (A join in a
// later chain stage is chainRules' CHAIN_STAGE finding.)
export function joinIssues(model: GraphModel, ctx: JoinContext): Issue[] {
  const out: Issue[] = []
  const issue = (path: string, code: string, message: string, current?: string): Issue => ({
    path,
    severity: 'error',
    code,
    message,
    ...(current !== undefined && { current }),
    source: 'client',
  })
  const kinds = joinKinds(ctx.manifest)
  const max = maxJoins(ctx.manifest)
  for (const node of model.nodes.values()) {
    if (node.kind !== 'entry' || node.section !== 'joins' || node.value.type !== 'object') continue
    const id = node.id
    const segs = parsePath(id)
    const index = segs[segs.length - 1]
    const frame = frameOf(id)
    if (typeof index === 'number' && index >= max) {
      out.push(issue(id, 'JOIN_TOO_MANY', `a request runs at most ${max} join${max === 1 ? '' : 's'}: pre-join into a cohort for more`))
    }
    const v = node.value
    const kind = stringValue(getIn(v, ['kind']))
    if (kind !== undefined && kind !== '' && !kinds.includes(kind)) {
      out.push(issue(`${id}.kind`, 'JOIN_KIND', `join kind ${kind} is not implemented: the engine runs ${kinds.join(', ')}`, kind))
    }
    const right = stringValue(getIn(v, ['right']))
    let rightFields: CohortField[] | undefined
    if (right === undefined || right === '') {
      out.push(issue(`${id}.right`, 'JOIN_RIGHT', 'right is required: pick the cohort to join'))
    } else {
      const side = ctx.rightFields(right)
      if (side === null) out.push(issue(`${id}.right`, 'JOIN_RIGHT', `right cohort ${right} is not a cohort file in the workspace`, right))
      else if (side) rightFields = side
    }
    const left = ctx.leftFields(frame)
    const leftTypes = new Map(left?.map((f) => [f.name, f.type]))
    const rightTypes = new Map(rightFields?.map((f) => [f.name, f.type]))
    const on = getIn(v, ['on'])
    const pairs = on?.type === 'array' ? on.items : []
    if (pairs.length === 0) out.push(issue(`${id}.on`, 'JOIN_KEYS', 'a join needs at least one on pair (left_field = right_field)'))
    pairs.forEach((p, i) => {
      const at = `${id}.on[${i}]`
      const l = stringValue(getIn(p, ['left_field']))
      const r = stringValue(getIn(p, ['right_field']))
      if (l === undefined || l === '') out.push(issue(`${at}.left_field`, 'JOIN_FIELD', `on[${i}] needs a left_field`))
      else if (left && !leftTypes.has(l)) out.push(issue(`${at}.left_field`, 'JOIN_FIELD', `left_field ${l} is not a field of the left cohort`, l))
      if (r === undefined || r === '') out.push(issue(`${at}.right_field`, 'JOIN_FIELD', `on[${i}] needs a right_field`))
      else if (rightFields && !rightTypes.has(r)) out.push(issue(`${at}.right_field`, 'JOIN_FIELD', `right_field ${r} is not a field of ${right}`, r))
      const why = l && r ? joinKeyRefusal(leftTypes.get(l), rightTypes.get(r)) : null
      if (why) out.push(issue(at, 'JOIN_TYPE', `on[${i}] ${l} = ${r}: ${why}`))
    })
    if (left && rightFields) {
      const as = stringValue(getIn(v, ['as'])) ?? ''
      const clash = joinedFields(rightFields, as).filter((f) => leftTypes.has(f.name)).map((f) => f.name)
      if (clash.length > 0) {
        const shown = clash.slice(0, 3).join(', ') + (clash.length > 3 ? `, … (${clash.length - 3} more)` : '')
        out.push(issue(`${id}.as`, 'JOIN_COLLISION', `joined fields collide with left fields (${shown}): set as to prefix the right side`))
      }
    }
  }
  return out
}
