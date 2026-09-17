/**
 * Servis "ziyaret geçmişi" (ana harita/tablo ekranındaki Geri/İleri yığını).
 *
 * Ne yapar:
 *   - Ziyaret edilen servislerin sırasını (`history`) ve o an hangisinde
 *     olunduğunu (`historyIndex`) tutar. Her giriş ayrıca haritanın o servis
 *     için hangi derinlikte açıldığını (`visibleMaxHop`, `expandedLayers`)
 *     saklar — Geri gidince harita kaldığı yerden açılsın diye.
 *   - `goBack` / `goForward` / `selectVisitIndex` (breadcrumb'a tıklama) ile
 *     bu yığında gezinmeyi sağlar.
 *   - `goBack`, geçmişte servis yoksa da çalışır: önce "seçili metod" varsa
 *     onu temizler, sonra "süreç akışından gelinmişse" oraya döner — bu
 *     nedenle hook, bu iki durumu `onClearMethod` / `onRestoreProcessFlow`
 *     callback'leri ile alır. Restore'un sahibi `useProcessFlowNav`'dır.
 *
 * Ne yapmaz:
 *   - `pivotId`'yi (hangi servisin o an ekranda gösterildiği) kendi başına
 *     yönetmez — `App.tsx`'teki `setPivotId`'yi çağırır. Aynı şekilde metod
 *     seçimini temizlemek için `setSelectedMethodId` / `setMethodImpact`
 *     parametre olarak geliyor.
 *   - Yeni bir servise "ilk kez" gidiş (`resetHistory`) veya listeye "ekleme"
 *     (push) mantığını sarmalamaz; `history` / `historyIndex` / `navDirection`
 *     ham state olarak dışa açık — `App.tsx`'teki `selectPivot`,
 *     `selectMethod`, `clearSelection` gibi fonksiyonlar bunları öncekiyle
 *     birebir aynı şekilde doğrudan güncelliyor. (Bu, davranışı hiç
 *     değiştirmeden taşımak için bilinçli bir tercih — bkz. docs/refactor-plan.md.)
 *
 * İlgili: docs/refactor-plan.md — Faz 1.
 */
import { useCallback, useMemo, useState } from 'react'
import type { StageTabId } from '../motion/StageTabs'
import type { TrailAction, TrailEntry } from '../types'

export type VisitEntry = {
  id: string
  visibleMaxHop: number
  expandedLayers: number[]
}

export type VisitPathStep = {
  id: string
  name: string
}

export function visitEntry(id: string, view?: Partial<Omit<VisitEntry, 'id'>>): VisitEntry {
  return {
    id,
    visibleMaxHop: view?.visibleMaxHop ?? 1,
    expandedLayers: view?.expandedLayers ? [...view.expandedLayers] : [],
  }
}

type TrailRecorder = {
  record: (action: TrailAction, target?: TrailEntry['target'], detail?: string) => void
}

type Params = {
  restoredHistory?: VisitEntry[]
  restoredHistoryIndex?: number
  selectedMethodId: string | undefined
  hasProcessFlowReturn: boolean
  onClearMethod: () => void
  onRestoreProcessFlow: () => void
  setPivotId: (id: string) => void
  /** Servis değişince sahne sekmesi — yeni pivot her zaman harita. */
  setTab: (tab: StageTabId) => void
  /** Metod seçimini ve metod etki grafını temizler (`setSelectedMethodId(undefined)` + `setMethodImpact(undefined)`). */
  resetMethodSelection: () => void
  trail: TrailRecorder
  /** Servis id → görünen ad (breadcrumb ve komut paleti etiketleri için). */
  serviceNameById: Map<string, string>
}

export function useVisitHistory({
  restoredHistory,
  restoredHistoryIndex,
  selectedMethodId,
  hasProcessFlowReturn,
  onClearMethod,
  onRestoreProcessFlow,
  setPivotId,
  setTab,
  resetMethodSelection,
  trail,
  serviceNameById,
}: Params) {
  const [history, setHistory] = useState<VisitEntry[]>(() => restoredHistory ?? [])
  const [historyIndex, setHistoryIndex] = useState(() => restoredHistoryIndex ?? -1)
  const [navDirection, setNavDirection] = useState<'back' | 'forward' | null>(null)

  const goBack = useCallback(() => {
    if (selectedMethodId) {
      onClearMethod()
      return
    }
    if (hasProcessFlowReturn) {
      trail.record('nav_back', undefined, 'Süreç akışına geri dönüldü')
      onRestoreProcessFlow()
      return
    }
    if (historyIndex <= 0) return
    trail.record('nav_back')
    const i = historyIndex - 1
    setNavDirection('back')
    setHistoryIndex(i)
    setTab('map')
    setPivotId(history[i]!.id)
  }, [
    selectedMethodId,
    onClearMethod,
    hasProcessFlowReturn,
    trail,
    onRestoreProcessFlow,
    historyIndex,
    history,
    setPivotId,
    setTab,
  ])

  const goForward = useCallback(() => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return
    trail.record('nav_forward')
    const i = historyIndex + 1
    setNavDirection('forward')
    setHistoryIndex(i)
    resetMethodSelection()
    setTab('map')
    setPivotId(history[i]!.id)
  }, [historyIndex, history, trail, resetMethodSelection, setPivotId, setTab])

  const selectVisitIndex = useCallback(
    (i: number) => {
      if (i === historyIndex || i < 0 || i >= history.length) return
      setNavDirection(i < historyIndex ? 'back' : 'forward')
      setHistoryIndex(i)
      resetMethodSelection()
      setTab('map')
      setPivotId(history[i]!.id)
    },
    [history, historyIndex, resetMethodSelection, setPivotId, setTab],
  )

  const saveMapViewState = useCallback(
    (view: { visibleMaxHop: number; expandedLayers: number[] }) => {
      setHistory((prev) => {
        if (historyIndex < 0 || historyIndex >= prev.length) return prev
        const cur = prev[historyIndex]!
        const sameLayers =
          cur.expandedLayers.length === view.expandedLayers.length &&
          cur.expandedLayers.every((h, i) => h === view.expandedLayers[i])
        if (cur.visibleMaxHop === view.visibleMaxHop && sameLayers) return prev
        const next = [...prev]
        next[historyIndex] = {
          ...cur,
          visibleMaxHop: view.visibleMaxHop,
          expandedLayers: [...view.expandedLayers],
        }
        return next
      })
    },
    [historyIndex],
  )

  const breadcrumb = historyIndex >= 0 ? history.slice(0, historyIndex + 1) : []
  const currentVisit =
    historyIndex >= 0 && historyIndex < history.length ? history[historyIndex] : undefined

  const visitSteps: VisitPathStep[] = useMemo(
    () =>
      breadcrumb.map((e) => ({
        id: e.id,
        name: serviceNameById.get(e.id) ?? e.id,
      })),
    [breadcrumb, serviceNameById],
  )

  const visitTrailForCmdk = useMemo(() => {
    const seen = new Set<string>()
    const out: { id: string; name: string }[] = []
    for (let i = history.length - 1; i >= 0; i--) {
      const id = history[i]!.id
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, name: serviceNameById.get(id) ?? id })
    }
    return out
  }, [history, serviceNameById])

  return {
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    navDirection,
    setNavDirection,
    goBack,
    goForward,
    selectVisitIndex,
    saveMapViewState,
    breadcrumb,
    currentVisit,
    visitSteps,
    visitTrailForCmdk,
  }
}
