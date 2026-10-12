export type Health = {
  status: string
  dir: string
  preview_timeout_ms: number
  auto_preview_rows: number
}

export type ApiError = { error: { code: string; message: string; details?: unknown } }

export function isApiError(v: unknown): v is ApiError {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false
  const e = (v as { error: unknown }).error
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal })
  const body: unknown = await res.json()
  if (!res.ok || isApiError(body)) {
    const msg = isApiError(body) ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}
