import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID_UNIT, readSnapMode, snapPoint, snapStep, writeSnapMode } from './snap.ts'

describe('snap to grid', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('steps one dot gap for whole units, half of it for half units', () => {
    expect(snapStep('off')).toBeNull()
    expect(snapStep('whole')).toBe(GRID_UNIT)
    expect(snapStep('half')).toBe(GRID_UNIT / 2)
  })

  it('rounds a point to the nearest grid point', () => {
    expect(snapPoint({ x: 29, y: 31 }, 'whole')).toEqual({ x: 20, y: 40 })
    expect(snapPoint({ x: 29, y: 31 }, 'half')).toEqual({ x: 30, y: 30 })
    expect(snapPoint({ x: 29, y: 31 }, 'off')).toEqual({ x: 29, y: 31 })
    expect(snapPoint({ x: -14, y: -6 }, 'half')).toEqual({ x: -10, y: -10 })
  })

  it('remembers the mode, defaulting to off', () => {
    expect(readSnapMode()).toBe('off')
    writeSnapMode('half')
    expect(readSnapMode()).toBe('half')
    localStorage.setItem('studio.snap', 'bogus')
    expect(readSnapMode()).toBe('off')
  })
})
