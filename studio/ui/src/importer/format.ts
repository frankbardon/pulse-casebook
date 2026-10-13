// Display formatting for the import views.

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

// formatPct prints a 0-100 percentage compactly ("0%", "16.7%", "<0.1%").
export function formatPct(p: number): string {
  if (p === 0) return '0%'
  if (p < 0.1) return '<0.1%'
  return `${Number(p.toFixed(1))}%`
}
