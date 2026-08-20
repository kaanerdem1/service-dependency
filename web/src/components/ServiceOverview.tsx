import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Service } from '../types'

type Props = {
  service: Service
  projectLabel?: string
  packageLabel?: string
  callerCount: number
  calleeCount: number
  loading?: boolean
}

function exampleOperations(serviceName: string): string[] {
  const n = serviceName.toLowerCase()
  if (n.includes('payment') || n.includes('billing'))
    return ['Ödeme yetkilendirme ve tahsilat', 'Kart / hesap doğrulama', 'İşlem mutabakatı']
  if (n.includes('order') || n.includes('checkout'))
    return ['Sipariş oluşturma ve güncelleme', 'Sepet koordinasyonu', 'Checkout akış yönetimi']
  if (n.includes('notification') || n.includes('message'))
    return ['Çok kanallı bildirim yönlendirme', 'Mesaj teslim takibi', 'Şablon ve kanal seçimi']
  if (n.includes('catalog') || n.includes('product'))
    return ['Ürün kataloğu sorgulama', 'Stok ve fiyat bilgisi sunma', 'Arama ve filtreleme']
  return [
    'İş kurallarını uygulama ve API çağrılarını koordine etme',
    'Bağımlı servislerle veri alışverişi',
    'Merkez servis olarak etki analizi',
  ]
}

function defaultSummary(
  service: Service,
  callerCount: number,
  calleeCount: number,
  projectLabel?: string,
): string {
  const project = projectLabel ?? service.projectId
  const ops = exampleOperations(service.name)
  const bulletLines = ops.map((op) => `• ${op}`).join('\n')
  return [
    `Bu servis (${service.name}) ${project} projesi kapsamında aşağıdaki işlemleri yürütür:`,
    bulletLines,
    '',
    `Bağımlılık açısından ${callerCount} servis bu servisi çağırıyor; servis ${calleeCount} servise bağımlı. Değişiklik veya incident durumunda Harita ve İlişkiler sekmelerinden etki zincirini inceleyin.`,
  ].join('\n')
}

function summaryStorageKey(serviceId: string) {
  return `sd-service-summary:${serviceId}`
}

function DocItem({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="service-doc-item">
      <h4 className="service-doc-label">{label}</h4>
      <div className={`service-doc-value${mono ? ' is-mono' : ''}`}>{children}</div>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  readOnly,
  mono,
  multiline,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  mono?: boolean
  multiline?: boolean
}) {
  return (
    <label className="service-form-field">
      <span className="service-form-label">{label}</span>
      {multiline ? (
        <textarea
          className={`service-form-input${mono ? ' is-mono' : ''}`}
          rows={8}
          value={value}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
      ) : (
        <input
          className={`service-form-input${mono ? ' is-mono' : ''}`}
          value={value}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
      )}
    </label>
  )
}

export function ServiceOverview({
  service,
  projectLabel,
  packageLabel,
  callerCount,
  calleeCount,
  loading,
}: Props) {
  const baseline = useMemo(
    () => defaultSummary(service, callerCount, calleeCount, projectLabel),
    [service, callerCount, calleeCount, projectLabel],
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(baseline)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(summaryStorageKey(service.id))
    setSaved(stored)
    setDraft(stored ?? baseline)
    setEditing(false)
  }, [service.id, baseline])

  if (loading) {
    return <p className="empty-hint">Servis bilgisi yükleniyor…</p>
  }

  const summary = saved ?? baseline

  const save = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== baseline) {
      localStorage.setItem(summaryStorageKey(service.id), trimmed)
      setSaved(trimmed)
    } else {
      localStorage.removeItem(summaryStorageKey(service.id))
      setSaved(null)
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(saved ?? baseline)
    setEditing(false)
  }

  const renderSummaryText = (text: string) =>
    text.split('\n').map((line, i) => {
      if (!line.trim()) return <br key={i} />
      if (line.startsWith('• '))
        return (
          <p key={i} className="service-doc-bullet">
            {line}
          </p>
        )
      return <p key={i}>{line}</p>
    })

  return (
    <article className={`service-overview${editing ? ' is-editing' : ''}`}>
      <header className="service-overview-toolbar">
        {editing ? (
          <div className="service-overview-edit-actions">
            <button type="button" className="btn ghost compact" onClick={cancel}>
              İptal
            </button>
            <button type="button" className="btn primary compact" onClick={save}>
              Kaydet
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn ghost compact"
            onClick={() => {
              setDraft(saved ?? baseline)
              setEditing(true)
            }}
          >
            Düzenle
          </button>
        )}
      </header>

      {editing ? (
        <form
          className="service-overview-form"
          aria-label="Servis işlevi düzenle"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <section className="service-form-section">
            <h3 className="service-doc-heading">Kimlik</h3>
            <FormField label="Servis adı" value={service.name} readOnly />
            <FormField label="Servis kimliği" value={service.id} readOnly mono />
            <FormField
              label="İşlev özeti"
              value={draft}
              multiline
              onChange={setDraft}
            />
          </section>

          <section className="service-form-section">
            <h3 className="service-doc-heading">Konum</h3>
            <div className="service-form-row">
              <FormField
                label="Proje"
                value={projectLabel ?? service.projectId}
                readOnly
              />
              <FormField
                label="Paket"
                value={packageLabel ?? service.packageId}
                readOnly
                mono
              />
            </div>
          </section>

          <section className="service-form-section">
            <h3 className="service-doc-heading">Bağımlılık</h3>
            <div className="service-form-row">
              <FormField
                label="Bu servisi çağıran"
                value={`${callerCount} servis`}
                readOnly
              />
              <FormField
                label="Çağırdığı servis"
                value={`${calleeCount} servis`}
                readOnly
              />
            </div>
          </section>

          {service.owner && (
            <section className="service-form-section">
              <h3 className="service-doc-heading">Sahiplik</h3>
              <div className="service-form-row">
                <FormField label="Sorumlu" value={service.owner.name} readOnly />
                <FormField
                  label="Ekip"
                  value={service.owner.team ?? '—'}
                  readOnly
                />
              </div>
            </section>
          )}
        </form>
      ) : (
        <>
          <section className="service-doc-section">
            <h3 className="service-doc-heading">Kimlik</h3>
            <div className="service-doc-body">
              <DocItem label="Servis adı">{service.name}</DocItem>
              <DocItem label="Servis kimliği" mono>
                {service.id}
              </DocItem>
              <DocItem label="İşlev özeti">{renderSummaryText(summary)}</DocItem>
            </div>
          </section>

          <section className="service-doc-section">
            <h3 className="service-doc-heading">Konum</h3>
            <div className="service-doc-body service-doc-columns">
              <DocItem label="Proje">{projectLabel ?? service.projectId}</DocItem>
              <DocItem label="Paket" mono>
                {packageLabel ?? service.packageId}
              </DocItem>
            </div>
          </section>

          <section className="service-doc-section">
            <h3 className="service-doc-heading">Bağımlılık</h3>
            <div className="service-doc-body service-doc-columns">
              <DocItem label="Bu servisi çağıran">{callerCount} servis</DocItem>
              <DocItem label="Çağırdığı servis">{calleeCount} servis</DocItem>
            </div>
            <p className="service-doc-hint">
              Detaylı listeler için İlişkiler sekmesine geçin.
            </p>
          </section>

          {service.owner && (
            <section className="service-doc-section">
              <h3 className="service-doc-heading">Sahiplik</h3>
              <div className="service-doc-body service-doc-columns">
                <DocItem label="Sorumlu">{service.owner.name}</DocItem>
                <DocItem label="Ekip">{service.owner.team ?? '—'}</DocItem>
              </div>
              {service.owner.role && (
                <div className="service-doc-body">
                  <DocItem label="Rol">
                    {service.owner.role === 'lead' ? 'Ekip lideri' : 'Ekip üyesi'}
                  </DocItem>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </article>
  )
}
