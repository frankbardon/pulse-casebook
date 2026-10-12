import { describe, expect, it } from 'vitest'
import { getIn, setIn, stringItems } from './jsonEdit.ts'
import { parseJson, stringifyJson } from './jsonTree.ts'

const v = (s: string) => parseJson(s)
const s = stringifyJson

describe('setIn', () => {
  it('replaces in place, keeping order, duplicates and spellings', () => {
    const doc = v('{"b":1.50,"a":{"x":1},"a":2,"\\u0063":[1e3]}')
    expect(s(setIn(doc, ['a', 'x'], v('2')))).toBe('{"b":1.50,"a":{"x":2},"a":2,"\\u0063":[1e3]}')
  })

  it('appends missing members and creates parents', () => {
    expect(s(setIn(v('{"type":"T"}'), ['params', 'k'], v('"z"')))).toBe('{"type":"T","params":{"k":"z"}}')
  })

  it('removes members and array items, dropping emptied objects', () => {
    expect(s(setIn(v('{"t":1,"params":{"k":1}}'), ['params', 'k'], undefined))).toBe('{"t":1}')
    expect(s(setIn(v('{"r":[1,2,3]}'), ['r', 1], undefined))).toBe('{"r":[1,3]}')
    expect(s(setIn(v('{"r":[1]}'), ['r', 1], v('2')))).toBe('{"r":[1,2]}')
    expect(s(setIn(v('{"t":1}'), ['missing', 'k'], undefined))).toBe('{"t":1}')
  })

  it('shares untouched subtrees', () => {
    const doc = v('{"a":{"x":1},"b":{"y":2}}')
    const out = setIn(doc, ['a', 'x'], v('3'))
    expect(getIn(out, ['b'])).toBe(getIn(doc, ['b']))
  })

  it('rejects paths through scalars', () => {
    expect(() => setIn(v('{"a":1}'), ['a', 'b'], v('1'))).toThrow()
  })
})

describe('stringItems', () => {
  it('reuses unchanged items so escapes survive', () => {
    const old = v('["caf\\u00e9","b"]')
    expect(s(stringItems(old, ['café', 'c']))).toBe('["caf\\u00e9","c"]')
  })
})
