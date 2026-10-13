import { fmtCount, fmtNum } from './previews.ts'
import { formatPath, type PathSegment } from './nodePath.ts'
import { FACET_NODE } from './facetGraph.ts'

// A full run's envelope, read for display: the result tables of the
// bottom panel and the headline numbers shown on terminal nodes. The
// envelope is parsed with JSON.parse — this is a read-only rendering;
// the bytes saved to out/ are the server's, never re-encoded here.

export type EnvelopeEntry = { code: string; message: string; details?: unknown }

export type Envelope = {
  format_version?: string
  data?: unknown
  errors?: EnvelopeEntry[]
  warnings?: EnvelopeEntry[]
}

export type Cell = string
export type ResultTable = { key: string; title: string; columns: string[]; rows: Cell[][]; note?: string }

// ResultSection is one response: the whole request, one compose slot, one
// chain stage, or the facet.
export type ResultSection = {
  id: string
  title: string
  summary?: string
  tables: ResultTable[]
  // Parts the panel shows as JSON (matrices, crosstab, overlays, …).
  other: { title: string; json: string }[]
}

export type RunHeadline = { text: string; tone?: 'sig' | 'ns' }

export type RunView = {
  sections: ResultSection[]
  errors: EnvelopeEntry[]
  warnings: EnvelopeEntry[]
  // Node id → its headline number.
  headlines: Map<string, RunHeadline>
  // Request frame id ("", `requests[1]`, `stages[0].request`) → its
  // response and the request frame that ran.
  responses: Map<string, RunResponse>
}

export type RunResponse = { request: unknown; response: unknown }

// Data rows shown per aggregation table; the raw tab has everything.
export const MAX_ROWS = 200

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// readRun builds the panel model from the envelope text and the request
// document that was run (plain JSON, read-only: labels and names map
// result entries back to node ids).
export function readRun(root: string, text: string, doc: unknown): RunView {
  const env = JSON.parse(text) as Envelope
  const view: RunView = { sections: [], errors: arr(env.errors) as EnvelopeEntry[], warnings: arr(env.warnings) as EnvelopeEntry[], headlines: new Map(), responses: new Map() }
  const data = env.data
  const d = isObj(doc) ? doc : {}
  if (!isObj(data)) return view
  if (root === 'compose') {
    const reqs = arr(d.requests)
    arr(data.responses).forEach((resp, i) => {
      const r = reqs[i]
      const label = isObj(r) && typeof r.label === 'string' ? r.label : `slot ${i + 1}`
      const base: PathSegment[] = ['requests', i]
      view.sections.push(responseSection(formatPath(base), label, resp))
      responseHeadlines(view.headlines, base, r, resp)
      view.responses.set(formatPath(base), { request: r, response: resp })
    })
    const other = otherParts(data, ['overlays', 'ranking', 'returned'])
    if (other.length > 0) view.sections.push({ id: 'compose', title: 'compose', tables: [], other })
  } else if (root === 'chain') {
    const stages = arr(d.stages)
    arr(data.stages).forEach((resp, i) => {
      const st = stages[i]
      const name = isObj(st) && typeof st.name === 'string' ? st.name : `stage ${i + 1}`
      const base: PathSegment[] = ['stages', i, 'request']
      view.sections.push(responseSection(`stages[${i}]`, name, resp))
      responseHeadlines(view.headlines, base, isObj(st) ? st.request : undefined, resp)
      view.responses.set(formatPath(base), { request: isObj(st) ? st.request : undefined, response: resp })
    })
    const other = otherParts(data, ['overlays'])
    if (other.length > 0) view.sections.push({ id: 'chain', title: 'chain', tables: [], other })
  } else if (root === 'facet') {
    view.sections.push(facetSection(data))
    const n = Object.keys(isObj(data.fields) ? data.fields : {}).length
    view.headlines.set(FACET_NODE, { text: `${n} field${n === 1 ? '' : 's'} · ${fmtCount(num(data.filtered_records))} rows` })
  } else {
    view.sections.push(responseSection('', 'request', data))
    responseHeadlines(view.headlines, [], d, data)
    view.responses.set('', { request: d, response: data })
  }
  return view
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

// cell renders one value: numbers through fmtNum, objects as compact JSON.
export function cell(v: unknown): Cell {
  if (v === undefined) return ''
  if (v === null) return '–'
  if (typeof v === 'number') return fmtNum(v)
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return JSON.stringify(v)
}

function responseSection(id: string, title: string, resp: unknown): ResultSection {
  const sec: ResultSection = { id, title, tables: [], other: [] }
  if (!isObj(resp)) return sec
  const md = isObj(resp.metadata) ? resp.metadata : {}
  if (md.total_rows !== undefined || md.filtered_rows !== undefined) {
    sec.summary = `${fmtCount(num(md.filtered_rows))} of ${fmtCount(num(md.total_rows))} rows`
  }
  const rows = arr(resp.data).filter(isObj)
  if (rows.length > 0) {
    const columns: string[] = []
    for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k)
    sec.tables.push({
      key: 'data',
      title: 'Aggregations',
      columns,
      rows: rows.slice(0, MAX_ROWS).map((r) => columns.map((c) => cell(r[c]))),
      ...(rows.length > MAX_ROWS && { note: `showing ${MAX_ROWS} of ${fmtCount(rows.length)} rows (all rows in the raw envelope)` }),
    })
  }
  const tests = [...arr(resp.tests), ...arr(resp.post_tests)].filter(isObj)
  if (tests.length > 0) {
    const hasGroup = tests.some((t) => t.group_key !== undefined)
    const hasAdj = tests.some((t) => t.p_adjusted !== undefined)
    const columns = ['label', 'type', ...(hasGroup ? ['group'] : []), 'statistic', 'df', 'p_value', ...(hasAdj ? ['p_adjusted'] : []), 'alpha', 'significant']
    sec.tables.push({
      key: 'tests',
      title: 'Tests',
      columns,
      rows: tests.map((t) => [
        cell(t.label),
        cell(t.variant !== undefined ? `${String(t.type)} (${String(t.variant)})` : t.type),
        ...(hasGroup ? [cell(t.group_key)] : []),
        cell(t.statistic),
        cell(t.df),
        cell(t.p_value),
        ...(hasAdj ? [cell(t.p_adjusted)] : []),
        cell(t.alpha),
        cell(significant(t)),
      ]),
    })
  }
  const regs = arr(resp.regressions).filter(isObj)
  if (regs.length > 0) {
    const stats = ['n_obs', 'r2', 'adj_r2', 'pseudo_r2', 'deviance', 'residual_std_err'].filter((k) => regs.some((r) => r[k] !== undefined))
    sec.tables.push({
      key: 'regressions',
      title: 'Regressions',
      columns: ['name', 'type', ...stats],
      rows: regs.map((r) => [cell(r.name), cell(r.type), ...stats.map((k) => cell(r[k]))]),
    })
    regs.forEach((r, i) => {
      const coef = isObj(r.coefficients) ? r.coefficients : {}
      const col = (k: string) => (isObj(r[k]) ? (r[k] as Obj) : {})
      const cols = ['std_errors', 'p_values', 'ci_lower', 'ci_upper'].filter((k) => isObj(r[k]))
      sec.tables.push({
        key: `regression-${i}`,
        title: `${cell(r.name) || `regression ${i + 1}`} coefficients`,
        columns: ['term', 'coefficient', ...cols.map((k) => k.replace(/s$/, ''))],
        rows: Object.keys(coef).map((term) => [term, cell(coef[term]), ...cols.map((k) => cell(col(k)[term]))]),
      })
    })
  }
  sec.other = otherParts(resp, ['matrices', 'crosstab', 'overlays', 'warnings'])
  return sec
}

function otherParts(o: Obj, keys: string[]): { title: string; json: string }[] {
  return keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => ({ title: k, json: JSON.stringify(o[k], null, 2) }))
}

function significant(t: Obj): boolean | undefined {
  if (typeof t.significant_adjusted === 'boolean') return t.significant_adjusted
  if (typeof t.reject_null === 'boolean') return t.reject_null
  return undefined
}

function facetSection(data: Obj): ResultSection {
  const fields = isObj(data.fields) ? data.fields : {}
  const rows: Cell[][] = Object.entries(fields).map(([name, f]) => {
    const o = isObj(f) ? f : {}
    const disc = isObj(o.discrete) ? o.discrete : undefined
    const numr = isObj(o.numeric) ? o.numeric : undefined
    let summary = ''
    if (disc) {
      summary = arr(disc.values)
        .filter(isObj)
        .slice(0, 5)
        .map((v) => `${cell(v.value)} ${fmtCount(num(v.count))}`)
        .join(', ')
    } else if (numr) {
      summary = ['min', 'max', 'mean', 'stddev']
        .filter((k) => numr[k] !== undefined)
        .map((k) => `${k} ${cell(numr[k])}`)
        .join(', ')
    }
    return [name, cell(o.type_name), cell(o.kind), cell(o.null_count), disc ? cell(disc.distinct_count) : '', summary]
  })
  return {
    id: 'fields',
    title: 'facet',
    summary: `${fmtCount(num(data.filtered_records))} of ${fmtCount(num(data.total_records))} rows`,
    tables: [{ key: 'fields', title: 'Fields', columns: ['field', 'type', 'kind', 'nulls', 'distinct', 'summary'], rows }],
    other: otherParts(data, ['additive', 'overlays', 'warnings']),
  }
}

// responseHeadlines maps a response's results onto the run request's
// terminal nodes under base: tests and post_tests by label (else
// position), regressions by name (else position), and single-row
// aggregations by label.
function responseHeadlines(out: Map<string, RunHeadline>, base: PathSegment[], req: unknown, resp: unknown) {
  if (!isObj(req) || !isObj(resp)) return
  for (const section of ['tests', 'post_tests'] as const) {
    const specs = arr(req[section])
    const results = arr(resp[section]).filter(isObj)
    specs.forEach((spec, i) => {
      const label = isObj(spec) && typeof spec.label === 'string' ? spec.label : undefined
      const mine = label !== undefined ? results.filter((r) => r.label === label) : results.length === specs.length ? [results[i]] : []
      const h = testHeadline(mine)
      if (h) out.set(formatPath([...base, section, i]), h)
    })
  }
  const regSpecs = arr(req.regressions)
  const regs = arr(resp.regressions).filter(isObj)
  regSpecs.forEach((spec, i) => {
    const name = isObj(spec) ? (typeof spec.name === 'string' ? spec.name : typeof spec.label === 'string' ? spec.label : undefined) : undefined
    const r = name !== undefined ? regs.find((x) => x.name === name) : regs.length === regSpecs.length ? regs[i] : undefined
    if (!r) return
    const fit = r.r2 ?? r.adj_r2 ?? r.pseudo_r2
    const text = typeof fit === 'number' ? `R² ${fmtNum(fit, 3)}` : typeof r.n_obs === 'number' ? `n ${fmtCount(r.n_obs)}` : 'fitted'
    out.set(formatPath([...base, 'regressions', i]), { text })
  })
  const rows = arr(resp.data).filter(isObj)
  arr(req.aggregations).forEach((spec, i) => {
    const label = isObj(spec) && typeof spec.label === 'string' ? spec.label : undefined
    if (label === undefined) return
    if (rows.length === 1 && label in rows[0]) out.set(formatPath([...base, 'aggregations', i]), { text: cell(rows[0][label]) })
    else if (rows.length > 1) out.set(formatPath([...base, 'aggregations', i]), { text: `${fmtCount(rows.length)} rows` })
  })
}

function testHeadline(results: Obj[]): RunHeadline | undefined {
  if (results.length === 0) return undefined
  if (results.length === 1) {
    const t = results[0]
    const p = t.p_adjusted ?? t.p_value
    const sig = significant(t)
    return { text: `p${t.p_adjusted !== undefined ? 'adj' : ''} ${fmtP(p)}`, ...(sig !== undefined && { tone: sig ? 'sig' : 'ns' }) }
  }
  const k = results.filter((t) => significant(t) === true).length
  return { text: `${k}/${results.length} groups sig`, tone: k > 0 ? 'sig' : 'ns' }
}

function fmtP(p: unknown): string {
  if (typeof p !== 'number') return '–'
  if (p < 1e-4) return '<0.0001'
  return String(Number(p.toPrecision(2)))
}
