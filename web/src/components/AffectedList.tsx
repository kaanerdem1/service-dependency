/**
 * “İlişkiler” sekmesi: Bu Servisi Çağıranlar + Bu Servisin Çağırdıkları.
 * Satıra tıklayınca pivot değişir (Harita ile aynı gezinme geçmişi).
 */
import { useMemo, useState } from 'react'
import type { AffectedService, Service } from '../types'

type Props = {
  /** Bu servisi çağıranlar — değişince etkilenenler */
  callers: AffectedService[]
  /** Bu servisin çağırdıkları */
  callees: AffectedService[]
  loading?: boolean
  onPivot: (serviceId: string) => void
}

type SortKey = 'name' | 'affected' | 'depends'
type Kind = 'callers' | 'callees'

const PAGE = 20
const GROUP_PAGE = 8

function teamOf(s: Service) {
  return s.owner?.team?.trim() || 'Ekip yok'
}

function sortServices(list: Service[], sort: SortKey) {
  const copy = [...list]
  copy.sort((a, b) => {
    if (sort === 'affected') return b.affectedCount - a.affectedCount
    if (sort === 'depends') return b.dependsOnCount - a.dependsOnCount
    return a.name.localeCompare(b.name, 'tr')
  })
  return copy
}

function Column({
  title,
  hint,
  kind,
  items,
  empty,
  onPivot,
}: {
  title: string
  hint: string
  kind: Kind
  items: AffectedService[]
  empty: string
  onPivot: (serviceId: string) => void
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [groupByTeam, setGroupByTeam] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const [groupLimit, setGroupLimit] = useState<Record<string, number>>({})

  const services = useMemo(() => items.map((x) => x.service), [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = needle
      ? services.filter((s) => {
          const blob = `${s.name} ${s.owner?.name ?? ''} ${teamOf(s)}`.toLowerCase()
          return blob.includes(needle)
        })
      : services
    return sortServices(base, sort)
  }, [services, q, sort])

  const groups = useMemo(() => {
    if (!groupByTeam) return null
    const map = new Map<string, Service[]>()
    for (const s of filtered) {
      const t = teamOf(s)
      const arr = map.get(t)
      if (arr) arr.push(s)
      else map.set(t, [s])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'))
  }, [filtered, groupByTeam])

  const visibleFlat = filtered.slice(0, limit)

  return (
    <section className={`neighbor-col neighbor-${kind}`}>
      <header className="neighbor-col-head">
        <h3>
          {title}
          <span className="neighbor-count">{items.length}</span>
        </h3>
        <p>{hint}</p>
      </header>

      {items.length > 0 && (
        <div className="neighbor-tools">
          <input
            className="neighbor-filter"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="İsim veya ekip ara…"
            aria-label={`${title} içinde ara`}
          />
          <label className="neighbor-sort">
            <span className="sr-only">Sırala</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="name">A–Z</option>
              <option value="affected">En çok çağıran</option>
              <option value="depends">En çok bağımlılık</option>
            </select>
          </label>
          <label className="neighbor-group">
            <input
              type="checkbox"
              checked={groupByTeam}
              onChange={(e) => setGroupByTeam(e.target.checked)}
            />
            Ekibe göre
          </label>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-hint neighbor-empty">{empty}</p>
      ) : filtered.length === 0 ? (
        <p className="empty-hint neighbor-empty">Eşleşen servis yok.</p>
      ) : groups ? (
        <div className="neighbor-groups">
          {groups.map(([team, rows]) => {
            const cap = groupLimit[team] ?? GROUP_PAGE
            const shown = rows.slice(0, cap)
            return (
              <div key={team} className="neighbor-group-block">
                <h4 className="neighbor-group-title">
                  {team}
                  <span>{rows.length}</span>
                </h4>
                <ul className="affected-list">
                  {shown.map((s) => (
                    <li key={s.id}>
                      <NeighborRow kind={kind} service={s} onPivot={onPivot} />
                    </li>
                  ))}
                </ul>
                {rows.length > cap && (
                  <button
                    type="button"
                    className="neighbor-more"
                    onClick={() =>
                      setGroupLimit((m) => ({
                        ...m,
                        [team]: cap + GROUP_PAGE,
                      }))
                    }
                  >
                    +{rows.length - cap} daha
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <ul className="affected-list">
            {visibleFlat.map((s) => (
              <li key={s.id}>
                <NeighborRow kind={kind} service={s} onPivot={onPivot} />
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <button
              type="button"
              className="neighbor-more"
              onClick={() => setLimit((n) => n + PAGE)}
            >
              +{filtered.length - limit} servis daha
            </button>
          )}
        </>
      )}
    </section>
  )
}

function NeighborRow({
  kind,
  service,
  onPivot,
}: {
  kind: Kind
  service: Service
  onPivot: (serviceId: string) => void
}) {
  const reverse =
    kind === 'callers'
      ? `${service.dependsOnCount} bağımlılık`
      : `${service.affectedCount} çağıran`

  return (
    <button
      type="button"
      className="affected-row"
      onClick={() => onPivot(service.id)}
      title="Bu servisi merkeze al — İlişkiler ve Harita aynı geçmişi kullanır"
    >
      <span className="affected-row-body">
        <span className="svc-name">{service.name}</span>
        <span className="svc-meta">
          {service.owner?.team ?? '—'} ·{' '}
          {service.owner?.name ?? 'Owner atanmamış'}
        </span>
        <span className="rel-pill">{reverse}</span>
      </span>
      <span className="affected-row-go" aria-hidden>
        görüntüle
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path
            d="M6 3.5L11 8l-5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}

export function AffectedList({ callers, callees, loading, onPivot }: Props) {
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
        hint="Bu servis değişirse etkilenenler"
        kind="callers"
        items={callers}
        empty="Bu servisi çağıran yok."
        onPivot={onPivot}
      />
      <Column
        title="Bu Servisin Çağırdıkları"
        hint="Bu servisin bağımlılıkları"
        kind="callees"
        items={callees}
        empty="Çağırdığı servis yok."
        onPivot={onPivot}
      />
    </div>
  )
}
