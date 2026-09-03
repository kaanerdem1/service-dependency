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
import { MotionListItem } from './motion/MotionList'
import { MorphHoverButton } from './motion/MorphHoverButton'
import { MotionBanner, MotionToast } from './motion/MotionToast'
import { StageTabs, buildServiceStageTabs, SERVICE_STAGE_TAB_ORDER, type StageTabId } from './motion/StageTabs'
import { StageTabPanels } from './motion/StageTabPanels'
import { MapLoadingSkeleton } from './motion/SkeletonShimmer'
import {
  packageLabelsFromTree,
  packagesInImpact,
  projectLabelsFromTree,
  projectsInImpact,
} from './impact/projectFilter'
import { AffectedList } from './components/AffectedList'
import { ChangeRequestModal } from './components/ChangeRequestModal'
import { ImpactMap } from './components/ImpactMap'
import { InboxPanel } from './components/InboxPanel'
import { MapStage } from './components/MapStage'
import { MethodImpactMap } from './components/MethodImpactMap'
import { CatalogEntityOverview } from './components/CatalogEntityOverview'
import { ModuleTree } from './components/ModuleTree'
import { CommandPalette } from './components/CommandPalette'
import { ServiceOverview } from './components/ServiceOverview'
import {
  ServiceProcessesStage,
  ServiceScreensStage,
  useServiceCatalogLinks,
} from './components/ServiceCatalogPanels'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SearchHitsPortal } from './components/SearchHitsPortal'
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
import { TreeKindIcon } from './components/TreeKindIcon'
import { ShortcutsPanel } from './components/ShortcutsPanel'
import { TreeOptionsRadial } from './components/TreeOptionsRadial'
import {
  readTreeDensity,
  readTreeKindFilter,
  writeTreeDensity,
  writeTreeKindFilter,
  type TreeDensity,
  type TreeKindFilter,
} from './treePrefs'
import type { ExpandJarInTreeRequest } from './components/ModuleTree'
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
import { snapshotHasMapImage } from './snapshot/imageUrl'
import { sidebarOpenAtSnapshot } from './snapshot/sidebarState'
import {
  pushServiceRecent,
  readServiceRecents,
  renameServiceRecent,
} from './serviceRecents'
import type { SessionUser } from './mock/session'
import type {
  AffectedService,
  ChangeRequest,
  ImpactGraph,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Service,
  Snapshot,
} from './types'
import './App.css'

type Tab = StageTabId

function SidebarStarIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="sidebar-star-icon">
      <path
        d="M12 2.5l2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 15.9l-5.1 2.68.97-5.67-4.12-4.02 5.7-.83L12 2.5z"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SidebarPinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="sidebar-pin-icon">
      <path
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03-1 1.03 1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={pinned ? 0 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

type VisitEntry = {
  id: string
  visibleMaxHop: number
  expandedLayers: number[]
}

type VisitPathStep = {
  id: string
  name: string
}

function visitEntry(id: string, view?: Partial<Omit<VisitEntry, 'id'>>): VisitEntry {
  return {
    id,
    visibleMaxHop: view?.visibleMaxHop ?? 1,
    expandedLayers: view?.expandedLayers ? [...view.expandedLayers] : [],
  }
}

function StageVisitPath({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: VisitPathStep[]
  currentIndex: number
  onSelect: (index: number) => void
}) {
  if (steps.length === 0) return null

  return (
    <nav className="stage-visit-path" aria-label="Ziyaret yolu">
      <span className="stage-visit-path-label">Ziyaret yolu</span>
      <ol className="stage-visit-path-list">
        {steps.map((step, i) => {
          const current = i === currentIndex
          return (
            <li key={`${step.id}-${i}`} className="stage-visit-path-item">
              {i > 0 && (
                <span className="stage-visit-path-sep" aria-hidden>
                  /
                </span>
              )}
              <button
                type="button"
                className={`stage-visit-path-btn${current ? ' is-current' : ''}`}
                title={step.name}
                aria-current={current ? 'page' : undefined}
                onClick={() => onSelect(i)}
              >
                {step.name}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default function App() {
  const [tree, setTree] = useState<ModuleNode[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [methodHits, setMethodHits] = useState<MethodRef[]>([])
  const [pivotId, setPivotId] = useState<string | undefined>()
  const [catalogNode, setCatalogNode] = useState<{
    id: string
    kind: 'group' | 'package'
    name: string
  } | null>(null)
  const [showNonServiceMethods, setShowNonServiceMethods] = useState(false)
  const [treePinServiceId, setTreePinServiceId] = useState<string>()
  const [treeDensity, setTreeDensity] = useState<TreeDensity>(() => readTreeDensity())
  const [treeKindFilter, setTreeKindFilter] = useState<Set<TreeKindFilter>>(() =>
    readTreeKindFilter(),
  )
  const [expandJarInTree, setExpandJarInTree] = useState<ExpandJarInTreeRequest>()
  const [selectedMethodId, setSelectedMethodId] = useState<string>()
  const [methodImpact, setMethodImpact] = useState<MethodImpactGraph>()
  /** Metod seçilmeden Metodlar sekmesini aç (harita +N) — saklandı; detay paneli kaldırıldı */
  const [history, setHistory] = useState<VisitEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [service, setService] = useState<Service>()
  const [affected, setAffected] = useState<AffectedService[]>([])
  const [callees, setCallees] = useState<AffectedService[]>([])
  const [impact, setImpact] = useState<ImpactGraph>()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('map')
  const [apiError, setApiError] = useState<string>()
  const [mapExpanded, setMapExpanded] = useState(false)
  const [mapForceLtrSignal, setMapForceLtrSignal] = useState(0)
  const [tableProjectFilter, setTableProjectFilter] = useState<string | undefined>()
  const [appTheme, setAppTheme] = useState<AppTheme>(() => readAppTheme())
  const [surface, setSurface] = useState<AppSurface>('services')
  const [navHover, setNavHover] = useState(true)
  const [navPinned, setNavPinned] = useState(true)
  const [navWidth, setNavWidth] = useState(272)
  const [allowNavCollapse, setAllowNavCollapse] = useState(false)
  const navExpanded = navPinned || navHover || !allowNavCollapse
  const appFrameStyle = {
    '--sidebar-panel-width': `${navWidth}px`,
  } as CSSProperties
  const [navDirection, setNavDirection] = useState<'back' | 'forward' | null>(
    null,
  )
  const stageTopRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLLabelElement>(null)
  const sidebarBodyRef = useRef<HTMLDivElement>(null)

  const { trail, buildClientPayload } = useSnapshotPack()

  const [session, setSession] = useState<SessionUser>()
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [frequentRecents, setFrequentRecents] = useState(() =>
    readServiceRecents().map((r) => ({ id: r.id, name: r.name })),
  )

  useEffect(() => {
    if (surface !== 'services') setShortcutsOpen(false)
  }, [surface])

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
      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(
          272,
          Math.min(460, startWidth + moveEvent.clientX - startX),
        )
        setNavWidth(nextWidth)
      }
      const handleUp = () => {
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
  const projectOrder = useMemo(
    () => tree.filter((n) => n.kind === 'project').map((n) => n.id),
    [tree],
  )
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
      setAllowNavCollapse(true)
    },
    [catalogNode?.id, pivotId, clearSelection, trail],
  )

  const openJarInTree = useCallback((jarId: string, groupId: string) => {
    setTreePinServiceId(undefined)
    setNavHover(true)
    setExpandJarInTree({ jarId, groupId, gen: Date.now() })
  }, [])

  const toggleTreeKind = useCallback((kind: TreeKindFilter) => {
    setTreeKindFilter((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) {
        if (next.size <= 1) return prev
        next.delete(kind)
      } else {
        next.add(kind)
      }
      writeTreeKindFilter(next)
      return next
    })
  }, [])

  const toggleTreeDensity = useCallback(() => {
    setTreeDensity((prev) => {
      const next: TreeDensity = prev === 'compact' ? 'comfortable' : 'compact'
      writeTreeDensity(next)
      return next
    })
  }, [])

  const selectPivot = useCallback(
    (id: string, opts?: { resetHistory?: boolean; source?: 'tree' | 'map' | 'search' }) => {
      setCatalogNode(null)
      setTreePinServiceId(opts?.source === 'search' ? id : undefined)
      if (id === pivotId && !selectedMethodId) {
        clearSelection()
        return
      }
      const label = catalogServices.find((s) => s.id === id)?.name ?? id
      trail.record(
        opts?.source === 'map' ? 'map_select' : opts?.source === 'search' ? 'search_select' : 'tree_select',
        {
        level: 'service',
        id,
        label,
      },
        opts?.source === 'map'
          ? 'Haritadan yeni servis seçildi'
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

  const clearMethodKeepService = useCallback(() => {
    setSelectedMethodId(undefined)
    setMethodImpact(undefined)
    setTab('map')
  }, [])

  const browseServiceMethods = useCallback(
    (serviceId: string) => {
      setSelectedMethodId(undefined)
      setMethodImpact(undefined)
      setTab('map')
      if (serviceId !== pivotId) {
        setHistory([visitEntry(serviceId)])
        setHistoryIndex(0)
        setPivotId(serviceId)
      }
    },
    [pivotId],
  )

  const goBack = () => {
    if (selectedMethodId) {
      clearMethodKeepService()
      return
    }
    if (historyIndex <= 0) return
    trail.record('nav_back')
    const i = historyIndex - 1
    setNavDirection('back')
    setHistoryIndex(i)
    setPivotId(history[i].id)
  }

  const goForward = () => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return
    trail.record('nav_forward')
    const i = historyIndex + 1
    setNavDirection('forward')
    setHistoryIndex(i)
    setSelectedMethodId(undefined)
    setMethodImpact(undefined)
    setPivotId(history[i].id)
  }

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
    historyIndex >= 0 && historyIndex < history.length
      ? history[historyIndex]
      : undefined
  const hasSelection = !!pivotId || !!catalogNode
  const hasServiceSelection = !!pivotId

  const serviceNameById = useMemo(() => {
    const m = new Map(catalogServices.map((s) => [s.id, s.name]))
    if (service) m.set(service.id, service.name)
    return m
  }, [catalogServices, service])

  const visitSteps = useMemo(
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

  useEffect(() => {
    if (!service?.id?.startsWith('sd-') || !service.name) return
    setFrequentRecents(
      renameServiceRecent(service.id, service.name).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    )
  }, [service?.id, service?.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cmdkOpen])

  const selectVisitIndex = useCallback(
    (i: number) => {
      if (i === historyIndex || i < 0 || i >= history.length) return
      setNavDirection(i < historyIndex ? 'back' : 'forward')
      setHistoryIndex(i)
      setSelectedMethodId(undefined)
      setMethodImpact(undefined)
      setPivotId(history[i]!.id)
    },
    [history, historyIndex],
  )

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
                className="btn ghost"
                onClick={() => setInboxOpen(true)}
              >
                Gelen kutusu
                {inbox && inbox.pending > 0 ? ` (${inbox.pending})` : ''}
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
        <aside
          className={`module-sidebar${navExpanded ? ' is-expanded' : ''}${navPinned ? ' is-pinned' : ''}`}
          data-motion="sidebar-overlay"
          data-expanded={navExpanded ? 'true' : 'false'}
          data-pinned={navPinned ? 'true' : 'false'}
          onMouseEnter={() => setNavHover(true)}
          onMouseLeave={() => {
            if (allowNavCollapse && !navPinned) setNavHover(false)
          }}
        >
          <div className="module-sidebar-rail" aria-hidden={navExpanded}>
            <span className="sidebar-rail-label">Modüller</span>
            <div className="sidebar-rail-kinds" aria-hidden>
              <TreeKindIcon kind="group" size={14} />
              <TreeKindIcon kind="package" size={14} />
              <TreeKindIcon kind="service" size={14} />
              <TreeKindIcon kind="method" size={14} />
            </div>
            <span className="sidebar-rail-hint">Paneli Aç</span>
          </div>
          <div className="module-sidebar-inner">
          <div className="module-sidebar-head">
            <h3>Modüller</h3>
            <div className="module-sidebar-head-actions">
              <MorphHoverButton
                type="button"
                className={`sidebar-pin-btn${navPinned ? ' is-pinned' : ''}`}
                layoutId="sidebar-pin-hover"
                title={
                  navPinned
                    ? 'Sabitlemeyi bırak (fare dışına çıkınca panel kapanır)'
                    : 'Paneli sabitle (açık kalsın)'
                }
                aria-label={
                  navPinned
                    ? 'Modül paneli sabitli — sabitlemeyi bırak'
                    : 'Modül panelini sabitle — açık kalsın'
                }
                aria-expanded={navExpanded}
                aria-pressed={navPinned}
                onClick={toggleNavPinned}
              >
                <SidebarPinIcon pinned={navPinned} />
              </MorphHoverButton>
              <MorphHoverButton
                type="button"
                className={`sidebar-star-btn${shortcutsOpen ? ' is-active' : ''}`}
                layoutId="sidebar-star-hover"
                title={shortcutsOpen ? 'Favorileri gizle' : 'Favorilerim'}
                aria-label={shortcutsOpen ? 'Favoriler panelini kapat' : 'Favoriler panelini aç'}
                aria-expanded={shortcutsOpen}
                onClick={() => setShortcutsOpen((v) => !v)}
              >
                <SidebarStarIcon active={shortcutsOpen} />
              </MorphHoverButton>
            </div>
          </div>
          <label className="search" ref={searchRef}>
            <span className="sr-only">Servis veya metod ara</span>
            <svg className="search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
              <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            </svg>
            <input
              className={[query ? 'has-clear' : 'has-shortcut'].filter(Boolean).join(' ')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Servis veya metod ara…"
            />
            {query ? (
              <button
                type="button"
                className="search-clear-btn"
                aria-label="Aramayı temizle"
                title="Aramayı temizle"
                onClick={() => setQuery('')}
              >
                ×
              </button>
            ) : (
              <button
                type="button"
                className="search-shortcut"
                aria-label="Komut paletini aç"
                title="Komut paleti (⌘K)"
                onClick={() => setCmdkOpen(true)}
              >
                ⌘K
              </button>
            )}
            {query && (hits.length > 0 || methodHits.length > 0) && (
              <>
                <button
                  type="button"
                  className="search-backdrop"
                  aria-label="Aramayı kapat"
                  onClick={() => setQuery('')}
                />
                <SearchHitsPortal open theme={appTheme} anchorRef={searchRef}>
                <AnimatePresence initial={false}>
                {hits.map((s, i) => (
                  <MotionListItem key={s.id} id={s.id} index={i}>
                    <button
                      type="button"
                      onClick={() => {
                        selectPivot(s.id, { resetHistory: true, source: 'search' })
                        setQuery('')
                      }}
                    >
                      <span className="search-hit-main">
                        <span
                          className="search-hit-text name-tip is-short"
                          data-tip={s.name}
                        >
                          <strong>{s.name}</strong>
                        </span>
                        <span className="hit-tag hit-tag-service">Servis</span>
                      </span>
                    </button>
                  </MotionListItem>
                ))}
                {methodHits.map((m, i) => (
                  <MotionListItem key={m.id} id={m.id} index={hits.length + i}>
                    <button
                      type="button"
                      onClick={() => {
                        selectMethod(m.serviceId, m.id)
                        setQuery('')
                      }}
                    >
                      <span className="search-hit-main">
                        <span
                          className="search-hit-text name-tip is-short"
                          data-tip={`${m.className}.${m.name}`}
                        >
                          <strong>
                            {m.className}.{m.name}
                          </strong>
                        </span>
                        <span className="hit-tag hit-tag-method">Metod</span>
                      </span>
                      <span
                        className="method-hit-svc name-tip is-short"
                        data-tip={m.serviceName}
                      >
                        {m.serviceName}
                      </span>
                    </button>
                  </MotionListItem>
                ))}
                </AnimatePresence>
                </SearchHitsPortal>
              </>
            )}
          </label>
          <div className="module-kind-legend" aria-label="Ağaç türleri">
            {(
              [
                ['group', 'Proje Grubu'] as const,
                ['package', 'Jar'] as const,
                ['service', 'Servis'] as const,
                ['method', 'Metod'] as const,
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className={`module-kind-filter${treeKindFilter.has(kind) ? ' is-on' : ''}`}
                aria-pressed={treeKindFilter.has(kind)}
                aria-label={`${label} satırlarını ${treeKindFilter.has(kind) ? 'gizle' : 'göster'}`}
                onClick={() => toggleTreeKind(kind)}
              >
                <TreeKindIcon kind={kind} size={13} />
                {label}
              </button>
            ))}
            <button
              type="button"
              className="tree-density-toggle"
              aria-pressed={treeDensity === 'compact'}
              title={treeDensity === 'compact' ? 'Ferah görünüme geç' : 'Sıkı görünüme geç'}
              onClick={toggleTreeDensity}
            >
              {treeDensity === 'compact' ? 'Ferah' : 'Sıkı'}
            </button>
          </div>
          <div
            className={`module-sidebar-body${treeDensity === 'compact' ? ' is-tree-compact' : ''}`}
            ref={sidebarBodyRef}
            tabIndex={-1}
          >
            <ModuleTree
              nodes={tree}
              selectedServiceId={pivotId}
              selectedMethodId={selectedMethodId}
              selectedCatalogNodeId={catalogNode?.id}
              scrollParentRef={sidebarBodyRef}
              showNonServiceMethods={showNonServiceMethods}
              pinServiceId={treePinServiceId}
              treeDensity={treeDensity}
              kindFilter={treeKindFilter}
              expandJarInTree={expandJarInTree}
              keyboardEnabled={!shortcutsOpen}
              onClearPin={() => setTreePinServiceId(undefined)}
              onSelectCatalogNode={selectCatalogNode}
              onSelectService={(id) =>
                selectPivot(id, { resetHistory: true, source: 'tree' })
              }
              onSelectMethod={selectMethod}
            />
          </div>
          <div className="module-sidebar-foot">
            <TreeOptionsRadial
              showNonServiceMethods={showNonServiceMethods}
              onShowNonServiceMethodsChange={setShowNonServiceMethods}
            />
          </div>
          <ShortcutsPanel
            open={shortcutsOpen && surface === 'services'}
            pivotId={pivotId}
            pivotName={service?.name}
            navPinned={navPinned}
            mapExpanded={mapExpanded}
            onTogglePin={toggleNavPinned}
            onClose={() => setShortcutsOpen(false)}
            onSelectService={(id) => {
              setTreePinServiceId(undefined)
              setQuery('')
              selectPivot(id, { resetHistory: true, source: 'tree' })
            }}
          />
          </div>
          <button
            type="button"
            className="module-sidebar-resize"
            aria-label="Modül panel genişliğini ayarla"
            title="Panel genişliğini ayarla"
            onPointerDown={startNavResize}
          />
        </aside>

        <div className="workspace-column">
          <div className="workspace" ref={workspaceRef}>
          <main
          className={`main${hasServiceSelection && tab === 'map' ? ' main-map' : ''}${hasServiceSelection && isCatalogTab ? ' main-overview' : ''}${catalogNode && !pivotId ? ' main-catalog-entity' : ''}${!hasSelection ? ' is-empty' : ''}`}
          ref={mainRef}
        >
          {!hasSelection && <WelcomeScreen />}

          {catalogNode && !pivotId ? (
            <div className="stage-body">
              <CatalogEntityOverview
                nodeId={catalogNode.id}
                kind={catalogNode.kind}
                onSelectGroup={(id, name) => selectCatalogNode({ id, kind: 'group', name })}
                onSelectJar={(id, name) => selectCatalogNode({ id, kind: 'package', name })}
                onSelectService={(id) => selectPivot(id, { resetHistory: true, source: 'tree' })}
                onOpenJarInTree={openJarInTree}
                onDismiss={clearSelection}
              />
            </div>
          ) : null}

          {hasServiceSelection && (
            <>
              <div ref={stageTopRef} className="stage-top">
                <div className="stage-head">
                  <div className="main-heading-wrap">
                    <span className="service-status-dot" aria-hidden />
                    <h1 className="main-heading" title={service?.name}>
                      {service?.name}
                    </h1>
                  </div>
                  <div className="stage-actions">
                    <button
                      type="button"
                      className="btn ghost clear-sel"
                      onClick={clearSelection}
                    >
                      Seçimi bırak
                    </button>
                    {session && service && (
                      <button
                        type="button"
                        className="btn primary compact"
                        onClick={() => setCrOpen(true)}
                      >
                        Değişiklik talebi
                      </button>
                    )}
                  </div>
                </div>
                <StageTabs
                  tab={tab}
                  tabs={stageTabs}
                  onSelect={(next) => {
                    if (next === 'map') {
                      trail.record('tab_change', undefined, 'Harita sekmesine geçildi')
                      setTab('map')
                      return
                    }
                    if (next === 'affected') {
                      trail.record('tab_change', undefined, 'Tablo sekmesine geçildi')
                      setMapExpanded(false)
                      setTab('affected')
                      return
                    }
                    if (next === 'screens') {
                      trail.record('tab_change', undefined, 'Ekranlar sekmesine geçildi')
                      setMapExpanded(false)
                      setTab('screens')
                      return
                    }
                    if (next === 'processes') {
                      trail.record('tab_change', undefined, 'Process sekmesine geçildi')
                      setMapExpanded(false)
                      setTab('processes')
                      return
                    }
                    trail.record('tab_change', undefined, 'Servis işlevi sekmesine geçildi')
                    setMapExpanded(false)
                    setTab('overview')
                  }}
                />
                {tab === 'map' && (
                  <StageVisitPath
                    steps={visitSteps}
                    currentIndex={historyIndex}
                    onSelect={selectVisitIndex}
                  />
                )}
              </div>

              <div className={`stage-body${tab === 'map' ? ' is-map-view' : ''}`}>
                <StageTabPanels tab={tab} tabOrder={SERVICE_STAGE_TAB_ORDER}>
                  <section
                    className="stage-panel stage-panel-map"
                    aria-hidden={tab !== 'map'}
                    aria-label="Harita"
                  >
                    {selectedMethodId && methodImpact && (
                      <MapStage
                        title="Method haritası"
                        expanded={mapExpanded}
                        onExpandedChange={setMapExpanded}
                        active={tab === 'map'}
                      >
                        <MethodImpactMap
                          key={`method-${selectedMethodId}`}
                          graph={methodImpact}
                          onSelectMethod={selectMethod}
                          onSelectService={(id) => {
                            clearMethodKeepService()
                            if (id !== pivotId)
                              selectPivot(id, { resetHistory: true })
                          }}
                          onClearMethod={clearMethodKeepService}
                          onPivotBack={goBack}
                          onPivotForward={goForward}
                          canPivotBack={
                            historyIndex > 0 || Boolean(selectedMethodId)
                          }
                          canPivotForward={
                            historyIndex >= 0 &&
                            historyIndex < history.length - 1
                          }
                        />
                      </MapStage>
                    )}

                    {!selectedMethodId && impact && (
                      <MapStage
                        title={service?.name ?? 'Harita'}
                        expanded={mapExpanded}
                        onExpandedChange={setMapExpanded}
                        active={tab === 'map'}
                      >
                        <ImpactMap
                          graph={impact}
                          mapExpanded={mapExpanded}
                          forceLtrSignal={mapForceLtrSignal}
                          onOpenAffectedTab={(projectId) => {
                            trail.record(
                              'tab_change',
                              undefined,
                              projectId
                                ? 'Tablo sekmesine geçildi (proje filtresi)'
                                : 'Tablo sekmesine geçildi (hub banner)',
                            )
                            setTableProjectFilter(projectId)
                            setMapExpanded(false)
                            setTab('affected')
                          }}
                          projectOptions={impactProjectOptions}
                          packageOptions={impactPackageOptions}
                          onPivot={(id) => selectPivot(id, { source: 'map' })}
                          onSelectMethod={selectMethod}
                          onBrowseMethods={browseServiceMethods}
                          onClearCenter={clearSelection}
                          onPivotBack={goBack}
                          onPivotForward={goForward}
                          canPivotBack={historyIndex > 0}
                          canPivotForward={
                            historyIndex >= 0 &&
                            historyIndex < history.length - 1
                          }
                          restoredView={
                            currentVisit
                              ? {
                                  visibleMaxHop: currentVisit.visibleMaxHop,
                                  expandedLayers: currentVisit.expandedLayers,
                                }
                              : undefined
                          }
                          onViewStateChange={saveMapViewState}
                          navDirection={navDirection}
                          onNavDirectionConsumed={() => setNavDirection(null)}
                          sessionUserId={session?.id}
                          sessionUserName={session?.name}
                          onMapRoot={(el) => {
                            mapRootRef.current = el
                          }}
                          onBeforeSnapshot={flushSnapshotChrome}
                          onSnapshotSaved={(snap: Snapshot) => {
                            setSnapshotToast(
                              snapshotHasMapImage(snap)
                                ? `${snap.id} kaydedildi — PNG indirildi (İndirilenler)`
                                : `${snap.id} kaydedildi — harita görüntüsü alınamadı`,
                            )
                          }}
                        />
                      </MapStage>
                    )}

                    {selectedMethodId && !methodImpact && (
                      <MapLoadingSkeleton />
                    )}

                    {loading && pivotId && !impact && !selectedMethodId && (
                      <MapLoadingSkeleton />
                    )}
                  </section>

                  <section
                    className="stage-panel stage-panel-affected"
                    aria-hidden={tab !== 'affected'}
                    aria-label="Tablo"
                  >
                    <div className="relations-nav">
                      <div
                        className="list-scope-nav"
                        role="group"
                        aria-label="Gezinme geçmişi — Harita ile aynı"
                      >
                        <button
                          type="button"
                          className="map-nav-btn"
                          onClick={goBack}
                          disabled={historyIndex <= 0}
                          title="Önceki servis (Harita ile aynı geçmiş)"
                        >
                          ← Geri
                        </button>
                        <button
                          type="button"
                          className="map-nav-btn"
                          onClick={goForward}
                          disabled={
                            historyIndex < 0 ||
                            historyIndex >= history.length - 1
                          }
                          title="Sonraki servis (Harita ile aynı geçmiş)"
                        >
                          İleri →
                        </button>
                      </div>
                    </div>
                    <AffectedList
                      callers={affected}
                      callees={callees}
                      loading={loading}
                      onPivot={(id) => selectPivot(id)}
                      projectLabels={projectLabels}
                      projectOrder={projectOrder}
                      projectFilter={tableProjectFilter}
                      projectFilterLabel={
                        tableProjectFilter
                          ? projectLabels.get(tableProjectFilter) ?? tableProjectFilter
                          : undefined
                      }
                      onClearProjectFilter={() => setTableProjectFilter(undefined)}
                    />
                  </section>

                  <section
                    className="stage-panel stage-panel-overview"
                    aria-hidden={tab !== 'overview'}
                    aria-label="Servis işlevi"
                  >
                    {service && (
                      <ServiceOverview
                        service={service}
                        projectLabel={
                          service.projectGroupLabel && service.projectLabel
                            ? `${service.projectGroupLabel} › ${service.projectLabel}`
                            : service.projectLabel ??
                              projectLabels.get(service.projectId)
                        }
                        packageLabel={
                          service.packageLabel ??
                          packageLabels.get(service.packageId)
                        }
                        callerCount={affected.length}
                        calleeCount={callees.length}
                        loading={loading}
                      />
                    )}
                  </section>

                  <section
                    className="stage-panel stage-panel-catalog"
                    aria-hidden={tab !== 'screens'}
                    aria-label="Ekranlar"
                  >
                    <ServiceScreensStage screens={screens} loading={catalogLinksLoading} />
                  </section>

                  <section
                    className="stage-panel stage-panel-catalog"
                    aria-hidden={tab !== 'processes'}
                    aria-label="Process"
                  >
                    <ServiceProcessesStage processes={processes} loading={catalogLinksLoading} />
                  </section>
                </StageTabPanels>
              </div>
            </>
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
        onOpenChange={setCmdkOpen}
        frequent={frequentRecents}
        visitTrail={visitTrailForCmdk}
        onSelectService={(id) => selectPivot(id, { resetHistory: true, source: 'search' })}
        onOpenInbox={() => setInboxOpen(true)}
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
