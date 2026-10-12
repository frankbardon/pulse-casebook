import { describe, expect, it } from 'vitest'
import type { Catalog, Health } from './api.ts'
import { catalogStale } from './catalog.ts'

const health = (extra: Partial<Health> = {}): Health => ({
  status: 'ok',
  dir: 'x',
  preview_timeout_ms: 1,
  auto_preview_rows: 1,
  ...extra,
})
const catalog: Catalog = { pulse_version: 'v1', feature_set_digest: 'd1', manifest: {}, schema: {} }

describe('catalogStale', () => {
  it('is stale without a catalog', () => {
    expect(catalogStale(undefined, health())).toBe(true)
  })
  it('is fresh while version and digest match', () => {
    expect(catalogStale(catalog, health({ pulse_version: 'v1', feature_set_digest: 'd1' }))).toBe(false)
  })
  it('is stale on a changed digest or Pulse version', () => {
    expect(catalogStale(catalog, health({ pulse_version: 'v1', feature_set_digest: 'd2' }))).toBe(true)
    expect(catalogStale(catalog, health({ pulse_version: 'v2', feature_set_digest: 'd1' }))).toBe(true)
  })
  it('never goes stale on a health without engine info', () => {
    expect(catalogStale(catalog, health())).toBe(false)
  })
})
