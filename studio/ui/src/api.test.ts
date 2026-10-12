import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiCallError, isApiError, postPreview, postRun, PREVIEW_CLIENT, saveRun } from './api.ts'

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

describe('postRun / saveRun', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the in-memory request text verbatim with the client id', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ run_id: 'r1', root: 'request', text: '{}' })))
    vi.stubGlobal('fetch', fetchMock)
    const requestText = '{"cohort":{"filename":"c.pulse"},"x":1.50}'
    await postRun('req/a.json', requestText)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/run')
    const body = init.body as string
    expect(body).toContain(requestText)
    expect(JSON.parse(body.replace(requestText, 'null'))).toEqual({ path: 'req/a.json', client: PREVIEW_CLIENT, request: null })
  })

  it('surfaces the server error code (exists) for an overwrite refusal', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'exists', message: 'a file already exists', details: { path: 'out/a.json' } } }), { status: 409 }))
    const err = await saveRun('r1', 'a.json', false).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiCallError)
    expect((err as ApiCallError).code).toBe('exists')
    expect((err as ApiCallError).status).toBe(409)
  })
})
