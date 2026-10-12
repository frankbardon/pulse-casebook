// cohortCandidates lists the root-relative paths a request's cohort may live
// at, most likely first. The engine resolves `data_dir` against the studio
// root, so that form comes first; casebook requests live in `req/` and name a
// cohort beside the case directory (`data_dir: "."` run from the case dir),
// so the request's own directory and its parent follow. Candidates that
// would escape the root are dropped; duplicates are removed.
export function cohortCandidates(requestPath: string, cohort: unknown): string[] {
  if (typeof cohort !== 'object' || cohort === null) return []
  const { filename, data_dir } = cohort as { filename?: unknown; data_dir?: unknown }
  if (typeof filename !== 'string' || filename === '') return []
  const dataDir = typeof data_dir === 'string' ? data_dir : '.'
  // Absolute locations are outside the scoped root by definition.
  if (isAbsolute(dataDir) || isAbsolute(filename)) return []
  const reqDir = dirname(requestPath)
  const bases = ['', reqDir, dirname(reqDir)]
  const out: string[] = []
  for (const base of bases) {
    const p = normalize([base, dataDir, filename].join('/'))
    if (p !== null && !out.includes(p)) out.push(p)
  }
  return out
}

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

// normalize resolves "." and ".." in a relative slash path; null if it
// escapes the root.
function normalize(p: string): string | null {
  const stack: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else stack.push(seg)
  }
  return stack.length === 0 ? null : stack.join('/')
}
