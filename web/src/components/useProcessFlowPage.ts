/**
 * Süreç sayfası yükleme + tam akış / rota modu (Faz 3d).
 *
 * Ne yapar: Graf ve ekranları çeker; `routeId` / “yeni rota” ile
 *   `ProcessFlowMap` ↔ `ProcessFlowRouteBuilder` geçişini yönetir.
 * Ne yapmaz: Canvas çizmez. Map `key` yalnızca `graph.no` (restore node id key’de yok).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getProcessFlow, getProcessScreens } from '../api/client'
import { resolveCatalogCanEdit } from '../auth/catalogAccess'
import { getProcessRoute, PROCESS_ROUTES_CHANGED_EVENT, type SavedProcessRoute } from '../processRouteStore'
import type { ProcessFlowGraph, ProcessNodeDescriptionsDoc, ServiceScreenLink } from '../types'

export type ProcessFlowPageProps = {
  processNo: string
  onDismiss: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
  routeId?: string
  onRouteSaved?: (routeId?: string) => void
}

export function useProcessFlowPage({
  processNo,
  onRestoreConsumed,
  routeId,
  onRouteSaved,
}: ProcessFlowPageProps) {
  const [graph, setGraph] = useState<ProcessFlowGraph>()
  const [screens, setScreens] = useState<ServiceScreenLink[]>([])
  const [error, setError] = useState<string>()
  const [routeMode, setRouteMode] = useState(Boolean(routeId))
  const [routeNonce, setRouteNonce] = useState(0)
  const [focusAfterRoute, setFocusAfterRoute] = useState<string>()
  const [savedRoute, setSavedRoute] = useState<SavedProcessRoute | undefined>(() =>
    getProcessRoute(routeId),
  )
  const canEditCatalog = resolveCatalogCanEdit()
  /** Akış Rotanı Oluştur: parent routeId temizler; yine de rota modunda kalınmalı. */
  const pendingNewRouteRef = useRef(false)
  const onNodeDescriptionsChange = useCallback((doc: ProcessNodeDescriptionsDoc) => {
    setGraph((current) => (current ? { ...current, nodeDescriptions: doc } : current))
  }, [])

  useEffect(() => {
    setSavedRoute(getProcessRoute(routeId))
    setRouteMode(Boolean(routeId))
    pendingNewRouteRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps -- süreç değişince rota eşlemesi
  }, [processNo])

  useEffect(() => {
    if (routeId) {
      pendingNewRouteRef.current = false
      setSavedRoute(getProcessRoute(routeId))
      setRouteMode(true)
      return
    }
    if (pendingNewRouteRef.current) return
    setSavedRoute(undefined)
    setRouteMode(false)
  }, [routeId])

  useEffect(() => {
    const onChange = () => {
      if (!savedRoute?.id) return
      if (getProcessRoute(savedRoute.id)) return
      setSavedRoute(undefined)
      setRouteMode(false)
      onRouteSaved?.()
    }
    window.addEventListener(PROCESS_ROUTES_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(PROCESS_ROUTES_CHANGED_EVENT, onChange)
  }, [onRouteSaved, savedRoute?.id])

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

  return {
    graph,
    screens,
    error,
    routeMode,
    routeNonce,
    focusAfterRoute,
    savedRoute,
    canEditCatalog,
    onNodeDescriptionsChange,
    exitRoute: () => {
      setRouteMode(false)
      setSavedRoute(undefined)
      onRouteSaved?.()
    },
    leaveRouteForNode: (nodeId: string) => {
      setFocusAfterRoute(nodeId)
      setRouteMode(false)
    },
    handleRouteSaved: (route: SavedProcessRoute) => {
      setSavedRoute(route)
      onRouteSaved?.(route.id)
    },
    restoreConsumed: () => {
      setFocusAfterRoute(undefined)
      onRestoreConsumed?.()
    },
    createRoute: () => {
      pendingNewRouteRef.current = true
      setSavedRoute(undefined)
      onRouteSaved?.()
      setRouteNonce((value) => value + 1)
      setRouteMode(true)
    },
  }
}
