// responseParts holds the pure parts of a frame's Response node beyond
// the data table (resultGraph.ts): which part of the Pulse response each
// analysis entry lands in, what the frame's `return` block trims, and
// the one-line headline of a part's result. View-only: nothing here is
// written into the request JSON (pulse v1.0.0-alpha.10 semantics):
//
//   - Response parts by request slot: `tests[]` → `tests` (one per test
//     × group, test-major), `regressions[]` → `regressions` (never per
//     group), `matrices[]` → `matrices` (one per matrix × group),
//     `crosstab` → `crosstab` (shape "long" lands its cells on `data`
//     instead), `post_tests[]` → `post_tests` (one per post-test ×
//     partition), `overlays[]` → `overlays` (one layer per spec, a
//     sibling keyed to the host's coordinates: crosstab cells, else the
//     grouped series, never mutating `data`). Vectors produce no part;
//     `multiplicity` adds `p_adjusted` beside the raw p of tests,
//     post-tests and request-family overlays; `return` shapes the rest.
//   - `return` (response-shaping.md): preset, then include adds, then
//     exclude removes (exclude wins). Include with no preset starts from
//     an empty base; exclude / precision alone shape the full response.
//     Every preset keeps some of each part, so only include / exclude
//     drop a part whole. Paths: `.` between keys, `[*]` into every array
//     element, a trailing `*` prefix glob on a map-key segment
//     (`data[*].<column>` names an output column).

// No import of previews.ts: it reads requestGraph.ts at load, which
// imports this module (through resultGraph.ts).

// Response parts the Response node lists below its table, in order.
// A Compose root's response (types.ComposedResponse) has its own parts:
// `responses` (one per slot), `overlays` (Compose-host layers, the only
// part its `return` shapes), `fits` (keyed by fit name, never shaped)
// and `ranking` (a ranked sweep, never shaped).
export type RequestPartKey = 'tests' | 'regressions' | 'matrices' | 'crosstab' | 'post_tests' | 'overlays'
export type PartKey = RequestPartKey | 'responses' | 'fits' | 'ranking'
export const PART_KEYS: readonly RequestPartKey[] = ['tests', 'regressions', 'matrices', 'crosstab', 'post_tests', 'overlays']
export const COMPOSE_PART_KEYS: readonly PartKey[] = ['responses', 'overlays', 'fits', 'ranking']
export const PART_TITLES: Readonly<Record<PartKey | 'data', string>> = {
  responses: 'Slots',
  fits: 'Fits',
  ranking: 'Ranking',
  data: 'Table',
  tests: 'Tests',
  regressions: 'Regressions',
  matrices: 'Matrices',
  crosstab: 'Crosstab',
  post_tests: 'Post-tests',
  overlays: 'Overlays',
}

// Top-level keys of a Pulse Response (types.Response JSON names). A
// `return` path naming anything else is refused by the engine; it is
// left alone here.
const RESPONSE_KEYS = new Set(['data', 'metadata', 'tests', 'post_tests', 'regressions', 'matrices', 'warnings', 'crosstab', 'overlays', 'components'])
const PRESETS = new Set(['full', 'standard', 'minimal'])

type Seg = { name: string; glob: boolean; each: boolean }

// ReturnTrim says what a frame's `return` block drops whole: a response
// part (`tests`, `data`, ...) or one output column of `data`.
export type ReturnTrim = { part: (key: string) => boolean; column: (name: string) => boolean }

// returnTrim reads a `return` block. null when there is none, or when it
// uses anything this reader does not recognise (an unknown preset or
// key, a malformed path, a glob on a top-level key): rows are then left
// untrimmed rather than guessed at.
export function returnTrim(ret: unknown): ReturnTrim | null {
  if (!isObject(ret)) return null
  const preset = ret.preset
  if (preset !== undefined && (typeof preset !== 'string' || !PRESETS.has(preset))) return null
  const include = paths(ret.include)
  const exclude = paths(ret.exclude)
  if (include === null || exclude === null) return null
  const base = preset !== undefined || include.length === 0
  const whole = (p: Seg[], key: string) => p.length === 1 && p[0].name === key
  const kept = (key: string) => (base || include.some((p) => p[0].name === key)) && !exclude.some((p) => whole(p, key))
  const column = (p: Seg[], name: string) => p.length === 2 && p[0].name === 'data' && p[0].each && match(p[1], name)
  return {
    part: (key) => !kept(key),
    column: (name) => {
      if (!kept('data')) return true
      if (exclude.some((p) => column(p, name))) return true
      if (base) return false
      return !include.some((p) => whole(p, 'data') || (p.length >= 2 && p[0].name === 'data' && p[0].each && match(p[1], name)))
    },
  }
}

function paths(v: unknown): Seg[][] | null {
  if (v === undefined) return []
  if (!Array.isArray(v)) return null
  const out: Seg[][] = []
  for (const p of v) {
    if (typeof p !== 'string' || p === '') return null
    const segs: Seg[] = []
    for (const s of p.split('.')) {
      const m = /^([^.[\]*]*)(\*)?(\[\*\])?$/.exec(s)
      if (!m || (m[1] === '' && !m[2])) return null
      segs.push({ name: m[1], glob: !!m[2], each: !!m[3] })
    }
    if (segs[0].glob || !RESPONSE_KEYS.has(segs[0].name)) return null
    out.push(segs)
  }
  return out
}

function match(s: Seg, name: string): boolean {
  return s.glob ? name.startsWith(s.name) : name === s.name
}

// --- headlines -------------------------------------------------------------

// partHeadline is the one-line headline of an entry's results (one per
// group / partition when it fans out): tests and post-tests their p (the
// largest when there are several, adjusted when corrected), regressions
// their R², matrices and the crosstab their shape. Undefined when there
// is nothing to say.
// total overrides the count shown when results is a capped sample.
export function partHeadline(key: PartKey, results: readonly unknown[], total?: number): string | undefined {
  const rs = results.filter(isObject)
  if (rs.length === 0) return undefined
  const n = Math.max(total ?? 0, rs.length)
  const many = n > 1 ? ` ×${n}` : ''
  switch (key) {
    case 'tests':
    case 'post_tests': {
      const ps = rs.map((r) => (typeof r.p_adjusted === 'number' ? r.p_adjusted : r.p_value)).filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
      if (ps.length === 0) return undefined
      return `p = ${fmtP(Math.max(...ps))}${many}`
    }
    case 'regressions':
    case 'fits': {
      const r = rs[0]
      const fit = [r.r2, r.adj_r2, r.pseudo_r2].find((v) => typeof v === 'number')
      return typeof fit === 'number' ? `R² ${String(Number(fit.toPrecision(2)))}` : undefined
    }
    case 'matrices': {
      const shape = shapeOf(rs[0].primary)
      return shape && shape + many
    }
    case 'crosstab':
      return shapeOf(rs[0].matrix)
    case 'responses': {
      // A slot's response: its table's row count, else its parts.
      const r = rs[0]
      if (Array.isArray(r.data)) return `${r.data.length} row${r.data.length === 1 ? '' : 's'}`
      const parts = PART_KEYS.filter((k) => r[k] !== undefined && r[k] !== null)
      return parts.length > 0 ? parts.join(', ') : undefined
    }
    case 'ranking':
      return `${rs.length} ranked`
    case 'overlays':
      return undefined
  }
}

function shapeOf(m: unknown): string | undefined {
  if (!isObject(m) || !Array.isArray(m.row_keys) || !Array.isArray(m.column_keys)) return undefined
  return `${m.row_keys.length}×${m.column_keys.length}`
}

export function fmtP(p: number): string {
  if (p < 1e-4) return '<0.0001'
  return String(Number(p.toPrecision(2)))
}

// partResults finds entry index of a part in a run's response, given
// the request frame that ran: tests and post-tests by label (else their
// block of the test-major list), regressions and matrices by name (else
// position), the crosstab when its shape put one there.
export function partResults(key: PartKey, index: number, req: unknown, resp: unknown): unknown[] {
  if (!isObject(req) || !isObject(resp)) return []
  if (key === 'crosstab') return isObject(resp.crosstab) ? [resp.crosstab] : []
  // Compose root parts: a slot's response by position, a fit's result
  // by name, the whole ranking.
  if (key === 'responses') return Array.isArray(resp.responses) && isObject(resp.responses[index]) ? [resp.responses[index]] : []
  if (key === 'ranking') return Array.isArray(resp.ranking) ? resp.ranking : []
  if (key === 'fits') {
    const fit = Array.isArray(req.fits) ? req.fits[index] : undefined
    const name = isObject(fit) ? fit.name : undefined
    return typeof name === 'string' && isObject(resp.fits) && isObject(resp.fits[name]) ? [resp.fits[name]] : []
  }
  const specs = Array.isArray(req[key]) ? req[key] : []
  const results = Array.isArray(resp[key]) ? resp[key].filter(isObject) : []
  const spec = specs[index]
  if (!isObject(spec) || specs.length === 0) return []
  const nameKey = key === 'tests' || key === 'post_tests' ? 'label' : 'name'
  const name = spec[nameKey]
  if (typeof name === 'string' && name !== '') {
    // Labels are unique per section (the engine refuses duplicates).
    const mine = results.filter((r) => r[nameKey] === name)
    if (mine.length > 0) return mine
  }
  if (results.length % specs.length !== 0) return []
  const per = results.length / specs.length
  return results.slice(index * per, (index + 1) * per)
}

// --- frame helpers -----------------------------------------------------------

// Adjuster is where an entry's multiple-comparison correction comes
// from: its own block, its request's, or (a Compose slot) the
// ComposedRequest's.
export type Adjuster = 'entry' | 'request' | 'compose'

// adjustedBy resolves whether a test or post-test entry's p-values get
// p_adjusted, and from which block (multiplicity-correction.md: each key
// falls through on its own, slot → request → ComposedRequest → engine
// default; `{"method":"none"}` is the explicit opt-out). The method is
// the first one set on the entry's block, the frame's, then compose's;
// TEST_TUKEY_HSD is already family-wise and never joins a family. The
// engine-wide default is not visible here and counts as none.
export function adjustedBy(entry: unknown, doc: Record<string, unknown>, compose?: unknown): Adjuster | undefined {
  if (isObject(entry) && entry.type === 'TEST_TUKEY_HSD') return undefined
  const levels: [Adjuster, unknown][] = [
    ['entry', isObject(entry) ? entry.multiplicity : undefined],
    ['request', doc.multiplicity],
    ['compose', compose],
  ]
  for (const [by, m] of levels) {
    const method = isObject(m) ? m.method : undefined
    if (typeof method === 'string' && method !== '') return method === 'none' ? undefined : by
  }
  return undefined
}

// crosstabLong says whether a crosstab lands its cells on `data` rows
// (shape "long") instead of the `crosstab` part.
export function crosstabLong(doc: Record<string, unknown>): boolean {
  return isObject(doc.crosstab) && doc.crosstab.shape === 'long'
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
