/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Manifest, ManifestOperator } from '../api.ts'
import { getIn, prettyJson, setIn } from './jsonEdit.ts'
import { parseJson, stringifyJson, type JsonNode } from './jsonTree.ts'
import { emitModelText, parseModel, updateNode, type ModelNode } from './model.ts'
import { applyField, buildForm, fieldText, formProblems, HANDWRITTEN, type FormField, type NodeForm } from './paramForms.ts'

// Trimmed /api/catalog: every operator's params plus schema property names.
const catalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'testdata/catalog.slim.json'), 'utf8'),
) as { manifest: Manifest; schema: unknown }

const entry = (section: string, json: string): ModelNode => ({ id: `${section}[0]`, kind: 'entry', section, value: parseJson(json) })
const fields = (form: NodeForm, title = 'Params') => form.sections.find((s) => s.title === title)?.fields ?? []
const field = (form: NodeForm, key: string) => form.sections.flatMap((s) => s.fields).find((f) => f.key === key)!
const json = (v: JsonNode) => stringifyJson(v)

// Manifest list -> request section, and the key naming the operator.
const LISTS: [string, (m: Manifest) => ManifestOperator[] | undefined, string][] = [
  ['features', (m) => m.components?.features, 'type'],
  ['filterers', (m) => m.components?.filterers, 'type'],
  ['attributes', (m) => m.components?.attributes, 'type'],
  ['groups', (m) => m.components?.groupers, 'type'],
  ['aggregations', (m) => m.components?.aggregators, 'type'],
  ['windows', (m) => m.components?.windows, 'type'],
  ['tests', (m) => m.tests, 'type'],
  ['post_tests', (m) => m.post_tests, 'type'],
  ['regressions', (m) => m.regressions, 'type'],
  ['matrices', (m) => m.matrices, 'type'],
  ['overlays', (m) => m.overlays, 'kind'],
]

function sample(f: FormField): string {
  switch (f.type) {
    case 'number':
      return '0.25'
    case 'int':
      return '3'
    case 'bool':
      return 'true'
    case 'enum':
    case 'enumItem':
      // A non-default option, so omitDefault fields write it too.
      return f.options!.find((o) => o !== '' && o !== f.default) ?? f.options!.find((o) => o !== '')!
    case 'keys':
      return 'a\nb'
    case 'strings':
      return f.count === 2 ? '1\n2' : 'a\nb'
    case 'json':
      return '[1, 2]'
    case 'ranges':
      return '[{"label": "q1", "start": "2024-01-01", "end": null}]'
    default:
      return 'abc'
  }
}

describe('generated forms', () => {
  it('places params under params or at top level per the schema', () => {
    const form = buildForm(entry('tests', '{"type":"TEST_PROP_Z","field":"x","split_by":"arm","label":"t","params":{"success":"yes"}}'), catalog)
    expect(form.mode).toBe('generated')
    expect(form.opKnown).toBe(true)
    expect(fields(form).map((f) => [f.key, f.rel.join('.'), f.type, !!f.required])).toEqual([
      ['alpha', 'alpha', 'number', false],
      ['success', 'params.success', 'string', true],
    ])
    expect(field(form, 'alpha').default).toBe(0.05)
    expect(fields(form, 'Settings').map((f) => f.key)).toEqual(['label', 'field'])
  })

  it('maps manifest types to inputs (AGG_PERCENTILE, ATTR_DATE_PART, REG_GLM)', () => {
    const agg = buildForm(entry('aggregations', '{"type":"AGG_PERCENTILE","field":"revenue","label":"p95","params":{"percentile":95}}'), catalog)
    expect(field(agg, 'percentile')).toMatchObject({ rel: ['params', 'percentile'], type: 'number', required: true })
    expect(fieldText(field(agg, 'percentile'), parseJson('{"params":{"percentile":95}}'))).toBe('95')

    const attr = buildForm(entry('attributes', '{"type":"ATTR_DATE_PART","field":"d","label":"m","params":{"part":"year_month"}}'), catalog)
    expect(field(attr, 'part')).toMatchObject({ type: 'enum', required: true })
    expect(field(attr, 'part').options).toContain('year_month')

    const reg = buildForm(entry('regressions', '{"type":"REG_GLM","name":"m","target":"y","predictors":["a"],"family":"binomial"}'), catalog)
    expect(field(reg, 'target')).toMatchObject({ rel: ['target'], type: 'field', required: true })
    expect(field(reg, 'predictors')).toMatchObject({ rel: ['predictors'], type: 'json' })
    expect(field(reg, 'family')).toMatchObject({ rel: ['family'], type: 'enum' })
    expect(fields(reg, 'Settings').map((f) => f.key)).toEqual(['name'])
  })

  it('groups exactly_one_of params and reports violations', () => {
    const node = entry('features', '{"type":"FEAT_BUCKETIZE","field":"dti","label":"b","params":{"boundaries":[10,20]}}')
    const form = buildForm(node, catalog)
    expect(fields(form).map((f) => f.oneOf)).toEqual(['cutpoints', 'cutpoints'])
    expect(formProblems(form, node.value)).toEqual([])
    const both = applyField(field(form, 'quantiles'), node.value, '4').value
    expect(formProblems(form, both)).toEqual(['exactly one of boundaries, quantiles'])
  })

  it('matches tier-2 post_tests by family and windows get frame fields', () => {
    const post = buildForm(entry('post_tests', '{"type":"TEST_ANOVA_F","field":"x","label":"a"}'), catalog)
    expect(post.opKnown).toBe(true)
    expect(field(post, 'alpha').rel).toEqual(['alpha'])
    const win = buildForm(entry('windows', '{"type":"WIN_MOVING_AVG","field":"x","label":"ma","order_by":[{"field":"d"}]}'), catalog)
    expect(win.mode).toBe('none')
    expect(fields(win, 'Settings').map((f) => f.key)).toContain('frame.preceding')
    const v = applyField(field(win, 'frame.preceding'), parseJson('{"type":"WIN_MOVING_AVG"}'), '6').value
    expect(json(v)).toBe('{"type":"WIN_MOVING_AVG","frame":{"preceding":6}}')
  })

  it('uses the ranges editor for array params named ranges', () => {
    const form = buildForm(entry('groups', '{"type":"GROUP_DATE_RANGES","field":"d"}'), catalog)
    expect(field(form, 'ranges')).toMatchObject({ type: 'ranges', rel: ['params', 'ranges'], required: true })
  })

  it('flags operators missing from the manifest and lists undeclared params', () => {
    const form = buildForm(entry('aggregations', '{"type":"AGG_NOPE","field":"x","params":{"k":1}}'), catalog)
    expect(form.mode).toBe('none')
    expect(form.opKnown).toBe(false)
    expect(fields(form, 'Other params').map((f) => f.rel.join('.'))).toEqual(['params.k'])
    const sum = buildForm(entry('aggregations', '{"type":"AGG_SUM","field":"x","label":"s"}'), catalog)
    expect(sum).toMatchObject({ mode: 'none', opKnown: true, note: 'AGG_SUM takes no operator params.' })
  })

  it('gives every manifest operator with declared params a working form', () => {
    let count = 0
    for (const [section, list, opKey] of LISTS) {
      for (const op of list(catalog.manifest) ?? []) {
        const name = op.family ?? op.name ?? op.kind!
        if (!op.params?.length || HANDWRITTEN[name]) continue
        count++
        const node = entry(section, `{"${opKey}":${JSON.stringify(name)}}`)
        const form = buildForm(node, catalog)
        expect(form.mode, `${section} ${name}`).toBe('generated')
        let value = node.value
        for (const p of op.params) {
          const f = field(form, p.name)
          expect(f, `${name}.${p.name}`).toBeDefined()
          const text = sample(f)
          const r = applyField(f, value, text)
          expect(r.error, `${name}.${p.name} = ${text}`).toBeUndefined()
          value = r.value
          expect(getIn(value, f.rel), `${name}.${p.name}`).toBeDefined()
          // The field reads back what was written, and re-applying it is a no-op.
          expect(applyField(f, value, fieldText(f, value)).value, `${name}.${p.name}`).toBe(value)
        }
        // The operator name and key order survive; params land after it.
        expect(json(value).startsWith(`{"${opKey}":${JSON.stringify(name)}`)).toBe(true)
      }
    }
    expect(count).toBeGreaterThan(60)
  })
})

describe('hand-written forms', () => {
  it('FILTER_DATE_RANGES edits params.ranges, table and tz', () => {
    const node = entry('filterers', '{"type":"FILTER_DATE_RANGES","field":"d","params":{"ranges":[{"label":"q1","start":"2024-01-01","end":"2024-03-31"}]}}')
    const form = buildForm(node, catalog)
    expect(form.mode).toBe('handwritten')
    expect(fields(form).map((f) => `${f.key}:${f.type}:${f.rel.join('.')}`)).toEqual([
      'ranges:ranges:params.ranges',
      'table:string:params.table',
      'tz:string:tz',
    ])
    expect(formProblems(form, node.value)).toEqual([])
    const open = setIn(node.value, ['params', 'ranges', 0, 'end'], parseJson('null'))
    expect(json(open)).toBe('{"type":"FILTER_DATE_RANGES","field":"d","params":{"ranges":[{"label":"q1","start":"2024-01-01","end":null}]}}')
    const withTable = applyField(field(form, 'table'), node.value, 'fiscal').value
    expect(formProblems(form, withTable)).toEqual(['exactly one of ranges, table'])
  })

  it('filters edit values; FILTER_RANGE needs two; FILTER_NULL picks one', () => {
    const inc = buildForm(entry('filterers', '{"type":"FILTER_INCLUDE","field":"f","values":["a"]}'), catalog)
    const v = applyField(field(inc, 'values'), parseJson('{"type":"FILTER_INCLUDE","values":["a"]}'), 'a\nb\n').value
    expect(json(v)).toBe('{"type":"FILTER_INCLUDE","values":["a","b"]}')

    const range = buildForm(entry('filterers', '{"type":"FILTER_RANGE","field":"f","values":["1","2"]}'), catalog)
    expect(applyField(field(range, 'values'), parseJson('{}'), '1').error).toBe('needs exactly 2 values')

    const nul = buildForm(entry('filterers', '{"type":"FILTER_NULL","field":"f","values":["is_null"]}'), catalog)
    const f = field(nul, 'values')
    expect(fieldText(f, parseJson('{"values":["is_null"]}'))).toBe('is_null')
    expect(json(applyField(f, parseJson('{"values":["is_null"]}'), 'is_not_null').value)).toBe('{"values":["is_not_null"]}')
  })

  it('formulas edit expression; overlays edit scope from the manifest and ref', () => {
    const formula = buildForm(entry('attributes', '{"type":"ATTR_FORMULA","label":"r","expression":"a / b"}'), catalog)
    expect(field(formula, 'expression')).toMatchObject({ type: 'expression', required: true })
    const ov = buildForm(entry('overlays', '{"name":"o","kind":"OVERLAY_CHISQ_VS_POP","scope":"group","ref":{}}'), catalog)
    expect(ov.mode).toBe('handwritten')
    expect(field(ov, 'scope').type).toBe('enum')
    expect(field(ov, 'scope').options!.length).toBeGreaterThan(0)
  })

  it('overlay ref is required only for kinds whose manifest lists ref_kinds', () => {
    // brand-tracker req 03: a row-scope pairwise overlay with no ref.
    const pairwise = buildForm(entry('overlays', '{"name":"w","kind":"OVERLAY_PAIRWISE_PROP_Z","scope":"row","params":{"p_source":"cell_value"}}'), catalog)
    expect(field(pairwise, 'ref').required).toBeFalsy()
    expect(formProblems(pairwise, parseJson('{"name":"w","kind":"OVERLAY_PAIRWISE_PROP_Z","scope":"row"}'))).toEqual([])
    const margin = buildForm(entry('overlays', '{"name":"s","kind":"OVERLAY_SHARE_OF_COL","scope":"cell"}'), catalog)
    expect(field(margin, 'ref')).toMatchObject({ required: true, hint: 'ref family: Margin' })
    expect(formProblems(margin, parseJson('{"name":"s","kind":"OVERLAY_SHARE_OF_COL","scope":"cell"}')).length).toBeGreaterThan(0)
    // Unknown kinds: nothing to go on, so ref is not demanded.
    expect(field(buildForm(entry('overlays', '{"kind":"OVERLAY_NOPE","scope":"cell"}'), catalog), 'ref').required).toBeFalsy()
  })

  it('multiplicity blocks edit method, family and alpha', () => {
    const node: ModelNode = { id: 'multiplicity', kind: 'entry', section: 'multiplicity', value: parseJson('{"method":"holm"}') }
    const form = buildForm(node, catalog)
    expect(form.mode).toBe('handwritten')
    expect(fields(form, 'Correction').map((f) => f.key)).toEqual(['method', 'family', 'alpha'])
    expect(field(form, 'family').options).toContain('request')
    expect(json(applyField(field(form, 'family'), node.value, 'request').value)).toBe('{"method":"holm","family":"request"}')
  })

  it('cohort nodes edit filename; raw nodes are JSON only', () => {
    const cohort = buildForm({ id: 'cohort', kind: 'cohort', section: 'cohort', value: parseJson('{"filename":"a.pulse"}') }, catalog)
    expect(fields(cohort, 'Cohort').map((f) => f.key)).toEqual(['filename', 'data_dir'])
    expect(buildForm({ id: 'label', kind: 'raw', section: 'label', value: parseJson('"x"'), reason: 'unmodeled' }, catalog).mode).toBe('raw')
  })
})

describe('lossless edits', () => {
  it('changes only the edited value and keeps every other spelling', () => {
    const text = '{"cohort":{"filename":"c.pulse"},"tests":[{"type":"TEST_PROP_Z","field":"x","params":{"success":"yes","k":1.50}},{"type":"TEST_WELCH","field":"y","alpha":0.050}],"zz":1e3}'
    const model = parseModel(text)
    const node = model.nodes.get('tests[0]')!
    const f = field(buildForm(node, catalog), 'success')
    const edited = updateNode(model, node.id, applyField(f, node.value, 'no').value)
    expect(emitModelText(edited)).toBe(text.replace('"yes"', '"no"'))
    // An unchanged value (even re-typed) keeps its node and spelling.
    const alpha = field(buildForm(model.nodes.get('tests[1]')!, catalog), 'alpha')
    expect(applyField(alpha, model.nodes.get('tests[1]')!.value, '0.050').value).toBe(model.nodes.get('tests[1]')!.value)
  })

  it('clearing the last param removes the params object; numbers keep the typed spelling', () => {
    const v = parseJson('{"type":"AGG_PERCENTILE","params":{"percentile":95}}')
    const f: FormField = { key: 'percentile', rel: ['params', 'percentile'], type: 'number' }
    expect(json(applyField(f, v, '').value)).toBe('{"type":"AGG_PERCENTILE"}')
    expect(json(applyField(f, v, '90.0').value)).toBe('{"type":"AGG_PERCENTILE","params":{"percentile":90.0}}')
    expect(applyField(f, v, '9x').error).toBe('not a number')
    expect(applyField({ ...f, type: 'int' }, v, '1.5').error).toBe('not an integer')
  })

  it('prettyJson round-trips through the parser', () => {
    const v = parseJson('{"a":[1,2],"b":[{"c":"\\u00e9"}],"d":{}}')
    expect(json(parseJson(prettyJson(v)))).toBe(json(v))
  })
})
