// Vector-input operators (k-means, AGG_VEC_*, the vector attributes and
// multivariate tests): their vector / fields ports, the second set
// (vector2 / fields2) of TEST_HOTELLING_T2, the member form, and the
// catalog drift check that keeps the static operator list honest.
import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest, ManifestOperator } from '../api.ts'
import { fromPlain, toPlain } from './jsonTree.ts'
import { emitModel, emitModelText, parseModel, type GraphModel } from './model.ts'
import { buildForm, formProblems, type FormField } from './paramForms.ts'
import { INLINE_MEMBER, isVectorInput, operatorsOf, readsMembers, SECOND_VECTOR_OPS, slotsFor, VECTOR_INPUT_OPS, vectorInputOps } from './ports.ts'
import { buildRequestGraph, type OpNode, type RequestGraph } from './requestGraph.ts'
import { checkConnection, connectWire } from './wiring.ts'
import catalogText from './testdata/catalog.slim.json?raw'
import abFields from './testdata/ab_test.fields.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema: unknown }
const manifest = catalog.manifest
const cohortFields = JSON.parse(abFields) as CohortField[]
const ctx = { manifest, cohortFields }
const graphOf = (m: GraphModel) => buildRequestGraph(toPlain(emitModel(m)), ctx)
const node = (g: RequestGraph, id: string) => g.nodes.find((n) => n.id === id) as OpNode

// The section each vector-input operator lives in.
const SECTIONS = ['groups', 'aggregations', 'attributes', 'tests'] as const
function sectionOf(op: string): string | undefined {
  return SECTIONS.find((s) => operatorsOf(manifest, s)?.some((o) => o.name === op))
}

describe('vector-input operator list', () => {
  it('names only operators the catalog has, each in a vector-input section', () => {
    for (const op of VECTOR_INPUT_OPS) expect(sectionOf(op), op).toBeDefined()
  })

  // alpha.10's manifest flags no built-in vector-input operator, so the
  // list is static. A Pulse bump that adds one with a vector-ish param
  // (a `vector` / `vector2` / `fields` param, or a param typed as a
  // vector ref) fails here until the list learns it.
  it('covers every catalog operator with a vector param', () => {
    const vectorish = (o: ManifestOperator) =>
      (o.params ?? []).some((p) => /^(vector2?|fields2?)$/.test(p.name) || /vector/i.test(String(p.type ?? '')))
    const lists = [
      ...Object.values(manifest.components ?? {}).flat(),
      ...(manifest.tests ?? []),
      ...(manifest.post_tests ?? []),
      ...(manifest.regressions ?? []),
    ] as ManifestOperator[]
    const missing = lists.filter((o) => vectorish(o) && !isVectorInput(o.name, manifest)).map((o) => o.name)
    expect(missing).toEqual([])
  })

  it('adds what the manifest declares: extension vector_input and array-valued aggregators', () => {
    expect(vectorInputOps(manifest)).toBe(VECTOR_INPUT_OPS)
    const m = {
      ...manifest,
      extensions: { aggregators: [{ name: 'acme.AGG_CENTROID', vector_input: true }, { name: 'acme.AGG_PLAIN' }] },
      crosstab: { array_valued_aggregators: ['AGG_VEC_MEAN', 'AGG_VEC_FUTURE2'] },
    } as Manifest
    expect(isVectorInput('acme.AGG_CENTROID', m)).toBe(true)
    expect(isVectorInput('acme.AGG_PLAIN', m)).toBe(false)
    expect(isVectorInput('AGG_VEC_FUTURE2', m)).toBe(true)
    expect(isVectorInput('acme.AGG_CENTROID')).toBe(false)
  })

  it('reads members from vector or fields; only TEST_HOTELLING_T2 takes a second set', () => {
    expect(readsMembers(manifest, 'matrices', 'MAT_CORRELATION')).toEqual({ second: false })
    expect(readsMembers(manifest, 'groups', 'GROUP_KMEANS')).toEqual({ second: false })
    expect(readsMembers(manifest, 'tests', 'TEST_HOTELLING_T2')).toEqual({ second: true })
    expect(readsMembers(manifest, 'tests', 'TEST_WELCH')).toBeUndefined()
    expect(readsMembers(manifest, 'post_tests', 'TEST_HOTELLING_T2')).toBeUndefined()
    expect([...SECOND_VECTOR_OPS]).toEqual(['TEST_HOTELLING_T2'])
  })

  it('declares inline fields instead of field, and keeps a test\'s split_by', () => {
    expect(slotsFor(manifest, 'groups', 'GROUP_KMEANS')).toEqual([{ key: 'fields', list: true, required: true, accept: INLINE_MEMBER }])
    expect(slotsFor(manifest, 'tests', 'TEST_MANOVA').map((s) => s.key)).toEqual(['fields', 'split_by'])
    expect(slotsFor(manifest, 'tests', 'TEST_HOTELLING_T2').map((s) => [s.key, s.required])).toEqual([
      ['fields', true],
      ['fields2', false],
    ])
  })
})

describe('vector-input ports', () => {
  const bare = (section: string, op: string) => {
    const entry = section === 'tests' ? { type: op } : { type: op, label: 'x' }
    return parseModel(JSON.stringify({ cohort: { filename: 'ab_test.pulse' }, [section]: [entry] }), 'request')
  }

  it('every vector-input operator with no members offers a vector port and a fields port', () => {
    for (const op of VECTOR_INPUT_OPS) {
      const section = sectionOf(op)!
      const n = node(graphOf(bare(section, op)), `${section}[0]`)
      const ports = n.data.rows.filter((r) => r.port).map((r) => `${r.key}:${r.port}`)
      expect(ports, op).toContain('vector:empty')
      expect(ports, op).toContain('fields[0]:append')
      expect(ports, op).not.toContain('field:empty')
      expect(ports.includes('vector2:empty'), op).toBe(SECOND_VECTOR_OPS.has(op))
    }
  })

  const REQ = `{"cohort":{"filename":"ab_test.pulse"},
    "vectors":[{"name":"pre","fields":["revenue","pages_viewed"]},{"name":"post","fields":["revenue","pages_viewed"]}],
    "groups":[{"type":"GROUP_KMEANS","vector":"pre","params":{"k":3}}],
    "aggregations":[{"type":"AGG_VEC_MEAN","fields":["revenue","q_*"],"label":"m"}],
    "tests":[{"type":"TEST_HOTELLING_T2","vector":"pre","vector2":"post"},{"type":"TEST_HOTELLING_T2","vector":"pre","vector2":"gone"},
      {"type":"TEST_HOTELLING_T2","vector":"pre"}]}`
  const model = parseModel(REQ, 'request')
  const g = graphOf(model)

  it('a vector set asks for nothing else; inline fields wire from the cohort, globs do not', () => {
    const k = node(g, 'groups[0]')
    expect(k.data.rows.filter((r) => r.port)).toEqual([])
    expect(g.edges.some((e) => e.source === 'vectors[0]' && e.target === 'groups[0]' && e.targetHandle === 'in:vector')).toBe(true)
    const agg = node(g, 'aggregations[0]')
    expect(agg.data.rows.find((r) => r.key === 'fields[0]')).toMatchObject({ ref: 'revenue', resolved: true })
    expect(agg.data.rows.find((r) => r.key === 'fields[1]')?.ref).toBeUndefined()
    expect(agg.data.rows.some((r) => r.key === 'vector')).toBe(false)
  })

  it('vector2 is a ref: wired from its vector node, unresolved when no vector has the name', () => {
    expect(g.edges.some((e) => e.source === 'vectors[1]' && e.target === 'tests[0]' && e.targetHandle === 'in:vector2')).toBe(true)
    expect(node(g, 'tests[0]').data.rows.find((r) => r.key === 'vector2')).toMatchObject({ ref: 'post', resolved: true })
    expect(node(g, 'tests[1]').data.rows.find((r) => r.key === 'vector2')).toMatchObject({ ref: 'gone', resolved: false })
    expect(node(g, 'tests[2]').data.rows.find((r) => r.key === 'vector2')).toMatchObject({ port: 'empty' })
  })

  it('the vector2 port takes only a vector node\'s out', () => {
    const wire = (source: string, sourceHandle: string) => checkConnection(g, { source, sourceHandle, target: 'tests[2]', targetHandle: 'in:vector2' }, ctx)
    expect(wire('vectors[1]', 'out')).toMatchObject({ ok: true, ref: 'post', rowKey: 'vector2' })
    const cohort = wire('cohort', 'field:revenue')
    expect(cohort.ok).toBe(false)
    if (!cohort.ok) expect(cohort.reason).toMatch(/vector2 inputs take a vector/)
    const label = wire('aggregations[0]', 'out')
    expect(label.ok).toBe(false)
    if (!label.ok) expect(label.reason).toMatch(/vector2 inputs take a vector, not aggregate m/)
    expect(emitModelText(connectWire(model, 'tests[2]', 'vector2', 'post'))).toContain('{"type":"TEST_HOTELLING_T2","vector":"pre","vector2":"post"}')
  })

  it('inline fields take integer and float columns only', () => {
    const m = parseModel('{"cohort":{"filename":"ab_test.pulse"},"groups":[{"type":"GROUP_KMEANS","params":{"k":2}}]}', 'request')
    const gg = graphOf(m)
    const wire = (f: string) => checkConnection(gg, { source: 'cohort', sourceHandle: `field:${f}`, target: 'groups[0]', targetHandle: 'in:fields[0]' }, ctx)
    expect(wire('revenue')).toMatchObject({ ok: true, rowKey: 'fields[0]' })
    const cat = wire('arm')
    expect(cat.ok).toBe(false)
    if (!cat.ok) expect(cat.reason).toMatch(/fields takes an integer or float field/)
  })
})

describe('second-set form', () => {
  const field = (id: string, key: string, m: GraphModel) =>
    buildForm(m.nodes.get(id)!, catalog, { vectorNames: ['pre', 'post'] })
      .sections.find((s) => s.title === 'Members')
      ?.fields.find((f) => f.key === key) as FormField | undefined
  const m = parseModel(
    '{"cohort":{"filename":"a.pulse"},"tests":[{"type":"TEST_HOTELLING_T2","vector":"pre"},{"type":"TEST_MANOVA","vector":"pre","split_by":"arm"}]}',
    'request',
  )

  it('gives TEST_HOTELLING_T2 a vector2 picker and fields2, at most one of them', () => {
    expect(field('tests[0]', 'vector2', m)).toMatchObject({ type: 'vectorRef', options: ['pre', 'post'], oneOf: 'members2', oneOfOptional: true })
    expect(field('tests[0]', 'fields2', m)).toMatchObject({ type: 'strings', oneOf: 'members2' })
    expect(field('tests[1]', 'vector2', m)).toBeUndefined()
    const form = buildForm(m.nodes.get('tests[0]')!, catalog, { vectorNames: ['pre', 'post'] })
    expect(formProblems(form, fromPlain({ type: 'TEST_HOTELLING_T2', vector: 'pre' }))).toEqual([])
    expect(formProblems(form, fromPlain({ type: 'TEST_HOTELLING_T2', vector: 'pre', vector2: 'post', fields2: ['a'] }))).toEqual([
      'at most one of vector2, fields2',
    ])
  })
})
