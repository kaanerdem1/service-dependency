/**
 * Mevcut servis için değişiklik talebi formu.
 * Onay listesi = hop-1 downstream (affected); her etkilenen için ayrı task açılır.
 */
import { useMemo, useState } from 'react'
import type { AffectedService, Service } from '../types'
import type { SessionUser } from '../mock/session'
import { createChangeRequest } from '../api/client'

type Props = {
  service: Service
  affected: AffectedService[]
  session: SessionUser
  onClose: () => void
  onCreated: (requestIds: string[]) => void
  buildSnapshotContext?: () => Promise<import('../types').SnapshotClientPayload | undefined>
}

type TabId = 'change' | 'impact' | 'approval'

const TABS: { id: TabId; label: string; required?: boolean }[] = [
  { id: 'change', label: 'Değişiklik', required: true },
  { id: 'impact', label: 'Etki' },
  { id: 'approval', label: 'Onay' },
]

export function ChangeRequestModal({
  service,
  affected,
  session,
  onClose,
  onCreated,
  buildSnapshotContext,
}: Props) {
  const [tab, setTab] = useState<TabId>('change')
  const [summary, setSummary] = useState('')
  const [rationale, setRationale] = useState('')
  const [description, setDescription] = useState('')
  const [serviceImpactNote, setServiceImpactNote] = useState('')
  const [dataImpactNote, setDataImpactNote] = useState('')
  const [team, setTeam] = useState(session.team ?? '')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const tasksPreview = useMemo(
    () =>
      affected.map(({ service: s }) => ({
        serviceName: s.name,
      })),
    [affected],
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (!summary.trim() || !rationale.trim()) {
      setError('Ne değişiyor ve neden zorunlu (Değişiklik sekmesi).')
      setTab('change')
      return
    }
    if (affected.length === 0) {
      setError('Doğrudan etkilenen servis yok; talep açılamaz.')
      setTab('approval')
      return
    }
    setSaving(true)
    try {
      const snapshotContext = buildSnapshotContext
        ? await buildSnapshotContext()
        : undefined
      const { requests: created } = await createChangeRequest({
        kind: 'change',
        targetServiceId: service.id,
        summary,
        rationale,
        description,
        serviceImpact: serviceImpactNote.trim() || undefined,
        dataImpact: dataImpactNote.trim() || undefined,
        personId: session.id,
        personName: session.name,
        team,
        department,
        affectedServiceIds: affected.map((a) => a.service.id),
        snapshotContext,
      })
      onCreated(created.map((c) => c.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const tabIndex = TABS.findIndex((t) => t.id === tab)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal wide cr-modal"
        role="dialog"
        aria-labelledby="cr-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="cr-title">Değişiklik Talebi</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>
        <p className="modal-sub">
          Hedef: <strong>{service.name}</strong>
          {' · '}
          Bu servisi <strong>çağıranlar</strong> etkilenir · her biri için ayrı task (
          {affected.length})
        </p>

        <div className="task-tabs ns-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'on' : ''}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.required ? ' *' : ''}
            </button>
          ))}
        </div>

        <form className="cr-form ns-form" onSubmit={submit}>
          <div className="task-tab-body ns-tab-body cr-tab-body">
            {tab === 'change' && (
              <div className="ns-pane">
                <div className="form-row">
                  <label>
                    Ne değişiyor? <span className="req">*</span>
                    <textarea
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      rows={3}
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
                </div>
                <label>
                  Açıklama
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Opsiyonel uzun açıklama"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Kişi
                    <input value={session.name} readOnly />
                  </label>
                  <label>
                    Ekip
                    <input
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      placeholder="Opsiyonel"
                    />
                  </label>
                </div>
                <label>
                  Departman
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Opsiyonel"
                  />
                </label>
              </div>
            )}

            {tab === 'impact' && (
              <div className="ns-pane">
                <p className="hint-sm">
                  Opsiyonel. Boş bırakırsan task’ta otomatik servis / veri etkisi metni
                  üretilir.
                </p>
                <div className="form-row">
                  <div className="ns-field">
                    <span className="ns-field-label">Servis etkisi</span>
                    <p className="field-hint">
                      API / runtime / sözleşme etkisi (çağıran servisler açısından).
                    </p>
                    <textarea
                      value={serviceImpactNote}
                      onChange={(e) => setServiceImpactNote(e.target.value)}
                      rows={4}
                      placeholder="Örn. Checkout ödeme yanıt şeması değişebilir"
                    />
                  </div>
                  <div className="ns-field">
                    <span className="ns-field-label">Veri etkisi</span>
                    <p className="field-hint">
                      Tablo, kolon, ETL veya rapor tarafına dokunan değişiklik.
                    </p>
                    <textarea
                      value={dataImpactNote}
                      onChange={(e) => setDataImpactNote(e.target.value)}
                      rows={4}
                      placeholder="Örn. billing_events şemasına alan ekleniyor"
                    />
                  </div>
                </div>
              </div>
            )}

            {tab === 'approval' && (
              <div className="ns-pane">
                <h3 className="section-title">Açılacak task’lar</h3>
                <p className="hint-sm">
                  {service.name}’i çağıran servisler (tüketiciler). Her biri için ayrı
                  task açılır.
                </p>
                {tasksPreview.length === 0 ? (
                  <p className="empty-hint">Doğrudan etkilenen yok.</p>
                ) : (
                  <ul className="task-preview-list">
                    {tasksPreview.map((t) => (
                      <li key={t.serviceName}>
                        <strong>T-… — {t.serviceName}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <footer className="modal-foot ns-foot">
            <div className="ns-foot-nav">
              <button
                type="button"
                className="btn ghost"
                disabled={tabIndex === 0}
                onClick={() => {
                  if (tabIndex > 0) setTab(TABS[tabIndex - 1]!.id)
                }}
              >
                ← Önceki
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={tabIndex === TABS.length - 1}
                onClick={() => {
                  if (tabIndex < TABS.length - 1) setTab(TABS[tabIndex + 1]!.id)
                }}
              >
                Sonraki →
              </button>
            </div>
            <div className="ns-foot-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Vazgeç
              </button>
              <button type="submit" className="btn primary compact" disabled={saving}>
                {saving
                  ? 'Gönderiliyor…'
                  : `${affected.length || ''} Task Aç`.trim()}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
