// Per-viewer conveniences kept in localStorage: the last workspace and
// tab. Storage may be missing or throw (private windows): everything
// works without it.
const KEY = 'studio.library.v1'

export type Tab = 'analyses' | 'cohorts'

export type Prefs = { workspace?: string; tab?: Tab }

export function loadPrefs(): Prefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as unknown
    if (typeof v !== 'object' || v === null) return {}
    const p = v as Record<string, unknown>
    return {
      ...(typeof p.workspace === 'string' && { workspace: p.workspace }),
      ...((p.tab === 'analyses' || p.tab === 'cohorts') && { tab: p.tab }),
    }
  } catch {
    return {}
  }
}

export function savePrefs(p: Prefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...p }))
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

// pickWorkspace is the workspace to open: the remembered one if it
// still exists, else the library's default (first by slug), else none.
export function pickWorkspace(remembered: string | undefined, slugs: string[], fallback?: string): string | null {
  if (remembered && slugs.includes(remembered)) return remembered
  if (fallback && slugs.includes(fallback)) return fallback
  return slugs[0] ?? null
}
