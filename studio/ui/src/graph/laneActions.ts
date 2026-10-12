import { createContext } from 'react'

// LaneActions are the lane header's controls (compose lanes). They reach
// the lane nodes by context, like previews and validation, so the
// controlled React Flow node array never carries callbacks.
export type LaneActions = {
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  move: (id: string, delta: number) => void
}

export const LaneActionsContext = createContext<LaneActions | null>(null)
