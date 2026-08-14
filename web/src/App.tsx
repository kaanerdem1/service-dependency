/**
 * Ana uygulama kabuğu.
 *
 * Sol: modül ağacı · Orta: bağımlılıklar / harita · Sağ: detay paneli
 *
 * Seçim modeli:
 * - pivotId          → odak servis (geri/ileri geçmişi ile)
 * - selectedMethodId → odak metod (method haritası + Methods sekmesi)
 * - tab              → 'affected' | 'map'
 * Harita: gelişmiş React Flow (basit etki yolu kaldırıldı).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  projectLabelsFromTree,
  projectsInImpact,
} from './impact/projectFilter'
import { AffectedList } from './components/AffectedList'
import { ChangeRequestModal } from './components/ChangeRequestModal'
import { DetailPanel } from './components/DetailPanel'
import { ImpactMap } from './components/ImpactMap'
import { InboxPanel } from './components/InboxPanel'
import { MapStage } from './components/MapStage'
import { MethodImpactMap } from './components/MethodImpactMap'
import { ModuleTree } from './components/ModuleTree'
import { NewServiceRequestModal } from './components/NewServiceRequestModal'
import { RequestDetailModal } from './components/RequestDetailModal'
import {
  getChangeRequest,
  getImpactGraph,
  getInbox,
  getMethodImpactGraph,
  getModuleTree,
  getNeighbors,
  getService,
  getSessionUsers,
  listRequestsForService,
  markInboxRead,
  searchMethods,
  searchServices,
} from './api/client'
import type { SessionUser } from './mock/session'
import { roleLabel } from './auth/permissions'
import type {
  AffectedService,
  ChangeRequest,
  ImpactGraph,
  ImpactedFlag,
  InboxNotification,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Service,
} from './types'
import './App.css'

type Tab = 'affected' | 'map'

export default function App() {
  const [tree, setTree] = useState<ModuleNode[]>([])
  const [sessionUsers, setSessionUsers] = useState<SessionUser[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [methodHits, setMethodHits] = useState<MethodRef[]>([])
  const [pivotId, setPivotId] = useState<string | undefined>()
  const [selectedMethodId, setSelectedMethodId] = useState<string>()
  const [methodImpact, setMethodImpact] = useState<MethodImpactGraph>()
  /** Metod seçilmeden Metodlar sekmesini aç (harita +N) */
  const [preferMethodsTab, setPreferMethodsTab] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  /** Geri / Harita / Bağımlılıklar tavanı — seçimde buraya kaydır */
  const stageTopRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [service, setService] = useState<Service>()
  const [affected, setAffected] = useState<AffectedService[]>([])
  const [upstream, setUpstream] = useState<AffectedService[]>([])
  const [impact, setImpact] = useState<ImpactGraph>()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('affected')
  const [apiError, setApiError] = useState<string>()
  const [mapExpanded, setMapExpanded] = useState(false)

  const [session, setSession] = useState<SessionUser>()
  const [serviceRequests, setServiceRequests] = useState<ChangeRequest[]>([])
  const [inboxActions, setInboxActions] = useState<{ request: ChangeRequest; row: ImpactedFlag }[]>([])
  const [inboxUpdates, setInboxUpdates] = useState<InboxNotification[]>([])
  const [inboxPending, setInboxPending] = useState(0)
  const [showCreateCr, setShowCreateCr] = useState(false)
  const [showNewService, setShowNewService] = useState(false)
  const [showInbox, setShowInbox] = useState(false)
  const [openRequest, setOpenRequest] = useState<ChangeRequest>()
  const [catalogServices, setCatalogServices] = useState<Service[]>([])

  const refreshInbox = useCallback(async (ownerId: string) => {
    const data = await getInbox(ownerId)
    setInboxActions(data.actions)
    setInboxUpdates(data.updates)
    setInboxPending(data.pending)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const [modules, users, catalog] = await Promise.all([
          getModuleTree(),
          getSessionUsers(),
          searchServices(''),
        ])
        setTree(modules)
        setSessionUsers(users)
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
    if (!session) return
    void refreshInbox(session.id).catch(() => undefined)
  }, [session, refreshInbox])

  useEffect(() => {
    if (!pivotId) {
      setService(undefined)
      setAffected([])
      setUpstream([])
      setImpact(undefined)
      setServiceRequests([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.all([
      getService(pivotId),
      getNeighbors(pivotId),
      getImpactGraph(pivotId),
      listRequestsForService(pivotId),
    ])
      .then(([svc, neighbors, graph, reqs]) => {
        if (cancelled) return
        setService(svc)
        setAffected(neighbors.downstream)
        setUpstream(neighbors.upstream)
        setImpact(graph)
        setServiceRequests(reqs)
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
    // Seçim sonrası stage-top mount olsun diye çift frame
    requestAnimationFrame(() => requestAnimationFrame(run))
  }, [])

  const clearSelection = useCallback(() => {
    setPivotId(undefined)
    setSelectedMethodId(undefined)
    setPreferMethodsTab(false)
    setMethodImpact(undefined)
    setHistory([])
    setHistoryIndex(-1)
    setService(undefined)
    setAffected([])
    setUpstream([])
    setImpact(undefined)
    setServiceRequests([])
    setMapExpanded(false)
  }, [])

  const selectPivot = useCallback(
    (id: string, opts?: { resetHistory?: boolean }) => {
      if (id === pivotId && !selectedMethodId) {
        clearSelection()
        return
      }
      setSelectedMethodId(undefined)
      setPreferMethodsTab(false)
      setMethodImpact(undefined)
      if (opts?.resetHistory) {
        setHistory([id])
        setHistoryIndex(0)
        setPivotId(id)
        setMapExpanded(false)
        return
      }
      const next = [...history.slice(0, historyIndex + 1), id]
      setHistory(next)
      setHistoryIndex(next.length - 1)
      setPivotId(id)
    },
    [clearSelection, history, historyIndex, pivotId, selectedMethodId],
  )

  const selectMethod = useCallback(
    (serviceId: string, methodId: string) => {
      setSelectedMethodId(methodId)
      setPreferMethodsTab(false)
      setTab('map')
      if (serviceId !== pivotId) {
        setHistory([serviceId])
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
    setPreferMethodsTab(false)
    setTab('map')
  }, [])

  const browseServiceMethods = useCallback(
    (serviceId: string) => {
      setSelectedMethodId(undefined)
      setMethodImpact(undefined)
      setPreferMethodsTab(true)
      setTab('map')
      if (serviceId !== pivotId) {
        setHistory([serviceId])
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
    setHistoryIndex(i)
    setPivotId(history[i])
  }

  const goForward = () => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return
    const i = historyIndex + 1
    setHistoryIndex(i)
    setSelectedMethodId(undefined)
    setMethodImpact(undefined)
    setPivotId(history[i])
  }

  const openExisting = async (id: string) => {
    const cr = await getChangeRequest(id)
    setOpenRequest(cr)
  }

  const breadcrumb = historyIndex >= 0 ? history.slice(0, historyIndex + 1) : []
  const hasSelection = !!pivotId
  const serviceNameById = (() => {
    const m = new Map(catalogServices.map((s) => [s.id, s.name]))
    if (service) m.set(service.id, service.name)
    return m
  })()

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SD</span>
          <div>
            <strong>Service Dependency</strong>
          </div>
        </div>
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
                    <span className="search-hit-text">
                      <strong>{s.name}</strong>
                    </span>
                    <span className="hit-tag hit-tag-service">Servis</span>
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
                    <span className="search-hit-text">
                      <strong>
                        {m.className}.{m.name}
                      </strong>
                      <span className="method-hit-svc">{m.serviceName}</span>
                    </span>
                    <span className="hit-tag hit-tag-method">Method</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        <div className="top-actions">
          <label className="session-select">
            <span className="sr-only">Oturum</span>
            <select
              value={session?.id ?? ''}
              onChange={(e) => {
                const u = sessionUsers.find((x) => x.id === e.target.value)
                if (u) setSession(u)
              }}
              title="Oturum"
            >
              {sessionUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.team ? ` · ${u.team}` : ''}
                  {u.role ? ` · ${roleLabel(u.role)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (session) void refreshInbox(session.id)
              setShowInbox(true)
            }}
          >
            Inbox ({inboxPending})
          </button>
        </div>
      </header>

      {apiError && <div className="api-banner">{apiError}</div>}

      <div className="shell">
        <aside className="module-sidebar">
          <h3>Modüller</h3>
          <ModuleTree
            nodes={tree}
            selectedServiceId={pivotId}
            selectedMethodId={selectedMethodId}
            onSelectService={(id) => selectPivot(id, { resetHistory: true })}
            onSelectMethod={selectMethod}
          />
        </aside>

        <main className="main" ref={mainRef}>
          {hasSelection && (
            <div ref={stageTopRef} className="stage-top">
              <div className="pivot-bar">
                <button type="button" className="btn ghost" onClick={goBack} disabled={historyIndex <= 0}>
                  ← Geri
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={goForward}
                  disabled={historyIndex < 0 || historyIndex >= history.length - 1}
                >
                  İleri →
                </button>
                <nav className="breadcrumb" aria-label="Pivot geçmişi">
                  {breadcrumb.map((id, i) => (
                    <span key={`${id}-${i}`}>
                      {i > 0 && <span className="sep">→</span>}
                      <button
                        type="button"
                        className={i === breadcrumb.length - 1 ? 'current' : ''}
                        onClick={() => {
                          setHistoryIndex(i)
                          setPivotId(history[i])
                        }}
                      >
                        {serviceNameById.get(id) ?? id}
                      </button>
                    </span>
                  ))}
                </nav>
                <button type="button" className="btn ghost clear-sel" onClick={clearSelection}>
                  Seçimi bırak
                </button>
              </div>
              <div className="tabs">
                <button
                  type="button"
                  className={tab === 'affected' ? 'on' : ''}
                  onClick={() => {
                    setMapExpanded(false)
                    setTab('affected')
                  }}
                >
                  Bağımlılıklar
                </button>
                <button
                  type="button"
                  className={tab === 'map' ? 'on' : ''}
                  onClick={() => setTab('map')}
                >
                  Harita
                </button>
              </div>
            </div>
          )}

          {!hasSelection && (
            <div className="welcome">
              <h2>Servis seçin</h2>
              <p>
                Soldaki ağaçtan veya üst aramadan bir servis seçerek etkilenenleri ve
                etki yolunu görün. Seçili servise tekrar tıklayınca seçim kalkar.
              </p>
            </div>
          )}

          {hasSelection && (
            <>

              {tab === 'affected' && (
                <>
                  <p className="list-scope-hint">
                    Downstream = beni çağıranlar · Upstream = çağırdıklarım
                  </p>
                  <AffectedList
                    downstream={affected}
                    upstream={upstream}
                    loading={loading}
                    onPivot={(id) => selectPivot(id)}
                  />
                </>
              )}

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
                      if (id !== pivotId) selectPivot(id, { resetHistory: true })
                    }}
                    onClearMethod={clearMethodKeepService}
                    onPivotBack={goBack}
                    onPivotForward={goForward}
                    canPivotBack={historyIndex > 0 || Boolean(selectedMethodId)}
                    canPivotForward={
                      historyIndex >= 0 && historyIndex < history.length - 1
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
                    projectOptions={impactProjectOptions}
                    onPivot={(id) => selectPivot(id)}
                    onSelectMethod={selectMethod}
                    onBrowseMethods={browseServiceMethods}
                    onClearCenter={clearSelection}
                    onPivotBack={goBack}
                    onPivotForward={goForward}
                    canPivotBack={historyIndex > 0}
                    canPivotForward={
                      historyIndex >= 0 && historyIndex < history.length - 1
                    }
                  />
                </MapStage>
              )}

              {tab === 'map' && selectedMethodId && !methodImpact && (
                <p className="empty-hint">Method etki grafı yükleniyor…</p>
              )}
            </>
          )}
        </main>

        <DetailPanel
          service={service}
          loading={loading}
          session={session}
          requests={serviceRequests}
          downstream={affected}
          upstream={upstream}
          projectLabels={projectLabels}
          focusMethodId={selectedMethodId}
          preferMethodsTab={preferMethodsTab}
          onPivot={(id) => selectPivot(id)}
          onOpenRequest={() => setShowCreateCr(true)}
          onOpenNewService={() => setShowNewService(true)}
          onOpenExisting={(id) => void openExisting(id)}
        />
      </div>

      {showCreateCr && service && session && (
        <ChangeRequestModal
          service={service}
          affected={affected}
          session={session}
          onClose={() => setShowCreateCr(false)}
          onCreated={(ids) => {
            setShowCreateCr(false)
            if (ids[0]) void openExisting(ids[0])
            void listRequestsForService(service.id).then(setServiceRequests)
            void refreshInbox(session.id)
          }}
        />
      )}

      {showNewService && session && (
        <NewServiceRequestModal
          session={session}
          domainServices={catalogServices.filter((s) => s.owner?.team === session.team)}
          onClose={() => setShowNewService(false)}
          onCreated={(ids) => {
            setShowNewService(false)
            if (ids[0]) void openExisting(ids[0])
            if (pivotId) void listRequestsForService(pivotId).then(setServiceRequests)
            void refreshInbox(session.id)
          }}
        />
      )}

      {showInbox && session && (
        <InboxPanel
          actions={inboxActions}
          updates={inboxUpdates}
          pending={inboxPending}
          onClose={() => setShowInbox(false)}
          onOpen={(id) => {
            setShowInbox(false)
            void openExisting(id)
          }}
          onMarkRead={() => {
            void markInboxRead(session.id).then(() => refreshInbox(session.id))
          }}
        />
      )}

      {openRequest && session && (
        <RequestDetailModal
          request={openRequest}
          session={session}
          onClose={() => setOpenRequest(undefined)}
          onUpdated={(cr) => {
            setOpenRequest(cr)
            if (pivotId) void listRequestsForService(pivotId).then(setServiceRequests)
            void refreshInbox(session.id)
          }}
        />
      )}
    </div>
  )
}
