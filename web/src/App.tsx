import { useCallback, useEffect, useState } from 'react'
import { AffectedList } from './components/AffectedList'
import { ChangeRequestModal } from './components/ChangeRequestModal'
import { DetailPanel } from './components/DetailPanel'
import { ImpactMap } from './components/ImpactMap'
import { InboxPanel } from './components/InboxPanel'
import { MapStage } from './components/MapStage'
import { ModuleTree } from './components/ModuleTree'
import { NewServiceRequestModal } from './components/NewServiceRequestModal'
import { RequestDetailModal } from './components/RequestDetailModal'
import { SimpleImpactPath } from './components/SimpleImpactPath'
import {
  getAffected,
  getChangeRequest,
  getImpactGraph,
  getInbox,
  getModuleTree,
  getService,
  getSessionUsers,
  listRequestsForService,
  markInboxRead,
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
  ModuleNode,
  Service,
  ViewMode,
} from './types'
import './App.css'

type Tab = 'affected' | 'map'

export default function App() {
  const [tree, setTree] = useState<ModuleNode[]>([])
  const [sessionUsers, setSessionUsers] = useState<SessionUser[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [pivotId, setPivotId] = useState<string | undefined>()
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [service, setService] = useState<Service>()
  const [affected, setAffected] = useState<AffectedService[]>([])
  const [impact, setImpact] = useState<ImpactGraph>()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('affected')
  const [viewMode, setViewMode] = useState<ViewMode>('simple')
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
    void searchServices(query).then(setHits).catch(() => setHits([]))
  }, [query])

  useEffect(() => {
    if (!session) return
    void refreshInbox(session.id).catch(() => undefined)
  }, [session, refreshInbox])

  useEffect(() => {
    if (!pivotId) {
      setService(undefined)
      setAffected([])
      setImpact(undefined)
      setServiceRequests([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.all([
      getService(pivotId),
      getAffected(pivotId),
      getImpactGraph(pivotId, viewMode),
      listRequestsForService(pivotId),
    ])
      .then(([svc, aff, graph, reqs]) => {
        if (cancelled) return
        setService(svc)
        setAffected(aff)
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
  }, [pivotId, viewMode])

  const clearSelection = useCallback(() => {
    setPivotId(undefined)
    setHistory([])
    setHistoryIndex(-1)
    setService(undefined)
    setAffected([])
    setImpact(undefined)
    setServiceRequests([])
    setMapExpanded(false)
  }, [])

  const selectPivot = useCallback(
    (id: string, opts?: { resetHistory?: boolean }) => {
      if (id === pivotId) {
        clearSelection()
        return
      }
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
    [clearSelection, history, historyIndex, pivotId],
  )

  const goBack = () => {
    if (historyIndex <= 0) return
    const i = historyIndex - 1
    setHistoryIndex(i)
    setPivotId(history[i])
  }

  const goForward = () => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return
    const i = historyIndex + 1
    setHistoryIndex(i)
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
    <div className={`app mode-${viewMode}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SD</span>
          <div>
            <strong>Service Dependency</strong>
          </div>
        </div>
        <label className="search">
          <span className="sr-only">Servis ara</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Servis, owner, ekip ara…"
          />
          {query && hits.length > 0 && (
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
                    {s.name}
                    <span className="muted"> · {s.owner?.team}</span>
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
          <div className="segmented" role="group" aria-label="Görünüm">
            <button
              type="button"
              className={viewMode === 'simple' ? 'on' : ''}
              onClick={() => setViewMode('simple')}
            >
              Basit
            </button>
            <button
              type="button"
              className={viewMode === 'advanced' ? 'on' : ''}
              onClick={() => setViewMode('advanced')}
            >
              Gelişmiş
            </button>
          </div>
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
        <aside className="left">
          <h3>Modüller</h3>
          <ModuleTree
            nodes={tree}
            selectedServiceId={pivotId}
            onSelectService={(id) => selectPivot(id, { resetHistory: true })}
          />
        </aside>

        <main className="main">
          {hasSelection && (
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
              <div className="tabs">
                <button
                  type="button"
                  className={tab === 'affected' ? 'on' : ''}
                  onClick={() => {
                    setMapExpanded(false)
                    setTab('affected')
                  }}
                >
                  Etkilenenler
                </button>
                <button
                  type="button"
                  className={tab === 'map' ? 'on' : ''}
                  onClick={() => setTab('map')}
                >
                  {viewMode === 'simple' ? 'Etki yolu' : 'Harita'}
                </button>
              </div>

              {tab === 'affected' && (
                <>
                  <p className="list-scope-hint">
                    Onay kapsamı: yalnız <strong>1. katman (doğrudan)</strong>.
                  </p>
                  <AffectedList
                    items={affected}
                    loading={loading}
                    onPivot={(id) => selectPivot(id)}
                  />
                </>
              )}

              {tab === 'map' && impact && (
                <MapStage
                  title={viewMode === 'simple' ? 'Etki yolu' : 'Harita'}
                  expanded={mapExpanded}
                  onExpandedChange={setMapExpanded}
                  onPivotBack={goBack}
                  onPivotForward={goForward}
                  canPivotBack={historyIndex > 0}
                  canPivotForward={historyIndex >= 0 && historyIndex < history.length - 1}
                >
                  {viewMode === 'simple' ? (
                    <SimpleImpactPath
                      key={`simple-${mapExpanded}`}
                      graph={impact}
                      onPivot={(id) => selectPivot(id)}
                      onClearCenter={clearSelection}
                    />
                  ) : (
                    <ImpactMap
                      key={`adv-${mapExpanded}`}
                      graph={impact}
                      onPivot={(id) => selectPivot(id)}
                      onClearCenter={clearSelection}
                    />
                  )}
                </MapStage>
              )}
            </>
          )}
        </main>

        <DetailPanel
          service={service}
          loading={loading}
          session={session}
          requests={serviceRequests}
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
