import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { PALETTE_MIME, paletteGroups, searchPalette, type PaletteItem } from './palette.ts'

type Props<T extends PaletteItem> = {
  items: readonly T[]
  heading: string
  testId: string
  onPick: (item: T) => void
  onClose: () => void
  // Extra text after the operator name (the input a port wires into).
  hint?: (item: T) => string | undefined
  // Items can be dragged onto the canvas (the side panel).
  draggable?: boolean
  className?: string
  style?: CSSProperties
}

// Palette is a searchable operator list grouped by stage column. Enter
// picks the first match, Escape closes.
export function Palette<T extends PaletteItem>({ items, heading, testId, onPick, onClose, hint, draggable, className, style }: Props<T>) {
  const [query, setQuery] = useState('')
  const found = useMemo(() => searchPalette(items, query), [items, query])
  const groups = useMemo(() => paletteGroups(found), [found])

  const onDragStart = (e: DragEvent, it: T) => {
    e.dataTransfer.setData(PALETTE_MIME, it.key)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={'palette' + (className ? ` ${className}` : '')}
      style={style}
      data-testid={testId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="palette-head">
        <span className="palette-title">{heading}</span>
        <button type="button" className="palette-close" aria-label="Close palette" onClick={onClose}>
          ×
        </button>
      </header>
      <input
        className="palette-search"
        data-testid="palette-search"
        type="search"
        placeholder="Search operators…"
        aria-label="Search operators"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && found.length > 0) {
            e.preventDefault()
            onPick(found[0])
          }
        }}
      />
      <div className="palette-list">
        {groups.length === 0 && <p className="palette-empty muted">{items.length === 0 ? 'No operators.' : 'No match.'}</p>}
        {groups.map((g) => (
          <section key={g.column} className="palette-group" data-column={g.column}>
            <h3>{g.title}</h3>
            {g.items.map((it) => {
              const extra = hint?.(it)
              return (
                <button
                  type="button"
                  key={it.key}
                  className="palette-item"
                  data-testid="palette-item"
                  data-op={it.op}
                  data-section={it.section}
                  title={it.description ?? it.op}
                  draggable={draggable}
                  onDragStart={draggable ? (e) => onDragStart(e, it) : undefined}
                  onClick={() => onPick(it)}
                >
                  <span className="palette-op">
                    {it.op}
                    {extra && <span className="palette-hint"> → {extra}</span>}
                  </span>
                  <span className="palette-kind">{it.kind}</span>
                  {it.description && <span className="palette-desc">{it.description}</span>}
                </button>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
