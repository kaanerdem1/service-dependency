/**
 * App.tsx kabuğunun state, effect ve prop wiring’i.
 * Görünüm App.tsx’te kalır.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { buildServiceStageTabs, type StageTabId } from '../motion/StageTabs'
import {
  packageLabelsFromTree,
  packagesInImpact,
  projectLabelsFromTree,
  projectsInImpact,
} from '../impact/projectFilter'
import { APP_THEME_KEY, readAppTheme, type AppTheme } from '../theme'
import { type AppSurface } from '../components/shell/SurfaceSwitch'
import { useServicesWorkspaceProps } from '../components/shell/useServicesWorkspaceProps'
import { useAppShellOverlaysProps } from '../components/shell/useAppShellOverlaysProps'
import { readPersistedAppNav } from '../appNavPersist'
import { useNavDrawers } from '../navigation/useNavDrawers'
import {
  useProcessFlowNav,
  type ProcessFlowHistoryApi,
  type SelectPivotFn,
} from '../navigation/useProcessFlowNav'
import { useVisitHistory } from '../navigation/useVisitHistory'
import { useServiceSelection } from '../navigation/useServiceSelection'
import { useServiceStageData } from '../navigation/useServiceStageData'
import { initialSidebarDrawer } from '../navigation/appShellHelpers'
import { usePersistedAppNav } from '../navigation/usePersistedAppNav'
import { useSidebarLayout } from '../navigation/useSidebarLayout'
import { useInboxAndChangeRequests } from '../navigation/useInboxAndChangeRequests'
import { useCommandPaletteKeyboard } from '../navigation/useCommandPaletteKeyboard'
import { useServiceFavorites } from '../stores/useServiceFavorites'
import { useServiceCatalogLinks } from '../components/catalog/ServiceCatalogPanels'
import {
  getModuleTree,
  getSessionUsers,
  searchMethods,
  searchServices,
} from '../api/client'
import { useSnapshotPack, snapshotWatermarkLines } from '../snapshot/useSnapshotPack'
import { sidebarOpenAtSnapshot } from '../snapshot/sidebarState'
import { readServiceRecents } from '../stores/serviceRecents'
import { resolveCatalogCanEdit } from '../auth/catalogAccess'
import type { SessionUser } from '../mock/session'
import type {
  AffectedService,
  ImpactGraph,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Service,
} from '../types'
type Tab = StageTabId

export function useServiceCatalogShell() {
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
  const { trail, buildClientPayload } = useSnapshotPack()
  const {
    setNavHover,
    navPinned,
    navExpanded,
    allowNavCollapse,
    setAllowNavCollapse,
    appFrameStyle,
    toggleNavPinned,
    startNavResize,
  } = useSidebarLayout(trail)
  const stageTopRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLLabelElement>(null)
  const sidebarBodyRef = useRef<HTMLDivElement>(null)

  const { isFavorite, toggleFavorite } = useServiceFavorites()

  const [session, setSession] = useState<SessionUser>()
  const canEditCatalog = resolveCatalogCanEdit()
  const [catalogServices, setCatalogServices] = useState<Service[]>([])
  const [liveStatus, setLiveStatus] = useState('')
  const [snapshotToast, setSnapshotToast] = useState<string>()
  const {
    crOpen,
    setCrOpen,
    inboxOpen,
    setInboxOpen,
    inbox,
    requestDetail,
    setRequestDetail,
    returnToInbox,
    refreshInbox,
    openRequestDetail,
    backToInbox,
    markAllInboxRead,
    closeRequestDetail,
  } = useInboxAndChangeRequests(session, (message) => setSnapshotToast(message))
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
   * `selectPivot` `useServiceSelection` içinde; süreç→servis geçişi
   * `selectPivotRef` üzerinden bağlanır.
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
    setTab,
    resetMethodSelection,
    trail,
    serviceNameById,
  })
  historyApiRef.current = { setHistory, setHistoryIndex }

  const {
    clearSelection,
    returnToWorkflow,
    leaveServiceSelection,
    openWorkflowFolder,
    selectCatalogNode,
    selectPivot,
    selectMethod,
    browseServiceMethods,
  } = useServiceSelection({
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
  })

  usePersistedAppNav({
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
    treeQuery: query,
    sidebarDrawerRef: lastServicesDrawerRef,
  })

  useEffect(() => {
    document.documentElement.dataset.theme = appTheme
    window.localStorage.setItem(APP_THEME_KEY, appTheme)
  }, [appTheme])

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
    if (shortcutsOpen || workflowsOpen) setAllowNavCollapse(true)
  }, [shortcutsOpen, workflowsOpen, setAllowNavCollapse])

  useEffect(() => {
    if (!crOpen && !requestDetail && !inboxOpen) return
    if (allowNavCollapse && !navPinned) setNavHover(false)
  }, [crOpen, requestDetail, inboxOpen, allowNavCollapse, navPinned, setNavHover])

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

  useServiceStageData({
    pivotId,
    selectedMethodId,
    service,
    scrollToStageTop,
    setService,
    setAffected,
    setCallees,
    setImpact,
    setLoading,
    setMethodImpact,
    setTableProjectFilter,
    setFrequentRecents,
  })

  const hasSelection = !!pivotId || !!catalogNode || !!workflowInfoId || !!processFlowNo
  const hasServiceSelection = !!pivotId && !workflowInfoId && !processFlowNo

  useCommandPaletteKeyboard(cmdkOpen, setCmdkOpen)

  const { sidebar: workspaceSidebar, stage: workspaceStage } =
    useServicesWorkspaceProps({
      layout: {
        navExpanded,
        navPinned,
        allowNavCollapse,
        onNavHoverChange: setNavHover,
        onTogglePin: toggleNavPinned,
        onResizePointerDown: startNavResize,
      },
      drawers: {
        shortcutsOpen,
        workflowsOpen,
        setShortcutsOpen,
        setWorkflowsOpen,
      },
      search: {
        searchRef,
        query,
        setQuery,
        hits,
        methodHits,
        appTheme,
        onOpenCommandPalette: () => setCmdkOpen(true),
      },
      tree: {
        tree,
        pivotId,
        pivotName: service?.name,
        selectedMethodId,
        catalogNodeId: catalogNode?.id,
        sidebarBodyRef,
        showNonServiceMethods,
        setShowNonServiceMethods: setShowNonServiceMethods,
        treePinServiceId,
        setTreePinServiceId,
        mapExpanded,
        canEditCatalog,
      },
      nav: {
        selectPivot,
        selectMethod,
        selectCatalogNode,
        openWorkflowFolder,
        openProcessFlow,
        openProcessRoute,
      },
      workflow: {
        workflowInfoId,
        workflowResumeId,
        setWorkflowInfoId,
        setWorkflowResumeId,
        returnToWorkflow,
      },
      processFlow: {
        processFlowNo,
        processRouteId,
        processFlowRestoreNodeId,
        processFlowStackLength: processFlowStack.length,
        setProcessRouteId,
        consumeRestoreNode,
        openServiceFromProcessFlow,
        openSubProcessFromFlow,
        backToParentProcessFlow,
        dismissProcessFlow,
      },
      stage: {
        mainRef,
        tab,
        isCatalogTab,
        catalogNode,
        hasSelection,
        hasServiceSelection,
        clearSelection,
        service,
        stageTabs,
        stageTopRef,
        isFavorite,
        toggleFavorite,
        session,
        setCrOpen,
        trail,
        setTab,
        setMapExpanded,
        visitSteps,
        historyIndex,
        historyLength: history.length,
        selectVisitIndex,
        methodImpact,
        processFlowReturn,
        impact,
        mapForceLtrSignal,
        impactProjectOptions,
        impactPackageOptions,
        browseServiceMethods,
        leaveServiceSelection,
        currentVisit,
        saveMapViewState,
        navDirection,
        setNavDirection,
        mapRootRef,
        flushSnapshotChrome,
        setSnapshotToast,
        loading,
        affected,
        callees,
        tableProjectFilter,
        projectLabels,
        packageLabels,
        setTableProjectFilter,
        screens,
        processes,
        catalogLinksLoading,
        goBack,
        goForward,
        clearMethodKeepService,
      },
    })

  const shellOverlays = useAppShellOverlaysProps({
    snapshotToast,
    setSnapshotToast,
    cmdkOpen,
    setCmdkOpen,
    appTheme,
    frequentRecents,
    visitTrailForCmdk,
    selectPivot,
    selectMethod,
    setInboxOpen,
    drawers: { setShortcutsOpen, setWorkflowsOpen },
    cr: {
      crOpen,
      setCrOpen,
      service,
      session,
      affected,
      buildSnapshotContext: makeSnapshotContext,
      refreshInbox,
    },
    inbox: {
      inboxOpen,
      inbox,
      openRequestDetail,
      setInboxOpen,
      markAllInboxRead,
      requestDetail,
      returnToInbox,
      backToInbox,
      closeRequestDetail,
      setRequestDetail,
    },
  })

  const appFrameClassName = `app-frame${navExpanded ? ' sidebar-panel-open' : ' is-nav-collapsed'}${surface === 'dwh' ? ' is-dwh-surface' : ''}`

  return {
    apiError,
    liveStatus,
    appTheme,
    setAppTheme,
    appFrameClassName,
    appFrameStyle,
    surface,
    setSurface,
    trail,
    session,
    inboxPending: inbox?.pending,
    openInbox: () => setInboxOpen(true),
    workspaceRef,
    workspaceSidebar,
    workspaceStage,
    shellOverlays,
  }
}
