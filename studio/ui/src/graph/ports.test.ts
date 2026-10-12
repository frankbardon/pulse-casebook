import { describe, expect, it } from 'vitest'
import type { Manifest } from '../api.ts'
import { acceptedTypes, compatibleOperators, emitsType, fieldKind, refusal, slotFor, slotsFor } from './ports.ts'
import catalogText from './testdata/catalog.slim.json?raw'

const manifest = (JSON.parse(catalogText) as { manifest: Manifest }).manifest

describe('fieldKind', () => {
  it.each([
    ['u8', 'numeric'],
    ['f64', 'numeric'],
    ['decimal128', 'numeric'],
    ['categorical_u8', 'categorical'],
    ['date', 'date'],
    ['datetime', 'date'],
    ['packed_bool', 'bool'],
    ['set_u32', 'set'],
    ['mystery', undefined],
    ['', undefined],
  ])('%s -> %s', (type, kind) => {
    expect(fieldKind(type)).toBe(kind)
  })
})

describe('slotsFor', () => {
  it('maps test requires to entry keys', () => {
    expect(slotsFor(manifest, 'tests', 'TEST_WELCH').map((s) => s.key)).toEqual(['field', 'split_by'])
    expect(slotsFor(manifest, 'tests', 'TEST_CHISQ').map((s) => s.key)).toEqual(['rows', 'cols'])
    expect(slotsFor(manifest, 'tests', 'TEST_PEARSON_R').map((s) => s.key)).toEqual(['field', 'field2'])
    expect(slotsFor(manifest, 'post_tests', 'TEST_TUKEY_HSD').map((s) => s.key)).toEqual(['field', 'split_by'])
  })

  it('declares regression target and predictors, matrix fields', () => {
    expect(slotsFor(manifest, 'regressions', 'REG_OLS').map((s) => [s.key, s.list])).toEqual([
      ['target', false],
      ['predictors', true],
    ])
    expect(slotsFor(manifest, 'matrices', 'MAT_CORRELATION')).toMatchObject([{ key: 'fields', list: true }])
  })

  it('gives component sections one optional field input', () => {
    expect(slotsFor(manifest, 'aggregations', 'AGG_SUM')).toMatchObject([{ key: 'field', list: false, required: false }])
  })

  it('knows nothing of unknown operators beyond the generic field', () => {
    expect(slotsFor(manifest, 'tests', 'TEST_NOPE')).toEqual([])
    expect(slotsFor(undefined, 'tests', 'TEST_WELCH')).toEqual([])
    expect(slotsFor(undefined, 'aggregations', 'AGG_SUM')[0].accept.types).toBeUndefined()
  })
})

describe('slotFor', () => {
  it('finds list item slots by their list key', () => {
    expect(slotFor(manifest, 'regressions', 'REG_OLS', 'predictors[2]').key).toBe('predictors')
  })

  it('leaves nested and undeclared keys unchecked', () => {
    expect(slotFor(manifest, 'crosstab', 'CROSSTAB', 'rows[0].field').accept.kinds).toBeUndefined()
    expect(slotFor(manifest, 'tests', 'TEST_WELCH', 'weight').accept).toEqual({ what: 'any field' })
  })
})

describe('type compatibility', () => {
  const check = (section: string, op: string, key: string, type: string | undefined) =>
    refusal(slotFor(manifest, section, op, key).accept, type)

  it.each([
    // [section, op, key, type, refused?]
    ['tests', 'TEST_WELCH', 'field', 'f64', false],
    ['tests', 'TEST_WELCH', 'field', 'u16', false],
    ['tests', 'TEST_WELCH', 'field', 'categorical_u8', true],
    ['tests', 'TEST_WELCH', 'field', 'set_u8', true],
    ['tests', 'TEST_WELCH', 'split_by', 'categorical_u8', false],
    ['tests', 'TEST_WELCH', 'split_by', 'u8', false],
    ['tests', 'TEST_WELCH', 'split_by', 'packed_bool', false],
    ['tests', 'TEST_WELCH', 'split_by', 'f64', true],
    ['tests', 'TEST_WELCH', 'split_by', 'date', true],
    ['tests', 'TEST_PROP_Z', 'field', 'categorical_u8', false],
    ['tests', 'TEST_PROP_Z', 'field', 'f64', true],
    ['tests', 'TEST_CHISQ', 'rows', 'categorical_u8', false],
    ['tests', 'TEST_CHISQ', 'cols', 'f32', true],
    ['regressions', 'REG_OLS', 'target', 'f64', false],
    ['regressions', 'REG_OLS', 'target', 'categorical_u8', true],
    ['regressions', 'REG_OLS', 'predictors[0]', 'packed_bool', false],
    ['regressions', 'REG_OLS', 'predictors[1]', 'set_u8', true],
    ['matrices', 'MAT_CORRELATION', 'fields[0]', 'f32', false],
    ['matrices', 'MAT_CORRELATION', 'fields[0]', 'date', true],
    ['aggregations', 'AGG_SUM', 'field', 'f64', false],
    ['aggregations', 'AGG_SUM', 'field', 'categorical_u8', true],
    ['aggregations', 'AGG_COUNT', 'field', 'categorical_u8', false],
    ['filterers', 'FILTER_RANGE', 'field', 'categorical_u16', true],
    ['groups', 'GROUP_CATEGORY', 'field', 'categorical_u8', false],
    ['groups', 'GROUP_SET_VALUE', 'field', 'u8', true],
    ['attributes', 'ATTR_DATE_PART', 'field', 'date', false],
    ['attributes', 'ATTR_DATE_PART', 'field', 'f64', true],
    ['features', 'FEAT_ONE_HOT', 'field', 'categorical_u8', false],
    ['windows', 'WIN_LAG', 'field', 'categorical_u8', true],
  ])('%s %s.%s <- %s refused=%s', (section, op, key, type, refused) => {
    expect(check(section, op, key, type) !== null).toBe(refused)
  })

  it('never refuses an unknown type', () => {
    expect(check('tests', 'TEST_WELCH', 'field', undefined)).toBeNull()
    expect(check('tests', 'TEST_WELCH', 'field', 'mystery')).toBeNull()
  })

  it('says why a categorical field does not fit a numeric input', () => {
    expect(check('tests', 'TEST_WELCH', 'field', 'categorical_u8')).toBe('takes a numeric field, not categorical_u8')
  })
})

describe('manifest lookups', () => {
  it('falls back to cohort_types when an operator lists no accepts_types', () => {
    const m: Manifest = {
      components: { aggregators: [{ name: 'AGG_X' }] },
      cohort_types: [
        { name: 'f64', compatible_aggregators: ['AGG_X'] },
        { name: 'categorical_u8', compatible_aggregators: [] },
      ],
    }
    expect(acceptedTypes(m, 'aggregations', 'AGG_X')).toEqual(['f64'])
    expect(refusal(slotFor(m, 'aggregations', 'AGG_X', 'field').accept, 'categorical_u8')).not.toBeNull()
  })

  it('reads emits_type of producers', () => {
    expect(emitsType(manifest, 'attributes', 'ATTR_FORMULA')).toBe('f64')
    expect(emitsType(manifest, 'features', 'FEAT_BUCKETIZE')).toBe('u32')
    expect(emitsType(manifest, 'aggregations', 'AGG_SUM')).toBeUndefined()
  })

  it('lists operators compatible with a field type', () => {
    const names = (type?: string) => compatibleOperators(manifest, 'groups', type).map((o) => o.name)
    expect(names('set_u8')).toEqual(['GROUP_SET_PER_ELEMENT', 'GROUP_SET_VALUE'])
    expect(names('categorical_u8')).toContain('GROUP_CATEGORY')
    expect(names('categorical_u8')).not.toContain('GROUP_RANGE')
    expect(names(undefined).length).toBe(manifest.components!.groupers!.length)
    expect(compatibleOperators(manifest, 'tests', 'categorical_u8').map((o) => o.name)).toContain('TEST_CHISQ')
  })
})
