import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { motion } from 'motion/react'
import { useReactFlow, useStore } from 'reactflow'
import type { MapLayout, MapLayoutMode, RadialLabelSide } from '../impact/mapLayout'
import {
  autoFitMinZoom,
  fitViewPaddingForChrome,
  occludedRadialLabelIds,
  radialAnchorOffset,
  radialGraphBounds,
  radialViewportForCenter,
} from '../impact/mapLayout'
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
import { MotionSheetBody } from '../motion/MotionSheet'
import { DockMagnifyRow } from '../motion/DockMagnifyRow'
import { MotionPopover } from '../motion/MotionPopover'
import { layoutSpring } from '../motion/config'
import { DockTooltipPortal } from '../components/DockTooltipPortal'

/** Ortak lejant + filtre ipucu + path breadcrumb + blast özeti */

/** Merkez / katman değişince fitView (sol pad → etki özeti ile çakışmaz); geri/ileri kaydırmalı */
export function MapViewportSync({
  centerId,
  visibleMaxHop,
  layoutKey,
  layout,
  layoutMode = 'ltr',
  drawerOpen = false,
  mapExpanded = false,
  navDirection = null,
  onNavDirectionConsumed,
  userInteracting = false,
  viewportSyncKey = 0,
  topAligned = false,
}: {
  centerId: string
  visibleMaxHop: number
  layoutKey: string | number | boolean
  layout: MapLayout
  layoutMode?: MapLayoutMode
  drawerOpen?: boolean
  mapExpanded?: boolean
  navDirection?: 'back' | 'forward' | null
  onNavDirectionConsumed?: () => void
  userInteracting?: boolean
  viewportSyncKey?: number
  topAligned?: boolean
}) {
  const rf = useReactFlow()
  const prevCenter = useRef<string | null>(null)
  const prevHop = useRef(visibleMaxHop)
  const prevSyncKey = useRef(viewportSyncKey)
  const pendingHopFit = useRef(false)
  const drawerOpenRef = useRef(drawerOpen)
  drawerOpenRef.current = drawerOpen
  const mapExpandedRef = useRef(mapExpanded)
  mapExpandedRef.current = mapExpanded
  const navDirRef = useRef(navDirection)
  navDirRef.current = navDirection
  const consumedRef = useRef(onNavDirectionConsumed)
  consumedRef.current = onNavDirectionConsumed
  const interactingRef = useRef(userInteracting)
  interactingRef.current = userInteracting
  const syncingRef = useRef(false)
  const lastSyncAt = useRef(0)
  const paneW = useStore((s) => s.width)
  const paneH = useStore((s) => s.height)

  const fitZoomBounds = () => ({
    minZoom: autoFitMinZoom(layout, visibleMaxHop),
    maxZoom: layout.maxZoom,
  })

  const fitTargetNodes = () =>
    rf
      .getNodes()
      .filter((n) => n.type === 'serviceNode' || n.type === 'methodBadge' || n.type === 'dwhNode')

  const fitTopAligned = async (duration: number) => {
    if (paneW <= 0 || paneH <= 0) return false
    const nodes = fitTargetNodes()
    const topNodes = nodes.filter((node) => {
      const data = node.data as { kind?: string } | undefined
      return data?.kind === 'layerHeader' || data?.kind === 'center' || node.position.y <= 140
    })
    const targets = topNodes.length ? topNodes : nodes
    if (!targets.length) return false

    const bounds = targets.reduce(
      (acc, node) => {
        const styleWidth = typeof node.style?.width === 'number' ? node.style.width : undefined
        const styleHeight = typeof node.style?.height === 'number' ? node.style.height : undefined
        const width = node.width ?? styleWidth ?? layout.nodeW
        const height = node.height ?? styleHeight ?? 72
        return {
          minX: Math.min(acc.minX, node.position.x),
          minY: Math.min(acc.minY, node.position.y),
          maxX: Math.max(acc.maxX, node.position.x + width),
          maxY: Math.max(acc.maxY, node.position.y + height),
        }
      },
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    )
    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return false

    const { minZoom, maxZoom } = fitZoomBounds()
    const horizontalPad = mapExpandedRef.current ? 56 : 42
    const topPad = mapExpandedRef.current ? 58 : 48
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const zoom = Math.min(maxZoom, Math.max(minZoom, (paneW - horizontalPad * 2) / width))
    await rf.setViewport(
      {
        x: horizontalPad - bounds.minX * zoom,
        y: topPad - bounds.minY * zoom,
        zoom,
      },
      { duration },
    )
    lastSyncAt.current = Date.now()
    return true
  }

  const collectRadialItems = () => {
    return rf.getNodes().flatMap((n) => {
      const d = n.data as {
        radialDot?: boolean
        hop?: number
        kind?: string
        radialAngle?: number
        radialCx?: number
        radialCy?: number
        radialLabelSide?: RadialLabelSide
        fullLabel?: string
        label?: string
      }
      if (!d?.radialDot) return []
      const mid = radialAnchorOffset(d.kind === 'center')
      const cx = n.position.x + mid.x
      const cy = n.position.y + mid.y
      const angle =
        typeof d.radialCx === 'number' && typeof d.radialCy === 'number'
          ? Math.atan2(cy - d.radialCy, cx - d.radialCx)
          : (d.radialAngle ?? 0)
      return [
        {
          cx,
          cy,
          angle,
          name: String(d.fullLabel || d.label || ''),
          kind: String(d.kind ?? 'service'),
          side: d.radialLabelSide,
        },
      ]
    })
  }

  const focusViewport = async (
    duration: number,
    mode: MapLayoutMode,
  ) => {
    if (syncingRef.current || interactingRef.current) return
    syncingRef.current = true
    try {
      const padding = fitViewPaddingForChrome(layout, {
        drawerOpen: drawerOpenRef.current,
        radial: mode === 'radial',
        fullscreen: mapExpandedRef.current,
      })
      const fitOpts = {
        padding,
        ...fitZoomBounds(),
        nodes: fitTargetNodes(),
      }

      if (mode === 'radial') {
        const items = collectRadialItems()
        const bounds = radialGraphBounds(items)
        const centerNode = rf.getNode(centerId)
        if (bounds && centerNode && paneW > 0 && paneH > 0) {
          const d = centerNode.data as { radialCx?: number; radialCy?: number }
          const cx =
            typeof d.radialCx === 'number'
              ? d.radialCx
              : centerNode.position.x + radialAnchorOffset(true).x
          const cy =
            typeof d.radialCy === 'number'
              ? d.radialCy
              : centerNode.position.y + radialAnchorOffset(true).y
          const vp = radialViewportForCenter(
            bounds,
            { cx, cy },
            paneW,
            paneH,
            {
              ...fitZoomBounds(),
              padding,
              fullscreen: mapExpandedRef.current,
            },
          )
          await rf.setViewport(vp, { duration })
          lastSyncAt.current = Date.now()
          return
        }
      }

      if (topAligned && mode !== 'radial' && (await fitTopAligned(duration))) {
        return
      }

      if (fitOpts.nodes.length > 0) {
        await rf.fitView({ ...fitOpts, duration })
      } else {
        await rf.fitView({ padding, ...fitZoomBounds(), duration })
      }
      lastSyncAt.current = Date.now()
    } finally {
      syncingRef.current = false
    }
  }

  useEffect(() => {
    const centerChanged =
      prevCenter.current !== null && prevCenter.current !== centerId
    const hopChanged = prevHop.current !== visibleMaxHop
    const syncKeyChanged = prevSyncKey.current !== viewportSyncKey
    prevCenter.current = centerId
    prevSyncKey.current = viewportSyncKey
    if (hopChanged) {
      prevHop.current = visibleMaxHop
      pendingHopFit.current = true
      if (!centerChanged) return
    } else {
      prevHop.current = visibleMaxHop
    }
    const dir = navDirRef.current
    const deferHop = pendingHopFit.current && !syncKeyChanged && !centerChanged
    if (deferHop) return

    const shouldRetryHopFit = pendingHopFit.current && syncKeyChanged

    const delay =
      syncKeyChanged && pendingHopFit.current
        ? 16
        : layoutMode === 'radial' && hopChanged
          ? 120
          : 72

    const id = window.setTimeout(() => {
      if (interactingRef.current) return
      void (async () => {
        if (interactingRef.current) return
        const padding = fitViewPaddingForChrome(layout, {
          drawerOpen: drawerOpenRef.current,
          radial: layoutMode === 'radial',
          fullscreen: mapExpandedRef.current,
        })
        const fitOpts = {
          padding,
          ...fitZoomBounds(),
          nodes: fitTargetNodes(),
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
          pendingHopFit.current = false
          return
        }

        await focusViewport(
          centerChanged ? 320 : pendingHopFit.current ? 360 : 280,
          layoutMode,
        )
        pendingHopFit.current = false
      })()
    }, delay)

    let retryId = 0
    if (shouldRetryHopFit) {
      retryId = window.setTimeout(() => {
        if (interactingRef.current) return
        void focusViewport(280, layoutMode)
      }, 340)
    }

    return () => {
      window.clearTimeout(id)
      window.clearTimeout(retryId)
    }
  }, [
    centerId,
    visibleMaxHop,
    viewportSyncKey,
    layoutKey,
    layout,
    layoutMode,
    mapExpanded,
    drawerOpen,
    topAligned,
    rf,
  ])

  const prevDrawer = useRef(drawerOpen)
  useEffect(() => {
    if (prevDrawer.current === drawerOpen) return
    prevDrawer.current = drawerOpen
    if (Date.now() - lastSyncAt.current < 180) return
    const id = window.setTimeout(() => {
      if (interactingRef.current) return
      void focusViewport(240, layoutMode)
    }, 100)
    return () => window.clearTimeout(id)
  }, [drawerOpen, layout, layoutMode, rf, topAligned, visibleMaxHop])

  const prevPane = useRef(`${Math.round(paneW)}x${Math.round(paneH)}`)

  useEffect(() => {
    const next = `${Math.round(paneW)}x${Math.round(paneH)}`
    const prev = prevPane.current
    if (prev === next) return
    const [pw, ph] = prev.split('x').map(Number)
    prevPane.current = next
    if (!pw || (Math.abs(pw - paneW) < 20 && Math.abs(ph - paneH) < 20)) return
    if (Date.now() - lastSyncAt.current < 480) return
    if (interactingRef.current) return
    // Sidebar overlay aç/kapa — workspace padding ile kayar; fitView sıçratmasın
    const widthDelta = Math.abs(paneW - pw)
    if (widthDelta >= 140 && widthDelta <= 260 && Math.abs(ph - paneH) < 24) return
    const id = window.setTimeout(() => {
      void (layoutMode === 'radial'
        ? focusViewport(240, 'radial')
        : topAligned
          ? focusViewport(240, layoutMode)
        : rf.fitView({
            padding: fitViewPaddingForChrome(layout, {
              drawerOpen: drawerOpenRef.current,
              radial: false,
              fullscreen: mapExpandedRef.current,
            }),
            ...fitZoomBounds(),
            nodes: fitTargetNodes(),
            duration: 240,
          }))
    }, 100)
    return () => window.clearTimeout(id)
  }, [paneW, paneH, layout, layoutMode, rf, topAligned])

  return null
}

/** Halka: çakışan isimleri gizle; hover / odakta geri getir. Pan/zoom’da store’a abone olma. */
export function RadialLabelZoomSync({ layoutTick }: { layoutTick?: string | number }) {
  const rf = useReactFlow()
  const probe = useRef<HTMLSpanElement>(null)
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
        radialLabelSide?: RadialLabelSide
        fullLabel?: string
        label?: string
      }
      if (!d?.radialDot) return []
      const mid = radialAnchorOffset(d.kind === 'center')
      const cx = n.position.x + mid.x
      const cy = n.position.y + mid.y
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
          side: d.radialLabelSide,
        },
      ]
    })
    const hidden = occludedRadialLabelIds(items)
    const root = probe.current?.closest('.dd-map')
    root?.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.toggle('radial-label-occluded', hidden.has(id))
    })
  }, [layoutTick, rf])
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

/** Ziyaret yolu: merkezden odaktaki node'a giden ana zincir. */
export function PathBreadcrumb({
  centerId,
  focusId,
  parents,
  nameById,
  onSelect,
  layout = 'bar',
}: BreadcrumbProps) {
  const path = useMemo(() => {
    if (!focusId || focusId.startsWith('collapsed-') || focusId.startsWith('dwh-collapsed-')) return null
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
          <p className="map-info-empty-title">Ziyaret yolunu görün</p>
          <p className="map-info-empty-cta">
            Haritada bir node'un üzerine gelin. Merkezden o node'a giden yol
            burada listelenir.
          </p>
        </div>
      )
    }
    return (
      <div className="path-breadcrumb is-idle" aria-live="polite">
        <span className="path-bc-label">Yol</span>
        <span className="path-bc-hint">
          Haritada bir node'un üzerine gelin — merkezden o node'a giden yol
          burada görünür.
        </span>
      </div>
    )
  }

  if (layout === 'tree') {
    return (
      <nav className="path-bc-tree" aria-label="Ziyaret yolu">
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
                  <span className="path-bc-tree-num" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="path-bc-tree-name">{name}</span>
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
    <nav className="path-breadcrumb" aria-label="Ziyaret yolu">
      <span className="path-bc-label">Ziyaret yolu</span>
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
  focusId: string | null
  nameById: Map<string, string>
  onHoverPathSelect: (serviceId: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Drawer üzerindeyken harita hover'ının düşmemesi için */
  onDrawerPointerChange?: (inside: boolean) => void
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
  focusId,
  nameById,
  onHoverPathSelect,
  open,
  onOpenChange,
  onDrawerPointerChange,
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
      data-motion="drawer-layout"
      onPointerEnter={() => onDrawerPointerChange?.(true)}
      onPointerLeave={() => onDrawerPointerChange?.(false)}
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
      <MotionSheetBody open={open} className="map-info-drawer-body">
        <div
          className="map-info-drawer-scroll"
          onWheel={(e) => e.stopPropagation()}
        >
        <section className="map-info-section map-info-impact is-open">
            <div className="map-info-spotlight-block">
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
            </div>
          </section>

          <section
            className="map-info-section map-info-via-section"
            aria-label="Ziyaret yolu"
          >
            <h4 className="map-info-heading">Ziyaret yolu</h4>
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
      </MotionSheetBody>
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
  const directCount = stats.hop1Count
  const indirectCount = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.hop >= 2 && (!matchIds || matchIds.has(n.service.id)),
      ).length,
    [nodes, matchIds],
  )
  const segmentTotal = Math.max(1, directCount + indirectCount)
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
      {!filtered && directCount + indirectCount > 0 ? (
        <>
          <div className="blast-segment-track" aria-hidden>
            {directCount > 0 ? (
              <motion.span
                className="blast-segment is-direct"
                initial={{ width: 0 }}
                animate={{ width: `${(directCount / segmentTotal) * 100}%` }}
                transition={layoutSpring}
              />
            ) : null}
            {indirectCount > 0 ? (
              <motion.span
                className="blast-segment is-indirect"
                initial={{ width: 0 }}
                animate={{ width: `${(indirectCount / segmentTotal) * 100}%` }}
                transition={layoutSpring}
              />
            ) : null}
          </div>
          <span className="blast-segment-legend">
            <span>
              <i className="is-direct" aria-hidden />
              <strong>{directCount}</strong> doğrudan
            </span>
            <span>
              <i className="is-indirect" aria-hidden />
              <strong>{indirectCount}</strong> dolaylı
            </span>
          </span>
        </>
      ) : null}
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
  viewMode?: MapLayoutMode | 'swimlane'
  onSetViewMode?: (mode: MapLayoutMode | 'swimlane') => void
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
  projectFilters?: string[]
  projectOptions?: Array<{ id: string; label: string }>
  packageFilters?: string[]
  packageOptions?: Array<{
    id: string
    label: string
    projectId: string
    projectLabel: string
  }>
  onProjectFiltersChange?: (projectIds: string[]) => void
  onPackageFiltersChange?: (packageIds: string[]) => void
  layerTitle?: string
  collapseAllLabel?: string
  collapseLayerLabel?: string
  expandLayerLabel?: string
  expandAllLabel?: string
  layerStatusLabel?: string
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
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number }>
  >([])
  const flashTimer = useRef(0)
  const btnRef = useRef<HTMLButtonElement>(null)
  const rippleId = useRef(0)

  useEffect(() => {
    return () => window.clearTimeout(flashTimer.current)
  }, [])

  const spawnRipple = (clientX: number, clientY: number) => {
    const btn = btnRef.current
    if (!btn || disabled) return
    const r = btn.getBoundingClientRect()
    const id = ++rippleId.current
    const x = clientX - r.left
    const y = clientY - r.top
    setRipples((prev) => [...prev, { id, x, y }])
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id))
    }, 520)
  }

  return (
    <span
      className={`map-dock-wrap map-dock-wrap-morph${disabled ? ' is-off' : ''}${flash ? ' is-tip-flash' : ''}${hover ? ' is-hover' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-motion="dock-ripple"
    >
      <button
        ref={btnRef}
        type="button"
        className={`map-dock-btn${pressed ? ' is-pressed' : ''}`}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        onClick={(e) => {
          spawnRipple(e.clientX, e.clientY)
          onClick?.()
          e.currentTarget.blur()
          setFlash(true)
          window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => setFlash(false), 1000)
        }}
      >
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="map-dock-ripple"
            style={{ left: ripple.x, top: ripple.y }}
            aria-hidden
          />
        ))}
        {children}
      </button>
      <DockTooltipPortal open={hover || flash} anchorRef={btnRef}>
        {label}
      </DockTooltipPortal>
    </span>
  )
}

function DockHoverTip({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: (props: {
    ref: RefObject<HTMLSpanElement | null>
    onMouseEnter: () => void
    onMouseLeave: () => void
  }) => ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [hover, setHover] = useState(false)
  return (
    <span className={className}>
      {children({
        ref,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
      })}
      <DockTooltipPortal open={hover} anchorRef={ref}>
        {label}
      </DockTooltipPortal>
    </span>
  )
}

function IconDockCollapse() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="10.5" y="3.5" width="2" height="9" rx="1" fill="currentColor" opacity="0.55" />
      <path
        d="M8.5 4.5 6 8l2.5 3.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 4.5 2 8l2.5 3.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconDockExpand() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="2" height="9" rx="1" fill="currentColor" opacity="0.55" />
      <path
        d="M7.5 4.5 10 8 7.5 11.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 4.5 14 8l-2.5 3.5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function IconTreeView() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="3.3" cy="8" r="1.45" fill="currentColor" />
      <circle cx="8.2" cy="5" r="1.35" fill="currentColor" />
      <circle cx="8.2" cy="11" r="1.35" fill="currentColor" />
      <circle cx="13" cy="3.4" r="1.05" fill="currentColor" />
      <circle cx="13" cy="6.6" r="1.05" fill="currentColor" />
      <circle cx="13" cy="9.4" r="1.05" fill="currentColor" />
      <circle cx="13" cy="12.6" r="1.05" fill="currentColor" />
      <path
        d="M4.8 8h1.6M6.4 8 7.1 6M6.4 8l.7 2M9.5 5h2M9.5 11h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconSwimlane() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h10" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <rect x="4" y="2.6" width="3.1" height="2.8" rx="0.7" fill="currentColor" />
      <rect x="8.9" y="6.6" width="3.1" height="2.8" rx="0.7" fill="currentColor" />
      <rect x="5.8" y="10.6" width="3.1" height="2.8" rx="0.7" fill="currentColor" />
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
) {
  const margin = 8
  const maxX = Math.max(margin, rootW - dockW - margin)
  const maxY = Math.max(margin, rootH - dockH - margin)
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  }
}

/**
 * Orta-alt (veya serbest) harita dock’u: sürükle, daralt/genişlet.
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
  viewMode,
  onSetViewMode,
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
  projectFilters = [],
  projectOptions = [],
  packageFilters = [],
  packageOptions = [],
  onProjectFiltersChange,
  onPackageFiltersChange,
  layerTitle = 'Katman',
  collapseAllLabel = 'Sadece 1. katman — doğrudan komşular',
  collapseLayerLabel,
  expandLayerLabel,
  expandAllLabel = 'Tüm etki zincirini aç',
  layerStatusLabel,
}: LayerControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const canExpand = visibleMaxHop < maxHopAvailable
  const canCollapse = visibleMaxHop > 1
  const nextHop = canExpand ? visibleMaxHop + 1 : null
  const fitPadding = layout
    ? fitViewPaddingForChrome(layout, { drawerOpen })
    : 0.22
  const activeViewMode = viewMode ?? layoutMode
  const radialOn = activeViewMode === 'radial'
  const setViewMode = (mode: MapLayoutMode | 'swimlane') => {
    onSetViewMode?.(mode)
    window.setTimeout(() => {
      fitView({ padding: fitPadding, duration: 280 })
    }, 40)
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null)
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const [projectPopOpen, setProjectPopOpen] = useState(false)
  const gripRef = useRef<HTMLButtonElement>(null)
  const collapseRef = useRef<HTMLButtonElement>(null)
  const [gripHover, setGripHover] = useState(false)
  const [collapseHover, setCollapseHover] = useState(false)
  const cascadeRef = useRef<HTMLButtonElement>(null)
  const [cascadeHover, setCascadeHover] = useState(false)
  const drag = useRef<{
    ox: number
    oy: number
    sx: number
    sy: number
  } | null>(null)
  const hasScopeFilter = projectFilters.length > 0 || packageFilters.length > 0
  const toggleProjectFilter = (id: string) => {
    const next = projectFilters.includes(id)
      ? projectFilters.filter((x) => x !== id)
      : [...projectFilters, id]
    onProjectFiltersChange?.(next)
  }
  const togglePackageFilter = (id: string) => {
    const next = packageFilters.includes(id)
      ? packageFilters.filter((x) => x !== id)
      : [...packageFilters, id]
    onPackageFiltersChange?.(next)
  }
  const clearScopeFilters = () => {
    onProjectFiltersChange?.([])
    onPackageFiltersChange?.([])
  }

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
    )
    if (next.x !== placed.x || next.y !== placed.y) setPlaced(next)
  }, [placed, dockCollapsed])

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
    const nearBottom = y + dockBox.height > rootBox.height - snap

    if (nearBottom) {
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
        className={`map-dock-float${placed ? ' is-placed' : ' is-default'}${dockCollapsed ? ' is-collapsed' : ''}`}
        style={floatStyle}
      >
        <div
          className={`map-dock${dockCollapsed ? ' is-collapsed' : ''}`}
          role="toolbar"
          aria-label="Harita araçları"
        >
          <span className="map-dock-lead">
            <button
              ref={gripRef}
              type="button"
              className="map-dock-grip"
              aria-label="Taşı — araç çubuğunu sürükle"
              onMouseEnter={() => setGripHover(true)}
              onMouseLeave={() => setGripHover(false)}
              onPointerDown={onGripPointerDown}
              onPointerMove={onGripPointerMove}
              onPointerUp={onGripPointerUp}
              onPointerCancel={onGripPointerUp}
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
            <DockTooltipPortal open={gripHover} anchorRef={gripRef}>
              Taşı
            </DockTooltipPortal>
            <button
              ref={collapseRef}
              type="button"
              className="map-dock-collapse-btn"
              aria-expanded={!dockCollapsed}
              aria-label={dockCollapsed ? 'Araç çubuğunu genişlet' : 'Araç çubuğunu daralt'}
              onMouseEnter={() => setCollapseHover(true)}
              onMouseLeave={() => setCollapseHover(false)}
              onClick={() => {
                setDockCollapsed((c) => {
                  if (!c) setProjectPopOpen(false)
                  return !c
                })
              }}
            >
              <span className="map-dock-collapse-icon">
                {dockCollapsed ? <IconDockExpand /> : <IconDockCollapse />}
              </span>
            </button>
            <DockTooltipPortal open={collapseHover} anchorRef={collapseRef}>
              {dockCollapsed ? 'Genişlet' : 'Daralt'}
            </DockTooltipPortal>
          </span>

          <motion.div
            className={`map-dock-expand${dockCollapsed ? '' : ' is-open'}`}
            initial={false}
            animate={{
              gridTemplateColumns: dockCollapsed ? '0fr' : '1fr',
              opacity: dockCollapsed ? 0 : 1,
            }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            style={{ pointerEvents: dockCollapsed ? 'none' : 'auto' }}
          >
            <div className="map-dock-expand-inner">
              <div className="map-dock-expand-track">
          <span className="map-dock-sep" aria-hidden />

          <div className="map-dock-group">
            <span className="map-dock-group-kicker">Görünüm</span>
            <DockMagnifyRow>
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
              {onToggleLayoutMode && !onSetViewMode && (
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
              {onSetViewMode ? (
                <>
                  <DockBtn
                    label="Ağaç görünüm"
                    pressed={activeViewMode === 'ltr'}
                    onClick={() => setViewMode('ltr')}
                  >
                    <IconTreeView />
                  </DockBtn>
                  <DockBtn
                    label="Halkalı görünüm"
                    pressed={activeViewMode === 'radial'}
                    onClick={() => setViewMode('radial')}
                  >
                    <IconRadial />
                  </DockBtn>
                  <DockBtn
                    label="Katmanlı görünüm"
                    pressed={activeViewMode === 'swimlane'}
                    onClick={() => setViewMode('swimlane')}
                  >
                    <IconSwimlane />
                  </DockBtn>
                </>
              ) : null}
            </DockMagnifyRow>
          </div>

          <span className="map-dock-sep" aria-hidden />

          <div className="map-dock-group">
            <span className="map-dock-group-kicker">{layerTitle}</span>
            <DockMagnifyRow>
              <DockBtn
                label={collapseAllLabel}
                disabled={!canCollapse}
                onClick={onCollapseAll}
              >
                <IconNeighbors />
              </DockBtn>
              <DockBtn
                label={collapseLayerLabel ?? (canCollapse ? 'Bir katman geri' : 'Zaten sadece komşular')}
                disabled={!canCollapse}
                onClick={onCollapseLayer}
              >
                <IconLayerBack />
              </DockBtn>
              <DockHoverTip
                label={layerStatusLabel ?? `Katman ${visibleMaxHop} / ${maxHopAvailable} görünür`}
                className="map-dock-wrap"
              >
                {({ ref, onMouseEnter, onMouseLeave }) => (
                <span
                  ref={ref}
                  className="map-dock-hop is-compact"
                  aria-label={`Görünen katman ${visibleMaxHop} / ${maxHopAvailable}`}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                >
                  <span className="map-dock-hop-count">
                    <AnimatedNumberPair
                      left={visibleMaxHop}
                      right={maxHopAvailable}
                    />
                  </span>
                </span>
                )}
              </DockHoverTip>
              <DockBtn
                label={expandLayerLabel ?? (nextHop ? `Bir katman ileri — ${nextHop}. katman` : 'Tüm katmanlar açık')}
                disabled={!canExpand}
                onClick={onExpandLayer}
              >
                <IconLayerForward />
              </DockBtn>
              <DockBtn
                label={expandAllLabel}
                disabled={!canExpand}
                onClick={onExpandAll}
              >
                <IconFullChain />
              </DockBtn>
            </DockMagnifyRow>
          </div>

          {(onToggleLinkedMethods || onProjectFiltersChange || onPackageFiltersChange) && (
            <>
              <span className="map-dock-sep" aria-hidden />
              <div className="map-dock-group">
                <span className="map-dock-group-kicker">İçerik</span>
                <DockMagnifyRow>
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
                  {(onProjectFiltersChange || onPackageFiltersChange) && (
                    <MotionPopover
                      open={projectPopOpen}
                      onOpenChange={setProjectPopOpen}
                      className="map-dock-wrap map-dock-project-wrap motion-popover-dock"
                      panelClassName="map-dock-project-pop"
                      placement="top"
                      label="Kapsam filtresi"
                      trigger={
                        <button
                          type="button"
                          className={`map-dock-btn map-dock-project-trigger${hasScopeFilter ? ' is-pressed' : ''}${projectPopOpen ? ' is-open' : ''}`}
                          title="Projeye veya jar'a göre filtrele"
                          aria-label={
                            hasScopeFilter
                              ? 'Kapsam filtresini değiştir'
                              : 'Projeye veya jar’a göre filtrele'
                          }
                          aria-expanded={projectPopOpen}
                          aria-haspopup="dialog"
                          onClick={() => setProjectPopOpen((open) => !open)}
                        >
                          <IconProjectFilter />
                          {hasScopeFilter ? (
                            <span className="map-dock-project-dot" aria-hidden />
                          ) : null}
                        </button>
                      }
                    >
                      <div className="map-dock-project-pop-head">
                        <strong>Kapsam filtresi</strong>
                        <span>Etki haritasında seçili proje ve jar kapsamlarını gösterir</span>
                      </div>
                      {hasScopeFilter ? (
                        <button
                          type="button"
                          className="map-dock-project-clear"
                          onClick={clearScopeFilters}
                        >
                          Filtreleri temizle
                        </button>
                      ) : null}
                      <div className="map-dock-project-list" aria-label="Kapsam filtresi">
                        <p className="map-dock-project-section">Projeler</p>
                        {projectOptions.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            role="checkbox"
                            aria-checked={projectFilters.includes(project.id)}
                            className={`map-dock-project-opt${projectFilters.includes(project.id) ? ' is-on' : ''}`}
                            onClick={() => toggleProjectFilter(project.id)}
                          >
                            <span>{project.label}</span>
                            {projectFilters.includes(project.id) ? (
                              <span className="map-dock-project-check">✓</span>
                            ) : null}
                          </button>
                        ))}
                        <p className="map-dock-project-section">Jarlar</p>
                        {packageOptions.length === 0 ? (
                          <p className="map-dock-project-empty">Bu etki zincirinde jar yok.</p>
                        ) : (
                          packageOptions.map((pkg) => (
                            <button
                              key={pkg.id}
                              type="button"
                              role="checkbox"
                              aria-checked={packageFilters.includes(pkg.id)}
                              className={`map-dock-project-opt${packageFilters.includes(pkg.id) ? ' is-on' : ''}`}
                              onClick={() => togglePackageFilter(pkg.id)}
                            >
                              <span>{pkg.label}</span>
                              <span className="map-dock-project-sub">{pkg.projectLabel}</span>
                              {packageFilters.includes(pkg.id) ? (
                                <span className="map-dock-project-check">✓</span>
                              ) : null}
                            </button>
                          ))
                        )}
                      </div>
                    </MotionPopover>
                  )}
                </DockMagnifyRow>
              </div>
            </>
          )}

          {onToggleCascadeEdges && (cascadeCount ?? 0) > 0 && (
            <>
              <span className="map-dock-sep" aria-hidden />
              <div className="map-dock-group">
                <span className="map-dock-group-kicker">Yan bağ</span>
                <DockMagnifyRow>
                  <span
                    className="map-dock-wrap"
                    onMouseEnter={() => setCascadeHover(true)}
                    onMouseLeave={() => setCascadeHover(false)}
                  >
                    <button
                      ref={cascadeRef}
                      type="button"
                      className={`map-dock-cascade${showCascadeEdges ? ' is-on' : ''}`}
                      aria-pressed={showCascadeEdges}
                      aria-label={
                        showCascadeEdges
                          ? `Yan bağları gizle — ${cascadeCount} alternatif rota`
                          : `Yan bağları göster — ${cascadeCount} alternatif rota`
                      }
                      onClick={onToggleCascadeEdges}
                    >
                      <span className="map-dock-cascade-icon" aria-hidden>
                        <IconCascadeArrow />
                      </span>
                      <span className="map-dock-cascade-count">{cascadeCount}</span>
                    </button>
                    <DockTooltipPortal open={cascadeHover} anchorRef={cascadeRef}>
                      <strong>{cascadeCount} alternatif rota</strong> — ziyaret yoluna
                      girmeyen bağlantılar. Turuncu kesikli oklarla gösterilir.
                      {showCascadeEdges
                        ? ' Haritada görünür — gizlemek için tıkla.'
                        : ' Şu an gizli — göstermek için tıkla.'}
                    </DockTooltipPortal>
                  </span>
                </DockMagnifyRow>
              </div>
            </>
          )}

          {onSaveSnapshot && (
            <>
              <span className="map-dock-sep" aria-hidden />
              <div className="map-dock-group">
                <span className="map-dock-group-kicker">Kayıt</span>
                <DockMagnifyRow>
                  <DockBtn
                    label="Snapshot kaydet"
                    disabled={snapshotSaving}
                    onClick={onSaveSnapshot}
                  >
                    <IconSave />
                  </DockBtn>
                </DockMagnifyRow>
              </div>
            </>
          )}

          <span className="map-dock-sep" aria-hidden />

          <div className="map-dock-group">
            <span className="map-dock-group-kicker">Bilgi</span>
            <DockMagnifyRow>
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
            </DockMagnifyRow>
          </div>
              </div>
            </div>
          </motion.div>
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
        Bu etki zincirinde <strong>{filterLabel}</strong> kapsamına giren
        etkilenen servis yok — başka kapsam seçin veya filtreyi kaldırın.
      </p>
    )
  }
  if (hop1EmptyButDeeper) {
    return (
      <p className="map-filter-hint">
        <strong>{filterLabel}</strong> kapsamındaki servisler doğrudan (1.
        katman) etkilenmiyor. Etki <strong>{deepestHop}. katmanda</strong>{' '}
        görünüyor ({matchCount} servis). Kesik gri çerçeve = filtre dışı ara
        yol; kalın yeşil çerçeve = kapsamla eşleşen servis.
      </p>
    )
  }
  return (
    <p className="map-filter-hint">
      Yalnız <strong>{filterLabel}</strong> kapsamındaki etkilenen servisler (
      {matchCount}
      {bridgeCount > 0 ? ` · ${bridgeCount} ara yol` : ''}).
    </p>
  )
}
