// Snap to grid: node drags and drops land on the canvas grid. One unit
// is the spacing of the background dots; "half" also allows the points
// midway between dots. The choice is per viewer (localStorage).
export type SnapMode = 'off' | 'whole' | 'half'

export const SNAP_MODES: readonly SnapMode[] = ['off', 'whole', 'half']

// GRID_UNIT is one canvas unit in flow pixels: the background dot gap.
export const GRID_UNIT = 20

const SNAP_KEY = 'studio.snap'

export function readSnapMode(): SnapMode {
  try {
    const v = localStorage.getItem(SNAP_KEY)
    return v === 'whole' || v === 'half' ? v : 'off'
  } catch {
    return 'off'
  }
}

export function writeSnapMode(m: SnapMode): void {
  try {
    localStorage.setItem(SNAP_KEY, m)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

// snapStep is the grid step in flow pixels, or null when snapping is off.
export function snapStep(m: SnapMode): number | null {
  if (m === 'whole') return GRID_UNIT
  if (m === 'half') return GRID_UNIT / 2
  return null
}

// snapPoint rounds p to the nearest grid point of mode m.
export function snapPoint(p: { x: number; y: number }, m: SnapMode): { x: number; y: number } {
  const step = snapStep(m)
  if (step === null) return p
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }
}

export const SNAP_LABEL: Record<SnapMode, string> = { off: 'Off', whole: '1', half: '½' }

export const SNAP_TITLE: Record<SnapMode, string> = {
  off: 'Nodes move freely',
  whole: 'Snap nodes to the grid dots (1 unit)',
  half: 'Snap nodes to the grid dots and the points halfway between them (½ unit)',
}
