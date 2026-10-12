// partition holds the client side of a post-test's `params.partition_by`
// (pulse v1.0.0-alpha.10): on a grouped request every post-test runs once
// per PARTITION of the result rows. The list names GROUP KEY COLUMNS — the
// column each grouper writes its bucket key under — and must be a leading
// prefix of them, in groups order:
//
//   - absent or null: every key but the last (implicit);
//   - [] : no partition, one run over every row;
//   - [k0, k1, …]: the leading keys named, in order.
//
// Every post-test of one request must resolve to the same depth. This
// mirrors pulse groupedtests.PostTestDepth / seriespartition.PrefixDepth
// (refusal reasons not_string_list, unknown_field, not_prefix,
// mixed_depth) so the canvas can say why before the engine does.

import { getIn, setIn } from './jsonEdit.ts'
import { stringValue, type JsonNode } from './jsonTree.ts'
import type { GraphModel } from './model.ts'
import { frameOf } from './nodePath.ts'
import { PARTITION_KEY } from './ports.ts'

export { PARTITION_KEY }

// PARTITION_PATH is PARTITION_KEY as a relative path.
export const PARTITION_PATH = ['params', 'partition_by'] as const

// isPartitionRow says whether a row key is the partition list or one of
// its items (`params.partition_by`, `params.partition_by[1]`).
export function isPartitionRow(rowKey: string): boolean {
  return /^params\.partition_by(\[\d+\])?$/.test(rowKey)
}

// GroupEntry is what a grouper's key column depends on.
export type GroupEntry = { type?: string; field?: string; vector?: string; fields?: string[] }

// groupKeyColumn is the column a grouper writes its key under (pulse
// vectors.GroupKeyField): its field, else a vector grouper's
// `<TYPE>_<vector>` or `<TYPE>_<first field>`.
export function groupKeyColumn(g: GroupEntry): string {
  if (g.field) return g.field
  if (g.vector) return `${g.type ?? ''}_${g.vector}`
  if (g.fields && g.fields.length > 0) return `${g.type ?? ''}_${g.fields[0]}`
  return ''
}

// groupKeysOfModel lists the group key columns of the request frame
// (`` for a plain request, `requests[1]`, `stages[0].request`, …) in
// groups order.
export function groupKeysOfModel(model: GraphModel, frame: string): string[] {
  const out: string[] = []
  for (const n of model.nodes.values()) {
    if (n.kind !== 'entry' || n.section !== 'groups' || frameOf(n.id) !== frame) continue
    out.push(groupKeyColumn(groupEntryOf(n.value)))
  }
  return out
}

function groupEntryOf(v: JsonNode): GroupEntry {
  const s = (k: string) => stringValue(getIn(v, [k]))
  const fields = getIn(v, ['fields'])
  return {
    type: s('type'),
    field: s('field'),
    vector: s('vector'),
    ...(fields?.type === 'array' && { fields: fields.items.map((x) => stringValue(x) ?? '') }),
  }
}

// PartitionProblem is one refusal: the item index it is about (undefined
// for the whole list) and the reason.
export type PartitionProblem = { index?: number; reason: 'not_string_list' | 'unknown_field' | 'not_prefix'; message: string }

// partitionProblem checks one partition_by value against the group key
// columns. undefined (absent) and null are the implicit default.
export function partitionProblem(value: JsonNode | undefined, keys: readonly string[]): PartitionProblem | null {
  if (value === undefined || value.type === 'null') return null
  if (value.type !== 'array' || !value.items.every((x) => x.type === 'string')) {
    return { reason: 'not_string_list', message: 'partition_by must be a list of group key columns' }
  }
  const groups = keys.length > 0 ? ` (groups: ${keys.join(', ')})` : ' (the request has no groups)'
  for (let i = 0; i < value.items.length; i++) {
    const name = stringValue(value.items[i]) ?? ''
    if (!keys.includes(name)) {
      return { index: i, reason: 'unknown_field', message: `partition_by names ${name}, which is not a group key column${groups}` }
    }
    if (keys[i] !== name) {
      return { index: i, reason: 'not_prefix', message: `partition_by must be a leading prefix of the group key columns; ${name} is out of place${groups}` }
    }
  }
  return null
}

// partitionDepth is how many leading group keys a post-test partitions
// by: the explicit list's length, else every key but the last.
export function partitionDepth(value: JsonNode | undefined, groupCount: number): number {
  if (value?.type === 'array') return value.items.length
  return groupCount > 1 ? groupCount - 1 : 0
}

// wireRefusal says why ref cannot go into partition item index, or null:
// the item must be the group key column at that position.
export function wireRefusal(ref: string, index: number, keys: readonly string[]): string | null {
  if (keys.length === 0) return 'partition_by takes a group key column, and the request has no groups'
  if (!keys.includes(ref)) return `partition_by takes a group key column (${keys.join(', ')}), not ${ref}`
  if (keys[index] !== ref) {
    return `partition_by is a leading prefix of the group keys: item ${index + 1} is ${keys[index] ?? '(none: every key is listed)'}, not ${ref}`
  }
  return null
}

// removePartitionItem removes item index of a post-test's partition_by.
// Removing the last one removes partition_by itself (back to the
// implicit default: `[]` would mean no partition), and a `params` object
// left empty goes too.
export function removePartitionItem(value: JsonNode, index: number): JsonNode {
  if (getIn(value, [...PARTITION_PATH, index]) === undefined) return value
  let out = setIn(value, [...PARTITION_PATH, index], undefined)
  const list = getIn(out, PARTITION_PATH)
  if (list?.type === 'array' && list.items.length === 0) out = clearPartition(out)
  return out
}

// clearPartition removes partition_by (and a `params` left empty).
export function clearPartition(value: JsonNode): JsonNode {
  let out = setIn(value, PARTITION_PATH, undefined)
  const params = getIn(out, ['params'])
  if (params?.type === 'object' && params.members.length === 0) out = setIn(out, ['params'], undefined)
  return out
}
