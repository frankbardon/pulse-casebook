import type { ExportOption, ExportOptionValue } from '../api.ts'
import { optionError, type OptionValues } from './exportForm.ts'

type Props = {
  options: ExportOption[]
  values: OptionValues
  onChange: (key: string, value: ExportOptionValue) => void
}

// ExportOptionFields renders a format's own options from the server's
// descriptors: a checkbox (bool), text box (string), select (enum) or
// number box (int), each with its help text. An option Pulse adds
// later appears here without a UI change.
export function ExportOptionFields({ options, values, onChange }: Props) {
  if (options.length === 0) return null
  return (
    <div className="export-options" data-testid="export-options">
      {options.map((o) => {
        const v = values[o.key] ?? o.default
        const err = optionError(o, v)
        const id = `export-opt-${o.key}`
        let control: React.ReactNode
        switch (o.type) {
          case 'bool':
            control = (
              <label className="export-check">
                <input id={id} type="checkbox" data-testid={id} checked={v === true} onChange={(e) => onChange(o.key, e.target.checked)} />
                {o.title}
              </label>
            )
            break
          case 'enum':
            control = (
              <label>
                <span>{o.title}</span>
                <select id={id} data-testid={id} value={String(v)} onChange={(e) => onChange(o.key, e.target.value)}>
                  {(o.enum ?? []).map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
            )
            break
          case 'int':
            control = (
              <label>
                <span>{o.title}</span>
                <input
                  id={id}
                  type="number"
                  data-testid={id}
                  min={o.min}
                  max={o.max}
                  step={1}
                  value={typeof v === 'number' && !Number.isNaN(v) ? v : ''}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => onChange(o.key, e.target.value === '' ? Number.NaN : Number(e.target.value))}
                />
              </label>
            )
            break
          default:
            control = (
              <label>
                <span>{o.title}</span>
                <input
                  id={id}
                  type="text"
                  data-testid={id}
                  value={String(v)}
                  placeholder={o.placeholder}
                  spellCheck={false}
                  onChange={(e) => onChange(o.key, e.target.value)}
                />
              </label>
            )
        }
        return (
          <div key={o.key} className="export-option" data-option={o.key} data-type={o.type}>
            {control}
            <p className="opt-help">
              {o.help}
              {err && <span className="err"> Must be {err}.</span>}
            </p>
          </div>
        )
      })}
    </div>
  )
}
