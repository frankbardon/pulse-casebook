import { describe, expect, it } from 'vitest'
import type { ImportPredict, PredictColumn, SchemaMatch } from '../api.ts'
import { applyMatch, isSuperset, rankMatches } from './match.ts'
import { columnsFromPredict, DEFAULT_SETTINGS, optionsOf, overridesOf, schemaOf } from './schemaEdit.ts'

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

const near: SchemaMatch = {
  name: 'retail_orders',
  path: 'schemas/retail_orders.schema.json',
  score: 0.875,
  exact: false,
  suggest: true,
  diff: { added: ['tags'], missing: ['store'], retyped: [{ name: 'amount', saved: 'decimal128', input: 'f64' }] },
  merged: [
    { name: 'order_id', type: 'u32', description: 'Order', nullable: false },
    { name: 'region', type: 'categorical_u16', description: '', nullable: false },
    { name: 'amount', type: 'decimal128', description: '', nullable: true, precision: 12, scale: 2 },
    { name: 'tags', type: 'set_u8', description: '', nullable: false, new: true },
  ],
}

describe('applying a saved schema match', () => {
  it('takes saved types for matched columns and flags new ones', () => {
    const cols = applyMatch(columnsFromPredict(first), near)
    expect(cols.map((c) => [c.name, c.type, c.fromMatch])).toEqual([
      ['order_id', 'u32', 'matched'],
      ['region', 'categorical_u16', 'matched'],
      ['amount', 'decimal128', 'matched'],
      ['tags', 'set_u8', 'new'],
    ])
    expect(cols[0].description).toBe('Order')
    expect(cols[2]).toMatchObject({ precision: 12, scale: 2, nullable: true })
    // The merged types become overrides for the re-check.
    expect(overridesOf(cols)).toEqual({ order_id: 'u32', region: 'categorical_u16', amount: 'decimal128' })
    expect(schemaOf(cols)).toEqual(near.merged.map((f) => {
      const { new: _new, ...rest } = f
      void _new
      return rest
    }))
  })

  it('leaves columns the match does not list untouched', () => {
    const extra = columnsFromPredict(predict([...first.columns, col('note', 4, 'categorical_u32')]))
    const note = applyMatch(extra, near)[4]
    expect([note.type, note.fromMatch]).toEqual(['categorical_u32', undefined])
  })

  it('ranks: exact is auto-selected, suggestions are the other close ones', () => {
    const exact = { ...near, name: 'a', score: 1, exact: true }
    const far = { ...near, name: 'far', score: 0.5, suggest: false }
    expect(rankMatches([exact, near, far])).toEqual({ exact, suggestions: [near] })
    expect(rankMatches([far])).toEqual({ exact: undefined, suggestions: [] })
  })

  it('suggests a low-scoring superset (a schema saved with columns excluded) and can drop the extras', () => {
    const sup: SchemaMatch = {
      ...near,
      score: 0.5,
      suggest: false,
      diff: { added: ['tags', 'amount'], missing: [], retyped: [] },
      merged: [
        { name: 'order_id', type: 'u32', description: '', nullable: false },
        { name: 'region', type: 'categorical_u8', description: '', nullable: false },
        { name: 'amount', type: 'f64', description: '', nullable: true, new: true },
        { name: 'tags', type: 'set_u8', description: '', nullable: false, new: true },
      ],
    }
    expect(isSuperset(sup)).toBe(true)
    expect(isSuperset(near)).toBe(false)
    expect(rankMatches([sup]).suggestions).toEqual([sup])
    const cols = applyMatch(columnsFromPredict(first), sup, true)
    expect(cols.map((c) => [c.name, c.include, c.fromMatch])).toEqual([
      ['order_id', true, 'matched'],
      ['region', true, 'matched'],
      ['amount', false, 'new'],
      ['tags', false, 'new'],
    ])
    expect(schemaOf(cols).map((f) => f.name)).toEqual(['order_id', 'region'])
    expect(optionsOf(DEFAULT_SETTINGS, cols, 'import').ignore_extra).toBe(true)
  })
})

