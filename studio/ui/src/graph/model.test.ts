import { describe, expect, it } from 'vitest'
import { fromPlain, parseJson, stringifyJson, toPlain } from './jsonTree.ts'
import { buildModel, emitModel, emitModelText, parseModel, type Body, type GraphModel, type RootKind } from './model.ts'
import { formatPath, getAtPath, parsePath } from './nodePath.ts'
import { buildRequestGraph } from './requestGraph.ts'
import sweepFixture from './testdata/sweep_templated.compose.json?raw'

// Every showcase request file, as text.
const corpus = Object.entries(
  import.meta.glob('../../../../showcase/*/req/*.json', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >,
).map(([path, text]) => [path.replace(/^(\.\.\/)+/, ''), text] as const)

// minify drops insignificant whitespace without parsing, as an oracle
// independent of jsonTree.
function minify(text: string): string {
  return text.replace(/("(?:[^"\\]|\\.)*")|\s+/g, (_, s: string | undefined) => s ?? '')
}

function nodeIds(m: GraphModel) {
  return [...m.nodes.values()].map((n) => `${n.kind}:${n.id}`)
}

// requestFrames yields every Request-shaped frame in the outline.
function* requestFrames(body: Body): Generator<Extract<Body, { as: 'frame' }>> {
  if (body.as === 'frame') {
    if (body.role === 'request') yield body
    for (const m of body.members) yield* requestFrames(m.body)
  } else if (body.as === 'list') {
    for (const item of body.items) yield* requestFrames(item)
  }
}

describe('graph model round-trip over the showcase corpus', () => {
  it('covers every root kind', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(75)
    const kinds = new Set(corpus.map(([, text]) => parseModel(text).kind))
    expect([...kinds].sort()).toEqual<RootKind[]>(['chain', 'compose', 'facet', 'request'])
  })

  it.each(corpus)('%s emits its input exactly', (_, text) => {
    const model = parseModel(text)
    const out = emitModelText(model)
    expect(out).toBe(minify(text))
    // Deep-equal including key order, as JS sees it.
    expect(JSON.stringify(toPlain(parseJson(out)))).toBe(JSON.stringify(JSON.parse(text)))
  })

  it.each(corpus)('%s keeps JSON-path node ids stable', (_, text) => {
    const model = parseModel(text)
    const doc = JSON.parse(text)
    for (const node of model.nodes.values()) {
      expect(formatPath(parsePath(node.id))).toBe(node.id)
      expect(getAtPath(doc, node.id)).toEqual(toPlain(node.value))
    }
    // Same ids and kinds after a round-trip.
    expect(nodeIds(parseModel(emitModelText(model)))).toEqual(nodeIds(model))
    // The canvas uses the same ids: every graph node of every Request
    // frame is a model node (the canvas always draws a cohort, even when
    // the file has none).
    for (const frame of requestFrames(model.root)) {
      const base = frame.id === '' ? [] : parsePath(frame.id)
      const g = buildRequestGraph(getAtPath(doc, frame.id) ?? doc, { basePath: base })
      const cohortId = formatPath([...base, 'cohort'])
      for (const n of g.nodes) if (n.id !== cohortId) expect(model.nodes.has(n.id), n.id).toBe(true)
    }
  })
})

describe('graph model roots', () => {
  it('models a compose file with fits, sweep and templating', () => {
    const model = parseModel(sweepFixture)
    expect(model.kind).toBe('compose')
    expect(emitModelText(model)).toBe(minify(sweepFixture))
    const kinds = Object.fromEntries([...model.nodes.values()].map((n) => [n.id, n.reason ? `${n.kind}/${n.reason}` : n.kind]))
    expect(kinds).toEqual({
      'requests[0].label': 'raw/unmodeled',
      'requests[0].cohort': 'cohort',
      'requests[0].windows[0]': 'raw/templated',
      'requests[0].aggregations[0]': 'entry',
      'requests[0].tests': 'raw/shape',
      'fits[0].name': 'prop',
      'fits[0].request.cohort': 'cohort',
      'fits[0].request.regressions[0]': 'entry',
      'fits[0].save': 'prop',
      sweep: 'raw/unmodeled',
      multiplicity: 'entry',
      x_future: 'raw/unmodeled',
    })
    // Number and string spellings survive verbatim.
    const sweep = stringifyJson(model.nodes.get('sweep')!.value)
    expect(sweep).toContain('"values":[0.10,0.050,1e-2]')
    expect(sweep).toContain('{"$var":"alpha"}')
    expect(stringifyJson(model.nodes.get('x_future')!.value)).toBe('{"big":12345678901234567890,"n":1.50}')
    // The repeated key is carried after the first, unaddressed.
    expect(emitModelText(model).endsWith(',"x_future":{"big":12345678901234567890,"n":1.50},"x_future":[1,2]}')).toBe(true)
  })

  it('models chain stages as request frames', () => {
    const model = buildModel(
      fromPlain({
        cohort: { filename: 'c.pulse' },
        stages: [
          { name: 's0', request: { filterers: [{ type: 'FILTER_INCLUDE', field: 'x', values: ['a'] }] } },
          { request: { aggregations: [{ type: 'AGG_COUNT', label: 'n' }] }, extra: 1 },
        ],
        overlays: [{ kind: 'OVERLAY_INDEX_VS_STAGE' }],
      }),
    )
    expect(model.kind).toBe('chain')
    expect(nodeIds(model)).toEqual([
      'cohort:cohort',
      'prop:stages[0].name',
      'entry:stages[0].request.filterers[0]',
      'entry:stages[1].request.aggregations[0]',
      'raw:stages[1].extra',
      'entry:overlays[0]',
    ])
  })

  it('models facet params as props and filters as entries', () => {
    const model = buildModel(
      fromPlain({ cohort: { filename: 'c.pulse' }, fields: ['a'], filterers: [{ type: 'FILTER_INCLUDE' }], numeric_percentiles: [0.5], labels: [] }),
    )
    expect(model.kind).toBe('facet')
    expect(nodeIds(model)).toEqual(['cohort:cohort', 'prop:fields', 'entry:filterers[0]', 'prop:numeric_percentiles', 'raw:labels'])
  })

  it('emits node value edits in place', () => {
    const model = parseModel('{"cohort":{"filename":"c.pulse"},"tests":[{"type":"TEST_WELCH","field":"x"},{"type":"TEST_PROP_Z"}],"z":1}')
    model.nodes.get('tests[1]')!.value = fromPlain({ type: 'TEST_PROP_Z', field: 'y' })
    expect(stringifyJson(emitModel(model))).toBe(
      '{"cohort":{"filename":"c.pulse"},"tests":[{"type":"TEST_WELCH","field":"x"},{"type":"TEST_PROP_Z","field":"y"}],"z":1}',
    )
  })
})
