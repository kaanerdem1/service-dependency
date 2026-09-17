/**
 * Ana uygulama kabuğu.
 *
 * Sol: modül ağacı · Orta: harita / ilişkiler
 *
 * Seçim modeli:
 * - pivotId          → odak servis (geri/ileri geçmişi ile)
 * - selectedMethodId → odak metod (method haritası)
 * - tab              → 'map' | 'affected' | 'overview' | 'screens' | 'processes'
 * Harita: gelişmiş React Flow (basit etki yolu kaldırıldı).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, LayoutGroup } from 'motion/react'
import { MotionBanner, MotionToast } from './motion/MotionToast'
import { buildServiceStageTabs, type StageTabId } from './motion/StageTabs'
import {
  packageLabelsFromTree,
  packagesInImpact,
  projectLabelsFromTree,
  projectsInImpact,
} from './impact/projectFilter'
import { ChangeRequestModal } from './components/ChangeRequestModal'
import { InboxPanel } from './components/InboxPanel'
import { CatalogEntityOverview } from './components/CatalogEntityOverview'
import { CommandPalette } from './components/CommandPalette'
import { WelcomeScreen } from './components/WelcomeScreen'
import { RequestDetailModal } from './components/RequestDetailModal'
import { DwhPage } from './dwh/DwhPage'
import {
  APP_THEME_KEY,
  readAppTheme,
  themeLabel,
  type AppTheme,
} from './theme'
import { ThemeSwitch } from './components/ThemeSwitch'
import { SurfaceSwitch, type AppSurface } from './components/SurfaceSwitch'
import { WorkflowInfoPage } from './components/WorkflowInfoPage'
import { ProcessFlowPage } from './components/ProcessFlowPage'
import { InboxIcon } from './components/shell/sidebarIcons'
import { ModuleSidebar } from './components/shell/ModuleSidebar'
import { ServiceStage } from './components/shell/ServiceStage'
import { readPersistedAppNav, writePersistedAppNav } from './appNavPersist'
import { useNavDrawers } from './navigation/useNavDrawers'
import {
  useProcessFlowNav,
  type ProcessFlowHistoryApi,
  type SelectPivotFn,
} from './navigation/useProcessFlowNav'
import { useVisitHistory, visitEntry } from './navigation/useVisitHistory'
import { useServiceFavorites } from './useServiceFavorites'
import { useServiceCatalogLinks } from './components/ServiceCatalogPanels'
import {
  getChangeRequest,
  getImpactGraph,
  getInbox,
  markInboxRead,
  getMethodImpactGraph,
  getModuleTree,
  getNeighbors,
  getService,
  getSessionUsers,
  searchMethods,
  searchServices,
} from './api/client'
import { useSnapshotPack, snapshotWatermarkLines } from './snapshot/useSnapshotPack'
import { sidebarOpenAtSnapshot } from './snapshot/sidebarState'
import {
  pushServiceRecent,
  readServiceRecents,
  renameServiceRecent,
} from './serviceRecents'
import { resolveCatalogCanEdit } from './auth/catalogAccess'
import type { SessionUser } from './mock/session'
import type {
  AffectedService,
  ChangeRequest,
  ImpactGraph,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Service,
} from './types'
import './App.css'
import './responsive.css'

function initialSidebarDrawer(restored: ReturnType<typeof readPersistedAppNav>): {
  shortcutsOpen: boolean
  workflowsOpen: boolean
} {
  const drawer = restored?.sidebarDrawer
  if (drawer === 'shortcuts') return { shortcutsOpen: true, workflowsOpen: false }
  if (drawer === 'workflows') return { shortcutsOpen: false, workflowsOpen: true }
  if (restored?.processFlowNo || restored?.processRouteId || restored?.workflowInfoId) {
    return { shortcutsOpen: false, workflowsOpen: true }
  }
  return { shortcutsOpen: false, workflowsOpen: false }
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

type Tab = StageTabId

export default function App() {
  const restoredNav = useMemo(() => readPersistedAppNav(), [])
  const initialDrawer = useMemo(() => initialSidebarDrawer(restoredNav), [restoredNav])
  const [tree, setTree] = useState<ModuleNode[]>([])
  const [query, setQuery] = useState(() => restoredNav?.treeQuery ?? '')
  const [hits, setHits] = useState<Service[]>([])
  const [methodHits, setMethodHits] = useState<MethodRef[]>([])
  const [pivotId, setPivotId] = useState<string | undefined>(() => restoredNav?.pivotId)
  const [catalogNode, setCatalogNode] = useState<{
    id: string
    kind: 'group' | 'package'
    name: string
  } | null>(() => restoredNav?.catalogNode ?? null)
  const [showNonServiceMethods, setShowNonServiceMethods] = useState(false)
  const [treePinServiceId, setTreePinServiceId] = useState<string>()
  const [selectedMethodId, setSelectedMethodId] = useState<string | undefined>(
    () => restoredNav?.selectedMethodId,
  )
  const [methodImpact, setMethodImpact] = useState<MethodImpactGraph>()
  /** Metod seçilmeden Metodlar sekmesini aç (harita +N) — saklandı; detay paneli kaldırıldı */
  const [service, setService] = useState<Service>()
  const [affected, setAffected] = useState<AffectedService[]>([])
  const [callees, setCallees] = useState<AffectedService[]>([])
  const [impact, setImpact] = useState<ImpactGraph>()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>(() => restoredNav?.tab ?? 'map')
  const [apiError, setApiError] = useState<string>()
  const [mapExpanded, setMapExpanded] = useState(false)
  const [mapForceLtrSignal, setMapForceLtrSignal] = useState(0)
  const [tableProjectFilter, setTableProjectFilter] = useState<string | undefined>()
  const [appTheme, setAppTheme] = useState<AppTheme>(() => readAppTheme())
  const [surface, setSurface] = useState<AppSurface>(() => restoredNav?.surface ?? 'services')
  const [navHover, setNavHover] = useState(true)
  const [navPinned, setNavPinned] = useState(true)
  const [navWidth, setNavWidth] = useState(300)
  /** Daraltmada otomatik kısma sonrası geniş ekranda geri yüklenecek genişlik. */
  const navWidthPreferredRef = useRef(300)
  const [allowNavCollapse, setAllowNavCollapse] = useState(false)
  const navExpanded = navPinned || navHover || !allowNavCollapse
  const appFrameStyle = {
    '--sidebar-panel-width': `${navWidth}px`,
  } as CSSProperties
  const stageTopRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLLabelElement>(null)
  const sidebarBodyRef = useRef<HTMLDivElement>(null)

  const { trail, buildClientPayload } = useSnapshotPack()
  const { isFavorite, toggleFavorite } = useServiceFavorites()

  const [session, setSession] = useState<SessionUser>()
  const canEditCatalog = resolveCatalogCanEdit()
  const [catalogServices, setCatalogServices] = useState<Service[]>([])
  const [liveStatus, setLiveStatus] = useState('')
  const [crOpen, setCrOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inbox, setInbox] = useState<{
    actions: { request: ChangeRequest; row: import('./types').ImpactedFlag }[]
    updates: import('./types').InboxNotification[]
    pending: number
  }>()
  const [requestDetail, setRequestDetail] = useState<ChangeRequest>()
  const [returnToInbox, setReturnToInbox] = useState(false)
  const [snapshotToast, setSnapshotToast] = useState<string>()
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const closeCommandPalette = useCallback(() => setCmdkOpen(false), [])
  const { shortcutsOpen, setShortcutsOpen, workflowsOpen, setWorkflowsOpen, lastServicesDrawerRef } =
    useNavDrawers({
      surface,
      initialShortcutsOpen: initialDrawer.shortcutsOpen,
      initialWorkflowsOpen: initialDrawer.workflowsOpen,
      restoredDrawer: restoredNav?.sidebarDrawer,
      onCloseCommandPalette: closeCommandPalette,
    })
  const [workflowInfoId, setWorkflowInfoId] = useState<string | undefined>(
    () => restoredNav?.workflowInfoId,
  )
  const [workflowResumeId, setWorkflowResumeId] = useState<string | undefined>(
    () => restoredNav?.workflowResumeId,
  )
  const [frequentRecents, setFrequentRecents] = useState(() =>
    readServiceRecents().map((r) => ({ id: r.id, name: r.name })),
  )

  // Metod seçimini temizleyen iki küçük yardımcı — `useVisitHistory`'nin
  // `goBack`/`goForward`/`selectVisitIndex` fonksiyonları bunları kullanıyor.
  // Erken tanımlanma nedeni: hook çağrısı bunlara ihtiyaç duyuyor.
  const resetMethodSelection = useCallback(() => {
    setSelectedMethodId(undefined)
    setMethodImpact(undefined)
  }, [])
  const clearMethodKeepService = useCallback(() => {
    resetMethodSelection()
    setTab('map')
  }, [resetMethodSelection])

  const serviceNameById = useMemo(() => {
    const m = new Map(catalogServices.map((s) => [s.id, s.name]))
    if (service) m.set(service.id, service.name)
    return m
  }, [catalogServices, service])

  /**
   * `selectPivot` ve ziyaret geçmişi setter'ları bu hook'tan sonra tanımlanır.
   * Süreç→servis / servis→süreç geçişleri onları ref üzerinden çağırır.
   */
  const selectPivotRef = useRef<SelectPivotFn>(() => {})
  const historyApiRef = useRef<ProcessFlowHistoryApi>({
    setHistory: () => {},
    setHistoryIndex: () => {},
  })

  const {
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
  } = useProcessFlowNav({
    restoredProcessFlowNo: restoredNav?.processFlowNo,
    restoredProcessRouteId: restoredNav?.processRouteId,
    restoredProcessFlowStack: restoredNav?.processFlowStack,
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
  })

  const {
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
    currentVisit,
    visitSteps,
    visitTrailForCmdk,
  } = useVisitHistory({
    restoredHistory: restoredNav?.history,
    restoredHistoryIndex: restoredNav?.historyIndex,
    selectedMethodId,
    hasProcessFlowReturn: Boolean(processFlowReturn),
    onClearMethod: clearMethodKeepService,
    onRestoreProcessFlow: restoreProcessFlowFromService,
    setPivotId,
    resetMethodSelection,
    trail,
    serviceNameById,
  })
  historyApiRef.current = { setHistory, setHistoryIndex }

  useEffect(() => {
    writePersistedAppNav({
      v: 1,
      surface,
      sidebarDrawer: lastServicesDrawerRef.current,
      tab,
      pivotId,
      selectedMethodId,
      catalogNode,
      processFlowNo,
      processRouteId,
      workflowInfoId,
      workflowResumeId,
      processFlowStack,
      history,
      historyIndex,
      treeQuery: query.trim() || undefined,
    })
  }, [
    surface,
    tab,
    pivotId,
    selectedMethodId,
    catalogNode,
    processFlowNo,
    processRouteId,
    workflowInfoId,
    workflowResumeId,
    processFlowStack,
    history,
    historyIndex,
    query,
  ])

  const toggleNavPinned = useCallback(() => {
    setNavPinned((pinned) => {
      const next = !pinned
      if (next) setNavHover(true)
      trail.record(
        'sidebar_toggle',
        undefined,
        next
          ? 'Modül paneli sabitlendi'
          : 'Modül paneli sabitlemesi kaldırıldı',
      )
      return next
    })
  }, [trail])

  const startNavResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = navWidth
      let latestWidth = startWidth
      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(
          272,
          Math.min(460, startWidth + moveEvent.clientX - startX),
        )
        latestWidth = nextWidth
        setNavWidth(nextWidth)
      }
      const handleUp = () => {
        navWidthPreferredRef.current = latestWidth
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [navWidth],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = appTheme
    window.localStorage.setItem(APP_THEME_KEY, appTheme)
  }, [appTheme])

  useEffect(() => {
    const NARROW_MAX = 1100
    const rail = 76
    const minMapViewport = 340
    const clampNav = () => {
      const w = window.innerWidth
      if (w >= NARROW_MAX) {
        setNavWidth(navWidthPreferredRef.current)
        return
      }
      const cap = Math.max(240, Math.min(460, w - rail - minMapViewport))
      setNavWidth((current) => (current > cap ? cap : current))
    }
    clampNav()
    window.addEventListener('resize', clampNav)
    return () => window.removeEventListener('resize', clampNav)
  }, [])

  useEffect(() => {
    if (!snapshotToast) return
    const timer = window.setTimeout(() => setSnapshotToast(undefined), 3000)
    return () => window.clearTimeout(timer)
  }, [snapshotToast])

  useEffect(() => {
    if (apiError) return
    if (loading && pivotId) {
      setLiveStatus('Servis bilgileri yükleniyor…')
      return
    }
    if (tab === 'map' && selectedMethodId && !methodImpact) {
      setLiveStatus('Method etki grafı yükleniyor…')
      return
    }
    if (service) {
      setLiveStatus(`Merkez servis: ${service.name}`)
      return
    }
    setLiveStatus('')
  }, [
    apiError,
    loading,
    pivotId,
    tab,
    selectedMethodId,
    methodImpact,
    service,
  ])

  useEffect(() => {
    void (async () => {
      try {
        const [modules, users] = await Promise.all([
          getModuleTree(),
          getSessionUsers(),
        ])
        setTree(modules)
        setSession(users[0])
        setCatalogServices([])
        setApiError(undefined)
      } catch {
        setApiError('API’ye bağlanılamadı. `cd server && npm run dev` ile backend’i başlatın.')
      }
    })()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      setMethodHits([])
      return
    }
    void searchServices(q).then(setHits).catch(() => setHits([]))
    void searchMethods(q).then(setMethodHits).catch(() => setMethodHits([]))
  }, [query])

  useEffect(() => {
    if (!selectedMethodId) {
      setMethodImpact(undefined)
      return
    }
    let cancelled = false
    void getMethodImpactGraph(selectedMethodId)
      .then((g) => {
        if (!cancelled) setMethodImpact(g)
      })
      .catch(() => {
        if (!cancelled) setMethodImpact(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [selectedMethodId])

  useEffect(() => {
    if (!pivotId) {
      setService(undefined)
      setAffected([])
      setCallees([])
      setImpact(undefined)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.all([
      getService(pivotId),
      getNeighbors(pivotId),
      getImpactGraph(pivotId),
    ])
      .then(([svc, neighbors, graph]) => {
        if (cancelled) return
        setService(svc)
        setAffected(neighbors.downstream)
        setCallees(neighbors.upstream)
        setImpact(graph)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pivotId])

  const refreshInbox = useCallback(async () => {
    if (!session) return
    try {
      const data = await getInbox(session.id)
      setInbox(data)
    } catch {
      /* mock */
    }
  }, [session])

  useEffect(() => {
    void refreshInbox()
  }, [refreshInbox])

  useEffect(() => {
    if (!crOpen && !requestDetail && !inboxOpen) return
    if (allowNavCollapse && !navPinned) setNavHover(false)
  }, [crOpen, requestDetail, inboxOpen, allowNavCollapse, navPinned])

  const flushSnapshotChrome = useCallback(() => {
    trail.syncUi({
      sidebarOpen: sidebarOpenAtSnapshot(navPinned, allowNavCollapse),
      sidebarPinned: navPinned,
    })
  }, [trail, navPinned, allowNavCollapse])

  useEffect(() => {
    trail.syncUi({
      activeTab: tab,
      sidebarOpen: navExpanded,
      sidebarPinned: navPinned,
      searchOpen: Boolean(query.trim()),
      selectedMethodId: selectedMethodId ?? null,
    })
  }, [trail, tab, navExpanded, navPinned, query, selectedMethodId])

  useEffect(() => {
    if (!service) return
    trail.syncFocus({
      level: selectedMethodId ? 'method' : 'service',
      id: selectedMethodId ?? service.id,
      label: service.name,
      treePath: [service.projectId, service.packageId, service.name],
      serviceId: service.id,
    })
  }, [trail, service, selectedMethodId])

  const makeSnapshotContext = useCallback(async () => {
    if (!service) return undefined
    flushSnapshotChrome()
    return buildClientPayload({
      mapEl: mapRootRef.current,
      workspaceEl: workspaceRef.current,
      watermarkLines: snapshotWatermarkLines([service.name]),
    })
  }, [buildClientPayload, service, flushSnapshotChrome])

  const openRequestDetail = useCallback(async (requestId: string, fromInbox = false) => {
    try {
      const req = await getChangeRequest(requestId)
      setRequestDetail(req)
      if (fromInbox) {
        setReturnToInbox(true)
        setInboxOpen(false)
      } else {
        setReturnToInbox(false)
      }
    } catch {
      setSnapshotToast('Talep yüklenemedi')
    }
  }, [])

  const backToInbox = useCallback(() => {
    setRequestDetail(undefined)
    setReturnToInbox(false)
    setInboxOpen(true)
    void refreshInbox()
  }, [refreshInbox])

  const projectLabels = useMemo(() => {
    const m = projectLabelsFromTree(tree)
    if (!impact) return m
    const stamp = (s: { projectId: string; projectLabel?: string; projectGroupLabel?: string }) => {
      if (!s.projectId || s.projectId === 'unknown') return
      m.set(
        s.projectId,
        s.projectLabel || s.projectGroupLabel || m.get(s.projectId) || s.projectId,
      )
    }
    stamp(impact.center)
    for (const n of impact.nodes) stamp(n.service)
    return m
  }, [tree, impact])
  const packageLabels = useMemo(() => packageLabelsFromTree(tree), [tree])
  const impactProjectOptions = useMemo(
    () => (impact ? projectsInImpact(impact, projectLabels) : []),
    [impact, projectLabels],
  )
  const impactPackageOptions = useMemo(
    () => (impact ? packagesInImpact(impact, projectLabels, packageLabels) : []),
    [impact, projectLabels, packageLabels],
  )
  const { screens, processes, loading: catalogLinksLoading } = useServiceCatalogLinks(service?.id)
  const stageTabs = useMemo(
    () => buildServiceStageTabs({ screens: screens.length, processes: processes.length }),
    [screens.length, processes.length],
  )
  const isCatalogTab = tab === 'overview' || tab === 'screens' || tab === 'processes'

  const scrollToStageTop = useCallback(() => {
    const run = () => {
      if (mainRef.current) mainRef.current.scrollTop = 0
      const el = stageTopRef.current
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' })
        return
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    requestAnimationFrame(() => requestAnimationFrame(run))
  }, [])

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
      trail.record('tree_select', {
        level: node.kind,
        id: node.id,
        label: node.name,
      }, node.kind === 'group' ? 'Proje grubundan katalog özeti açıldı' : 'Jar katalog özeti açıldı')
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

  const selectPivot = useCallback(
    (
      id: string,
      opts?: {
        resetHistory?: boolean
        source?: 'tree' | 'map' | 'search' | 'table' | 'workflow'
        keepProcessFlowReturn?: boolean
      },
    ) => {
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
    [clearSelection, history, historyIndex, pivotId, selectedMethodId, trail, catalogServices],
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

  useEffect(() => {
    if (!pivotId) return
    scrollToStageTop()
  }, [pivotId, selectedMethodId, scrollToStageTop])

  useEffect(() => {
    setTableProjectFilter(undefined)
  }, [pivotId])

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

  const hasSelection = !!pivotId || !!catalogNode || !!workflowInfoId || !!processFlowNo
  const hasServiceSelection = !!pivotId && !workflowInfoId && !processFlowNo

  useEffect(() => {
    if (!service?.id?.startsWith('sd-') || !service.name) return
    setFrequentRecents(
      renameServiceRecent(service.id, service.name).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    )
  }, [service?.id, service?.name])

  // Favoriler/İş akışları drawer kısayolları `useNavDrawers` içinde ayrı bir
  // dinleyicide ele alınıyor; burada yalnızca komut paleti (⌘K / Esc) kalıyor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdkOpen(true)
        return
      }

      if (e.key === 'Escape' && cmdkOpen) {
        e.preventDefault()
        setCmdkOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [cmdkOpen])

  return (
    <LayoutGroup id="app-shell">
    <div className="app" data-theme={appTheme}>
      <MotionBanner open={!!apiError}>
        <div className="api-banner-inner">
          {apiError}
          <span className="api-banner-hint">
            {' '}
            Sunucunun çalıştığından emin olun (<code>npm run dev</code>) ve sayfayı yenileyin.
          </span>
        </div>
      </MotionBanner>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="app-status-live sr-only"
      >
        {liveStatus}
      </div>

      <div
        className={`app-frame${navExpanded ? ' sidebar-panel-open' : ' is-nav-collapsed'}${surface === 'dwh' ? ' is-dwh-surface' : ''}`}
        style={appFrameStyle}
      >
        <header className="app-masthead">
          <div className="app-masthead-left">
            <SurfaceSwitch surface={surface} onSurfaceChange={setSurface} />
          </div>
          <div className="app-masthead-brand-wrap">
            <div className="app-brand">
              <img className="brand-mark brand-logo" src="/dwh-logo.png" alt="" aria-hidden />
              <div className="app-brand-copy">
                <strong>{surface === 'dwh' ? 'DWH Katalog' : 'Servis Kataloğu'}</strong>
                <span className="brand-tagline">
                  {surface === 'dwh'
                    ? 'Tablo, kolon ve rapor lineage kataloğu'
                    : 'Servis bağımlılıkları ve değişiklik etkisi'}
                </span>
              </div>
            </div>
          </div>
          <div className="app-masthead-actions">
            <ThemeSwitch
              theme={appTheme}
              onChange={(next) => {
                trail.record(
                  'theme_toggle',
                  undefined,
                  `${themeLabel(appTheme)} → ${themeLabel(next)}`,
                )
                setAppTheme(next)
              }}
            />
            {surface === 'services' && session ? (
              <button
                type="button"
                className="masthead-icon-btn"
                aria-label={
                  inbox && inbox.pending > 0
                    ? `Gelen kutusu, ${inbox.pending} okunmamış`
                    : 'Gelen kutusu'
                }
                title="Gelen kutusu"
                onClick={() => setInboxOpen(true)}
              >
                <InboxIcon />
                {inbox && inbox.pending > 0 ? (
                  <span className="masthead-icon-badge">{inbox.pending}</span>
                ) : null}
              </button>
            ) : null}
          </div>
        </header>

        <div className="app-frame-body">
        {surface === 'dwh' ? (
          <div className="workspace-column dwh-workspace-column">
            <div className="workspace">
              <DwhPage surface={surface} onSurfaceChange={setSurface} />
            </div>
          </div>
        ) : (
        <>
        <ModuleSidebar
          navExpanded={navExpanded}
          navPinned={navPinned}
          allowNavCollapse={allowNavCollapse}
          onNavHoverChange={setNavHover}
          shortcutsOpen={shortcutsOpen}
          workflowsOpen={workflowsOpen}
          onToggleShortcuts={() => {
            setWorkflowsOpen(false)
            setShortcutsOpen((v) => !v)
          }}
          onToggleWorkflows={() => {
            setShortcutsOpen(false)
            setWorkflowsOpen((v) => !v)
          }}
          onTogglePin={toggleNavPinned}
          onResizePointerDown={startNavResize}
          searchRef={searchRef}
          query={query}
          onQueryChange={setQuery}
          hits={hits}
          methodHits={methodHits}
          appTheme={appTheme}
          onOpenCommandPalette={() => setCmdkOpen(true)}
          onSelectServiceFromSearch={(id) => {
            selectPivot(id, { resetHistory: true, source: 'search' })
            setQuery('')
          }}
          onSelectMethod={selectMethod}
          tree={tree}
          pivotId={pivotId}
          pivotName={service?.name}
          selectedMethodId={selectedMethodId}
          catalogNodeId={catalogNode?.id}
          sidebarBodyRef={sidebarBodyRef}
          showNonServiceMethods={showNonServiceMethods}
          onShowNonServiceMethodsChange={setShowNonServiceMethods}
          treePinServiceId={treePinServiceId}
          onClearPin={() => setTreePinServiceId(undefined)}
          onSelectCatalogNode={selectCatalogNode}
          onSelectServiceFromTree={(id) =>
            selectPivot(id, { resetHistory: true, source: 'tree' })
          }
          mapExpanded={mapExpanded}
          onCloseShortcuts={() => setShortcutsOpen(false)}
          onCloseWorkflows={() => setWorkflowsOpen(false)}
          onOpenFolder={openWorkflowFolder}
          onOpenProcess={openProcessFlow}
          onOpenProcessRoute={openProcessRoute}
          workflowInfoId={workflowInfoId}
          processFlowNo={processFlowNo}
          processRouteId={processRouteId}
          canEditCatalog={canEditCatalog}
          setTreePinServiceId={setTreePinServiceId}
          setQuery={setQuery}
          selectPivot={selectPivot}
        />

        <div className="workspace-column">
          <div className="workspace" ref={workspaceRef}>
          <main
          className={`main${hasServiceSelection && tab === 'map' ? ' main-map' : ''}${hasServiceSelection && isCatalogTab ? ' main-overview' : ''}${catalogNode && !pivotId ? ' main-catalog-entity' : ''}${workflowInfoId && !processFlowNo ? ' main-catalog-entity main-overview' : ''}${processFlowNo ? ' main-process-flow' : ''}${!hasSelection ? ' is-empty' : ''}`}
          ref={mainRef}
        >
          {!hasSelection && <WelcomeScreen />}

          {processFlowNo ? (
            <div className="stage-body pf-map-stage">
              <ProcessFlowPage
                processNo={processFlowNo}
                routeId={processRouteId}
                onRouteSaved={setProcessRouteId}
                initialSelectedNodeId={processFlowRestoreNodeId}
                onRestoreConsumed={consumeRestoreNode}
                onOpenService={openServiceFromProcessFlow}
                onOpenSubProcess={openSubProcessFromFlow}
                canGoBack={processFlowStack.length > 0}
                onBackToParent={backToParentProcessFlow}
                onDismiss={dismissProcessFlow}
              />
            </div>
          ) : null}

          {workflowInfoId && !processFlowNo ? (
            <div className="stage-body wf-info-stage">
              <WorkflowInfoPage
                folderId={workflowInfoId}
                onOpenFolder={openWorkflowFolder}
                onSelectService={(id) => {
                  setWorkflowResumeId(workflowInfoId)
                  setTreePinServiceId(undefined)
                  setQuery('')
                  selectPivot(id, { resetHistory: true, source: 'workflow' })
                }}
                onDismiss={() => setWorkflowInfoId(undefined)}
                canEdit={canEditCatalog}
              />
            </div>
          ) : null}

          {catalogNode && !pivotId && !workflowInfoId && !processFlowNo ? (
            <div className="stage-body">
              <CatalogEntityOverview
                nodeId={catalogNode.id}
                kind={catalogNode.kind}
                onSelectGroup={(id, name) => selectCatalogNode({ id, kind: 'group', name })}
                onSelectJar={(id, name) => selectCatalogNode({ id, kind: 'package', name })}
                onSelectService={(id) => selectPivot(id, { resetHistory: true, source: 'tree' })}
                onDismiss={clearSelection}
              />
            </div>
          ) : null}

          {hasServiceSelection && (
            <ServiceStage
              service={service}
              pivotId={pivotId}
              tab={tab}
              stageTabs={stageTabs}
              stageTopRef={stageTopRef}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
              onOpenWorkflowFolder={(folderId) => {
                setShortcutsOpen(false)
                setWorkflowsOpen(false)
                openWorkflowFolder(folderId)
              }}
              onOpenWorkflowsRoot={() => {
                setShortcutsOpen(false)
                setWorkflowInfoId(undefined)
                setWorkflowsOpen(true)
              }}
              workflowResumeId={workflowResumeId}
              onReturnToWorkflow={returnToWorkflow}
              onClearSelection={clearSelection}
              session={session}
              onOpenChangeRequest={() => setCrOpen(true)}
              trail={trail}
              setTab={setTab}
              setMapExpanded={setMapExpanded}
              visitSteps={visitSteps}
              historyIndex={historyIndex}
              historyLength={history.length}
              onSelectVisitIndex={selectVisitIndex}
              selectedMethodId={selectedMethodId}
              methodImpact={methodImpact}
              mapExpanded={mapExpanded}
              onSelectMethod={selectMethod}
              onClearMethod={clearMethodKeepService}
              selectPivot={selectPivot}
              goBack={goBack}
              goForward={goForward}
              processFlowReturn={processFlowReturn}
              impact={impact}
              mapForceLtrSignal={mapForceLtrSignal}
              impactProjectOptions={impactProjectOptions}
              impactPackageOptions={impactPackageOptions}
              onBrowseMethods={browseServiceMethods}
              onLeaveServiceSelection={leaveServiceSelection}
              currentVisit={currentVisit}
              onViewStateChange={saveMapViewState}
              navDirection={navDirection}
              onNavDirectionConsumed={() => setNavDirection(null)}
              mapRootRef={mapRootRef}
              onBeforeSnapshot={flushSnapshotChrome}
              onSnapshotToast={setSnapshotToast}
              loading={loading}
              affected={affected}
              callees={callees}
              tableProjectFilter={tableProjectFilter}
              projectLabels={projectLabels}
              packageLabels={packageLabels}
              onClearProjectFilter={() => setTableProjectFilter(undefined)}
              setTableProjectFilter={setTableProjectFilter}
              screens={screens}
              processes={processes}
              catalogLinksLoading={catalogLinksLoading}
              canEditCatalog={canEditCatalog}
              onOpenProcessKeepService={(no) => openProcessFlow(no, { keepService: true })}
            />
          )}
        </main>
          </div>
        </div>
        </>
        )}
        </div>
      </div>

      <MotionToast open={!!snapshotToast}>
        {snapshotToast}
        <button type="button" onClick={() => setSnapshotToast(undefined)}>
          ×
        </button>
      </MotionToast>

      <CommandPalette
        open={cmdkOpen}
        theme={appTheme}
        onOpenChange={setCmdkOpen}
        frequent={frequentRecents}
        visitTrail={visitTrailForCmdk}
        onSelectService={(id) => selectPivot(id, { resetHistory: true, source: 'search' })}
        onSelectMethod={selectMethod}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenFavorites={() => {
          setWorkflowsOpen(false)
          setShortcutsOpen((v) => !v)
        }}
        onOpenWorkflows={() => {
          setShortcutsOpen(false)
          setWorkflowsOpen((v) => !v)
        }}
      />

      <AnimatePresence>
      {crOpen && service && session && (
        <ChangeRequestModal
          key="cr-modal"
          service={service}
          affected={affected}
          session={session}
          buildSnapshotContext={makeSnapshotContext}
          onClose={() => setCrOpen(false)}
          onCreated={() => {
            setCrOpen(false)
            setSnapshotToast(
              'Talep açıldı — Snapshot sekmesinden PNG indirebilirsiniz',
            )
            void refreshInbox()
          }}
        />
      )}
      </AnimatePresence>

      <AnimatePresence>
      {inboxOpen && session && inbox && (
        <InboxPanel
          key="inbox-panel"
          actions={inbox.actions}
          updates={inbox.updates}
          onOpen={(id) => void openRequestDetail(id, true)}
          onClose={() => setInboxOpen(false)}
          onMarkRead={() => {
            if (!session) return
            void markInboxRead(session.id).then(() => refreshInbox())
          }}
        />
      )}
      </AnimatePresence>

      <AnimatePresence>
      {requestDetail && session && (
        <RequestDetailModal
          key={`request-${requestDetail.id}`}
          request={requestDetail}
          session={session}
          buildSnapshotContext={makeSnapshotContext}
          onBackToInbox={returnToInbox ? backToInbox : undefined}
          onClose={() => {
            if (returnToInbox) backToInbox()
            else setRequestDetail(undefined)
          }}
          onUpdated={(req) => {
            setRequestDetail(req)
            setSnapshotToast('Onay kaydedildi — snapshot alındı')
            void refreshInbox()
          }}
        />
      )}
      </AnimatePresence>
    </div>
    </LayoutGroup>
  )
}
