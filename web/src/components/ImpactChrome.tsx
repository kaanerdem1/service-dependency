import { useMemo } from 'react'
import {
  discoveryPathTo,
  summarizeBlastRadius,
  type BlastRadiusStats,
} from '../impact/projectFilter'
import type { ImpactNode } from '../types'

/** Ortak lejant + filtre ipucu + path breadcrumb + blast özeti */

type LegendProps = {
  cascadeCount?: number
  truncated?: boolean
}

type BreadcrumbProps = {
  centerId: string
  focusId: string | null
  parents: Map<string, string>
  nameById: Map<string, string>
  onSelect: (serviceId: string) => void
}

/** Ana etki yolu (via): örn. Payment → Refund → Notification */
export function PathBreadcrumb({
  centerId,
  focusId,
  parents,
  nameById,
  onSelect,
}: BreadcrumbProps) {
  const path = useMemo(() => {
    if (!focusId || focusId.startsWith('collapsed-')) return null
    return discoveryPathTo(centerId, focusId, parents)
  }, [centerId, focusId, parents])

  if (!path) {
    return (
      <div className="path-breadcrumb is-idle" aria-live="polite">
        <span className="path-bc-label">Yol</span>
        <span className="path-bc-hint">
          Bir servisin üzerine gel — ana etki yolu (via zinciri) burada
        </span>
      </div>
    )
  }

  const centerName = nameById.get(centerId) ?? centerId
  return (
    <nav className="path-breadcrumb" aria-label="Ana etki yolu">
      <span className="path-bc-label">Yol</span>
      <ol className="path-bc-list">
        {path.map((id, i) => {
          const name = nameById.get(id) ?? id
          const isEnd = i === path.length - 1
          const isCenter = id === centerId
          return (
            <li key={id} className="path-bc-item">
              {i > 0 && (
                <span className="path-bc-sep" aria-hidden>
                  →
                </span>
              )}
              <button
                type="button"
                className={[
                  'path-bc-crumb',
                  isCenter && 'center',
                  isEnd && 'end',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={
                  isCenter
                    ? 'Merkez'
                    : `${centerName} → … → ${name} (via zinciri)`
                }
                onClick={() => onSelect(id)}
              >
                {name}
              </button>
            </li>
          )
        })}
      </ol>
      {path.length > 1 && (
        <span className="path-bc-meta">{path.length - 1}. hop</span>
      )}
    </nav>
  )
}

type BlastProps = {
  centerId: string
  nodes: ImpactNode[]
  parents: Map<string, string>
  projectLabels: Map<string, string>
  /** Filtre açıksa yalnız eşleşenler */
  matchIds?: Set<string> | null
  bridgeCount?: number
  filterLabel?: string
  truncated?: boolean
}

/** Etki yarıçapı: N servis · M ekip · P proje */
export function BlastRadiusSummary({
  centerId,
  nodes,
  parents,
  projectLabels,
  matchIds = null,
  bridgeCount = 0,
  filterLabel,
  truncated,
}: BlastProps) {
  const stats: BlastRadiusStats = useMemo(
    () =>
      summarizeBlastRadius(
        centerId,
        nodes,
        parents,
        (id) => projectLabels.get(id) ?? id,
        matchIds,
      ),
    [centerId, nodes, parents, projectLabels, matchIds],
  )

  const filtered = Boolean(matchIds && filterLabel)
  const teamHint =
    stats.teamNames.length > 0 && stats.teamNames.length <= 4
      ? stats.teamNames.join(', ')
      : ''

  const titleParts = [
    `${stats.serviceCount} servis`,
    stats.teamNames.length
      ? `ekipler (owner.team): ${stats.teamNames.join(', ')}`
      : `${stats.teamCount} ekip`,
    stats.projectLabels.length
      ? `projeler: ${stats.projectLabels.join(', ')}`
      : `${stats.projectCount} proje`,
  ].filter(Boolean)

  return (
    <div
      className="blast-radius-bar"
      title={titleParts.join(' · ')}
      aria-label="Etki yarıçapı özeti"
    >
      <span className="blast-label">Etki</span>
      <span className="blast-stats">
        <strong>{stats.serviceCount}</strong>
        {filtered ? ' eşleşen' : ' servis'}
        <span className="blast-dot" aria-hidden>
          ·
        </span>
        <strong>{stats.teamCount}</strong> ekip
        {teamHint ? (
          <span className="blast-team-names"> ({teamHint})</span>
        ) : null}
        <span className="blast-dot" aria-hidden>
          ·
        </span>
        <strong>{stats.projectCount}</strong> proje
        {!filtered && (
          <>
            <span className="blast-dot" aria-hidden>
              ·
            </span>
            doğrudan <strong>{stats.hop1Count}</strong>
          </>
        )}
        {stats.maxHop > 0 && (
          <>
            <span className="blast-dot" aria-hidden>
              ·
            </span>
            derinlik <strong>{stats.maxHop}</strong>
          </>
        )}
        {filtered && bridgeCount > 0 && (
          <>
            <span className="blast-dot" aria-hidden>
              ·
            </span>
            {bridgeCount} ara yol
          </>
        )}
        {truncated && (
          <>
            <span className="blast-dot" aria-hidden>
              ·
            </span>
            kısaltıldı
          </>
        )}
      </span>
    </div>
  )
}

export function ImpactLegend({ cascadeCount, truncated }: LegendProps) {
  return (
    <div className="path-legend-block" role="note">
      <span className="path-legend-item">
        <span className="legend-swatch tree" aria-hidden />
        <span>
          <strong>Yeşil ok</strong> — ana etki yolu: değişen → etkilenen
          (çağıran tüketici)
        </span>
      </span>
      <span className="path-legend-item">
        <span className="legend-swatch cascade" aria-hidden />
        <span>
          <strong>Turuncu ok</strong> — yan bağ (tek yön; karşılıklı çağrı
          değil)
          {typeof cascadeCount === 'number' && cascadeCount > 0
            ? ` · ${cascadeCount}`
            : ''}
        </span>
      </span>
      <span className="path-legend-note">
        Ok ucu etkilenen servise bakar · üzerine gelince yalnız o düğümün
        bağları
        {truncated ? ' · görünüm kısaltıldı' : ''}
      </span>
    </div>
  )
}

type FilterHintProps = {
  filterLabel: string
  matchCount: number
  deepestHop: number
  bridgeCount: number
  hop1EmptyButDeeper: boolean
}

export function ProjectFilterHint({
  filterLabel,
  matchCount,
  deepestHop,
  bridgeCount,
  hop1EmptyButDeeper,
}: FilterHintProps) {
  if (matchCount === 0) {
    return (
      <p className="map-filter-hint empty">
        Bu etki zincirinde <strong>{filterLabel}</strong> altındaki etkilenen
        servis yok — başka proje seçin veya filtreyi kaldırın.
      </p>
    )
  }
  if (hop1EmptyButDeeper) {
    return (
      <p className="map-filter-hint">
        <strong>{filterLabel}</strong> altındaki servisler doğrudan (1.
        katman) etkilenmiyor. Etki <strong>{deepestHop}. katmanda</strong>{' '}
        görünüyor ({matchCount} servis). Kesik gri çerçeve = başka projedeki
        ara yol; kalın yeşil çerçeve = {filterLabel} eşleşen servis.
      </p>
    )
  }
  return (
    <p className="map-filter-hint">
      Yalnız <strong>{filterLabel}</strong> altındaki etkilenen servisler (
      {matchCount}
      {bridgeCount > 0 ? ` · ${bridgeCount} ara yol` : ''}).
    </p>
  )
}
