import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  BaseEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  getBezierPath,
  getStraightPath,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { getDwhReportMapSummary, getDwhTableMapSummary } from './api'
import {
  applyRadialLayout,
  compactMapLabel,
  mapLabelNeedsTip,
  mapLayoutForDepth,
  mapLayoutForRadial,
  mapNodeSizeFor,
  mapNodeWidth,
  RADIAL_CENTER_HIT,
  RADIAL_CENTER_DOT_R,
  RADIAL_DOT_R,
  RADIAL_HIT,
  radialAnchorOffset,
  radialEdgeGeometry,
  radialHandlePair,
  radialLabelDomStyle,
  radialLabelSide,
  radialNodeHitStyle,
  radialSpokeEnds,
  wrapRadialName,
  type MapLayout,
  type MapLayoutMode,
  type RadialLabelSide,
} from '../impact/mapLayout'
import { MapCanvasBar, MapViewportSync, RadialLabelZoomSync } from './DwhMapChrome'
import type {
  DwhLineageEntityKind,
  DwhLineageGraph,
  DwhLineageNode,
  DwhLineageNodeKind,
  DwhMapNodeSummary,
} from './types'

type Props = {
  graph?: DwhLineageGraph
  loading?: boolean
  mapExpanded?: boolean
  active?: boolean
  onVisitBack?: () => void
  onVisitForward?: () => void
  canVisitBack?: boolean
  canVisitForward?: boolean
  onSelectTable: (tableId: number) => void
  onSelectReport: (reportId: number) => void
}

type DwhNodeData = {
  label: string
  fullLabel: string
  showTip: boolean
  size: MapLayout['size']
  sub: string
  entityKind?: DwhLineageEntityKind
  kind: 'center' | DwhLineageNodeKind | 'collapsed' | 'layerHeader'
  hop: number
  tableId?: number
  reportId?: number
  count?: number
  hiddenIds?: string[]
  radialDot?: boolean
  radialAngle?: number
  radialCx?: number
  radialCy?: number
  radialLabelSide?: RadialLabelSide
  radialLabelGapBoost?: number
  flowDirection?: 'horizontal' | 'vertical'
}

const LEFT_X = 40
const MAX_VISIBLE_PER_LAYER = 5
const RADIAL_VISIBLE_CAP = 10
const MIN_COLLAPSE_COUNT = 3
const DWH_MIN_ZOOM = 0.18
const EDGE_COLOR = '#2f6f55'
type DwhLayoutMode = MapLayoutMode | 'swimlane'
type DwhSwimlaneKey = 'LD' | 'TR' | 'EX' | 'KAYNAK' | 'DIGER'

const DWH_SWIMLANE_ORDER: DwhSwimlaneKey[] = ['LD', 'TR', 'EX', 'KAYNAK', 'DIGER']
const DWH_SWIMLANE_CONTROL_ORDER: DwhSwimlaneKey[] = ['LD', 'TR', 'EX', 'KAYNAK']
const DWH_SWIMLANE_LABELS: Record<DwhSwimlaneKey, string> = {
  LD: 'LD Katmanı',
  TR: 'TR Katmanı',
  EX: 'EX Katmanı',
  KAYNAK: 'Kaynak Sistem',
  DIGER: 'Diğer',
}
const DWH_SWIMLANE_HEADER_Y = 20
const DWH_SWIMLANE_NODE_Y = 92
const DWH_SWIMLANE_ROOT_X = 56
const DWH_SWIMLANE_ROOT_TO_LAYER_GAP = 124
const DWH_SWIMLANE_ROW_GAP = 60
const DWH_SWIMLANE_COL_GAP = 84
const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color: EDGE_COLOR,
} as const

type DwhEdgeData = {
  sourceEntityId?: string
  targetEntityId?: string
  statementIds?: number[]
  hop?: number
  fanIndex?: number
  fanCount?: number
  sameColumn?: boolean
  cx?: number
  cy?: number
  sx?: number
  sy?: number
  tx?: number
  ty?: number
  sr?: number
  tr?: number
}

type GraphNodeStats = {
  sourceDirect: number
  sourceIndirect: number
  sourceTotal: number
  targetDirect: number
  targetIndirect: number
  targetTotal: number
}

const EMPTY_GRAPH_STATS: GraphNodeStats = {
  sourceDirect: 0,
  sourceIndirect: 0,
  sourceTotal: 0,
  targetDirect: 0,
  targetIndirect: 0,
  targetTotal: 0,
}

function DwhFanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<DwhEdgeData>) {
  const fan = data?.fanIndex ?? 0
  const fanCount = Math.max(1, data?.fanCount ?? 1)
  const mid = (fanCount - 1) / 2
  const spread = (fan - mid) * 26
  const sameColumn = data?.sameColumn === true || Math.abs(sourceX - targetX) < 28

  let edgePath: string
  if (sameColumn) {
    const bulge = Math.max(sourceX, targetX) + 118 + fan * 38 + Math.abs(spread) * 0.45
    const y1 = sourceY + spread * 0.28
    const y2 = targetY + spread * 0.28
    edgePath = `M ${sourceX},${sourceY} C ${bulge},${y1} ${bulge},${y2} ${targetX},${targetY}`
  } else {
    const curvature = 0.52 + Math.abs(fan - mid) * 0.04
    const [path] = getBezierPath({
      sourceX,
      sourceY: sourceY + spread * 0.2,
      targetX,
      targetY: targetY + spread * 0.2,
      sourcePosition,
      targetPosition,
      curvature,
    })
    edgePath = path
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
      interactionWidth={28}
    />
  )
}

function DwhRadialEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps<DwhEdgeData>) {
  const cx = data?.cx
  const cy = data?.cy
  const geom = (() => {
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
      return {
        path,
        mx: (sourceX + targetX) / 2,
        my: (sourceY + targetY) / 2,
        angle: Math.atan2(targetY - sourceY, targetX - sourceX),
      }
    }
    const ends = radialSpokeEnds(
      cx,
      cy,
      {
        x: data?.sx ?? sourceX,
        y: data?.sy ?? sourceY,
        r: data?.sr ?? RADIAL_DOT_R,
      },
      {
        x: data?.tx ?? targetX,
        y: data?.ty ?? targetY,
        r: data?.tr ?? RADIAL_DOT_R,
      },
    )
    return radialEdgeGeometry(ends.sx, ends.sy, ends.tx, ends.ty, cx, cy)
  })()
  const fill = (style?.stroke as string) || '#6a645a'
  return (
    <>
      <BaseEdge id={id} path={geom.path} style={style} interactionWidth={28} />
      <polygon
        className="dd-radial-mid-arrow"
        points="-9,-7 16,0 -9,7 -2,0"
        fill={fill}
        transform={`translate(${geom.mx},${geom.my}) rotate(${(geom.angle * 180) / Math.PI})`}
        pointerEvents="none"
      />
    </>
  )
}

const DwhFanEdgeMemo = memo(DwhFanEdge)
const DwhRadialEdgeMemo = memo(DwhRadialEdge)

const DWH_EDGE_TYPES = {
  fan: DwhFanEdgeMemo,
  radial: DwhRadialEdgeMemo,
}

function DwhFlowNode({ data, xPos, yPos }: NodeProps<DwhNodeData>) {
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed'
  const isLayerHeader = data.kind === 'layerHeader'
  const radial = Boolean(data.radialDot)
  const verticalFlow = data.flowDirection === 'vertical'
  if (isLayerHeader) {
    return (
      <div className="dd-node dwh-map-node dwh-layer-header-node">
        <div className="dd-node-body">
          <span className="dd-node-label">{data.label}</span>
          <span className="dd-node-hop">{data.sub}</span>
        </div>
      </div>
    )
  }

  const liveAngle = (() => {
    if (!radial || isCenter) return data.radialAngle ?? 0
    if (typeof data.radialCx === 'number' && typeof data.radialCy === 'number') {
      const mid = radialAnchorOffset(false)
      return Math.atan2(yPos + mid.y - data.radialCy, xPos + mid.x - data.radialCx)
    }
    return data.radialAngle ?? 0
  })()
  const labelSide = radial
    ? data.radialLabelSide ?? radialLabelSide(liveAngle, isCenter)
    : null
  const label = (
    <span
      className={`dd-node-label${data.showTip ? ' name-tip is-short' : ''}`}
      data-tip={data.showTip ? data.fullLabel : undefined}
    >
      {data.label}
    </span>
  )
  const radialHit = radial
    ? { ...radialNodeHitStyle(isCenter), position: 'relative' as const, overflow: 'visible' as const }
    : undefined
  const hopLine =
    radial && !isCenter && !isCollapsed
      ? `${data.hop}. katman`
      : radial && isCollapsed
        ? `Aç · ${data.count ?? 0} node daha`
        : null
  const radialLabelStyle =
    radial && labelSide
      ? radialLabelDomStyle(
          labelSide,
          data.fullLabel || data.label,
          isCenter,
          hopLine,
          data.radialLabelGapBoost ?? 0,
          data.hop ?? 1,
        )
      : undefined

  return (
    <div
      className={[
        'dd-node dwh-map-node',
        `size-${data.size}`,
        isCenter && 'center',
        isCollapsed && 'collapsed',
        data.kind !== 'center' && `kind-${data.kind}`,
        radial && 'radial-dot',
      ]
        .filter(Boolean)
        .join(' ')}
      style={radial ? { width: 'auto', height: 'auto', overflow: 'visible' } : undefined}
    >
      <Handle type="target" position={verticalFlow ? Position.Top : Position.Left} id="in" className="dd-handle" />
      <span className="dd-node-ring" aria-hidden />
      <div className="dd-node-body">
        {!radial && (
          <>
            {label}
            <span className="dd-node-hop">{isCollapsed ? `Aç · ${data.count} node daha` : data.sub}</span>
            {!isCenter && !isCollapsed ? (
              <span className="dd-node-hop">{data.hop}. katman</span>
            ) : null}
          </>
        )}
      </div>
      {radial ? (
        <span className="dd-radial-shell" style={radialHit}>
          <span className={`dd-radial-core${isCenter ? ' is-center' : ''}`} aria-hidden />
          {isCenter ? (
            <span
              className="dd-radial-label is-center-label"
              style={radialLabelDomStyle('below', data.fullLabel || data.label, true, 'Merkez')}
            >
              <span className="dd-radial-kicker is-center-badge">Merkez</span>
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          ) : (
            <span
              className={['dd-radial-label', data.showTip && 'name-tip is-short']
                .filter(Boolean)
                .join(' ')}
              style={radialLabelStyle}
              data-tip={data.showTip ? data.fullLabel : undefined}
            >
              {hopLine ? <span className="dd-radial-hop">{hopLine}</span> : null}
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          )}
        </span>
      ) : null}
      <Handle type="source" position={verticalFlow ? Position.Bottom : Position.Right} id="out" className="dd-handle" />
    </div>
  )
}

const DwhFlowNodeMemo = memo(DwhFlowNode)

const DWH_NODE_TYPES = {
  dwhNode: DwhFlowNodeMemo,
}

function entityLabel(kind?: DwhLineageEntityKind) {
  if (kind === 'table') return 'Tablo'
  if (kind === 'report') return 'Rapor'
  if (kind === 'subquery') return 'Alt sorgu'
  return 'Node'
}

function countReachableTables(
  graph: DwhLineageGraph,
  startId: string,
  direction: 'source' | 'target',
) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const visitedNodes = new Set<string>([startId])
  const tableLevels = new Map<string, number>()
  const queue: { id: string; level: number }[] = [{ id: startId, level: 0 }]

  while (queue.length) {
    const current = queue.shift()
    if (!current) break
    const nextIds = graph.edges
      .filter((edge) =>
        direction === 'source'
          ? edge.target === current.id
          : edge.source === current.id,
      )
      .map((edge) => (direction === 'source' ? edge.source : edge.target))

    for (const nextId of nextIds) {
      if (visitedNodes.has(nextId)) continue
      visitedNodes.add(nextId)
      const level = current.level + 1
      const node = nodeById.get(nextId)
      if (node?.entityKind === 'table') {
        const previous = tableLevels.get(node.entityKey)
        if (previous === undefined || level < previous) tableLevels.set(node.entityKey, level)
      }
      queue.push({ id: nextId, level })
    }
  }

  const levels = Array.from(tableLevels.values())
  return {
    direct: levels.filter((level) => level === 1).length,
    indirect: levels.filter((level) => level > 1).length,
    total: levels.length,
  }
}

function graphStatsForNode(graph: DwhLineageGraph, nodeId: string): GraphNodeStats {
  const source = countReachableTables(graph, nodeId, 'source')
  const target = countReachableTables(graph, nodeId, 'target')
  return {
    sourceDirect: source.direct,
    sourceIndirect: source.indirect,
    sourceTotal: source.total,
    targetDirect: target.direct,
    targetIndirect: target.indirect,
    targetTotal: target.total,
  }
}

function DwhDrawerMetric({
  label,
  direct,
  indirect,
  total,
}: {
  label: string
  direct: number
  indirect: number
  total: number
}) {
  return (
    <div className="dwh-map-drawer-row">
      <span>{label}</span>
      <strong>{total}</strong>
      <small>{direct} doğrudan · {indirect} dolaylı</small>
    </div>
  )
}

function DwhMapInfoDrawer({
  open,
  node,
  summary,
  graphStats,
  loading,
  error,
  onOpenChange,
}: {
  open: boolean
  node?: DwhLineageNode
  summary?: DwhMapNodeSummary
  graphStats: GraphNodeStats
  loading: boolean
  error?: string | null
  onOpenChange: (open: boolean) => void
}) {
  const source = summary?.sourceTables ?? {
    direct: graphStats.sourceDirect,
    indirect: graphStats.sourceIndirect,
    total: graphStats.sourceTotal,
  }
  const target = summary?.targetTables ?? {
    direct: graphStats.targetDirect,
    indirect: graphStats.targetIndirect,
    total: graphStats.targetTotal,
  }
  const reports = summary?.affectedReports ?? { direct: 0, indirect: 0, total: 0 }
  return (
    <aside className={`dwh-map-info-drawer${open ? '' : ' is-collapsed'}`} aria-label="DWH node özeti">
      <div className="dwh-map-info-drawer-head">
        <h4 className="dwh-map-info-drawer-title">Node özeti</h4>
        <button
          type="button"
          className={`nav-toggle dwh-map-info-toggle${open ? ' is-open' : ''}`}
          title={open ? 'Özeti daralt' : 'Node özetini göster'}
          aria-label={open ? 'Node özetini daralt' : 'Node özetini göster'}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={`dwh-map-info-chevron${open ? '' : ' is-collapsed'}`}>
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {open ? <span className="dwh-map-info-toggle-label">Daralt</span> : null}
        </button>
      </div>
      <div className={`dwh-map-info-drawer-body${open ? '' : ' is-collapsed'}`}>
        <div className="dwh-map-info-drawer-scroll" onWheel={(event) => event.stopPropagation()}>
          {!node ? (
            <div className="dwh-map-drawer-empty">Özet için haritada bir node seçin.</div>
          ) : (
            <>
              <section className="dwh-map-info-section dwh-map-info-identity">
                <span className={`dwh-map-kind-badge kind-${node.entityKind}`}>{entityLabel(node.entityKind)}</span>
                <strong className="dwh-map-info-node-name" title={node.label}>
                  {node.label}
                </strong>
                <span className="dwh-map-info-node-meta">
                  {node.subtitle || node.layer || `${node.depth}. katman`}
                </span>
              </section>

              {loading ? (
                <div className="dwh-map-drawer-note">Özet hesaplanıyor...</div>
              ) : null}
              {error ? (
                <div className="dwh-map-drawer-note is-error">{error}</div>
              ) : null}

              <section className="dwh-map-info-section">
                <h5>Tablo etkisi</h5>
                <DwhDrawerMetric
                  label="Etkilendiği tablolar"
                  direct={source.direct}
                  indirect={source.indirect}
                  total={source.total}
                />
                <DwhDrawerMetric
                  label="Etkilediği tablolar"
                  direct={target.direct}
                  indirect={target.indirect}
                  total={target.total}
                />
              </section>

              {node.entityKind === 'table' ? (
                <section className="dwh-map-info-section">
                  <h5>Rapor etkisi</h5>
                  <DwhDrawerMetric
                    label="Etkilenen raporlar"
                    direct={reports.direct}
                    indirect={reports.indirect}
                    total={reports.total}
                  />
                </section>
              ) : null}

              <section className="dwh-map-info-section">
                <h5>Grafikteki konum</h5>
                <dl className="dwh-map-info-facts">
                  <div>
                    <dt>Katman</dt>
                    <dd>{node.depth}</dd>
                  </div>
                  <div>
                    <dt>Tip</dt>
                    <dd>{node.kind === node.entityKind ? entityLabel(node.entityKind) : node.kind}</dd>
                  </div>
                  {summary?.maxSourceDepth ? (
                    <div>
                      <dt>Kaynak derinliği</dt>
                      <dd>{summary.maxSourceDepth}</dd>
                    </div>
                  ) : null}
                  {summary?.maxTargetDepth ? (
                    <div>
                      <dt>Etki derinliği</dt>
                      <dd>{summary.maxTargetDepth}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function splitLayer(
  all: DwhLineageNode[],
  expanded: boolean,
  layoutMode: DwhLayoutMode,
) {
  if (layoutMode === 'swimlane') return { visible: all, hidden: [] as DwhLineageNode[] }
  if (expanded) return { visible: all, hidden: [] as DwhLineageNode[] }
  const cap = layoutMode === 'radial' ? RADIAL_VISIBLE_CAP : MAX_VISIBLE_PER_LAYER
  const hidden = all.length > cap ? all.slice(cap) : []
  if (hidden.length < MIN_COLLAPSE_COUNT) return { visible: all, hidden: [] as DwhLineageNode[] }
  return { visible: all.slice(0, cap), hidden }
}

function nodeSubLabel(node: DwhLineageNode) {
  if (node.kind === 'cycle') return node.entityKind === 'table' ? 'Döngü tablo' : 'Döngü'
  if (node.kind === 'reference') return node.entityKind === 'table' ? 'Referans tablo' : 'Referans'
  if (node.kind === 'table') return node.subtitle ?? node.layer ?? 'Tablo'
  if (node.kind === 'report') return node.subtitle ?? 'Rapor'
  return node.subtitle ?? 'Alt sorgu'
}

function rootSubLabel(graph: DwhLineageGraph) {
  return graph.rootKind === 'report' ? 'Rapor' : 'Tablo'
}

function normalizeDwhLayer(node?: DwhLineageNode): DwhSwimlaneKey {
  if (!node) return 'DIGER'
  const raw = (node.layer || node.subtitle || '').trim().toLocaleUpperCase('tr-TR')
  if (raw === 'LD') return 'LD'
  if (raw === 'TR') return 'TR'
  if (raw === 'EX') return 'EX'
  if (raw === 'KAYNAK' || raw === 'SOURCE') return 'KAYNAK'
  return 'DIGER'
}

function swimlaneKeysForGraph(graph?: DwhLineageGraph): DwhSwimlaneKey[] {
  if (!graph) return ['LD']
  const present = new Set<DwhSwimlaneKey>()
  for (const node of graph.nodes) {
    if (node.id === graph.rootId || node.entityKind === 'subquery') continue
    present.add(normalizeDwhLayer(node))
  }
  const primary = DWH_SWIMLANE_CONTROL_ORDER.filter((key) => present.has(key))
  if (primary.length) return primary
  return present.has('DIGER') ? ['DIGER'] : ['LD']
}

function applyDwhSwimlaneLayout(
  nodes: Node<DwhNodeData>[],
  graph: DwhLineageGraph,
  layout: MapLayout,
): Node<DwhNodeData>[] {
  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const nodeW = Math.max(layout.nodeW, 220)
  const rootNode = nodes.find((node) => node.id === graph.rootId)
  const rootW = typeof rootNode?.style?.width === 'number' ? rootNode.style.width : mapNodeWidth('lg')
  const firstLayerX = DWH_SWIMLANE_ROOT_X + rootW + DWH_SWIMLANE_ROOT_TO_LAYER_GAP
  const colPitch = nodeW + DWH_SWIMLANE_COL_GAP
  const rowPitch = Math.max(DWH_SWIMLANE_ROW_GAP, Math.round(layout.rowGap * 0.92))
  const nonRoot = nodes.filter((node) => {
    const graphNode = graphNodeById.get(node.id)
    return (
      node.id !== graph.rootId &&
      node.data.kind !== 'layerHeader' &&
      graphNode?.entityKind !== 'subquery'
    )
  })
  const grouped = new Map<DwhSwimlaneKey, Node<DwhNodeData>[]>()

  for (const node of nonRoot) {
    const key = normalizeDwhLayer(graphNodeById.get(node.id))
    const list = grouped.get(key) ?? []
    list.push(node)
    grouped.set(key, list)
  }

  const usedKeys = DWH_SWIMLANE_ORDER.filter((key) => grouped.has(key))
  const positioned: Node<DwhNodeData>[] = []

  for (const node of nodes) {
    if (node.id !== graph.rootId) continue
    positioned.push({
      ...node,
      position: { x: DWH_SWIMLANE_ROOT_X, y: DWH_SWIMLANE_NODE_Y },
      data: { ...node.data, flowDirection: 'horizontal' },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    })
  }

  usedKeys.forEach((key, laneIndex) => {
    const x = firstLayerX + laneIndex * colPitch
    const laneNodes = [...(grouped.get(key) ?? [])].sort((a, b) => {
      const depthDiff = (a.data.hop ?? 0) - (b.data.hop ?? 0)
      return depthDiff || a.data.fullLabel.localeCompare(b.data.fullLabel, 'tr')
    })
    positioned.push({
      id: `dwh-swimlane-header-${key}`,
      type: 'dwhNode',
      position: { x, y: DWH_SWIMLANE_HEADER_Y },
      data: {
        label: DWH_SWIMLANE_LABELS[key],
        fullLabel: DWH_SWIMLANE_LABELS[key],
        showTip: false,
        size: 'sm',
        sub: `${laneNodes.length} kayıt`,
        kind: 'layerHeader',
        hop: 0,
      },
      style: { width: nodeW },
      draggable: false,
      selectable: false,
    })
    laneNodes.forEach((node, rowIndex) => {
      positioned.push({
        ...node,
        position: { x, y: DWH_SWIMLANE_NODE_Y + rowIndex * rowPitch },
        data: {
          ...node.data,
          label: compactMapLabel(node.data.fullLabel || node.data.label, 60),
          showTip: mapLabelNeedsTip(node.data.fullLabel || node.data.label, 60),
          size: 'sm',
          flowDirection: 'horizontal',
        },
        style: { ...node.style, width: nodeW },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })
    })
  })

  return positioned
}

function buildDwhSwimlaneEdges(
  graph: DwhLineageGraph,
  positionedNodes: Node<DwhNodeData>[],
): Edge[] {
  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const visibleIds = new Set(
    positionedNodes
      .filter((node) => node.data.kind !== 'layerHeader')
      .map((node) => node.id),
  )
  const childrenByParent = new Map<string, DwhLineageGraph['edges']>()

  for (const edge of graph.edges) {
    const parentExists = graphNodeById.has(edge.target)
    const childHop = graphNodeById.get(edge.source)?.depth
    if (!parentExists || childHop === undefined) continue
    const list = childrenByParent.get(edge.target) ?? []
    list.push(edge)
    childrenByParent.set(edge.target, list)
  }

  const edges: Edge[] = []
  const seen = new Set<string>()

  for (const sourceId of visibleIds) {
    const sourceNode = graphNodeById.get(sourceId)
    if (!sourceNode || sourceNode.entityKind === 'subquery') continue
    const queue = [...(childrenByParent.get(sourceId) ?? [])]
    const visited = new Set<string>()

    while (queue.length) {
      const edge = queue.shift()
      if (!edge || visited.has(edge.source)) continue
      visited.add(edge.source)
      const childNode = graphNodeById.get(edge.source)
      if (!childNode) continue

      if (visibleIds.has(edge.source) && childNode.entityKind !== 'subquery') {
        const id = `${sourceId}->${edge.source}`
        if (sourceId === edge.source || seen.has(id)) continue
        seen.add(id)
        const direct = childNode.depth <= sourceNode.depth + 1
        const kind = edge.kind === 'subquery' ? 'statement' : edge.kind
        edges.push({
          id,
          source: sourceId,
          target: edge.source,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'fan',
          className: [
            'dd-edge dwh-edge',
            kind === 'reportSql' && 'report-link',
            direct ? 'direct' : 'indirect',
          ]
            .filter(Boolean)
            .join(' '),
          markerEnd: EDGE_MARKER,
          style: {
            stroke:
              kind === 'reportSql'
                ? '#60438b'
                : direct
                  ? EDGE_COLOR
                  : '#8a847a',
            strokeWidth: direct ? 2.4 : 1.7,
            strokeDasharray: direct ? undefined : '6 5',
          },
          data: {
            sourceEntityId: edge.source,
            targetEntityId: sourceId,
            statementIds: edge.statementIds,
            hop: childNode.depth,
          },
        })
        continue
      }

      queue.push(...(childrenByParent.get(edge.source) ?? []))
    }
  }

  return edges
}

function buildDwhMap(
  graph: DwhLineageGraph,
  expandedLayers: Set<number>,
  visibleMaxHop: number,
  visibleSwimlaneKeys: DwhSwimlaneKey[],
  layout: MapLayout,
  layoutMode: DwhLayoutMode,
): { nodes: Node<DwhNodeData>[]; edges: Edge[]; hops: number[] } {
  const { nodeW, colGap, rowGap, tipChars } = layout
  const colPitch = nodeW + colGap
  const root = graph.nodes.find((node) => node.id === graph.rootId) ?? graph.nodes[0]
  if (!root) return { nodes: [], edges: [], hops: [] }

  const byHop = new Map<number, DwhLineageNode[]>()
  for (const node of graph.nodes) {
    if (node.id === graph.rootId) continue
    if (layoutMode === 'swimlane') {
      if (node.entityKind === 'subquery') continue
      if (!visibleSwimlaneKeys.includes(normalizeDwhLayer(node))) continue
    }
    const hop = Math.max(1, node.depth)
    const list = byHop.get(hop) ?? []
    list.push(node)
    byHop.set(hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)
  const visibleByHop = new Map<number, DwhLineageNode[]>()
  const collapsedMeta = new Map<number, DwhLineageNode[]>()

  for (const hop of hops) {
    if (layoutMode !== 'swimlane' && hop > visibleMaxHop) continue
    const sorted = [...(byHop.get(hop) ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'tr'))
    const { visible, hidden } = splitLayer(sorted, expandedLayers.has(hop), layoutMode)
    visibleByHop.set(hop, visible)
    if (hidden.length) collapsedMeta.set(hop, hidden)
  }

  let rowCount = 1
  for (const hop of hops) {
    const visible = visibleByHop.get(hop)?.length ?? 0
    const extra = collapsedMeta.has(hop) ? 1 : 0
    rowCount = Math.max(rowCount, visible + extra)
  }

  const rootSize = layoutMode === 'radial' ? 'md' : mapNodeSizeFor('center', 0, visibleMaxHop)
  const rootW = layoutMode === 'radial' ? 48 : mapNodeWidth(rootSize)
  const nodes: Node<DwhNodeData>[] = [
    {
      id: root.id,
      type: 'dwhNode',
      position: {
        x: LEFT_X,
        y: 40 + ((rowCount - 1) * rowGap) / 2,
      },
      data: {
        label: root.label,
        fullLabel: root.label,
        showTip: mapLabelNeedsTip(root.label, tipChars),
        size: rootSize,
        sub: root.subtitle ?? rootSubLabel(graph),
        entityKind: root.entityKind,
        kind: 'center',
        hop: 0,
        tableId: root.tableId,
        reportId: root.reportId,
      },
      style: { width: rootW },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  const visibleIds = new Set<string>([root.id])

  for (const hop of hops) {
    if (layoutMode !== 'swimlane' && hop > visibleMaxHop) continue
    const visible = visibleByHop.get(hop) ?? []
    visible.forEach((node, i) => {
      if (layoutMode === 'swimlane' && node.entityKind === 'subquery') return
      visibleIds.add(node.id)
      const size = layoutMode === 'radial' ? 'md' : mapNodeSizeFor('service', hop, visibleMaxHop)
      const w = layoutMode === 'radial' ? layout.nodeW : mapNodeWidth(size)
      nodes.push({
        id: node.id,
        type: 'dwhNode',
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + i * rowGap,
        },
        data: {
          label: compactMapLabel(node.label, layoutMode === 'radial' ? 28 : 72),
          fullLabel: node.label,
          showTip: mapLabelNeedsTip(node.label, layoutMode === 'radial' ? 28 : tipChars),
          size,
          sub: nodeSubLabel(node),
          entityKind: node.entityKind,
          kind: node.kind,
          hop,
          tableId: node.tableId,
          reportId: node.reportId,
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    })

    const hidden = collapsedMeta.get(hop)
    if (hidden?.length) {
      const collapseId = `dwh-collapsed-hop-${hop}`
      const label = `+${hidden.length} node daha`
      const size = layoutMode === 'radial' ? 'md' : mapNodeSizeFor('collapsed', hop, visibleMaxHop)
      const w = layoutMode === 'radial' ? Math.round(layout.nodeW * 0.88) : mapNodeWidth(size)
      nodes.push({
        id: collapseId,
        type: 'dwhNode',
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + visible.length * rowGap,
        },
        data: {
          label,
          fullLabel: label,
          showTip: false,
          size,
          sub: `${hop}. katman`,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((node) => node.id),
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    }
  }

  const nodeDepth = new Map(graph.nodes.map((node) => [node.id, node.depth]))
  const finalEdges: Edge[] = []
  const seen = new Set<string>()
  const treeParent = new Map<string, string>()

  for (const edge of graph.edges) {
    const parentId = edge.target
    const childId = edge.source
    const childHop = nodeDepth.get(childId)
    const parentHop = nodeDepth.get(parentId)
    if (childHop === undefined || parentHop === undefined || childHop > visibleMaxHop) continue

    let visualSource = parentId
    let visualTarget = childId

    if (!visibleIds.has(visualTarget)) {
      const collapsedId = `dwh-collapsed-hop-${childHop}`
      if (!nodes.some((node) => node.id === collapsedId)) continue
      visualTarget = collapsedId
    }
    if (!visibleIds.has(visualSource)) {
      const collapsedId = `dwh-collapsed-hop-${parentHop}`
      if (!nodes.some((node) => node.id === collapsedId)) continue
      visualSource = collapsedId
    }
    if (!nodes.some((node) => node.id === visualSource) || !nodes.some((node) => node.id === visualTarget)) continue

    const id = `${visualSource}->${visualTarget}`
    if (seen.has(id)) continue
    seen.add(id)
    treeParent.set(visualTarget, visualSource)
    const radialTree = layoutMode === 'radial'
    finalEdges.push({
      id,
      source: visualSource,
      target: visualTarget,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: radialTree ? 'radial' : 'fan',
      className: [
        'dd-edge dwh-edge',
        radialTree && 'radial-link',
        edge.kind === 'reportSql' && 'report-link',
        edge.kind === 'subquery' && 'subquery-link',
        childHop === 1 ? 'direct' : 'indirect',
      ]
        .filter(Boolean)
        .join(' '),
      markerEnd: radialTree
        ? {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: '#6a645a',
          }
        : EDGE_MARKER,
      style: {
        stroke: radialTree
          ? '#6a645a'
          : edge.kind === 'reportSql'
            ? '#60438b'
            : childHop === 1
              ? EDGE_COLOR
              : '#8a847a',
        strokeWidth: radialTree ? 2 : childHop === 1 ? 2.4 : 1.7,
        strokeDasharray: radialTree
          ? undefined
          : edge.kind === 'subquery'
            ? '5 4'
            : childHop === 1
              ? undefined
              : '6 5',
        opacity: radialTree ? 0.55 : undefined,
        fill: radialTree ? 'none' : undefined,
      },
      data: {
        sourceEntityId: edge.source,
        targetEntityId: edge.target,
        statementIds: edge.statementIds,
        hop: childHop,
      },
    })
  }

  const positioned =
    layoutMode === 'radial'
      ? applyRadialLayout(nodes, layout, {
          centerId: root.id,
          centerWidth: rootW,
          treeParent,
        }).nodes
      : layoutMode === 'swimlane'
        ? applyDwhSwimlaneLayout(nodes, graph, layout)
        : nodes

  let edges = layoutMode === 'swimlane'
    ? buildDwhSwimlaneEdges(graph, positioned)
    : finalEdges

  if (layoutMode === 'radial') {
    const posOf = new Map(positioned.filter((node) => node.type === 'dwhNode').map((node) => [node.id, node]))
    edges = finalEdges.map((edge) => {
      const source = posOf.get(edge.source)
      const target = posOf.get(edge.target)
      if (!source || !target) return edge
      const sourceCenter = (source.data as DwhNodeData).kind === 'center'
      const targetCenter = (target.data as DwhNodeData).kind === 'center'
      const sourceMid = radialAnchorOffset(sourceCenter)
      const targetMid = radialAnchorOffset(targetCenter)
      const handles = radialHandlePair(
        {
          x: source.position.x,
          y: source.position.y,
          w: sourceCenter ? RADIAL_CENTER_HIT : RADIAL_HIT,
          h: sourceCenter ? RADIAL_CENTER_HIT : RADIAL_HIT,
        },
        {
          x: target.position.x,
          y: target.position.y,
          w: targetCenter ? RADIAL_CENTER_HIT : RADIAL_HIT,
          h: targetCenter ? RADIAL_CENTER_HIT : RADIAL_HIT,
        },
      )
      return {
        ...edge,
        ...handles,
        type: 'radial',
        data: {
          ...(edge.data as DwhEdgeData),
          cx: (source.data as DwhNodeData).radialCx ?? (target.data as DwhNodeData).radialCx,
          cy: (source.data as DwhNodeData).radialCy ?? (target.data as DwhNodeData).radialCy,
          sx: source.position.x + sourceMid.x,
          sy: source.position.y + sourceMid.y,
          tx: target.position.x + targetMid.x,
          ty: target.position.y + targetMid.y,
          sr: sourceCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R,
          tr: targetCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R,
        },
      }
    })
  }

  return { nodes: positioned, edges, hops }
}

function maxHop(graph?: DwhLineageGraph) {
  if (!graph) return 1
  return Math.max(1, ...graph.nodes.map((node) => node.depth))
}

function DwhLineageMapInner({
  graph,
  loading,
  mapExpanded = false,
  active = true,
  onVisitBack,
  onVisitForward,
  canVisitBack = false,
  canVisitForward = false,
  onSelectTable,
  onSelectReport,
}: Props) {
  const graphMaxHop = useMemo(() => maxHop(graph), [graph])
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set())
  const [visibleMaxHop, setVisibleMaxHop] = useState(1)
  const [visibleSwimlaneCount, setVisibleSwimlaneCount] = useState(1)
  const [layoutMode, setLayoutMode] = useState<DwhLayoutMode>('ltr')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(graph?.rootId ?? null)
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [nodeSummary, setNodeSummary] = useState<DwhMapNodeSummary>()
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [tidyNonce, setTidyNonce] = useState(0)
  const [viewportSyncKey, setViewportSyncKey] = useState(0)
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 })
  const mapRef = useRef<HTMLDivElement>(null)
  const nodeDragged = useRef(false)
  const layoutDirtyRef = useRef(false)
  const lastTidyRef = useRef(0)
  const layoutEpochRef = useRef('')
  const prevRootRef = useRef(graph?.rootId ?? '')
  const rfInstance = useRef<ReactFlowInstance | null>(null)

  useEffect(() => {
    const root = document.documentElement
    if (!active || !graph) {
      root.classList.remove('dwh-map-drawer-open', 'dwh-map-drawer-collapsed')
      return
    }
    root.classList.toggle('dwh-map-drawer-open', infoPanelOpen)
    root.classList.toggle('dwh-map-drawer-collapsed', !infoPanelOpen)
    return () => {
      root.classList.remove('dwh-map-drawer-open', 'dwh-map-drawer-collapsed')
    }
  }, [active, graph, infoPanelOpen])

  useEffect(() => {
    setVisibleMaxHop(1)
    setVisibleSwimlaneCount(1)
    setExpandedLayers(new Set())
    setFocusId(null)
    setInspectedNodeId(graph?.rootId ?? null)
    setInfoPanelOpen(true)
    layoutDirtyRef.current = false
  }, [graph?.rootId])

  const inspectedNode = useMemo(
    () => {
      if (!graph) return undefined
      const hoverNode = focusId
        ? graph.nodes.find((node) => node.id === focusId)
        : undefined
      return hoverNode ?? graph.nodes.find((node) => node.id === inspectedNodeId)
    },
    [focusId, graph, inspectedNodeId],
  )
  const inspectedNodeRenderId = inspectedNode?.id ?? null

  const graphNodeStats = useMemo(
    () =>
      graph && inspectedNode
        ? graphStatsForNode(graph, inspectedNode.id)
        : EMPTY_GRAPH_STATS,
    [graph, inspectedNode],
  )

  const flowLayoutMode: MapLayoutMode = layoutMode === 'swimlane' ? 'ltr' : layoutMode
  const swimlaneKeys = useMemo(() => swimlaneKeysForGraph(graph), [graph])
  const swimlaneMaxLayer = Math.max(1, swimlaneKeys.length)
  const visibleSwimlaneKeys = useMemo(
    () => swimlaneKeys.slice(0, Math.min(visibleSwimlaneCount, swimlaneMaxLayer)),
    [swimlaneKeys, swimlaneMaxLayer, visibleSwimlaneCount],
  )
  const visibleControlLayer = layoutMode === 'swimlane' ? Math.min(visibleSwimlaneCount, swimlaneMaxLayer) : visibleMaxHop

  useEffect(() => {
    setVisibleSwimlaneCount((count) => Math.min(Math.max(1, count), swimlaneMaxLayer))
  }, [swimlaneMaxLayer])

  const layout = useMemo(
    () => {
      const baseLayout = layoutMode === 'radial' ? mapLayoutForRadial() : mapLayoutForDepth(visibleControlLayer)
      return { ...baseLayout, minZoom: Math.min(baseLayout.minZoom, DWH_MIN_ZOOM) }
    },
    [layoutMode, visibleControlLayer],
  )

  const built = useMemo(
    () =>
      graph
        ? buildDwhMap(graph, expandedLayers, visibleMaxHop, visibleSwimlaneKeys, layout, layoutMode)
        : { nodes: [] as Node<DwhNodeData>[], edges: [] as Edge[], hops: [] as number[] },
    [graph, expandedLayers, layout, layoutMode, visibleMaxHop, visibleSwimlaneKeys],
  )

  const builtNodeSig = useMemo(
    () =>
      built.nodes
        .filter((node) => node.type === 'dwhNode')
        .map((node) => `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}`)
        .join('|'),
    [built.nodes],
  )

  useLayoutEffect(() => {
    if (!active) return
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setViewportSyncKey((key) => key + 1))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [
    active,
    builtNodeSig,
    visibleControlLayer,
    layout.size,
    graph?.rootId,
    tidyNonce,
    mapExpanded,
    mapSize.width,
    mapSize.height,
    infoPanelOpen,
  ])

  useEffect(() => {
    if (!active || !inspectedNode) {
      setNodeSummary(undefined)
      setSummaryLoading(false)
      setSummaryError(null)
      return
    }

    if (inspectedNode.entityKind === 'subquery') {
      setNodeSummary(undefined)
      setSummaryLoading(false)
      setSummaryError(null)
      return
    }

    let alive = true
    setNodeSummary(undefined)
    setSummaryLoading(true)
    setSummaryError(null)
    const request =
      inspectedNode.entityKind === 'table' && inspectedNode.tableId
        ? getDwhTableMapSummary(inspectedNode.tableId)
        : inspectedNode.entityKind === 'report' && inspectedNode.reportId
          ? getDwhReportMapSummary(inspectedNode.reportId)
          : undefined

    if (!request) {
      setNodeSummary(undefined)
      setSummaryLoading(false)
      return
    }

    request
      .then((summary) => {
        if (!alive) return
        setNodeSummary(summary)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setNodeSummary(undefined)
        setSummaryError(error instanceof Error ? error.message : 'Özet alınamadı')
      })
      .finally(() => {
        if (!alive) return
        setSummaryLoading(false)
      })

    return () => {
      alive = false
    }
  }, [active, inspectedNode])

  useLayoutEffect(() => {
    if (!active) {
      setMapSize({ width: 0, height: 0 })
      return
    }
    const root = mapRef.current
    if (!root) return
    let raf = 0
    const measure = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect()
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        setMapSize((current) =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        )
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [active, graph?.rootId, loading, mapExpanded])

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  useEffect(() => {
    const rootChanged = prevRootRef.current !== (graph?.rootId ?? '')
    prevRootRef.current = graph?.rootId ?? ''
    const layoutEpoch = `${layoutMode}:${visibleControlLayer}:${layout.size}:${mapExpanded}`
    const epochChanged = layoutEpochRef.current !== layoutEpoch
    layoutEpochRef.current = layoutEpoch
    const resetLayout = tidyNonce !== lastTidyRef.current || rootChanged || epochChanged
    lastTidyRef.current = tidyNonce
    setNodes((current) => {
      const posById = new Map(current.map((node) => [node.id, node.position]))
      return built.nodes.map((node) => ({
        ...node,
        position: resetLayout ? node.position : (posById.get(node.id) ?? node.position),
      }))
    })
    setEdges(built.edges)
  }, [
    built,
    graph?.rootId,
    layout.size,
    layoutMode,
    mapExpanded,
    setEdges,
    setNodes,
    tidyNonce,
    visibleControlLayer,
    visibleMaxHop,
  ])

  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const active = Boolean(focusId)
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.remove('rf-path-on', 'rf-path-off', 'rf-path-focus')
      el.classList.toggle('dwh-node-inspected', id === inspectedNodeRenderId)
      if (!active) return
      const on =
        id === focusId ||
        edges.some(
          (edge) =>
            (edge.source === focusId || edge.target === focusId) &&
            (edge.source === id || edge.target === id),
        )
      el.classList.add(on ? 'rf-path-on' : 'rf-path-off')
      if (id === focusId) el.classList.add('rf-path-focus')
    })
    root.querySelectorAll<HTMLElement>('.react-flow__edge').forEach((el) => {
      el.classList.remove('dd-edge-on', 'dd-edge-off')
      if (!active) return
      const edgeId =
        el.getAttribute('data-testid')?.replace(/^rf__edge-/, '') ??
        el.getAttribute('data-id') ??
        ''
      const edge = edges.find((item) => item.id === edgeId)
      const on = edge && (edge.source === focusId || edge.target === focusId)
      el.classList.add(on ? 'dd-edge-on' : 'dd-edge-off')
    })
  }, [edges, focusId, inspectedNodeRenderId])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<DwhNodeData>) => {
      if (nodeDragged.current) {
        nodeDragged.current = false
        return
      }
      if (node.data.kind === 'collapsed') {
        setExpandedLayers((prev) => new Set(prev).add(node.data.hop))
        return
      }
      if (node.data.kind === 'layerHeader') return
      setInspectedNodeId(node.id)
      setInfoPanelOpen(true)
      setFocusId(node.id)
      if (node.data.entityKind === 'table' && node.data.tableId) {
        onSelectTable(node.data.tableId)
        return
      }
      if (node.data.entityKind === 'report' && node.data.reportId) {
        onSelectReport(node.data.reportId)
      }
    },
    [onSelectReport, onSelectTable],
  )

  if (loading) {
    return (
      <div className="impact-map dd-map dwh-lineage-map">
        <div className="dwh-map-empty">Lineage grafiği yükleniyor...</div>
      </div>
    )
  }

  if (!graph || built.nodes.length === 0) {
    return (
      <div className="impact-map dd-map dwh-lineage-map">
        <div className="dwh-map-empty">Grafik için tablo veya rapor seçin.</div>
      </div>
    )
  }

  const mapReady = active && mapSize.width > 0 && mapSize.height > 0

  return (
    <div
      ref={mapRef}
      className={`impact-map dd-map dwh-lineage-map ${focusId ? 'is-focusing' : ''}${layoutMode === 'radial' ? ' is-radial' : ''}${layoutMode === 'swimlane' ? ' is-swimlane' : ''}${infoPanelOpen ? '' : ' is-drawer-collapsed'}`}
      onMouseLeave={() => setFocusId(null)}
    >
      {graph.truncated ? (
        <p className="map-budget-hint">Grafik sınır nedeniyle kısaltıldı.</p>
      ) : null}
      <div className="dwh-map-canvas-row">
      <div className="map-canvas map-canvas-dock-host">
        {(onVisitBack || onVisitForward) && (
          <div className="path-layer-bar dwh-map-visit-nav">
            <div className="path-layer-start" />
            <div className="path-layer-end">
              <button
                type="button"
                className="map-nav-btn path-layer-btn"
                disabled={!canVisitBack}
                onClick={onVisitBack}
                title="Önceki ziyaret"
              >
                ← Geri
              </button>
              <button
                type="button"
                className="map-nav-btn path-layer-btn"
                disabled={!canVisitForward}
                onClick={onVisitForward}
                title="Sonraki ziyaret"
              >
                İleri →
              </button>
            </div>
          </div>
        )}
        {mapReady ? (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={DWH_NODE_TYPES}
              edgeTypes={DWH_EDGE_TYPES}
              onInit={(inst) => {
                rfInstance.current = inst
              }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              fitViewOptions={{
                padding: layout.fitPadding,
                minZoom: layout.minZoom,
                maxZoom: layout.maxZoom,
              }}
              nodesDraggable
              nodeDragThreshold={4}
              selectNodesOnDrag={false}
              nodesConnectable={false}
              panOnDrag
              onlyRenderVisibleElements={false}
              minZoom={layout.minZoom}
              maxZoom={layout.maxZoom}
              onNodeClick={onNodeClick}
              onNodeDrag={() => {
                nodeDragged.current = true
                layoutDirtyRef.current = true
              }}
              onNodeMouseEnter={(_, node) => {
                if (node.data.kind !== 'layerHeader') setFocusId(node.id)
              }}
              onNodeMouseLeave={() => setFocusId(null)}
              onPaneClick={() => {
                nodeDragged.current = false
                setFocusId(null)
              }}
              defaultEdgeOptions={{
                style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
                markerEnd: EDGE_MARKER,
              }}
              proOptions={{ hideAttribution: true }}
            >
              <RadialLabelZoomSync
                layoutTick={`${layoutMode}-${visibleControlLayer}-${tidyNonce}-${graph.rootId}-${mapExpanded}`}
              />
              <MapViewportSync
                centerId={graph.rootId}
                visibleMaxHop={visibleControlLayer}
                layoutKey={`${expandedLayers.size}-${graph.rootId}-${layout.size}-${layoutMode}-${tidyNonce}-${visibleControlLayer}-${mapExpanded}`}
                layout={layout}
                layoutMode={flowLayoutMode}
                drawerOpen={infoPanelOpen}
                mapExpanded={mapExpanded}
                viewportSyncKey={viewportSyncKey}
                topAligned={layoutMode === 'swimlane'}
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={18}
                size={1.55}
                color="var(--map-dot)"
              />
            </ReactFlow>
            <MapCanvasBar
              visibleMaxHop={visibleControlLayer}
              maxHopAvailable={layoutMode === 'swimlane' ? swimlaneMaxLayer : graphMaxHop}
              layout={layout}
              drawerOpen={infoPanelOpen}
              layoutMode={flowLayoutMode}
              viewMode={layoutMode}
              onSetViewMode={(mode) => {
                layoutDirtyRef.current = false
                setLayoutMode(mode)
                setTidyNonce((nonce) => nonce + 1)
              }}
              truncated={graph.truncated}
              onCollapseLayer={() => {
                if (layoutMode === 'swimlane') {
                  setVisibleSwimlaneCount((count) => Math.max(1, count - 1))
                  return
                }
                setVisibleMaxHop((hop) => Math.max(1, hop - 1))
              }}
              onExpandLayer={() => {
                if (layoutMode === 'swimlane') {
                  setVisibleSwimlaneCount((count) => Math.min(swimlaneMaxLayer, count + 1))
                  return
                }
                setVisibleMaxHop((hop) => Math.min(graphMaxHop, hop + 1))
              }}
              onExpandAll={() => {
                if (layoutMode === 'swimlane') {
                  setVisibleSwimlaneCount(swimlaneMaxLayer)
                  return
                }
                setVisibleMaxHop(graphMaxHop)
                setExpandedLayers(new Set(built.hops))
              }}
              onCollapseAll={() => {
                if (layoutMode === 'swimlane') {
                  setVisibleSwimlaneCount(1)
                  return
                }
                setVisibleMaxHop(1)
                setExpandedLayers(new Set())
              }}
              onTidyUp={() => {
                layoutDirtyRef.current = false
                setTidyNonce((nonce) => nonce + 1)
              }}
              onToggleLayoutMode={() => {
                layoutDirtyRef.current = false
                setLayoutMode((mode) => (mode === 'radial' ? 'ltr' : 'radial'))
                setTidyNonce((nonce) => nonce + 1)
              }}
              layerTitle={layoutMode === 'swimlane' ? 'DWH Katmanı' : undefined}
              collapseAllLabel={
                layoutMode === 'swimlane'
                  ? `Sadece ${DWH_SWIMLANE_LABELS[swimlaneKeys[0] ?? 'LD']} katmanını göster`
                  : undefined
              }
              collapseLayerLabel={
                layoutMode === 'swimlane'
                  ? visibleControlLayer > 1
                    ? `${DWH_SWIMLANE_LABELS[swimlaneKeys[visibleControlLayer - 1] ?? 'LD']} katmanını kapat`
                    : 'İlk DWH katmanı açık'
                  : undefined
              }
              expandLayerLabel={
                layoutMode === 'swimlane'
                  ? visibleControlLayer < swimlaneMaxLayer
                    ? `${DWH_SWIMLANE_LABELS[swimlaneKeys[visibleControlLayer] ?? 'LD']} katmanını aç`
                    : 'Tüm DWH katmanları açık'
                  : undefined
              }
              expandAllLabel={layoutMode === 'swimlane' ? 'Tüm DWH katmanlarını aç' : undefined}
              layerStatusLabel={
                layoutMode === 'swimlane'
                  ? `${visibleControlLayer} / ${swimlaneMaxLayer} DWH katmanı görünür`
                  : undefined
              }
            />
          </ReactFlowProvider>
        ) : (
          <div className="dwh-map-empty">Lineage grafiği hazırlanıyor...</div>
        )}
      </div>
      <DwhMapInfoDrawer
        open={infoPanelOpen}
        node={inspectedNode}
        summary={nodeSummary}
        graphStats={graphNodeStats}
        loading={summaryLoading}
        error={summaryError}
        onOpenChange={setInfoPanelOpen}
      />
      </div>
    </div>
  )
}

export function DwhLineageMap(props: Props) {
  return <DwhLineageMapInner {...props} />
}
