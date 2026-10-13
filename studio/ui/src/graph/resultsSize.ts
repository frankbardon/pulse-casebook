// Results panel sizing: the pure clamp, keyboard-step and storage helpers
// behind the panel's drag handle (ResultsPanel.tsx).

export const RESULTS_HEIGHT_KEY = 'studio.resultsHeight'

// DEFAULT is the panel's height until the viewer resizes it; MIN keeps
// the header and tabs visible; MIN_GRAPH is the strip of graph a resize
// always leaves above the panel.
export const RESULTS_HEIGHT = { DEFAULT: 260, MIN: 120, MIN_GRAPH: 120 } as const

// Keyboard steps on the handle; Shift takes the larger one.
export const RESULTS_STEP = { SMALL: 24, LARGE: 120 } as const

export type HeightBounds = { min: number; max: number }

// heightBounds is the allowed range for a panel sharing `available` px
// (graph area + panel) with the graph. A cramped window still allows MIN.
export function heightBounds(available: number): HeightBounds {
  const max = Math.floor(available - RESULTS_HEIGHT.MIN_GRAPH)
  return { min: RESULTS_HEIGHT.MIN, max: Math.max(RESULTS_HEIGHT.MIN, max) }
}

export function clampHeight(h: number, b: HeightBounds): number {
  if (!Number.isFinite(h)) return b.min
  return Math.round(Math.min(b.max, Math.max(b.min, h)))
}

// stepHeight is the height after a key on the handle, or null when the
// key does not resize. ArrowUp grows the panel (the handle moves up).
export function stepHeight(h: number, key: string, shift: boolean, b: HeightBounds): number | null {
  const step = shift ? RESULTS_STEP.LARGE : RESULTS_STEP.SMALL
  switch (key) {
    case 'ArrowUp':
      return clampHeight(h + step, b)
    case 'ArrowDown':
      return clampHeight(h - step, b)
    case 'Home':
      return b.min
    case 'End':
      return b.max
    default:
      return null
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStore(): Store | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

// readStoredHeight is the viewer's remembered height, or the default when
// none is stored, it is unreadable, or storage is unavailable.
export function readStoredHeight(store: Store | undefined = defaultStore()): number {
  try {
    const v = store?.getItem(RESULTS_HEIGHT_KEY)
    if (v == null) return RESULTS_HEIGHT.DEFAULT
    const n = Number(v)
    return Number.isFinite(n) && n >= RESULTS_HEIGHT.MIN ? Math.round(n) : RESULTS_HEIGHT.DEFAULT
  } catch {
    return RESULTS_HEIGHT.DEFAULT
  }
}

// writeStoredHeight remembers h; the default height clears the entry.
export function writeStoredHeight(h: number, store: Store | undefined = defaultStore()): void {
  try {
    if (h === RESULTS_HEIGHT.DEFAULT) store?.removeItem(RESULTS_HEIGHT_KEY)
    else store?.setItem(RESULTS_HEIGHT_KEY, String(Math.round(h)))
  } catch {
    // Storage unavailable: the height lasts for this page only.
  }
}

// escapeRestores reports whether Esc should restore a maximised panel:
// not while typing in a field or when something else handled the key.
export function escapeRestores(e: { key: string; defaultPrevented: boolean; target: EventTarget | null }): boolean {
  if (e.key !== 'Escape' || e.defaultPrevented) return false
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null
  if (!t) return true
  if (t.isContentEditable) return false
  const tag = (t.tagName ?? '').toUpperCase()
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT'
}
