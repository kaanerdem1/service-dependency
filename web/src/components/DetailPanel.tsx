import type { ChangeRequest, Service } from '../types'
import { FLAG_LABEL, isApprovalOpen } from '../types'

type Props = {
  service?: Service
  loading?: boolean
  requests: ChangeRequest[]
  onOpenRequest?: () => void
  onOpenExisting?: (id: string) => void
}

export function DetailPanel({
  service,
  loading,
  requests,
  onOpenRequest,
  onOpenExisting,
}: Props) {
  if (loading) {
    return (
      <aside className="detail-panel">
        <div className="skeleton block" />
      </aside>
    )
  }

  if (!service) {
    return (
      <aside className="detail-panel">
        <p className="empty-hint">Soldan veya aramadan bir servis seçin.</p>
      </aside>
    )
  }

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <h2>{service.name}</h2>
        <p className="svc-meta">
          {service.owner?.team ?? '—'} · {service.owner?.name ?? 'Owner atanmamış'} ·{' '}
          etkilenen {service.affectedCount}
        </p>
      </header>
      <button type="button" className="btn primary" onClick={onOpenRequest}>
        Değişiklik talebi aç
      </button>

      <div className="svc-requests">
        <h3 className="section-title">Bu servisin talepleri</h3>
        {requests.length === 0 ? (
          <p className="empty-hint">Henüz talep yok.</p>
        ) : (
          <ul className="svc-request-list">
            {requests.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpenExisting?.(r.id)}>
                  <span className="inbox-id">{r.id}</span>
                  <span className={isApprovalOpen(r) ? 'ok' : 'blocked'}>
                    {isApprovalOpen(r) ? 'Onay açık' : 'Onay kapalı'}
                  </span>
                  <span className="svc-meta">{r.summary}</span>
                  <span className="flag-stack">
                    {r.impacted.map((i) => (
                      <span key={i.serviceId} className={`flag-pill tiny ${i.flag}`}>
                        {FLAG_LABEL[i.flag]}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="hint-sm">
        Pivot değiştikçe bu panel güncellenir. Seçili servise tekrar tıklayınca seçim
        kalkar.
      </p>
    </aside>
  )
}
