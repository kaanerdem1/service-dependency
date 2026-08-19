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
  projectLabels: Map<string, string>
  /** Sol ağaçtaki proje sırası (HAZINE → MEVDUAT → KREDI) */
  projectOrder: string[]
}

type SortKey = 'name' | 'affected' | 'depends'
type Kind = 'callers' | 'callees'

const PAGE = 20
const GROUP_PAGE = 8

function projectOf(s: Service, projectLabels: Map<string, string>) {
  return projectLabels.get(s.projectId) ?? s.projectId
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
  projectLabels,
  projectOrder,
}: {
  title: string
  hint: string
  kind: Kind
  items: AffectedService[]
  empty: string
  onPivot: (serviceId: string) => void
  projectLabels: Map<string, string>
  projectOrder: string[]
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [groupByProject, setGroupByProject] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const [groupLimit, setGroupLimit] = useState<Record<string, number>>({})

  const projectRank = useMemo(
    () => new Map(projectOrder.map((id, i) => [id, i])),
    [projectOrder],
  )

  const services = useMemo(() => items.map((x) => x.service), [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = needle
      ? services.filter((s) => {
          const blob = `${s.name} ${projectOf(s, projectLabels)} ${s.owner?.name ?? ''} ${s.owner?.team ?? ''}`.toLowerCase()
          return blob.includes(needle)
        })
      : services
    return sortServices(base, sort)
  }, [services, q, sort, projectLabels])

  const groups = useMemo(() => {
    if (!groupByProject) return null
    const map = new Map<string, Service[]>()
    for (const s of filtered) {
      const key = s.projectId
      const arr = map.get(key)
      if (arr) arr.push(s)
      else map.set(key, [s])
    }
    return [...map.entries()]
      .sort((a, b) => {
        const ai = projectRank.get(a[0]) ?? 999
        const bi = projectRank.get(b[0]) ?? 999
        if (ai !== bi) return ai - bi
        return projectOf(a[1][0], projectLabels).localeCompare(
          projectOf(b[1][0], projectLabels),
          'tr',
        )
      })
      .map(
        ([projectId, rows]) =>
          [projectId, projectOf(rows[0], projectLabels), rows] as const,
      )
  }, [filtered, groupByProject, projectLabels, projectRank])

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
            placeholder="İsim veya proje ara…"
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
              checked={groupByProject}
              onChange={(e) => setGroupByProject(e.target.checked)}
            />
            Projeye göre
          </label>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-hint neighbor-empty">{empty}</p>
      ) : filtered.length === 0 ? (
        <p className="empty-hint neighbor-empty">Eşleşen servis yok.</p>
      ) : groups ? (
        <div className="neighbor-groups">
          {groups.map(([projectId, label, rows]) => {
            const cap = groupLimit[projectId] ?? GROUP_PAGE
            const shown = rows.slice(0, cap)
            return (
              <div key={projectId} className="neighbor-group-block">
                <h4 className="neighbor-group-title">
                  {label}
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
                        [projectId]: cap + GROUP_PAGE,
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
        <span className="rel-pill" title={reverse}>
          {reverse}
        </span>
      </span>
      <span className="affected-row-action">Servisi seç</span>
    </button>
  )
}

export function AffectedList({
  callers,
  callees,
  loading,
  onPivot,
  projectLabels,
  projectOrder,
}: Props) {
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
        projectLabels={projectLabels}
        projectOrder={projectOrder}
      />
      <Column
        title="Bu Servisin Çağırdıkları"
        hint="Bu servisin bağımlılıkları"
        kind="callees"
        items={callees}
        empty="Çağırdığı servis yok."
        onPivot={onPivot}
        projectLabels={projectLabels}
        projectOrder={projectOrder}
      />
    </div>
  )
}
