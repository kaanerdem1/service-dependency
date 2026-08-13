import { useEffect, useMemo, useState } from 'react'
import type { AffectedService, ChangeRequest, Service } from '../types'
import type { SessionUser } from '../mock/session'
import {
  FLAG_LABEL,
  groupRequestsByBatch,
  isApprovalOpen,
  taskApprover,
  taskHeadline,
} from '../types'
import {
  canOpenChangeRequest,
  canOpenNewServiceRequest,
  roleLabel,
  serviceDomainTeam,
} from '../auth/permissions'
import { MethodCallTree } from './MethodCallTree'

type DetailTab = 'relations' | 'methods' | 'owner' | 'requests'

type Props = {
  service?: Service
  loading?: boolean
  session?: SessionUser
  requests: ChangeRequest[]
  downstream?: AffectedService[]
  upstream?: AffectedService[]
  projectLabels?: Map<string, string>
  /** Sol ağaç / haritadan seçilen metod */
  focusMethodId?: string
  /** Metod id olmadan Metodlar sekmesini aç */
  preferMethodsTab?: boolean
  onPivot?: (serviceId: string) => void
  onOpenRequest?: () => void
  onOpenNewService?: () => void
  onOpenExisting?: (id: string) => void
}

function NeighborMiniList({
  title,
  items,
  empty,
  onPivot,
}: {
  title: string
  items: AffectedService[]
  empty: string
  onPivot?: (serviceId: string) => void
}) {
  return (
    <section className="detail-rel-block">
      <h3 className="detail-rel-title">
        {title}
        <span className="neighbor-count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="empty-hint">{empty}</p>
      ) : (
        <ul className="detail-rel-list">
          {items.map(({ service: s }) => (
            <li key={s.id}>
              <button
                type="button"
                className="detail-rel-row"
                onClick={() => onPivot?.(s.id)}
                title="Pivot — merkezi bu servis yap"
              >
                <span className="svc-name">{s.name}</span>
                <span className="svc-meta">
                  {s.owner?.name ?? 'Owner yok'}
                  {s.owner?.team ? ` · ${s.owner.team}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function DetailPanel({
  service,
  loading,
  session,
  requests,
  downstream = [],
  upstream = [],
  projectLabels,
  focusMethodId,
  preferMethodsTab,
  onPivot,
  onOpenRequest,
  onOpenNewService,
  onOpenExisting,
}: Props) {
  const groups = useMemo(() => groupRequestsByBatch(requests), [requests])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<DetailTab>('relations')

  useEffect(() => {
    setTab(focusMethodId || preferMethodsTab ? 'methods' : 'relations')
    setCollapsed({})
  }, [service?.id, focusMethodId, preferMethodsTab])

  if (loading) {
    return (
      <aside className="detail-panel">
        <div className="skeleton block" />
      </aside>
    )
  }

  if (!service) {
    const canNew = session ? canOpenNewServiceRequest(session) : false
    const memberPassive = session?.role === 'member' && Boolean(session.team)

    return (
      <aside className="detail-panel">
        <p className="empty-hint">Soldan veya aramadan bir servis seçin.</p>
        <div className="detail-actions">
          {canNew && (
            <button
              type="button"
              className="btn primary"
              title="Yeni Servis Talebi"
              onClick={onOpenNewService}
            >
              Yeni Servis Talebi
            </button>
          )}
          {memberPassive && (
            <>
              <button
                type="button"
                className="btn primary"
                disabled
                aria-disabled="true"
                title="Şu an pasif — yakında çalışan da açabilecek; ekip lideri onayda inceleyecek"
              >
                Yeni Servis Talebi
              </button>
              <p className="hint-sm perm-hint">
                <strong>Yeni Servis Talebi</strong> şu an pasif. Aktif olunca çalışan
                da açabilecek; <strong>ekip lideri onayda inceleyecek</strong>.
              </p>
            </>
          )}
          {session?.role === 'lead' && canNew && (
            <p className="hint-sm perm-hint">
              Yeni Servis Talebi, seçili servis olmadan açılır. Domain:{' '}
              <strong>{session.team}</strong>.
            </p>
          )}
        </div>
      </aside>
    )
  }

  const toggleBatch = (key: string) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  const canChange = session ? canOpenChangeRequest(session, service) : false
  const domain = serviceDomainTeam(service)
  const projectLabel =
    projectLabels?.get(service.projectId) ?? service.projectId

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'relations', label: 'İlişkiler' },
    { id: 'methods', label: 'Metodlar' },
    { id: 'owner', label: 'Owner' },
    { id: 'requests', label: `Talepler${groups.length ? ` (${groups.length})` : ''}` },
  ]

  return (
    <aside className="detail-panel entity-panel">
      <header className="entity-header">
        <p className="entity-eyebrow">Servis</p>
        <h2 className="entity-title">{service.name}</h2>
        <dl className="entity-meta">
          <div>
            <dt>Proje</dt>
            <dd>{projectLabel}</dd>
          </div>
          <div>
            <dt>Paket</dt>
            <dd className="mono">{service.packageId}</dd>
          </div>
          <div>
            <dt>Downstream</dt>
            <dd>{service.affectedCount}</dd>
          </div>
        </dl>
        <div className="detail-actions entity-actions">
          <button
            type="button"
            className="btn primary"
            disabled={!canChange}
            title={
              canChange
                ? 'Değişiklik talebi aç'
                : `Yalnız ${domain ?? 'domain'} ekibi talep açabilir`
            }
            onClick={onOpenRequest}
          >
            Değişiklik talebi aç
          </button>
          {session && !canChange && (
            <p className="hint-sm perm-hint">
              Yetki yok. Domain: <strong>{domain ?? '—'}</strong> · Sizin:{' '}
              <strong>{session.team ?? '—'}</strong> ({roleLabel(session.role)}).
            </p>
          )}
        </div>
      </header>

      <div className="entity-tabs" role="tablist" aria-label="Servis detay">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="entity-tab-body" role="tabpanel">
        {tab === 'relations' && (
          <>
            <p className="hint-sm entity-tab-hint">
              Downstream = beni çağıranlar · Upstream = çağırdıklarım. Satıra tıklayınca
              pivot.
            </p>
            <NeighborMiniList
              title="Downstream"
              items={downstream}
              empty="Bu servisi çağıran yok."
              onPivot={onPivot}
            />
            <NeighborMiniList
              title="Upstream"
              items={upstream}
              empty="Bağımlılık beyanı yok."
              onPivot={onPivot}
            />
          </>
        )}

        {tab === 'methods' && (
          <MethodCallTree
            serviceId={service.id}
            focusMethodId={focusMethodId}
            onPivotService={onPivot}
          />
        )}

        {tab === 'owner' && (
          <div className="entity-owner">
            <dl className="entity-owner-dl">
              <div>
                <dt>Owner</dt>
                <dd>{service.owner?.name ?? 'Atanmamış'}</dd>
              </div>
              <div>
                <dt>Rol</dt>
                <dd>
                  {service.owner?.role
                    ? roleLabel(service.owner.role)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Domain / ekip</dt>
                <dd>{domain ?? '—'}</dd>
              </div>
              <div>
                <dt>Owner id</dt>
                <dd className="mono">{service.owner?.id ?? '—'}</dd>
              </div>
            </dl>
            <p className="hint-sm perm-hint">
              Mock’ta domain = <code>owner.team</code>. Gerçek codebase modeli gelince
              bu sekme ona uyarlanacak; ekip kavramı kalkabilir.
            </p>
          </div>
        )}

        {tab === 'requests' && (
          <div className="svc-requests">
            {groups.length === 0 ? (
              <p className="empty-hint">Henüz talep yok.</p>
            ) : (
              <ul className="svc-request-list batch-list">
                {groups.map((g) => {
                  const isBatch = !!g.batchId && g.items.length > 1
                  const hideKids = collapsed[g.key]
                  if (!isBatch) {
                    const r = g.items[0]!
                    const flag = r.impacted[0]?.flag ?? 'unseen'
                    const approver = taskApprover(r)
                    return (
                      <li key={g.key}>
                        <button
                          type="button"
                          onClick={() => onOpenExisting?.(r.id)}
                        >
                          {r.kind === 'new_service' && (
                            <span className="kind-pill">Yeni Servis</span>
                          )}
                          <span className="inbox-id">{taskHeadline(r)}</span>
                          <span className="approver-line">
                            Onayı verecek: <strong>{approver.label}</strong>
                          </span>
                          <span className={isApprovalOpen(r) ? 'ok' : 'blocked'}>
                            {isApprovalOpen(r) ? 'Onay açık' : 'Onay kapalı'}
                          </span>
                          <span className="svc-meta">{r.summary}</span>
                          <span className={`flag-pill tiny ${flag}`}>
                            {FLAG_LABEL[flag]}
                          </span>
                        </button>
                      </li>
                    )
                  }

                  const allOpen = g.items.every(isApprovalOpen)
                  return (
                    <li key={g.key} className="batch-group">
                      <div className="batch-head">
                        <button
                          type="button"
                          className="batch-toggle"
                          onClick={() => toggleBatch(g.key)}
                          aria-expanded={!hideKids}
                        >
                          {hideKids ? '▸' : '▾'} {g.title}
                        </button>
                        {g.kind === 'new_service' && (
                          <span className="kind-pill">Yeni Servis</span>
                        )}
                        <span className={allOpen ? 'ok' : 'blocked'}>
                          {allOpen
                            ? 'Grup onay açık'
                            : `${g.items.filter(isApprovalOpen).length}/${g.items.length} kabul`}
                        </span>
                        <span className="svc-meta">{g.summary}</span>
                      </div>
                      {!hideKids && (
                        <ul className="batch-children">
                          {g.items.map((r) => {
                            const flag = r.impacted[0]?.flag ?? 'unseen'
                            const approver = taskApprover(r)
                            return (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenExisting?.(r.id)}
                                >
                                  <span className="inbox-id">
                                    {taskHeadline(r)}
                                  </span>
                                  <span className="approver-line">
                                    Onayı verecek:{' '}
                                    <strong>{approver.label}</strong>
                                  </span>
                                  <span
                                    className={
                                      isApprovalOpen(r) ? 'ok' : 'blocked'
                                    }
                                  >
                                    {isApprovalOpen(r)
                                      ? 'Onay açık'
                                      : 'Onay kapalı'}
                                  </span>
                                  <span className={`flag-pill tiny ${flag}`}>
                                    {FLAG_LABEL[flag]}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="hint-sm">
              Aynı formdan açılan task’lar <strong>grup</strong> altında. Onay servis
              owner’ındadır.
            </p>
            <p className="hint-sm">
              Yeni Servis Talebi için seçimi bırakın — panel boşken buton görünür.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
