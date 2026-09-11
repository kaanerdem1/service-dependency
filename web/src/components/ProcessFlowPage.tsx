import { useEffect, useState } from 'react'
import { getProcessFlow, getProcessScreens } from '../api/client'
import { ProcessFlowMap } from './ProcessFlowMap'
import { ProcessFlowScreens } from './ProcessFlowScreens'
import type { ProcessFlowGraph, ServiceScreenLink } from '../types'

type Props = {
  processNo: string
  onDismiss: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
}

export function ProcessFlowPage({
  processNo,
  onDismiss,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
}: Props) {
  const [graph, setGraph] = useState<ProcessFlowGraph>()
  const [screens, setScreens] = useState<ServiceScreenLink[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setGraph(undefined)
    setScreens([])
    setError(undefined)
    void getProcessFlow(processNo)
      .then((row) => {
        if (!cancelled) setGraph(row)
      })
      .catch(() => {
        if (!cancelled) setError('Süreç akışı yüklenemedi.')
      })
    void getProcessScreens(processNo)
      .then((rows) => {
        if (!cancelled) setScreens(rows)
      })
      .catch(() => {
        if (!cancelled) setScreens([])
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
          screens={<ProcessFlowScreens screens={screens} />}
          onDismiss={onDismiss}
          initialSelectedNodeId={initialSelectedNodeId}
          onRestoreConsumed={onRestoreConsumed}
          onOpenService={onOpenService}
        />
      ) : null}
    </article>
  )
}
