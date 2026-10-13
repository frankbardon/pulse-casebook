import { use, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import type { LaneRole } from './composeGraph.ts'
import { LaneActionsContext } from './laneActions.ts'
import { PREVIEW_SECTIONS, type ColumnKey, type CohortNode, type FacetNode, type JoinInfo, type OpNode, type ParamRow, type RawNode } from './requestGraph.ts'
import { joinBodyRows, joinedSummary, type JoinBodyRow } from './joins.ts'
import { JoinViewContext } from './joinView.ts'
import { FACET_PROPS } from './facetGraph.ts'
import { FacetResult } from './FacetPreview.tsx'
import { FIT_HANDLE } from './wiring.ts'
import { isVectorRole } from './ports.ts'
import { NodePreview } from './NodePreview.tsx'
import { NodeIssues } from './NodeIssues.tsx'
import { NodeRunHeadline } from './ResultsPanel.tsx'

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
        {data.join
          ? joinBodyRows(data.rows).map((b) => (b.kind === 'pair' ? <PairRow key={`on[${b.index}]`} pair={b} /> : <Row key={b.row.key} r={b.row} />))
          : data.rows.map((r) => <Row key={r.key} r={r} />)}
      </ul>
      {data.join && <JoinedFields id={data.path} join={data.join} />}
      {PREVIEW_SECTIONS.has(data.section) && <NodePreview id={data.path} label={data.name} />}
      {data.produces && <Handle type="source" position={Position.Right} id="out" title={`label ${data.name}`} />}
      {data.fit !== undefined && (
        <Handle type="source" position={Position.Bottom} id={FIT_HANDLE} className="fit-handle" title={`fit ${data.fit}: wire into a slot's fit input`} />
      )}
      <NodeIssues id={data.path} />
      <NodeRunHeadline id={data.path} />
    </div>
  )
}

// Row is one param row: a target handle (`in:<row key>`) on rows that
// reference a field and on input ports.
function Row({ r }: { r: ParamRow }) {
  return (
    <li
      className={
        'gnode-row' +
        ((r.ref !== undefined && !r.resolved) || r.invalid ? ' unresolved' : '') +
        (r.port ? ' port' : '') +
        (r.fit ? ' fit' : '')
      }
      data-row={r.key}
    >
      {(r.ref !== undefined || r.port) && <Handle type="target" position={Position.Left} id={`in:${r.key}`} title={r.accepts ?? r.key} />}
      <span className="k">{r.key}</span>
      <span className="v" title={r.value}>
        {r.port === 'append' ? '+ wire to add' : r.port === 'empty' ? (r.fit ? 'bind a fit' : isVectorRole(r.key) ? 'wire a vector' : 'wire a field') : r.value}
      </span>
    </li>
  )
}

// PairRow draws a join key pair on one line, `left_field = right_field`.
// The left_field is the pair's input (its handle and data-row); either
// side is drawn red when it is wrong: a left key no cohort field
// resolves, a right key the right cohort lacks.
function PairRow({ pair }: { pair: Extract<JoinBodyRow, { kind: 'pair' }> }) {
  const { left, right, index } = pair
  const leftBad = left !== undefined && left.ref !== undefined && !left.resolved
  const rightBad = !!right?.invalid
  const key = left?.key ?? right?.key ?? `on[${index}]`
  return (
    <li className={'gnode-row gnode-pair' + (leftBad || rightBad ? ' unresolved' : '')} data-row={key} data-pair={index}>
      {left?.ref !== undefined && <Handle type="target" position={Position.Left} id={`in:${left.key}`} title={left.accepts ?? left.key} />}
      <span className="v" title={`on[${index}]: left_field ${left?.value ?? '(none)'} = right_field ${right?.value ?? '(none)'}`}>
        <span className={'side' + (leftBad ? ' bad' : '') + (left === undefined ? ' none' : '')}>{left?.value ?? '?'}</span>
        <span className="eq"> = </span>
        <span className={'side' + (rightBad ? ' bad' : '') + (right === undefined ? ' none' : '')} data-side="right">
          {right?.value ?? '?'}
        </span>
      </span>
    </li>
  )
}

// JoinedFields lists the fields a join adds (the right cohort's,
// prefixed with `as`); each is a source handle (`field:<name>`) wired
// into downstream inputs the way cohort fields are. The list starts
// collapsed to a summary line (JoinViewContext keeps it expanded per
// node). Collapsed, every field's handle is still drawn, stacked on the
// summary line and not draggable, so wires from joined fields keep
// their source handle and land on the summary row; only the handles of
// fields in use show. A grab dot over the stacked handles starts a
// joined-field drag the only way a collapsed list can: pressing it
// expands the list, whose per-field handles are then draggable (a
// stacked handle cannot know which field the drag means).
function JoinedFields({ id, join }: { id: string; join: JoinInfo }) {
  const view = use(JoinViewContext)
  const expanded = view?.expanded.has(id) ?? false
  const updateInternals = useUpdateNodeInternals()
  const first = useRef(true)
  useEffect(() => {
    // The node's size and handle positions change: re-measure (React
    // Flow's resize observer does too; this also covers handle moves).
    if (first.current) {
      first.current = false
      return
    }
    updateInternals(id)
  }, [expanded, id, updateInternals])
  const note =
    join.state === 'missing'
      ? join.right === undefined
        ? 'pick a right cohort'
        : `${join.right} not found`
      : join.state === 'pending'
        ? 'reading right cohort…'
        : join.state === 'unknown'
          ? 'shard fields unknown'
          : undefined
  const canToggle = join.fields.length > 0 && view !== null
  return (
    <ul className="gnode-rows gnode-joined" data-testid="joined-fields" data-state={join.state} data-expanded={expanded}>
      <li className="gnode-row muted gnode-subhead" data-testid="joined-summary">
        {canToggle ? (
          <button
            type="button"
            className="gnode-toggle nodrag"
            data-testid="joined-toggle"
            aria-expanded={expanded}
            title={expanded ? 'Collapse joined fields' : 'Expand joined fields'}
            onClick={(e) => {
              e.stopPropagation()
              view.toggle(id)
            }}
          >
            {expanded ? '▾' : '▸'} <span className="k">{joinedSummary(join)}</span>
          </button>
        ) : (
          <span className="k">{join.fields.length > 0 ? joinedSummary(join) : 'joined fields'}</span>
        )}
        {note !== undefined && <span className="v">{note}</span>}
        {!expanded && canToggle && (
          <span
            className="joined-grab nodrag"
            data-testid="joined-grab"
            role="button"
            aria-label="Expand joined fields to drag one"
            title="Drag a joined field: expands the list"
            onPointerDown={(e) => {
              e.stopPropagation()
              view.toggle(id)
            }}
          />
        )}
        {!expanded &&
          join.fields.map((f) => (
            <Handle
              key={f.name}
              type="source"
              position={Position.Right}
              id={`field:${f.name}`}
              className={'stacked' + (f.used ? ' used' : '')}
              isConnectable={false}
              title={`${f.name} ${f.type}`.trim()}
            />
          ))}
      </li>
      {join.state === 'known' && join.fields.length === 0 && <li className="gnode-row muted">No fields</li>}
      {expanded &&
        join.fields.map((f) => (
          <li key={f.name} className={'gnode-row' + (f.used ? ' used' : '')} data-field={f.name}>
            <span className="k">{f.name}</span>
            <span className="v type">{f.type || '?'}</span>
            <Handle type="source" position={Position.Right} id={`field:${f.name}`} title={`${f.name} ${f.type}`.trim()} />
          </li>
        ))}
    </ul>
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

// FacetNodeView is a Facet root's output: the fields it summarizes (each
// a target handle wired from its cohort field), its settings, and the
// live facet result. Its issues include those on every facet setting.
export function FacetNodeView({ data }: NodeProps<FacetNode>) {
  const n = data.rows.filter((r) => r.key.startsWith('fields[')).length
  return (
    <div className="gnode op facet" data-path={data.path}>
      <header className="gnode-head">
        <span className="gnode-stage">Facet</span>
        <span className="gnode-op">FACET</span>
        <span className="gnode-name">
          {n} field{n === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="gnode-rows">
        {data.rows.map((r) => (
          <li key={r.key} className={'gnode-row' + (r.ref !== undefined && !r.resolved ? ' unresolved' : '')} data-row={r.key}>
            {r.ref !== undefined && <Handle type="target" position={Position.Left} id={`in:${r.key}`} isConnectable={false} title={r.key} />}
            <span className="k">{r.key}</span>
            <span className="v" title={r.value}>
              {r.value}
            </span>
          </li>
        ))}
      </ul>
      <NodePreview id={data.path} />
      <FacetResult id={data.path} />
      <NodeIssues id={data.path} also={FACET_PROPS} />
      <NodeRunHeadline id={data.path} />
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

export type LaneNodeData = {
  role: LaneRole
  title: string
  named: boolean
  save?: string
  // Lane's stage column titles, lane-relative x.
  columns: { key: ColumnKey; title: string; x: number }[]
  // Position in the drawing order (root lane: -1) and lane count.
  place: number
  count: number
  removable: boolean
  // Overrides the role label (a chain's root lane says "chain").
  roleLabel?: string
}

export type LaneNode = Node<LaneNodeData, 'lane'>

const ROLE_LABEL: Record<LaneRole, string> = { root: 'compose', slot: 'slot', fit: 'fit', stage: 'stage' }

// LaneNodeView is one compose or chain lane: a labeled band holding a
// slot's, fit's or chain stage's stage columns. The header renames (double-click the title),
// reorders and removes the lane; its badge carries lane-level issues.
export function LaneNodeView({ id, data }: NodeProps<LaneNode>) {
  const actions = use(LaneActionsContext)
  const [editing, setEditing] = useState<string | null>(null)
  const canEdit = data.role !== 'root' && actions !== null
  const commit = () => {
    if (editing !== null && editing.trim() !== data.title) actions?.rename(id, editing.trim())
    setEditing(null)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(null)
  }
  return (
    <div className={'lane lane-' + data.role} data-lane={id} data-testid="lane">
      <header className="lane-head nopan">
        <span className="lane-role">{data.roleLabel ?? ROLE_LABEL[data.role]}</span>
        {editing !== null ? (
          <input
            className="lane-title-input nodrag"
            aria-label="Lane name"
            data-testid="lane-title-input"
            value={editing}
            autoFocus
            onChange={(e) => setEditing(e.target.value)}
            onBlur={commit}
            onKeyDown={onKey}
          />
        ) : (
          <span
            className={'lane-title' + (data.named ? '' : ' muted')}
            data-testid="lane-title"
            title={canEdit ? 'Double-click to rename' : undefined}
            onDoubleClick={canEdit ? () => setEditing(data.named ? data.title : '') : undefined}
          >
            {data.title}
          </span>
        )}
        {data.save !== undefined && <span className="lane-save muted">save {data.save}</span>}
        {canEdit && (
          <span className="lane-tools nodrag">
            <button type="button" title="Move lane up" aria-label="Move lane up" data-testid="lane-up" disabled={data.place <= 0} onClick={() => actions.move(id, -1)}>
              ↑
            </button>
            <button
              type="button"
              title="Move lane down"
              aria-label="Move lane down"
              data-testid="lane-down"
              disabled={data.place >= data.count - 1}
              onClick={() => actions.move(id, 1)}
            >
              ↓
            </button>
            <button type="button" title="Remove lane" aria-label="Remove lane" data-testid="lane-remove" disabled={!data.removable} onClick={() => actions.remove(id)}>
              ×
            </button>
          </span>
        )}
      </header>
      {data.columns.map((c) => (
        <div key={c.key} className="lane-col-title" style={{ left: c.x }}>
          {c.title}
        </div>
      ))}
      <NodeIssues id={id} />
    </div>
  )
}
