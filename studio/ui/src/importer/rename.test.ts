// PULSE-GAP(column-rename): delete with rename.ts.
import { describe, expect, it } from 'vitest'
import type { ImportPredict, PredictColumn, SchemaMatch } from '../api.ts'
import { applyMatch } from './match.ts'
import { checkName, nameIssues, parseSavedSchema, renameDiff, renameOf, setRename, suggestAll, suggestName } from './rename.ts'
import { columnsFromPredict, mergeRerun, optionsOf, overridesOf, schemaOf, setInclude, setType, type Settings } from './schemaEdit.ts'

function col(name: string, index: number, type: string | undefined, extra: Partial<PredictColumn> = {}): PredictColumn {
  return { name, index, included: type !== undefined, type, samples: [], warnings: [], ...extra }
}

function predict(columns: PredictColumn[], extra: Partial<ImportPredict> = {}): ImportPredict {
  return {
    source: 'sources/zillow.csv',
    format: 'csv',
    valid: true,
    header: columns.map((c) => c.name),
    rows: [],
    sample: { rows: 3, more: false, sample_rows: 500 },
    estimated_rows: 3,
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

const zillow = predict([col('Living Space (sq ft)', 0, 'u16'), col('List Price ($)', 1, 'f64'), col('City', 2, 'categorical_u8'), col('Tags', 3, 'set_u8')])

describe('suggestName', () => {
  it.each([
    ['Living Space (sq ft)', 'living_space_sq_ft'],
    ['List Price ($)', 'list_price'],
    ['2020 Sales', 'c_2020_sales'],
    ['  Order--ID ', 'order_id'],
    ['Café', 'café'],
    ['($)', ''],
  ])('%s → %s', (h, want) => expect(suggestName(h)).toBe(want))

  it('suggests unique names for included columns only', () => {
    let cols = columnsFromPredict(predict([col('A b', 0, 'u8'), col('a-b', 1, 'u8'), col('a_b', 2, 'u8'), col('($)', 3, 'u8')]))
    cols = setInclude(cols, 'a_b', false)
    expect(suggestAll(cols).map((c) => c.rename)).toEqual(['a_b_2', 'a_b_3', undefined, 'column'])
  })
})

describe('validation', () => {
  it('checks names like the server', () => {
    expect(checkName('ok')).toBeNull()
    expect(checkName('  ')?.reason).toBe('empty')
    expect(checkName('x ')?.reason).toBe('whitespace')
    expect(checkName('x'.repeat(70_000))?.reason).toBe('too_long')
  })

  it('flags duplicates after renaming, against renamed and unrenamed columns', () => {
    let cols = columnsFromPredict(zillow)
    cols = setRename(cols, 'List Price ($)', 'City')
    expect(nameIssues(cols).get('List Price ($)')?.reason).toBe('duplicate')
    cols = setRename(setRename(cols, 'List Price ($)', 'x'), 'Living Space (sq ft)', 'x')
    expect([...nameIssues(cols).keys()]).toEqual(['Living Space (sq ft)', 'List Price ($)'])
    cols = setRename(cols, 'City', '')
    expect(nameIssues(cols).get('City')?.reason).toBe('empty')
  })

  it("ignores an excluded column's rename, but not its source name", () => {
    let cols = setRename(columnsFromPredict(zillow), 'City', 'list_price')
    cols = setRename(cols, 'List Price ($)', 'list_price')
    cols = setInclude(cols, 'City', false)
    expect(nameIssues(cols).size).toBe(0)
    expect(renameOf(cols)).toEqual({ 'List Price ($)': 'list_price' })
    // Renaming onto an excluded column's source name collides.
    expect(nameIssues(setRename(cols, 'Tags', 'City')).get('Tags')?.reason).toBe('duplicate')
  })
})

describe('lowering: Pulse sees the new names, the editor keys by source', () => {
  const settings: Settings = { floatWidth: 'f64', sourceTz: '', setDelimiter: '|', groups: [{ key: ['City'], members: ['List Price ($)'] }] }

  it('names schema fields, overrides, delimiters and groups by the new name', () => {
    let cols = suggestAll(columnsFromPredict(zillow))
    cols = setType(cols, 'List Price ($)', 'f32')
    expect(schemaOf(cols).map((f) => f.name)).toEqual(['living_space_sq_ft', 'list_price', 'city', 'tags'])
    expect(overridesOf(cols)).toEqual({ list_price: 'f32' })
    expect(optionsOf(settings, cols, 'import')).toEqual({
      set_delimiters: { tags: '|' },
      groups: [{ key: ['city'], members: ['list_price'] }],
      rename: { 'Living Space (sq ft)': 'living_space_sq_ft', 'List Price ($)': 'list_price', City: 'city', Tags: 'tags' },
    })
  })

  it('writes no rename when nothing is renamed', () => {
    expect(optionsOf({ ...settings, groups: [] }, columnsFromPredict(zillow), 'import')).toEqual({ set_delimiters: { Tags: '|' } })
  })

  it('maps a renamed predict back to source columns', () => {
    const cols = setRename(columnsFromPredict(zillow), 'List Price ($)', 'list_price')
    const p = predict([col('Living Space (sq ft)', 0, 'u16'), col('list_price', 1, 'f32'), col('City', 2, 'categorical_u8'), col('Tags', 3, 'set_u8')], {
      options: { rename: { 'List Price ($)': 'list_price' } },
    })
    const merged = mergeRerun(cols, p)
    expect(merged[1]).toMatchObject({ name: 'List Price ($)', rename: 'list_price', type: 'f32' })
    expect(columnsFromPredict(p)[1]).toMatchObject({ name: 'List Price ($)', rename: 'list_price' })
  })

  it('applies a saved schema match with its renames', () => {
    const m: SchemaMatch = {
      name: 'zillow',
      path: 'schemas/zillow.schema.json',
      score: 1,
      exact: true,
      suggest: true,
      diff: { added: [], missing: [], retyped: [] },
      merged: zillow.columns.map((c) => ({ name: c.name, type: c.type!, nullable: false, description: '' })),
      rename: { 'List Price ($)': 'list_price' },
    }
    const cols = applyMatch(setRename(columnsFromPredict(zillow), 'City', 'town'), m)
    expect(cols.map((c) => c.rename)).toEqual([undefined, 'list_price', undefined, undefined])
  })
})

describe('saved schema files', () => {
  it('reads the array and the {fields, rename} object', () => {
    expect(parseSavedSchema('[{"name":"a","type":"u8","description":"","nullable":false}]')).toEqual({
      fields: [{ name: 'a', type: 'u8', description: '', nullable: false }],
    })
    expect(parseSavedSchema('{"fields":[],"rename":{"A":"a"}}')).toEqual({ fields: [], rename: { A: 'a' } })
  })

  it('diffs renames', () => {
    expect(renameDiff({ A: 'a' }, { A: 'a2', B: 'b' })).toEqual([
      { name: 'A', from: 'a', to: 'a2' },
      { name: 'B', from: 'B', to: 'b' },
    ])
    expect(renameDiff(undefined, undefined)).toEqual([])
  })
})
