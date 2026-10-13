import { describe, expect, it } from 'vitest'
import type { ImportPredict, PredictColumn } from '../api.ts'
import {
  columnsFromPredict,
  compactNudge,
  DEFAULT_SETTINGS,
  excludedCount,
  filterColumns,
  groupChips,
  isEmptyDiff,
  mergeRerun,
  nameFromSource,
  optionsOf,
  overridesOf,
  schemaDiff,
  schemaOf,
  setAllIncluded,
  setInclude,
  setNullable,
  setType,
  shortHint,
  typeGroups,
  typeHint,
  validName,
} from './schemaEdit.ts'

function col(name: string, index: number, type: string | undefined, extra: Partial<PredictColumn> = {}): PredictColumn {
  return { name, index, included: type !== undefined, type, samples: [], warnings: [], ...extra }
}

function predict(columns: PredictColumn[], extra: Partial<ImportPredict> = {}): ImportPredict {
  return {
    source: 'sources/orders.csv',
    format: 'csv',
    valid: true,
    header: columns.map((c) => c.name),
    rows: [],
    sample: { rows: 6, more: false, sample_rows: 500 },
    estimated_rows: 6,
    columns,
    schema: [],
    warnings: [],
    coded_warnings: [],
    matches: [],
    field_types: [],
    options: {},
    ...extra,
  }
}

const first = predict([
  col('order_id', 0, 'u16', { stats: { sampled: 6, nulls: 0, null_pct: 0, distinct: 6, min: 1, max: 6 } }),
  col('region', 1, 'categorical_u8'),
  col('amount', 2, 'f64', { nullable: true }),
  col('tags', 3, 'set_u8'),
])

describe('schema editing state', () => {
  it('starts with every column included, typed as inferred', () => {
    const cols = columnsFromPredict(first)
    expect(cols.map((c) => [c.name, c.type, c.inferred, c.include])).toEqual([
      ['order_id', 'u16', 'u16', true],
      ['region', 'categorical_u8', 'categorical_u8', true],
      ['amount', 'f64', 'f64', true],
      ['tags', 'set_u8', 'set_u8', true],
    ])
    expect(cols[2].nullable).toBe(true)
  })

  it('sends only changed types of included columns as overrides', () => {
    let cols = columnsFromPredict(first)
    expect(overridesOf(cols)).toEqual({})
    cols = setType(cols, 'order_id', 'u32')
    cols = setType(cols, 'amount', 'f32')
    cols = setInclude(cols, 'amount', false)
    expect(overridesOf(cols)).toEqual({ order_id: 'u32' })
    // Back to the inferred type: no override.
    expect(overridesOf(setType(cols, 'order_id', 'u16'))).toEqual({})
  })

  it('gives decimal128 a precision and scale, and drops them again', () => {
    let cols = setType(columnsFromPredict(first), 'amount', 'decimal128')
    expect(cols[2]).toMatchObject({ type: 'decimal128', precision: 18, scale: 2 })
    expect(schemaOf(cols)[2]).toEqual({ name: 'amount', type: 'decimal128', description: '', nullable: true, precision: 18, scale: 2 })
    cols = setType(cols, 'amount', 'f64')
    expect(cols[2].precision).toBeUndefined()
    expect(schemaOf(cols)[2]).toEqual({ name: 'amount', type: 'f64', description: '', nullable: true })
  })

  it('keeps include flags and user types across a re-run, and the user type on a refusal', () => {
    let cols = setInclude(columnsFromPredict(first), 'tags', false)
    cols = setType(cols, 'region', 'u8')
    cols = setNullable(cols, 'order_id', true)
    const refused = predict(
      [col('order_id', 0, undefined), col('region', 1, undefined, { warnings: ['cannot hold "north"'] }), col('amount', 2, undefined), col('tags', 3, undefined)],
      { valid: false, refusal: { code: 'PULSE_IMPORT_OVERRIDE_INVALID', message: 'no', column: 'region' } },
    )
    const merged = mergeRerun(cols, refused)
    expect(merged.map((c) => [c.name, c.type, c.include])).toEqual([
      ['order_id', 'u16', true],
      ['region', 'u8', true],
      ['amount', 'f64', true],
      ['tags', 'set_u8', false],
    ])
    expect(merged[1].warnings).toEqual(['cannot hold "north"'])
    expect(merged[0].nullable).toBe(true)
    // A valid re-run returns the forced type; inferred stays Pulse's.
    const ok = mergeRerun(cols, predict([col('order_id', 0, 'u16'), col('region', 1, 'u8'), col('amount', 2, 'f64', { nullable: true }), col('tags', 3, 'set_u8')]))
    expect(ok[1]).toMatchObject({ type: 'u8', inferred: 'categorical_u8' })
  })

  it('include all / none touches only the filtered columns', () => {
    const cols = columnsFromPredict(first)
    const none = setAllIncluded(cols, false, new Set(['region', 'amount']))
    expect(none.map((c) => c.include)).toEqual([true, false, false, true])
    expect(excludedCount(none)).toBe(2)
    expect(filterColumns(cols, 'CAT').map((c) => c.name)).toEqual(['region'])
    expect(filterColumns(cols, 'am f64').map((c) => c.name)).toEqual(['amount'])
  })
})

describe('include / exclude → schema + ignore_extra', () => {
  it('leaves excluded columns out of the schema and sets ignore_extra for the import', () => {
    const cols = setInclude(columnsFromPredict(first), 'region', false)
    expect(schemaOf(cols).map((f) => f.name)).toEqual(['order_id', 'amount', 'tags'])
    expect(optionsOf(DEFAULT_SETTINGS, cols, 'import')).toEqual({ ignore_extra: true })
    // Predict never sets it (the editor keeps the flags) but asks for groups.
    expect(optionsOf(DEFAULT_SETTINGS, cols, 'predict')).toEqual({ suggest_groups: true })
  })

  it('sets no ignore_extra when every column is included', () => {
    expect(optionsOf(DEFAULT_SETTINGS, columnsFromPredict(first), 'import')).toEqual({})
  })

  it('lowers settings: f32, timezone, groups and a delimiter for included set columns', () => {
    const cols = columnsFromPredict(first)
    const o = optionsOf(
      { sheet: 'Sheet2', floatWidth: 'f32', sourceTz: ' Europe/Paris ', setDelimiter: '|', groups: [{ key: ['order_id'], members: ['region'] }] },
      cols,
      'import',
    )
    expect(o).toEqual({
      sheet: 'Sheet2',
      float_width: 'f32',
      source_tz: 'Europe/Paris',
      set_delimiters: { tags: '|' },
      groups: [{ key: ['order_id'], members: ['region'] }],
    })
    expect(optionsOf({ ...DEFAULT_SETTINGS, setDelimiter: '|' }, setInclude(cols, 'tags', false), 'import').set_delimiters).toBeUndefined()
  })
})

describe('schemaDiff', () => {
  it('reports added, removed and changed fields, ignoring order', () => {
    const saved = [
      { name: 'a', type: 'u8', description: '', nullable: false },
      { name: 'b', type: 'f64', description: '', nullable: false },
      { name: 'c', type: 'date', description: '', nullable: false },
    ]
    const next = [
      { name: 'b', type: 'f64', description: '', nullable: true },
      { name: 'a', type: 'u8', description: '', nullable: false },
      { name: 'd', type: 'u16', description: '', nullable: false },
    ]
    expect(schemaDiff(saved, next)).toEqual({ added: ['d'], removed: ['c'], changed: [{ name: 'b', from: 'f64', to: 'f64, nullable' }] })
    expect(isEmptyDiff(schemaDiff(saved, [...saved].reverse()))).toBe(true)
  })
})

describe('helpers', () => {
  it('nudges toward the compact rung from sampled stats', () => {
    expect(compactNudge({ type: 'u32', stats: { sampled: 9, nulls: 0, null_pct: 0, distinct: 9, min: 0, max: 200 } })).toEqual({
      type: 'u8',
      reason: 'sampled max 200 fits u8',
    })
    expect(compactNudge({ type: 'u8', stats: { sampled: 9, nulls: 0, null_pct: 0, distinct: 9, min: 0, max: 200 } })).toBeNull()
    expect(compactNudge({ type: 'categorical_u32', stats: { sampled: 9, nulls: 0, null_pct: 0, distinct: 40 } })?.type).toBe('categorical_u8')
    expect(compactNudge({ type: 'categorical_u32', stats: { sampled: 9, nulls: 0, null_pct: 0, distinct: 40, distinct_capped: true } })).toBeNull()
  })

  it('offers only undeclared suggested groups as chips', () => {
    const cands = [
      { label: 'g1', key: ['k'], members: ['a', 'b'], declaration: 'k:a,b', suggested: true },
      { label: 'g2', key: [], members: ['c'], declaration: 'c', suggested: false },
    ]
    expect(groupChips(cands, []).map((c) => c.label)).toEqual(['g1'])
    expect(groupChips(cands, [{ key: ['k'], members: ['b', 'a'] }])).toEqual([])
  })

  it('derives and validates names', () => {
    expect(nameFromSource('sources/Retail Orders (2025).csv')).toBe('Retail_Orders_2025')
    expect(nameFromSource('sources/!!!.csv')).toBe('data')
    expect(validName('retail_orders')).toBe(true)
    expect(validName('_x')).toBe(false)
    expect(validName('a/b')).toBe(false)
    expect(typeHint('u8')).toContain('0-255')
    expect(shortHint('categorical_u8')).toBe('≤ 256 labels')
  })
})

describe('typeGroups', () => {
  it('groups type names by family, narrowest first', () => {
    const types = ['u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'u4', 'date', 'packed_bool', 'categorical_u8', 'decimal128', 'set_u8', 'set_u16', 'datetime', 'set_u128', 'weird']
    expect(typeGroups(types)).toEqual([
      { label: 'Whole numbers', types: ['u4', 'u8', 'u16', 'u32', 'u64'] },
      { label: 'Decimals', types: ['f32', 'f64', 'decimal128'] },
      { label: 'Text labels', types: ['categorical_u8'] },
      { label: 'Dates and times', types: ['date', 'datetime'] },
      { label: 'Yes / no', types: ['packed_bool'] },
      { label: 'Multi-select', types: ['set_u8', 'set_u16', 'set_u128'] },
      { label: 'Other', types: ['weird'] },
    ])
  })
})
