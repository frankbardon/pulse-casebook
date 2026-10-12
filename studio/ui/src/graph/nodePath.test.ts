import { describe, expect, it } from 'vitest'
import { childPath, formatPath, frameOf, getAtPath, isPathPrefix, parsePath, splitFrame, type PathSegment } from './nodePath.ts'

const cases: [PathSegment[], string][] = [
  [[], ''],
  [['cohort'], 'cohort'],
  [['tests', 2], 'tests[2]'],
  [['requests', 1, 'filterers', 0], 'requests[1].filterers[0]'],
  [['crosstab', 'rows', 0, 'field'], 'crosstab.rows[0].field'],
  [['odd key'], '["odd key"]'],
  [['a', 'b.c', 3], 'a["b.c"][3]'],
  [['0'], '["0"]'],
  [[0, 'x'], '[0].x'],
  [['q"uote'], '["q\\"uote"]'],
]

describe('node paths', () => {
  it.each(cases)('formats %j as %s', (segs, id) => {
    expect(formatPath(segs)).toBe(id)
  })

  it.each(cases)('parses %j back from its id', (segs, id) => {
    expect(parsePath(id)).toEqual(segs)
  })

  it.each(['.a', 'a..b', 'a[01]', 'a[-1]', 'a[x]', 'a b', '1a', 'a.["x y"]', 'a["ident"]', 'a["open', 'a]'])(
    'rejects malformed id %s',
    (id) => {
      expect(() => parsePath(id)).toThrow()
    },
  )

  it('rejects non-integer indices', () => {
    expect(() => formatPath(['a', 1.5])).toThrow()
    expect(() => formatPath(['a', -1])).toThrow()
  })

  it('appends children', () => {
    expect(childPath('requests[1]', 'filterers', 0)).toBe('requests[1].filterers[0]')
    expect(childPath('', 'tests', 2)).toBe('tests[2]')
  })

  it('compares prefixes segment-wise', () => {
    expect(isPathPrefix('requests[1]', 'requests[1].tests[0]')).toBe(true)
    expect(isPathPrefix('tests[1]', 'tests[1]')).toBe(true)
    expect(isPathPrefix('tests[1]', 'tests[10]')).toBe(false)
    expect(isPathPrefix('', 'tests[0]')).toBe(true)
  })

  it('resolves values in a document', () => {
    const doc = { tests: [{ label: 'a' }, { label: 'b' }], 'odd key': 1 }
    expect(getAtPath(doc, 'tests[1].label')).toBe('b')
    expect(getAtPath(doc, '["odd key"]')).toBe(1)
    expect(getAtPath(doc, 'tests[5]')).toBeUndefined()
    expect(getAtPath(doc, 'tests.label')).toBeUndefined()
    expect(getAtPath(doc, '')).toBe(doc)
  })
})

describe('splitFrame', () => {
  it('finds the request frame a node lives in', () => {
    expect(splitFrame('requests[1].tests[0]')).toEqual({ frame: 'requests[1]', rest: ['tests', 0] })
    expect(splitFrame('fits[0].request.regressions[0]')).toEqual({ frame: 'fits[0].request', rest: ['regressions', 0] })
    expect(splitFrame('stages[2].request.cohort')).toEqual({ frame: 'stages[2].request', rest: ['cohort'] })
    expect(splitFrame('tests[3]')).toEqual({ frame: '', rest: ['tests', 3] })
    expect(splitFrame('fits[0].name')).toEqual({ frame: '', rest: ['fits', 0, 'name'] })
    expect(frameOf('requests[0]')).toBe('requests[0]')
    expect(frameOf('(compose)')).toBe('')
  })
})
