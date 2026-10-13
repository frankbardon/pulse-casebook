import { describe, expect, it, vi } from 'vitest'
import { RouteStore } from './wires.ts'

const r = (...xs: number[]) => ({ points: xs.map((x) => ({ x, y: 0 })) })

describe('RouteStore', () => {
  it('notifies only wires whose route changed, appeared or went away', () => {
    const s = new RouteStore()
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()
    s.subscribe('a', a)
    s.subscribe('b', b)
    const unsub = s.subscribe('c', c)
    s.replace(new Map([['a', r(0, 1)], ['b', r(0, 2)]]))
    expect([a.mock.calls.length, b.mock.calls.length, c.mock.calls.length]).toEqual([1, 1, 0])
    const kept = s.get('a')
    s.replace(new Map([['a', r(0, 1)], ['b', r(0, 3)]]))
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 2])
    // An unchanged route keeps its object (no re-render).
    expect(s.get('a')).toBe(kept)
    s.replace(new Map())
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([2, 3])
    expect(s.get('a')).toBeUndefined()
    unsub()
    s.replace(new Map([['c', r(1, 2)]]))
    expect(c).not.toHaveBeenCalled()
  })
})
