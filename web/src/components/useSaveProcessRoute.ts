/**
 * Kayıtlı akış rotası: kaydet + PDF snapshot (Faz 3c).
 *
 * Ne yapar: Görünen prefix’i `processRouteStore`’a yazar; harita DOM’undan
 *   snake PDF üretir.
 * Ne yapmaz: Rota state makinesini değiştirmez; yalnız persist / export.
 * Kural: Yalnız haritada o anda görünen adımlar kaydedilir.
 */
import { useCallback, useState, type RefObject } from 'react'
import type { Node } from 'reactflow'
import { saveProcessRoute, type SavedProcessRoute } from '../processRouteStore'
import { exportProcessPathSnapshotPdf } from '../snapshot/processPathSnapshot'
import { buildUserRouteSnapshotSteps } from './processPathNarrative'
import {
  savedRouteHasChanges,
  type RouteVisit,
  type UserRouteState,
} from './processUserRoute'
import type { ProcessFlowGraph } from '../types'

export function useSaveProcessRoute({
  graph,
  processNo,
  processTitle,
  state,
  savedRoute,
  onRouteSaved,
  mapCanvasRef,
  visits,
  getNodes,
  byId,
}: {
  graph: ProcessFlowGraph
  processNo: string
  processTitle: string
  state: UserRouteState
  savedRoute?: SavedProcessRoute
  onRouteSaved?: (route: SavedProcessRoute) => void
  mapCanvasRef: RefObject<HTMLDivElement | null>
  visits: RouteVisit[]
  getNodes: () => Node[]
  byId: Map<string, ProcessFlowGraph['nodes'][number]>
}) {
  const [readOnly, setReadOnly] = useState(Boolean(savedRoute))
  const [saveOpen, setSaveOpen] = useState(false)
  const [routeName, setRouteName] = useState(savedRoute?.name ?? '')
  const [activeRoute, setActiveRoute] = useState(savedRoute)
  const [snapshotBusy, setSnapshotBusy] = useState(false)

  const routeDirty = activeRoute
    ? savedRouteHasChanges(state, activeRoute.state, routeName, activeRoute.name)
    : true
  const canSaveAs = Boolean(activeRoute) && routeDirty

  const persistRoute = useCallback(
    (asNew = false) => {
      const name = routeName.trim()
      if (!name) return
      const route = saveProcessRoute({
        id: asNew ? undefined : activeRoute?.id,
        processNo,
        processTitle,
        name,
        state,
        status: 'completed' as const,
        graphUpdatedAt: graph.updatedAt,
      })
      setActiveRoute(route)
      setRouteName(route.name)
      setSaveOpen(false)
      setReadOnly(true)
      onRouteSaved?.(route)
    },
    [activeRoute?.id, graph, onRouteSaved, processNo, processTitle, routeName, state],
  )

  const openSave = useCallback(() => {
    const name = routeName.trim()
    if (activeRoute && name && !routeDirty) {
      persistRoute(false)
      return
    }
    setSaveOpen(true)
  }, [activeRoute, persistRoute, routeDirty, routeName])

  const exportPdf = useCallback(
    async (endIndex: number) => {
      const mapEl = mapCanvasRef.current
      if (!mapEl || visits.length === 0 || snapshotBusy) return
      const prefix = visits.slice(0, Math.max(0, endIndex) + 1)
      setSnapshotBusy(true)
      try {
        await exportProcessPathSnapshotPdf({
          mapEl,
          pathNodeIds: new Set(prefix.map((visit) => visit.visitId)),
          pathEdges: prefix.slice(1).map((visit, index) => ({
            fromId: prefix[index].visitId,
            toId: visit.visitId,
            label: visit.incomingLabel,
          })),
          getNodes,
          steps: buildUserRouteSnapshotSteps(graph, prefix),
          processTitle: `${processTitle} · ${activeRoute?.name ?? (routeName.trim() || 'Akış Rotası')}`,
          processNo,
          targetName: byId.get(prefix.at(-1)?.nodeId ?? '')?.name ?? 'Rota',
        })
      } finally {
        setSnapshotBusy(false)
      }
    },
    [
      activeRoute?.name,
      byId,
      getNodes,
      graph,
      mapCanvasRef,
      processNo,
      processTitle,
      routeName,
      snapshotBusy,
      visits,
    ],
  )

  return {
    readOnly,
    setReadOnly,
    saveOpen,
    setSaveOpen,
    routeName,
    setRouteName,
    activeRoute,
    snapshotBusy,
    routeDirty,
    canSaveAs,
    persistRoute,
    openSave,
    exportPdf,
  }
}
