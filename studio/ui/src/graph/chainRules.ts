// chainRules is the chain gate the manifest's `process_chain` capability
// describes: what a chain stage may run. Each stage's rows are merged
// across shards and fed to the next stage, so stages take mergeable
// aggregators and groupers, row-local attributes and streamable filters
// only, and no features, windows, tests, post-tests or regressions.
// Whole-chain overlays (`*_VS_STAGE`) belong on the chain root, not on a
// stage. The palette leaves disallowed operators out of chain stages and
// the client validation flags any already in the file. Pure.

import type { Manifest, ManifestOperator } from '../api.ts'
import { sectionInfo } from './requestGraph.ts'

// ProcessChain is the manifest's process_chain block (the parts read here).
export type ProcessChain = {
  mergeable_aggregators?: string[]
  mergeable_groupers?: string[]
  row_local_attributes?: string[]
  overlay_kinds?: string[]
}

// Sections a chain stage rejects outright (process_chain rejection_rules:
// "chain rejects windows, features, tier-1 row tests, tier-2 post tests,
// regressions").
export const CHAIN_REJECTED_SECTIONS: ReadonlySet<string> = new Set(['features', 'windows', 'tests', 'post_tests', 'regressions'])

// Fallback when the manifest carries no process_chain block (an older
// engine): the lists Pulse ships today.
const FALLBACK: Required<ProcessChain> = {
  mergeable_aggregators: [
    'AGG_AVERAGE',
    'AGG_COUNT',
    'AGG_DISTINCT_COUNT',
    'AGG_FREQUENCY',
    'AGG_MAX',
    'AGG_MIN',
    'AGG_MODE',
    'AGG_MODE_COUNT',
    'AGG_NULL_COUNT',
    'AGG_RANGE',
    'AGG_STDDEV',
    'AGG_SUM',
    'AGG_VARIANCE',
  ],
  mergeable_groupers: ['GROUP_CATEGORY', 'GROUP_RANGE'],
  row_local_attributes: ['ATTR_DATE_PART', 'ATTR_FORMULA'],
  overlay_kinds: ['OVERLAY_DELTA_VS_STAGE', 'OVERLAY_INDEX_VS_STAGE'],
}

export function processChain(manifest: Manifest | undefined): Required<ProcessChain> {
  const pc = (manifest?.process_chain ?? {}) as ProcessChain
  return {
    mergeable_aggregators: pc.mergeable_aggregators ?? FALLBACK.mergeable_aggregators,
    mergeable_groupers: pc.mergeable_groupers ?? FALLBACK.mergeable_groupers,
    row_local_attributes: pc.row_local_attributes ?? FALLBACK.row_local_attributes,
    overlay_kinds: pc.overlay_kinds ?? FALLBACK.overlay_kinds,
  }
}

// chainRefusal says why operator op of section cannot run in a chain
// stage (stage: its index, when known), or null when it can.
export function chainRefusal(manifest: Manifest | undefined, section: string, op: string, stage?: number): string | null {
  const title = sectionInfo(section)?.title.toLowerCase() ?? section
  if (CHAIN_REJECTED_SECTIONS.has(section)) return `a chain stage cannot run a ${title} (${op})`
  // Only the first stage reads a cohort, so only it may join.
  if (section === 'joins' && stage !== undefined && stage > 0) return 'only the first chain stage may join'
  // Matrices are computed over cohort rows: only the first stage has them.
  if (section === 'matrices' && stage !== undefined && stage > 0) return `only the first chain stage may carry matrices (${op})`
  const pc = processChain(manifest)
  const only = (list: string[], what: string) =>
    list.includes(op) ? null : `${op} is not ${what}: a chain stage takes ${list.join(', ')}`
  switch (section) {
    case 'aggregations':
      return only(pc.mergeable_aggregators, 'a mergeable aggregator')
    case 'groups':
      return only(pc.mergeable_groupers, 'a mergeable grouper')
    case 'attributes':
      return only(pc.row_local_attributes, 'a row-local attribute')
    case 'filterers': {
      const f = manifest?.components?.filterers?.find((o: ManifestOperator) => o.name === op) as (ManifestOperator & { streamable?: boolean }) | undefined
      return f?.streamable === false ? `${op} is not streamable: a chain stage takes streamable filters only` : null
    }
    case 'overlays':
      return pc.overlay_kinds.includes(op) ? `${op} is a whole-chain overlay: it goes on the chain, not on a stage` : null
  }
  return null
}
