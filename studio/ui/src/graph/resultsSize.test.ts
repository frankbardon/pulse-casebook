import { describe, expect, it } from 'vitest'
import {
  RESULTS_HEIGHT,
  RESULTS_HEIGHT_KEY,
  clampHeight,
  escapeRestores,
  heightBounds,
  readStoredHeight,
  stepHeight,
  writeStoredHeight,
} from './resultsSize.ts'

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

const throwing = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('denied')
  },
  removeItem: () => {
    throw new Error('denied')
  },
}

describe('heightBounds / clampHeight', () => {
  it('leaves a strip of graph above the panel', () => {
    expect(heightBounds(800)).toEqual({ min: 120, max: 680 })
  })
  it('never lets max fall under min in a cramped window', () => {
    expect(heightBounds(150)).toEqual({ min: 120, max: 120 })
    expect(heightBounds(0)).toEqual({ min: 120, max: 120 })
  })
  it('clamps and rounds', () => {
    const b = heightBounds(800)
    expect(clampHeight(50, b)).toBe(120)
    expect(clampHeight(5000, b)).toBe(680)
    expect(clampHeight(300.6, b)).toBe(301)
    expect(clampHeight(Number.NaN, b)).toBe(120)
  })
})

describe('stepHeight', () => {
  const b = heightBounds(800)
  it.each([
    ['ArrowUp', false, 300, 324],
    ['ArrowDown', false, 300, 276],
    ['ArrowUp', true, 300, 420],
    ['ArrowDown', true, 300, 180],
    ['ArrowUp', false, 670, 680],
    ['ArrowDown', true, 130, 120],
    ['Home', false, 300, 120],
    ['End', false, 300, 680],
  ])('%s (shift %s) from %d → %d', (key, shift, from, to) => {
    expect(stepHeight(from, key, shift, b)).toBe(to)
  })
  it('ignores other keys', () => {
    expect(stepHeight(300, 'ArrowLeft', false, b)).toBeNull()
    expect(stepHeight(300, 'Enter', false, b)).toBeNull()
  })
})

describe('stored height', () => {
  it('defaults when nothing, garbage, too small or storage throws', () => {
    expect(readStoredHeight(memStore())).toBe(RESULTS_HEIGHT.DEFAULT)
    expect(readStoredHeight(memStore({ [RESULTS_HEIGHT_KEY]: 'tall' }))).toBe(RESULTS_HEIGHT.DEFAULT)
    expect(readStoredHeight(memStore({ [RESULTS_HEIGHT_KEY]: '10' }))).toBe(RESULTS_HEIGHT.DEFAULT)
    expect(readStoredHeight(throwing)).toBe(RESULTS_HEIGHT.DEFAULT)
    expect(readStoredHeight(undefined)).toBe(RESULTS_HEIGHT.DEFAULT)
  })
  it('round-trips and clears on the default', () => {
    const s = memStore()
    writeStoredHeight(412, s)
    expect(s.m.get(RESULTS_HEIGHT_KEY)).toBe('412')
    expect(readStoredHeight(s)).toBe(412)
    writeStoredHeight(RESULTS_HEIGHT.DEFAULT, s)
    expect(s.m.has(RESULTS_HEIGHT_KEY)).toBe(false)
    expect(() => writeStoredHeight(300, throwing)).not.toThrow()
  })
})

describe('escapeRestores', () => {
  const ev = (key: string, target: object | null, defaultPrevented = false) => ({ key, defaultPrevented, target: target as EventTarget | null })
  it('restores on Esc outside fields', () => {
    expect(escapeRestores(ev('Escape', { tagName: 'BUTTON' }))).toBe(true)
    expect(escapeRestores(ev('Escape', null))).toBe(true)
  })
  it('leaves fields, handled keys and other keys alone', () => {
    expect(escapeRestores(ev('Escape', { tagName: 'INPUT' }))).toBe(false)
    expect(escapeRestores(ev('Escape', { tagName: 'textarea' }))).toBe(false)
    expect(escapeRestores(ev('Escape', { tagName: 'SELECT' }))).toBe(false)
    expect(escapeRestores(ev('Escape', { tagName: 'DIV', isContentEditable: true }))).toBe(false)
    expect(escapeRestores(ev('Escape', { tagName: 'BUTTON' }, true))).toBe(false)
    expect(escapeRestores(ev('Enter', { tagName: 'BUTTON' }))).toBe(false)
  })
})
