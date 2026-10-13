import { useState } from 'react'
import type { CohortField } from '../api.ts'
import { facetValue, setFacetProp, type FacetProp } from './facetGraph.ts'
import { parseJson, type JsonNode } from './jsonTree.ts'
import type { GraphModel } from './model.ts'

type Props = {
  model: GraphModel
  cohortFields?: CohortField[]
  onChange: (model: GraphModel) => void
  onClose: () => void
}

// FacetInspector edits a Facet root's settings: the fields it summarizes
// (picked from the cohort's fields when inspected), additive fields,
// discrete top-k, numeric percentiles and the histogram options. Every
// edit is one setFacetProp on the lossless tree; typed numbers are
// parsed as JSON tokens, so their spelling is what gets saved.
export function FacetInspector({ model, cohortFields, onChange, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const set = (key: FacetProp, value: JsonNode | undefined) => {
    try {
      onChange(setFacetProp(model, key, value))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const strings = (key: FacetProp): string[] => {
    const v = facetValue(model, key)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  }
  const fields = strings('fields')
  const additive = strings('additive_fields')
  const list = (names: string[]): JsonNode => ({ type: 'array', items: names.map((n) => ({ type: 'string', raw: JSON.stringify(n) })) })
  const toggle = (key: FacetProp, names: string[], name: string, on: boolean) => {
    const next = on ? [...names, name] : names.filter((n) => n !== name)
    set(key, next.length === 0 && key !== 'fields' ? undefined : list(next))
  }
  const choices = cohortFields?.map((f) => f.name) ?? []
  // Fields named in the file but not in the cohort stay listed (and checked).
  const shown = [...choices, ...fields.filter((f) => !choices.includes(f))]
  const histogram = facetValue(model, 'include_histogram') === true

  return (
    <aside className="inspector" data-testid="inspector" data-node="fields">
      <header className="insp-head">
        <span className="insp-title">Faceted</span>
        <span className="insp-op">FACET</span>
        <button type="button" className="insp-close" aria-label="Close inspector" onClick={onClose}>
          ×
        </button>
        <span className="insp-path">faceted analysis settings</span>
      </header>
      <fieldset className="insp-section">
        <legend>Fields</legend>
        {cohortFields ? (
          <ul className="facet-pick" data-testid="facet-fields">
            {shown.map((name) => (
              <li key={name}>
                <label>
                  <input type="checkbox" checked={fields.includes(name)} onChange={(e) => toggle('fields', fields, name, e.target.checked)} />
                  {name}
                  <span className="insp-type">{cohortFields.find((f) => f.name === name)?.type ?? 'not in cohort'}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <TextSetting
            label="fields"
            hint="comma-separated field names"
            value={fields.join(', ')}
            onCommit={(t) => {
              const names = t
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
              set('fields', list(names))
            }}
          />
        )}
      </fieldset>
      <fieldset className="insp-section">
        <legend>Discrete fields</legend>
        <NumberSetting label="discrete_top_k" hint="most frequent values kept per field; empty = all" model={model} onSet={set} integer />
        {fields.length > 0 && (
          <div className="insp-field">
            <label>
              additive_fields<span className="insp-type">contribution counts</span>
            </label>
            <ul className="facet-pick">
              {fields.map((name) => (
                <li key={name}>
                  <label>
                    <input type="checkbox" checked={additive.includes(name)} onChange={(e) => toggle('additive_fields', additive, name, e.target.checked)} />
                    {name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
      <fieldset className="insp-section">
        <legend>Numeric fields</legend>
        <TextSetting
          label="numeric_percentiles"
          hint="points in (0, 1), comma-separated"
          value={numbersText(model, 'numeric_percentiles')}
          onCommit={(t) => {
            if (t.trim() === '') return set('numeric_percentiles', undefined)
            const v = parseNumbers(`[${t}]`)
            if (typeof v === 'string') return setError(`numeric_percentiles: ${v}`)
            const points = v.type === 'array' ? v.items.map((x) => (x.type === 'number' ? Number(x.raw) : NaN)) : []
            if (points.some((p) => !(p > 0 && p < 1))) {
              return setError('numeric_percentiles: each point must be strictly between 0 and 1')
            }
            set('numeric_percentiles', v)
          }}
        />
        <div className="insp-field">
          <label>
            <input
              type="checkbox"
              data-testid="facet-histogram"
              checked={histogram}
              onChange={(e) => set('include_histogram', e.target.checked ? { type: 'boolean', raw: 'true' } : undefined)}
            />{' '}
            include_histogram
          </label>
        </div>
        {histogram && (
          <>
            <NumberSetting label="histogram_bins" hint="buckets, default 20, at most 256" model={model} onSet={set} integer />
            <TextSetting
              label="histogram_range"
              hint="min, max (required for a histogram)"
              value={numbersText(model, 'histogram_range')}
              onCommit={(t) => {
                if (t.trim() === '') return set('histogram_range', undefined)
                const v = parseNumbers(`[${t}]`)
                if (typeof v === 'string') return setError(`histogram_range: ${v}`)
                if (v.type !== 'array' || v.items.length !== 2) return setError('histogram_range: give min and max')
                set('histogram_range', v)
              }}
            />
          </>
        )}
      </fieldset>
      <fieldset className="insp-section">
        <legend>Analysis</legend>
        <TextSetting
          label="time_zone"
          hint="IANA zone for zone-aware filters; empty inherits"
          value={typeof facetValue(model, 'time_zone') === 'string' ? (facetValue(model, 'time_zone') as string) : ''}
          onCommit={(t) => set('time_zone', t.trim() === '' ? undefined : { type: 'string', raw: JSON.stringify(t.trim()) })}
        />
      </fieldset>
      {error && (
        <ul className="insp-problems" data-testid="insp-problems">
          <li>{error}</li>
        </ul>
      )}
    </aside>
  )
}

// TextSetting is a text input committed on blur or Enter.
function TextSetting({ label, hint, value, onCommit }: { label: string; hint: string; value: string; onCommit: (t: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const id = `facet-${label}`
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <div className="insp-field" data-field={label}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={draft ?? value}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      <span className="insp-hint">{hint}</span>
    </div>
  )
}

function NumberSetting({
  label,
  hint,
  model,
  onSet,
  integer,
}: {
  label: FacetProp
  hint: string
  model: GraphModel
  onSet: (key: FacetProp, v: JsonNode | undefined) => void
  integer?: boolean
}) {
  const [bad, setBad] = useState<string | null>(null)
  return (
    <>
      <TextSetting
        label={label}
        hint={bad ?? hint}
        value={numbersText(model, label)}
        onCommit={(t) => {
          if (t.trim() === '') {
            setBad(null)
            return onSet(label, undefined)
          }
          const v = parseNumbers(t.trim())
          if (typeof v === 'string' || v.type !== 'number' || (integer && !/^\d+$/.test(v.raw))) {
            setBad(`${label} takes a whole number`)
            return
          }
          setBad(null)
          onSet(label, v)
        }}
      />
    </>
  )
}

// numbersText renders a number or number list setting as typed text.
function numbersText(model: GraphModel, key: FacetProp): string {
  const v = facetValue(model, key)
  if (Array.isArray(v)) return v.map(String).join(', ')
  return v === undefined ? '' : String(v)
}

// parseNumbers parses a number or a list of numbers, keeping spellings;
// a string is the error.
function parseNumbers(text: string): (JsonNode & { type: 'number' }) | { type: 'array'; items: JsonNode[] } | string {
  let v: JsonNode
  try {
    v = parseJson(text)
  } catch {
    return 'not a number'
  }
  if (v.type === 'number') return v as JsonNode & { type: 'number' }
  if (v.type === 'array' && v.items.every((x) => x.type === 'number')) return v
  return 'not a number'
}
