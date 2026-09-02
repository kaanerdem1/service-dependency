import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getServiceLocations } from '../api/client'
import { AnimatedNumber } from '../motion/AnimatedNumber'
import { MotionSpotlight } from '../motion/MotionSpotlight'
import { MotionToast } from '../motion/MotionToast'
import { EmptyState } from './EmptyState'
import { Button, Card, Field } from '../ui'
import type { Service, ServiceLocation } from '../types'

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

function locationProjectLabel(
  service: Service,
  projectLabel?: string,
): string {
  const parts = [service.projectGroupLabel, service.projectLabel ?? projectLabel].filter(
    Boolean,
  ) as string[]
  if (parts.length) return parts.join(' › ')
  return service.projectId
}

function locationPackageLabel(service: Service, packageLabel?: string): string {
  return service.packageLabel ?? packageLabel ?? service.packageId
}
function defaultSummary(
  service: Service,
  callerCount: number,
  calleeCount: number,
  projectLabel?: string,
): string {
  const project = locationProjectLabel(service, projectLabel)
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

function BentoTile({
  area,
  title,
  children,
  spotlight = false,
  compactHeading = false,
}: {
  area: string
  title: string
  children: ReactNode
  spotlight?: boolean
  compactHeading?: boolean
}) {
  const body = (
    <Card
      as="section"
      className={`service-doc-section service-doc-section--compact service-bento-tile service-bento-tile--${area}`}
    >
      <h3
        className={`service-doc-heading${compactHeading ? ' service-doc-heading--tile' : ''}`}
      >
        {title}
      </h3>
      {children}
    </Card>
  )

  if (!spotlight) return body

  return (
    <MotionSpotlight className={`service-bento-spotlight service-bento-spotlight--${area}`}>
      {body}
    </MotionSpotlight>
  )
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="service-bento-stat">
      <AnimatedNumber value={value} className="service-bento-stat-num" />
      <span className="service-bento-stat-label">{label}</span>
      {hint ? <p className="service-bento-stat-hint">{hint}</p> : null}
    </div>
  )
}

function LocationPanel({
  service,
  projectLabel,
  packageLabel,
  locations,
}: {
  service: Service
  projectLabel?: string
  packageLabel?: string
  locations: ServiceLocation[]
}) {
  const primaryProject = locationProjectLabel(service, projectLabel)
  const primaryPackage = locationPackageLabel(service, packageLabel)

  if (locations.length <= 1) {
    return (
      <div className="service-doc-body service-doc-columns">
        <DocItem label="Proje">{primaryProject}</DocItem>
        <DocItem label="Paket" mono>
          {primaryPackage}
        </DocItem>
      </div>
    )
  }

  return (
    <div className="service-doc-body service-location-list">
      <p className="service-location-multi-hint">
        Bu servis {locations.length} farklı jar konumunda tanımlı.
      </p>
      <ul className="service-location-rows">
        {locations.map((loc) => (
          <li key={loc.artifactId} className="service-location-row">
            <span className="service-location-jar">{loc.artifactLabel}</span>
            <span className="service-location-path">
              {loc.projectGroupLabel} › {loc.projectLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LocationFields({
  service,
  projectLabel,
  packageLabel,
  locations,
}: {
  service: Service
  projectLabel?: string
  packageLabel?: string
  locations: ServiceLocation[]
}) {
  if (locations.length <= 1) {
    return (
      <div className="service-doc-body service-doc-columns">
        <Field
          label="Proje"
          value={locationProjectLabel(service, projectLabel)}
          readOnly
        />
        <Field
          label="Paket"
          value={locationPackageLabel(service, packageLabel)}
          readOnly
        />
      </div>
    )
  }

  return (
    <div className="service-doc-body service-location-list">
      <p className="service-location-multi-hint">
        {locations.length} jar konumu
      </p>
      <ul className="service-location-rows">
        {locations.map((loc) => (
          <li key={loc.artifactId} className="service-location-row">
            <strong>{loc.artifactLabel}</strong>
            <span>
              {loc.projectGroupLabel} › {loc.projectLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  const [locations, setLocations] = useState<ServiceLocation[]>([])
  const [copyToast, setCopyToast] = useState<string>()

  useEffect(() => {
    if (!service.id.startsWith('sd-')) {
      setLocations([])
      return
    }
    let cancelled = false
    void getServiceLocations(service.id)
      .then((rows) => {
        if (!cancelled) setLocations(rows)
      })
      .catch(() => {
        if (!cancelled) setLocations([])
      })
    return () => {
      cancelled = true
    }
  }, [service.id])

  useEffect(() => {
    const stored = localStorage.getItem(summaryStorageKey(service.id))
    setSaved(stored)
    setDraft(stored ?? baseline)
    setEditing(false)
  }, [service.id, baseline])

  useEffect(() => {
    if (!copyToast) return
    const t = window.setTimeout(() => setCopyToast(undefined), 2200)
    return () => window.clearTimeout(t)
  }, [copyToast])

  if (loading) {
    return (
      <EmptyState
        what="Servis bilgisi yükleniyor."
        action="Birkaç saniye bekleyin; sorun sürerse başka bir servis seçin."
      />
    )
  }

  const summary = saved ?? baseline
  const hasOwner = Boolean(service.owner)
  const blastRadius = service.affectedCount ?? callerCount

  const copyServiceId = async () => {
    try {
      await navigator.clipboard.writeText(service.id)
      setCopyToast('Servis kimliği kopyalandı')
    } catch {
      setCopyToast('Kopyalanamadı')
    }
  }

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
            <Button variant="ghost" compact onClick={cancel}>
              İptal
            </Button>
            <Button variant="primary" compact onClick={save}>
              Kaydet
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            compact
            onClick={() => {
              setDraft(saved ?? baseline)
              setEditing(true)
            }}
          >
            Düzenle
          </Button>
        )}
      </header>
      {editing ? (
        <form
          className={`service-bento service-bento-form${hasOwner ? ' has-owner' : ''}`}
          aria-label="Servis işlevi düzenle"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <BentoTile area="identity" title="Kimlik">
            <div className="service-doc-body">
              <div className="service-doc-columns service-doc-columns--meta">
                <Field label="Servis adı" value={service.name} readOnly />
                <Field label="Servis kimliği" value={service.id} readOnly />
              </div>
            </div>
          </BentoTile>

          <BentoTile area="location" title="Konum">
            <LocationFields
              service={service}
              projectLabel={projectLabel}
              packageLabel={packageLabel}
              locations={locations}
            />
          </BentoTile>

          <BentoTile area="summary" title="İşlev özeti">
            <Field
              label="İşlev özeti"
              multiline
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </BentoTile>

          <BentoTile area="callers" title="Gelen çağrılar" compactHeading>
            <Field
              label="Bu servisi çağıran"
              value={`${callerCount} servis`}
              readOnly
            />
          </BentoTile>

          <BentoTile area="callees" title="Giden çağrılar" compactHeading>
            <Field
              label="Çağırdığı servis"
              value={`${calleeCount} servis`}
              readOnly
            />
          </BentoTile>

          {hasOwner && service.owner ? (
            <BentoTile area="ownership" title="Sahiplik">
              <div className="service-doc-body service-doc-columns">
                <Field label="Sorumlu" value={service.owner.name} readOnly />
                <Field label="Ekip" value={service.owner.team ?? '—'} readOnly />
              </div>
            </BentoTile>
          ) : (
            <BentoTile area="hint" title="Etki analizi">
              <p className="service-doc-hint service-bento-hint">
                Harita ve İlişkiler sekmelerinden tam bağımlılık listesine geçin.
              </p>
            </BentoTile>
          )}
        </form>
      ) : (
        <>
          <div className="service-metrics-strip" aria-label="Özet metrikler">
            <StatTile label="Etki yarıçapı" value={blastRadius} hint="Değişince etkilenen" />
            <StatTile label="Gelen çağrı" value={callerCount} />
            <StatTile label="Giden çağrı" value={calleeCount} />
          </div>
        <div className={`service-bento${hasOwner ? ' has-owner' : ''}`}>
          <BentoTile area="identity" title="Kimlik" spotlight>
            <div className="service-doc-body">
              <p className="service-bento-hero-name">{service.name}</p>
              <DocItem label="Servis kimliği" mono>
                <span className="service-id-copy-row">
                  {service.id}
                  <button type="button" className="service-id-copy-btn" onClick={() => void copyServiceId()}>
                    Kopyala
                  </button>
                </span>
              </DocItem>
            </div>
          </BentoTile>

          <BentoTile area="location" title="Konum">
            <LocationPanel
              service={service}
              projectLabel={projectLabel}
              packageLabel={packageLabel}
              locations={locations}
            />
          </BentoTile>

          <BentoTile area="summary" title="İşlev özeti">
            <div className="service-doc-body service-doc-value">
              {renderSummaryText(summary)}
            </div>
          </BentoTile>

          <BentoTile area="callers" title="Gelen çağrılar" compactHeading>
            <StatTile
              label="Bu servisi çağıran"
              value={callerCount}
              hint="İlişkiler sekmesinde liste"
            />
          </BentoTile>

          <BentoTile area="callees" title="Giden çağrılar" compactHeading>
            <StatTile label="Çağırdığı servis" value={calleeCount} />
          </BentoTile>

          {hasOwner && service.owner ? (
            <BentoTile area="ownership" title="Sahiplik">
              <div className="service-doc-body service-doc-columns">
                <DocItem label="Sorumlu">{service.owner.name}</DocItem>
                <DocItem label="Ekip">{service.owner.team ?? '—'}</DocItem>
              </div>
              {service.owner.role ? (
                <div className="service-doc-body">
                  <DocItem label="Rol">
                    {service.owner.role === 'lead' ? 'Ekip lideri' : 'Ekip üyesi'}
                  </DocItem>
                </div>
              ) : null}
            </BentoTile>
          ) : (
            <BentoTile area="ownership" title="Sahiplik">
              <p className="service-doc-hint service-bento-hint">
                Ownership kartı F4 entegrasyonu ile eklenecek. Şimdilik İlişkiler
                ve Harita sekmelerinden etki analizine geçin.
              </p>
            </BentoTile>
          )}
        </div>
        </>
      )}
      <MotionToast open={!!copyToast}>{copyToast}</MotionToast>
    </article>
  )
}
