/**
 * Inbox: Onay bekleyen + Güncellemeler (iki bölüm).
 * Onay satırları actions’tan; güncellemeler bildirimlerden gelir.
 * approval_needed bildirimi, aynı talep zaten onay listesindeyse gösterilmez.
 */
import { useMemo, useState } from 'react'
import {
  FLAG_LABEL,
  type ChangeRequest,
  type ImpactedFlag,
  type InboxNotification,
} from '../types'

type ActionItem = { request: ChangeRequest; row: ImpactedFlag }

type Props = {
  actions: ActionItem[]
  updates: InboxNotification[]
  onOpen: (requestId: string) => void
  onClose: () => void
  onMarkRead: () => void
}

export function InboxPanel({
  actions,
  updates,
  onOpen,
  onClose,
  onMarkRead,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())

  const pendingApprovals = actions.filter((i) => i.row.flag === 'unseen')
  const pendingApprovalIds = useMemo(
    () => new Set(pendingApprovals.map(({ request }) => request.id)),
    [pendingApprovals],
  )
  const updatesFiltered = useMemo(
    () =>
      updates.filter(
        (n) => !(n.kind === 'approval_needed' && pendingApprovalIds.has(n.requestId)),
      ),
    [updates, pendingApprovalIds],
  )
  const unreadUpdates = updatesFiltered.filter((u) => !u.read)

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderUpdate = (n: InboxNotification) => {
    const tasks = n.relatedTasks
    const isGroup = tasks && tasks.length > 1
    const expanded = expandedGroups.has(n.id)

    if (isGroup) {
      return (
        <li key={n.id} className="inbox-batch-group">
          <button
            type="button"
            className={`inbox-item update ${n.read ? 'read' : 'unread'} kind-${n.kind}`}
            onClick={() => toggleGroup(n.id)}
          >
            {!n.read && <span className="inbox-kind">YENİ</span>}
            <span className="inbox-id">{n.batchId ?? n.requestId}</span>
            <span className="inbox-title">{n.title}</span>
            <span className="svc-meta">
              {expanded ? '▾' : '▸'} {tasks.length} task · {n.body}
            </span>
          </button>
          {expanded && (
            <ul className="inbox-batch-children">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button type="button" className="inbox-item read" onClick={() => onOpen(t.id)}>
                    <span className="inbox-id">{t.id}</span>
                    <span className="inbox-title">{t.serviceName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      )
    }

    const openId = tasks?.length === 1 ? tasks[0]!.id : n.requestId

    return (
      <li key={n.id}>
        <button
          type="button"
          className={`inbox-item update ${n.read ? 'read' : 'unread'} kind-${n.kind}`}
          onClick={() => onOpen(openId)}
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
    )
  }

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
          {pendingApprovals.length} onay bekleyen · {unreadUpdates.length} okunmamış güncelleme
        </p>

        <section className="inbox-section">
          <h3 className="section-title">Onay bekleyen</h3>
          {pendingApprovals.length === 0 ? (
            <p className="empty-hint">Bekleyen onay yok.</p>
          ) : (
            <ul className="inbox-list">
              {pendingApprovals.map(({ request, row }) => (
                <li key={`a-${request.id}-${row.serviceId}`}>
                  <button
                    type="button"
                    className="inbox-item action"
                    onClick={() => onOpen(request.id)}
                  >
                    <span className="inbox-kind">ONAY GEREKİYOR</span>
                    <span className="inbox-id">{request.id}</span>
                    <span className="inbox-title">
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
          <h3 className="section-title">Güncellemeler</h3>
          {updatesFiltered.length === 0 ? (
            <p className="empty-hint">Henüz güncelleme yok.</p>
          ) : (
            <ul className="inbox-list">{updatesFiltered.map(renderUpdate)}</ul>
          )}
        </section>
      </div>
    </div>
  )
}
