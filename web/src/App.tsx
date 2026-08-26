/**
 * Ana uygulama kabuğu.
 *
 * Sol: modül ağacı · Orta: harita / ilişkiler
 *
 * Seçim modeli:
 * - pivotId          → odak servis (geri/ileri geçmişi ile)
 * - selectedMethodId → odak metod (method haritası)
 * - tab              → 'map' | 'affected' | 'overview'
 * Harita: gelişmiş React Flow (basit etki yolu kaldırıldı).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { MotionListItem } from './motion/MotionList'
import { MorphHoverButton } from './motion/MorphHoverButton'
import { MotionBanner, MotionToast } from './motion/MotionToast'
import { StageTabs } from './motion/StageTabs'
import { StageTabPanels } from './motion/StageTabPanels'
import { MapLoadingSkeleton } from './motion/SkeletonShimmer'
import {
  projectLabelsFromTree,
  projectsInImpact,
} from './impact/projectFilter'
import { AffectedList } from './components/AffectedList'
import { ChangeRequestModal } from './components/ChangeRequestModal'
import { ImpactMap } from './components/ImpactMap'
import { InboxPanel } from './components/InboxPanel'
import { MapStage } from './components/MapStage'
import { MethodImpactMap } from './components/MethodImpactMap'
import { ModuleTree } from './components/ModuleTree'
import { ServiceOverview } from './components/ServiceOverview'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SearchHitsPortal } from './components/SearchHitsPortal'
import { RequestDetailModal } from './components/RequestDetailModal'
import {
  APP_THEME_KEY,
  readAppTheme,
  themeLabel,
  type AppTheme,
} from './theme'
import { ThemeSwitch } from './components/ThemeSwitch'
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

function SidebarLockIcon({ locked }: { locked: boolean }) {
  if (locked) {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <rect x="4.25" y="7" width="7.5" height="5.75" rx="1.2" fill="currentColor" />
        <path
          d="M6.1 7V5.6a1.9 1.9 0 1 1 3.8 0V7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect
        x="4.25"
        y="7"
        width="7.5"
        height="5.75"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M6.1 7V5.6a1.9 1.9 0 1 1 3.8 0V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

type Tab = 'affected' | 'map' | 'overview'

/** Pivot geçmişi + o ziyarette açık bırakılan katman görünümü */
type VisitEntry = {
  id: string
  visibleMaxHop: number
  expandedLayers: number[]
}

function visitEntry(id: string, view?: Partial<Omit<VisitEntry, 'id'>>): VisitEntry {
  return {
    id,
    visibleMaxHop: view?.visibleMaxHop ?? 1,
    expandedLayers: view?.expandedLayers ? [...view.expandedLayers] : [],
  }
}

export default function App() {
  const [tree, setTree] = useState<ModuleNode[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [methodHits, setMethodHits] = useState<MethodRef[]>([])
  const [pivotId, setPivotId] = useState<string | undefined>()
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
  const [appTheme, setAppTheme] = useState<AppTheme>(() => readAppTheme())
  const [navHover, setNavHover] = useState(true)
  const [navPinned, setNavPinned] = useState(true)
  const [allowNavCollapse, setAllowNavCollapse] = useState(false)
  const navExpanded = navPinned || navHover || !allowNavCollapse
  const [navDirection, setNavDirection] = useState<'back' | 'forward' | null>(
    null,
  )
  const stageTopRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLLabelElement>(null)

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
        const [modules, users, catalog] = await Promise.all([
          getModuleTree(),
          getSessionUsers(),
          searchServices(''),
        ])
        setTree(modules)
        setSession(users[0])
        setCatalogServices(catalog)
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

  const projectLabels = useMemo(() => projectLabelsFromTree(tree), [tree])
  const projectOrder = useMemo(
    () => tree.filter((n) => n.kind === 'project').map((n) => n.id),
    [tree],
  )
  const impactProjectOptions = useMemo(
    () => (impact ? projectsInImpact(impact, projectLabels) : []),
    [impact, projectLabels],
  )

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

  const selectPivot = useCallback(
    (id: string, opts?: { resetHistory?: boolean; source?: 'tree' | 'map' | 'search' }) => {
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
        return
      }
      setNavDirection('forward')
      const next = [...history.slice(0, historyIndex + 1), visitEntry(id)]
      setHistory(next)
      setHistoryIndex(next.length - 1)
      setPivotId(id)
    },
    [clearSelection, history, historyIndex, pivotId, selectedMethodId, trail, catalogServices],
  )

  const selectMethod = useCallback(
    (serviceId: string, methodId: string) => {
      setAllowNavCollapse(true)
      setSelectedMethodId(methodId)
      setTab('map')
      if (serviceId !== pivotId) {
        setHistory([visitEntry(serviceId)])
        setHistoryIndex(0)
        setPivotId(serviceId)
      }
    },
    [pivotId],
  )

  useEffect(() => {
    if (!pivotId) return
    scrollToStageTop()
  }, [pivotId, selectedMethodId, scrollToStageTop])

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
  const hasSelection = !!pivotId

  const serviceNameById = (() => {
    const m = new Map(catalogServices.map((s) => [s.id, s.name]))
    if (service) m.set(service.id, service.name)
    return m
  })()

  return (
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
        className={`app-frame${navExpanded ? ' sidebar-panel-open' : ' is-nav-collapsed'}`}
      >
        <header className="app-masthead">
          <div className="app-masthead-brand-wrap">
            <div className="app-brand">
              <span className="brand-mark">SD</span>
              <div className="app-brand-copy">
                <strong>Service Dependency</strong>
                <span className="brand-tagline">
                  Servis bağımlılıkları ve değişiklik etkisi
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
            {session ? (
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
              <span className="module-kind-badge is-project">P</span>
              <span className="module-kind-badge is-package">J</span>
              <span className="module-kind-badge is-service">S</span>
              <span className="module-kind-badge is-method">M</span>
            </div>
            <span className="sidebar-rail-hint">Paneli Aç</span>
          </div>
          <div className="module-sidebar-inner">
          <div className="module-sidebar-head">
            <h3>Modüller</h3>
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
              <SidebarLockIcon locked={navPinned} />
              <span className="sidebar-pin-label">
                {navPinned ? 'Sabitlemeyi Bırak' : 'Paneli Sabitle'}
              </span>
            </MorphHoverButton>
          </div>
          <label className="search" ref={searchRef}>
            <span className="sr-only">Servis veya metod ara</span>
            <input
              className={query ? 'has-clear' : undefined}
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
            ) : null}
            {query && (hits.length > 0 || methodHits.length > 0) && (
              <>
                <button
                  type="button"
                  className="search-backdrop"
                  aria-label="Aramayı kapat"
                  onClick={() => setQuery('')}
                />
                <SearchHitsPortal open anchorRef={searchRef}>
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
                        <span className="hit-tag hit-tag-method">Method</span>
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
            <span className="module-kind-key">
              <span className="module-kind-badge is-project" aria-hidden>P</span>
              Proje
            </span>
            <span className="module-kind-key">
              <span className="module-kind-badge is-package" aria-hidden>J</span>
              Jar
            </span>
            <span className="module-kind-key">
              <span className="module-kind-badge is-service" aria-hidden>S</span>
              Servis
            </span>
            <span className="module-kind-key">
              <span className="module-kind-badge is-method" aria-hidden>M</span>
              Method
            </span>
          </div>
          <div className="module-sidebar-body">
            <ModuleTree
              nodes={tree}
              selectedServiceId={pivotId}
              selectedMethodId={selectedMethodId}
              onSelectService={(id) =>
                selectPivot(id, { resetHistory: true, source: 'tree' })
              }
              onSelectMethod={selectMethod}
            />
          </div>
          </div>
        </aside>

        <div className="workspace-column">
          <div className="workspace" ref={workspaceRef}>
          <main
          className={`main${hasSelection && tab === 'map' ? ' main-map' : ''}${!hasSelection ? ' is-empty' : ''}`}
          ref={mainRef}
        >
          {!hasSelection && <WelcomeScreen />}

          {hasSelection && (
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
                  onSelect={(next) => {
                    if (next === 'map') {
                      trail.record('tab_change', undefined, 'Harita sekmesine geçildi')
                      setTab('map')
                      return
                    }
                    if (next === 'affected') {
                      trail.record('tab_change', undefined, 'İlişkiler sekmesine geçildi')
                      setMapExpanded(false)
                      setTab('affected')
                      return
                    }
                    trail.record('tab_change', undefined, 'Servis işlevi sekmesine geçildi')
                    setMapExpanded(false)
                    setTab('overview')
                  }}
                />
              </div>

              <div className={`stage-body${tab === 'map' ? ' is-map-view' : ''}`}>
                <StageTabPanels tab={tab}>
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
                          projectOptions={impactProjectOptions}
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
                          visitPath={breadcrumb.map((e) => ({
                            id: e.id,
                            name: serviceNameById.get(e.id) ?? e.id,
                          }))}
                          visitPathIndex={historyIndex}
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
                          onVisitSelect={(i) => {
                            if (i === historyIndex) return
                            setNavDirection(i < historyIndex ? 'back' : 'forward')
                            setHistoryIndex(i)
                            setSelectedMethodId(undefined)
                            setMethodImpact(undefined)
                            setPivotId(history[i].id)
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
                    aria-label="İlişkiler"
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
                        projectLabel={projectLabels.get(service.projectId)}
                        packageLabel={service.packageId}
                        callerCount={affected.length}
                        calleeCount={callees.length}
                        loading={loading}
                      />
                    )}
                  </section>
                </StageTabPanels>
              </div>
            </>
          )}
        </main>
          </div>
        </div>
        </div>
      </div>

      <MotionToast open={!!snapshotToast}>
        {snapshotToast}
        <button type="button" onClick={() => setSnapshotToast(undefined)}>
          ×
        </button>
      </MotionToast>

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
  )
}
