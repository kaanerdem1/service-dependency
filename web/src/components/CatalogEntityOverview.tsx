import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { getCatalogArtifactDetail, getCatalogGroupDetail } from '../api/client'
import { EmptyState } from './EmptyState'
import { TreeKindIcon } from './TreeKindIcon'
import type { CatalogArtifactDetail, CatalogGroupDetail } from '../types'

type Props = {
  nodeId: string
  kind: 'group' | 'package'
  onSelectGroup: (nodeId: string, name: string) => void
  onSelectJar: (nodeId: string, name: string) => void
  onSelectService: (serviceId: string) => void
  onOpenJarInTree?: (jarId: string, groupId: string) => void
  onDismiss?: () => void
}

function uniqueTeams(projects: { responsibleItTeam: string | null; responsibleBusinessUnit: string | null }[]) {
  const it = new Set<string>()
  const bu = new Set<string>()
  for (const p of projects) {
    if (p.responsibleItTeam) it.add(p.responsibleItTeam)
    if (p.responsibleBusinessUnit) bu.add(p.responsibleBusinessUnit)
  }
  return { it: [...it], bu: [...bu] }
}

function useCountUp(target: number, durationMs = 820) {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (reduced || target <= 0) {
      setValue(target)
      return
    }
    setValue(0)
    const controls = animate(0, target, {
      duration: durationMs / 1000,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    })
    return () => controls.stop()
  }, [target, durationMs, reduced])

  return value
}

function Metric({ value, label }: { value: number; label: string }) {
  const n = useCountUp(value)
  return (
    <div className="ce-stat">
      <span className="ce-stat-n">{n.toLocaleString('tr-TR')}</span>
      <span className="ce-stat-l">{label}</span>
    </div>
  )
}

function GroupOverview({
  detail,
  onSelectJar,
  onDismiss,
}: {
  detail: CatalogGroupDetail
  onSelectJar: (nodeId: string, name: string) => void
  onDismiss?: () => void
}) {
  const teams = useMemo(() => uniqueTeams(detail.projects), [detail.projects])
  const isUnlocated = detail.id === 'unlocated'

  return (
    <article className="ce-page">
      <header className="ce-hero">
        <div className="ce-hero-top">
          <div className="ce-hero-identity">
            <div className="ce-hero-icon" aria-hidden>
              <TreeKindIcon kind="group" size={22} />
            </div>
            <div className="ce-hero-copy">
              <span className="ce-badge">Proje Grubu</span>
              <h2 className="ce-title">{detail.name}</h2>
              {detail.description ? (
                <p className="ce-subtitle">{detail.description}</p>
              ) : (
                <p className="ce-subtitle is-muted">Envanterde proje grubu açıklaması yok.</p>
              )}
            </div>
          </div>
          <div className="ce-hero-end">
            <div className="ce-stat-row" role="group" aria-label="Özet">
              <Metric value={detail.serviceCount} label="Servis" />
              {!isUnlocated ? <Metric value={detail.jarCount} label="Jar" /> : null}
            </div>
            {onDismiss ? (
              <button type="button" className="ce-dismiss" onClick={onDismiss}>
                Seçimi bırak
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className={`ce-layout${isUnlocated ? ' is-single' : ''}`}>
        <aside className="ce-side">
          {!isUnlocated && (teams.it.length > 0 || teams.bu.length > 0) ? (
            <section className="ce-panel">
              <header className="ce-panel-head">
                <h3 className="ce-panel-title">Sahiplik</h3>
              </header>
              <div className="ce-panel-body ce-ownership-stack">
                {teams.it.length > 0 ? (
                  <div className="ce-field">
                    <p className="ce-field-label">IT ekipleri</p>
                    <div className="ce-chips">
                      {teams.it.map((t) => (
                        <span key={t} className="ce-chip">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {teams.bu.length > 0 ? (
                  <div className="ce-field">
                    <p className="ce-field-label">İş birimleri</p>
                    <div className="ce-chips">
                      {teams.bu.map((t) => (
                        <span key={t} className="ce-chip">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {isUnlocated ? (
            <section className="ce-panel">
              <div className="ce-panel-body">
                <p className="ce-note">
                  Entry metod / jar bağlantısı olmayan servisler. Ağaçtan bir satır seçin veya ⌘K ile
                  arayın.
                </p>
              </div>
            </section>
          ) : null}
        </aside>

        {!isUnlocated && detail.jars.length > 0 ? (
          <section className="ce-panel ce-panel-main">
            <header className="ce-panel-head">
              <h3 className="ce-panel-title">Jarlar</h3>
              <span className="ce-panel-count">{detail.jars.length}</span>
            </header>
            <div className="ce-panel-body">
              <ul className="ce-tile-grid">
                {detail.jars.map((jar) => (
                  <li key={jar.id}>
                    <button
                      type="button"
                      className="ce-tile"
                      onClick={() => onSelectJar(jar.id, jar.name)}
                    >
                      <span className="ce-tile-icon" aria-hidden>
                        <TreeKindIcon kind="package" size={16} />
                      </span>
                      <span className="ce-tile-body">
                        <span className="ce-tile-name">{jar.name}</span>
                        <span className="ce-tile-meta">{jar.serviceCount} servis</span>
                      </span>
                      <span className="ce-tile-chev" aria-hidden>
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </article>
  )
}

function ArtifactOverview({
  detail,
  onSelectService,
  onOpenJarInTree,
  onDismiss,
}: {
  detail: CatalogArtifactDetail
  onSelectService: (serviceId: string) => void
  onOpenJarInTree?: (jarId: string, groupId: string) => void
  onDismiss?: () => void
}) {
  return (
    <article className="ce-page">
      <header className="ce-hero">
        <div className="ce-hero-top">
          <div className="ce-hero-identity">
            <div className="ce-hero-icon is-package" aria-hidden>
              <TreeKindIcon kind="package" size={22} />
            </div>
            <div className="ce-hero-copy">
              <span className="ce-badge is-package">Jar</span>
              <h2 className="ce-title">{detail.name}</h2>
              {detail.project.description ? (
                <p className="ce-subtitle">{detail.project.description}</p>
              ) : detail.group.description ? (
                <p className="ce-subtitle">{detail.group.description}</p>
              ) : null}
            </div>
          </div>
          <div className="ce-hero-end">
            <div className="ce-stat-row" role="group" aria-label="Özet">
              <Metric value={detail.serviceCount} label="Servis" />
              <Metric value={detail.classCount} label="Sınıf" />
            </div>
            {onOpenJarInTree ? (
              <button
                type="button"
                className="ce-open-tree btn ghost compact"
                onClick={() => onOpenJarInTree(detail.id, detail.group.id)}
              >
                Ağaçta aç
              </button>
            ) : null}
            {onDismiss ? (
              <button type="button" className="ce-dismiss" onClick={onDismiss}>
                Seçimi bırak
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="ce-layout">
        <aside className="ce-side">
          <section className="ce-panel">
            <header className="ce-panel-head">
              <h3 className="ce-panel-title">Sahiplik</h3>
            </header>
            <div className="ce-panel-body">
              <dl className="ce-kv">
                {detail.project.responsibleItTeam ? (
                  <div className="ce-kv-row">
                    <dt>IT</dt>
                    <dd>{detail.project.responsibleItTeam}</dd>
                  </div>
                ) : null}
                {detail.project.responsibleBusinessUnit ? (
                  <div className="ce-kv-row">
                    <dt>İş birimi</dt>
                    <dd>{detail.project.responsibleBusinessUnit}</dd>
                  </div>
                ) : null}
                <div className="ce-kv-row">
                  <dt>Proje</dt>
                  <dd>{detail.project.name}</dd>
                </div>
                <div className="ce-kv-row">
                  <dt>Proje Grubu</dt>
                  <dd>{detail.group.name}</dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>

        {detail.sampleServices.length > 0 ? (
          <section className="ce-panel ce-panel-main">
            <header className="ce-panel-head">
              <h3 className="ce-panel-title">Servisler</h3>
              <span className="ce-panel-count">
                {detail.serviceCount > detail.sampleServices.length
                  ? `${detail.sampleServices.length} / ${detail.serviceCount}`
                  : detail.sampleServices.length}
              </span>
            </header>
            <div className="ce-panel-body ce-panel-scroll">
              <ul className="ce-svc-list">
                {detail.sampleServices.map((svc) => (
                  <li key={svc.id}>
                    <button
                      type="button"
                      className="ce-svc-row"
                      onClick={() => onSelectService(svc.id)}
                    >
                      <span className="ce-svc-icon" aria-hidden>
                        <TreeKindIcon kind="service" size={14} />
                      </span>
                      <span className="ce-svc-name">{svc.name}</span>
                      <span className="ce-svc-id">{svc.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </article>
  )
}

export function CatalogEntityOverview({
  nodeId,
  kind,
  onSelectJar,
  onSelectService,
  onOpenJarInTree,
  onDismiss,
}: Props) {
  const [group, setGroup] = useState<CatalogGroupDetail | null>(null)
  const [artifact, setArtifact] = useState<CatalogArtifactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(undefined)
    setGroup(null)
    setArtifact(null)

    const load =
      kind === 'group' ? getCatalogGroupDetail(nodeId) : getCatalogArtifactDetail(nodeId)

    void load
      .then((data) => {
        if (cancelled) return
        if (kind === 'group') setGroup(data as CatalogGroupDetail)
        else setArtifact(data as CatalogArtifactDetail)
      })
      .catch(() => {
        if (cancelled) return
        setError('Katalog bilgisi yüklenemedi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [nodeId, kind])

  if (loading) {
    return (
      <div className="ce-shell">
        <EmptyState variant="catalog" what="Katalog özeti yükleniyor." action="Birkaç saniye bekleyin." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="ce-shell">
        <EmptyState variant="catalog" what={error} action="Ağaçtan başka bir proje grubu veya jar seçin." />
      </div>
    )
  }

  return (
    <div className="ce-shell">
      {group ? (
        <GroupOverview detail={group} onSelectJar={onSelectJar} onDismiss={onDismiss} />
      ) : null}
      {artifact ? (
        <ArtifactOverview
          detail={artifact}
          onSelectService={onSelectService}
          onOpenJarInTree={onOpenJarInTree}
          onDismiss={onDismiss}
        />
      ) : null}
    </div>
  )
}
