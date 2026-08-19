/**
 * Ana uygulama kabuğu.
 *
 * Sol: modül ağacı · Orta: harita / ilişkiler
 *
 * Seçim modeli:
 * - pivotId          → odak servis (geri/ileri geçmişi ile)
 * - selectedMethodId → odak metod (method haritası)
 * - tab              → 'map' | 'affected'
 * Harita: gelişmiş React Flow (basit etki yolu kaldırıldı).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  projectLabelsFromTree,
  projectsInImpact,
} from './impact/projectFilter'
import { AffectedList } from './components/AffectedList'
import { ImpactMap } from './components/ImpactMap'
import { MapStage } from './components/MapStage'
import { MethodImpactMap } from './components/MethodImpactMap'
import { ModuleTree } from './components/ModuleTree'
import {
  getImpactGraph,
  getMethodImpactGraph,
  getModuleTree,
  getNeighbors,
  getService,
  getSessionUsers,
  searchMethods,
  searchServices,
} from './api/client'
import type { SessionUser } from './mock/session'
import type {
  AffectedService,
  ImpactGraph,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Service,
} from './types'
import './App.css'

type Tab = 'affected' | 'map'

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
  const [upstream, setUpstream] = useState<AffectedService[]>([])
  const [impact, setImpact] = useState<ImpactGraph>()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('map')
  const [apiError, setApiError] = useState<string>()
  const [mapExpanded, setMapExpanded] = useState(false)
  const [navOpen, setNavOpen] = useState(true)
  const [navDirection, setNavDirection] = useState<'back' | 'forward' | null>(
    null,
  )
  const stageTopRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const [session, setSession] = useState<SessionUser>()
  const [catalogServices, setCatalogServices] = useState<Service[]>([])

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
      setUpstream([])
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
        setUpstream(neighbors.upstream)
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

  const projectLabels = useMemo(() => projectLabelsFromTree(tree), [tree])
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
    setUpstream([])
    setImpact(undefined)
    setMapExpanded(false)
  }, [])

  const selectPivot = useCallback(
    (id: string, opts?: { resetHistory?: boolean }) => {
      if (id === pivotId && !selectedMethodId) {
        clearSelection()
        return
      }
      setSelectedMethodId(undefined)
      setMethodImpact(undefined)
      if (opts?.resetHistory) {
        setNavDirection(null)
        setHistory([visitEntry(id)])
        setHistoryIndex(0)
        setPivotId(id)
        setMapExpanded(false)
        return
      }
      setNavDirection('forward')
      const next = [...history.slice(0, historyIndex + 1), visitEntry(id)]
      setHistory(next)
      setHistoryIndex(next.length - 1)
      setPivotId(id)
    },
    [clearSelection, history, historyIndex, pivotId, selectedMethodId],
  )

  const selectMethod = useCallback(
    (serviceId: string, methodId: string) => {
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
    const i = historyIndex - 1
    setNavDirection('back')
    setHistoryIndex(i)
    setPivotId(history[i].id)
  }

  const goForward = () => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return
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
    <div className="app">
      {apiError && <div className="api-banner">{apiError}</div>}

      <div className={`shell${navOpen ? '' : ' is-nav-collapsed'}`}>
        <aside className="module-sidebar">
          <label className="search">
            <span className="sr-only">Servis veya method ara</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Servis veya method ara…"
            />
            {query && (hits.length > 0 || methodHits.length > 0) && (
              <ul className="search-hits">
                {hits.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectPivot(s.id, { resetHistory: true })
                        setQuery('')
                      }}
                    >
                      <span className="search-hit-main">
                        <span className="search-hit-text" title={s.name}>
                          <strong>{s.name}</strong>
                        </span>
                        <span className="hit-tag hit-tag-service">Servis</span>
                      </span>
                    </button>
                  </li>
                ))}
                {methodHits.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectMethod(m.serviceId, m.id)
                        setQuery('')
                      }}
                    >
                      <span className="search-hit-main">
                        <span
                          className="search-hit-text"
                          title={`${m.className}.${m.name}`}
                        >
                          <strong>
                            {m.className}.{m.name}
                          </strong>
                        </span>
                        <span className="hit-tag hit-tag-method">Method</span>
                      </span>
                      <span className="method-hit-svc" title={m.serviceName}>
                        {m.serviceName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <div className="module-sidebar-head">
            <h3>Modüller</h3>
            <button
              type="button"
              className="nav-toggle"
              title={navOpen ? 'Paneli gizle' : 'Modülleri göster'}
              aria-label={navOpen ? 'Modül panelini gizle' : 'Modül panelini göster'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? '‹' : '›'}
            </button>
          </div>
          <div className="module-sidebar-body">
            <ModuleTree
              nodes={tree}
              selectedServiceId={pivotId}
              selectedMethodId={selectedMethodId}
              onSelectService={(id) => selectPivot(id, { resetHistory: true })}
              onSelectMethod={selectMethod}
            />
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="brand">
              <span className="brand-mark">SD</span>
              <div>
                <strong>Service Dependency</strong>
              </div>
            </div>
          </header>

          <main
          className={`main${hasSelection && tab === 'map' ? ' main-map' : ''}`}
          ref={mainRef}
        >
          {!hasSelection && (
            <div className="welcome">
              <h2>Servis seçin</h2>
              <p>
                Soldaki aramadan veya ağaçtan bir servis seçerek ilişkileri ve
                etki yolunu görün. Seçili servise tekrar tıklayınca seçim kalkar.
              </p>
            </div>
          )}

          {hasSelection && (
            <>
              <div ref={stageTopRef} className="stage-top">
                <div className="tabs">
                  <button
                    type="button"
                    className={tab === 'map' ? 'on' : ''}
                    onClick={() => setTab('map')}
                  >
                    Harita
                  </button>
                  <button
                    type="button"
                    className={tab === 'affected' ? 'on' : ''}
                    onClick={() => {
                      setMapExpanded(false)
                      setTab('affected')
                    }}
                  >
                    İlişkiler
                  </button>
                  <button
                    type="button"
                    className="btn ghost clear-sel"
                    onClick={clearSelection}
                  >
                    Seçimi bırak
                  </button>
                </div>
              </div>

              {tab === 'map' && selectedMethodId && methodImpact && (
                <MapStage
                  title="Method haritası"
                  expanded={mapExpanded}
                  onExpandedChange={setMapExpanded}
                >
                  <MethodImpactMap
                    key={`method-${selectedMethodId}-${mapExpanded}`}
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

              {tab === 'map' && !selectedMethodId && impact && (
                <MapStage
                  title="Harita"
                  expanded={mapExpanded}
                  onExpandedChange={setMapExpanded}
                >
                  <ImpactMap
                    key={`adv-${mapExpanded}`}
                    graph={impact}
                    mapExpanded={mapExpanded}
                    projectOptions={impactProjectOptions}
                    onPivot={(id) => selectPivot(id)}
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

              {tab === 'map' && selectedMethodId && !methodImpact && (
                <p className="empty-hint">Method etki grafı yükleniyor…</p>
              )}

              {tab === 'affected' && (
                <>
                  <div className="list-scope-bar">
                    <p className="list-scope-hint">
                      Bu Servisi Çağıranlar · Bu Servisin Çağırdıkları
                    </p>
                    <div className="list-scope-nav" role="group" aria-label="Gezinme">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={goBack}
                        disabled={historyIndex <= 0}
                      >
                        ← Geri
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={goForward}
                        disabled={
                          historyIndex < 0 ||
                          historyIndex >= history.length - 1
                        }
                      >
                        İleri →
                      </button>
                    </div>
                  </div>
                  {breadcrumb.length > 0 && (
                    <nav
                      className="relations-breadcrumb"
                      aria-label="Ziyaret yolu"
                    >
                      {breadcrumb.map((e, i) => {
                        const name = serviceNameById.get(e.id) ?? e.id
                        const isCurrent = i === historyIndex
                        return (
                          <span key={`${e.id}-${i}`} className="relations-bc-item">
                            {i > 0 && (
                              <span className="sep" aria-hidden>
                                /
                              </span>
                            )}
                            <button
                              type="button"
                              className={isCurrent ? 'current' : undefined}
                              disabled={isCurrent}
                              title={name}
                              onClick={() => {
                                if (i === historyIndex) return
                                setNavDirection(
                                  i < historyIndex ? 'back' : 'forward',
                                )
                                setHistoryIndex(i)
                                setSelectedMethodId(undefined)
                                setMethodImpact(undefined)
                                setPivotId(history[i]!.id)
                              }}
                            >
                              {name}
                            </button>
                          </span>
                        )
                      })}
                    </nav>
                  )}
                  <AffectedList
                    downstream={affected}
                    upstream={upstream}
                    loading={loading}
                    onPivot={(id) => selectPivot(id)}
                  />
                </>
              )}
            </>
          )}
        </main>
        </div>
      </div>
    </div>
  )
}
