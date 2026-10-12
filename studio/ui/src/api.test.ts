import { describe, expect, it } from 'vitest'
import { isApiError } from './api.ts'

describe('isApiError', () => {
  it.each([
    [{ error: { code: 'not_found', message: 'no' } }, true],
    [{ error: { code: 'x' } }, false],
    [{ error: null }, false],
    [{ status: 'ok' }, false],
    [null, false],
    ['error', false],
  ])('%j -> %s', (input, want) => {
    expect(isApiError(input)).toBe(want)
  })
})
