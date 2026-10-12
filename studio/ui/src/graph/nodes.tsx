import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PREVIEW_SECTIONS, type CohortNode, type OpNode, type RawNode } from './requestGraph.ts'
import { NodePreview } from './NodePreview.tsx'
import { NodeIssues } from './NodeIssues.tsx'

// OpNode renders one section entry: stage title, operator name, label and
// a compact param list. Rows that reference a field, and inputs the entry
// does not fill yet (ports), carry a target handle (`in:<row key>`);
// entries that produce a label carry an `out` handle. Wires are drawn
// between these handles (RequestView checks and applies them).
export function OpNodeView({ data }: NodeProps<OpNode>) {
  const unknown = data.opKnown === false
  return (
    <div className={'gnode op col-' + data.column} data-path={data.path}>
      <header className="gnode-head">
        <span className="gnode-stage">{data.title}</span>
        <span className={'gnode-op' + (unknown ? ' unknown' : '')} title={unknown ? 'Operator not in the engine manifest' : undefined}>
          {data.op}
        </span>
        {data.name !== undefined && <span className="gnode-name">{data.name}</span>}
      </header>
      <ul className="gnode-rows">
        {data.rows.map((r) => (
          <li
            key={r.key}
            className={'gnode-row' + (r.ref !== undefined && !r.resolved ? ' unresolved' : '') + (r.port ? ' port' : '')}
            data-row={r.key}
          >
            {(r.ref !== undefined || r.port) && (
              <Handle type="target" position={Position.Left} id={`in:${r.key}`} title={r.accepts ?? r.key} />
            )}
            <span className="k">{r.key}</span>
            <span className="v" title={r.value}>
              {r.port === 'append' ? '+ wire to add' : r.port === 'empty' ? 'wire a field' : r.value}
            </span>
          </li>
        ))}
      </ul>
      {PREVIEW_SECTIONS.has(data.section) && <NodePreview id={data.path} label={data.name} />}
      {data.produces && <Handle type="source" position={Position.Right} id="out" title={`label ${data.name}`} />}
      <NodeIssues id={data.path} />
    </div>
  )
}

// CohortNodeView lists the cohort's fields with their types; each field is
// a source handle (`field:<name>`).
export function CohortNodeView({ data }: NodeProps<CohortNode>) {
  return (
    <div className="gnode cohort" data-path={data.path}>
      <header className="gnode-head">
        <span className="gnode-stage">Cohort</span>
        <span className="gnode-op">{data.filename ?? '(no cohort)'}</span>
        {data.dataDir !== undefined && <span className="gnode-name">data_dir {data.dataDir}</span>}
      </header>
      <ul className="gnode-rows">
        {data.fields.length === 0 && <li className="gnode-row muted">No fields</li>}
        {data.fields.map((f) => (
          <li key={f.name} className={'gnode-row' + (f.used ? ' used' : '')}>
            <span className="k">{f.name}</span>
            <span className="v type">{f.type || '?'}</span>
            <Handle type="source" position={Position.Right} id={`field:${f.name}`} title={`${f.name} ${f.type}`.trim()} />
          </li>
        ))}
      </ul>
      <NodePreview id={data.path} />
      <NodeIssues id={data.path} />
    </div>
  )
}

// RawNodeView shows a section the builder does not model as read-only JSON.
export function RawNodeView({ data }: NodeProps<RawNode>) {
  return (
    <div className="gnode raw" data-path={data.path}>
      <header className="gnode-head">
        <span className="gnode-stage">Raw</span>
        <span className="gnode-op">{data.section}</span>
      </header>
      <pre className="gnode-json">{data.json}</pre>
      <NodeIssues id={data.path} />
    </div>
  )
}
