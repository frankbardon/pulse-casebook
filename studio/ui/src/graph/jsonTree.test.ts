import { describe, expect, it } from 'vitest'
import { fromPlain, JsonSyntaxError, parseJson, stringifyJson, toPlain } from './jsonTree.ts'

describe('jsonTree', () => {
  it('keeps key order, duplicates and literal spellings', () => {
    const text = ' {"2":1, "1":[0.10, 1e3, -0, 12345678901234567890], "a\\u00e9":"\\u00e9\\/", "a\\u00e9":null, "t":true} '
    expect(stringifyJson(parseJson(text))).toBe(
      '{"2":1,"1":[0.10,1e3,-0,12345678901234567890],"a\\u00e9":"\\u00e9\\/","a\\u00e9":null,"t":true}',
    )
  })

  it('round-trips plain values', () => {
    const v = { b: [1, 'x', null, false, { c: 2.5 }], a: {} }
    expect(toPlain(fromPlain(v))).toEqual(v)
    expect(stringifyJson(fromPlain(v))).toBe(JSON.stringify(v))
  })

  it('does not let __proto__ keys reach the prototype', () => {
    const p = toPlain(parseJson('{"__proto__":{"x":1}}')) as Record<string, unknown>
    expect(Object.keys(p)).toEqual(['__proto__'])
    expect((p as { x?: unknown }).x).toBeUndefined()
  })

  it.each([
    ['', 0],
    ['{"a":1,}', 7],
    ['[1 2]', 3],
    ['01', 1],
    ['"a\nb"', 0],
    ['{"a":1} x', 8],
    ['nul', 0],
  ])('rejects %j at offset %i', (text, offset) => {
    try {
      parseJson(text)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(JsonSyntaxError)
      expect((e as JsonSyntaxError).offset).toBe(offset)
    }
  })
})
