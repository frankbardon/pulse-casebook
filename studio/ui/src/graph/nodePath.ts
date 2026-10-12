// Node ids are JSON paths into the request document. Every graph node that
// stands for a piece of request JSON is keyed by the path of that piece, so
// a node id can always be turned back into the exact place in the file it
// came from (and edits, previews, errors and layout sidecars can key off it).
//
// Grammar (a subset of JavaScript accessor syntax):
//
//   path    := ""                       the document root
//            | first rest*
//   first   := ident | index | quoted
//   rest    := "." ident | index | quoted
//   ident   := [A-Za-z_][A-Za-z0-9_]*   an object key that is an identifier
//   index   := "[" digits "]"           an array index, base 10, no sign,
//                                       no leading zeros (except "0")
//   quoted  := "[" json-string "]"      any other object key, JSON-encoded
//
// Examples:
//   cohort                      the request's cohort object
//   tests[2]                    third entry of tests
//   crosstab                    the crosstab object
//   requests[1].filterers[0]    first filter of the second compose slot
//   stages[0].aggregations[3]   fourth aggregation of the first chain stage
//   ["odd key"]                 a top-level key that is not an identifier
//
// formatPath and parsePath are exact inverses: formatPath(parsePath(id)) ===
// id for every valid id, and parsePath(formatPath(segs)) deep-equals segs.

export type PathSegment = string | number

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

// formatPath renders segments as a node id.
export function formatPath(segments: readonly PathSegment[]): string {
  let out = ''
  for (const seg of segments) {
    if (typeof seg === 'number') {
      if (!Number.isInteger(seg) || seg < 0) throw new Error(`invalid path index: ${seg}`)
      out += `[${seg}]`
    } else if (IDENT.test(seg)) {
      out += out === '' ? seg : `.${seg}`
    } else {
      out += `[${JSON.stringify(seg)}]`
    }
  }
  return out
}

// parsePath splits a node id into segments. It throws on malformed ids.
export function parsePath(id: string): PathSegment[] {
  const segs: PathSegment[] = []
  let i = 0
  const fail = (why: string): never => {
    throw new Error(`invalid node path ${JSON.stringify(id)} at ${i}: ${why}`)
  }
  const readIdent = () => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(id.slice(i))
    if (!m) fail('expected identifier')
    segs.push(m![0])
    i += m![0].length
  }
  while (i < id.length) {
    const c = id[i]
    if (c === '[') {
      if (id[i + 1] === '"') {
        // Quoted key: scan to the closing quote, honouring escapes.
        let j = i + 2
        while (j < id.length && id[j] !== '"') j += id[j] === '\\' ? 2 : 1
        if (j >= id.length || id[j + 1] !== ']') fail('unterminated quoted key')
        let key: unknown
        try {
          key = JSON.parse(id.slice(i + 1, j + 1))
        } catch {
          fail('bad quoted key')
        }
        if (typeof key !== 'string' || IDENT.test(key)) fail('quoted key must be a non-identifier string')
        segs.push(key as string)
        i = j + 2
      } else {
        const m = /^\[(0|[1-9][0-9]*)\]/.exec(id.slice(i))
        if (!m) fail('expected index')
        segs.push(Number(m![1]))
        i += m![0].length
      }
    } else if (c === '.') {
      if (segs.length === 0) fail('leading dot')
      i++
      readIdent()
    } else {
      if (segs.length !== 0) fail('expected "." or "["')
      readIdent()
    }
  }
  return segs
}

// childPath appends segments to an existing node id.
export function childPath(parent: string, ...segments: PathSegment[]): string {
  return formatPath([...parsePath(parent), ...segments])
}

// isPathPrefix reports whether prefix names id itself or one of its
// ancestors (segment-wise, so "tests[1]" is not a prefix of "tests[10]").
export function isPathPrefix(prefix: string, id: string): boolean {
  const p = parsePath(prefix)
  const s = parsePath(id)
  return p.length <= s.length && p.every((seg, k) => seg === s[k])
}

// getAtPath returns the value a node id points at inside doc, or undefined
// when the path does not exist.
export function getAtPath(doc: unknown, id: string): unknown {
  let cur: unknown = doc
  for (const seg of parsePath(id)) {
    if (typeof seg === 'number') {
      if (!Array.isArray(cur) || seg >= cur.length) return undefined
      cur = cur[seg]
    } else {
      if (typeof cur !== 'object' || cur === null || Array.isArray(cur) || !Object.hasOwn(cur, seg))
        return undefined
      cur = (cur as Record<string, unknown>)[seg]
    }
  }
  return cur
}

// splitFrame splits a node id into the request frame it lives in and the
// path inside that frame. Frames are the nested requests of the
// multi-request roots: compose slots (`requests[1]`), compose fits
// (`fits[0].request`) and chain stages (`stages[2].request`). Anything
// else, including every node of a plain request, lives in the root frame
// "". Throws on malformed ids, like parsePath.
export function splitFrame(id: string): { frame: string; rest: PathSegment[] } {
  const segs = parsePath(id)
  if (segs[0] === 'requests' && typeof segs[1] === 'number') {
    return { frame: formatPath(segs.slice(0, 2)), rest: segs.slice(2) }
  }
  if ((segs[0] === 'fits' || segs[0] === 'stages') && typeof segs[1] === 'number' && segs[2] === 'request') {
    return { frame: formatPath(segs.slice(0, 3)), rest: segs.slice(3) }
  }
  return { frame: '', rest: segs }
}

// frameOf is splitFrame's frame, or "" for an id that does not parse.
export function frameOf(id: string): string {
  try {
    return splitFrame(id).frame
  } catch {
    return ''
  }
}
