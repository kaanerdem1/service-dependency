import { useState } from 'react'
import {
  FLAG_LABEL,
  isApprovalOpen,
  taskApprover,
  taskHeadline,
  type ChangeRequest,
  type FlagStatus,
} from '../types'
import { setFlag } from '../api/client'
import type { SessionUser } from '../mock/session'

type Props = {
  request: ChangeRequest
  session: SessionUser
  onClose: () => void
  onUpdated: (request: ChangeRequest) => void
}

type TabId = 'general' | 'service' | 'data' | 'approval'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'Genel' },
  { id: 'service', label: 'Servis etkisi' },
  { id: 'data', label: 'Veri etkisi' },
  { id: 'approval', label: 'Onay' },
]

export function RequestDetailModal({ request, session, onClose, onUpdated }: Props) {
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
      const updated = await setFlag({
        requestId: request.id,
        serviceId: row.serviceId,
        flag,
        note,
        actorOwnerId: session.id,
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
            <h2 className="task-headline">{taskHeadline(request)}</h2>
            <p className="task-subline">
              {request.kind === 'new_service'
                ? `Yeni Servis “${request.proposedServiceName ?? request.targetServiceName}” · onay: ekip lideri`
                : `${request.targetServiceName} → ${request.assigneeServiceName}`}
              {request.batchId ? ` · grup ${request.batchId}` : ''}
            </p>
            <p className="approver-line prominent">
              Onayı verecek: <strong>{approver.label}</strong>
              {mine ? ' · (siz)' : ''}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>

        <div className={`approval-banner ${open ? 'open' : 'closed'}`}>
          {open
            ? `Onay açık — ${approver.name} kabul etti`
            : `Onay kapalı — beklenen: ${approver.label} · ${FLAG_LABEL[row?.flag ?? 'unseen']}`}
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
                <span>Onayı verecek</span>
                <p>
                  <strong>{approver.label}</strong>
                  {!row?.ownerId ? ' — bu task’a owner atanmalı' : ''}
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
                <strong>Talep eden:</strong> {request.requestedBy.personName}
                {request.requestedBy.team ? ` · ${request.requestedBy.team}` : ''}
                {request.requestedBy.department
                  ? ` · ${request.requestedBy.department}`
                  : ''}
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
                <li>
                  <span>Onayı verecek</span>
                  <strong>{approver.label}</strong>
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
              <p className="approver-line prominent">
                Onayı verecek: <strong>{approver.label}</strong>
              </p>
              <div className={`flag-pill ${row.flag}`}>{FLAG_LABEL[row.flag]}</div>
              {row.note && <p className="flag-note">Not: {row.note}</p>}
              {!mine && (
                <p className="hint-sm">
                  Bu task’ın onaycısı {approver.name}. Siz yalnızca durumu görebilirsiniz.
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
        </div>
      </div>
    </div>
  )
}
