import { afterEach, describe, expect, it, vi } from 'vitest'
import { isApiError, postPreview, PREVIEW_CLIENT } from './api.ts'

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

describe('postPreview', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the page client id and the request text verbatim', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ status: 'ok', verb: 'process', cost: 'cheap', probes: [], elapsed_ms: 0 })))
    vi.stubGlobal('fetch', fetchMock)
    const requestText = '{"cohort":{"filename":"c.pulse"},"x":1.50}'
    await postPreview({ path: 'r.json', nodes: ['filterers[0]'], requestText, force: true })
    const body = fetchMock.mock.calls[0]?.[1].body as string
    expect(PREVIEW_CLIENT).toMatch(/^[0-9a-z-]{16,}$/)
    expect(JSON.parse(body.replace(requestText, 'null'))).toEqual({ path: 'r.json', nodes: ['filterers[0]'], force: true, client: PREVIEW_CLIENT, request: null })
    expect(body).toContain(requestText)
  })
})
