// history: pure helpers for the history panel (HistoryPanel.tsx): a line
// diff between two texts, folded into hunks with context, and commit
// times for the list.

export type DiffOp = ' ' | '-' | '+'

// DiffLine is one line of a diff from text a to text b. aLine/bLine are
// 1-based line numbers in a and b (absent for added / removed lines).
export type DiffLine = { op: DiffOp; text: string; aLine?: number; bLine?: number }

// DiffRow is a diff line, or a fold standing for `count` unchanged lines.
export type DiffRow = DiffLine | { op: 'skip'; count: number }

// Above this many lines between the common prefix and suffix, the diff
// is not minimised: the middle is shown as removed then added.
const MAX_MIDDLE = 20_000

export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

// lineDiff is a minimal line diff (Myers) turning a into b.
export function lineDiff(a: string, b: string): DiffLine[] {
  const A = splitLines(a)
  const B = splitLines(b)
  let pre = 0
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++
  let suf = 0
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++
  const out: DiffLine[] = []
  for (let i = 0; i < pre; i++) out.push({ op: ' ', text: A[i]!, aLine: i + 1, bLine: i + 1 })
  const midA = A.slice(pre, A.length - suf)
  const midB = B.slice(pre, B.length - suf)
  for (const [op, i, j] of midA.length + midB.length > MAX_MIDDLE ? replaceAll(midA, midB) : myers(midA, midB)) {
    if (op === ' ') out.push({ op, text: midA[i]!, aLine: pre + i + 1, bLine: pre + j + 1 })
    else if (op === '-') out.push({ op, text: midA[i]!, aLine: pre + i + 1 })
    else out.push({ op, text: midB[j]!, bLine: pre + j + 1 })
  }
  for (let k = suf; k > 0; k--) {
    const i = A.length - k
    const j = B.length - k
    out.push({ op: ' ', text: A[i]!, aLine: i + 1, bLine: j + 1 })
  }
  return out
}

type Step = [op: DiffOp, i: number, j: number]

function replaceAll(a: string[], b: string[]): Step[] {
  return [...a.map((_, i): Step => ['-', i, 0]), ...b.map((_, j): Step => ['+', 0, j])]
}

// myers returns the edit script (in order) for a → b.
function myers(a: string[], b: string[]): Step[] {
  const n = a.length
  const m = b.length
  const max = n + m
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[off + k] = x
      if (x >= n && y >= m) break outer
    }
  }
  // Walk back through the saved frontiers.
  const steps: Step[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!
    const k = x - y
    const prevK = k === -d || (k !== d && vd[off + k - 1]! < vd[off + k + 1]!) ? k + 1 : k - 1
    const prevX = d === 0 ? 0 : vd[off + prevK]!
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      steps.push([' ', x, y])
    }
    if (d === 0) break
    if (x === prevX) steps.push(['+', x, prevY])
    else steps.push(['-', prevX, y])
    x = prevX
    y = prevY
  }
  return steps.reverse()
}

// foldDiff keeps `context` unchanged lines around each change and folds
// longer unchanged runs into skip rows. A diff with no changes folds to
// nothing.
export function foldDiff(lines: DiffLine[], context = 3): DiffRow[] {
  const keep = new Uint8Array(lines.length)
  lines.forEach((l, i) => {
    if (l.op === ' ') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = 1
  })
  const out: DiffRow[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ op: 'skip', count: skipped })
      skipped = 0
      out.push(l)
    } else skipped++
  })
  if (skipped && out.length) out.push({ op: 'skip', count: skipped })
  return out
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.op === '+') added++
    else if (l.op === '-') removed++
  }
  return { added, removed }
}

// commitTime renders an RFC 3339 time relative to now: "just now",
// "5 min ago", "3 h ago", "2 d ago", then the local date (YYYY-MM-DD).
export function commitTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
