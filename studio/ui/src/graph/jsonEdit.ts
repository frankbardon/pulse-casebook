// jsonEdit makes targeted, immutable edits to a jsonTree. Everything the
// edit does not touch keeps its exact source form (key order, duplicate
// keys, raw key and number spellings), so an edited node emits the same
// JSON as before apart from the edited value.

import { parseJson, type JsonArray, type JsonNode, type JsonObject } from './jsonTree.ts'
import type { PathSegment } from './nodePath.ts'

// getIn returns the value at rel below node (first member on duplicate
// keys), or undefined.
export function getIn(node: JsonNode | undefined, rel: readonly PathSegment[]): JsonNode | undefined {
  let cur = node
  for (const seg of rel) {
    if (!cur) return undefined
    if (typeof seg === 'number') cur = cur.type === 'array' ? cur.items[seg] : undefined
    else cur = cur.type === 'object' ? cur.members.find((m) => m.key === seg)?.value : undefined
  }
  return cur
}

// setIn returns a copy of node with the value at rel replaced by value.
// A missing object member is appended (missing parent objects are
// created); value undefined removes the member or array item, and an
// object emptied by the removal is removed from its parent too, unless
// it is node itself. Only the containers along rel are copied.
export function setIn(node: JsonNode, rel: readonly PathSegment[], value: JsonNode | undefined): JsonNode {
  const out = setInner(node, rel, 0, value)
  return out ?? { type: 'object', members: [] }
}

function setInner(node: JsonNode | undefined, rel: readonly PathSegment[], i: number, value: JsonNode | undefined): JsonNode | undefined {
  if (i === rel.length) return value
  const seg = rel[i]
  if (typeof seg === 'number') {
    if (!node || node.type !== 'array') {
      if (value === undefined) return node
      throw new Error(`cannot index ${node?.type ?? 'missing value'} with [${seg}]`)
    }
    const arr: JsonArray = node
    if (seg < 0 || seg > arr.items.length || (seg === arr.items.length && i + 1 < rel.length)) {
      throw new Error(`index [${seg}] out of range`)
    }
    const child = setInner(arr.items[seg], rel, i + 1, value)
    const items = arr.items.slice()
    if (child === undefined) items.splice(seg, 1)
    else items[seg] = child
    return { type: 'array', items }
  }
  if (node && node.type !== 'object') {
    if (value === undefined) return node
    throw new Error(`cannot set key ${JSON.stringify(seg)} on a ${node.type}`)
  }
  const obj: JsonObject = node ?? { type: 'object', members: [] }
  const at = obj.members.findIndex((m) => m.key === seg)
  const child = setInner(at >= 0 ? obj.members[at].value : undefined, rel, i + 1, value)
  const members = obj.members.slice()
  if (child === undefined) {
    if (at < 0) return node
    members.splice(at, 1)
    // Drop an object the removal emptied, so clearing the last param
    // does not leave `"params": {}` behind.
    if (members.length === 0 && i > 0) return undefined
  } else if (at >= 0) {
    members[at] = { ...members[at], value: child }
  } else {
    members.push({ key: seg, value: child })
  }
  return { type: 'object', members }
}

// prettyJson renders a tree with two-space indentation for editing,
// scalars exactly as parsed.
export function prettyJson(node: JsonNode, indent = ''): string {
  const inner = indent + '  '
  switch (node.type) {
    case 'object':
      if (node.members.length === 0) return '{}'
      return `{\n${node.members
        .map((m) => `${inner}${m.rawKey ?? JSON.stringify(m.key)}: ${prettyJson(m.value, inner)}`)
        .join(',\n')}\n${indent}}`
    case 'array':
      if (node.items.length === 0) return '[]'
      if (node.items.every((v) => v.type !== 'object' && v.type !== 'array')) {
        return `[${node.items.map((v) => prettyJson(v)).join(', ')}]`
      }
      return `[\n${node.items.map((v) => inner + prettyJson(v, inner)).join(',\n')}\n${indent}]`
    default:
      return node.raw
  }
}

// parseEdit parses JSON text typed by the user into a tree, keeping
// their spelling. It returns an error message instead of throwing.
export function parseEdit(text: string): { value: JsonNode } | { error: string } {
  try {
    return { value: parseJson(text) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// stringItems builds a string array from values, reusing old's items
// whose decoded value is unchanged so their spelling survives.
export function stringItems(old: JsonNode | undefined, values: readonly string[]): JsonArray {
  const pool = old?.type === 'array' ? old.items.slice() : []
  const items = values.map((v): JsonNode => {
    const i = pool.findIndex((n) => n.type === 'string' && (JSON.parse(n.raw) as string) === v)
    if (i >= 0) return pool.splice(i, 1)[0]
    return { type: 'string', raw: JSON.stringify(v) }
  })
  return { type: 'array', items }
}

// sameJson reports whether two trees emit the same compact JSON.
export function sameJson(a: JsonNode | undefined, b: JsonNode | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.type !== b.type) return false
  switch (a.type) {
    case 'object': {
      const bo = b as JsonObject
      return (
        a.members.length === bo.members.length &&
        a.members.every(
          (m, i) => m.key === bo.members[i].key && m.rawKey === bo.members[i].rawKey && sameJson(m.value, bo.members[i].value),
        )
      )
    }
    case 'array': {
      const ba = b as JsonArray
      return a.items.length === ba.items.length && a.items.every((v, i) => sameJson(v, ba.items[i]))
    }
    default:
      return a.raw === (b as { raw: string }).raw
  }
}
