import { useEffect, useState } from 'react'
import { getProcessFlow } from '../api/client'
import { ProcessFlowMap } from './ProcessFlowMap'
import type { ProcessFlowGraph } from '../types'

type Props = {
  processNo: string
  onDismiss: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string) => void
}

export function ProcessFlowPage({
  processNo,
  onDismiss,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
}: Props) {
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
    <article className="pf-map-page">
      {!graph ? (
        <button type="button" className="pf-map-close" onClick={onDismiss}>
          Kapat
        </button>
      ) : null}
      {error ? <p className="pf-map-status">{error}</p> : null}
      {!error && !graph ? <p className="pf-map-status">Yükleniyor…</p> : null}
      {graph ? (
        <ProcessFlowMap
          key={`${graph.no}:${initialSelectedNodeId ?? ''}`}
          graph={graph}
          onDismiss={onDismiss}
          initialSelectedNodeId={initialSelectedNodeId}
          onRestoreConsumed={onRestoreConsumed}
          onOpenService={onOpenService}
        />
      ) : null}
    </article>
  )
}
