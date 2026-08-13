import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  applyProjectFilter,
  discoveryParents,
  filterEdges,
  filterNodes,
  type ProjectOption,
} from '../impact/projectFilter'
import type { ImpactGraph, ImpactNode } from '../types'
import { ImpactLegend, ProjectFilterHint } from './ImpactChrome'

type Props = {
  graph: ImpactGraph
  projectOptions: ProjectOption[]
  onPivot: (serviceId: string) => void
  onClearCenter?: () => void
  onPivotBack?: () => void
  onPivotForward?: () => void
  canPivotBack?: boolean
  canPivotForward?: boolean
}

type EdgeKind = 'tree' | 'cascade'

type Line = {
  key: string
  fromId: string
  toId: string
  hop: number
  kind: EdgeKind
  /** Sağdan sağa yay (aynı kolon veya geriye/cascade) */
  sideRoute: boolean
  fanIndex: number
  fanCount: number
  x1: number
  y1: number
  x2: number
  y2: number
  lx: number
  ly: number
}

const MARKER_GAP = 10

function elbowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fanIndex = 0,
  fanCount = 1,
) {
  const mid = (fanCount - 1) / 2
  const spread = (fanIndex - mid) * 14
  const rail = x1 + Math.max(24, (x2 - x1) * 0.4) + spread
  return `M ${x1} ${y1} H ${rail} V ${y2} H ${x2}`
}

/**
 * Cascade sağ rota: çıkış/giriş okları chip dışında kalsın diye
 * uçlar MARKER_GAP kadar dışarı taşınır.
 */
function cascadeSideArc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fanIndex = 0,
  fanCount = 1,
) {
  const mid = (fanCount - 1) / 2
  const spread = (fanIndex - mid) * 34
  const bulge = Math.max(x1, x2) + 72 + fanIndex * 28 + Math.abs(spread) * 0.35
  const cy1 = y1 + spread * 0.25
  const cy2 = y2 + spread * 0.25
  return `M ${x1} ${y1} C ${bulge} ${cy1}, ${bulge} ${cy2}, ${x2} ${y2}`
}

/** Gerçek kenar + cascade (aynı katman yan bağ) ayrı tür */
export function SimpleImpactPath({
  graph,
  projectOptions,
  onPivot,
  onClearCenter,
  onPivotBack,
  onPivotForward,
  canPivotBack = false,
  canPivotForward = false,
}: Props) {
  const { center, truncated, reason } = graph
  /** Görünen en yüksek katman; 1’den başlar, tek tek açılır/kapanır */
  const [visibleMaxHop, setVisibleMaxHop] = useState(1)
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const stageRef = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/:/g, '')
  const treeMarker = `path-arrow-tree-${uid}`
  const cascadeMarker = `path-arrow-cascade-${uid}`

  const filter = useMemo(
    () => applyProjectFilter(graph, projectFilter || null),
    [graph, projectFilter],
  )

  const nodes = useMemo(
    () => filterNodes(graph.nodes, filter.keepIds),
    [graph.nodes, filter.keepIds],
  )
  const edges = useMemo(
    () => filterEdges(graph.edges, filter.keepIds),
    [graph.edges, filter.keepIds],
  )

  const filterLabel =
    projectOptions.find((p) => p.id === projectFilter)?.label ?? ''

  useEffect(() => {
    setVisibleMaxHop(1)
    setFocusId(null)
    setProjectFilter('')
  }, [center.id])

  /** Filtre uygulanınca eşleşen en derin katmana kadar aç (ara yol görünsün) */
  useEffect(() => {
    if (!projectFilter || filter.matchCount === 0) return
    setVisibleMaxHop(Math.max(1, filter.deepestHop))
  }, [projectFilter, filter.matchCount, filter.deepestHop])

  const nameById = useMemo(() => {
    const m = new Map<string, string>([[center.id, center.name]])
    for (const n of graph.nodes) m.set(n.service.id, n.service.name)
    return m
  }, [center, graph.nodes])

  const hopOf = useMemo(() => {
    const m = new Map<string, number>([[center.id, 0]])
    for (const n of nodes) m.set(n.service.id, n.hop)
    return m
  }, [center.id, nodes])

  const parents = useMemo(
    () => discoveryParents(center.id, edges),
    [center.id, edges],
  )

  const byHop = useMemo(() => {
    const map = new Map<number, ImpactNode[]>()
    for (const n of nodes) {
      const list = map.get(n.hop) ?? []
      list.push(n)
      map.set(n.hop, list)
    }
    for (const [hop, list] of map) {
      if (hop <= 1) continue
      list.sort((a, b) => {
        const pa = parents.get(a.service.id) ?? ''
        const pb = parents.get(b.service.id) ?? ''
        if (pa !== pb) return pa.localeCompare(pb)
        return a.service.name.localeCompare(b.service.name)
      })
      map.set(hop, list)
    }
    return map
  }, [nodes, parents])

  const hops = useMemo(
    () => [...byHop.keys()].sort((a, b) => a - b),
    [byHop],
  )
  const hop1 = useMemo(() => byHop.get(1) ?? [], [byHop])
  const maxHopAvailable = hops.length ? hops[hops.length - 1]! : 1
  const nextHop = hops.find((h) => h === visibleMaxHop + 1)
  const canExpandLayer = Boolean(nextHop)
  const canCollapseLayer = visibleMaxHop > 1
  const canExpandAll = visibleMaxHop < maxHopAvailable
  const canCollapseAll = visibleMaxHop > 1
  const visibleLayerHops = useMemo(
    () => hops.filter((h) => h >= 2 && h <= visibleMaxHop),
    [hops, visibleMaxHop],
  )

  const visibleEdges = useMemo(() => {
    const ids = new Set<string>([center.id])
    for (const h of hops) {
      if (h > visibleMaxHop) continue
      for (const n of byHop.get(h) ?? []) ids.add(n.service.id)
    }
    return edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId))
  }, [center.id, hops, byHop, visibleMaxHop, edges])

  /** Hedefe gelen cascade kaynakları (ağaç ebeveyni değil) */
  const cascadeInto = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const e of visibleEdges) {
      if (parents.get(e.toId) === e.fromId) continue
      const list = map.get(e.toId) ?? []
      list.push(e.fromId)
      map.set(e.toId, list)
    }
    return map
  }, [visibleEdges, parents])

  const cascadeCount = useMemo(
    () => visibleEdges.filter((e) => parents.get(e.toId) !== e.fromId).length,
    [visibleEdges, parents],
  )

  /** Hover ego: yalnız odak + ona değen uçlar (merkez path’i yok) */
  const pathIds = useMemo(() => {
    if (!focusId) return null
    const ids = new Set<string>([focusId])
    for (const e of visibleEdges) {
      if (e.fromId === focusId || e.toId === focusId) {
        ids.add(e.fromId)
        ids.add(e.toId)
      }
    }
    return ids
  }, [focusId, visibleEdges])

  const dimmed = Boolean(focusId && pathIds)

  useLayoutEffect(() => {
    const root = stageRef.current
    if (!root) return

    const measure = () => {
      const rootBox = root.getBoundingClientRect()
      type Anchor = {
        left: number
        right: number
        cy: number
      }
      const anchors = new Map<string, Anchor>()
      root.querySelectorAll<HTMLElement>('[data-node-id]').forEach((el) => {
        const id = el.dataset.nodeId
        if (!id) return
        const r = el.getBoundingClientRect()
        anchors.set(id, {
          right: r.right - rootBox.left,
          left: r.left - rootBox.left,
          cy: r.top + r.height / 2 - rootBox.top,
        })
      })
      const draft: Omit<Line, 'fanIndex' | 'fanCount' | 'lx' | 'ly'>[] = []
      for (const e of visibleEdges) {
        const from = anchors.get(e.fromId)
        const to = anchors.get(e.toId)
        if (!from || !to) continue
        const kind: EdgeKind =
          parents.get(e.toId) === e.fromId ? 'tree' : 'cascade'
        const fromHop = hopOf.get(e.fromId) ?? 0
        const toHop = hopOf.get(e.toId) ?? 0
        const sameColumn = fromHop === toHop
        /** Geriye giden cascade (örn. Notify→Checkout): sağdan çiz, yön net olsun */
        const sideRoute = kind === 'cascade' && (sameColumn || fromHop > toHop)

        if (sideRoute) {
          draft.push({
            key: `${e.fromId}->${e.toId}`,
            fromId: e.fromId,
            toId: e.toId,
            hop: e.hop,
            kind,
            sideRoute: true,
            x1: from.right + MARKER_GAP,
            y1: from.cy,
            x2: to.right + MARKER_GAP,
            y2: to.cy,
          })
        } else {
          draft.push({
            key: `${e.fromId}->${e.toId}`,
            fromId: e.fromId,
            toId: e.toId,
            hop: e.hop,
            kind,
            sideRoute: false,
            x1: from.right + (kind === 'cascade' ? MARKER_GAP : 4),
            y1: from.cy,
            x2: to.left - (kind === 'cascade' ? MARKER_GAP : 4),
            y2: to.cy,
          })
        }
      }

      const into = new Map<string, typeof draft>()
      const out = new Map<string, typeof draft>()
      for (const ln of draft) {
        const tin = into.get(ln.toId) ?? []
        tin.push(ln)
        into.set(ln.toId, tin)
        const tout = out.get(ln.fromId) ?? []
        tout.push(ln)
        out.set(ln.fromId, tout)
      }

      const next: Line[] = draft.map((ln) => {
        const intoList = into.get(ln.toId) ?? [ln]
        const outList = out.get(ln.fromId) ?? [ln]
        const bundle =
          ln.sideRoute || ln.kind === 'cascade'
            ? intoList.length >= outList.length
              ? intoList
              : outList
            : intoList.length > 1
              ? intoList
              : outList
        const fanIndex = Math.max(0, bundle.indexOf(ln))
        const fanCount = bundle.length
        const mid = (fanCount - 1) / 2
        const spread = (fanIndex - mid) * (ln.sideRoute ? 34 : 14)
        const bulge =
          Math.max(ln.x1, ln.x2) + 56 + fanIndex * 24 + Math.abs(spread) * 0.25
        return {
          ...ln,
          fanIndex,
          fanCount,
          lx: ln.sideRoute
            ? bulge + 12
            : ln.x1 + Math.max(24, (ln.x2 - ln.x1) * 0.4) + spread,
          ly: (ln.y1 + ln.y2) / 2 + spread * 0.15,
        }
      })
      setLines((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (p, i) =>
              p.key === next[i]!.key &&
              p.kind === next[i]!.kind &&
              p.x1 === next[i]!.x1 &&
              p.y1 === next[i]!.y1 &&
              p.x2 === next[i]!.x2 &&
              p.y2 === next[i]!.y2,
          )
        ) {
          return prev
        }
        return next
      })
    }

    measure()
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [center.id, visibleMaxHop, nodes, visibleEdges, parents, hopOf])

  const chipClass = (id: string, hop: number) => {
    const on = !pathIds || pathIds.has(id)
    const bridge = projectFilter && filter.bridgeIds.has(id)
    const match = projectFilter && filter.matchIds.has(id)
    return [
      'path-chip',
      hop === 0 ? 'center' : 'target',
      hop > 0 && `hop-${hop}`,
      bridge && 'bridge',
      match && 'match',
      dimmed && on && 'path-on',
      dimmed && !on && 'path-off',
    ]
      .filter(Boolean)
      .join(' ')
  }

  const renderChip = (id: string, hop: number, label: string, meta: string) => {
    const viaId = hop > 0 ? parents.get(id) : undefined
    const viaName = viaId ? nameById.get(viaId) : undefined
    const cascades = (cascadeInto.get(id) ?? [])
      .map((fid) => nameById.get(fid))
      .filter(Boolean) as string[]
    const bridge = projectFilter && filter.bridgeIds.has(id)
    const match = projectFilter && filter.matchIds.has(id)
    return (
      <button
        type="button"
        data-node-id={id}
        className={chipClass(id, hop)}
        title={
          hop === 0
            ? 'Seçimi bırak'
            : [
                bridge ? `Ara yol · ${filterLabel} için köprü` : '',
                match ? `${filterLabel} · eşleşen` : '',
                viaName ? `via ${viaName}` : '',
                cascades.length ? `cascade ← ${cascades.join(', ')}` : '',
              ]
                .filter(Boolean)
                .join(' · ') || undefined
        }
        onClick={() => (hop === 0 ? onClearCenter?.() : onPivot(id))}
        onMouseEnter={() => setFocusId(id)}
        onMouseLeave={() => setFocusId(null)}
      >
        <span className="path-chip-name">{label}</span>
        <span className="path-chip-meta">
          {bridge
            ? 'ara yol · filtre dışı'
            : match
              ? `eşleşen · ${filterLabel}`
              : meta}
        </span>
        {viaName && hop > 0 && (
          <span className="path-chip-via">via {viaName}</span>
        )}
      </button>
    )
  }

  return (
    <div className={`simple-path ${dimmed ? 'is-focusing' : ''}`}>
      <div className="path-layer-bar">
        <div className="path-layer-left">
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotBack}
            onClick={onPivotBack}
            title="Önceki pivot"
          >
            ← Geri
          </button>
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotForward}
            onClick={onPivotForward}
            title="Sonraki pivot"
          >
            İleri →
          </button>
          <span className="path-bar-sep" aria-hidden />
          <ImpactLegend cascadeCount={cascadeCount} truncated={truncated} />
        </div>
        <div className="path-layer-actions">
          <label className="path-filter">
            <span className="path-filter-label">Proje</span>
            <select
              className="path-filter-select"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              title="Etkilenen servisleri projeye göre filtrele"
            >
              <option value="">Tüm projeler</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <span className="path-bar-sep" aria-hidden />
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={!canCollapseLayer}
            onClick={() => setVisibleMaxHop((h) => Math.max(1, h - 1))}
            title="Bir katman daralt"
          >
            Katmanı daralt
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={!canExpandLayer}
            onClick={() =>
              setVisibleMaxHop((h) => Math.min(maxHopAvailable, h + 1))
            }
            title={
              nextHop ? `${nextHop}. katmanı aç` : 'Daha fazla katman yok'
            }
          >
            {canExpandLayer ? `${nextHop}. katmanı aç` : 'Katmanlar açık'}
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={!canExpandAll}
            onClick={() => setVisibleMaxHop(maxHopAvailable)}
            title="Tüm katmanları aç"
          >
            Bütün katmanları aç
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={!canCollapseAll}
            onClick={() => setVisibleMaxHop(1)}
            title="Yalnız 1. katman"
          >
            Hepsini daralt
          </button>
        </div>
      </div>
      {projectFilter && (
        <ProjectFilterHint
          filterLabel={filterLabel}
          matchCount={filter.matchCount}
          deepestHop={filter.deepestHop}
          bridgeCount={filter.bridgeIds.size}
          hop1EmptyButDeeper={filter.hop1EmptyButDeeper}
        />
      )}
      {truncated && reason && <p className="map-budget-hint">{reason}</p>}
      <div className="simple-path-body multi-hop">
        <div
          className={`path-stage ${cascadeCount > 0 ? 'has-cascade' : ''}`}
          ref={stageRef}
        >
          <svg className="path-edges" aria-hidden>
            <defs>
              <marker
                id={treeMarker}
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="9"
                markerHeight="9"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M2 1.5 L10 6 L2 10.5 Z" fill="#3d7a60" />
              </marker>
              <marker
                id={cascadeMarker}
                viewBox="0 0 12 12"
                refX="11"
                refY="6"
                markerWidth="12"
                markerHeight="12"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M1 1 L11 6 L1 11 Z" fill="#c4783a" />
              </marker>
            </defs>
            {lines.map((ln) => {
              const on =
                !pathIds ||
                ln.fromId === focusId ||
                ln.toId === focusId
              const d =
                ln.kind === 'cascade' && ln.sideRoute
                  ? cascadeSideArc(
                      ln.x1,
                      ln.y1,
                      ln.x2,
                      ln.y2,
                      ln.fanIndex,
                      ln.fanCount,
                    )
                  : elbowPath(
                      ln.x1,
                      ln.y1,
                      ln.x2,
                      ln.y2,
                      ln.fanIndex,
                      ln.fanCount,
                    )
              return (
                <path
                  key={ln.key}
                  d={d}
                  className={[
                    'path-edge',
                    ln.kind,
                    ln.hop === 1 ? 'direct' : 'indirect',
                    ln.sideRoute && 'same-col',
                    dimmed && on && 'on',
                    dimmed && !on && 'off',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  fill="none"
                  markerEnd={
                    ln.kind === 'cascade'
                      ? `url(#${cascadeMarker})`
                      : `url(#${treeMarker})`
                  }
                />
              )
            })}
          </svg>

          <div className="path-lane cols">
            <div className="path-col">
              <span className="path-col-label">Merkez</span>
              {renderChip(center.id, 0, center.name, 'seçili')}
            </div>

            <div className="path-col">
              <span className="path-col-label">1. Katman · doğrudan</span>
              {hop1.length === 0 ? (
                <span className="path-empty">
                  {projectFilter && filter.hop1EmptyButDeeper
                    ? 'Doğrudan yok · sağdaki ara yoldan devam →'
                    : projectFilter
                      ? `${filterLabel} yok`
                      : 'Etkilenen yok'}
                </span>
              ) : (
                <div className="path-targets wired">
                  {hop1.map(({ service }) => (
                    <div key={service.id} className="path-target-row">
                      {renderChip(
                        service.id,
                        1,
                        service.name,
                        service.owner
                          ? `Ekip · ${service.owner.team ?? '—'}`
                          : 'Owner atanmamış',
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {visibleLayerHops.map((hop) => (
              <div key={hop} className="path-col">
                <span className="path-col-label">{hop}. Katman · dolaylı</span>
                <div className={`path-targets wired hop-${hop}`}>
                  {(byHop.get(hop) ?? []).map(({ service }) => (
                    <div key={service.id} className="path-target-row">
                      {renderChip(
                        service.id,
                        hop,
                        service.name,
                        service.owner
                          ? `Ekip · ${service.owner.team ?? '—'}`
                          : 'Owner atanmamış',
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {canExpandLayer && (
              <div className="path-col">
                <span className="path-col-label">Sonraki</span>
                <button
                  type="button"
                  className="path-chip collapsed-path"
                  onClick={() =>
                    setVisibleMaxHop((h) => Math.min(maxHopAvailable, h + 1))
                  }
                >
                  <span className="path-chip-name">
                    {nextHop}. katmanı aç
                  </span>
                  <span className="path-chip-meta">
                    {(byHop.get(nextHop!) ?? []).length} servis
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
