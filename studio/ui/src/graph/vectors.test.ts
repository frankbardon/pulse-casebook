// First-class vectors: palette block, ports, wiring, inspector form,
// client validation, rename behaviour and the preview summary.
import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest, PreviewProbe } from '../api.ts'
import { fromPlain, toPlain } from './jsonTree.ts'
import { setIn } from './jsonEdit.ts'
import { emitModel, emitModelText, parseModel, updateNode, type GraphModel } from './model.ts'
import { applyField, buildForm, formProblems } from './paramForms.ts'
import { BLOCK_ITEMS, paletteItems, placeNode } from './palette.ts'
import { slotsFor, vectorMemberRefusal, VECTOR_MEMBER } from './ports.ts'
import { vectorSummary } from './previews.ts'
import { buildRequestGraph, hasPreview, type OpNode } from './requestGraph.ts'
import { clientIssues } from './validation.ts'
import { checkConnection, connectWire } from './wiring.ts'
import catalogText from './testdata/catalog.slim.json?raw'
import abFields from './testdata/ab_test.fields.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema: unknown }
const manifest = catalog.manifest
const cohortFields: CohortField[] = [...(JSON.parse(abFields) as CohortField[]), { name: 'opted_in', type: 'packed_bool' }]
const ctx = { manifest, cohortFields }
const graphOf = (m: GraphModel) => buildRequestGraph(toPlain(emitModel(m)), ctx)
const op = (m: GraphModel, id: string) => graphOf(m).nodes.find((n) => n.id === id) as OpNode
const vectorItem = paletteItems(manifest).find((i) => i.section === 'vectors')!
const base = parseModel('{"cohort":{"filename":"ab_test.pulse"}}', 'request')

describe('vector palette block', () => {
  it('is a fixed block item in the analysis column', () => {
    expect(BLOCK_ITEMS).toContainEqual(vectorItem)
    expect(vectorItem).toMatchObject({ section: 'vectors', column: 'analysis', kind: 'Vector' })
  })

  it('places {name: <unique>, fields: []} and numbers later ones', () => {
    const a = placeNode(base, vectorItem, ctx)
    expect(a.id).toBe('vectors[0]')
    expect(emitModelText(a.model)).toContain('"vectors":[{"name":"vector","fields":[]}]')
    const b = placeNode(a.model, vectorItem, ctx)
    expect(b.id).toBe('vectors[1]')
    expect(emitModelText(b.model)).toContain('{"name":"vector_2","fields":[]}')
  })

  it('places into a compose slot', () => {
    const c = parseModel('{"requests":[{"label":"a","cohort":{"filename":"x.pulse"}}]}', 'compose')
    const r = placeNode(c, vectorItem, { ...ctx, base: ['requests', 0] })
    expect(r.id).toBe('requests[0].vectors[0]')
  })
})

describe('vector ports and wiring', () => {
  const placed = placeNode(base, vectorItem, ctx)
  const id = placed.id

  it('declares a list fields slot of integer and float types', () => {
    expect(slotsFor(manifest, 'vectors', 'VECTOR')).toEqual([{ key: 'fields', list: true, required: true, accept: VECTOR_MEMBER }])
  })

  it('gives an empty vector an append port', () => {
    const n = op(placed.model, id)
    expect(n.data.rows).toContainEqual(expect.objectContaining({ key: 'fields[0]', port: 'append' }))
    expect(hasPreview(n)).toBe(true)
  })

  it('accepts numeric fields and appends them on drop', () => {
    const g = graphOf(placed.model)
    const r = checkConnection(g, { source: 'cohort', sourceHandle: 'field:revenue', target: id, targetHandle: 'in:fields[0]' }, ctx)
    expect(r).toMatchObject({ ok: true, ref: 'revenue', rowKey: 'fields[0]', sourceType: 'f64' })
    if (!r.ok) throw new Error(r.reason)
    let m = connectWire(placed.model, id, r.rowKey, r.ref)
    m = connectWire(m, id, 'fields[1]', 'pages_viewed')
    expect(emitModelText(m)).toContain('{"name":"vector","fields":["revenue","pages_viewed"]}')
    const n = op(m, id)
    expect(n.data.rows.filter((x) => x.ref !== undefined).every((x) => x.resolved)).toBe(true)
    expect(n.data.rows).toContainEqual(expect.objectContaining({ key: 'fields[2]', port: 'append' }))
  })

  it('refuses categorical fields with a reason', () => {
    const g = graphOf(placed.model)
    const r = checkConnection(g, { source: 'cohort', sourceHandle: 'field:device', target: id, targetHandle: 'in:fields[0]' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/fields takes an integer or float field.*not categorical_u8.*device/)
  })

  it('takes packed_bool only with coerce binary', () => {
    const wire = { source: 'cohort', sourceHandle: 'field:opted_in', target: id, targetHandle: 'in:fields[0]' }
    const no = checkConnection(graphOf(placed.model), wire, ctx)
    expect(no.ok).toBe(false)
    if (!no.ok) expect(no.reason).toMatch(/coerce: "binary"/)
    const coerced = updateNode(placed.model, id, setIn(placed.model.nodes.get(id)!.value, ['coerce'], fromPlain('binary')))
    expect(checkConnection(graphOf(coerced), wire, ctx)).toMatchObject({ ok: true, ref: 'opted_in' })
    expect(vectorMemberRefusal('packed_bool', 'binary')).toBeNull()
    expect(vectorMemberRefusal('decimal128', 'binary')).toMatch(/not decimal128/)
  })

  it('draws glob members without a wire and a pattern vector without ports', () => {
    const m = parseModel('{"cohort":{"filename":"x.pulse"},"vectors":[{"name":"a","fields":["u_*","revenue"]},{"name":"b","pattern":"^u_"}]}', 'request')
    const g = graphOf(m)
    const a = g.nodes.find((n) => n.id === 'vectors[0]') as OpNode
    expect(a.data.rows.find((r) => r.key === 'fields[0]')).toEqual({ key: 'fields[0]', value: 'u_*' })
    expect(g.edges.map((e) => e.targetHandle)).toEqual(['in:fields[1]'])
    const b = g.nodes.find((n) => n.id === 'vectors[1]') as OpNode
    expect(b.data.rows.some((r) => r.port)).toBe(false)
  })
})

describe('vector rename', () => {
  it('flags consumers that named the old vector', () => {
    const m = parseModel(
      '{"cohort":{"filename":"x.pulse"},"vectors":[{"name":"drivers","fields":["revenue"]}],"matrices":[{"type":"MAT_CORRELATION","name":"c","vector":"drivers"}]}',
      'request',
    )
    const row = (g: GraphModel) => op(g, 'matrices[0]').data.rows.find((r) => r.key === 'vector')
    expect(row(m)?.resolved).toBe(true)
    const form = buildForm(m.nodes.get('vectors[0]')!, catalog)
    const nameField = form.sections.flatMap((s) => s.fields).find((f) => f.key === 'name')!
    const renamed = updateNode(m, 'vectors[0]', applyField(nameField, m.nodes.get('vectors[0]')!.value, 'drivers_v2').value)
    expect(emitModelText(renamed)).toContain('"name":"drivers_v2"')
    expect(row(renamed)?.resolved).toBe(false)
    expect(graphOf(renamed).edges.some((e) => e.target === 'matrices[0]')).toBe(false)
  })
})

describe('vector inspector form', () => {
  const m = parseModel('{"cohort":{"filename":"x.pulse"},"vectors":[{"name":"v","fields":["revenue"]}]}', 'request')
  const node = m.nodes.get('vectors[0]')!
  const form = buildForm(node, catalog)
  const field = (k: string) => form.sections.flatMap((s) => s.fields).find((f) => f.key === k)!

  it('covers every VectorSpec key with the documented enums', () => {
    expect(form.mode).toBe('handwritten')
    expect(form.sections.flatMap((s) => s.fields.map((f) => f.key))).toEqual(['name', 'fields', 'pattern', 'coerce', 'labels', 'kind', 'scale_min', 'scale_max'])
    expect(field('coerce').options).toEqual(['binary'])
    expect(field('kind').options).toEqual(['measure', 'scale', 'composition', 'binary'])
  })

  it('edits losslessly and checks exactly one of fields / pattern', () => {
    let v = applyField(field('fields'), node.value, 'revenue\npages_viewed').value
    v = applyField(field('kind'), v, 'scale').value
    v = applyField(field('scale_min'), v, '1').value
    v = applyField(field('scale_max'), v, '5').value
    expect(emitModelText(updateNode(m, node.id, v))).toContain(
      '{"name":"v","fields":["revenue","pages_viewed"],"kind":"scale","scale_min":1,"scale_max":5}',
    )
    expect(formProblems(form, v)).toEqual([])
    const both = applyField(field('pattern'), v, '^u_').value
    expect(formProblems(form, both)).toEqual(['exactly one of fields, pattern'])
  })
})

describe('vector validation', () => {
  it('flags member types, label counts and a scale range without kind scale', () => {
    const m = parseModel(
      '{"cohort":{"filename":"x.pulse"},"vectors":[{"name":"v","fields":["revenue","opted_in","device","q_*"],"labels":["a"],"scale_min":1,"scale_max":5}]}',
      'request',
    )
    const issues = clientIssues(m, catalog, cohortFields).filter((i) => i.code === 'VECTOR')
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      ['vectors[0].fields[1]', 'fields[1] takes packed_bool only with coerce: "binary" (opted_in)'],
      ['vectors[0].fields[2]', 'fields[2] takes an integer or float field (packed_bool with coerce binary), not categorical_u8 (device)'],
      ['vectors[0]', 'scale_min / scale_max are accepted only beside kind: "scale"'],
    ])
    const counted = parseModel('{"cohort":{"filename":"x.pulse"},"vectors":[{"name":"v","fields":["revenue","order_value"],"labels":["a"]}]}', 'request')
    expect(clientIssues(counted, catalog, cohortFields).map((i) => i.message)).toEqual(['labels has 1 entries for 2 members'])
  })
})

describe('vectorSummary', () => {
  it('summarizes means and the member with the most nulls', () => {
    const probe: PreviewProbe = {
      node: 'vectors[0]',
      kind: 'vector',
      rows: { total: 1000, filtered: 800 },
      vector: { members: ['a', 'b', 'c', 'd'], means: [1.23456, 2, null, 4], element_n: [800, 600, 790, 800], n: 800, n_null: 0 },
    }
    expect(vectorSummary(probe)).toEqual({ members: 4, means: '1.23, 2, –, …', worst: { name: 'b', pct: '25.0%' }, rows: 800 })
    expect(vectorSummary({ ...probe, vector: { ...probe.vector!, element_n: [800, 800, 800, 800] } })?.worst).toBeUndefined()
    expect(vectorSummary({ node: 'x', kind: 'vector' })).toBeUndefined()
  })
})

// Keep the plain JSON shape helper honest for the placed vector.
describe('placed vector JSON', () => {
  it('round-trips as plain JSON', () => {
    const r = placeNode(base, vectorItem, ctx)
    expect((toPlain(emitModel(r.model)) as { vectors: unknown[] }).vectors).toEqual([{ name: 'vector', fields: [] }])
  })
})
