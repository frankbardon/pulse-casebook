import { describe, expect, it } from 'vitest'
import type { ExportFormat } from '../api.ts'
import {
  changedOptions,
  defaultName,
  exportBody,
  filterFields,
  optionError,
  optionsFor,
  recall,
  remember,
  setAll,
  swapExtension,
  type Store,
} from './exportForm.ts'

const all = { fields: true, time_zone: true, labels: true }
const csv: ExportFormat = { id: 'csv', title: 'CSV', extension: '.csv', options: [], supports: all }
const spss: ExportFormat = {
  id: 'spss',
  title: 'SPSS',
  extension: '.sav',
  utc_only: true,
  supports: all,
  options: [
    { key: 'sanitize_names', title: 'Sanitize names', type: 'bool', default: false, help: '' },
    { key: 'charset', title: 'Charset', type: 'string', default: '', help: '' },
  ],
}
const transfer: ExportFormat = {
  id: 'transfer',
  title: 'Pulse transfer',
  extension: '.pulse.zst',
  supports: { fields: false, time_zone: false, labels: false },
  options: [{ key: 'level', title: 'Level', type: 'int', default: 3, help: '', min: 1, max: 22 }],
}
const fields = ['id', 'region', 'seen_at']

function memStore(): Store {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe('options', () => {
  it('defaults, merges remembered values of the right type, drops the rest', () => {
    expect(optionsFor(spss)).toEqual({ sanitize_names: false, charset: '' })
    expect(optionsFor(spss, { sanitize_names: true, charset: 7, gone: 1 })).toEqual({ sanitize_names: true, charset: '' })
  })
  it('sends only changed options', () => {
    expect(changedOptions(spss, { sanitize_names: true, charset: '' })).toEqual({ sanitize_names: true })
    expect(changedOptions(transfer, { level: 3 })).toEqual({})
  })
  it('checks int ranges', () => {
    const level = transfer.options[0]
    expect(optionError(level, 5)).toBeNull()
    expect(optionError(level, 0)).toBe('between 1 and 22')
    expect(optionError(level, 2.5)).toBe('a whole number')
    expect(optionError(level, Number.NaN)).toBe('a whole number')
  })
})

describe('exportBody', () => {
  const base = { options: {}, timeZone: '', labels: {}, name: '' }
  it('sends a strict field subset in cohort order, the zone and labels of checked fields', () => {
    const body = exportBody('data/people.pulse', fields, {
      ...base,
      format: csv,
      selected: new Set(['seen_at', 'region']),
      timeZone: ' Asia/Kolkata ',
      labels: { region: { table: 'regions', mode: 'augment' }, id: { table: 'ids', mode: 'replace' } },
      name: 'subset',
    })
    expect(body).toEqual({
      cohort: 'data/people.pulse',
      format: 'csv',
      fields: ['region', 'seen_at'],
      time_zone: 'Asia/Kolkata',
      labels: [{ field: 'region', table: 'regions', mode: 'augment' }],
      name: 'subset',
    })
  })
  it('omits fields when all are checked, and everything tabular for the transfer artifact', () => {
    expect(exportBody('p.pulse', fields, { ...base, format: csv, selected: new Set(fields) })).toEqual({ cohort: 'p.pulse', format: 'csv' })
    const t = exportBody('p.pulse', fields, { ...base, format: transfer, options: { level: 9 }, selected: new Set(['id']), timeZone: 'UTC' })
    expect(t).toEqual({ cohort: 'p.pulse', format: 'transfer', options: { level: 9 } })
  })
})

describe('fields and names', () => {
  it('filters and toggles the shown fields only', () => {
    expect(filterFields(fields, 'RE')).toEqual(['region'])
    expect([...setAll(new Set(fields), ['id', 'region'], false)]).toEqual(['seen_at'])
    expect([...setAll(new Set(), ['id'], true)]).toEqual(['id'])
  })
  it('derives and swaps names', () => {
    expect(defaultName('data/ab_test.pulse', spss)).toBe('ab_test.sav')
    expect(swapExtension('ab_test.sav', spss, transfer)).toBe('ab_test.pulse.zst')
    expect(swapExtension('mine', spss, csv)).toBe('mine')
  })
})

describe('memory', () => {
  it('remembers format and options per cohort, keeping other formats', () => {
    const store = memStore()
    expect(recall('a.pulse', store)).toBeNull()
    remember('a.pulse', 'spss', { sanitize_names: true }, '', store)
    remember('a.pulse', 'transfer', { level: 9 }, '', store)
    expect(recall('a.pulse', store)).toEqual({ format: 'transfer', options: { spss: { sanitize_names: true }, transfer: { level: 9 } }, timeZone: '' })
    expect(recall('b.pulse', store)).toBeNull()
  })
  it('survives broken or missing storage', () => {
    const broken: Store = {
      getItem: () => '{nope',
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(recall('a.pulse', broken)).toBeNull()
    expect(() => remember('a.pulse', 'csv', {}, '', broken)).not.toThrow()
    expect(recall('a.pulse', undefined)).toBeNull()
  })
})
