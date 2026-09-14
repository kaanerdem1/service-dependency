import { useEffect, useState } from 'react'
import { getProcessFlow, getProcessScreens } from '../api/client'
import { ProcessFlowMap } from './ProcessFlowMap'
import { ProcessFlowRouteBuilder } from './ProcessFlowRouteBuilder'
import { ProcessFlowScreens } from './ProcessFlowScreens'
import { getProcessRoute, type SavedProcessRoute } from '../processRouteStore'
import type { ProcessFlowGraph, ServiceScreenLink } from '../types'

type Props = {
  processNo: string
  onDismiss: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
  routeId?: string
  onRouteSaved?: (routeId: string) => void
}

export function ProcessFlowPage({
  processNo,
  onDismiss,
  canGoBack,
  onBackToParent,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
  onOpenSubProcess,
  routeId,
  onRouteSaved,
}: Props) {
  const [graph, setGraph] = useState<ProcessFlowGraph>()
  const [screens, setScreens] = useState<ServiceScreenLink[]>([])
  const [error, setError] = useState<string>()
  const [routeMode, setRouteMode] = useState(Boolean(routeId))
  const [savedRoute, setSavedRoute] = useState<SavedProcessRoute | undefined>(() =>
    getProcessRoute(routeId),
  )

  useEffect(() => {
    setSavedRoute(getProcessRoute(routeId))
    setRouteMode(Boolean(routeId))
  }, [processNo, routeId])

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
      {graph && routeMode ? (
        <ProcessFlowRouteBuilder
          key={`${graph.no}:route:${savedRoute?.id ?? 'new'}`}
          graph={graph}
          screens={<ProcessFlowScreens screens={screens} />}
          savedRoute={savedRoute}
          onExitRoute={() => setRouteMode(false)}
          onDismiss={onDismiss}
          onOpenService={onOpenService}
          onOpenSubProcess={onOpenSubProcess}
          onRouteSaved={(route) => {
            setSavedRoute(route)
            onRouteSaved?.(route.id)
          }}
        />
      ) : null}
      {graph && !routeMode ? (
        <ProcessFlowMap
          key={`${graph.no}:${initialSelectedNodeId ?? ''}`}
          graph={graph}
          screens={<ProcessFlowScreens screens={screens} />}
          onDismiss={onDismiss}
          canGoBack={canGoBack}
          onBackToParent={onBackToParent}
          initialSelectedNodeId={initialSelectedNodeId}
          onRestoreConsumed={onRestoreConsumed}
          onOpenService={onOpenService}
          onOpenSubProcess={onOpenSubProcess}
          onCreateRoute={() => {
            setSavedRoute(undefined)
            setRouteMode(true)
          }}
        />
      ) : null}
    </article>
  )
}
