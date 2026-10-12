// jsonTree is an ordered, literal-preserving JSON tree. JSON.parse loses
// things a lossless editor must keep: object key order for integer-like
// keys, duplicate keys, and the exact spelling of numbers (`0.10`, `1e3`,
// integers past 2^53) and strings (`é`). This tree keeps every
// member in source order and every scalar as its source token, so
// stringifyJson(parseJson(text)) is text with insignificant whitespace
// removed, and nothing else changed.
//
// Formatting is not this module's job: the save API re-formats compact
// output into the file's house style (studio/internal/jsonfmt).

export type JsonObject = { type: 'object'; members: JsonMember[] }
export type JsonArray = { type: 'array'; items: JsonNode[] }
export type JsonScalar = { type: 'string' | 'number' | 'boolean' | 'null'; raw: string }
export type JsonNode = JsonObject | JsonArray | JsonScalar
// rawKey is the key's source token when it is not JSON.stringify(key)
// (e.g. `"a\u00e9"`), so the key's spelling survives too.
export type JsonMember = { key: string; rawKey?: string; value: JsonNode }

export class JsonSyntaxError extends Error {
  readonly offset: number
  constructor(message: string, offset: number) {
    super(`${message} at offset ${offset}`)
    this.name = 'JsonSyntaxError'
    this.offset = offset
  }
}

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y
// A JSON string token: no raw control characters, only valid escapes.
// eslint-disable-next-line no-control-regex -- excluding U+0000-U+001F is the JSON rule
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))*"/y

// parseJson parses one JSON document (RFC 8259) into a tree. It throws
// JsonSyntaxError with the byte offset of the first problem.
export function parseJson(text: string): JsonNode {
  let i = 0
  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++
      else break
    }
  }
  const fail = (why: string): never => {
    throw new JsonSyntaxError(why, i)
  }
  const token = (re: RegExp): string | null => {
    re.lastIndex = i
    const m = re.exec(text)
    if (!m) return null
    i += m[0].length
    return m[0]
  }
  const value = (depth: number): JsonNode => {
    if (depth > 512) fail('nesting too deep')
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      const members: JsonMember[] = []
      ws()
      if (text[i] === '}') {
        i++
        return { type: 'object', members }
      }
      for (;;) {
        ws()
        if (text[i] !== '"') fail('expected object key')
        const raw = token(STRING) ?? fail('bad string')
        ws()
        if (text[i] !== ':') fail('expected ":"')
        i++
        const key = JSON.parse(raw) as string
        const v = value(depth + 1)
        members.push(raw === JSON.stringify(key) ? { key, value: v } : { key, rawKey: raw, value: v })
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === '}') {
          i++
          return { type: 'object', members }
        }
        fail('expected "," or "}"')
      }
    }
    if (c === '[') {
      i++
      const items: JsonNode[] = []
      ws()
      if (text[i] === ']') {
        i++
        return { type: 'array', items }
      }
      for (;;) {
        items.push(value(depth + 1))
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === ']') {
          i++
          return { type: 'array', items }
        }
        fail('expected "," or "]"')
      }
    }
    if (c === '"') return { type: 'string', raw: token(STRING) ?? fail('bad string') }
    if (text.startsWith('true', i) || text.startsWith('false', i)) {
      const raw = text[i] === 't' ? 'true' : 'false'
      i += raw.length
      return { type: 'boolean', raw }
    }
    if (text.startsWith('null', i)) {
      i += 4
      return { type: 'null', raw: 'null' }
    }
    const num = token(NUMBER)
    if (num !== null) return { type: 'number', raw: num }
    return fail(i >= text.length ? 'unexpected end of input' : 'unexpected character')
  }
  const root = value(0)
  ws()
  if (i < text.length) fail('trailing content')
  return root
}

// stringifyJson renders a tree as compact JSON, scalars exactly as parsed.
export function stringifyJson(node: JsonNode): string {
  switch (node.type) {
    case 'object':
      return `{${node.members.map((m) => `${m.rawKey ?? JSON.stringify(m.key)}:${stringifyJson(m.value)}`).join(',')}}`
    case 'array':
      return `[${node.items.map(stringifyJson).join(',')}]`
    default:
      return node.raw
  }
}

// toPlain converts a tree to ordinary JS values for read-only consumers
// (the graph view). It is lossy in the ways JSON.parse is: duplicate keys
// collapse, integer-like keys reorder, numbers become doubles. Never feed
// its result back into a save; edit the tree instead.
export function toPlain(node: JsonNode): unknown {
  switch (node.type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const m of node.members) {
        Object.defineProperty(out, m.key, { value: toPlain(m.value), enumerable: true, writable: true, configurable: true })
      }
      return out
    }
    case 'array':
      return node.items.map(toPlain)
    default:
      return JSON.parse(node.raw)
  }
}

// fromPlain converts an ordinary JS value (e.g. a freshly edited param)
// into a tree. Non-finite numbers and undefined are rejected.
export function fromPlain(v: unknown): JsonNode {
  if (v === null) return { type: 'null', raw: 'null' }
  if (Array.isArray(v)) return { type: 'array', items: v.map(fromPlain) }
  switch (typeof v) {
    case 'string':
      return { type: 'string', raw: JSON.stringify(v) }
    case 'boolean':
      return { type: 'boolean', raw: String(v) }
    case 'number':
      if (!Number.isFinite(v)) throw new Error(`cannot encode ${v} as JSON`)
      return { type: 'number', raw: JSON.stringify(v) }
    case 'object':
      return {
        type: 'object',
        members: Object.entries(v as Record<string, unknown>).map(([key, value]) => ({ key, value: fromPlain(value) })),
      }
    default:
      throw new Error(`cannot encode ${typeof v} as JSON`)
  }
}

// member returns the value of the first member named key, if any.
export function member(obj: JsonObject, key: string): JsonNode | undefined {
  return obj.members.find((m) => m.key === key)?.value
}

// stringValue returns the decoded value of a string scalar.
export function stringValue(node: JsonNode | undefined): string | undefined {
  return node?.type === 'string' ? (JSON.parse(node.raw) as string) : undefined
}
