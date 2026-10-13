// The area (workspace slug or the global area) the components below a
// provider talk to: the Analyses view provides the open workspace, the
// Cohorts view the area of the selected cohort, schema or import.
import { createContext, useContext } from 'react'
import type { Area } from './api.ts'

export const AreaContext = createContext<Area | null>(null)

// useArea is the current area. Components that call workspace-scoped
// endpoints must be rendered under an AreaContext provider.
export function useArea(): Area {
  const a = useContext(AreaContext)
  if (a === null) throw new Error('useArea outside an AreaContext provider')
  return a
}
