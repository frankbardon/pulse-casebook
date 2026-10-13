import { describe, expect, it } from 'vitest'
import { buildRequestGraph, type GraphNode, type OpNode, type ResultNode } from './requestGraph.ts'
import { buildComposeGraph } from './composeGraph.ts'
import { emitModelText, parseModel } from './model.ts'
import { partHeadline, partResults, returnTrim } from './responseParts.ts'
import { readRun } from './results.ts'

const cohort = { filename: 'ab_test.pulse', data_dir: '.' }

const full = {
  cohort,
  multiplicity: { method: 'holm', family: 'request' },
  groups: [{ type: 'GROUP_CATEGORY', field: 'region' }],
  aggregations: [{ type: 'AGG_COUNT', field: 'user_id', label: 'users' }],
  tests: [
    { type: 'TEST_WELCH', field: 'pages_viewed', split_by: 'arm', label: 'pages' },
    { type: 'TEST_PROP_Z', field: 'paid_converted', split_by: 'arm', params: { success: 'yes' } },
  ],
  regressions: [{ type: 'REG_OLS', name: 'fit', target: 'revenue', predictors: ['pages_viewed'] }],
  vectors: [{ name: 'v', fields: ['revenue', 'pages_viewed'] }],
  matrices: [{ type: 'MAT_CORRELATION', name: 'corr', fields: ['revenue', 'pages_viewed'] }],
  crosstab: { rows: [{ type: 'GROUP_CATEGORY', field: 'arm' }], columns: [{ type: 'GROUP_CATEGORY', field: 'device' }] },
  post_tests: [{ type: 'TEST_TUKEY_HSD', field: 'revenue', label: 'tukey' }],
  overlays: [{ kind: 'OVERLAY_SHARE', scope: 'cell', ref: { margin: { axis: 'row' } } }],
  return: { exclude: ['tests'] },
}

const result = (nodes: GraphNode[]) => nodes.find((n): n is ResultNode => n.type === 'result')!
const op = (nodes: GraphNode[], id: string) => nodes.find((n): n is OpNode => n.type === 'op' && n.id === id)!

describe('response parts', () => {
  it('lists every non-empty part in response order, one row per entry; vectors none', () => {
    const g = buildRequestGraph(full, { result: true })
    const r = result(g.nodes).data
    expect(r.table).toBe(true)
    expect(r.parts.map((p) => [p.title, p.rows.map((x) => x.label)])).toEqual([
      ['Tests', ['pages', '(TEST_PROP_Z)']],
      ['Regressions', ['fit']],
      ['Matrices', ['corr']],
      ['Crosstab', ['crosstab']],
      ['Post-tests', ['tukey']],
      ['Overlays', ['(OVERLAY_SHARE)']],
    ])
    expect(r.parts.find((p) => p.key === 'overlays')!.rows[0].detail).toBe('on crosstab cells')
    // Vectors feed other nodes and have no response part.
    expect(op(g.nodes, 'vectors[0]').data.response).toBeUndefined()
    expect(g.edges.some((e) => e.source === 'vectors[0]' && e.data?.role === 'result')).toBe(false)
  })

  it('leaves no analysis or output node without an outgoing wire but vectors', () => {
    const g = buildRequestGraph(full, { result: true })
    const out = new Set(g.edges.map((e) => e.source))
    const lonely = g.nodes.filter((n) => n.type === 'op' && ['analysis', 'output'].includes(n.data.column) && !out.has(n.id)).map((n) => n.id)
    expect(lonely).toEqual(['vectors[0]'])
  })

  it('marks fan-out: tests and matrices per group, post-tests per partition', () => {
    const g = buildRequestGraph(full, { result: true })
    const rows = result(g.nodes).data.parts.flatMap((p) => p.rows)
    const fan = (id: string) => rows.find((x) => x.id === id)!.fanout
    expect(fan('tests[0]')).toEqual({ from: 'groups[0]', noun: 'groups' })
    expect(fan('matrices[0]')).toEqual({ from: 'groups[0]', noun: 'groups' })
    // Regressions and the crosstab never run per group; one grouper does
    // not partition post-tests.
    expect(fan('regressions[0]')).toBeUndefined()
    expect(fan('crosstab')).toBeUndefined()
    expect(fan('post_tests[0]')).toBeUndefined()
    const two = { ...full, groups: [...full.groups, { type: 'GROUP_CATEGORY', field: 'device' }] }
    const g2 = buildRequestGraph(two, { result: true })
    const rows2 = result(g2.nodes).data.parts.flatMap((p) => p.rows)
    expect(rows2.find((x) => x.id === 'post_tests[0]')!.fanout).toEqual({ from: 'groups[0]', noun: 'partitions' })
    expect(rows2.find((x) => x.id === 'tests[0]')!.fanout).toEqual({ from: 'groups[1]', noun: 'groups' })
  })

  it('tags adjusted tests and wires multiplicity into their headers', () => {
    const g = buildRequestGraph(full, { result: true })
    const parts = result(g.nodes).data.parts
    expect(parts.find((p) => p.key === 'tests')!.rows.every((x) => x.adjusted)).toBe(true)
    // Tukey HSD is already family-wise.
    expect(parts.find((p) => p.key === 'post_tests')!.rows[0].adjusted).toBeUndefined()
    const m = g.edges.filter((e) => e.source === 'multiplicity')
    expect(m.map((e) => e.targetHandle)).toEqual(['sec:tests', 'sec:post_tests'])
    // No tag without the block, or with method none.
    const none = { ...full, multiplicity: { method: 'none' } }
    expect(result(buildRequestGraph(none, { result: true }).nodes).data.parts[0].rows[0].adjusted).toBeUndefined()
  })

  it('wires return into the header and strikes what it drops', () => {
    const g = buildRequestGraph(full, { result: true })
    const r = result(g.nodes).data
    expect(g.edges.find((e) => e.source === 'return')).toMatchObject({ sourceHandle: 'response', targetHandle: 'head', className: 'result-wire return-wire' })
    expect(r).toMatchObject({ ret: true, trims: true })
    const tests = r.parts.find((p) => p.key === 'tests')!
    expect(tests.trimmed).toBe(true)
    expect(tests.rows.every((x) => x.trimmed)).toBe(true)
    expect(r.parts.filter((p) => p.trimmed).map((p) => p.key)).toEqual(['tests'])
    expect(r.columns.some((c) => c.trimmed)).toBe(false)
  })

  it('is the R1 Result node for an aggregation-only request', () => {
    const g = buildRequestGraph({ cohort, aggregations: [{ type: 'AGG_COUNT', field: 'user_id', label: 'n' }] }, { result: true })
    const r = result(g.nodes)
    expect(r.id).toBe('["(result)"]')
    expect(r.data).toMatchObject({ table: true, parts: [], rowLevel: false, columns: [{ name: 'n', kind: 'aggregation', source: 'aggregations[0]' }] })
    expect(r.data.ret).toBeUndefined()
  })

  it('stays inside its compose slot; the root lane gets no Response node', () => {
    const doc = {
      requests: [{ label: 'a', ...full }],
      overlays: [{ kind: 'OVERLAY_DELTA', reference: 0, targets: [0] }],
      return: { exclude: ['overlays'] },
    }
    const c = buildComposeGraph(doc)
    expect(c.nodes.filter((n) => n.type === 'result').map((n) => n.id)).toEqual(['requests[0]["(result)"]'])
    expect(c.edges.find((e) => e.source === 'requests[0].tests[0]' && e.data?.role === 'result')?.target).toBe('requests[0]["(result)"]')
    expect(c.edges.some((e) => e.source === 'overlays[0]' && e.data?.role === 'result')).toBe(false)
  })

  it('never touches the document', () => {
    const text = JSON.stringify(full)
    const model = parseModel(text)
    buildRequestGraph(full, { result: true })
    expect(emitModelText(model)).toBe(emitModelText(parseModel(text)))
  })
})

describe('return trimming', () => {
  const trims = (ret: unknown) => {
    const t = returnTrim(ret)
    if (!t) return null
    const parts = ['data', 'tests', 'post_tests', 'regressions', 'matrices', 'crosstab', 'overlays'].filter((k) => t.part(k))
    return { parts, cols: ['region', 'users', 'avg'].filter((c) => t.column(c)) }
  }

  it('drops a part excluded whole, never one excluded in part', () => {
    expect(trims({ exclude: ['tests'] })).toEqual({ parts: ['tests'], cols: [] })
    expect(trims({ exclude: ['tests[*]', 'matrices'] })).toEqual({ parts: ['tests', 'matrices'], cols: [] })
    expect(trims({ exclude: ['tests[*].details', 'regressions[*].vcov'] })).toEqual({ parts: [], cols: [] })
    expect(trims({ precision: 4 })).toEqual({ parts: [], cols: [] })
  })

  it('treats include without a preset as an allowlist; exclude wins', () => {
    expect(trims({ include: ['data', 'tests[*].p_value'] })).toEqual({ parts: ['post_tests', 'regressions', 'matrices', 'crosstab', 'overlays'], cols: [] })
    expect(trims({ include: ['data[*].users'] })!.cols).toEqual(['region', 'avg'])
    expect(trims({ include: ['data[*].users'] })!.parts).not.toContain('data')
    expect(trims({ include: ['tests'], exclude: ['tests'] })!.parts).toContain('tests')
  })

  it('keeps every part under a preset unless excluded', () => {
    expect(trims({ preset: 'minimal' })).toEqual({ parts: [], cols: [] })
    expect(trims({ preset: 'standard', include: ['components'], exclude: ['overlays'] })).toEqual({ parts: ['overlays'], cols: [] })
  })

  it('drops data columns by path and prefix glob', () => {
    expect(trims({ exclude: ['data[*].users'] })!.cols).toEqual(['users'])
    expect(trims({ exclude: ['data[*].a*'] })!.cols).toEqual(['avg'])
    expect(trims({ exclude: ['data'] })).toEqual({ parts: ['data'], cols: ['region', 'users', 'avg'] })
  })

  it('leaves anything unrecognised untrimmed', () => {
    expect(returnTrim(undefined)).toBeNull()
    expect(returnTrim({ preset: 'tiny' })).toBeNull()
    expect(returnTrim({ exclude: ['test*'] })).toBeNull()
    expect(returnTrim({ exclude: ['nonsense'] })).toBeNull()
    expect(returnTrim({ exclude: ['tests[0]'] })).toBeNull()
    expect(returnTrim({ exclude: 'tests' })).toBeNull()
  })
})

describe('headlines', () => {
  it('reads p, R² and shapes', () => {
    expect(partHeadline('tests', [{ p_value: 0.0312 }])).toBe('p = 0.031')
    expect(partHeadline('tests', [{ p_value: 0.01, p_adjusted: 0.02 }, { p_value: 0.2 }, { p_value: 0.04 }, { p_value: 0.5 }])).toBe('p = 0.5 ×4')
    expect(partHeadline('post_tests', [{ p_value: 0.00001 }])).toBe('p = <0.0001')
    expect(partHeadline('regressions', [{ r2: 0.4123 }])).toBe('R² 0.41')
    expect(partHeadline('regressions', [{ pseudo_r2: 0.1 }])).toBe('R² 0.1')
    const m = { row_keys: ['a', 'b', 'c', 'd', 'e'], column_keys: ['a', 'b', 'c', 'd', 'e'] }
    expect(partHeadline('matrices', [{ primary: m }])).toBe('5×5')
    expect(partHeadline('matrices', [{ primary: m }, { primary: m }])).toBe('5×5 ×2')
    expect(partHeadline('crosstab', [{ matrix: { row_keys: [1, 2, 3], column_keys: [1, 2, 3, 4] } }])).toBe('3×4')
    expect(partHeadline('tests', [])).toBeUndefined()
    expect(partHeadline('overlays', [{ name: 'x' }])).toBeUndefined()
  })

  it('finds an entry in a run response: by label, else its test-major block', () => {
    const req = { tests: [{ label: 'a' }, {}], regressions: [{ name: 'fit' }] }
    const resp = {
      tests: [
        { label: 'a', group_key: ['x'], p_value: 0.1 },
        { label: 'a', group_key: ['y'], p_value: 0.2 },
        { group_key: ['x'], p_value: 0.3 },
        { group_key: ['y'], p_value: 0.4 },
      ],
      regressions: [{ name: 'fit', r2: 0.5 }],
      crosstab: { matrix: { row_keys: [1], column_keys: [1, 2] } },
    }
    expect(partResults('tests', 0, req, resp)).toHaveLength(2)
    expect(partHeadline('tests', partResults('tests', 1, req, resp))).toBe('p = 0.4 ×2')
    expect(partHeadline('regressions', partResults('regressions', 0, req, resp))).toBe('R² 0.5')
    expect(partHeadline('crosstab', partResults('crosstab', 0, req, resp))).toBe('1×2')
    expect(partResults('matrices', 0, req, resp)).toEqual([])
  })

  it('keeps each run response by its request frame', () => {
    const doc = { requests: [{ label: 'a', tests: [{ label: 't' }] }] }
    const env = JSON.stringify({ data: { responses: [{ tests: [{ label: 't', p_value: 0.03 }] }] } })
    const view = readRun('compose', env, doc)
    const ran = view.responses.get('requests[0]')!
    expect(partHeadline('tests', partResults('tests', 0, ran.request, ran.response))).toBe('p = 0.03')
  })
})
