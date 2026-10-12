// Pulse alpha.10 params: a grouper's `fit` enum (GROUP_KMEANS,
// GROUP_QUANTILE) and a post-test's `params.partition_by` group key list.
import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest } from '../api.ts'
import { buildComposeGraph } from './composeGraph.ts'
import { getIn } from './jsonEdit.ts'
import { parseJson, stringifyJson, toPlain } from './jsonTree.ts'
import { renameLane } from './lanes.ts'
import { emitModel, emitModelText, parseModel, updateNode, type GraphModel, type ModelNode } from './model.ts'
import { paletteItems, itemsForPort } from './palette.ts'
import { applyField, buildForm, fieldText, type FormField, type NodeForm } from './paramForms.ts'
import { groupKeyColumn, groupKeysOfModel, partitionProblem, removePartitionItem } from './partition.ts'
import { compatibleOperators, findOperator, slotFor, slotsFor } from './ports.ts'
import { buildRequestGraph, type OpNode } from './requestGraph.ts'
import { attach, clientIssues, type Issue } from './validation.ts'
import { bindsFit, checkConnection, connectWire, disconnectWire } from './wiring.ts'
import abFields from './testdata/ab_test.fields.json?raw'
import catalogText from './testdata/catalog.slim.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema: unknown }
const manifest = catalog.manifest
const cohortFields = JSON.parse(abFields) as CohortField[]
const ctx = { manifest, cohortFields }

const entry = (section: string, json: string): ModelNode => ({ id: `${section}[0]`, kind: 'entry', section, value: parseJson(json) })
const field = (form: NodeForm, key: string): FormField => form.sections.flatMap((s) => s.fields).find((f) => f.key === key)!
const json = (n: ModelNode['value']) => stringifyJson(n)
const graphOf = (m: GraphModel) => buildRequestGraph(toPlain(emitModel(m)), ctx)
const op = (g: { nodes: { id: string }[] }, id: string) => g.nodes.find((n) => n.id === id) as OpNode

const GROUPED = `{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
  "groups": [
    {"type": "GROUP_CATEGORY", "field": "region"},
    {"type": "GROUP_CATEGORY", "field": "device"},
    {"type": "GROUP_CATEGORY", "field": "arm"}
  ],
  "aggregations": [{"type": "AGG_AVERAGE", "field": "revenue", "label": "rev"}],
  "post_tests": [
    {"type": "TEST_TUKEY_HSD", "field": "rev", "split_by": "arm", "params": {"partition_by": ["region"]}}
  ]
}`

describe('grouper fit', () => {
  it.each(['GROUP_KMEANS', 'GROUP_QUANTILE'])('%s fit is a select with its default and meaning', (type) => {
    const form = buildForm(entry('groups', `{"type":"${type}","field":"revenue"}`), catalog)
    expect(form.mode).toBe('generated')
    const f = field(form, 'fit')
    expect(f).toMatchObject({ type: 'enum', rel: ['params', 'fit'], options: ['global', 'within'], default: 'global', omitDefault: true })
    expect(f.hint).toMatch(/global: .*once over the filtered set.*within: refit per bucket of the groupers before/)
    expect(f.hint).toContain(type === 'GROUP_KMEANS' ? 'centroids' : 'cut points')
  })

  it('never writes the default unasked, keeps a default the file already has', () => {
    const plain = parseJson('{"type":"GROUP_QUANTILE","field":"revenue","params":{"n":4}}')
    const f = field(buildForm(entry('groups', json(plain)), catalog), 'fit')
    // Choosing the default on a file without the key: no edit at all.
    expect(applyField(f, plain, 'global').value).toBe(plain)
    // A real choice is written; clearing removes it again.
    const within = applyField(f, plain, 'within').value
    expect(json(within)).toBe('{"type":"GROUP_QUANTILE","field":"revenue","params":{"n":4,"fit":"within"}}')
    expect(json(applyField(f, within, '').value)).toBe(json(plain))
    // Switching back to the default once the key exists keeps the key.
    expect(json(applyField(f, within, 'global').value)).toBe('{"type":"GROUP_QUANTILE","field":"revenue","params":{"n":4,"fit":"global"}}')
    const had = parseJson('{"type":"GROUP_QUANTILE","field":"revenue","params":{"fit":"global"}}')
    expect(fieldText(f, had)).toBe('global')
    expect(applyField(f, had, 'global').value).toBe(had)
  })

  it('opens and saves a file with fit losslessly', () => {
    const text = '{"cohort":{"filename":"ab_test.pulse"},"groups":[{"type":"GROUP_KMEANS","fields":["revenue","pages_viewed"],"params":{"k":3,"fit":"within"}}]}'
    const m = parseModel(text)
    buildForm(m.nodes.get('groups[0]')!, catalog)
    expect(emitModelText(m)).toBe(text)
  })

  it('is never a compose fit binding', () => {
    expect(bindsFit('groups', 'GROUP_QUANTILE', manifest)).toBe(false)
    expect(bindsFit('groups', 'GROUP_KMEANS')).toBe(false)
    expect(bindsFit('attributes', 'ATTR_REG_PREDICT', manifest)).toBe(true)
    const compose = {
      fits: [{ name: 'within', request: { cohort: { filename: 'ab_test.pulse' }, regressions: [{ type: 'REG_OLS', name: 'm', target: 'revenue', predictors: ['pages_viewed'] }] } }],
      requests: [
        {
          label: 's',
          cohort: { filename: 'ab_test.pulse' },
          groups: [{ type: 'GROUP_QUANTILE', field: 'revenue', params: { fit: 'within' } }],
          attributes: [{ type: 'ATTR_REG_PREDICT', label: 'pred', params: { fit: 'within' } }],
        },
      ],
    }
    const g = buildComposeGraph(compose, { manifest, fieldsFor: () => cohortFields })
    const grouper = op(g, 'requests[0].groups[0]')
    const row = grouper.data.rows.find((r) => r.key === 'params.fit')!
    expect(row).toEqual({ key: 'params.fit', value: 'within' })
    expect(g.edges.filter((e) => e.target === grouper.id && e.targetHandle === 'in:params.fit')).toEqual([])
    // The real binding next to it still binds.
    expect(g.edges.some((e) => e.target === 'requests[0].attributes[0]' && e.targetHandle === 'in:params.fit')).toBe(true)
    // A grouper's fit is not a wireable fit input.
    const w = { source: 'fits[0].request.regressions[0]', sourceHandle: 'fit', target: grouper.id, targetHandle: 'in:params.fit' }
    expect(checkConnection(g, w, ctx)).toMatchObject({ ok: false })
    // Renaming the fit lane rewrites the binding, not the grouper enum.
    const m = parseModel(JSON.stringify(compose))
    const renamed = toPlain(emitModel(renameLane(m, 'fits[0]', 'm2'))) as typeof compose
    expect(renamed.requests[0].attributes[0].params.fit).toBe('m2')
    expect(renamed.requests[0].groups[0].params.fit).toBe('within')
  })
})

describe('post-test partition_by', () => {
  it('is a group-key list slot under params, kept out of the type palette', () => {
    const slot = slotsFor(manifest, 'post_tests', 'TEST_TUKEY_HSD').find((s) => s.key === 'params.partition_by')
    expect(slot).toMatchObject({ list: true, required: false, groupKey: true })
    expect(slotFor(manifest, 'post_tests', 'TEST_TUKEY_HSD', 'params.partition_by[1]')).toEqual(slotsFor(manifest, 'post_tests', 'TEST_TUKEY_HSD')[2])
    // Tier-2 families written as type + params.variant find their entry.
    expect(findOperator(manifest, 'post_tests', 'TEST_ANOVA_F')?.name).toBe('TEST_ANOVA_F/one_way_from_summary')
    expect(slotsFor(manifest, 'post_tests', 'TEST_ANOVA_F').map((s) => s.key)).toEqual(['field', 'split_by', 'params.partition_by'])
    // A date field feeds no post-test (partition_by is not a type match).
    expect(compatibleOperators(manifest, 'post_tests', 'date').map((o) => o.name)).toEqual([])
    const m = parseModel(GROUPED)
    const items = itemsForPort(paletteItems(manifest), manifest, m, { ref: 'assign_week', type: 'date' })
    expect(items.filter((i) => i.section === 'post_tests')).toEqual([])
  })

  it('wires items from the grouper fields and offers the next key', () => {
    const g = graphOf(parseModel(GROUPED))
    const pt = op(g, 'post_tests[0]')
    expect(pt.data.rows.find((r) => r.key === 'params.partition_by[0]')).toMatchObject({ ref: 'region', resolved: true })
    expect(pt.data.rows.find((r) => r.key === 'params.partition_by[1]')).toMatchObject({ port: 'append' })
    expect(g.edges.find((e) => e.targetHandle === 'in:params.partition_by[0]')).toMatchObject({ source: 'cohort', sourceHandle: 'field:region' })
    // An aggregation label of the same name is not a group key source.
    const shadow = GROUPED.replace('"label": "rev"', '"label": "region"').replace('"field": "rev"', '"field": "region"')
    const g2 = graphOf(parseModel(shadow))
    expect(g2.edges.find((e) => e.targetHandle === 'in:params.partition_by[0]')).toMatchObject({ source: 'cohort' })
    // Every key listed (or no groups): no add row.
    const full = GROUPED.replace('["region"]', '["region", "device", "arm"]')
    expect(op(graphOf(parseModel(full)), 'post_tests[0]').data.rows.some((r) => r.port)).toBe(false)
    const ungrouped = parseModel('{"cohort":{"filename":"ab_test.pulse"},"post_tests":[{"type":"TEST_TUKEY_HSD","field":"x","split_by":"arm"}]}')
    expect(op(graphOf(ungrouped), 'post_tests[0]').data.rows.map((r) => r.key)).toEqual(['field', 'split_by'])
  })

  it('checks wires against the group key prefix', () => {
    const m = parseModel(GROUPED)
    const g = graphOf(m)
    const wire = (field: string, at: number) =>
      checkConnection(g, { source: 'cohort', sourceHandle: `field:${field}`, target: 'post_tests[0]', targetHandle: `in:params.partition_by[${at}]` }, ctx)
    expect(wire('device', 1)).toEqual({ ok: true, ref: 'device', rowKey: 'params.partition_by[1]', sourceType: 'categorical_u8' })
    expect(wire('arm', 1)).toMatchObject({ ok: false, reason: expect.stringContaining('item 2 is device') })
    expect(wire('revenue', 1)).toMatchObject({ ok: false, reason: expect.stringContaining('not revenue') })
    // A producer label is wireable only when it is a group key (row level).
    const agg = checkConnection(g, { source: 'aggregations[0]', sourceHandle: 'out', target: 'post_tests[0]', targetHandle: 'in:params.partition_by[1]' }, ctx)
    expect(agg).toMatchObject({ ok: false })

    const added = connectWire(m, 'post_tests[0]', 'params.partition_by[1]', 'device')
    expect(json(added.nodes.get('post_tests[0]')!.value)).toContain('"params":{"partition_by":["region","device"]}')
    // A fresh post-test gets params.partition_by created on first wire.
    const fresh = parseModel(GROUPED.replace(', "params": {"partition_by": ["region"]}', ''))
    expect(op(graphOf(fresh), 'post_tests[0]').data.rows.find((r) => r.port === 'append')?.key).toBe('params.partition_by[0]')
    const first = connectWire(fresh, 'post_tests[0]', 'params.partition_by[0]', 'region')
    expect(json(first.nodes.get('post_tests[0]')!.value)).toBe('{"type":"TEST_TUKEY_HSD","field":"rev","split_by":"arm","params":{"partition_by":["region"]}}')
    // Removing the last key goes back to the default, not [] (no partition).
    const back = disconnectWire(first, 'post_tests[0]', 'params.partition_by[0]')
    expect(emitModelText(back)).toBe(emitModelText(fresh))
  })

  it('edits as a key list in the inspector', () => {
    const m = parseModel(GROUPED)
    const node = m.nodes.get('post_tests[0]')!
    const keys = groupKeysOfModel(m, '')
    expect(keys).toEqual(['region', 'device', 'arm'])
    const f = field(buildForm(node, catalog, { groupKeys: keys }), 'partition_by')
    expect(f).toMatchObject({ type: 'keys', rel: ['params', 'partition_by'], options: keys })
    expect(f.hint).toContain('every key but the last (region, device)')
    expect(fieldText(f, node.value)).toBe('region')
    expect(json(applyField(f, node.value, 'region\ndevice').value)).toContain('"partition_by":["region","device"]')
    expect(json(applyField(f, node.value, '[]').value)).toContain('"partition_by":[]')
    // Removing the only item removes partition_by and the emptied params.
    expect(json(removePartitionItem(node.value, 0))).toBe('{"type":"TEST_TUKEY_HSD","field":"rev","split_by":"arm"}')
    // Opening the form writes nothing.
    expect(emitModelText(m)).toBe(JSON.stringify(JSON.parse(GROUPED)))
  })

  it('validates names, prefix order, list shape and matching depth', () => {
    const issues = (text: string) => clientIssues(parseModel(text), catalog, cohortFields).filter((i) => i.code === 'PARTITION_BY')
    expect(issues(GROUPED)).toEqual([])
    expect(issues(GROUPED.replace('["region"]', '["revenue"]'))).toMatchObject([
      { path: 'post_tests[0].params.partition_by[0]', severity: 'error', current: 'revenue', message: expect.stringContaining('not a group key column') },
    ])
    expect(issues(GROUPED.replace('["region"]', '["device"]'))).toMatchObject([{ message: expect.stringContaining('leading prefix') }])
    expect(issues(GROUPED.replace('["region"]', '"region"'))).toMatchObject([{ path: 'post_tests[0].params.partition_by' }])
    const two = GROUPED.replace(
      '"params": {"partition_by": ["region"]}}',
      '"params": {"partition_by": ["region"]}},\n    {"type": "TEST_TUKEY_HSD", "field": "rev", "split_by": "arm"}',
    )
    expect(issues(two)).toMatchObject([{ path: 'post_tests[1]', message: expect.stringContaining('partition alike') }])
    expect(issues(two.replace('["region"]', '["region", "device"]'))).toEqual([])
    const ungrouped = '{"cohort":{"filename":"ab_test.pulse"},"post_tests":[{"type":"TEST_TUKEY_HSD","field":"x","split_by":"arm","params":{"partition_by":["arm"]}}]}'
    expect(issues(ungrouped)).toMatchObject([{ message: expect.stringContaining('no groups') }])
    expect(issues(ungrouped.replace('["arm"]', '[]'))).toEqual([])
  })

  it('drops the engine refusal a client partition_by error repeats', () => {
    const client: Issue = { path: 'post_tests[0].params.partition_by[0]', severity: 'error', code: 'PARTITION_BY', message: 'client', source: 'client' }
    const engine: Issue = { ...client, code: 'PULSE_TEST_PARTITION_INVALID', message: 'engine', source: 'engine' }
    expect(attach(['post_tests[0]'], [client], [engine], []).byNode.get('post_tests[0]')?.issues.map((i) => i.message)).toEqual(['client'])
    expect(attach(['post_tests[0]'], [], [engine], []).byNode.get('post_tests[0]')?.issues.map((i) => i.message)).toEqual(['engine'])
  })

  it('reads vector grouper key columns like the engine', () => {
    expect(groupKeyColumn({ type: 'GROUP_KMEANS', fields: ['a', 'b'] })).toBe('GROUP_KMEANS_a')
    expect(groupKeyColumn({ type: 'GROUP_KMEANS', vector: 'v' })).toBe('GROUP_KMEANS_v')
    expect(groupKeyColumn({ type: 'GROUP_QUANTILE', field: 'revenue' })).toBe('revenue')
    expect(partitionProblem(undefined, ['a'])).toBeNull()
    expect(partitionProblem(parseJson('null'), ['a'])).toBeNull()
  })

  it('keeps a partitioned post-test byte-identical through an unrelated edit', () => {
    const m = parseModel(GROUPED)
    const agg = m.nodes.get('aggregations[0]')!
    const edited = updateNode(m, agg.id, agg.value)
    expect(emitModelText(edited)).toBe(emitModelText(m))
    expect(getIn(edited.nodes.get('post_tests[0]')!.value, ['params', 'partition_by'])?.type).toBe('array')
  })
})
