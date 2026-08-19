import { useState } from 'react'
import {
  FLAG_LABEL,
  isApprovalOpen,
  taskApprover,
  taskHeadline,
  type ChangeRequest,
  type FlagStatus,
  type SnapshotClientPayload,
} from '../types'
import { setFlag } from '../api/client'
import type { SessionUser } from '../mock/session'
import { SnapshotList } from './SnapshotList'

type Props = {
  request: ChangeRequest
  session: SessionUser
  onClose: () => void
  onBackToInbox?: () => void
  onUpdated: (request: ChangeRequest) => void
  buildSnapshotContext?: () => Promise<SnapshotClientPayload | undefined>
}

type TabId = 'general' | 'service' | 'data' | 'approval' | 'snapshots'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'Genel' },
  { id: 'service', label: 'Servis etkisi' },
  { id: 'data', label: 'Veri etkisi' },
  { id: 'approval', label: 'Onay' },
  { id: 'snapshots', label: 'Snapshot' },
]

export function RequestDetailModal({
  request,
  session,
  onClose,
  onBackToInbox,
  onUpdated,
  buildSnapshotContext,
}: Props) {
  const [tab, setTab] = useState<TabId>('general')
  const open = isApprovalOpen(request)
  const row = request.impacted[0]
  const mine = row?.ownerId === session.id
  const approver = taskApprover(request)
  const [note, setNote] = useState(row?.note ?? '')
  const [error, setError] = useState<string>()

  const apply = async (flag: FlagStatus) => {
    if (!row) return
    setError(undefined)
    try {
      const snapshotContext = buildSnapshotContext
        ? await buildSnapshotContext()
        : undefined
      const { request: updated } = await setFlag({
        requestId: request.id,
        serviceId: row.serviceId,
        flag,
        note,
        actorOwnerId: session.id,
        snapshotContext,
      })
      onUpdated(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Flag atanamadı')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal wide task-detail" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head task-head">
          <div>
            {onBackToInbox && (
              <button type="button" className="btn ghost inbox-back" onClick={onBackToInbox}>
                ← Inbox’a dön
              </button>
            )}
            <h2 className="task-headline">{taskHeadline(request)}</h2>
            <p className="task-subline">
              {request.kind === 'new_service'
                ? `Yeni Servis “${request.proposedServiceName ?? request.targetServiceName}”`
                : `${request.targetServiceName} → ${request.assigneeServiceName}`}
              {request.batchId ? ` · grup ${request.batchId}` : ''}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>

        <div className={`approval-banner ${open ? 'open' : 'closed'}`}>
          {open
            ? `Onay açık — ${approver.label} kabul etti`
            : `Onay kapalı — ${approver.label} · ${FLAG_LABEL[row?.flag ?? 'unseen']}`}
        </div>

        <div className="task-tabs" role="tablist">
          {TABS.map((t) => (
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

        <div className="task-tab-body" role="tabpanel">
          {tab === 'general' && (
            <div className="task-pane">
              <label className="task-field">
                <span>Etkilenen servis</span>
                <p>
                  <strong>{approver.label}</strong>
                </p>
              </label>
              <label className="task-field">
                <span>Özet</span>
                <p>{request.summary}</p>
              </label>
              <label className="task-field">
                <span>Neden</span>
                <p>{request.rationale}</p>
              </label>
              <label className="task-field">
                <span>Açıklama</span>
                <p className="pre">{request.description ?? '—'}</p>
              </label>
              {request.kind === 'new_service' && (
                <label className="task-field">
                  <span>Çağıracağı servisler (bağımlılık)</span>
                  <p>
                    {request.dependsOnServiceNames?.length
                      ? request.dependsOnServiceNames.join(', ')
                      : 'Belirtilmedi'}
                  </p>
                </label>
              )}
              <p className="cr-meta">
                <strong>Hedef servis:</strong> {request.targetServiceName}
              </p>
            </div>
          )}

          {tab === 'service' && (
            <div className="task-pane">
              <h3 className="section-title">Servis etkisi</h3>
              <p className="pre">{request.serviceImpact ?? 'Kayıt yok.'}</p>
              <ul className="task-kv">
                <li>
                  <span>Hedef servis</span>
                  <strong>{request.targetServiceName}</strong>
                </li>
                <li>
                  <span>Etkilenen servis</span>
                  <strong>{request.assigneeServiceName}</strong>
                </li>
              </ul>
            </div>
          )}

          {tab === 'data' && (
            <div className="task-pane">
              <h3 className="section-title">Veri etkisi</h3>
              <p className="pre">{request.dataImpact ?? 'Kayıt yok.'}</p>
              <p className="hint-sm">
                İleride tablo/kolon/ETL katalog lineage buraya bağlanacak.
              </p>
            </div>
          )}

          {tab === 'approval' && row && (
            <div className="task-pane">
              <h3 className="section-title">Onay</h3>
              <p className="hint-sm">
                Onay bekleyen servis: <strong>{approver.label}</strong>
              </p>
              <div className={`flag-pill ${row.flag}`}>{FLAG_LABEL[row.flag]}</div>
              {row.note && <p className="flag-note">Not: {row.note}</p>}
              {!mine && (
                <p className="hint-sm">
                  Bu oturumda onay aksiyonu yok; yalnızca durumu görebilirsiniz.
                </p>
              )}
              {mine && (
                <div className="flag-actions stacked">
                  <input
                    placeholder="Not (red için zorunlu)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flag-btns">
                    <button type="button" onClick={() => void apply('accepted')}>
                      Kabul
                    </button>
                    <button type="button" onClick={() => void apply('rejected')}>
                      Red
                    </button>
                    <button type="button" onClick={() => void apply('hold_editing')}>
                      Düzenleniyor
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="form-error">{error}</p>}
            </div>
          )}

          {tab === 'snapshots' && (
            <div className="task-pane">
              <h3 className="section-title">Snapshot kayıtları</h3>
              <p className="hint-sm">
                Talep açılışı, onay ve kapı açılışı otomatik kaydedilir. PNG + JSON
                indirilebilir.
              </p>
              <SnapshotList requestId={request.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
