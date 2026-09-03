import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getServiceCatalogContext, getServiceLocations } from '../api/client'
import { AnimatedNumber } from '../motion/AnimatedNumber'
import { MotionSpotlight } from '../motion/MotionSpotlight'
import { EmptyState } from './EmptyState'
import { Button, Card, Field } from '../ui'
import type {
  Service,
  ServiceCatalogContext,
  ServiceLocation,
} from '../types'

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
      {hint ? (
        <p className="service-bento-stat-hint">{hint}</p>
      ) : (
        <p className="service-bento-stat-hint is-reserved" aria-hidden />
      )}
    </div>
  )
}

function LocationPanel({
  service,
  packageLabel,
  locations,
}: {
  service: Service
  packageLabel?: string
  locations: ServiceLocation[]
}) {
  const primaryGroup = service.projectGroupLabel ?? '—'
  const primaryJar = locationPackageLabel(service, packageLabel)

  if (locations.length <= 1) {
    return (
      <div className="service-doc-body service-location-compact">
        <DocItem label="Proje Grubu">{primaryGroup}</DocItem>
        <DocItem label="Jar" mono>
          {primaryJar}
        </DocItem>
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
            <span className="service-location-group">{loc.projectGroupLabel}</span>
            <span className="service-location-jar">{loc.artifactLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LocationFields({
  service,
  packageLabel,
  locations,
}: {
  service: Service
  packageLabel?: string
  locations: ServiceLocation[]
}) {
  if (locations.length <= 1) {
    return (
      <div className="service-doc-body service-location-compact">
        <Field label="Proje Grubu" value={service.projectGroupLabel ?? '—'} readOnly />
        <Field label="Jar" value={locationPackageLabel(service, packageLabel)} readOnly />
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
            <strong>{loc.projectGroupLabel}</strong>
            <span>{loc.artifactLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OwnershipPanel({
  service,
  catalogContext,
  locationsReady,
  hasJarPath,
}: {
  service: Service
  catalogContext: ServiceCatalogContext | null
  locationsReady: boolean
  hasJarPath: boolean
}) {
  const itTeam = catalogContext?.responsibleItTeam
  const businessUnit = catalogContext?.responsibleBusinessUnit
  const hasDbOwnership = Boolean(itTeam || businessUnit)
  const hasMockOwner = Boolean(service.owner)
  const isUnlocated = locationsReady && !hasJarPath

  if (isUnlocated && !hasDbOwnership && !hasMockOwner) {
    return (
      <p className="service-doc-hint service-bento-hint service-ownership-compact">
        <strong>Konumsuz.</strong> IT / iş birimi jar yolu olmadan okunamaz.
      </p>
    )
  }

  if (!hasDbOwnership && !hasMockOwner) {
    return (
      <p className="service-doc-hint service-bento-hint service-ownership-compact">
        {hasJarPath
          ? 'Projede sahiplik alanı boş.'
          : 'Sahiplik jar → proje yoluyla okunur; kayıt yok.'}
      </p>
    )
  }

  return (
    <div className="service-doc-body service-ownership-compact-body">
      {itTeam ? <DocItem label="IT ekibi">{itTeam}</DocItem> : null}
      {businessUnit ? <DocItem label="İş birimi">{businessUnit}</DocItem> : null}
      {hasMockOwner && service.owner ? (
        <>
          <DocItem label="Sorumlu (mock)">{service.owner.name}</DocItem>
          <DocItem label="Ekip (mock)">{service.owner.team ?? '—'}</DocItem>
        </>
      ) : null}
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
  const [catalogContext, setCatalogContext] = useState<ServiceCatalogContext | null>(null)

  const dbSummary = catalogContext?.serviceDescription?.trim() || null
  const baseline = useMemo(
    () =>
      dbSummary ??
      defaultSummary(service, callerCount, calleeCount, projectLabel),
    [dbSummary, service, callerCount, calleeCount, projectLabel],
  )
  const summaryLocked = Boolean(dbSummary)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(baseline)
  const [saved, setSaved] = useState<string | null>(null)
  const [locations, setLocations] = useState<ServiceLocation[]>([])
  const [locationsReady, setLocationsReady] = useState(false)

  const isInventoryService = service.id.startsWith('sd-')

  useEffect(() => {
    if (!isInventoryService) {
      setLocations([])
      setCatalogContext(null)
      setLocationsReady(true)
      return
    }
    let cancelled = false
    setLocationsReady(false)
    void Promise.all([getServiceLocations(service.id), getServiceCatalogContext(service.id)])
      .then(([locRows, ctx]) => {
        if (cancelled) return
        setLocations(locRows)
        setCatalogContext(ctx)
        setLocationsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setLocations([])
        setCatalogContext(null)
        setLocationsReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [service.id, isInventoryService])

  useEffect(() => {
    const stored = summaryLocked ? null : localStorage.getItem(summaryStorageKey(service.id))
    setSaved(stored)
    setDraft(stored ?? baseline)
    setEditing(false)
  }, [service.id, baseline, summaryLocked])

  if (loading) {
    return (
      <EmptyState
        what="Servis bilgisi yükleniyor."
        action="Birkaç saniye bekleyin; sorun sürerse başka bir servis seçin."
      />
    )
  }

  const summary = saved ?? baseline
  const hasDbOwnership = Boolean(
    catalogContext?.responsibleItTeam || catalogContext?.responsibleBusinessUnit,
  )
  const hasOwner = Boolean(service.owner) || hasDbOwnership
  const hasJarPath = locations.length > 0

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

  const showEdit = !summaryLocked

  const editActions = showEdit ? (
    <div className="service-overview-actions">
      {editing ? (
        <>
          <Button variant="ghost" compact onClick={cancel}>
            İptal
          </Button>
          <Button variant="primary" compact onClick={save}>
            Kaydet
          </Button>
        </>
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
    </div>
  ) : null

  const identityTile = (
    <BentoTile area="identity" title="Kimlik">
      {editing ? (
        <div className="service-doc-body">
          <div className="service-doc-columns service-doc-columns--meta">
            <Field label="Servis adı" value={service.name} readOnly />
            <Field label="Servis kimliği" value={service.id} readOnly />
          </div>
        </div>
      ) : (
        <div className="service-doc-body">
          <p className="service-bento-hero-name">{service.name}</p>
          <DocItem label="Servis kimliği" mono>
            {service.id}
          </DocItem>
        </div>
      )}
    </BentoTile>
  )

  const locationTile = (
    <BentoTile area="location" title="Konum">
      {editing ? (
        <LocationFields
          service={service}
          packageLabel={packageLabel}
          locations={locations}
        />
      ) : (
        <LocationPanel
          service={service}
          packageLabel={packageLabel}
          locations={locations}
        />
      )}
    </BentoTile>
  )

  return (
    <article className={`service-overview${editing ? ' is-editing' : ''}`}>
      <div className="service-overview-head">
        {identityTile}
        {locationTile}
      </div>

      <div className="service-overview-stage">
        {editing ? (
          <form
            className={`service-bento service-bento-form${hasOwner ? ' has-owner' : ''}`}
            aria-label="Servis işlevi düzenle"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <BentoTile area="summary" title="İşlev özeti">
              <Field
                label="İşlev özeti"
                multiline
                rows={8}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </BentoTile>

            <BentoTile area="ownership" title="Sahiplik">
              <OwnershipPanel
                service={service}
                catalogContext={catalogContext}
                locationsReady={locationsReady}
                hasJarPath={hasJarPath}
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
          </form>
        ) : (
          <div className={`service-bento${hasOwner ? ' has-owner' : ''}`}>
            <BentoTile area="summary" title="İşlev özeti">
              <div className="service-summary-head">
                {summaryLocked ? (
                  <span className="service-summary-badge">Envanter</span>
                ) : saved ? (
                  <span className="service-summary-badge is-local">Yerel not</span>
                ) : (
                  <p className="service-doc-source-hint">
                    Envanterde kayıt yok — otomatik özet; sağ alttan Düzenle ile kaydedebilirsiniz.
                  </p>
                )}
              </div>
              <div className="service-doc-body service-doc-value">
                {renderSummaryText(summary)}
              </div>
            </BentoTile>

            <BentoTile area="ownership" title="Sahiplik">
              <OwnershipPanel
                service={service}
                catalogContext={catalogContext}
                locationsReady={locationsReady}
                hasJarPath={hasJarPath}
              />
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
          </div>
        )}
      </div>

      {editActions ? (
        <div className="service-overview-foot">{editActions}</div>
      ) : null}
    </article>
  )
}
