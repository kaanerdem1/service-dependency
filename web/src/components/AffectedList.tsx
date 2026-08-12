import type { AffectedService } from '../types'

type Props = {
  items: AffectedService[]
  loading?: boolean
  onPivot: (serviceId: string) => void
}

export function AffectedList({ items, loading, onPivot }: Props) {
  if (loading) {
    return (
      <ul className="affected-list">
        {[1, 2, 3].map((i) => (
          <li key={i} className="affected-row skeleton" />
        ))}
      </ul>
    )
  }

  if (!items.length) {
    return (
      <p className="empty-hint">Bu değişiklikten etkilenen servis yok.</p>
    )
  }

  return (
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
  )
}
