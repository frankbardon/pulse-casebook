import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPrefs, pickWorkspace, savePrefs } from './prefs.ts'

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('prefs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('remembers the workspace and tab, merging saves', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadPrefs()).toEqual({})
    savePrefs({ workspace: 'lab' })
    savePrefs({ tab: 'cohorts' })
    expect(loadPrefs()).toEqual({ workspace: 'lab', tab: 'cohorts' })
  })

  it('survives broken or throwing storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{nope', setItem: () => {} })
    expect(loadPrefs()).toEqual({})
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(loadPrefs()).toEqual({})
    expect(() => savePrefs({ tab: 'analyses' })).not.toThrow()
    vi.stubGlobal('localStorage', { getItem: () => '{"workspace": 3, "tab": "x"}', setItem: () => {} })
    expect(loadPrefs()).toEqual({})
  })

  it('picks the remembered workspace while it exists', () => {
    expect(pickWorkspace('sales', ['lab', 'sales'], 'lab')).toBe('sales')
    expect(pickWorkspace('gone', ['lab', 'sales'], 'lab')).toBe('lab')
    expect(pickWorkspace(undefined, ['lab'], undefined)).toBe('lab')
    expect(pickWorkspace('x', [], undefined)).toBeNull()
  })
})
