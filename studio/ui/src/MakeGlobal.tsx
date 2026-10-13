import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiCallError, promote, type PromoteBody, type PromoteChange, type PromotePlan, type PromoteResult } from './api.ts'

type Props = {
  kind: 'cohort' | 'schema'
  workspace: string
  workspaceName: string
  // The cohort's workspace path ("cohorts/x.pulse") or the schema's name.
  name: string
  onDone: (r: PromoteResult) => void
  onClose: () => void
}

type Clash = { field: 'new_name' | 'schema_name'; name: string; existing?: string }

type State =
  | { phase: 'planning' }
  | { phase: 'plan'; plan: PromotePlan; changed?: boolean }
  | { phase: 'clash'; clash: Clash }
  | { phase: 'applying'; plan: PromotePlan }
  | { phase: 'error'; message: string; plan?: PromotePlan }

const MOVE_KINDS: Record<string, string> = {
  cohort: 'Cohort',
  cohort_sidecar: 'Cohort sidecars',
  import: 'Import spec',
  source: 'Source file',
  schema: 'Saved schema',
}

// MakeGlobal moves a workspace's local cohort (with its import spec,
// source and local schema) or schema into the global area, after a dry
// run that lists every move and every analysis whose reference is
// rewritten. A name taken in the global area asks for another name
// (prefilled with the server's suggestion). There is no way back.
export function MakeGlobal({ kind, workspace, workspaceName, name, onDone, onClose }: Props) {
  const [st, setSt] = useState<State>({ phase: 'planning' })
  // Names for the global copies ("" = keep the local name).
  const [newName, setNewName] = useState('')
  const [schemaName, setSchemaName] = useState('')

  const body = useCallback(
    (extra: Partial<PromoteBody>): PromoteBody => ({
      workspace,
      kind,
      name,
      ...(newName.trim() !== '' && { new_name: newName.trim() }),
      ...(schemaName.trim() !== '' && { schema_name: schemaName.trim() }),
      ...extra,
    }),
    [workspace, kind, name, newName, schemaName],
  )

  const failed = useCallback(
    (e: unknown, plan?: PromotePlan) => {
      if (e instanceof ApiCallError && e.code === 'name_clash') {
        const d = (e.details ?? {}) as { field?: string; suggested?: string; name?: string; existing?: string }
        const field = d.field === 'schema_name' ? 'schema_name' : 'new_name'
        if (field === 'schema_name') setSchemaName(d.suggested ?? '')
        else setNewName(d.suggested ?? '')
        setSt({ phase: 'clash', clash: { field, name: d.name ?? '', existing: d.existing } })
        return
      }
      if (e instanceof ApiCallError && e.code === 'plan_changed') {
        const p = (e.details as { plan?: PromotePlan } | undefined)?.plan
        if (p) return setSt({ phase: 'plan', plan: p, changed: true })
      }
      setSt({ phase: 'error', message: e instanceof Error ? e.message : String(e), plan })
    },
    [],
  )

  const plan = useCallback(() => {
    setSt({ phase: 'planning' })
    promote(body({ dry_run: true }))
      .then((p) => setSt({ phase: 'plan', plan: p as PromotePlan }))
      .catch((e: unknown) => failed(e))
  }, [body, failed])

  // The first dry run, once (later ones come from Check again).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    promote({ workspace, kind, name, dry_run: true })
      .then((p) => setSt({ phase: 'plan', plan: p as PromotePlan }))
      .catch((e: unknown) => failed(e))
  }, [workspace, kind, name, failed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && st.phase !== 'applying') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, st.phase])

  const apply = (p: PromotePlan) => {
    setSt({ phase: 'applying', plan: p })
    promote(body({ plan_id: p.plan_id }))
      .then((r) => onDone(r as PromoteResult))
      .catch((e: unknown) => failed(e, p))
  }

  const shown = st.phase === 'plan' || st.phase === 'applying' ? st.plan : st.phase === 'error' ? st.plan : undefined
  const label = kind === 'cohort' ? 'cohort' : 'schema'
  return (
    <div className="export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && st.phase !== 'applying' && onClose()}>
      <section className="export-dialog mg-dialog" role="dialog" aria-modal="true" aria-label="Make global" data-testid="make-global-dialog" data-phase={st.phase}>
        <header className="export-head">
          <h2>
            Make {label} <span className="mono">{name}</span> global
          </h2>
          <button type="button" className="export-close" aria-label="Close" onClick={onClose} disabled={st.phase === 'applying'} data-testid="make-global-cancel">
            ×
          </button>
        </header>
        <div className="mg-body">
          <p>
            Moves it from workspace <strong>{workspaceName}</strong> into the global area, where every workspace can use it. This cannot be
            undone: global items are never moved back into a workspace.
          </p>
          {st.phase === 'planning' && <p className="muted">Checking what moves…</p>}
          {st.phase === 'clash' && (
            <div className="notice warn" data-testid="make-global-clash" data-field={st.clash.field}>
              <p>
                <strong>
                  The global area already has {st.clash.field === 'schema_name' ? 'a schema' : `a ${label}`} named <code>{st.clash.name}</code>
                </strong>
                {st.clash.existing && (
                  <>
                    {' '}
                    (<span className="mono">{st.clash.existing}</span>)
                  </>
                )}
                . Choose another name for the global copy:
              </p>
              <NameField
                field={st.clash.field}
                value={st.clash.field === 'schema_name' ? schemaName : newName}
                onChange={st.clash.field === 'schema_name' ? setSchemaName : setNewName}
              />
              <div className="mg-actions">
                <button type="button" className="primary" onClick={plan} data-testid="make-global-recheck">
                  Check again
                </button>
              </div>
            </div>
          )}
          {shown && <PlanView plan={shown} changed={st.phase === 'plan' && st.changed} />}
          {st.phase === 'error' && (
            <p className="err" data-testid="make-global-error">
              {st.message}
            </p>
          )}
        </div>
        <footer className="mg-actions mg-foot">
          <button type="button" onClick={onClose} disabled={st.phase === 'applying'}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={st.phase !== 'plan'}
            onClick={() => st.phase === 'plan' && apply(st.plan)}
            data-testid="make-global-apply"
          >
            {st.phase === 'applying' ? 'Moving…' : 'Make global'}
          </button>
        </footer>
      </section>
    </div>
  )
}

// distinctChanges folds repeated identical changes (a composed analysis
// rewrites the same reference once per slot) into one line with a count.
function distinctChanges(changes: PromoteChange[]): [PromoteChange, number][] {
  const out = new Map<string, [PromoteChange, number]>()
  for (const c of changes) {
    const k = `${c.field}\u0000${c.old}\u0000${c.new}`
    const e = out.get(k)
    if (e) e[1]++
    else out.set(k, [c, 1])
  }
  return [...out.values()]
}

function NameField({ field, value, onChange }: { field: 'new_name' | 'schema_name'; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mg-name">
      {field === 'schema_name' ? 'Global schema name' : 'Global name'}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={field === 'schema_name' ? 'make-global-schema-name' : 'make-global-name'}
        autoFocus
      />
    </label>
  )
}

// PlanView lists a promotion's dry run: where the item goes, every move
// (grouped by kind), the analyses and specs whose references are
// rewritten, and warnings.
function PlanView({ plan, changed }: { plan: PromotePlan; changed?: boolean }) {
  const groups = new Map<string, PromotePlan['moves']>()
  for (const m of plan.moves) groups.set(m.kind, [...(groups.get(m.kind) ?? []), m])
  return (
    <div className="mg-plan" data-testid="make-global-plan">
      {changed && <p className="notice warn">The files changed since the last check; this is the plan now.</p>}
      <p>
        <span className="mono">{plan.item.path}</span> → global <span className="mono">{plan.item.global_path}</span>
        {plan.item.global_name !== plan.item.name && (
          <>
            {' '}
            (renamed <strong data-testid="make-global-new-name">{plan.item.global_name}</strong>)
          </>
        )}
        {plan.schema && (
          <>
            , with its schema <span className="mono">{plan.schema.global_path}</span>
          </>
        )}
      </p>
      <h3>
        Moves <span className="count">{plan.moves.length}</span>
      </h3>
      <ul className="mg-list" data-testid="make-global-moves">
        {[...groups.entries()].map(([k, list]) => (
          <li key={k} data-kind={k}>
            <strong>{MOVE_KINDS[k] ?? k}</strong>
            <ul>
              {list.map((m) => (
                <li key={m.from} className="mono">
                  {m.from} → {m.to}
                  {m.action === 'merge' && <span className="tag">identical global copy kept</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <h3>
        Rewritten references <span className="count">{plan.counts.analyses} analyses</span>
      </h3>
      {plan.rewrites.length === 0 ? (
        <p className="muted">No analysis or import spec refers to it.</p>
      ) : (
        <ul className="mg-list" data-testid="make-global-rewrites">
          {plan.rewrites.map((r) => (
            <li key={r.path} data-path={r.path}>
              <span className="mono">{r.path}</span>
              <ul>
                {distinctChanges(r.changes).map(([c, n]) => (
                  <li key={c.pointer} className="mono muted">
                    {c.old} → {c.new}
                    {n > 1 && ` (×${n})`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {plan.warnings.length > 0 && (
        <div className="notice warn" data-testid="make-global-warnings">
          {plan.warnings.map((w, i) => (
            <p key={i}>
              <span className="mono">{w.path}</span>: {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
