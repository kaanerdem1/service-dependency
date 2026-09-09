import { useEffect, useState } from 'react'
import { getProcessFlow } from '../api/client'
import { ProcessFlowCanvas } from './ProcessFlowCanvas'
import type { ProcessFlowGraph } from '../types'

type Props = {
  processNo: string
  onDismiss: () => void
}

export function ProcessFlowPage({ processNo, onDismiss }: Props) {
  const [graph, setGraph] = useState<ProcessFlowGraph>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setGraph(undefined)
    setError(undefined)
    void getProcessFlow(processNo)
      .then((row) => {
        if (!cancelled) setGraph(row)
      })
      .catch(() => {
        if (!cancelled) setError('Süreç akışı yüklenemedi.')
      })
    return () => {
      cancelled = true
    }
  }, [processNo])

  return (
    <article className="pf-page">
      <header className="wf-info-hero">
        <div className="wf-info-hero-main">
          <p className="wf-info-kicker">Süreç</p>
          <div className="wf-info-title-row">
            <h1 className="wf-info-title">{graph?.label || processNo}</h1>
          </div>
          <p className="wf-info-lede">
            {graph
              ? `${graph.no} · ${graph.nodes.length} adım · ${graph.edges.length} geçiş`
              : `No ${processNo}`}
          </p>
        </div>
        <div className="wf-info-hero-side">
          <button type="button" className="ce-dismiss" onClick={onDismiss}>
            Kapat
          </button>
        </div>
      </header>
      {error ? <p className="wf-info-lede">{error}</p> : null}
      {!error && !graph ? <p className="wf-info-lede">Yükleniyor…</p> : null}
      {graph ? <ProcessFlowCanvas graph={graph} /> : null}
    </article>
  )
}
