// catalog keeps the engine catalog (/api/catalog: manifest + schema) in
// step with the running engine. The palette and the inspector forms are
// generated from it, so a Pulse bump or a changed feature set must reach
// them without a UI code change: the hook polls /api/health (cheap) and
// refetches the catalog whenever the health's pulse_version or
// feature_set_digest differs from the catalog it holds.

import { useEffect, useState } from 'react'
import { getCatalog, getJSON, type Catalog, type Health } from './api.ts'

// How often health is polled while the page is visible; focus and
// visibility changes poll at once.
export const CATALOG_POLL_MS = 20_000

// catalogStale says whether health reports a different engine than the
// catalog was built from. Without a catalog it is stale; a health without
// version info (no engine) never makes a catalog stale.
export function catalogStale(catalog: Catalog | undefined, health: Health): boolean {
  if (!catalog) return true
  if (health.feature_set_digest === undefined && health.pulse_version === undefined) return false
  return health.feature_set_digest !== catalog.feature_set_digest || health.pulse_version !== catalog.pulse_version
}

export type CatalogState = { health: Health | null; catalog?: Catalog; error: string | null }

// useCatalog loads health and the catalog and reloads the catalog on an
// engine change. A catalog failure is not surfaced: the graph renders
// without it.
export function useCatalog(): CatalogState {
  const [health, setHealth] = useState<Health | null>(null)
  const [catalog, setCatalog] = useState<Catalog | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    let current: Catalog | undefined
    let busy = false
    const poll = async () => {
      if (busy || ctl.signal.aborted) return
      busy = true
      try {
        const h = await getJSON<Health>('/api/health', ctl.signal)
        setHealth(h)
        setError(null)
        if (catalogStale(current, h)) {
          const c = await getCatalog(ctl.signal).catch(() => undefined)
          if (c && !ctl.signal.aborted) {
            current = c
            setCatalog(c)
          }
        }
      } catch (e) {
        if (!ctl.signal.aborted) setError(String(e))
      } finally {
        busy = false
      }
    }
    void poll()
    const onFocus = () => void poll()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll()
    }, CATALOG_POLL_MS)
    return () => {
      ctl.abort()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return { health, catalog, error }
}
