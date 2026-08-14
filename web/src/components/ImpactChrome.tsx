import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Panel, useReactFlow } from 'reactflow'
import type { MapLayout } from '../impact/mapLayout'
import {
  discoveryPathTo,
  summarizeBlastRadius,
  type BlastRadiusStats,
} from '../impact/projectFilter'
import type { ImpactNode } from '../types'

/** Ortak lejant + filtre ipucu + path breadcrumb + blast özeti */

/** Katman değişince fitView; pivot / geri-ileri de fitView */
export function MapViewportSync({
  centerId,
  visibleMaxHop,
  layoutKey,
  layout,
}: {
  centerId: string
  visibleMaxHop: number
  layoutKey: string | number | boolean
  layout: MapLayout
}) {
  const { fitView } = useReactFlow()
  const prevCenter = useRef<string | null>(null)

  useEffect(() => {
    const centerChanged =
      prevCenter.current !== null && prevCenter.current !== centerId
    prevCenter.current = centerId

    const id = window.setTimeout(() => {
      fitView({
        padding: layout.fitPadding,
        duration: centerChanged ? 280 : 320,
        minZoom: layout.minZoom,
        maxZoom: layout.maxZoom,
      })
    }, 60)
    return () => window.clearTimeout(id)
  }, [centerId, visibleMaxHop, layoutKey, layout, fitView])

  return null
}

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
                  'name-tip',
                  'is-short',
                  isCenter && 'center',
                  isEnd && 'end',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-tip={name}
                onClick={() => onSelect(id)}
              >
                {name}
              </button>
            </li>
          )
        })}
      </ol>
      {path.length > 1 && (
        <span className="path-bc-meta">{path.length - 1}. katman</span>
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

type LayerControlsProps = {
  visibleMaxHop: number
  maxHopAvailable: number
  onCollapseLayer: () => void
  onExpandLayer: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onTidyUp?: () => void
  fitPadding?: number
  cascadeCount?: number
  truncated?: boolean
}

function DockBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <span className={`map-dock-wrap${disabled ? ' is-off' : ''}`}>
      <button
        type="button"
        className="map-dock-btn"
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
      <span className="map-dock-tip" role="tooltip">
        {label}
      </span>
    </span>
  )
}

function IconZoomOut() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2L14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.2 7h3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconZoomIn() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2L14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 5.2v3.6M5.2 7h3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconFit() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        d="M5 3H3v2M11 3h2v2M3 11v2h2M13 11v2h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="5.5" y="5.5" width="5" height="5" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** Yalnız doğrudan komşular (1. katman) */
function IconNeighbors() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="4.3" cy="8" r="2.05" fill="currentColor" />
      <circle cx="12.3" cy="3.7" r="1.3" fill="currentColor" />
      <circle cx="12.3" cy="8" r="1.3" fill="currentColor" />
      <circle cx="12.3" cy="12.3" r="1.3" fill="currentColor" />
      <path
        d="M6.3 8h4.4M6.2 7.15L11 4.3M6.2 8.85L11 11.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Tüm etki zinciri */
function IconFullChain() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="2.8" cy="8" r="1.65" fill="currentColor" />
      <circle cx="8" cy="4.6" r="1.25" fill="currentColor" />
      <circle cx="8" cy="11.4" r="1.25" fill="currentColor" />
      <circle cx="13.3" cy="3.2" r="1.1" fill="currentColor" />
      <circle cx="13.3" cy="6.2" r="1.1" fill="currentColor" />
      <circle cx="13.3" cy="9.8" r="1.1" fill="currentColor" />
      <circle cx="13.3" cy="12.8" r="1.1" fill="currentColor" />
      <path
        d="M4.4 8H6.6M4.5 7.1L6.8 5.2M4.5 8.9L6.8 10.8M9.3 4.6h2.6M9.3 11.4h2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Bir katman geri — sağdaki halka solar */
function IconLayerBack() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        d="M6.2 4.4L2.8 8l3.4 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.4" cy="8" r="1.7" fill="currentColor" />
      <circle cx="13.4" cy="8" r="1.35" fill="currentColor" opacity="0.32" />
      <path
        d="M11.1 8h.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.32"
      />
    </svg>
  )
}

/** Bir katman ileri — sağa yeni halka */
function IconLayerForward() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="2.7" cy="8" r="1.7" fill="currentColor" />
      <circle cx="7.2" cy="8" r="1.55" fill="currentColor" />
      <path
        d="M4.4 8h1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M10.2 4.4L13.6 8l-3.4 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Liam Tidy Up — ızgaraya hizala */
function IconTidy() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect x="2.2" y="2.4" width="5" height="4.2" rx="1" fill="currentColor" />
      <rect x="8.8" y="2.4" width="5" height="4.2" rx="1" fill="currentColor" />
      <rect x="2.2" y="9.4" width="5" height="4.2" rx="1" fill="currentColor" />
      <rect x="8.8" y="9.4" width="5" height="4.2" rx="1" fill="currentColor" />
    </svg>
  )
}

/**
 * Liam tarzı orta-alt şerit: zoom + katman + lejant.
 * React Flow çocuğu olmalı (useReactFlow).
 */
export function MapCanvasBar({
  visibleMaxHop,
  maxHopAvailable,
  onCollapseLayer,
  onExpandLayer,
  onExpandAll,
  onCollapseAll,
  onTidyUp,
  fitPadding = 0.18,
  cascadeCount,
  truncated,
}: LayerControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const canExpand = visibleMaxHop < maxHopAvailable
  const canCollapse = visibleMaxHop > 1
  const nextHop = canExpand ? visibleMaxHop + 1 : null

  return (
    <Panel position="bottom-center" className="map-dock-panel">
      <div className="map-dock" role="toolbar" aria-label="Harita araçları">
        <DockBtn label="Uzaklaştır" onClick={() => zoomOut({ duration: 180 })}>
          <IconZoomOut />
        </DockBtn>
        <DockBtn label="Yakınlaştır" onClick={() => zoomIn({ duration: 180 })}>
          <IconZoomIn />
        </DockBtn>
        <DockBtn
          label="Ekrana sığdır"
          onClick={() => fitView({ padding: fitPadding, duration: 220 })}
        >
          <IconFit />
        </DockBtn>
        {onTidyUp && (
          <DockBtn
            label="Hizala — düğümleri eski düzene al"
            onClick={() => {
              onTidyUp()
              window.setTimeout(() => {
                fitView({ padding: fitPadding, duration: 280 })
              }, 40)
            }}
          >
            <IconTidy />
          </DockBtn>
        )}

        <span className="map-dock-sep" aria-hidden />

        <DockBtn
          label="Sadece komşular — 1. katman"
          disabled={!canCollapse}
          onClick={onCollapseAll}
        >
          <IconNeighbors />
        </DockBtn>
        <DockBtn
          label={canCollapse ? 'Bir katman geri' : 'Zaten sadece komşular'}
          disabled={!canCollapse}
          onClick={onCollapseLayer}
        >
          <IconLayerBack />
        </DockBtn>
        <span className="map-dock-wrap">
          <span
            className="map-dock-hop"
            aria-label={`Görünen katman ${visibleMaxHop} / ${maxHopAvailable}`}
          >
            {visibleMaxHop}/{maxHopAvailable}
          </span>
          <span className="map-dock-tip" role="tooltip">
            Görünen katman {visibleMaxHop} / {maxHopAvailable}
          </span>
        </span>
        <DockBtn
          label={
            nextHop ? `Bir katman ileri — ${nextHop}. katman` : 'Tüm katmanlar açık'
          }
          disabled={!canExpand}
          onClick={onExpandLayer}
        >
          <IconLayerForward />
        </DockBtn>
        <DockBtn
          label="Tüm katmanları aç"
          disabled={!canExpand}
          onClick={onExpandAll}
        >
          <IconFullChain />
        </DockBtn>

        <span className="map-dock-sep" aria-hidden />

        <span className="map-dock-wrap map-dock-legend">
          <button
            type="button"
            className="map-dock-btn map-dock-info"
            aria-label="Ok anlamları"
            aria-describedby="map-legend-pop"
          >
            i
          </button>
          <div id="map-legend-pop" className="map-legend-pop" role="tooltip">
            <p className="map-legend-pop-title">Oklar</p>
            <div className="path-legend-block">
              <span className="path-legend-item">
                <span className="legend-swatch tree" aria-hidden />
                <span>
                  <strong>Yeşil</strong> — ana etki yolu (değişen → etkilenen)
                </span>
              </span>
              <span className="path-legend-item">
                <span className="legend-swatch cascade" aria-hidden />
                <span>
                  <strong>Turuncu</strong> — yan bağ
                  {typeof cascadeCount === 'number' && cascadeCount > 0
                    ? ` · ${cascadeCount}`
                    : ''}
                </span>
              </span>
              <span className="path-legend-note">
                Ok ucu etkilenen servise bakar. Hover’da yalnız o düğümün bağları.
                {truncated ? ' Görünüm kısaltıldı.' : ''}
              </span>
            </div>
          </div>
        </span>
      </div>
    </Panel>
  )
}

export function ImpactLegend({ cascadeCount, truncated }: LegendProps) {
  return (
    <div className="map-legend-fab">
      <button
        type="button"
        className="map-legend-info"
        aria-label="Ok anlamları"
        aria-describedby="map-legend-pop"
      >
        i
      </button>
      <div id="map-legend-pop" className="map-legend-pop" role="tooltip">
        <p className="map-legend-pop-title">Oklar</p>
        <div className="path-legend-block">
          <span className="path-legend-item">
            <span className="legend-swatch tree" aria-hidden />
            <span>
              <strong>Yeşil</strong> — ana etki yolu (değişen → etkilenen)
            </span>
          </span>
          <span className="path-legend-item">
            <span className="legend-swatch cascade" aria-hidden />
            <span>
              <strong>Turuncu</strong> — yan bağ
              {typeof cascadeCount === 'number' && cascadeCount > 0
                ? ` · ${cascadeCount}`
                : ''}
            </span>
          </span>
          <span className="path-legend-note">
            Ok ucu etkilenen servise bakar. Hover’da yalnız o düğümün bağları.
            {truncated ? ' Görünüm kısaltıldı.' : ''}
          </span>
        </div>
      </div>
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
