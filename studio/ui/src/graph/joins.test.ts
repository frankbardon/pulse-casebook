// First-class joins: the join node and its joined-field wires, key
// wiring and type rules, the palette block, the inspector form and the
// client-side join checks.
import { describe, expect, it } from 'vitest'
import type { CohortField, Manifest } from '../api.ts'
import { toPlain } from './jsonTree.ts'
import { buildComposeGraph } from './composeGraph.ts'
import { anchorUnreadable, cohortOptions, isAnchor, joinBodyLines, joinBodyRows, joinedSummary, joinIssues, joinKeyRefusal, joinKinds, maxJoins, type RightSide } from './joins.ts'
import { emitModel, emitModelText, parseModel, type GraphModel } from './model.ts'
import { applyField, buildForm } from './paramForms.ts'
import { paletteItems, placeNode } from './palette.ts'
import { invalidated } from './previews.ts'
import { buildRequestGraph, estimateHeight, hasPreview, LAYOUT, type OpNode, type RequestGraph } from './requestGraph.ts'
import { checkConnection, connectWire, disconnectWire } from './wiring.ts'
import catalogText from './testdata/catalog.slim.json?raw'

const catalog = JSON.parse(catalogText) as { manifest: Manifest; schema: unknown }
const manifest = catalog.manifest

const left: CohortField[] = [
  { name: 'id', type: 'u32' },
  { name: 'region', type: 'categorical_u8' },
  { name: 'tags', type: 'set_u8' },
  { name: 'amount', type: 'f64' },
]
const right: CohortField[] = [
  { name: 'user_id', type: 'u64' },
  { name: 'region', type: 'categorical_u16' },
  { name: 'bonus', type: 'f64' },
  { name: 'id', type: 'u32' },
]
const rights = (r: string): RightSide => (r === 'right.pulse' ? right : r === 'pending.pulse' ? undefined : null)
const ctx = { manifest, cohortFields: left, rightFields: rights }

const JOINED = `{"cohort":{"filename":"left.pulse"},
  "joins":[{"right":"right.pulse","kind":"inner","as":"r_","on":[{"left_field":"id","right_field":"user_id"}]}],
  "filterers":[{"type":"FILTER_RANGE","field":"r_bonus","values":["0","10"]}],
  "aggregations":[{"type":"AGG_AVERAGE","field":"r_bonus","label":"b"},{"type":"AGG_COUNT","field":"amount","label":"n"}]}`

const graphOf = (m: GraphModel, opts = ctx) => buildRequestGraph(toPlain(emitModel(m)), opts)
const node = (g: RequestGraph, id: string) => g.nodes.find((n) => n.id === id) as OpNode
const into = (g: RequestGraph, target: string) => g.edges.filter((e) => e.target === target).map((e) => `${e.source}|${e.sourceHandle}->${e.targetHandle}`)

describe('join node', () => {
  const model = parseModel(JOINED, 'request')
  const g = graphOf(model)
  const join = node(g, 'joins[0]')

  it('is an op node in its own Join column right of the cohort, with a preview', () => {
    expect(join.type).toBe('op')
    expect(join.data).toMatchObject({ column: 'joins', section: 'joins', title: 'Join', op: 'inner' })
    expect(g.columns.map((c) => c.title)).toEqual(['Cohort', 'Join', 'Filters', 'Aggregate'])
    const cohortX = node(g, 'cohort' as string)?.position.x ?? 0
    expect(join.position.x).toBe(cohortX + LAYOUT.nodeWidth + LAYOUT.columnGap)
    // Top of its column, level with the cohort: key wires run straight across.
    expect(join.position.y).toBe(node(g, 'cohort' as string)?.position.y)
    expect(hasPreview(join)).toBe(true)
  })

  it('lists the joined fields, prefixed with as, as its outputs', () => {
    expect(join.data.join).toMatchObject({ right: 'right.pulse', as: 'r_', state: 'known' })
    expect(join.data.join!.fields.map((f) => [f.name, f.type, f.used])).toEqual([
      ['r_user_id', 'u64', false],
      ['r_region', 'categorical_u16', false],
      ['r_bonus', 'f64', true],
      ['r_id', 'u32', false],
    ])
  })

  it('wires its left keys from the cohort and joined fields from itself', () => {
    expect(into(g, 'joins[0]')).toEqual(['cohort|field:id->in:on[0].left_field'])
    expect(into(g, 'filterers[0]')).toEqual(['joins[0]|field:r_bonus->in:field'])
    expect(into(g, 'aggregations[0]')).toEqual(['joins[0]|field:r_bonus->in:field'])
    expect(into(g, 'aggregations[1]')).toEqual(['cohort|field:amount->in:field'])
    expect(join.data.rows).toContainEqual(expect.objectContaining({ key: 'on[1].left_field', port: 'append' }))
  })

  it('flags a right_field the right cohort lacks', () => {
    const m = parseModel(JOINED.replace('"right_field":"user_id"', '"right_field":"uid"'), 'request')
    const row = node(graphOf(m), 'joins[0]').data.rows.find((r) => r.key === 'on[0].right_field')
    expect(row).toMatchObject({ value: 'uid', invalid: true })
  })

  it('survives an unknown right cohort: the node says so and prefixed refs still wire to it', () => {
    const m = parseModel(JOINED.replace('"right":"right.pulse"', '"right":"ghost.pulse"'), 'request')
    const g2 = graphOf(m)
    const j = node(g2, 'joins[0]')
    expect(j.data.join).toMatchObject({ state: 'missing', right: 'ghost.pulse' })
    expect(j.data.join!.fields.map((f) => f.name)).toEqual(['r_bonus'])
    expect(into(g2, 'aggregations[0]')).toEqual(['joins[0]|field:r_bonus->in:field'])
    const pending = node(graphOf(parseModel(JOINED.replace('right.pulse', 'pending.pulse'), 'request')), 'joins[0]')
    expect(pending.data.join?.state).toBe('pending')
    expect(node(graphOf(parseModel('{"cohort":{"filename":"l.pulse"},"joins":[{"kind":"inner","on":[]}]}', 'request')), 'joins[0]').data.join).toMatchObject({
      state: 'missing',
    })
  })

  it('draws a join in a compose slot lane', () => {
    const c = buildComposeGraph(
      { requests: [{ label: 'a', ...(JSON.parse(JOINED) as object) }] },
      { manifest, fieldsFor: () => left, rightFields: rights },
    )
    expect(c.edges.some((e) => e.source === 'requests[0].joins[0]' && e.target === 'requests[0].aggregations[0]')).toBe(true)
  })

  it('gives compose lanes a shared Join column only lanes with joins draw', () => {
    const plainSlot = { label: 'b', cohort: { filename: 'left.pulse' }, aggregations: [{ type: 'AGG_COUNT', field: 'amount', label: 'n' }] }
    const alone = buildComposeGraph({ requests: [plainSlot] }, { manifest, fieldsFor: () => left, rightFields: rights })
    expect(alone.columns.map((c) => c.key)).toEqual(['source', 'aggregations', 'result'])
    const c = buildComposeGraph(
      { requests: [{ label: 'a', ...(JSON.parse(JOINED) as object) }, plainSlot] },
      { manifest, fieldsFor: () => left, rightFields: rights },
    )
    expect(c.columns.map((col) => col.key)).toEqual(['source', 'joins', 'filterers', 'aggregations', 'result'])
    expect(c.lanes.find((l) => l.id === 'requests[0]')?.columns).toContain('joins')
    expect(c.lanes.find((l) => l.id === 'requests[1]')?.columns).toEqual(['source', 'aggregations', 'result'])
    const xOf = (id: string) => c.nodes.find((n) => n.id === id)?.position.x
    expect(xOf('requests[0].joins[0]')).toBe(c.columns[1].x)
  })

  it('stales everything downstream in its frame on an edit, but not the cohort', () => {
    const stale = invalidated(['joins[0]'], g)
    expect([...stale].sort()).toEqual(['aggregations[0]', 'aggregations[1]', 'filterers[0]', 'joins[0]'])
  })
})

describe('join wiring', () => {
  const model = parseModel(JOINED, 'request')
  const g = graphOf(model)

  it('takes a left key into the next pair and fills a same-named right key', () => {
    const r = checkConnection(g, { source: 'cohort', sourceHandle: 'field:region', target: 'joins[0]', targetHandle: 'in:on[1].left_field' }, ctx)
    expect(r).toEqual({ ok: true, ref: 'region', rowKey: 'on[1].left_field', sourceType: 'categorical_u8', also: [{ rowKey: 'on[1].right_field', ref: 'region' }] })
    if (!r.ok) return
    let m = connectWire(model, 'joins[0]', r.rowKey, r.ref)
    for (const w of r.also ?? []) m = connectWire(m, 'joins[0]', w.rowKey, w.ref)
    expect(emitModelText(m)).toContain('"on":[{"left_field":"id","right_field":"user_id"},{"left_field":"region","right_field":"region"}]')
    // Unwiring the left key leaves the right key for the inspector.
    expect(emitModelText(disconnectWire(m, 'joins[0]', 'on[1].left_field'))).toContain('{"right_field":"region"}]')
  })

  it('creates on when the join has none', () => {
    const m = parseModel('{"cohort":{"filename":"l.pulse"},"joins":[{"right":"right.pulse","kind":"inner"}]}', 'request')
    const port = node(graphOf(m), 'joins[0]').data.rows.find((r) => r.port)
    expect(port?.key).toBe('on[0].left_field')
    expect(emitModelText(connectWire(m, 'joins[0]', 'on[0].left_field', 'id'))).toContain('"on":[{"left_field":"id"}]')
  })

  it('refuses set keys and key types that do not compare, with a reason', () => {
    const set = checkConnection(g, { source: 'cohort', sourceHandle: 'field:tags', target: 'joins[0]', targetHandle: 'in:on[1].left_field' }, ctx)
    expect(set).toEqual({ ok: false, reason: 'join on[1].left_field: a set column (set_u8) cannot be a join key (field tags)' })
    const cat = checkConnection(g, { source: 'cohort', sourceHandle: 'field:region', target: 'joins[0]', targetHandle: 'in:on[0].left_field' }, ctx)
    expect(cat).toEqual({ ok: false, reason: 'join on[0].left_field: key types categorical_u8 and u64 do not compare (field region)' })
    const num = checkConnection(g, { source: 'cohort', sourceHandle: 'field:amount', target: 'joins[0]', targetHandle: 'in:on[0].left_field' }, ctx)
    expect(num).toMatchObject({ ok: true, ref: 'amount' })
  })

  it('wires joined fields downstream, typed by the right cohort, but never into a join', () => {
    const ok = checkConnection(g, { source: 'joins[0]', sourceHandle: 'field:r_bonus', target: 'aggregations[1]', targetHandle: 'in:field' }, ctx)
    expect(ok).toEqual({ ok: true, ref: 'r_bonus', rowKey: 'field', sourceType: 'f64' })
    const back = checkConnection(g, { source: 'joins[0]', sourceHandle: 'field:r_id', target: 'joins[0]', targetHandle: 'in:on[1].left_field' }, ctx)
    expect(back.ok).toBe(false)
    const label = checkConnection(g, { source: 'aggregations[0]', sourceHandle: 'out', target: 'joins[0]', targetHandle: 'in:on[1].left_field' }, ctx)
    expect(label).toEqual({ ok: false, reason: "a join's left_field reads the left cohort, not joined fields or labels" })
  })

  it('compares key types like pulse OnPair', () => {
    expect(joinKeyRefusal('u32', 'f64')).toBeNull()
    expect(joinKeyRefusal('date', 'u64')).toBeNull()
    expect(joinKeyRefusal('categorical_u8', 'categorical_u32')).toBeNull()
    expect(joinKeyRefusal('decimal128', 'decimal128')).toBeNull()
    expect(joinKeyRefusal('decimal128', 'f64')).toMatch(/do not compare/)
    expect(joinKeyRefusal('set_u8', 'set_u8')).toMatch(/set column/)
    expect(joinKeyRefusal('u32', undefined)).toBeNull()
  })
})

describe('join palette block and form', () => {
  const item = paletteItems(manifest).find((i) => i.section === 'joins')!
  const base = parseModel('{"cohort":{"filename":"l.pulse"}}', 'request')

  it('places one join per request in JoinSpec key order', () => {
    expect(item).toMatchObject({ column: 'joins', kind: 'Join', type: 'inner' })
    const r = placeNode(base, item, ctx)
    expect(r.id).toBe('joins[0]')
    expect(emitModelText(r.model)).toContain('"joins":[{"right":"","kind":"inner","on":[]}]')
    expect(() => placeNode(r.model, item, ctx)).toThrow(/already has a join: the engine runs 1 per request/)
    const two = { ...manifest, join: { kinds: ['inner'], max_joins_per_request: 2 } }
    expect(placeNode(r.model, item, { ...ctx, manifest: two }).id).toBe('joins[1]')
  })

  it('edits right from the workspace cohorts, kind from the manifest, as and on pairs', () => {
    const r = placeNode(base, item, ctx)
    const n = r.model.nodes.get(r.id)!
    const options = cohortOptions('case/req/x.json', ['case/right.pulse', 'other/far.pulse', 'case/req/near.pulse'])
    expect(options).toEqual([
      { value: 'req/near.pulse', path: 'case/req/near.pulse' },
      { value: 'right.pulse', path: 'case/right.pulse' },
      { value: 'other/far.pulse', path: 'other/far.pulse' },
    ])
    const form = buildForm(n, catalog, { cohortOptions: options })
    const fields = form.sections.flatMap((s) => s.fields)
    expect(fields.map((f) => [f.key, f.type])).toEqual([
      ['right', 'cohortFile'],
      ['kind', 'enum'],
      ['as', 'string'],
      ['on', 'pairs'],
    ])
    expect(fields[0].options).toEqual(['req/near.pulse', 'right.pulse', 'other/far.pulse'])
    expect(fields[1].options).toEqual(['inner'])
    let v = applyField(fields[0], n.value, 'right.pulse').value
    v = applyField(fields[2], v, 'r_').value
    expect(emitModelText({ ...r.model, nodes: new Map(r.model.nodes).set(r.id, { ...n, value: v }) })).toContain(
      '{"right":"right.pulse","kind":"inner","on":[],"as":"r_"}',
    )
    expect(joinKinds({ ...manifest, join: { kinds: ['inner', 'left'] } })).toEqual(['inner', 'left'])
    expect(maxJoins(manifest)).toBe(1)
  })
})

describe('joinIssues', () => {
  const check = (text: string, kind: 'request' | 'compose' = 'request') =>
    joinIssues(parseModel(text, kind), { manifest, rightFields: rights, leftFields: () => left }).map((i) => [i.path, i.code, i.message])

  it('accepts a sound join', () => {
    expect(check(JOINED)).toEqual([])
  })

  it('flags the right cohort, keys, kind, collisions and the join limit', () => {
    expect(
      check(`{"cohort":{"filename":"l.pulse"},"joins":[
        {"right":"ghost.pulse","kind":"outer","on":[]},
        {"right":"right.pulse","on":[{"left_field":"region","right_field":"user_id"},{"left_field":"nope","right_field":"bonus"},{"left_field":"id","right_field":"nah"}]}]}`),
    ).toEqual([
      ['joins[0].kind', 'JOIN_KIND', 'join kind outer is not implemented: the engine runs inner'],
      ['joins[0].right', 'JOIN_RIGHT', 'right cohort ghost.pulse is not a cohort file in the workspace'],
      ['joins[0].on', 'JOIN_KEYS', 'a join needs at least one on pair (left_field = right_field)'],
      ['joins[1]', 'JOIN_TOO_MANY', 'a request runs at most 1 join: pre-join into a cohort for more'],
      ['joins[1].on[0]', 'JOIN_TYPE', 'on[0] region = user_id: key types categorical_u8 and u64 do not compare'],
      ['joins[1].on[1].left_field', 'JOIN_FIELD', 'left_field nope is not a field of the left cohort'],
      ['joins[1].on[2].right_field', 'JOIN_FIELD', 'right_field nah is not a field of right.pulse'],
      ['joins[1].as', 'JOIN_COLLISION', 'joined fields collide with left fields (region, id): set as to prefix the right side'],
    ])
  })

  it('asks for a right cohort and checks compose slots', () => {
    expect(check('{"requests":[{"label":"a","cohort":{"filename":"l.pulse"},"joins":[{"right":"","kind":"inner","on":[{"left_field":"id"}]}]}]}', 'compose')).toEqual([
      ['requests[0].joins[0].right', 'JOIN_RIGHT', 'right is required: pick the cohort to join'],
      ['requests[0].joins[0].on[0].right_field', 'JOIN_FIELD', 'on[0] needs a right_field'],
    ])
  })
})

describe('compact join body', () => {
  const PAIRS = JOINED.replace(
    '"on":[{"left_field":"id","right_field":"user_id"}]',
    '"on":[{"left_field":"id","right_field":"user_id"},{"left_field":"region","right_field":"zone"},{"left_field":"amount"}]',
  )
  const join = node(graphOf(parseModel(PAIRS, 'request')), 'joins[0]')
  const body = joinBodyRows(join.data.rows)

  it('draws each on pair as one line keyed by its left_field, the append port as a plain row', () => {
    expect(body.map((b) => (b.kind === 'pair' ? `${b.left?.value ?? '?'}=${b.right?.value ?? '?'}` : b.row.key))).toEqual([
      'right',
      'as',
      'id=user_id',
      'region=zone',
      'amount=?',
      'on[3].left_field',
    ])
    const pair = body.find((b) => b.kind === 'pair' && b.index === 1)
    expect(pair).toMatchObject({ left: { key: 'on[1].left_field', ref: 'region', resolved: true }, right: { value: 'zone', invalid: true } })
    expect(body.find((b) => b.kind === 'pair' && b.index === 0)).toMatchObject({ right: { value: 'user_id' } })
    expect((body.find((b) => b.kind === 'pair' && b.index === 0) as { right: { invalid?: true } }).right.invalid).toBeUndefined()
  })

  it('summarises the joined fields with their prefix', () => {
    expect(joinedSummary(join.data.join!)).toBe('4 joined fields (r_…)')
    expect(joinedSummary({ as: '', state: 'known', fields: [{ name: 'x', type: 'u8', used: false }] })).toBe('1 joined field')
  })

  it('estimates the collapsed height: a line per pair and one summary line', () => {
    expect(joinBodyLines(join.data.rows, join.data.join!, false)).toBe(6 + 1)
    expect(joinBodyLines(join.data.rows, join.data.join!, true)).toBe(6 + 1 + 4)
    const { headerHeight, rowHeight, padding, previewHeight } = LAYOUT
    expect(estimateHeight(join)).toBe(headerHeight + 7 * rowHeight + padding + previewHeight)
  })
})

describe('shard-anchor right sides', () => {
  const ANCHORED = JOINED.replace('"right":"right.pulse"', '"right":"arch.pulse#s1.pulse"')
  const model = parseModel(ANCHORED, 'request')

  it('recognises archive.pulse#shard.pulse', () => {
    expect(isAnchor('arch.pulse#s1.pulse')).toBe(true)
    expect(isAnchor('data/arch.pulse#s1.pulse')).toBe(true)
    expect(isAnchor('right.pulse')).toBe(false)
    expect(isAnchor('#s1.pulse')).toBe(false)
    expect(isAnchor('arch.pulse#')).toBe(false)
  })

  it('an unreadable shard in an archive that exists is unknown, a missing archive is missing', () => {
    const ref = { filename: 'arch.pulse#s1.pulse', data_dir: '.' }
    expect(anchorUnreadable(ref, new Error('inspect_failed: pulse: inspect anchor: PULSE_SHARD_MISSING'))).toBe(true)
    expect(anchorUnreadable(ref, new Error('not_found: no such file'))).toBe(false)
    expect(anchorUnreadable({ filename: 'right.pulse', data_dir: '.' }, new Error('inspect_failed: bad'))).toBe(false)
  })

  it('an anchored right read like any other is joined normally', () => {
    const g = graphOf(model, { ...ctx, rightFields: (r) => (r === 'arch.pulse#s1.pulse' ? right : null) })
    expect(node(g, 'joins[0]').data.join).toMatchObject({ right: 'arch.pulse#s1.pulse', state: 'known' })
  })

  it('unknown fields: no field handles, no red, no missing-right issue', () => {
    const unknown = (r: string): RightSide => (r === 'arch.pulse#s1.pulse' ? 'unknown' : null)
    const g = graphOf(model, { ...ctx, rightFields: unknown })
    const join = node(g, 'joins[0]')
    expect(join.data.join).toMatchObject({ right: 'arch.pulse#s1.pulse', state: 'unknown' })
    expect(join.data.rows.some((r) => r.invalid)).toBe(false)
    // A joined name the request uses still reaches the join by its prefix.
    expect(node(g, 'aggregations[0]').data.rows.find((r) => r.key === 'field')).toMatchObject({ ref: 'r_bonus', resolved: true })
    const issues = joinIssues(model, { manifest, rightFields: unknown, leftFields: () => left })
    expect(issues.filter((i) => i.code === 'JOIN_RIGHT' || i.code === 'JOIN_FIELD')).toEqual([])
  })
})
