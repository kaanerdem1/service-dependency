/**
 * Süreç akışı (BPM) ve kayıtlı rota açma / iç içe süreç / servise gidip geri dönme.
 *
 * Ne yapar:
 *   - Hangi sürecin açık olduğunu (`processFlowNo`), varsa kayıtlı rotayı
 *     (`processRouteId`), alt süreç yığınını (`processFlowStack`) ve
 *     "servisten sürece geri dön" hedefini (`processFlowReturn` +
 *     `processFlowRestoreNodeId`) tutar.
 *   - Drawer'dan süreç/rota açma, alt sürece inme, üst sürece çıkma,
 *     drawer'dan servise gitme ve servisten sürece geri dönüşün iş kurallarını
 *     burada toplar — `App.tsx` yalnızca bu fonksiyonları JSX'e bağlar.
 *
 * Ne yapmaz:
 *   - Servis haritası seçimini (`selectPivot`) kendi başına yönetmez; o hâlâ
 *     `App.tsx`'te (geçmiş yığını, trail, recents ile iç içe). Hook, servise
 *     geçerken `selectPivotRef` üzerinden çağırır — çünkü `selectPivot`
 *     tanımı bu hook'tan sonra gelir (döngüsel bağımlılık yok).
 *   - Ziyaret geçmişini (`setHistory`) da ref ile alır: `useVisitHistory`
 *     `processFlowReturn`'e ihtiyaç duyduğu için bu hook'tan *sonra*
 *     çağrılır; restore fonksiyonu ise geçmişi temizlemek zorunda.
 *
 * İlgili: navigation/rehber.md
 */
import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { searchServices } from '../api/client'
import type { StageTabId } from '../motion/StageTabs'
import { getProcessRoute, touchProcessRoute } from '../stores/processRouteStore'
import type { AffectedService, ImpactGraph, Service } from '../types'
import type { VisitEntry } from './useVisitHistory'

export type ProcessFlowAnchor = {
  processNo: string
  nodeId?: string
}

export type SelectPivotFn = (
  id: string,
  opts?: {
    resetHistory?: boolean
    source?: 'tree' | 'map' | 'search' | 'table' | 'workflow'
    keepProcessFlowReturn?: boolean
  },
) => void

export type ProcessFlowHistoryApi = {
  setHistory: Dispatch<SetStateAction<VisitEntry[]>>
  setHistoryIndex: Dispatch<SetStateAction<number>>
}

type Params = {
  restoredProcessFlowNo?: string
  restoredProcessRouteId?: string
  restoredProcessFlowStack?: ProcessFlowAnchor[]
  setWorkflowInfoId: Dispatch<SetStateAction<string | undefined>>
  setWorkflowResumeId: Dispatch<SetStateAction<string | undefined>>
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>
  setWorkflowsOpen: Dispatch<SetStateAction<boolean>>
  setPivotId: Dispatch<SetStateAction<string | undefined>>
  setCatalogNode: Dispatch<SetStateAction<{ id: string; kind: 'group' | 'package'; name: string } | null>>
  resetMethodSelection: () => void
  setTab: Dispatch<SetStateAction<StageTabId>>
  setService: Dispatch<SetStateAction<Service | undefined>>
  setAffected: Dispatch<SetStateAction<AffectedService[]>>
  setCallees: Dispatch<SetStateAction<AffectedService[]>>
  setImpact: Dispatch<SetStateAction<ImpactGraph | undefined>>
  setMapExpanded: Dispatch<SetStateAction<boolean>>
  /** `selectPivot` App'te daha aşağıda tanımlanır; her render'da güncel tutulur. */
  selectPivotRef: MutableRefObject<SelectPivotFn>
  /** `useVisitHistory` bu hook'tan sonra bağlanır. */
  historyApiRef: MutableRefObject<ProcessFlowHistoryApi>
}

export function useProcessFlowNav({
  restoredProcessFlowNo,
  restoredProcessRouteId,
  restoredProcessFlowStack,
  setWorkflowInfoId,
  setWorkflowResumeId,
  setShortcutsOpen,
  setWorkflowsOpen,
  setPivotId,
  setCatalogNode,
  resetMethodSelection,
  setTab,
  setService,
  setAffected,
  setCallees,
  setImpact,
  setMapExpanded,
  selectPivotRef,
  historyApiRef,
}: Params) {
  const [processFlowNo, setProcessFlowNo] = useState<string | undefined>(
    () => restoredProcessFlowNo,
  )
  const [processRouteId, setProcessRouteId] = useState<string | undefined>(
    () => restoredProcessRouteId,
  )
  const [processFlowReturn, setProcessFlowReturn] = useState<ProcessFlowAnchor | undefined>()
  const [processFlowStack, setProcessFlowStack] = useState<ProcessFlowAnchor[]>(
    () => restoredProcessFlowStack ?? [],
  )
  const [processFlowRestoreNodeId, setProcessFlowRestoreNodeId] = useState<string>()

  const openProcessFlow = useCallback((no: string, opts?: { keepService?: boolean }) => {
    setWorkflowInfoId(undefined)
    setWorkflowResumeId(undefined)
    setProcessFlowReturn(undefined)
    setProcessFlowStack([])
    setProcessFlowRestoreNodeId(undefined)
    setProcessRouteId(undefined)
    setShortcutsOpen(false)
    setWorkflowsOpen(true)
    if (!opts?.keepService) {
      setPivotId(undefined)
      setCatalogNode(null)
    }
    setProcessFlowNo(no)
  }, [
    setWorkflowInfoId,
    setWorkflowResumeId,
    setShortcutsOpen,
    setWorkflowsOpen,
    setPivotId,
    setCatalogNode,
  ])

  const openProcessRoute = useCallback((routeId: string) => {
    const route = getProcessRoute(routeId)
    if (!route) return
    touchProcessRoute(routeId)
    setWorkflowInfoId(undefined)
    setWorkflowResumeId(undefined)
    setProcessFlowReturn(undefined)
    setProcessFlowStack([])
    setProcessFlowRestoreNodeId(undefined)
    setProcessRouteId(routeId)
    setShortcutsOpen(false)
    setWorkflowsOpen(true)
    setPivotId(undefined)
    setCatalogNode(null)
    setProcessFlowNo(route.processNo)
  }, [
    setWorkflowInfoId,
    setWorkflowResumeId,
    setShortcutsOpen,
    setWorkflowsOpen,
    setPivotId,
    setCatalogNode,
  ])

  const openServiceFromProcessFlow = useCallback(
    async (serviceName: string, nodeId: string, serviceId?: string) => {
      if (!processFlowNo) return
      let pivotServiceId = serviceId
      if (!pivotServiceId) {
        const hits = await searchServices(serviceName).catch(() => [] as Service[])
        const exact =
          hits.find((h) => h.name === serviceName) ??
          hits.find((h) => h.name.toUpperCase() === serviceName.toUpperCase())
        pivotServiceId = exact?.id ?? (hits.length === 1 ? hits[0]?.id : undefined)
      }
      if (!pivotServiceId) return

      const returnTo = { processNo: processFlowNo, nodeId }
      setProcessFlowRestoreNodeId(undefined)
      setProcessFlowNo(undefined)
      selectPivotRef.current(pivotServiceId, {
        resetHistory: true,
        source: 'table',
        keepProcessFlowReturn: true,
      })
      setProcessFlowReturn(returnTo)
    },
    [processFlowNo, selectPivotRef],
  )

  const restoreProcessFlowFromService = useCallback(() => {
    if (!processFlowReturn) return
    const ret = processFlowReturn
    setProcessFlowReturn(undefined)
    setProcessFlowRestoreNodeId(ret.nodeId)
    setProcessFlowNo(ret.processNo)
    setPivotId(undefined)
    resetMethodSelection()
    historyApiRef.current.setHistory([])
    historyApiRef.current.setHistoryIndex(-1)
    setService(undefined)
    setAffected([])
    setCallees([])
    setImpact(undefined)
    setMapExpanded(false)
    setTab('map')
  }, [
    processFlowReturn,
    setPivotId,
    resetMethodSelection,
    historyApiRef,
    setService,
    setAffected,
    setCallees,
    setImpact,
    setMapExpanded,
    setTab,
  ])

  const openSubProcessFromFlow = useCallback(
    (subNo: string, nodeId: string) => {
      if (!processFlowNo) return
      setProcessFlowStack((prev) => [...prev, { processNo: processFlowNo, nodeId }])
      setProcessFlowRestoreNodeId(undefined)
      setProcessFlowNo(subNo)
    },
    [processFlowNo],
  )

  const backToParentProcessFlow = useCallback(() => {
    setProcessFlowStack((prev) => {
      if (!prev.length) return prev
      const parent = prev[prev.length - 1]!
      setProcessFlowRestoreNodeId(parent.nodeId)
      setProcessFlowNo(parent.processNo)
      return prev.slice(0, -1)
    })
  }, [])

  const dismissProcessFlow = useCallback(() => {
    setProcessFlowNo(undefined)
    setProcessFlowReturn(undefined)
    setProcessFlowStack([])
    setProcessFlowRestoreNodeId(undefined)
    setProcessRouteId(undefined)
  }, [])

  const consumeRestoreNode = useCallback(() => {
    setProcessFlowRestoreNodeId(undefined)
  }, [])

  return {
    processFlowNo,
    setProcessFlowNo,
    processRouteId,
    setProcessRouteId,
    processFlowReturn,
    setProcessFlowReturn,
    processFlowStack,
    processFlowRestoreNodeId,
    openProcessFlow,
    openProcessRoute,
    openServiceFromProcessFlow,
    restoreProcessFlowFromService,
    openSubProcessFromFlow,
    backToParentProcessFlow,
    dismissProcessFlow,
    consumeRestoreNode,
  }
}
