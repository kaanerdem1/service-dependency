/**
 * Inbox: onay bekleyen aksiyonlar + okunmamış bildirimler.
 * actions = bu kullanıcının owner olduğu unseen/yanıt bekleyen satırlar.
 */
import {
  FLAG_LABEL,
  isApprovalOpen,
  type ChangeRequest,
  type ImpactedFlag,
  type InboxNotification,
} from '../types'

type ActionItem = { request: ChangeRequest; row: ImpactedFlag }

type Props = {
  actions: ActionItem[]
  updates: InboxNotification[]
  pending: number
  onOpen: (requestId: string) => void
  onClose: () => void
  onMarkRead: () => void
}

export function InboxPanel({
  actions,
  updates,
  pending,
  onOpen,
  onClose,
  onMarkRead,
}: Props) {
  const needAction = actions.filter((i) => i.row.flag === 'unseen')
  const myOther = actions.filter((i) => i.row.flag !== 'unseen')
  const unreadUpdates = updates.filter((u) => !u.read)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal wide" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Inbox</h2>
          <div className="modal-head-actions">
            {unreadUpdates.length > 0 && (
              <button type="button" className="btn ghost" onClick={onMarkRead}>
                Güncellemeleri okundu say
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onClose}>
              Kapat
            </button>
          </div>
        </header>
        <p className="modal-sub">
          {pending} bekleyen · {needAction.length} onay aksiyonu · {unreadUpdates.length} okunmamış
          güncelleme
        </p>

        <section className="inbox-section">
          <h3 className="section-title">Senin onaylaman gerekenler</h3>
          {needAction.length === 0 ? (
            <p className="empty-hint">Bekleyen onay aksiyonu yok.</p>
          ) : (
            <ul className="inbox-list">
              {needAction.map(({ request, row }) => (
                <li key={`a-${request.id}-${row.serviceId}`}>
                  <button
                    type="button"
                    className="inbox-item action"
                    onClick={() => onOpen(request.id)}
                  >
                    <span className="inbox-kind">ONAY GEREKİYOR</span>
                    <span className="inbox-id">{request.id}</span>
                    <span className="approver-line">
                      Onayı verecek: <strong>{row.ownerName ?? 'Owner atanmamış'}</strong>
                      {row.team ? ` · ${row.team}` : ''}
                    </span>
                    <span className="inbox-title">
                      {(row.team ?? 'Ekip').toLocaleUpperCase('tr-TR')} —{' '}
                      <strong>{row.serviceName}</strong>
                      <span className="svc-meta">
                        {' '}
                        · {request.targetServiceName} değişikliği
                      </span>
                    </span>
                    <span className={`flag-pill ${row.flag}`}>{FLAG_LABEL[row.flag]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="inbox-section">
          <h3 className="section-title">Taleplerinin durumu (bildirimler)</h3>
          {updates.length === 0 ? (
            <p className="empty-hint">Henüz durum bildirimi yok.</p>
          ) : (
            <ul className="inbox-list">
              {updates.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`inbox-item update ${n.read ? 'read' : 'unread'} kind-${n.kind}`}
                    onClick={() => onOpen(n.requestId)}
                  >
                    {!n.read && <span className="inbox-kind">YENİ</span>}
                    <span className="inbox-id">{n.requestId}</span>
                    <span className="inbox-title">{n.title}</span>
                    {n.flag && (
                      <span className={`flag-pill ${n.flag}`}>{FLAG_LABEL[n.flag]}</span>
                    )}
                    <span className="svc-meta">{n.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {myOther.length > 0 && (
          <section className="inbox-section">
            <h3 className="section-title">Yanıtladığın onaylar</h3>
            <ul className="inbox-list">
              {myOther.map(({ request, row }) => (
                <li key={`d-${request.id}-${row.serviceId}`}>
                  <button
                    type="button"
                    className="inbox-item read"
                    onClick={() => onOpen(request.id)}
                  >
                    <span className="inbox-id">{request.id}</span>
                    <span className="inbox-title">
                      {row.serviceName} · {FLAG_LABEL[row.flag]}
                    </span>
                    <span className="svc-meta">
                      {isApprovalOpen(request) ? 'Onay açık' : 'Onay kapalı'} ·{' '}
                      {request.targetServiceName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
