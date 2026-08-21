import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReactFlow, useStore } from 'reactflow'
import type { MapLayout, MapLayoutMode } from '../impact/mapLayout'
import { fitViewPaddingForChrome, occludedRadialLabelIds, RADIAL_HIT } from '../impact/mapLayout'
import {
  animateViewport,
  easeInOutCubic,
  waitMs,
} from '../impact/pivotTransition'
import {
  discoveryPathTo,
  summarizeBlastRadius,
  type BlastRadiusStats,
} from '../impact/projectFilter'
import type { ImpactNode, Service } from '../types'
import { AnimatedNumber, AnimatedNumberPair } from '../motion/AnimatedNumber'
import { layoutSpring } from '../motion/config'
import { MotionListItem } from '../motion/MotionList'
import { MotionTooltip } from '../motion/MotionTooltip'

export type VisitStep = { id: string; name: string }

/** Ortak lejant + filtre ipucu + path breadcrumb + blast özeti */

/** Merkez / katman değişince fitView (sol pad → etki özeti ile çakışmaz); geri/ileri kaydırmalı */
export function MapViewportSync({
  centerId,
  visibleMaxHop,
  layoutKey,
  layout,
  drawerOpen = false,
  navDirection = null,
  onNavDirectionConsumed,
}: {
  centerId: string
  visibleMaxHop: number
  layoutKey: string | number | boolean
  layout: MapLayout
  drawerOpen?: boolean
  navDirection?: 'back' | 'forward' | null
  onNavDirectionConsumed?: () => void
}) {
  const rf = useReactFlow()
  const prevCenter = useRef<string | null>(null)
  const prevHop = useRef(visibleMaxHop)
  const drawerOpenRef = useRef(drawerOpen)
  drawerOpenRef.current = drawerOpen
  const navDirRef = useRef(navDirection)
  navDirRef.current = navDirection
  const consumedRef = useRef(onNavDirectionConsumed)
  consumedRef.current = onNavDirectionConsumed

  useEffect(() => {
    const centerChanged =
      prevCenter.current !== null && prevCenter.current !== centerId
    const hopChanged = prevHop.current !== visibleMaxHop
    prevCenter.current = centerId
    prevHop.current = visibleMaxHop
    const dir = navDirRef.current

    const id = window.setTimeout(() => {
      void (async () => {
        const padding = fitViewPaddingForChrome(layout, {
          drawerOpen: drawerOpenRef.current,
        })
        const fitOpts = {
          padding,
          minZoom: layout.minZoom,
          maxZoom: layout.maxZoom,
        }

        if (centerChanged && (dir === 'back' || dir === 'forward')) {
          await rf.fitView({ ...fitOpts, duration: 0 })
          const target = rf.getViewport()
          const slide = dir === 'back' ? -110 : 110
          rf.setViewport(
            { x: target.x + slide, y: target.y, zoom: target.zoom },
            { duration: 0 },
          )
          await waitMs(16)
          await animateViewport(rf, target, 520, easeInOutCubic)
          consumedRef.current?.()
          return
        }

        // Katman / layout / boyut: fitView (drawer aç-kapa zoom'u değiştirmez)
        await rf.fitView({
          ...fitOpts,
          duration: centerChanged ? 320 : hopChanged ? 360 : 280,
        })
      })()
    }, 50)
    return () => window.clearTimeout(id)
  }, [centerId, visibleMaxHop, layoutKey, layout, rf])

  const paneW = useStore((s) => s.width)
  const paneH = useStore((s) => s.height)
  const prevPane = useRef(`${Math.round(paneW)}x${Math.round(paneH)}`)

  useEffect(() => {
    const next = `${Math.round(paneW)}x${Math.round(paneH)}`
    const prev = prevPane.current
    if (prev === next) return
    const [pw, ph] = prev.split('x').map(Number)
    prevPane.current = next
    if (!pw || (Math.abs(pw - paneW) < 20 && Math.abs(ph - paneH) < 20)) return
    const padding = fitViewPaddingForChrome(layout, {
      drawerOpen: drawerOpenRef.current,
    })
    const id = window.setTimeout(() => {
      void rf.fitView({
        padding,
        minZoom: layout.minZoom,
        maxZoom: layout.maxZoom,
        duration: 240,
      })
    }, 100)
    return () => window.clearTimeout(id)
  }, [paneW, paneH, layout, rf])

  return null
}

/** Halka: çakışan isimleri gizle; hover / odakta geri getir. */
export function RadialLabelZoomSync() {
  const rf = useReactFlow()
  const probe = useRef<HTMLSpanElement>(null)
  const sig = useStore((s) => {
    const internals = (
      s as unknown as {
        nodeInternals?: Map<
          string,
          { id: string; position: { x: number; y: number }; data?: Record<string, unknown> }
        >
      }
    ).nodeInternals
    if (!internals) return `z${s.transform[2]}`
    let out = `${internals.size}:${s.transform[2].toFixed(2)}`
    internals.forEach((n) => {
      const d = n.data
      if (!d || d.radialDot !== true) return
      out += `|${n.id}:${n.position.x | 0}:${n.position.y | 0}`
    })
    return out
  })
  useLayoutEffect(() => {
    const nodes = rf.getNodes()
    const items = nodes.flatMap((n) => {
      const d = n.data as {
        radialDot?: boolean
        hop?: number
        kind?: string
        radialAngle?: number
        radialCx?: number
        radialCy?: number
        fullLabel?: string
        label?: string
      }
      if (!d?.radialDot) return []
      const mid = RADIAL_HIT / 2
      const cx = n.position.x + mid
      const cy = n.position.y + mid
      const angle =
        typeof d.radialCx === 'number' && typeof d.radialCy === 'number'
          ? Math.atan2(cy - d.radialCy, cx - d.radialCx)
          : (d.radialAngle ?? 0)
      return [
        {
          id: n.id,
          hop: d.hop ?? 1,
          kind: d.kind ?? 'service',
          cx,
          cy,
          angle,
          name: String(d.fullLabel || d.label || ''),
        },
      ]
    })
    const hidden = occludedRadialLabelIds(items)
    const root = probe.current?.closest('.dd-map')
    root?.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.toggle('radial-label-occluded', hidden.has(id))
    })
  }, [sig, rf])
  return <span ref={probe} className="dd-radial-zoom-probe" hidden aria-hidden />
}

type LegendProps = {
  cascadeCount?: number
  truncated?: boolean
}

function cascadeLegendSuffix(cascadeCount?: number) {
  return typeof cascadeCount === 'number' && cascadeCount > 0 ? ` · ${cascadeCount} yol` : ''
}

function MapLegendContent({ cascadeCount }: { cascadeCount?: number }) {
  const cascadeSuffix = cascadeLegendSuffix(cascadeCount)

  return (
    <>
      <p className="map-legend-pop-title">Oklar</p>
      <p className="map-legend-pop-lede">
        <strong>Düz</strong> = doğrudan bağ · <strong>Kesikli</strong> = dolaylı veya alternatif
      </p>
      <div className="path-legend-block">
        <span className="path-legend-item">
          <span className="legend-swatch tree" aria-hidden />
          <span>
            <strong>Yeşil düz ok</strong> — ana yol, doğrudan (1. katman)
          </span>
        </span>
        <span className="path-legend-item">
          <span className="legend-swatch indirect" aria-hidden />
          <span>
            <strong>Gri kesikli ok</strong> — ana yol, dolaylı (2+ katman)
          </span>
        </span>
        <span className="path-legend-item">
          <span className="legend-swatch cascade" aria-hidden />
          <span>
            <strong>Turuncu kesikli ok</strong> — yan bağ (alternatif rota)
            {cascadeSuffix}
          </span>
        </span>
      </div>
    </>
  )
}

type BreadcrumbProps = {
  centerId: string
  focusId: string | null
  parents: Map<string, string>
  nameById: Map<string, string>
  onSelect: (serviceId: string) => void
  /** Harita sol panelinde dikey liste */
  layout?: 'bar' | 'tree'
}

/** Ana etki yolu (via): örn. Payment → Refund → Notification */
export function PathBreadcrumb({
  centerId,
  focusId,
  parents,
  nameById,
  onSelect,
  layout = 'bar',
}: BreadcrumbProps) {
  const path = useMemo(() => {
    if (!focusId || focusId.startsWith('collapsed-')) return null
    return discoveryPathTo(centerId, focusId, parents)
  }, [centerId, focusId, parents])

  if (!path) {
    if (layout === 'tree') {
      return (
        <div className="map-info-empty" aria-live="polite">
          <span className="map-info-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle cx="6" cy="12" r="2.2" fill="currentColor" />
              <circle cx="18" cy="12" r="2.2" fill="currentColor" />
              <path
                d="M8.4 12h7.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="map-info-empty-title">Etki yolunu görün</p>
          <p className="map-info-empty-cta">
            Haritada bir servisin üzerine gelin. Merkezden o servise giden yol
            burada listelenir.
          </p>
        </div>
      )
    }
    return (
      <div className="path-breadcrumb is-idle" aria-live="polite">
        <span className="path-bc-label">Yol</span>
        <span className="path-bc-hint">
          Haritada bir servisin üzerine gelin — merkezden o servise giden yol
          burada görünür.
        </span>
      </div>
    )
  }

  if (layout === 'tree') {
    return (
      <nav className="path-bc-tree" aria-label="Ana etki yolu">
        <ol className="path-bc-tree-list">
          {path.map((id, i) => {
            const name = nameById.get(id) ?? id
            const isEnd = i === path.length - 1
            const isCenter = id === centerId
            return (
              <li key={id} className="path-bc-tree-item">
                <button
                  type="button"
                  className={[
                    'path-bc-tree-btn',
                    'name-tip',
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
          <p className="map-info-meta">{path.length - 1}. katman</p>
        )}
      </nav>
    )
  }

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

function VisitPathTree({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: VisitStep[]
  currentIndex: number
  onSelect: (index: number) => void
}) {
  if (steps.length === 0) {
    return (
      <p className="map-info-hint">Haritada bir servise tıklayarak gezinin.</p>
    )
  }

  return (
    <nav className="visit-path-tree" aria-label="Ziyaret yolu" data-motion="visit-path-list">
      <ol className="visit-path-list">
        <AnimatePresence initial={false}>
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex
          const isStart = i === 0
          return (
            <MotionListItem
              key={`${step.id}-${i}`}
              id={`${step.id}-${i}`}
              index={i}
              className={[
                'visit-path-item',
                isCurrent && 'is-current',
                isStart && 'is-start',
                i < steps.length - 1 && 'has-child',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="visit-path-btn name-tip"
                data-tip={step.name}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => onSelect(i)}
              >
                {step.name}
              </button>
              {isStart && steps.length > 1 && (
                <span className="visit-path-tag">başlangıç</span>
              )}
              {isCurrent && !isStart && (
                <span className="visit-path-tag">şu an</span>
              )}
            </MotionListItem>
          )
        })}
        </AnimatePresence>
      </ol>
    </nav>
  )
}

type MapInfoPanelProps = {
  center: Service
  projectLabel: string
  centerId: string
  nodes: ImpactNode[]
  parents: Map<string, string>
  projectLabels: Map<string, string>
  matchIds?: Set<string> | null
  bridgeCount?: number
  filterLabel?: string
  truncated?: boolean
  visitPath: VisitStep[]
  visitPathIndex: number
  onVisitSelect: (index: number) => void
  focusId: string | null
  nameById: Map<string, string>
  onHoverPathSelect: (serviceId: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Harita sağ sütun: etki özeti + ziyaret yolu + hover via yolu */
export function MapInfoPanel({
  center,
  projectLabel,
  centerId,
  nodes,
  parents,
  projectLabels,
  matchIds = null,
  bridgeCount = 0,
  filterLabel,
  truncated,
  visitPath,
  visitPathIndex,
  onVisitSelect,
  focusId,
  nameById,
  onHoverPathSelect,
  open,
  onOpenChange,
}: MapInfoPanelProps) {
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
  const indirect = Math.max(0, stats.serviceCount - stats.hop1Count)

  return (
    <motion.aside
      className={`map-info-drawer${open ? '' : ' is-collapsed'}`}
      aria-label="Etki özeti"
      layout
      transition={layoutSpring}
      data-motion="drawer-layout"
    >
      <div className="map-info-drawer-head">
        <h4 className="map-info-drawer-title">Etki özeti</h4>
        <button
          type="button"
          className={`nav-toggle map-info-toggle${open ? ' is-open' : ''}`}
          title={open ? 'Özeti daralt' : 'Etki özetini göster'}
          aria-label={open ? 'Etki özetini daralt' : 'Etki özetini göster'}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={`map-info-chevron${open ? '' : ' is-collapsed'}`}>
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {open ? <span className="map-info-toggle-label">Daralt</span> : null}
        </button>
      </div>
      <div className={`map-info-drawer-body${open ? '' : ' is-collapsed'}`}>
        <section className="map-info-section map-info-impact is-open">
            <div className="map-info-focus">
              <span className="map-info-focus-label">Seçilen Servis</span>
              <strong
                className={`map-info-focus-name${center.name.length > 28 ? ' name-tip is-short' : ''}`}
                data-tip={center.name.length > 28 ? center.name : undefined}
              >
                {center.name}
              </strong>
              <span className="map-info-focus-meta">{projectLabel}</span>
            </div>

            <div className="map-info-hero">
              <AnimatedNumber value={stats.serviceCount} className="map-info-hero-num" />
              <span className="map-info-hero-copy">
                <strong>
                  {filtered ? 'eşleşen servis' : 'etkilenen servis'}
                </strong>
              </span>
            </div>

            <dl className="map-info-metrics">
              <div className="map-info-metric">
                <dt>{filtered ? '1. katman' : 'Doğrudan'}</dt>
                <dd><AnimatedNumber value={stats.hop1Count} /></dd>
              </div>
              <div className="map-info-metric">
                <dt title="Hop 2 ve sonrası — doğrudan bağlıların dışındaki etkilenenler">
                  Dolaylı
                </dt>
                <dd><AnimatedNumber value={indirect} /></dd>
              </div>
            </dl>

            {(stats.maxHop > 0 ||
              (filtered && bridgeCount > 0) ||
              truncated) && (
              <dl className="map-info-stats">
                {stats.maxHop > 0 && (
                  <div className="map-info-stat">
                    <dt>Derinlik</dt>
                    <dd><AnimatedNumber value={stats.maxHop} /> katman</dd>
                  </div>
                )}
                {filtered && bridgeCount > 0 && (
                  <div className="map-info-stat">
                    <dt>Ara yol</dt>
                    <dd><AnimatedNumber value={bridgeCount} /></dd>
                  </div>
                )}
                {truncated && (
                  <div className="map-info-stat map-info-stat-warn">
                    <dt>Görünüm</dt>
                    <dd>kısaltıldı</dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          <section className="map-info-section" aria-label="Ziyaret yolu">
            <h4 className="map-info-heading">Ziyaret yolu</h4>
            <VisitPathTree
              steps={visitPath}
              currentIndex={visitPathIndex}
              onSelect={onVisitSelect}
            />
          </section>

          <section className="map-info-section" aria-label="Ana etki yolu">
            <h4 className="map-info-heading">Ana etki yolu</h4>
            <PathBreadcrumb
              centerId={centerId}
              focusId={focusId}
              parents={parents}
              nameById={nameById}
              layout="tree"
              onSelect={onHoverPathSelect}
            />
          </section>
        </div>
    </motion.aside>
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
  const titleParts = [
    `${stats.serviceCount} servis`,
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
  onToggleLayoutMode?: () => void
  layoutMode?: MapLayoutMode
  layout?: MapLayout
  drawerOpen?: boolean
  cascadeCount?: number
  showCascadeEdges?: boolean
  onToggleCascadeEdges?: () => void
  truncated?: boolean
  onSaveSnapshot?: () => void
  snapshotSaving?: boolean
  showLinkedMethods?: boolean
  methodsLoading?: boolean
  onToggleLinkedMethods?: () => void
  projectFilter?: string
  projectOptions?: Array<{ id: string; label: string }>
  onProjectFilterChange?: (projectId: string) => void
}

function DockBtn({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  pressed?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  const [flash, setFlash] = useState(false)
  const [hover, setHover] = useState(false)
  const flashTimer = useRef(0)

  useEffect(() => {
    return () => window.clearTimeout(flashTimer.current)
  }, [])

  return (
    <span
      className={`map-dock-wrap${disabled ? ' is-off' : ''}${flash ? ' is-tip-flash' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className={`map-dock-btn${pressed ? ' is-pressed' : ''}`}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-pressed={pressed}
        onClick={(e) => {
          onClick?.()
          e.currentTarget.blur()
          setFlash(true)
          window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => setFlash(false), 1000)
        }}
      >
        {children}
      </button>
      <MotionTooltip
        open={hover || flash}
        className="map-dock-tip map-dock-tip-motion"
        role="tooltip"
      >
        {label}
      </MotionTooltip>
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
      <circle cx="4.2" cy="8" r="2.1" fill="currentColor" />
      <circle cx="12.2" cy="8" r="2.1" fill="currentColor" />
      <path
        d="M6.4 8h3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <text
        x="12.2"
        y="9.15"
        textAnchor="middle"
        fill="#fffcf7"
        fontSize="6.2"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        1
      </text>
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

/** Halka / radial görünüm */
function IconRadial() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="8" cy="8" r="1.55" fill="currentColor" />
      <circle
        cx="8"
        cy="8"
        r="3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle
        cx="8"
        cy="8"
        r="6.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.55"
      />
    </svg>
  )
}

/** Ağaçtaki Method tür işaretiyle aynı renkli M ikonu. */
function IconLinkedMethods() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="#d56a35" />
      <text
        x="8"
        y="10.7"
        textAnchor="middle"
        fill="#fff"
        fontSize="8"
        fontWeight="750"
        fontFamily="system-ui, sans-serif"
      >
        M
      </text>
    </svg>
  )
}

/** Standart filtre hunisi; aktif proje varsa basılı görünür. */
function IconProjectFilter() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        d="M2.2 3h11.6L9.4 8.1v4.1l-2.8 1.3V8.1L2.2 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconSave() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M4 1h5.5L13 4.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Zm1 2v3h6V3.6L9.4 3H5Zm1 5h4v5H6V8Z"
      />
    </svg>
  )
}

function clampDockPosition(
  rootW: number,
  rootH: number,
  dockW: number,
  dockH: number,
  x: number,
  y: number,
  vertical: boolean,
) {
  const margin = 8
  const maxX = Math.max(margin, rootW - dockW - margin)
  let maxY = Math.max(margin, rootH - dockH - margin)
  if (vertical && dockH > rootH - margin * 2) {
    maxY = margin
  }
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  }
}

/**
 * Orta-alt (veya serbest) harita dock’u: sürükle, dikey/kenar.
 * React Flow çocuğu olmalı (useReactFlow).
 */
function IconCascadeArrow() {
  return (
    <svg width="24" height="10" viewBox="0 0 24 10" fill="none" aria-hidden>
      <path
        d="M1 5h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.5 2.2"
        strokeLinecap="round"
      />
      <path
        d="M15 5h4M17.5 3.2 20 5l-2.5 1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MapCanvasBar({
  visibleMaxHop,
  maxHopAvailable,
  onCollapseLayer,
  onExpandLayer,
  onExpandAll,
  onCollapseAll,
  onTidyUp,
  onToggleLayoutMode,
  layoutMode = 'ltr',
  layout,
  drawerOpen = false,
  cascadeCount,
  showCascadeEdges = false,
  onToggleCascadeEdges,
  onSaveSnapshot,
  snapshotSaving = false,
  showLinkedMethods = false,
  methodsLoading = false,
  onToggleLinkedMethods,
  projectFilter = '',
  projectOptions = [],
  onProjectFilterChange,
}: LayerControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const canExpand = visibleMaxHop < maxHopAvailable
  const canCollapse = visibleMaxHop > 1
  const nextHop = canExpand ? visibleMaxHop + 1 : null
  const fitPadding = layout
    ? fitViewPaddingForChrome(layout, { drawerOpen })
    : 0.22
  const radialOn = layoutMode === 'radial'

  const rootRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null)
  const [orient, setOrient] = useState<'h' | 'v'>('h')
  const drag = useRef<{
    ox: number
    oy: number
    sx: number
    sy: number
  } | null>(null)

  useEffect(() => {
    if (!placed || !rootRef.current || !dockRef.current) return
    const rootBox = rootRef.current.getBoundingClientRect()
    const dockBox = dockRef.current.getBoundingClientRect()
    const next = clampDockPosition(
      rootBox.width,
      rootBox.height,
      dockBox.width,
      dockBox.height,
      placed.x,
      placed.y,
      orient === 'v',
    )
    if (next.x !== placed.x || next.y !== placed.y) setPlaced(next)
  }, [orient, placed])

  const onGripPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const dock = dockRef.current
    const root = rootRef.current
    if (!dock || !root) return
    const dockBox = dock.getBoundingClientRect()
    const rootBox = root.getBoundingClientRect()
    const x = placed?.x ?? dockBox.left - rootBox.left
    const y = placed?.y ?? dockBox.top - rootBox.top
    if (!placed) setPlaced({ x, y })
    drag.current = { ox: x, oy: y, sx: e.clientX, sy: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onGripPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current || !rootRef.current || !dockRef.current) return
    const rootBox = rootRef.current.getBoundingClientRect()
    const dockBox = dockRef.current.getBoundingClientRect()
    const nx = drag.current.ox + (e.clientX - drag.current.sx)
    const ny = drag.current.oy + (e.clientY - drag.current.sy)
    setPlaced(
      clampDockPosition(
        rootBox.width,
        rootBox.height,
        dockBox.width,
        dockBox.height,
        nx,
        ny,
        orient === 'v',
      ),
    )
  }

  const onGripPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current || !rootRef.current || !dockRef.current) {
      drag.current = null
      return
    }
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const rootBox = rootRef.current.getBoundingClientRect()
    const dockBox = dockRef.current.getBoundingClientRect()
    const x = dockBox.left - rootBox.left
    const y = dockBox.top - rootBox.top
    const snap = 56
    const nearLeft = x < snap
    const nearRight = x + dockBox.width > rootBox.width - snap
    const nearBottom = y + dockBox.height > rootBox.height - snap

    if (nearLeft) {
      setOrient('v')
      setPlaced(
        clampDockPosition(
          rootBox.width,
          rootBox.height,
          dockBox.width,
          dockBox.height,
          12,
          y,
          true,
        ),
      )
      return
    }
    if (nearRight) {
      setOrient('v')
      setPlaced(
        clampDockPosition(
          rootBox.width,
          rootBox.height,
          dockBox.width,
          dockBox.height,
          Math.max(8, rootBox.width - Math.min(dockBox.width, 56) - 12),
          y,
          true,
        ),
      )
      return
    }
    if (nearBottom) {
      setOrient('h')
      setPlaced({
        x: Math.max(8, Math.min(x, rootBox.width - dockBox.width - 8)),
        y: rootBox.height - dockBox.height - 14,
      })
    }
  }

  const floatStyle =
    placed == null
      ? undefined
      : ({ left: placed.x, top: placed.y } as const)

  return (
    <div className="map-dock-float-root" ref={rootRef} aria-hidden={false}>
      <div
        ref={dockRef}
        className={`map-dock-float${placed ? ' is-placed' : ' is-default'}${orient === 'v' ? ' is-vertical' : ''}`}
        style={floatStyle}
      >
        <div
          className={`map-dock${orient === 'v' ? ' is-vertical' : ''}`}
          role="toolbar"
          aria-label="Harita araçları"
        >
          <span className="map-dock-wrap">
            <button
              type="button"
              className="map-dock-grip"
              aria-label="Araç çubuğunu sürükle. Kenara çekince dikey; çift tık yön değiştir"
              title="Sürükle · çift tık: yatay / dikey"
              onPointerDown={onGripPointerDown}
              onPointerMove={onGripPointerMove}
              onPointerUp={onGripPointerUp}
              onPointerCancel={onGripPointerUp}
              onDoubleClick={(e) => {
                e.preventDefault()
                setOrient((o) => (o === 'h' ? 'v' : 'h'))
              }}
            >
              <span className="map-dock-grip-mark" aria-hidden>
                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                  <circle cx="2.5" cy="2.5" r="1.35" />
                  <circle cx="7.5" cy="2.5" r="1.35" />
                  <circle cx="2.5" cy="8" r="1.35" />
                  <circle cx="7.5" cy="8" r="1.35" />
                  <circle cx="2.5" cy="13.5" r="1.35" />
                  <circle cx="7.5" cy="13.5" r="1.35" />
                </svg>
              </span>
            </button>
            <span className="map-dock-tip" role="tooltip">
              Sürükle · çift tık yatay/dikey
            </span>
          </span>

          <span className="map-dock-sep" aria-hidden />

          <div className="map-dock-group">
            <span className="map-dock-group-kicker">Görünüm</span>
            <div className="map-dock-group-row">
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
              {onToggleLayoutMode && (
                <DockBtn
                  label={
                    radialOn
                      ? 'Katmanlı görünüm — sola/sağa düzen'
                      : 'Halka görünüm — merkez etrafında'
                  }
                  pressed={radialOn}
                  onClick={() => {
                    onToggleLayoutMode()
                    window.setTimeout(() => {
                      fitView({ padding: fitPadding, duration: 280 })
                    }, 40)
                  }}
                >
                  <IconRadial />
                </DockBtn>
              )}
            </div>
          </div>

          <span className="map-dock-sep" aria-hidden />

          <div className="map-dock-group">
            <span className="map-dock-group-kicker">Katman</span>
            <div className="map-dock-group-row">
              <DockBtn
                label="Sadece 1. katman — doğrudan komşular"
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
                  className="map-dock-hop is-compact"
                  title={`Görünen katman ${visibleMaxHop} / ${maxHopAvailable}`}
                  aria-label={`Görünen katman ${visibleMaxHop} / ${maxHopAvailable}`}
                >
                  <span className="map-dock-hop-count">
                    <AnimatedNumberPair
                      left={visibleMaxHop}
                      right={maxHopAvailable}
                    />
                  </span>
                </span>
                <span className="map-dock-tip" role="tooltip">
                  Katman {visibleMaxHop} / {maxHopAvailable} görünür
                </span>
              </span>
              <DockBtn
                label={
                  nextHop
                    ? `Bir katman ileri — ${nextHop}. katman`
                    : 'Tüm katmanlar açık'
                }
                disabled={!canExpand}
                onClick={onExpandLayer}
              >
                <IconLayerForward />
              </DockBtn>
              <DockBtn
                label="Tüm etki zincirini aç"
                disabled={!canExpand}
                onClick={onExpandAll}
              >
                <IconFullChain />
              </DockBtn>
            </div>
          </div>

          {(onToggleLinkedMethods || onProjectFilterChange) && (
            <>
              <span className="map-dock-sep" aria-hidden />
              <div className="map-dock-group">
                <span className="map-dock-group-kicker">İçerik</span>
                <div className="map-dock-group-row">
                  {onToggleLinkedMethods && (
                    <DockBtn
                      label={
                        methodsLoading
                          ? 'Bağlı metodlar yükleniyor'
                          : showLinkedMethods
                            ? 'Bağlı metodları gizle'
                            : 'Bağlı metodları göster'
                      }
                      pressed={showLinkedMethods}
                      onClick={onToggleLinkedMethods}
                    >
                      <IconLinkedMethods />
                    </DockBtn>
                  )}
                  {onProjectFilterChange && (
                    <span className="map-dock-wrap map-dock-project-wrap">
                      <details
                        className={`map-dock-project${projectFilter ? ' is-active' : ''}`}
                      >
                        <summary
                          className={`map-dock-btn map-dock-project-trigger${projectFilter ? ' is-pressed' : ''}`}
                          title="Projeye göre filtrele"
                          aria-label={
                            projectFilter
                              ? 'Proje filtresini değiştir'
                              : 'Projeye göre filtrele'
                          }
                        >
                          <IconProjectFilter />
                          {projectFilter ? (
                            <span className="map-dock-project-dot" aria-hidden />
                          ) : null}
                        </summary>
                        <div className="map-dock-project-pop">
                          <div className="map-dock-project-pop-head">
                            <strong>Proje filtresi</strong>
                            <span>Etki haritasında yalnız seçili projeyi vurgular</span>
                          </div>
                          <div className="map-dock-project-list" role="listbox" aria-label="Proje filtresi">
                            <button
                              type="button"
                              role="option"
                              aria-selected={!projectFilter}
                              className={`map-dock-project-opt${!projectFilter ? ' is-on' : ''}`}
                              onClick={() => onProjectFilterChange('')}
                            >
                              <span>Tüm projeler</span>
                              {!projectFilter ? <span className="map-dock-project-check">✓</span> : null}
                            </button>
                            {projectOptions.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                role="option"
                                aria-selected={projectFilter === project.id}
                                className={`map-dock-project-opt${projectFilter === project.id ? ' is-on' : ''}`}
                                onClick={() => onProjectFilterChange(project.id)}
                              >
                                <span>{project.label}</span>
                                {projectFilter === project.id ? (
                                  <span className="map-dock-project-check">✓</span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      </details>
                      <span className="map-dock-tip" role="tooltip">
                        {projectFilter
                          ? `Filtre: ${projectOptions.find((p) => p.id === projectFilter)?.label ?? projectFilter}`
                          : 'Projeye göre filtrele'}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {onToggleCascadeEdges && (cascadeCount ?? 0) > 0 && (
            <>
              <span className="map-dock-sep" aria-hidden />
              <div className="map-dock-group">
                <span className="map-dock-group-kicker">Yan bağ</span>
                <div className="map-dock-group-row">
                  <span className="map-dock-wrap">
                    <button
                      type="button"
                      className={`map-dock-cascade${showCascadeEdges ? ' is-on' : ''}`}
                      aria-pressed={showCascadeEdges}
                      aria-label={
                        showCascadeEdges
                          ? `Yan bağları gizle — ${cascadeCount} alternatif rota`
                          : `Yan bağları göster — ${cascadeCount} alternatif rota`
                      }
                      title={`${cascadeCount} alternatif rota (BFS ana yol dışı)`}
                      onClick={onToggleCascadeEdges}
                    >
                      <span className="map-dock-cascade-icon" aria-hidden>
                        <IconCascadeArrow />
                      </span>
                      <span className="map-dock-cascade-count">{cascadeCount}</span>
                    </button>
                    <span className="map-dock-tip" role="tooltip">
                      <strong>{cascadeCount} alternatif rota</strong> — ana etki yoluna
                      girmeyen bağlantılar. Turuncu kesikli oklarla gösterilir.
                      {showCascadeEdges
                        ? ' Haritada görünür — gizlemek için tıkla.'
                        : ' Şu an gizli — göstermek için tıkla.'}
                    </span>
                  </span>
                </div>
              </div>
            </>
          )}

          {onSaveSnapshot && (
            <>
              <span className="map-dock-sep" aria-hidden />
              <div className="map-dock-group">
                <span className="map-dock-group-kicker">Kayıt</span>
                <div className="map-dock-group-row">
                  <DockBtn
                    label="Snapshot kaydet"
                    disabled={snapshotSaving}
                    onClick={onSaveSnapshot}
                  >
                    <IconSave />
                  </DockBtn>
                </div>
              </div>
            </>
          )}

          <span className="map-dock-sep" aria-hidden />

          <div className="map-dock-group">
            <span className="map-dock-group-kicker">Bilgi</span>
            <div className="map-dock-group-row">
              <span className="map-dock-wrap map-dock-legend">
                <button
                  type="button"
                  className="map-dock-btn map-dock-info"
                  aria-label="Ok anlamları"
                  title="Ok anlamları"
                  aria-describedby="map-legend-pop-dock"
                >
                  i
                </button>
                <div id="map-legend-pop-dock" className="map-legend-pop" role="tooltip">
                  <MapLegendContent cascadeCount={cascadeCount} />
                </div>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ImpactLegend({ cascadeCount }: LegendProps) {
  return (
    <div className="map-legend-fab">
      <button
        type="button"
        className="map-legend-info"
        aria-label="Ok anlamları"
        aria-describedby="map-legend-pop-fab"
      >
        i
      </button>
      <div id="map-legend-pop-fab" className="map-legend-pop" role="tooltip">
        <MapLegendContent cascadeCount={cascadeCount} />
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
