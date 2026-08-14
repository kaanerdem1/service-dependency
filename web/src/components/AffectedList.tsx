/**
 * “İlişkiler” sekmesi: Bu Servisi Çağıranlar + Bu Servisin Çağırdıkları.
 * Satıra tıklayınca pivot değişir.
 */
import type { AffectedService } from '../types'

type Props = {
  /** Bu servisi çağıranlar — onay kapsamı */
  downstream: AffectedService[]
  /** Bu servisin çağırdıkları */
  upstream: AffectedService[]
  loading?: boolean
  onPivot: (serviceId: string) => void
}

function Column({
  title,
  subtitle,
  badge,
  items,
  empty,
  onPivot,
}: {
  title: string
  subtitle: string
  badge: 'down' | 'up'
  items: AffectedService[]
  empty: string
  onPivot: (serviceId: string) => void
}) {
  return (
    <section className={`neighbor-col neighbor-${badge}`}>
      <header className="neighbor-col-head">
        <h3>
          {title}
          <span className="neighbor-count">{items.length}</span>
        </h3>
        <p>{subtitle}</p>
      </header>
      {items.length === 0 ? (
        <p className="empty-hint neighbor-empty">{empty}</p>
      ) : (
        <ul className="affected-list">
          {items.map(({ service }) => (
            <li key={service.id}>
              <button
                type="button"
                className="affected-row"
                onClick={() => onPivot(service.id)}
              >
                <span className="svc-name">{service.name}</span>
                <span className="svc-meta">
                  {service.owner?.team ?? '—'} ·{' '}
                  {service.owner?.name ?? 'Owner atanmamış'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AffectedList({ downstream, upstream, loading, onPivot }: Props) {
  if (loading) {
    return (
      <div className="neighbor-grid">
        {[0, 1].map((col) => (
          <ul key={col} className="affected-list">
            {[1, 2, 3].map((i) => (
              <li key={i} className="affected-row skeleton" />
            ))}
          </ul>
        ))}
      </div>
    )
  }

  return (
    <div className="neighbor-grid">
      <Column
        title="Bu Servisi Çağıranlar"
        subtitle="Downstream · etkilenenler / onay"
        badge="down"
        items={downstream}
        empty="Bu servisi çağıran yok."
        onPivot={onPivot}
      />
      <Column
        title="Bu Servisin Çağırdıkları"
        subtitle="Upstream · bağımlılıklar"
        badge="up"
        items={upstream}
        empty="Çağırdığı servis yok."
        onPivot={onPivot}
      />
    </div>
  )
}
