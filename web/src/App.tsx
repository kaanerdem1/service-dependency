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
import { LayoutGroup } from 'motion/react'
import { MotionBanner } from './motion/MotionToast'
import { buildServiceStageTabs, type StageTabId } from './motion/StageTabs'
import {
  packageLabelsFromTree,
  packagesInImpact,
  projectLabelsFromTree,
  projectsInImpact,
} from './impact/projectFilter'
import { DwhPage } from './dwh/DwhPage'
import { APP_THEME_KEY, readAppTheme, type AppTheme } from './theme'
import { type AppSurface } from './components/SurfaceSwitch'
import { AppMasthead } from './components/shell/AppMasthead'
import { AppShellOverlays } from './components/shell/AppShellOverlays'
import { ServicesWorkspace } from './components/shell/ServicesWorkspace'
import { readPersistedAppNav, writePersistedAppNav } from './appNavPersist'
import { useNavDrawers } from './navigation/useNavDrawers'
import {
  useProcessFlowNav,
  type ProcessFlowHistoryApi,
  type SelectPivotFn,
} from './navigation/useProcessFlowNav'
import { useVisitHistory } from './navigation/useVisitHistory'
import { useServiceSelection } from './navigation/useServiceSelection'
import { useServiceStageData } from './navigation/useServiceStageData'
import { initialSidebarDrawer, isTextEditingTarget } from './navigation/appShellHelpers'
import { useServiceFavorites } from './useServiceFavorites'
import { useServiceCatalogLinks } from './components/ServiceCatalogPanels'
import {
  getChangeRequest,
  getInbox,
  markInboxRead,
  getModuleTree,
  getSessionUsers,
  searchMethods,
  searchServices,
} from './api/client'
import { useSnapshotPack, snapshotWatermarkLines } from './snapshot/useSnapshotPack'
import { sidebarOpenAtSnapshot } from './snapshot/sidebarState'
import { readServiceRecents } from './serviceRecents'
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
        <AppMasthead
          surface={surface}
          onSurfaceChange={setSurface}
          appTheme={appTheme}
          onThemeChange={setAppTheme}
          trail={trail}
          session={session}
          inboxPending={inbox?.pending}
          onOpenInbox={() => setInboxOpen(true)}
        />

        <div className="app-frame-body">
        {surface === 'dwh' ? (
          <div className="workspace-column dwh-workspace-column">
            <div className="workspace">
              <DwhPage surface={surface} onSurfaceChange={setSurface} />
            </div>
          </div>
        ) : (
          <ServicesWorkspace
            workspaceRef={workspaceRef}
            sidebar={{
              navExpanded,
              navPinned,
              allowNavCollapse,
              onNavHoverChange: setNavHover,
              shortcutsOpen,
              workflowsOpen,
              onToggleShortcuts: () => {
                setWorkflowsOpen(false)
                setShortcutsOpen((v) => !v)
              },
              onToggleWorkflows: () => {
                setShortcutsOpen(false)
                setWorkflowsOpen((v) => !v)
              },
              onTogglePin: toggleNavPinned,
              onResizePointerDown: startNavResize,
              searchRef,
              query,
              onQueryChange: setQuery,
              hits,
              methodHits,
              appTheme,
              onOpenCommandPalette: () => setCmdkOpen(true),
              onSelectServiceFromSearch: (id) => {
                selectPivot(id, { resetHistory: true, source: 'search' })
                setQuery('')
              },
              onSelectMethod: selectMethod,
              tree,
              pivotId,
              pivotName: service?.name,
              selectedMethodId,
              catalogNodeId: catalogNode?.id,
              sidebarBodyRef,
              showNonServiceMethods,
              onShowNonServiceMethodsChange: setShowNonServiceMethods,
              treePinServiceId,
              onClearPin: () => setTreePinServiceId(undefined),
              onSelectCatalogNode: selectCatalogNode,
              onSelectServiceFromTree: (id) =>
                selectPivot(id, { resetHistory: true, source: 'tree' }),
              mapExpanded,
              onCloseShortcuts: () => setShortcutsOpen(false),
              onCloseWorkflows: () => setWorkflowsOpen(false),
              onOpenFolder: openWorkflowFolder,
              onOpenProcess: openProcessFlow,
              onOpenProcessRoute: openProcessRoute,
              workflowInfoId,
              processFlowNo,
              processRouteId,
              canEditCatalog,
              setTreePinServiceId,
              setQuery,
              selectPivot,
            }}
            stage={{
              mainRef,
              hasSelection,
              hasServiceSelection,
              tab,
              pivotId,
              isCatalogTab,
              catalogNode,
              workflowInfoId,
              processFlow: processFlowNo
                ? {
                    processNo: processFlowNo,
                    routeId: processRouteId,
                    restoreNodeId: processFlowRestoreNodeId,
                    stackDepth: processFlowStack.length,
                    onRouteSaved: setProcessRouteId,
                    onRestoreConsumed: consumeRestoreNode,
                    onOpenService: openServiceFromProcessFlow,
                    onOpenSubProcess: openSubProcessFromFlow,
                    onBackToParent: backToParentProcessFlow,
                    onDismiss: dismissProcessFlow,
                  }
                : null,
              canEditCatalog,
              selectPivot,
              selectCatalogNode,
              clearSelection,
              openWorkflowFolder,
              onWorkflowSelectService: (id) => {
                setWorkflowResumeId(workflowInfoId)
                setTreePinServiceId(undefined)
                setQuery('')
                selectPivot(id, { resetHistory: true, source: 'workflow' })
              },
              onDismissWorkflow: () => setWorkflowInfoId(undefined),
              serviceStage: hasServiceSelection
                ? {
                    service,
                    pivotId,
                    tab,
                    stageTabs,
                    stageTopRef,
                    isFavorite,
                    onToggleFavorite: toggleFavorite,
                    onOpenWorkflowFolder: (folderId) => {
                      setShortcutsOpen(false)
                      setWorkflowsOpen(false)
                      openWorkflowFolder(folderId)
                    },
                    onOpenWorkflowsRoot: () => {
                      setShortcutsOpen(false)
                      setWorkflowInfoId(undefined)
                      setWorkflowsOpen(true)
                    },
                    workflowResumeId,
                    onReturnToWorkflow: returnToWorkflow,
                    onClearSelection: clearSelection,
                    session,
                    onOpenChangeRequest: () => setCrOpen(true),
                    trail,
                    setTab,
                    setMapExpanded,
                    visitSteps,
                    historyIndex,
                    historyLength: history.length,
                    onSelectVisitIndex: selectVisitIndex,
                    selectedMethodId,
                    methodImpact,
                    mapExpanded,
                    onSelectMethod: selectMethod,
                    onClearMethod: clearMethodKeepService,
                    selectPivot,
                    goBack,
                    goForward,
                    processFlowReturn,
                    impact,
                    mapForceLtrSignal,
                    impactProjectOptions,
                    impactPackageOptions,
                    onBrowseMethods: browseServiceMethods,
                    onLeaveServiceSelection: leaveServiceSelection,
                    currentVisit,
                    onViewStateChange: saveMapViewState,
                    navDirection,
                    onNavDirectionConsumed: () => setNavDirection(null),
                    mapRootRef,
                    onBeforeSnapshot: flushSnapshotChrome,
                    onSnapshotToast: setSnapshotToast,
                    loading,
                    affected,
                    callees,
                    tableProjectFilter,
                    projectLabels,
                    packageLabels,
                    onClearProjectFilter: () => setTableProjectFilter(undefined),
                    setTableProjectFilter,
                    screens,
                    processes,
                    catalogLinksLoading,
                    canEditCatalog,
                    onOpenProcessKeepService: (no) => openProcessFlow(no, { keepService: true }),
                  }
                : null,
            }}
          />
        )}
        </div>
      </div>

      <AppShellOverlays
        snapshotToast={snapshotToast}
        onDismissSnapshotToast={() => setSnapshotToast(undefined)}
        cmdkOpen={cmdkOpen}
        onCmdkOpenChange={setCmdkOpen}
        appTheme={appTheme}
        frequentRecents={frequentRecents}
        visitTrailForCmdk={visitTrailForCmdk}
        onSelectServiceFromCmdk={(id) => selectPivot(id, { resetHistory: true, source: 'search' })}
        onSelectMethod={selectMethod}
        onOpenInbox={() => setInboxOpen(true)}
        onToggleFavoritesDrawer={() => {
          setWorkflowsOpen(false)
          setShortcutsOpen((v) => !v)
        }}
        onToggleWorkflowsDrawer={() => {
          setShortcutsOpen(false)
          setWorkflowsOpen((v) => !v)
        }}
        crOpen={crOpen}
        service={service}
        session={session}
        affected={affected}
        buildSnapshotContext={makeSnapshotContext}
        onCloseCr={() => setCrOpen(false)}
        onCrCreated={() => {
          setCrOpen(false)
          setSnapshotToast('Talep açıldı — Snapshot sekmesinden PNG indirebilirsiniz')
          void refreshInbox()
        }}
        inboxOpen={inboxOpen}
        inbox={inbox}
        onOpenRequest={(id) => void openRequestDetail(id, true)}
        onCloseInbox={() => setInboxOpen(false)}
        onMarkInboxRead={() => {
          if (!session) return
          void markInboxRead(session.id).then(() => refreshInbox())
        }}
        requestDetail={requestDetail}
        returnToInbox={returnToInbox}
        onBackToInbox={backToInbox}
        onCloseRequestDetail={() => {
          if (returnToInbox) backToInbox()
          else setRequestDetail(undefined)
        }}
        onRequestUpdated={(req) => {
          setRequestDetail(req)
          setSnapshotToast('Onay kaydedildi — snapshot alındı')
          void refreshInbox()
        }}
      />
    </div>
    </LayoutGroup>
  )
}
