// focus decides which wires stand out: those of the hovered or selected
// node, of a hovered port row, or a hovered or selected wire. It is pure;
// RequestView keeps the focus in a small external store (FocusStore) fed
// by pointer events and selection, and FocusStyle renders the result as
// one generated stylesheet. Nothing here touches the controlled React
// Flow node or edge arrays, so a hover never rebuilds or re-renders them.

export type Focus = {
  hoverNode?: string
  // A port row (or the out handle) under the pointer: node id + handle id.
  hoverHandle?: { node: string; handle: string }
  hoverEdge?: string
  selectedNode?: string
  selectedEdge?: string
}

export type FocusEdge = {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
}

export type HandleRef = { node: string; handle: string }

export type Highlight = {
  // Wires drawn strong and raised; every other wire is dimmed.
  edges: Set<string>
  // Raised wires that must not catch the pointer (they were raised by
  // hovering a node or port, and their hit area would cover its handles).
  passive: Set<string>
  // Port rows (or handles) at the ends of the highlighted wires.
  rows: HandleRef[]
}

// highlightOf resolves a focus to the wires and rows it lights. Hover
// wins over selection; a focus touching no wire lights nothing (no dim).
export function highlightOf(f: Focus, edges: readonly FocusEdge[]): Highlight | null {
  let picked: FocusEdge[] = []
  let passive = false
  const rows: HandleRef[] = []
  const ends = (e: FocusEdge) => {
    if (e.sourceHandle) rows.push({ node: e.source, handle: e.sourceHandle })
    if (e.targetHandle) rows.push({ node: e.target, handle: e.targetHandle })
  }
  if (f.hoverHandle) {
    const { node, handle } = f.hoverHandle
    picked = edges.filter((e) => (e.source === node && e.sourceHandle === handle) || (e.target === node && e.targetHandle === handle))
    passive = true
  } else if (f.hoverNode !== undefined) {
    picked = edges.filter((e) => e.source === f.hoverNode || e.target === f.hoverNode)
    passive = true
  } else if (f.hoverEdge !== undefined || f.selectedEdge !== undefined || f.selectedNode !== undefined) {
    const ids = new Set([f.hoverEdge, f.selectedEdge].filter((x): x is string => x !== undefined))
    picked = edges.filter((e) => ids.has(e.id) || (f.selectedNode !== undefined && (e.source === f.selectedNode || e.target === f.selectedNode)))
  }
  if (picked.length === 0) return null
  picked.forEach(ends)
  const ids = new Set(picked.map((e) => e.id))
  const seen = new Set<string>()
  return {
    edges: ids,
    passive: passive ? ids : new Set(),
    rows: rows.filter((r) => {
      const k = `${r.node}\n${r.handle}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }),
  }
}

// cssString quotes a value for an attribute selector.
export function cssString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ') + '"'
}

// Edges sit in their own <svg> each (React Flow 12); raising one means
// lifting that svg above the node layer.
const RAISE = 1000

// focusCss renders a highlight as CSS scoped to the graph canvas
// (.graph-flow): strong accent stroke and raised svg for lit wires, the
// rest dimmed, and the rows at their ends marked.
export function focusCss(h: Highlight | null): string {
  if (h === null) return ''
  const edge = (id: string) => `.graph-flow .react-flow__edge[data-id=${cssString(id)}]`
  const ids = [...h.edges]
  const lit = ids.map(edge)
  const rules = [
    `.graph-flow .react-flow__edge { opacity: var(--wire-dim); }`,
    `${lit.join(',\n')} { opacity: 1; }`,
    `${lit.map((s) => `${s} .react-flow__edge-path`).join(',\n')} { stroke: var(--wire-focus); stroke-width: 2.25; }`,
    `${ids.map((id) => `.graph-flow .react-flow__edges > svg:has(> [data-id=${cssString(id)}])`).join(',\n')} { z-index: ${RAISE} !important; }`,
  ]
  if (h.passive.size > 0) {
    rules.push(`${[...h.passive].map(edge).join(',\n')} { pointer-events: none; }`)
  }
  if (h.rows.length > 0) {
    const node = (r: HandleRef) => `.graph-flow .react-flow__node[data-id=${cssString(r.node)}]`
    const handle = (r: HandleRef) => `.react-flow__handle[data-handleid=${cssString(r.handle)}]`
    rules.push(`${h.rows.map((r) => `${node(r)} .gnode-row:has(> ${handle(r)})`).join(',\n')} { background: var(--wire-focus-row); }`)
    rules.push(`${h.rows.map((r) => `${node(r)} ${handle(r)}`).join(',\n')} { background: var(--wire-focus); border-color: var(--wire-focus); }`)
  }
  return rules.join('\n')
}

// sameFocus compares two focus values field by field.
export function sameFocus(a: Focus, b: Focus): boolean {
  return (
    a.hoverNode === b.hoverNode &&
    a.hoverEdge === b.hoverEdge &&
    a.selectedNode === b.selectedNode &&
    a.selectedEdge === b.selectedEdge &&
    a.hoverHandle?.node === b.hoverHandle?.node &&
    a.hoverHandle?.handle === b.hoverHandle?.handle
  )
}

// FocusStore holds the focus outside React state: pointer moves update it
// without re-rendering the graph view.
export type FocusStore = {
  get(): Focus
  set(patch: Partial<Focus>): void
  subscribe(fn: () => void): () => void
}

export function createFocusStore(): FocusStore {
  let cur: Focus = {}
  const subs = new Set<() => void>()
  return {
    get: () => cur,
    set(patch) {
      const next = { ...cur, ...patch }
      if (sameFocus(cur, next)) return
      cur = next
      for (const fn of subs) fn()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

// hoverTarget reads what the pointer is over from the DOM: a port row's
// handle, a node, or a wire. Lanes count as nothing.
export function hoverTarget(el: Element | null): Pick<Focus, 'hoverNode' | 'hoverHandle' | 'hoverEdge'> {
  const none = { hoverNode: undefined, hoverHandle: undefined, hoverEdge: undefined }
  if (!el) return none
  const edgeEl = el.closest('.react-flow__edge')
  if (edgeEl) return { ...none, hoverEdge: edgeEl.getAttribute('data-id') ?? undefined }
  const nodeEl = el.closest('.react-flow__node')
  const node = nodeEl?.getAttribute('data-id')
  if (!nodeEl || node == null || nodeEl.classList.contains('react-flow__node-lane')) return none
  const direct = el.closest('.react-flow__handle')
  const row = el.closest('.gnode-row')
  const handleEl = direct ?? row?.querySelector(':scope > .react-flow__handle')
  const handle = handleEl?.getAttribute('data-handleid')
  if (handle) return { ...none, hoverHandle: { node, handle } }
  return { ...none, hoverNode: node }
}
