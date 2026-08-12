import { useMemo, useState } from 'react'
import type { AffectedService, Service } from '../types'
import type { SessionUser } from '../mock/session'
import { createChangeRequest } from '../api/client'

type Props = {
  service: Service
  affected: AffectedService[]
  session: SessionUser
  onClose: () => void
  onCreated: (requestId: string) => void
}

export function ChangeRequestModal({
  service,
  affected,
  session,
  onClose,
  onCreated,
}: Props) {
  const [summary, setSummary] = useState('')
  const [rationale, setRationale] = useState('')
  const [team, setTeam] = useState(session.team ?? '')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const uniqueOwners = useMemo(() => {
    const map = new Map<string, { name: string; team?: string; services: string[] }>()
    for (const { service: s } of affected) {
      const key = s.owner?.id ?? `none-${s.id}`
      const cur = map.get(key) ?? {
        name: s.owner?.name ?? 'Owner atanmamış',
        team: s.owner?.team,
        services: [],
      }
      cur.services.push(s.name)
      map.set(key, cur)
    }
    return [...map.values()]
  }, [affected])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (!summary.trim() || !rationale.trim()) {
      setError('Ne değişiyor ve neden zorunlu.')
      return
    }
    if (affected.length === 0) {
      setError('Doğrudan etkilenen servis yok; talep açılamaz.')
      return
    }
    setSaving(true)
    try {
      const cr = await createChangeRequest({
        targetServiceId: service.id,
        summary,
        rationale,
        personId: session.id,
        personName: session.name,
        team,
        department,
        affectedServiceIds: affected.map((a) => a.service.id),
      })
      onCreated(cr.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="cr-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="cr-title">Değişiklik talebi</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>
        <p className="modal-sub">
          Hedef: <strong>{service.name}</strong> · Onay: 1. katman etkilenenler
        </p>

        <form className="cr-form" onSubmit={submit}>
          <label>
            Ne değişiyor? <span className="req">*</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              required
              placeholder="Kısa özet"
            />
          </label>
          <label>
            Neden? <span className="req">*</span>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              required
              placeholder="Gerekçe"
            />
          </label>
          <label>
            Kişi <span className="req">*</span>
            <input value={session.name} readOnly />
          </label>
          <div className="form-row">
            <label>
              Ekip
              <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Opsiyonel" />
            </label>
            <label>
              Departman
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Opsiyonel"
              />
            </label>
          </div>

          <div className="impact-preview">
            <h3>Etkilenenler (onay istenecek)</h3>
            {affected.length === 0 ? (
              <p className="empty-hint">Doğrudan etkilenen yok.</p>
            ) : (
              <ul>
                {uniqueOwners.map((o) => (
                  <li key={o.name + o.services.join()}>
                    <strong>{o.name}</strong>
                    {o.team ? ` · ${o.team}` : ''} — {o.services.join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <footer className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>
              Vazgeç
            </button>
            <button type="submit" className="btn primary compact" disabled={saving}>
              {saving ? 'Gönderiliyor…' : 'Talebi gönder'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
