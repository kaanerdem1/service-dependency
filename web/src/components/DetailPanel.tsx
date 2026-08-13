import { useMemo, useState } from 'react'
import type { ChangeRequest, Service } from '../types'
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

type Props = {
  service?: Service
  loading?: boolean
  session?: SessionUser
  requests: ChangeRequest[]
  onOpenRequest?: () => void
  onOpenNewService?: () => void
  onOpenExisting?: (id: string) => void
}

export function DetailPanel({
  service,
  loading,
  session,
  requests,
  onOpenRequest,
  onOpenNewService,
  onOpenExisting,
}: Props) {
  const groups = useMemo(() => groupRequestsByBatch(requests), [requests])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (loading) {
    return (
      <aside className="detail-panel">
        <div className="skeleton block" />
      </aside>
    )
  }

  // Servis seçili değil → yeni servis talebi burada
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
                <strong>Yeni Servis Talebi</strong> şu an pasif. Aktif olunca çalışan da
                açabilecek; <strong>ekip lideri onayda inceleyecek</strong>.
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

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <h2>{service.name}</h2>
        <p className="svc-meta">
          {service.owner?.team ?? '—'} · {service.owner?.name ?? 'Owner atanmamış'} ·{' '}
          downstream {service.affectedCount}
        </p>
      </header>
      <div className="detail-actions">
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
            Değişiklik talebi yetkisi yok. Domain: <strong>{domain ?? '—'}</strong> ·
            Sizin ekibiniz: <strong>{session.team ?? '—'}</strong> (
            {roleLabel(session.role)}).
          </p>
        )}
        <p className="hint-sm">
          Yeni Servis Talebi için seçimi bırakın — sağ panel boşken buton görünür.
        </p>
      </div>

      <div className="svc-requests">
        <h3 className="section-title">Talepler</h3>
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
                    <button type="button" onClick={() => onOpenExisting?.(r.id)}>
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
                      <span className={`flag-pill tiny ${flag}`}>{FLAG_LABEL[flag]}</span>
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
                            <button type="button" onClick={() => onOpenExisting?.(r.id)}>
                              <span className="inbox-id">{taskHeadline(r)}</span>
                              <span className="approver-line">
                                Onayı verecek: <strong>{approver.label}</strong>
                              </span>
                              <span className={isApprovalOpen(r) ? 'ok' : 'blocked'}>
                                {isApprovalOpen(r) ? 'Onay açık' : 'Onay kapalı'}
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
      </div>

      <p className="hint-sm">
        Aynı formdan açılan task’lar <strong>grup</strong> altında listelenir. Onay yine
        servis owner’ındadır (ekipçe toplu onay değil).
      </p>
    </aside>
  )
}
