import type { ImpactGraph } from '../types'

type Props = {
  graph: ImpactGraph
  onPivot: (serviceId: string) => void
  onClearCenter?: () => void
}

/** Basit: dinamik hop sütunları (bütçe yetiyorsa 2–3 hop) */
export function SimpleImpactPath({ graph, onPivot, onClearCenter }: Props) {
  const { center, nodes, truncated, reason } = graph
  const byHop = new Map<number, typeof nodes>()
  for (const n of nodes) {
    const list = byHop.get(n.hop) ?? []
    list.push(n)
    byHop.set(n.hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)

  return (
    <div className="simple-path">
      <p className="map-legend">
        Seçili servis → etkilenenler
        {truncated ? ' · görünüm kısaltıldı' : ''}
      </p>
      {truncated && reason && <p className="map-budget-hint">{reason}</p>}
      <div className="simple-path-body multi-hop">
        <div className="path-lane cols">
          <div className="path-col">
            <span className="path-col-label">Merkez</span>
            <button
              type="button"
              className="path-chip center"
              title="Seçimi bırak"
              onClick={() => onClearCenter?.()}
            >
              {center.name}
            </button>
          </div>

          {hops.map((hop) => (
            <div key={hop} className="path-col">
              <span className="path-col-label">
                {hop}. Katman
                {hop === 1 ? ' · doğrudan' : ' · dolaylı'}
              </span>
              <div className={`path-targets hop-${hop}`}>
                {(byHop.get(hop) ?? []).map(({ service }) => (
                  <div key={service.id} className="path-target-row">
                    <span className="path-branch" aria-hidden />
                    <button
                      type="button"
                      className={`path-chip target hop-${hop}`}
                      onClick={() => onPivot(service.id)}
                    >
                      <span className="path-chip-name">{service.name}</span>
                      <span className="path-chip-meta">
                        {service.owner
                          ? `Ekip · ${service.owner.team ?? '—'}`
                          : 'Owner atanmamış'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {hops.length === 0 && (
            <div className="path-col">
              <span className="path-empty">Etkilenen yok</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
