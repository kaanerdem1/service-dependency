import { useState } from 'react'
import {
  FLAG_LABEL,
  approvalSummary,
  isApprovalOpen,
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

export function RequestDetailModal({ request, session, onClose, onUpdated }: Props) {
  const open = isApprovalOpen(request)
  const counts = approvalSummary(request)
  const myRows = request.impacted.filter((r) => r.ownerId === session.id)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()

  const apply = async (serviceId: string, flag: FlagStatus) => {
    setError(undefined)
    try {
      const updated = await setFlag({
        requestId: request.id,
        serviceId,
        flag,
        note: notes[serviceId],
        actorOwnerId: session.id,
      })
      onUpdated(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Flag atanamadı')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal wide" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>
            {request.id} · {request.targetServiceName}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>

        <div className={`approval-banner ${open ? 'open' : 'closed'}`}>
          {open
            ? 'Onay açık — tüm etkilenenler kabul etti; değişiklik yapılabilir'
            : `Onay kapalı — ${counts.accepted}/${request.impacted.length} kabul · ${counts.rejected} red · ${counts.hold_editing} düzenleniyor · ${counts.unseen} görülmedi`}
        </div>

        <section className="result-board">
          <h3 className="section-title">Sonuç özeti</h3>
          <ul className="result-lines">
            {request.impacted.map((row) => (
              <li key={row.serviceId} className={`result-line flag-${row.flag}`}>
                <strong>{row.serviceName}</strong>
                <span className={`flag-pill ${row.flag}`}>{FLAG_LABEL[row.flag]}</span>
                <span className="svc-meta">
                  {row.ownerName ?? 'Owner yok'}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="cr-meta">
          <strong>Ne:</strong> {request.summary}
          <br />
          <strong>Neden:</strong> {request.rationale}
          <br />
          <strong>Talep eden:</strong> {request.requestedBy.personName}
          {request.requestedBy.team ? ` · ${request.requestedBy.team}` : ''}
        </p>

        <h3 className="section-title">Flag güncelle</h3>
        <ul className="flag-list">
          {request.impacted.map((row) => {
            const mine = row.ownerId === session.id
            return (
              <li key={row.serviceId} className={`flag-row flag-${row.flag}`}>
                <div>
                  <strong>{row.serviceName}</strong>
                  <span className="svc-meta">
                    {' '}
                    · {row.ownerName ?? 'Owner yok'}
                    {row.team ? ` · ${row.team}` : ''}
                  </span>
                  <div className={`flag-pill ${row.flag}`}>{FLAG_LABEL[row.flag]}</div>
                  {row.note && <p className="flag-note">Not: {row.note}</p>}
                  {!mine && (
                    <p className="hint-sm">Bu satır başka owner’a ait — yalnızca durum görünür.</p>
                  )}
                </div>
                {mine && (
                  <div className="flag-actions">
                    <input
                      placeholder="Not (red için zorunlu)"
                      value={notes[row.serviceId] ?? ''}
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [row.serviceId]: e.target.value }))
                      }
                    />
                    <div className="flag-btns">
                      <button type="button" onClick={() => void apply(row.serviceId, 'accepted')}>
                        Kabul
                      </button>
                      <button type="button" onClick={() => void apply(row.serviceId, 'rejected')}>
                        Red
                      </button>
                      <button
                        type="button"
                        onClick={() => void apply(row.serviceId, 'hold_editing')}
                      >
                        Düzenleniyor
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {myRows.length === 0 && (
          <p className="hint-sm">
            Bu talepte senin onay satırın yok (oturum: {session.name}). Inbox’taki
            “Taleplerinin durumu” bildirimlerini takip edebilirsin.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  )
}
