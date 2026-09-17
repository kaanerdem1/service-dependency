/**
 * Servis / katalog / klasör seçimi (Faz 1 — selectPivot).
 *
 * Ne yapar: Pivot servis, metod, proje/jar katalog özeti ve iş akışı klasörü
 *   arasında geçiş; seçimi temizleme; workflow’a dönüş.
 * Ne yapmaz: Graf yüklemez (o `useServiceStageData`); süreç rotasını yönetmez
 *   (`useProcessFlowNav` — `selectPivotRef` ile bağlanır).
 * Kural: Aynı servise ağaçtan tekrar tıklamak seçimi kapatır; workflow kaynağı
 *   hariç. Yeni servis seçimi her zaman Harita sekmesinden açılır (tablo /
 *   servis işlevi vb. son sekme hatırlanmaz).
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { pushServiceRecent } from '../serviceRecents'
import type { TrailAction, TrailEntry, ModuleNode, MethodImpactGraph, Service } from '../types'
import type { SelectPivotFn, ProcessFlowAnchor } from './useProcessFlowNav'
import { visitEntry, type VisitEntry } from './useVisitHistory'
import type { StageTabId } from '../motion/StageTabs'

type CatalogNode = { id: string; kind: 'group' | 'package'; name: string }

type TrailRecorder = {
  record: (action: TrailAction, target?: TrailEntry['target'], detail?: string) => void
}

type Params = {
  pivotId: string | undefined
  selectedMethodId: string | undefined
  catalogNode: CatalogNode | null
  catalogServices: Service[]
  history: VisitEntry[]
  historyIndex: number
  workflowResumeId: string | undefined
  trail: TrailRecorder
  selectPivotRef: MutableRefObject<SelectPivotFn>
  resetMethodSelection: () => void
  setPivotId: Dispatch<SetStateAction<string | undefined>>
  setCatalogNode: Dispatch<SetStateAction<CatalogNode | null>>
  setTreePinServiceId: Dispatch<SetStateAction<string | undefined>>
  setSelectedMethodId: Dispatch<SetStateAction<string | undefined>>
  setMethodImpact: Dispatch<SetStateAction<MethodImpactGraph | undefined>>
  setHistory: Dispatch<SetStateAction<VisitEntry[]>>
  setHistoryIndex: Dispatch<SetStateAction<number>>
  setNavDirection: Dispatch<SetStateAction<'forward' | 'back' | null>>
  setService: Dispatch<SetStateAction<Service | undefined>>
  setAffected: Dispatch<SetStateAction<import('../types').AffectedService[]>>
  setCallees: Dispatch<SetStateAction<import('../types').AffectedService[]>>
  setImpact: Dispatch<SetStateAction<import('../types').ImpactGraph | undefined>>
  setMapExpanded: Dispatch<SetStateAction<boolean>>
  setAllowNavCollapse: Dispatch<SetStateAction<boolean>>
  setNavHover: Dispatch<SetStateAction<boolean>>
  setWorkflowInfoId: Dispatch<SetStateAction<string | undefined>>
  setWorkflowResumeId: Dispatch<SetStateAction<string | undefined>>
  setProcessFlowNo: Dispatch<SetStateAction<string | undefined>>
  setProcessFlowReturn: Dispatch<SetStateAction<ProcessFlowAnchor | undefined>>
  setTab: Dispatch<SetStateAction<StageTabId>>
  setFrequentRecents: Dispatch<SetStateAction<{ id: string; name: string }[]>>
  setMapForceLtrSignal: Dispatch<SetStateAction<number>>
}

export function useServiceSelection({
  pivotId,
  selectedMethodId,
  catalogNode,
  catalogServices,
  history,
  historyIndex,
  workflowResumeId,
  trail,
  selectPivotRef,
  resetMethodSelection,
  setPivotId,
  setCatalogNode,
  setTreePinServiceId,
  setSelectedMethodId,
  setMethodImpact,
  setHistory,
  setHistoryIndex,
  setNavDirection,
  setService,
  setAffected,
  setCallees,
  setImpact,
  setMapExpanded,
  setAllowNavCollapse,
  setNavHover,
  setWorkflowInfoId,
  setWorkflowResumeId,
  setProcessFlowNo,
  setProcessFlowReturn,
  setTab,
  setFrequentRecents,
  setMapForceLtrSignal,
}: Params) {
  const clearSelection = useCallback(() => {
    setPivotId(undefined)
    setCatalogNode(null)
    setTreePinServiceId(undefined)
    setSelectedMethodId(undefined)
    setMethodImpact(undefined)
    setHistory([])
    setHistoryIndex(-1)
    setService(undefined)
    setAffected([])
    setCallees([])
    setImpact(undefined)
    setMapExpanded(false)
    setAllowNavCollapse(false)
    setNavHover(true)
    setWorkflowInfoId(undefined)
    setWorkflowResumeId(undefined)
    setProcessFlowNo(undefined)
  }, [])

  const returnToWorkflow = useCallback(() => {
    const resume = workflowResumeId
    if (!resume) {
      clearSelection()
      return
    }
    setPivotId(undefined)
    setCatalogNode(null)
    setTreePinServiceId(undefined)
    setSelectedMethodId(undefined)
    setMethodImpact(undefined)
    setHistory([])
    setHistoryIndex(-1)
    setService(undefined)
    setAffected([])
    setCallees([])
    setImpact(undefined)
    setMapExpanded(false)
    setAllowNavCollapse(false)
    setNavHover(true)
    setWorkflowInfoId(resume)
  }, [clearSelection, workflowResumeId])

  const leaveServiceSelection = useCallback(() => {
    if (workflowResumeId) {
      returnToWorkflow()
      return
    }
    clearSelection()
  }, [clearSelection, returnToWorkflow, workflowResumeId])

  const openWorkflowFolder = useCallback((id: string) => {
    setProcessFlowNo(undefined)
    setWorkflowResumeId(id)
    setWorkflowInfoId(id)
  }, [])

  const selectCatalogNode = useCallback(
    (node: ModuleNode) => {
      if (node.kind !== 'group' && node.kind !== 'package') return
      if (catalogNode?.id === node.id && !pivotId) {
        clearSelection()
        return
      }
      trail.record(
        'tree_select',
        {
          level: node.kind,
          id: node.id,
          label: node.name,
        },
        node.kind === 'group' ? 'Proje grubundan katalog özeti açıldı' : 'Jar katalog özeti açıldı',
      )
      setPivotId(undefined)
      setSelectedMethodId(undefined)
      setMethodImpact(undefined)
      setService(undefined)
      setAffected([])
      setCallees([])
      setImpact(undefined)
      setMapExpanded(false)
      setCatalogNode({ id: node.id, kind: node.kind, name: node.name })
      setWorkflowInfoId(undefined)
      setWorkflowResumeId(undefined)
      setProcessFlowNo(undefined)
      setAllowNavCollapse(true)
    },
    [catalogNode?.id, pivotId, clearSelection, trail],
  )

  const selectPivot = useCallback<SelectPivotFn>(
    (id, opts) => {
      if (!opts?.keepProcessFlowReturn) {
        setProcessFlowReturn(undefined)
      }
      setCatalogNode(null)
      setWorkflowInfoId(undefined)
      setProcessFlowNo(undefined)
      if (opts?.source !== 'workflow') setWorkflowResumeId(undefined)
      setTreePinServiceId(
        opts?.source === 'search' || opts?.source === 'table' ? id : undefined,
      )
      if (id === pivotId && !selectedMethodId) {
        if (opts?.source === 'workflow') return
        clearSelection()
        return
      }
      const label = catalogServices.find((s) => s.id === id)?.name ?? id
      trail.record(
        opts?.source === 'map'
          ? 'map_select'
          : opts?.source === 'search' || opts?.source === 'table'
            ? 'search_select'
            : 'tree_select',
        {
          level: 'service',
          id,
          label,
        },
        opts?.source === 'map'
          ? 'Haritadan yeni servis seçildi'
          : opts?.source === 'table'
            ? 'Tablodan servis seçildi'
            : opts?.source === 'search'
              ? 'Arama ile servis seçildi'
              : 'Ağaçtan servis seçildi',
      )
      setSelectedMethodId(undefined)
      setMethodImpact(undefined)
      setAllowNavCollapse(true)
      setTab('map')
      if (opts?.resetHistory) {
        setNavDirection(null)
        setHistory([visitEntry(id)])
        setHistoryIndex(0)
        setPivotId(id)
        setMapExpanded(false)
        window.sessionStorage.setItem('sd-impact-map-layout-mode', 'ltr')
        setMapForceLtrSignal((n) => n + 1)
        setFrequentRecents(
          pushServiceRecent(id, label).map((r) => ({ id: r.id, name: r.name })),
        )
        return
      }
      setNavDirection('forward')
      const next = [...history.slice(0, historyIndex + 1), visitEntry(id)]
      setHistory(next)
      setHistoryIndex(next.length - 1)
      setPivotId(id)
      setFrequentRecents(
        pushServiceRecent(id, label).map((r) => ({ id: r.id, name: r.name })),
      )
    },
    [
      clearSelection,
      history,
      historyIndex,
      pivotId,
      selectedMethodId,
      trail,
      catalogServices,
      setTab,
    ],
  )
  selectPivotRef.current = selectPivot

  const selectMethod = useCallback(
    (serviceId: string, methodId: string) => {
      setAllowNavCollapse(true)
      setSelectedMethodId(methodId)
      setTab('map')
      if (serviceId && serviceId !== pivotId) {
        setHistory([visitEntry(serviceId)])
        setHistoryIndex(0)
        setPivotId(serviceId)
        const name =
          catalogServices.find((s) => s.id === serviceId)?.name ?? serviceId
        setFrequentRecents(
          pushServiceRecent(serviceId, name).map((r) => ({ id: r.id, name: r.name })),
        )
      }
    },
    [pivotId, catalogServices],
  )

  const browseServiceMethods = useCallback(
    (serviceId: string) => {
      resetMethodSelection()
      setTab('map')
      if (serviceId !== pivotId) {
        setHistory([visitEntry(serviceId)])
        setHistoryIndex(0)
        setPivotId(serviceId)
      }
    },
    [pivotId, resetMethodSelection, setHistory, setHistoryIndex],
  )

  return {
    clearSelection,
    returnToWorkflow,
    leaveServiceSelection,
    openWorkflowFolder,
    selectCatalogNode,
    selectPivot,
    selectMethod,
    browseServiceMethods,
  }
}
