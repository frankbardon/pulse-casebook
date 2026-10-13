import { use } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { PreviewProbe } from '../api.ts'
import { frameOf } from './nodePath.ts'
import type { PreviewState } from './previews.ts'
import { fmtCount } from './previews.ts'
import type { ResponsePart, ResponseRow, ResultNode } from './requestGraph.ts'
import { partHeadline, partResults, PART_TITLES } from './responseParts.ts'
import { columnHandle, HEAD_HANDLE, partHandle, sectionHandle } from './resultGraph.ts'
import { ResultPreview } from './ResultPreview.tsx'
import { usePreview } from './usePreviews.ts'
import { RunContext } from './useRun.ts'

const TRIMMED = 'trimmed by return'

// ResultNodeView is a frame's view-only Response node: what the frame
// returns, part by part in Response order. The table first (its columns:
// group keys, aggregation labels, window labels, each wired from its
// producer, and a preview of the rows), then a row per test, regression,
// matrix, crosstab, post-test and overlay, each wired from its entry,
// with a headline once a preview or run has its result. A `return` block
// wires into the header; what it drops is struck through. Not request
// JSON: no inspector, never deleted.
export function ResultNodeView({ id, data }: NodeProps<ResultNode>) {
  const frame = frameOf(id)
  const empty = !data.table && data.parts.length === 0
  return (
    <div className="gnode result" data-path={data.path} data-testid="result-node">
      <header className="gnode-head">
        <Handle type="target" position={Position.Left} id={HEAD_HANDLE} isConnectable={false} className="response-head-handle" />
        <span className="gnode-stage">Response</span>
        {data.ret && (
          <span className="gnode-op" data-testid="response-return" title={data.trims ? 'the return block drops the struck-through parts' : 'the return block keeps every part listed here'}>
            {data.trims ? 'trimmed' : 'shaped'}
          </span>
        )}
      </header>
      <ul className="gnode-rows">
        {empty && (
          <li className="gnode-row muted">
            <span className="k">No output</span>
          </li>
        )}
        {data.table && <TableHeader from={data.previewFrom} trimmed={!!data.tableTrimmed} />}
        {data.table && data.rowLevel && (
          <li className="gnode-row muted" data-testid="result-row-level">
            <span className="k">Row-level output</span>
          </li>
        )}
        {data.table && data.columns.length === 0 && !data.rowLevel && (
          <li className="gnode-row muted">
            <span className="k">No columns</span>
          </li>
        )}
        {data.columns.map((c) => (
          <li
            key={c.kind + c.name}
            className={'gnode-row result-col kind-' + c.kind + (c.trimmed ? ' trimmed' : '')}
            data-col={c.name}
            data-kind={c.kind}
            {...(c.trimmed && { 'data-trimmed': true, title: TRIMMED })}
          >
            <Handle type="target" position={Position.Left} id={columnHandle(c.name)} isConnectable={false} title={`${c.name} (${c.kind})`} />
            <span className="k">{c.name}</span>
            <span className="v type">{c.kind === 'key' ? 'key' : c.kind === 'aggregation' ? 'agg' : 'window'}</span>
          </li>
        ))}
        {data.parts.map((p) => (
          <Part key={p.key} part={p} frame={frame} />
        ))}
      </ul>
      {data.table && <ResultPreview from={data.previewFrom} columns={data.columns.map((c) => c.name)} />}
    </div>
  )
}

// TableHeader heads the table: "Table · N rows" once the table's preview
// knows the count.
function TableHeader({ from, trimmed }: { from?: string; trimmed: boolean }) {
  const { state } = usePreview(from ?? '')
  const n = probeOf(state)?.table?.total_rows
  return (
    <li className={'gnode-row response-part' + (trimmed ? ' trimmed' : '')} data-part="data" data-testid="response-part" {...(trimmed && { 'data-trimmed': true, title: TRIMMED })}>
      <span className="k">
        {PART_TITLES.data}
        {n !== undefined && ` · ${fmtCount(n)} row${n === 1 ? '' : 's'}`}
      </span>
    </li>
  )
}

function Part({ part, frame }: { part: ResponsePart; frame: string }) {
  return (
    <>
      <li
        className={'gnode-row response-part' + (part.trimmed ? ' trimmed' : '')}
        data-part={part.key}
        data-testid="response-part"
        {...(part.trimmed && { 'data-trimmed': true, title: TRIMMED })}
      >
        <Handle type="target" position={Position.Left} id={sectionHandle(part.key)} isConnectable={false} />
        <span className="k">{part.title}</span>
        {part.rows.some((r) => r.adjusted) && (
          <span className="v response-adj" title="p-values adjusted by this request's multiplicity block">
            adj.
          </span>
        )}
      </li>
      {part.rows.map((r) => (
        <PartRow key={r.id} part={part} row={r} frame={frame} />
      ))}
    </>
  )
}

// PartRow is one entry's row: its label, where it fans out ("× 4
// groups"), whether its p is adjusted, and a headline from the entry's
// own preview (when it does not fan out: a probe carries one result) or
// else the latest run.
function PartRow({ part, row, frame }: { part: ResponsePart; row: ResponseRow; frame: string }) {
  const { state } = usePreview(row.source)
  const { state: groupState } = usePreview(row.fanout?.from ?? '')
  const run = use(RunContext)
  const buckets = row.fanout ? probeOf(groupState)?.table?.total_rows : undefined
  let headline: string | undefined
  const probe = probeOf(state)
  if (!row.fanout && probe?.result !== undefined && probe.result !== null) headline = partHeadline(part.key, [probe.result])
  if (headline === undefined) {
    const ran = run.response?.(frame)
    if (ran) headline = partHeadline(part.key, partResults(part.key, indexOf(row.id), ran.request, ran.response))
  }
  return (
    <li
      className={'gnode-row response-row' + (row.trimmed ? ' trimmed' : '')}
      data-testid="response-row"
      data-row={row.id}
      data-part={part.key}
      {...(row.trimmed && { 'data-trimmed': true })}
      title={row.trimmed ? TRIMMED : [row.label, row.detail].filter(Boolean).join(' · ')}
    >
      <Handle type="target" position={Position.Left} id={partHandle(row.id)} isConnectable={false} />
      <span className="k">{row.label}</span>
      <span className="v">
        {row.fanout && (
          <span className="response-fanout" data-testid="response-fanout">
            {buckets !== undefined ? `× ${fmtCount(buckets)} ${row.fanout.noun}` : `per ${row.fanout.noun.replace(/s$/, '')}`}
          </span>
        )}
        {row.adjusted && (
          <span className="response-adj" data-testid="response-adj">
            {' '}
            adj.
          </span>
        )}
        {headline !== undefined && (
          <span className="response-headline" data-testid="response-headline">
            {' '}
            {headline}
          </span>
        )}
        {!row.fanout && !row.adjusted && headline === undefined && row.detail && <span className="muted">{row.detail}</span>}
      </span>
    </li>
  )
}

function probeOf(state: PreviewState | undefined): PreviewProbe | undefined {
  return state?.status === 'ok' ? state.probe : state?.status === 'loading' ? state.last : undefined
}

function indexOf(rel: string): number {
  const m = /\[(\d+)\]$/.exec(rel)
  return m ? Number(m[1]) : 0
}
