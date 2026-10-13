import { describe, expect, it } from 'vitest'
import { buildRequestGraph, type GraphNode, type OpNode, type ResultNode } from './requestGraph.ts'
import { buildComposeGraph } from './composeGraph.ts'
import { buildChainGraph } from './chainGraph.ts'
import { emitModelText, parseModel } from './model.ts'
import { frameOf } from './nodePath.ts'
import { deletable } from './wiring.ts'
import { fanoutTargets, isResultId, RESULT_KEY, resultColumns, resultId } from './resultGraph.ts'
import { COLUMN_UNUSED, unusedColumnIssues } from './validation.ts'

const cohort = { filename: 'ab_test.pulse', data_dir: '.' }

const grouped = {
  cohort,
  attributes: [
    { type: 'ATTR_FORMULA', field: 'device', label: 'mobile', expression: 'device == "mobile" ? 1 : 0' },
    { type: 'ATTR_FORMULA', field: 'pages_viewed', label: 'pages_x2', expression: 'pages_viewed * 2' },
  ],
  groups: [{ type: 'GROUP_CATEGORY', field: 'region' }],
  aggregations: [
    { type: 'AGG_COUNT', field: 'user_id', label: 'users' },
    { type: 'AGG_AVERAGE', field: 'pages_x2', label: 'avg_pages' },
    { type: 'AGG_SUM', field: 'revenue' },
  ],
  windows: [{ type: 'WIN_RANK', field: 'users', label: 'rank' }],
  tests: [{ type: 'TEST_WELCH', field: 'pages_viewed', split_by: 'arm', label: 'pages' }],
  regressions: [{ type: 'REG_OLS', name: 'fit', target: 'revenue', predictors: ['pages_viewed'] }],
  matrices: [{ type: 'MAT_CORRELATION', name: 'corr', fields: ['revenue', 'pages_viewed'] }],
  post_tests: [{ type: 'TEST_TUKEY_HSD', field: 'revenue', label: 'tukey' }],
}

const ops = (nodes: GraphNode[]) => nodes.filter((n): n is OpNode => n.type === 'op')
const result = (nodes: GraphNode[]) => nodes.find((n): n is ResultNode => n.type === 'result')

describe('result columns', () => {
  it('lists group keys, then aggregation labels, then window labels', () => {
    const g = buildRequestGraph(grouped, { result: true })
    expect(resultColumns(grouped, ops(g.nodes))).toEqual([
      { name: 'region', kind: 'key', source: 'groups[0]' },
      { name: 'users', kind: 'aggregation', source: 'aggregations[0]' },
      { name: 'avg_pages', kind: 'aggregation', source: 'aggregations[1]' },
      { name: '(AGG_SUM)', kind: 'aggregation' },
      { name: 'rank', kind: 'window', source: 'windows[0]' },
    ])
  })

  it('names a vector grouper key column the way pulse does', () => {
    const doc = { cohort, groups: [{ type: 'GROUP_KMEANS', vector: 'drivers' }, { type: 'GROUP_CATEGORY', field: 'arm' }] }
    const g = buildRequestGraph(doc, { result: true })
    expect(result(g.nodes)!.data.columns.map((c) => c.name)).toEqual(['GROUP_KMEANS_drivers', 'arm'])
  })

  it('wires each column from its source into the Result node', () => {
    const g = buildRequestGraph(grouped, { result: true })
    const r = result(g.nodes)!
    expect(r.id).toBe(`["${RESULT_KEY}"]`)
    expect(r.data.column).toBe('result')
    expect(r.data.rowLevel).toBe(false)
    // The window's probe holds the whole table (no sort).
    expect(r.data.previewFrom).toBe('windows[0]')
    const wires = g.edges.filter((e) => e.target === r.id)
    expect(wires.map((e) => [e.source, e.sourceHandle, e.targetHandle, e.data?.role])).toEqual([
      ['groups[0]', 'key', 'col:region', 'result'],
      ['aggregations[0]', 'out', 'col:users', 'result'],
      ['aggregations[1]', 'out', 'col:avg_pages', 'result'],
      ['windows[0]', 'out', 'col:rank', 'result'],
    ])
    for (const e of wires) expect(e.deletable).toBe(false)
    // The Result node sits right of everything.
    expect(g.columns.at(-1)?.key).toBe('result')
    expect(r.position.x).toBe(Math.max(...g.nodes.map((n) => n.position.x)))
  })

  it('says row-level output without groups or aggregations', () => {
    const g = buildRequestGraph({ cohort, tests: grouped.tests }, { result: true })
    expect(result(g.nodes)!.data).toMatchObject({ rowLevel: true, columns: [] })
    expect(result(g.nodes)!.data.previewFrom).toBeUndefined()
  })

  it('is left out unless asked for', () => {
    expect(result(buildRequestGraph(grouped).nodes)).toBeUndefined()
  })

  it('has an id that frames like its siblings and names no request JSON', () => {
    expect(resultId(['requests', 1])).toBe('requests[1]["(result)"]')
    expect(isResultId('requests[1]["(result)"]')).toBe(true)
    expect(isResultId('requests[1].tests[0]')).toBe(false)
    expect(frameOf(resultId(['stages', 0, 'request']))).toBe('stages[0].request')
    const text = JSON.stringify(grouped)
    const model = parseModel(text)
    expect(deletable(model, resultId([]))).toBe(false)
    // Deriving the view never touches the document.
    buildRequestGraph(grouped, { result: true })
    expect(emitModelText(model)).toBe(emitModelText(parseModel(text)))
  })
})

describe('group fan-out', () => {
  it('reaches every entry that runs per group, and nothing else', () => {
    const g = buildRequestGraph(grouped, { result: true })
    const targets = fanoutTargets(grouped, ops(g.nodes)).map((n) => n.id)
    // One grouper: post-tests partition nothing, regressions, windows and
    // vectors never run per group.
    expect(targets).toEqual(['aggregations[0]', 'aggregations[1]', 'aggregations[2]', 'tests[0]', 'matrices[0]'])
    const scope = g.edges.filter((e) => e.data?.role === 'scope')
    expect(scope.map((e) => e.target)).toEqual(targets)
    for (const e of scope) {
      expect(e).toMatchObject({ source: 'groups[0]', sourceHandle: 'scope', targetHandle: 'scope:in', selectable: false, deletable: false })
      expect(e.data?.ref).toBe('region')
    }
    // One wire per group carries the label.
    expect(scope.filter((e) => e.data?.lead)).toHaveLength(1)
    expect(ops(g.nodes).filter((n) => n.data.perGroup).map((n) => n.id)).toEqual(targets)
    expect(ops(g.nodes).find((n) => n.id === 'groups[0]')?.data.keyColumn).toBe('region')
  })

  it('adds post-tests with two or more groupers unless partition_by is []', () => {
    const two = { ...grouped, groups: [...grouped.groups, { type: 'GROUP_CATEGORY', field: 'arm' }] }
    const g = buildRequestGraph(two)
    expect(fanoutTargets(two, ops(g.nodes)).map((n) => n.id)).toContain('post_tests[0]')
    expect(g.edges.filter((e) => e.data?.role === 'scope')).toHaveLength(2 * 6)
    const flat = { ...two, post_tests: [{ ...grouped.post_tests[0], params: { partition_by: [] } }] }
    expect(fanoutTargets(flat, ops(buildRequestGraph(flat).nodes)).map((n) => n.id)).not.toContain('post_tests[0]')
  })

  it('draws nothing without groups', () => {
    const flat = Object.fromEntries(Object.entries(grouped).filter(([k]) => k !== 'groups'))
    const g = buildRequestGraph(flat, { result: true })
    expect(g.edges.filter((e) => e.data?.role === 'scope')).toHaveLength(0)
    expect(result(g.nodes)!.data.columns.some((c) => c.kind === 'key')).toBe(false)
  })
})

describe('attribute output columns', () => {
  it('marks a column nothing reads and warns about it', () => {
    const g = buildRequestGraph(grouped)
    const attr = (id: string) => ops(g.nodes).find((n) => n.id === id)!.data.output
    // mobile is read by nothing; pages_x2 feeds an aggregation.
    expect(attr('attributes[0]')).toEqual({ used: false })
    expect(attr('attributes[1]')).toEqual({ used: true })
    const issues = unusedColumnIssues(g.nodes)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ path: 'attributes[0]', severity: 'warning', code: COLUMN_UNUSED, source: 'client' })
    expect(issues[0].message).toContain('computed, but nothing uses this column')
  })

  it('clears the warning once a group reads the column', () => {
    const doc = { ...grouped, groups: [{ type: 'GROUP_CATEGORY', field: 'mobile' }] }
    const g = buildRequestGraph(doc, { result: true })
    expect(unusedColumnIssues(g.nodes)).toHaveLength(0)
    expect(result(g.nodes)!.data.columns[0]).toMatchObject({ name: 'mobile', kind: 'key' })
  })

  it('counts a later expression naming the label as a use', () => {
    const doc = {
      cohort,
      attributes: [
        { type: 'ATTR_FORMULA', field: 'device', label: 'mobile', expression: 'device == "mobile" ? 1 : 0' },
        { type: 'ATTR_FORMULA', field: 'arm', label: 'both', expression: 'mobile * (arm == "new_page" ? 1 : 0)' },
      ],
      aggregations: [{ type: 'AGG_SUM', field: 'both', label: 'n_both' }],
    }
    const g = buildRequestGraph(doc)
    expect(unusedColumnIssues(g.nodes)).toEqual([])
    // A substring is not a use.
    const near = { ...doc, attributes: [doc.attributes[0], { ...doc.attributes[1], expression: 'is_mobile_user' }] }
    expect(unusedColumnIssues(buildRequestGraph(near).nodes).map((i) => i.path)).toEqual(['attributes[0]'])
  })
})

describe('lanes', () => {
  it('gives every compose slot a Result node, never a fit or the root', () => {
    const doc = {
      requests: [
        { label: 'a', ...grouped },
        { label: 'b', cohort, aggregations: [{ type: 'AGG_COUNT', field: 'user_id', label: 'n' }] },
      ],
      fits: [{ name: 'f', request: { cohort, regressions: grouped.regressions } }],
      multiplicity: { method: 'holm' },
    }
    const c = buildComposeGraph(doc)
    const results = c.nodes.filter((n) => n.type === 'result')
    expect(results.map((n) => [n.id, n.parentId])).toEqual([
      ['requests[0]["(result)"]', 'requests[0]'],
      ['requests[1]["(result)"]', 'requests[1]'],
    ])
    // Fan-out stays inside its slot.
    expect(c.edges.filter((e) => e.data?.role === 'scope').every((e) => frameOf(e.target) === 'requests[0]')).toBe(true)
  })

  it('gives every chain stage a Result node and keeps the stage wires', () => {
    const doc = {
      cohort,
      stages: [
        { name: 's0', request: { groups: [{ type: 'GROUP_CATEGORY', field: 'region' }], aggregations: [{ type: 'AGG_SUM', field: 'revenue', label: 'rev' }] } },
        { name: 's1', request: { groups: [{ type: 'GROUP_RANGE', field: 'rev' }], aggregations: [{ type: 'AGG_COUNT', field: 'region', label: 'n' }] } },
      ],
    }
    const c = buildChainGraph(doc)
    expect(c.nodes.filter((n) => n.type === 'result').map((n) => n.id)).toEqual(['stages[0].request["(result)"]', 'stages[1].request["(result)"]'])
    expect(c.edges.some((e) => e.data?.role === 'stage' && e.source === 'stages[0].request.aggregations[0]')).toBe(true)
  })
})
