import { createContext } from 'react'

// JoinView is view state for join nodes: which ones show their joined
// fields expanded (collapsed by default). It is per open file and never
// written to the request JSON or the layout sidecar. It reaches the
// nodes by context, so the controlled React Flow node array is not
// rebuilt when a node is toggled.
export type JoinView = {
  expanded: ReadonlySet<string>
  toggle: (id: string) => void
}

export const JoinViewContext = createContext<JoinView | null>(null)
