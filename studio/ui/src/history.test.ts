import { describe, expect, it } from 'vitest'
import { commitTime, diffStats, foldDiff, lineDiff, splitLines, type DiffLine } from './history.ts'

const side = (d: DiffLine[], which: 'a' | 'b') => d.filter((l) => l.op === ' ' || l.op === (which === 'a' ? '-' : '+')).map((l) => l.text)

describe('splitLines', () => {
  it.each([
    ['', []],
    ['a', ['a']],
    ['a\n', ['a']],
    ['a\n\nb', ['a', '', 'b']],
  ])('%j', (text, want) => expect(splitLines(text)).toEqual(want))
})

describe('lineDiff', () => {
  it('marks a one-line change with numbers on both sides', () => {
    const d = lineDiff('{\n  "a": 1,\n  "b": 2\n}\n', '{\n  "a": 1,\n  "b": 3\n}\n')
    expect(d).toEqual([
      { op: ' ', text: '{', aLine: 1, bLine: 1 },
      { op: ' ', text: '  "a": 1,', aLine: 2, bLine: 2 },
      { op: '-', text: '  "b": 2', aLine: 3 },
      { op: '+', text: '  "b": 3', bLine: 3 },
      { op: ' ', text: '}', aLine: 4, bLine: 4 },
    ])
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 })
  })

  it('is minimal for insertions and deletions in the middle', () => {
    const d = lineDiff('a\nb\nc\nd\ne', 'a\nx\nb\nc\ne')
    expect(d.map((l) => l.op + l.text)).toEqual([' a', '+x', ' b', ' c', '-d', ' e'])
  })

  it('handles empty sides and identical texts', () => {
    expect(lineDiff('', 'a\nb').map((l) => l.op)).toEqual(['+', '+'])
    expect(lineDiff('a\nb', '').map((l) => l.op)).toEqual(['-', '-'])
    expect(lineDiff('', '')).toEqual([])
    expect(diffStats(lineDiff('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 })
  })

  it('always reconstructs both texts (random)', () => {
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let t = 0; t < 200; t++) {
      const a = Array.from({ length: rnd(12) }, () => 'abcd'[rnd(4)]!)
      const b = Array.from({ length: rnd(12) }, () => 'abcd'[rnd(4)]!)
      const d = lineDiff(a.join('\n'), b.join('\n'))
      expect(side(d, 'a')).toEqual(a)
      expect(side(d, 'b')).toEqual(b)
    }
  })
})

describe('foldDiff', () => {
  it('keeps context around changes and folds the rest', () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`)
    const b = [...a]
    b[10] = 'changed'
    const rows = foldDiff(lineDiff(a.join('\n'), b.join('\n')), 2)
    expect(rows.map((r) => (r.op === 'skip' ? `skip ${r.count}` : r.op + r.text))).toEqual([
      'skip 8',
      ' l8',
      ' l9',
      '-l10',
      '+changed',
      ' l11',
      ' l12',
      'skip 7',
    ])
  })

  it('folds an unchanged diff to nothing', () => {
    expect(foldDiff(lineDiff('a\nb', 'a\nb'))).toEqual([])
  })
})

describe('commitTime', () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  it.each([
    ['2026-10-12T11:59:30Z', 'just now'],
    ['2026-10-12T11:55:00Z', '5 min ago'],
    ['2026-10-12T09:00:00+00:00', '3 h ago'],
    ['2026-10-10T12:00:00Z', '2 d ago'],
    ['not a time', 'not a time'],
  ])('%s -> %s', (iso, want) => expect(commitTime(iso, now)).toBe(want))

  it('shows older commits as a date', () => {
    expect(commitTime('2026-01-02T12:00:00Z', now)).toMatch(/^2026-01-0[12]$/)
  })
})
