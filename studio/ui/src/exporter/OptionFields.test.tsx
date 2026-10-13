import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ExportOption } from '../api.ts'
import { ExportOptionFields } from './OptionFields.tsx'

const options: ExportOption[] = [
  { key: 'sanitize_names', title: 'Sanitize names', type: 'bool', default: false, help: 'Rewrite bad names.' },
  { key: 'charset', title: 'Charset', type: 'string', default: '', help: 'Encoding.', placeholder: 'source charset' },
  { key: 'mode', title: 'Mode', type: 'enum', default: 'b', enum: ['a', 'b'], help: 'Pick one.' },
  { key: 'level', title: 'Level', type: 'int', default: 3, min: 1, max: 22, help: 'zstd level.' },
]

// render returns the static markup and a lookup of a control's opening
// tag by test id (vitest runs in node, without a DOM).
function render(values: Record<string, boolean | string | number>) {
  const html = renderToStaticMarkup(<ExportOptionFields options={options} values={values} onChange={() => {}} />)
  const tag = (testid: string): string => new RegExp(`<(input|select)[^>]*data-testid="${testid}"[^>]*>`).exec(html)?.[0] ?? ''
  return { html, doc: { tag } }
}

describe('ExportOptionFields', () => {
  it('renders one control per option type, with help text', () => {
    const { html, doc } = render({ sanitize_names: true, charset: 'utf-8', mode: 'a', level: 5 })
    expect(doc.tag('export-opt-sanitize_names')).toContain('type="checkbox"')
    expect(doc.tag('export-opt-sanitize_names')).toContain('checked')
    expect(doc.tag('export-opt-charset')).toContain('type="text"')
    expect(doc.tag('export-opt-charset')).toContain('value="utf-8"')
    expect(doc.tag('export-opt-charset')).toContain('placeholder="source charset"')
    expect(doc.tag('export-opt-mode')).toMatch(/^<select/)
    expect(html).toContain('<option value="a" selected="">a</option>')
    expect(doc.tag('export-opt-level')).toContain('type="number"')
    expect(doc.tag('export-opt-level')).toContain('min="1"')
    expect(doc.tag('export-opt-level')).toContain('max="22"')
    expect(doc.tag('export-opt-level')).toContain('value="5"')
    for (const help of ['Rewrite bad names.', 'Encoding.', 'Pick one.', 'zstd level.']) expect(html).toContain(help)
  })

  it('falls back to defaults and flags an out-of-range int', () => {
    const { html, doc } = render({ level: 40 })
    expect(doc.tag('export-opt-sanitize_names')).not.toContain('checked')
    expect(html).toContain('<option value="b" selected="">b</option>')
    expect(doc.tag('export-opt-level')).toContain('aria-invalid="true"')
    expect(html).toContain('Must be between 1 and 22.')
  })

  it('renders nothing for a format without options', () => {
    expect(renderToStaticMarkup(<ExportOptionFields options={[]} values={{}} onChange={() => {}} />)).toBe('')
  })
})
