import { describe, expect, it } from 'vitest'
import { MAX_ROWS, readRun } from './results.ts'

const env = (data: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ format_version: '1.1', data, errors: [], warnings: [], ...extra }, null, 2)

const testResult = (label: string, p: number, sig: boolean, more: Record<string, unknown> = {}) => ({
  label,
  type: 'TEST_WELCH',
  statistic: 2.5,
  p_value: p,
  alpha: 0.05,
  reject_null: sig,
  ...more,
})

describe('readRun', () => {
  it('plain request: tables and node headlines', () => {
    const doc = {
      cohort: { filename: 'c.pulse' },
      aggregations: [{ type: 'AGG_COUNT', field: 'user_id', label: 'users' }],
      tests: [
        { type: 'TEST_WELCH', field: 'revenue', split_by: 'arm', label: 'rev' },
        { type: 'TEST_WELCH', field: 'pages', split_by: 'arm', label: 'pages' },
      ],
      regressions: [{ type: 'REG_OLS', name: 'fit', target: 'y', predictors: ['x'] }],
    }
    const data = {
      data: [{ users: 40000 }],
      metadata: { total_rows: 40000, filtered_rows: 40000 },
      tests: [testResult('rev', 0.0012, true, { p_adjusted: 0.0036, significant_adjusted: true }), testResult('pages', 0.4, false, { p_adjusted: 0.4, significant_adjusted: false })],
      regressions: [{ name: 'fit', type: 'REG_OLS', coefficients: { '(intercept)': 1, x: 0.5 }, p_values: { '(intercept)': 0, x: 0.01 }, r2: 0.1234, n_obs: 40000 }],
    }
    const v = readRun('request', env(data), doc)
    expect(v.sections).toHaveLength(1)
    const s = v.sections[0]
    expect(s.summary).toBe('40,000 of 40,000 rows')
    expect(s.tables.map((t) => t.key)).toEqual(['data', 'tests', 'regressions', 'regression-0'])
    expect(s.tables[1].columns).toContain('p_adjusted')
    expect(s.tables[1].rows[0]).toContain('yes')
    expect(s.tables[3].rows).toEqual([
      ['(intercept)', '1', '0'],
      ['x', '0.5', '0.01'],
    ])
    expect(v.headlines.get('tests[0]')).toEqual({ text: 'padj 0.0036', tone: 'sig' })
    expect(v.headlines.get('tests[1]')).toEqual({ text: 'padj 0.4', tone: 'ns' })
    expect(v.headlines.get('regressions[0]')).toEqual({ text: 'R² 0.123' })
    expect(v.headlines.get('aggregations[0]')).toEqual({ text: '40,000' })
  })

  it('per-group tests summarize on one node', () => {
    const doc = { tests: [{ type: 'TEST_WELCH', label: 't', group_by: ['device'] }] }
    const data = { tests: [testResult('t', 0.01, true, { group_key: ['a'] }), testResult('t', 0.5, false, { group_key: ['b'] })] }
    const v = readRun('request', env(data), doc)
    expect(v.headlines.get('tests[0]')).toEqual({ text: '1/2 groups sig', tone: 'sig' })
    expect(v.sections[0].tables[0].columns).toContain('group')
  })

  it('compose: one section per slot, headlines under requests[i]', () => {
    const doc = {
      requests: [
        { label: 'guardrails', tests: [{ type: 'TEST_CHISQ', label: 'srm' }] },
        { tests: [{ type: 'TEST_WELCH' }] },
      ],
    }
    const data = { responses: [{ tests: [testResult('srm', 0.3, false)] }, { tests: [testResult('', 0.00001, true)] }], overlays: [{ name: 'lift' }] }
    const v = readRun('compose', env(data), doc)
    expect(v.sections.map((s) => s.title)).toEqual(['guardrails', 'slot 2', 'compose'])
    expect(v.sections[2].other[0].title).toBe('overlays')
    expect(v.headlines.get('requests[0].tests[0]')?.text).toBe('p 0.3')
    // Unlabelled test matched by position.
    expect(v.headlines.get('requests[1].tests[0]')).toEqual({ text: 'p <0.0001', tone: 'sig' })
  })

  it('chain: stages by name, headlines under stages[i].request', () => {
    const doc = { stages: [{ name: 'per_customer', request: { aggregations: [{ type: 'AGG_SUM', label: 'spend' }] } }, { name: 'bands', request: { aggregations: [{ type: 'AGG_COUNT', label: 'n' }] } }] }
    const rows = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ spend: i }))
    const data = { stages: [{ data: rows }, { data: [{ n: 7 }] }], final: { data: [{ n: 7 }] } }
    const v = readRun('chain', env(data), doc)
    expect(v.sections.map((s) => s.title)).toEqual(['per_customer', 'bands'])
    expect(v.sections[0].tables[0].rows).toHaveLength(MAX_ROWS)
    expect(v.sections[0].tables[0].note).toMatch(/showing 200 of 205/)
    expect(v.headlines.get('stages[0].request.aggregations[0]')?.text).toBe('205 rows')
    expect(v.headlines.get('stages[1].request.aggregations[0]')?.text).toBe('7')
  })

  it('facet: field table and a headline on the facet node', () => {
    const data = {
      fields: { arm: { kind: 'discrete', type_name: 'categorical_u8', null_count: 0, discrete: { distinct_count: 2, values: [{ value: 'a', count: 3 }, { value: 'b', count: 1 }] } } },
      total_records: 4,
      filtered_records: 4,
    }
    const v = readRun('facet', env(data), { fields: ['arm'] })
    expect(v.sections[0].tables[0].rows[0]).toEqual(['arm', 'categorical_u8', 'discrete', '0', '2', 'a 3, b 1'])
    expect(v.headlines.get('fields')?.text).toBe('1 field · 4 rows')
  })

  it('error envelope: errors listed, no sections', () => {
    const text = JSON.stringify({ format_version: '1.1', errors: [{ code: 'PULSE_X', message: 'bad' }], warnings: [] })
    const v = readRun('request', text, {})
    expect(v.errors).toEqual([{ code: 'PULSE_X', message: 'bad' }])
    expect(v.sections).toEqual([])
  })
})
