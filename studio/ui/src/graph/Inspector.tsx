import { useMemo, useState, type ReactNode } from 'react'
import { getIn, parseEdit, prettyJson, setIn } from './jsonEdit.ts'
import { fromPlain, type JsonNode } from './jsonTree.ts'
import type { ModelNode } from './model.ts'
import { applyField, buildForm, fieldText, formProblems, type Catalog, type FormField } from './paramForms.ts'

type Props = {
  node: ModelNode
  catalog: Catalog
  onChange: (value: JsonNode) => void
  onClose: () => void
  // Set when the node can be deleted from the canvas (not the cohort).
  onDelete?: () => void
}

// Inspector edits one model node: a form generated from the manifest (or
// hand-written for free-form operators) plus the node's JSON as text.
// Every edit replaces the node's jsonTree value; nothing round-trips
// through JSON.parse.
export function Inspector({ node, catalog, onChange, onClose, onDelete }: Props) {
  const form = useMemo(() => buildForm(node, catalog), [node, catalog])
  const problems = form.mode === 'raw' ? [] : formProblems(form, node.value)
  const title = node.kind === 'cohort' ? 'Cohort' : node.kind === 'raw' ? `Raw ${node.section}` : node.section
  return (
    <aside className="inspector" data-testid="inspector" data-node={node.id}>
      <header className="insp-head">
        <span className="insp-title">{title}</span>
        {form.op && <span className={'insp-op' + (form.opKnown === false ? ' unknown' : '')}>{form.op}</span>}
        <button type="button" className="insp-close" aria-label="Close inspector" onClick={onClose}>
          ×
        </button>
        <span className="insp-path">{node.id}</span>
        {onDelete && (
          <button type="button" className="insp-delete" data-testid="delete-node" onClick={onDelete} title="Delete node (Delete / Backspace)">
            Delete
          </button>
        )}
      </header>
      {form.note && <p className="insp-note">{form.note}</p>}
      {form.sections
        .filter((s) => s.fields.length > 0)
        .map((s) => (
          <fieldset key={s.title} className="insp-section">
            <legend>{s.title}</legend>
            {s.fields.map((f) => (
              <Field key={`${node.id}|${f.rel.join('.')}`} field={f} value={node.value} onChange={onChange} />
            ))}
          </fieldset>
        ))}
      {problems.length > 0 && (
        <ul className="insp-problems" data-testid="insp-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <JsonEditor key={node.id} node={node} open={form.mode === 'raw' || form.mode === 'none'} onChange={onChange} />
    </aside>
  )
}

function Field({ field: f, value, onChange }: { field: FormField; value: JsonNode; onChange: (v: JsonNode) => void }) {
  // draft holds what the user typed while it differs from the stored
  // value (mid-typing numbers, invalid JSON); it clears on blur.
  const [draft, setDraft] = useState<{ text: string; error?: string } | null>(null)
  const text = draft?.text ?? fieldText(f, value)
  const id = `insp-${f.rel.join('-')}`
  const commit = (t: string): boolean => {
    const r = applyField(f, value, t)
    setDraft({ text: t, ...(r.error && { error: r.error }) })
    if (!r.error && r.value !== value) onChange(r.value)
    return !r.error
  }
  const isJson = f.type === 'json' || f.type === 'ranges'
  const blur = () => {
    if (!draft?.error) setDraft(null)
  }
  const placeholder = f.default !== undefined ? `default ${JSON.stringify(f.default)}` : f.required ? 'required' : ''

  const textArea = () => (
    <textarea
      id={id}
      rows={Math.min(8, Math.max(2, text.split('\n').length))}
      value={text}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => (isJson ? setDraft({ text: e.target.value }) : commit(e.target.value))}
      onBlur={() => {
        // JSON applies on blur, once it parses.
        if (isJson && draft && commit(draft.text)) setDraft(null)
        else if (!isJson) blur()
      }}
    />
  )

  let input: ReactNode
  switch (f.type) {
    case 'bool':
      input = (
        <select id={id} value={text} onChange={(e) => commit(e.target.value)}>
          <option value="">{placeholder || '(unset)'}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
      break
    case 'enum':
    case 'enumItem': {
      const opts = f.options ?? []
      input = (
        <select id={id} value={text} onChange={(e) => commit(e.target.value)}>
          <option value="">{placeholder || '(unset)'}</option>
          {text !== '' && !opts.includes(text) && <option value={text}>{text}</option>}
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
      break
    }
    case 'ranges':
      // Not a list of range objects: edit as JSON.
      input = isRangeList(getIn(value, f.rel)) ? <RangesEditor field={f} value={value} onChange={onChange} /> : textArea()
      break
    case 'json':
    case 'strings':
    case 'expression':
      input = textArea()
      break
    default:
      input = (
        <input
          id={id}
          type="text"
          inputMode={f.type === 'number' || f.type === 'int' ? 'decimal' : undefined}
          value={text}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => commit(e.target.value)}
          onBlur={blur}
        />
      )
  }
  return (
    <div className={'insp-field' + (draft?.error ? ' invalid' : '')} data-field={f.key}>
      <label htmlFor={id}>
        {f.key}
        {f.required && <span className="req">*</span>}
        <span className="insp-type">{f.oneOf ? `${f.type} · one of ${f.oneOf}` : f.type}</span>
      </label>
      {input}
      {draft?.error && <span className="insp-err">{draft.error}</span>}
      {f.hint && !draft?.error && <span className="insp-hint">{f.hint}</span>}
    </div>
  )
}

function isRangeList(v: JsonNode | undefined): boolean {
  return v === undefined || (v.type === 'array' && v.items.every((i) => i.type === 'object'))
}

const RANGE_KEYS = ['label', 'start', 'end'] as const

// RangesEditor edits `[{label, start, end}]`: one row per range, an empty
// bound written as null (open).
function RangesEditor({ field: f, value, onChange }: { field: FormField; value: JsonNode; onChange: (v: JsonNode) => void }) {
  const list = getIn(value, f.rel)
  const rows = list?.type === 'array' ? list.items : []
  const cell = (i: number, k: (typeof RANGE_KEYS)[number]) => {
    const v = getIn(rows[i], [k])
    return v?.type === 'string' ? (JSON.parse(v.raw) as string) : ''
  }
  const set = (i: number, k: (typeof RANGE_KEYS)[number], t: string) =>
    onChange(setIn(value, [...f.rel, i, k], t === '' ? (k === 'label' ? undefined : fromPlain(null)) : fromPlain(t)))
  const add = () => {
    const base = list ? value : setIn(value, f.rel, { type: 'array', items: [] })
    onChange(setIn(base, [...f.rel, rows.length], fromPlain({ label: '', start: null, end: null })))
  }
  return (
    <div className="insp-ranges">
      {rows.map((_, i) => (
        <div key={i} className="insp-range">
          {RANGE_KEYS.map((k) => (
            <input
              key={k}
              type="text"
              aria-label={`range ${i + 1} ${k}`}
              placeholder={k === 'label' ? 'label' : `${k} (open)`}
              value={cell(i, k)}
              spellCheck={false}
              onChange={(e) => set(i, k, e.target.value)}
            />
          ))}
          <button type="button" aria-label={`Remove range ${i + 1}`} onClick={() => onChange(setIn(value, [...f.rel, i], undefined))}>
            −
          </button>
        </div>
      ))}
      <button type="button" className="insp-add" onClick={add}>
        Add range
      </button>
    </div>
  )
}

// JsonEditor edits the node's whole value as JSON text, validated by the
// lossless parser; what the user types is what gets saved.
function JsonEditor({ node, open, onChange }: { node: ModelNode; open: boolean; onChange: (v: JsonNode) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = draft ?? prettyJson(node.value)
  const apply = () => {
    if (draft === null) return
    const r = parseEdit(draft)
    if ('error' in r) return setError(r.error)
    if ((node.kind === 'entry' || node.kind === 'cohort') && r.value.type !== 'object') {
      return setError(`a ${node.kind} must be a JSON object`)
    }
    setError(null)
    setDraft(null)
    onChange(r.value)
  }
  return (
    <details className="insp-json" open={open}>
      <summary>JSON</summary>
      <textarea
        aria-label="Node JSON"
        rows={Math.min(20, Math.max(4, text.split('\n').length))}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
      />
      <div className="insp-json-bar">
        <button type="button" disabled={draft === null} onClick={apply}>
          Apply JSON
        </button>
        <button
          type="button"
          disabled={draft === null}
          onClick={() => {
            setDraft(null)
            setError(null)
          }}
        >
          Revert
        </button>
        {error && <span className="insp-err">{error}</span>}
      </div>
    </details>
  )
}
