import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow, ViewportPortal } from '@xyflow/react'
import {
  inspectCohort,
  readFile,
  type CohortField,
  type FileKind,
  type Manifest,
  type WorkspaceFile,
} from '../api.ts'
import { cohortCandidates } from './cohortPath.ts'
import { buildRequestGraph } from './requestGraph.ts'
import { CohortNodeView, OpNodeView, RawNodeView } from './nodes.tsx'
import './graph.css'

const nodeTypes = { op: OpNodeView, cohort: CohortNodeView, raw: RawNodeView }

const UNSUPPORTED: Partial<Record<FileKind, string>> = {
  compose: 'Compose requests',
  facet: 'Facet requests',
  chain: 'Chain requests',
  cohort: 'Cohort files',
}

type Props = { file: WorkspaceFile | null; manifest?: Manifest }

// RequestView opens the selected file. Plain requests render as a
// read-only stage-column graph; other kinds get a "not yet supported" view.
export function RequestView({ file, manifest }: Props) {
  if (!file) return <Empty title="No file open" body="Pick a request from the sidebar." />
  const unsupported = UNSUPPORTED[file.kind]
  if (unsupported) {
    return (
      <Empty
        testId="unsupported"
        title={`${unsupported} are not yet supported`}
        body={`${file.path} is a ${file.kind} file. The graph view opens plain requests only for now.`}
      />
    )
  }
  if (file.kind !== 'request') return <Empty title="Cannot open" body={file.reason ?? file.path} />
  return <RequestGraphView key={file.path} path={file.path} manifest={manifest} />
}

function RequestGraphView({ path, manifest }: { path: string; manifest?: Manifest }) {
  const [doc, setDoc] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<CohortField[] | undefined>(undefined)
  const [cohortError, setCohortError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    readFile(path, ctl.signal)
      .then(async (f) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(f.text)
        } catch (e) {
          throw new Error(`invalid JSON: ${String(e)}`, { cause: e })
        }
        setDoc(parsed)
        const candidates = cohortCandidates(path, (parsed as { cohort?: unknown }).cohort)
        let last: unknown = new Error('request names no cohort file')
        for (const c of candidates) {
          try {
            const res = await inspectCohort(c, ctl.signal)
            setFields(res.fields)
            return
          } catch (e) {
            if (ctl.signal.aborted) return
            last = e
          }
        }
        setCohortError(`cohort not inspected: ${String(last)}`)
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(String(e))
      })
    return () => ctl.abort()
  }, [path])

  const graph = useMemo(() => {
    if (doc === undefined) return null
    try {
      return buildRequestGraph(doc, { manifest, cohortFields: fields })
    } catch (e) {
      return String(e)
    }
  }, [doc, manifest, fields])

  if (error) return <Empty title="Cannot open" body={error} />
  if (graph === null) return <Empty title="Loading…" body={path} />
  if (typeof graph === 'string') return <Empty title="Cannot open" body={graph} />

  return (
    <div className="graph" data-testid="request-graph">
      <div className="graph-bar">
        <span className="graph-path">{path}</span>
        <span className="muted">read-only</span>
        {cohortError && <span className="err">{cohortError}</span>}
      </div>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <ViewportPortal>
          {graph.columns.map((c) => (
            <div key={c.key} className="col-title" style={{ transform: `translate(${c.x}px, -28px)` }}>
              {c.title}
            </div>
          ))}
        </ViewportPortal>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

function Empty({ title, body, testId }: { title: string; body: string; testId?: string }) {
  return (
    <div className="empty" data-testid={testId}>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
    </div>
  )
}
