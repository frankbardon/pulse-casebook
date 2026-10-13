import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest } from '../api.ts'
import { toPlain } from './jsonTree.ts'
import { emitModel, emitModelText, parseModel } from './model.ts'
import { operatorsOf } from './ports.ts'
import { buildRequestGraph } from './requestGraph.ts'
import { checkConnection } from './wiring.ts'
import {
  BLOCK_ITEMS,
  itemsForPort,
  nextIndex,
  paletteGroups,
  paletteItems,
  PALETTE_SECTIONS,
  placeNode,
  searchPalette,
  type PaletteItem,
} from './palette.ts'
import catalogText from './testdata/catalog.slim.json?raw'
import abFields from './testdata/ab_test.fields.json?raw'
import cupedWelch from '../../../../showcase/ab-test-readout/req/08_cuped_welch.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema: unknown }
const manifest = catalog.manifest
const cohortFields = JSON.parse(abFields) as CohortField[]
const items = paletteItems(manifest)
const item = (section: string, op: string) => items.find((i) => i.section === section && i.op === op)!
const opts = { manifest, schema: catalog.schema, cohortFields }

describe('paletteItems', () => {
  it('lists every manifest operator exactly once', () => {
    let total = 0
    for (const s of PALETTE_SECTIONS) {
      const ops = operatorsOf(manifest, s) ?? []
      total += ops.length
      for (const o of ops) expect(items.filter((i) => i.section === s && i.op === (o.name ?? o.kind))).toHaveLength(1)
    }
    expect(items).toHaveLength(total + BLOCK_ITEMS.length)
    expect(total).toBeGreaterThan(150)
    expect(items.slice(total)).toEqual(BLOCK_ITEMS)
  })

  it('every item places into an empty request and builds a graph', () => {
    const empty = parseModel('{"cohort":{"filename":"x.pulse"}}', 'request')
    for (const it of items) {
      const { model, id } = placeNode(empty, it, opts)
      expect(model.nodes.get(id)?.kind, it.key).toBe('entry')
      const g = buildRequestGraph(toPlain(emitModel(model)), { manifest })
      expect(g.nodes.find((n) => n.id === id)?.type, it.key).toBe('op')
    }
  })

  it('groups by stage column in column order', () => {
    const groups = paletteGroups(items).map((g) => g.title)
    expect(groups).toEqual(['Cohort', 'Features', 'Filters', 'Attributes', 'Group', 'Aggregate', 'Windows', 'Analysis', 'Output'])
  })

  it('splits tier-2 post-test variants', () => {
    expect(item('post_tests', 'TEST_ANOVA_F/one_way_from_summary')).toMatchObject({ type: 'TEST_ANOVA_F', variant: 'one_way_from_summary' })
    expect(item('post_tests', 'TEST_TREND').variant).toBeUndefined()
  })

  it('regenerates from whatever manifest it is given', () => {
    const extra: Manifest = { ...manifest, tests: [...(manifest.tests ?? []), { name: 'TEST_NEW_THING', requires: ['Field'] }] }
    expect(paletteItems(extra).some((i) => i.op === 'TEST_NEW_THING')).toBe(true)
    expect(items.some((i) => i.op === 'TEST_NEW_THING')).toBe(false)
  })
})

describe('searchPalette', () => {
  const its: PaletteItem[] = [
    { key: 'a', section: 'features', column: 'features', kind: 'Feature', op: 'FEAT_LOG', type: 'FEAT_LOG', description: 'Natural logarithm of a positive column.' },
    { key: 'b', section: 'tests', column: 'analysis', kind: 'Test', op: 'TEST_WELCH', type: 'TEST_WELCH', description: "Welch's unequal-variance t-test." },
  ]
  it('matches names, spaced names, descriptions and kinds', () => {
    expect(searchPalette(its, 'welch').map((i) => i.key)).toEqual(['b'])
    expect(searchPalette(its, 'feat log').map((i) => i.key)).toEqual(['a'])
    expect(searchPalette(its, 'LOGARITHM').map((i) => i.key)).toEqual(['a'])
    expect(searchPalette(its, 'unequal variance').map((i) => i.key)).toEqual(['b'])
    expect(searchPalette(its, 'welch logarithm').map((i) => i.key)).toEqual([])
    expect(searchPalette(its, 'test').map((i) => i.key)).toEqual(['b'])
    expect(searchPalette(its, '  ')).toHaveLength(2)
  })
})

describe('itemsForPort', () => {
  const model = parseModel(cupedWelch, 'request')

  it('a numeric cohort field lists only operators with a numeric input', () => {
    const got = itemsForPort(items, manifest, model, { ref: 'revenue', type: 'f64' })
    const ops = got.map((i) => i.op)
    expect(ops).toContain('FEAT_LOG')
    expect(ops).toContain('TEST_WELCH')
    expect(ops).not.toContain('FEAT_ONE_HOT')
    expect(ops).not.toContain('FILTER_DATE_RANGES')
    expect(got.some((i) => i.section === 'overlays')).toBe(false)
    expect(got.find((i) => i.op === 'TEST_WELCH')?.rowKey).toBe('field')
  })

  it('a categorical field feeds a test through its split_by input', () => {
    const got = itemsForPort(items, manifest, model, { ref: 'arm', type: 'categorical_u8' })
    expect(got.map((i) => i.op)).toContain('FEAT_ONE_HOT')
    expect(got.map((i) => i.op)).not.toContain('FEAT_LOG')
    expect(got.find((i) => i.op === 'TEST_WELCH')?.rowKey).toBe('split_by')
  })

  it('list inputs wire their first item', () => {
    const reg = itemsForPort(items, manifest, model, { ref: 'revenue', type: 'f64' }).find((i) => i.section === 'regressions')
    expect(reg?.rowKey).toMatch(/^(target|predictors\[0\])$/)
  })

  it('a label only feeds sections that run after its producer', () => {
    const got = itemsForPort(items, manifest, model, { ref: 'pages_cuped', type: 'f64', producer: { section: 'attributes', index: 0 } })
    const sections = new Set(got.map((i) => i.section))
    expect(sections.has('tests')).toBe(true)
    expect(sections.has('attributes')).toBe(true) // appended after attributes[0]
    expect(sections.has('features')).toBe(false)
    expect(sections.has('filterers')).toBe(false)
  })

  it('every offered item wires cleanly', () => {
    for (const src of [
      { ref: 'revenue', type: 'f64' },
      { ref: 'arm', type: 'categorical_u8' },
    ]) {
      for (const it of itemsForPort(items, manifest, model, src)) {
        const { model: m, id } = placeNode(model, it, { ...opts, wire: { rowKey: it.rowKey, ref: src.ref } })
        const g = buildRequestGraph(toPlain(emitModel(m)), { manifest, cohortFields })
        const r = checkConnection(g, { source: 'cohort', sourceHandle: `field:${src.ref}`, target: id, targetHandle: `in:${it.rowKey}` }, { manifest, cohortFields })
        expect(r.ok, `${it.key} <- ${src.ref}`).toBe(true)
        expect(g.edges.some((e) => e.target === id && e.source === 'cohort' && e.data?.ref === src.ref), it.key).toBe(true)
      }
    }
  })
})

describe('placeNode', () => {
  const model = parseModel(cupedWelch, 'request')

  it('appends a wired, labelled entry and leaves the rest of the document alone', () => {
    const { model: m, id } = placeNode(model, item('tests', 'TEST_WELCH'), { ...opts, wire: { rowKey: 'split_by', ref: 'arm' } })
    expect(id).toBe('tests[2]')
    const before = emitModelText(model)
    const after = emitModelText(m)
    expect(after.slice(0, before.lastIndexOf(']}') + 0)).toBe(before.slice(0, before.lastIndexOf(']}')))
    expect(after.endsWith(',{"type":"TEST_WELCH","label":"arm_welch","split_by":"arm"}]}')).toBe(true)
  })

  it('creates a missing section at the end of the request', () => {
    const { model: m, id } = placeNode(model, item('features', 'FEAT_LOG'), opts)
    expect(id).toBe('features[0]')
    expect(emitModelText(m).endsWith(',"features":[{"type":"FEAT_LOG","label":"log"}]}')).toBe(true)
    expect(nextIndex(m, 'features')).toBe(1)
  })

  it('keeps labels unique against entries and cohort fields', () => {
    let m = model
    m = placeNode(m, item('features', 'FEAT_LOG'), opts).model
    m = placeNode(m, item('features', 'FEAT_LOG'), opts).model
    expect(emitModelText(m)).toContain('"label":"log_2"')
    const w = placeNode(model, item('tests', 'TEST_WELCH'), { ...opts, wire: { rowKey: 'field', ref: 'pages' } })
    expect(emitModelText(w.model)).toContain('"label":"pages_welch"')
    // `revenue` is a cohort field: a label never shadows it.
    const r = placeNode(model, { ...item('features', 'FEAT_LOG'), type: 'FEAT_REVENUE' }, opts)
    expect(emitModelText(r.model)).toContain('"label":"revenue_2"')
  })

  it('writes post-test variants, single overlay scopes and defaulted required params', () => {
    const pt = placeNode(model, item('post_tests', 'TEST_ANOVA_F/one_way_from_summary'), opts)
    expect(emitModelText(pt.model)).toContain('{"type":"TEST_ANOVA_F","label":"anova_f","params":{"variant":"one_way_from_summary"}}')
    const ov = manifest.overlays!.find((o) => o.scopes?.length === 1)!
    const o = placeNode(model, item('overlays', ov.kind!), opts)
    expect(emitModelText(o.model)).toContain(`"kind":${JSON.stringify(ov.kind)}`)
    expect(emitModelText(o.model)).toContain(`"scope":${JSON.stringify(ov.scopes![0])}`)

    const m2: Manifest = { tests: [{ name: 'TEST_X', params: [{ name: 'alpha', type: 'float', required: true, default: 0.05 }, { name: 'beta', type: 'float', default: 1 }] }] }
    const x = placeNode(model, paletteItems(m2)[0], { manifest: m2 })
    expect(emitModelText(x.model)).toContain('{"type":"TEST_X","label":"x","params":{"alpha":0.05}}')
  })

  it('places a multiplicity block once per request', () => {
    const mult = item('multiplicity', 'MULTIPLICITY')
    const r = placeNode(model, mult, opts)
    expect(r.id).toBe('multiplicity')
    expect(emitModelText(r.model)).toContain('"multiplicity":{"method":"holm"}')
    expect(() => placeNode(r.model, mult, opts)).toThrow(/already has a multiplicity block/)
    const compose = parseModel('{"requests":[{"label":"a","cohort":{"filename":"x.pulse"}},{"label":"b","cohort":{"filename":"x.pulse"}}]}', 'compose')
    const c = placeNode(compose, mult, { ...opts, base: ['requests', 1] })
    expect(c.id).toBe('requests[1].multiplicity')
    expect(emitModelText(c.model)).toContain('{"label":"b","cohort":{"filename":"x.pulse"},"multiplicity":{"method":"holm"}}')
  })

  it('refuses a section that is not a list', () => {
    const odd = parseModel('{"cohort":{"filename":"x.pulse"},"tests":{"oops":1}}', 'request')
    expect(() => placeNode(odd, item('tests', 'TEST_WELCH'), opts)).toThrow(/not a list/)
  })
})
