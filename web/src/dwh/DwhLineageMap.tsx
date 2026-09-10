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
  dwhRadialEdgeGeometry,
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
  radialHandlePair,
  radialLabelDomStyle,
  radialLabelSide,
  radialMaxZoom,
  radialNodeHitStyle,
  wrapRadialName,
  type MapLayout,
  type MapLayoutMode,
  type RadialLabelSide,
  type RadialViewportHint,
} from './dwhMapLayout'
import { MapCanvasBar, MapViewportSync, RadialLabelZoomSync } from './DwhMapChrome'
import {
  buildDwhSwimlaneProjection,
  normalizeDwhLayer,
  type DwhSwimlaneKey,
  type DwhSwimlaneProjectionEdge,
} from './swimlaneProjection'
import type {
  DwhLineageEdge,
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
  kind: 'center' | DwhLineageNodeKind | 'layerGroup' | 'collapsed' | 'layerHeader'
  hop: number
  tableId?: number
  reportId?: number
  layer?: DwhSwimlaneKey
  count?: number
  hiddenIds?: string[]
  memberIds?: string[]
  occurrenceCount?: number
  referenceCount?: number
  cycleCount?: number
  summaryMode?: boolean
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
type DwhVisualNodeKind = DwhLineageNodeKind | 'layerGroup'
type DwhVisualLineageNode = Omit<DwhLineageNode, 'kind'> & {
  kind: DwhVisualNodeKind
  memberCount?: number
}
type DwhVisualLineageGraph = Omit<DwhLineageGraph, 'nodes'> & {
  nodes: DwhVisualLineageNode[]
}
type DwhReadableLineageGraph = Omit<DwhLineageGraph, 'nodes'> & {
  nodes: DwhVisualLineageNode[]
}
const DWH_SWIMLANE_ORDER: DwhSwimlaneKey[] = ['LD', 'TR', 'EX', 'KAYNAK', 'DIGER']
const DWH_SWIMLANE_CONTROL_ORDER: DwhSwimlaneKey[] = ['LD', 'TR', 'EX', 'KAYNAK']
const DWH_SWIMLANE_LABELS: Record<DwhSwimlaneKey, string> = {
  LD: 'LD Katmanı',
  TR: 'TR Katmanı',
  EX: 'EX Katmanı',
  KAYNAK: 'Kaynak Sistem',
  DIGER: 'Diğer',
}
const DWH_SUBQUERY_FILTER_KEY = 'SUBQUERY'
const DWH_CONTENT_FILTER_ORDER = [...DWH_SWIMLANE_CONTROL_ORDER, 'DIGER']
const DWH_CONTENT_FILTER_LABELS: Record<string, string> = {
  LD: 'LD',
  TR: 'TR',
  EX: 'EX',
  KAYNAK: 'Kaynak',
  DIGER: 'Diğer',
}
const DWH_LAYER_GROUP_LABELS: Record<DwhSwimlaneKey, string> = {
  LD: 'LD',
  TR: 'TR',
  EX: 'EX',
  KAYNAK: 'KAYNAK',
  DIGER: 'Diğer',
}
const DWH_SWIMLANE_HEADER_Y = 20
const DWH_SWIMLANE_NODE_Y = 92
const DWH_SWIMLANE_ROOT_X = 56
const DWH_SWIMLANE_ROOT_TO_LAYER_GAP = 124
const DWH_SWIMLANE_ROW_GAP = 76
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
  relationCount?: number
  originalEdgeIds?: string[]
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
  markerStart,
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
      markerStart={markerStart}
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
  const sourceCenterX = data?.sx ?? sourceX
  const sourceCenterY = data?.sy ?? sourceY
  const targetCenterX = data?.tx ?? targetX
  const targetCenterY = data?.ty ?? targetY
  const sr = data?.sr ?? RADIAL_DOT_R
  const tr = data?.tr ?? RADIAL_DOT_R
  const geom = dwhRadialEdgeGeometry(
    sourceCenterX,
    sourceCenterY,
    targetCenterX,
    targetCenterY,
    sr,
    tr,
  )
  const fill = (style?.stroke as string) || '#6a645a'
  return (
    <>
      <BaseEdge id={id} path={geom.path} style={style} interactionWidth={28} />
      <polygon
        className="dd-radial-mid-arrow"
        points="-9,-7 16,0 -9,7 -2,0"
        fill={fill}
        transform={`translate(${geom.mx},${geom.my}) rotate(${((geom.angle + Math.PI) * 180) / Math.PI})`}
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
  const referenceCount = data.referenceCount ?? (data.kind === 'reference' ? 1 : 0)
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
    radial && isCollapsed ? `Aç · ${data.count ?? 0} node daha` : null
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
        !isCenter && data.layer && `layer-${data.layer.toLocaleLowerCase('tr-TR')}`,
        referenceCount > 0 && 'has-reference-badge',
        radial && 'radial-dot',
      ]
        .filter(Boolean)
        .join(' ')}
      style={radial ? { width: 'auto', height: 'auto', overflow: 'visible' } : undefined}
    >
      <Handle type="target" position={verticalFlow ? Position.Top : Position.Left} id="in" className="dd-handle" />
      <Handle type="target" position={Position.Top} id="in-top" className="dd-handle dir" />
      <Handle type="target" position={Position.Right} id="in-right" className="dd-handle dir" />
      <Handle type="target" position={Position.Bottom} id="in-bottom" className="dd-handle dir" />
      <span className="dd-node-ring" aria-hidden />
      <div className="dd-node-body">
        {!radial && (
          <>
            {label}
            {!isCollapsed && data.sub ? <span className="dd-node-hop">{data.sub}</span> : null}
          </>
        )}
      </div>
      {!isCenter && referenceCount > 0 ? (
        <span className={`dwh-node-reference-badge${radial ? ' is-radial' : ''}`} title={`${referenceCount} referans kullanım`}>
          REF{referenceCount > 1 ? ` ×${referenceCount}` : ''}
        </span>
      ) : null}
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
      <Handle type="source" position={Position.Top} id="out-top" className="dd-handle dir" />
      <Handle type="source" position={Position.Left} id="out-left" className="dd-handle dir" />
      <Handle type="source" position={Position.Bottom} id="out-bottom" className="dd-handle dir" />
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

function drawerNodeMeta(node: DwhLineageNode) {
  if (node.entityKind === 'report') return 'Rapor'
  const layer = node.layer
    ? (DWH_SWIMLANE_LABELS[node.layer as DwhSwimlaneKey] ?? node.layer).replace(/\s+Katmanı$/i, '')
    : node.subtitle?.trim()
  return [layer, entityLabel(node.entityKind)].filter(Boolean).join(' · ')
}

function countReachableTables(
  graph: DwhReadableLineageGraph,
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

function graphStatsForNode(graph: DwhReadableLineageGraph, nodeId: string): GraphNodeStats {
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

type DwhDrawerConnection = {
  id: string
  label: string
  meta: string
  relationCount: number
}

type DwhDrawerConnections = {
  sources: DwhDrawerConnection[]
  targets: DwhDrawerConnection[]
}

function DwhDrawerConnectionGroup({
  title,
  items,
}: {
  title: string
  items: DwhDrawerConnection[]
}) {
  const visibleItems = items.slice(0, 3)
  return (
    <div className="dwh-map-connection-group">
      <div className="dwh-map-connection-group-head">
        <span>{title}</span>
        <strong>{items.length}</strong>
      </div>
      {visibleItems.length ? (
        <div className="dwh-map-connection-list">
          {visibleItems.map((item) => (
            <div key={item.id} className="dwh-map-connection-item">
              <span title={item.label}>{item.label}</span>
              <small>
                {item.meta}
                {item.relationCount > 1 ? ` · ${item.relationCount} bağlantı` : ''}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <span className="dwh-map-connection-empty">Bağlantı yok</span>
      )}
      {items.length > visibleItems.length ? (
        <span className="dwh-map-connection-more">+{items.length - visibleItems.length} bağlantı daha</span>
      ) : null}
    </div>
  )
}

function DwhMapInfoDrawer({
  open,
  node,
  summary,
  graphStats,
  connections,
  loading,
  error,
  onOpenChange,
}: {
  open: boolean
  node?: DwhLineageNode
  summary?: DwhMapNodeSummary
  graphStats: GraphNodeStats
  connections: DwhDrawerConnections
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
                <strong className="dwh-map-info-node-name" title={node.label}>
                  {node.label}
                </strong>
                <span className="dwh-map-info-node-meta">
                  {drawerNodeMeta(node)}
                </span>
              </section>

              {loading ? (
                <div className="dwh-map-drawer-note">Özet hesaplanıyor...</div>
              ) : null}
              {error ? (
                <div className="dwh-map-drawer-note is-error">{error}</div>
              ) : null}

              <section className="dwh-map-info-section">
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

              <section className="dwh-map-info-section">
                <DwhDrawerMetric
                  label="Etkilenen raporlar"
                  direct={reports.direct}
                  indirect={reports.indirect}
                  total={reports.total}
                />
              </section>

              <section className="dwh-map-info-section">
                <div className="dwh-map-connections">
                  <DwhDrawerConnectionGroup title="Kaynak aldığı" items={connections.sources} />
                  <DwhDrawerConnectionGroup title="Doldurduğu" items={connections.targets} />
                </div>
              </section>

            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function splitLayer(
  all: DwhVisualLineageNode[],
  expanded: boolean,
  layoutMode: DwhLayoutMode,
  limitsEnabled = true,
) {
  if (layoutMode === 'swimlane') return { visible: all, hidden: [] as DwhVisualLineageNode[] }
  if (expanded) return { visible: all, hidden: [] as DwhVisualLineageNode[] }
  if (!limitsEnabled) return { visible: all, hidden: [] as DwhVisualLineageNode[] }
  const cap = layoutMode === 'radial' ? RADIAL_VISIBLE_CAP : MAX_VISIBLE_PER_LAYER
  const hidden = all.length > cap ? all.slice(cap) : []
  if (hidden.length < MIN_COLLAPSE_COUNT) return { visible: all, hidden: [] as DwhVisualLineageNode[] }
  return { visible: all.slice(0, cap), hidden }
}

function nodeSubLabel(node: DwhVisualLineageNode) {
  if (node.kind === 'cycle') return node.entityKind === 'table' ? 'Döngü tablo' : 'Döngü'
  if (node.kind === 'reference') return node.layer ?? (node.entityKind === 'table' ? 'Tablo' : 'Referans')
  if (node.kind === 'table') return node.subtitle ?? node.layer ?? 'Tablo'
  if (node.kind === 'report') return node.subtitle ?? 'Rapor'
  if (node.kind === 'layerGroup') return node.subtitle ?? 'Katman grubu'
  return node.subtitle ?? 'Alt sorgu'
}

function isRealLineageNode(node?: DwhVisualLineageNode): node is DwhLineageNode {
  return Boolean(node && node.kind !== 'layerGroup')
}

function rootSubLabel(graph: Pick<DwhLineageGraph, 'rootKind'>) {
  return graph.rootKind === 'report' ? 'Rapor' : 'Tablo'
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
  projectionEdges: DwhSwimlaneProjectionEdge[],
): Node<DwhNodeData>[] {
  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const nodeW = 260
  const rootNode = nodes.find((node) => node.id === graph.rootId)
  const rootW = typeof rootNode?.style?.width === 'number' ? rootNode.style.width : mapNodeWidth('lg')
  const firstLayerX = DWH_SWIMLANE_ROOT_X + rootW + DWH_SWIMLANE_ROOT_TO_LAYER_GAP
  const colPitch = nodeW + DWH_SWIMLANE_COL_GAP
  const rowPitch = DWH_SWIMLANE_ROW_GAP
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
  const laneByNodeId = new Map<string, number>()
  usedKeys.forEach((key, laneIndex) => {
    for (const node of grouped.get(key) ?? []) laneByNodeId.set(node.id, laneIndex)
  })
  const neighbors = new Map<string, Set<string>>()
  for (const edge of projectionEdges) {
    const sourceNeighbors = neighbors.get(edge.source) ?? new Set<string>()
    sourceNeighbors.add(edge.target)
    neighbors.set(edge.source, sourceNeighbors)
    const targetNeighbors = neighbors.get(edge.target) ?? new Set<string>()
    targetNeighbors.add(edge.source)
    neighbors.set(edge.target, targetNeighbors)
  }
  for (const key of usedKeys) {
    grouped.set(
      key,
      [...(grouped.get(key) ?? [])].sort((a, b) => {
        const depthDiff = (a.data.hop ?? 0) - (b.data.hop ?? 0)
        return depthDiff || a.data.fullLabel.localeCompare(b.data.fullLabel, 'tr')
      }),
    )
  }
  const reorderLane = (laneIndex: number, towardEarlier: boolean) => {
    const key = usedKeys[laneIndex]
    const laneNodes = grouped.get(key) ?? []
    const rowById = new Map<string, number>([[graph.rootId, 0]])
    usedKeys.forEach((laneKey) => {
      const positionedLaneNodes = grouped.get(laneKey) ?? []
      positionedLaneNodes.forEach((node, row) => rowById.set(node.id, row))
    })
    const previousOrder = new Map(laneNodes.map((node, index) => [node.id, index]))
    laneNodes.sort((a, b) => {
      const score = (node: Node<DwhNodeData>) => {
        const rows = Array.from(neighbors.get(node.id) ?? []).flatMap((neighborId) => {
          const neighborLane = laneByNodeId.get(neighborId) ?? -1
          const eligible = towardEarlier ? neighborLane < laneIndex : neighborLane > laneIndex
          const row = rowById.get(neighborId)
          return eligible && row !== undefined ? [row] : []
        })
        return rows.length ? rows.reduce((sum, row) => sum + row, 0) / rows.length : undefined
      }
      const aScore = score(a)
      const bScore = score(b)
      if (aScore !== undefined || bScore !== undefined) {
        if (aScore === undefined) return 1
        if (bScore === undefined) return -1
        if (aScore !== bScore) return aScore - bScore
      }
      return (previousOrder.get(a.id) ?? 0) - (previousOrder.get(b.id) ?? 0)
    })
  }
  for (let sweep = 0; sweep < 3; sweep += 1) {
    for (let laneIndex = 0; laneIndex < usedKeys.length; laneIndex += 1) {
      reorderLane(laneIndex, true)
    }
    for (let laneIndex = usedKeys.length - 1; laneIndex >= 0; laneIndex -= 1) {
      reorderLane(laneIndex, false)
    }
  }
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
    const laneNodes = grouped.get(key) ?? []
    const occurrenceCount = laneNodes.reduce(
      (total, node) => total + (node.data.occurrenceCount ?? 1),
      0,
    )
    positioned.push({
      id: `dwh-swimlane-header-${key}`,
      type: 'dwhNode',
      position: { x, y: DWH_SWIMLANE_HEADER_Y },
      data: {
        label: DWH_SWIMLANE_LABELS[key],
        fullLabel: DWH_SWIMLANE_LABELS[key],
        showTip: false,
        size: 'sm',
        sub:
          occurrenceCount === laneNodes.length
            ? `${laneNodes.length} tablo`
            : `${laneNodes.length} tablo · ${occurrenceCount} kullanım`,
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
  projectionEdges: DwhSwimlaneProjectionEdge[],
  positionedNodes: Node<DwhNodeData>[],
): Edge[] {
  const visibleIds = new Set(
    positionedNodes
      .filter((node) => node.data.kind !== 'layerHeader')
      .map((node) => node.id),
  )
  const fanCounts = new Map<string, number>()
  for (const edge of projectionEdges) {
    const key = `${edge.source}->${edge.target}`
    fanCounts.set(key, (fanCounts.get(key) ?? 0) + 1)
  }
  const fanIndexes = new Map<string, number>()
  const edges: Edge[] = []
  for (const edge of projectionEdges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue
    const fanKey = `${edge.source}->${edge.target}`
    const fanIndex = fanIndexes.get(fanKey) ?? 0
    fanIndexes.set(fanKey, fanIndex + 1)
    const stroke = EDGE_COLOR
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'fan',
      className: [
        'dd-edge dwh-edge',
      ]
        .filter(Boolean)
        .join(' '),
      markerStart: { ...EDGE_MARKER, color: stroke },
      style: {
        stroke,
        strokeWidth: 2,
        opacity: 0.62,
      },
      data: {
        sourceEntityId: edge.target,
        targetEntityId: edge.source,
        statementIds: edge.statementIds,
        hop: edge.minDepth,
        fanIndex,
        fanCount: fanCounts.get(fanKey) ?? 1,
        relationCount: edge.relationCount,
        originalEdgeIds: edge.originalEdgeIds,
      },
    })
  }

  return edges
}

type DwhBuiltMap = {
  nodes: Node<DwhNodeData>[]
  edges: Edge[]
  hops: number[]
  swimlaneSummary?: {
    uniqueNodeCount: number
    occurrenceCount: number
    relationCount: number
    relationUseCount: number
    hiddenSubqueryCount: number
  }
}

function buildDwhSwimlaneMap(
  graph: DwhLineageGraph,
  visibleSwimlaneKeys: DwhSwimlaneKey[],
  layout: MapLayout,
): DwhBuiltMap {
  const projection = buildDwhSwimlaneProjection(graph, visibleSwimlaneKeys)
  const rootProjection = projection.nodes.find((node) => node.id === graph.rootId)
  if (!rootProjection) return { nodes: [], edges: [], hops: [] }

  const root = rootProjection.node
  const rootSize = mapNodeSizeFor('center', 0, Math.max(1, visibleSwimlaneKeys.length))
  const rootW = mapNodeWidth(rootSize)
  const nodes: Node<DwhNodeData>[] = [
    {
      id: rootProjection.id,
      type: 'dwhNode',
      position: { x: LEFT_X, y: 40 },
      data: {
        label: root.label,
        fullLabel: root.label,
        showTip: mapLabelNeedsTip(root.label, 60),
        size: rootSize,
        sub: root.subtitle ?? rootSubLabel(graph),
        entityKind: root.entityKind,
        kind: 'center',
        hop: 0,
        tableId: root.tableId,
        reportId: root.reportId,
        layer: normalizeDwhLayer(root),
        memberIds: rootProjection.memberIds,
        occurrenceCount: rootProjection.occurrenceCount,
        referenceCount: rootProjection.referenceCount,
        cycleCount: rootProjection.cycleCount,
        summaryMode: true,
      },
      style: { width: rootW },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  for (const projected of projection.nodes) {
    if (projected.id === graph.rootId) continue
    const details: string[] = [DWH_SWIMLANE_LABELS[projected.layer].replace(' Katmanı', '')]
    if (projected.occurrenceCount > 1) details.push(`${projected.occurrenceCount} kullanım`)
    if (projected.cycleCount > 0) details.push(`${projected.cycleCount} döngü`)
    nodes.push({
      id: projected.id,
      type: 'dwhNode',
      position: { x: LEFT_X + projected.minDepth * (layout.nodeW + layout.colGap), y: 40 },
      data: {
        label: compactMapLabel(projected.node.label, 60),
        fullLabel: projected.node.label,
        showTip: mapLabelNeedsTip(projected.node.label, 60),
        size: 'sm',
        sub: details.join(' · '),
        entityKind: projected.node.entityKind,
        kind: projected.node.kind,
        hop: projected.minDepth,
        tableId: projected.node.tableId,
        reportId: projected.node.reportId,
        layer: projected.layer,
        memberIds: projected.memberIds,
        occurrenceCount: projected.occurrenceCount,
        referenceCount: projected.referenceCount,
        cycleCount: projected.cycleCount,
        summaryMode: true,
      },
      style: { width: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    })
  }

  const positioned = applyDwhSwimlaneLayout(nodes, graph, projection.edges)
  return {
    nodes: positioned,
    edges: buildDwhSwimlaneEdges(projection.edges, positioned),
    hops: Array.from(new Set(projection.nodes.map((node) => node.minDepth))).sort((a, b) => a - b),
    swimlaneSummary: {
      uniqueNodeCount: projection.nodes.length,
      occurrenceCount: projection.originalNodeCount,
      relationCount: projection.edges.length,
      relationUseCount: projection.edges.reduce((total, edge) => total + edge.relationCount, 0),
      hiddenSubqueryCount: projection.hiddenSubqueryCount,
    },
  }
}

function buildDwhMap(
  graph: DwhVisualLineageGraph,
  expandedLayers: Set<number>,
  visibleMaxHop: number,
  visibleSwimlaneKeys: DwhSwimlaneKey[],
  layout: MapLayout,
  layoutMode: DwhLayoutMode,
  radialViewport?: RadialViewportHint,
): DwhBuiltMap {
  const { nodeW, colGap, rowGap, tipChars } = layout
  const colPitch = nodeW + colGap
  const root = graph.nodes.find((node) => node.id === graph.rootId) ?? graph.nodes[0]
  if (!root) return { nodes: [], edges: [], hops: [] }
  if (layoutMode === 'swimlane') {
    return buildDwhSwimlaneMap(graph as DwhLineageGraph, visibleSwimlaneKeys, layout)
  }

  const byHop = new Map<number, DwhVisualLineageNode[]>()
  for (const node of graph.nodes) {
    if (node.id === graph.rootId) continue
    const hop = Math.max(1, node.depth)
    const list = byHop.get(hop) ?? []
    list.push(node)
    byHop.set(hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)
  const visibleByHop = new Map<number, DwhVisualLineageNode[]>()
  const collapsedMeta = new Map<number, DwhVisualLineageNode[]>()
  const parentByNodeId = new Map(graph.edges.map((edge) => [edge.source, edge.target]))
  const rowOrderByNodeId = new Map<string, number>([[graph.rootId, 0]])

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    const sorted = [...(byHop.get(hop) ?? [])].sort((a, b) => {
      const aParentOrder = rowOrderByNodeId.get(parentByNodeId.get(a.id) ?? '') ?? Number.MAX_SAFE_INTEGER
      const bParentOrder = rowOrderByNodeId.get(parentByNodeId.get(b.id) ?? '') ?? Number.MAX_SAFE_INTEGER
      return aParentOrder - bParentOrder || a.label.localeCompare(b.label, 'tr')
    })
    sorted.forEach((node, row) => rowOrderByNodeId.set(node.id, row))
    const { visible, hidden } = splitLayer(
      sorted,
      expandedLayers.has(hop),
      layoutMode,
      graph.limitsEnabled !== false,
    )
    visibleByHop.set(hop, visible)
    if (hidden.length) collapsedMeta.set(hop, hidden)
  }

  const rootSize = layoutMode === 'radial' ? 'md' : mapNodeSizeFor('center', 0, visibleMaxHop)
  const rootW = layoutMode === 'radial' ? 48 : mapNodeWidth(rootSize)
  const nodes: Node<DwhNodeData>[] = [
    {
      id: root.id,
      type: 'dwhNode',
      position: {
        x: LEFT_X,
        y: 40,
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
        layer: normalizeDwhLayer(root),
      },
      style: { width: rootW },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  const visibleIds = new Set<string>([root.id])

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    const visible = visibleByHop.get(hop) ?? []
    visible.forEach((node, i) => {
      visibleIds.add(node.id)
      const size =
        layoutMode === 'radial'
          ? 'md'
          : 'lg'
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
          entityKind: node.kind === 'layerGroup' ? undefined : node.entityKind,
          kind: node.kind,
          hop,
          tableId: node.tableId,
          reportId: node.reportId,
          layer: normalizeDwhLayer(node),
          referenceCount: node.kind === 'reference' ? 1 : undefined,
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
      const size = layoutMode === 'radial' ? 'md' : 'lg'
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
          sub: `${hidden.length} düğüm gizli`,
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
      ]
        .filter(Boolean)
        .join(' '),
      markerStart: radialTree
        ? {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: '#6a645a',
          }
        : EDGE_MARKER,
      style: {
        stroke: EDGE_COLOR,
        strokeWidth: 2,
        strokeDasharray: undefined,
        opacity: radialTree ? 0.55 : 0.62,
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
          viewport: radialViewport,
        }).nodes
      : nodes

  let edges = finalEdges

  if (layoutMode === 'radial') {
    const posOf = new Map(positioned.filter((node) => node.type === 'dwhNode').map((node) => [node.id, node]))
    edges = finalEdges.map((edge) => {
      const source = posOf.get(edge.source)
      const target = posOf.get(edge.target)
      if (!source || !target) return edge
      const sourceCenter = (source.data as DwhNodeData).kind === 'center'
      const targetCenter = (target.data as DwhNodeData).kind === 'center'
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
          sx: source.position.x + radialAnchorOffset(sourceCenter).x,
          sy: source.position.y + radialAnchorOffset(sourceCenter).y,
          tx: target.position.x + radialAnchorOffset(targetCenter).x,
          ty: target.position.y + radialAnchorOffset(targetCenter).y,
          sr: sourceCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R,
          tr: targetCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R,
        },
      }
    })
  }

  return { nodes: positioned, edges, hops }
}

// Mirrors the legacy diagram order: group direct table siblings first, apply
// layer pruning, then splice subquery wrappers when "Alt sorgusuz" is enabled.
function projectDwhDiagramGraph(
  graph?: DwhLineageGraph,
  filterIds: readonly string[] = [],
  hideSubqueries = false,
): DwhVisualLineageGraph | undefined {
  if (!graph) return undefined

  const allowed = new Set(filterIds)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, DwhLineageEdge[]>()
  for (const edge of graph.edges) {
    const children = childrenByParent.get(edge.target) ?? []
    children.push(edge)
    childrenByParent.set(edge.target, children)
  }

  const nodes = new Map<string, DwhVisualLineageNode>()
  const edges = new Map<string, DwhLineageEdge>()

  const visibleLayer = (node: DwhLineageNode) =>
    node.id === graph.rootId ||
    node.entityKind !== 'table' ||
    allowed.has(normalizeDwhLayer(node))

  const addNode = (node: DwhVisualLineageNode, depth: number) => {
    const current = nodes.get(node.id)
    nodes.set(node.id, {
      ...node,
      depth: current ? Math.min(current.depth, depth) : depth,
    })
  }
  const addEdge = (edge: DwhLineageEdge) => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge)
  }

  const attachToParent = (
    childTopIds: string[],
    parentId: string | undefined,
    edge: DwhLineageEdge,
    edgePrefix: string,
  ) => {
    if (!parentId) return
    for (const childTopId of childTopIds) {
      if (childTopId === parentId) continue
      addEdge({
        ...edge,
        id: `${edgePrefix}:${childTopId}->${parentId}:${edge.id}`,
        source: childTopId,
        target: parentId,
      })
    }
  }

  const buildChildren = (
    parentId: string,
    childDepth: number,
    visualParentId: string | undefined,
  ): string[] => {
    const childEdges = childrenByParent.get(parentId) ?? []
    const topIds: string[] = []

    const tableEdges = childEdges.filter((edge) => {
      const child = nodeById.get(edge.source)
      return child?.entityKind === 'table'
    })
    const layers = new Set(tableEdges.map((edge) => normalizeDwhLayer(nodeById.get(edge.source))))
    const shouldGroup = tableEdges.length > 1 && layers.size > 1

    const groupedTableEdges = new Map<DwhSwimlaneKey, DwhLineageEdge[]>()
    if (shouldGroup) {
      for (const edge of tableEdges) {
        const child = nodeById.get(edge.source)
        const layer = normalizeDwhLayer(child)
        const group = groupedTableEdges.get(layer) ?? []
        group.push(edge)
        groupedTableEdges.set(layer, group)
      }
    }

    for (const edge of childEdges) {
      const child = nodeById.get(edge.source)
      if (!child) continue
      if (shouldGroup && child.entityKind === 'table') continue

      const childTopIds = buildBranch(child.id, childDepth)
      attachToParent(childTopIds, visualParentId, edge, 'diagram')
      topIds.push(...childTopIds)
    }

    if (shouldGroup) {
      for (const layer of groupedTableEdges.keys()) {
        const layerTableEdges = groupedTableEdges.get(layer) ?? []
        if (!layerTableEdges.length) continue
        const memberTopIds: string[] = []
        for (const edge of layerTableEdges) {
          const childTopIds = buildBranch(edge.source, childDepth + 1)
          if (!childTopIds.length) continue
          attachToParent(
            childTopIds,
            `dwh-layer-group:${parentId}:${layer}`,
            edge,
            'layerGroup-member',
          )
          memberTopIds.push(...childTopIds)
        }
        if (!memberTopIds.length) continue

        const groupId = `dwh-layer-group:${parentId}:${layer}`
        const groupNode: DwhVisualLineageNode = {
          id: groupId,
          kind: 'layerGroup',
          entityKind: 'subquery',
          entityKey: groupId,
          label: `${DWH_LAYER_GROUP_LABELS[layer]} (${memberTopIds.length})`,
          subtitle: 'Katman grubu',
          layer,
          depth: childDepth,
          memberCount: memberTopIds.length,
        }
        addNode(groupNode, childDepth)
        if (visualParentId) {
          addEdge({
            id: `layerGroup:${groupId}->${visualParentId}`,
            kind: 'subquery',
            source: groupId,
            target: visualParentId,
            label: 'katman grubu',
          })
        }
        topIds.push(groupId)
      }
    }

    return topIds
  }

  const buildBranch = (nodeId: string, depth: number): string[] => {
    const node = nodeById.get(nodeId)
    if (!node || !visibleLayer(node)) return []

    if (hideSubqueries && node.entityKind === 'subquery') {
      return buildChildren(node.id, depth, undefined)
    }

    addNode(node, depth)
    buildChildren(node.id, depth + 1, node.id)
    return [node.id]
  }

  buildBranch(graph.rootId, 0)

  return {
    ...graph,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  }
}

function maxHop(graph?: DwhVisualLineageGraph) {
  if (!graph) return 1
  return Math.max(1, ...graph.nodes.map((node) => node.depth))
}

function dwhContentFilterKey(node: DwhLineageNode) {
  return node.entityKind === 'subquery' ? DWH_SUBQUERY_FILTER_KEY : normalizeDwhLayer(node)
}

function dwhContentFilterOptionsForGraph(graph?: DwhLineageGraph) {
  if (!graph) return []
  const counts = new Map<string, number>()
  for (const node of graph.nodes) {
    if (node.id === graph.rootId) continue
    const key = dwhContentFilterKey(node)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return DWH_CONTENT_FILTER_ORDER
    .filter((key) => counts.has(key))
    .map((key) => ({
      id: key,
      label: DWH_CONTENT_FILTER_LABELS[key] ?? key,
      subLabel: `${counts.get(key) ?? 0} node`,
    }))
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
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set())
  const [visibleMaxHop, setVisibleMaxHop] = useState(1)
  const [visibleSwimlaneCount, setVisibleSwimlaneCount] = useState(1)
  const [layoutMode, setLayoutMode] = useState<DwhLayoutMode>('ltr')
  const [hideSubqueries, setHideSubqueries] = useState(false)
  const contentFilterOptions = useMemo(() => dwhContentFilterOptionsForGraph(graph), [graph])
  const allContentFilterIds = useMemo(
    () => contentFilterOptions.map((option) => option.id),
    [contentFilterOptions],
  )
  const [contentFilters, setContentFilters] = useState<string[]>(allContentFilterIds)
  const visualGraph = useMemo(
    () =>
      graph && layoutMode !== 'swimlane'
        ? projectDwhDiagramGraph(graph, contentFilters, hideSubqueries)
        : (graph as DwhVisualLineageGraph | undefined),
    [contentFilters, graph, hideSubqueries, layoutMode],
  )
  const activeGraph = layoutMode === 'swimlane' ? (graph as DwhVisualLineageGraph | undefined) : visualGraph
  const graphMaxHop = useMemo(() => maxHop(visualGraph), [visualGraph])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(graph?.rootId ?? null)
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [nodeSummary, setNodeSummary] = useState<DwhMapNodeSummary>()
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [tidyNonce, setTidyNonce] = useState(0)
  const [viewportSyncKey, setViewportSyncKey] = useState(0)
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [searchFocusId, setSearchFocusId] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const nodeDragged = useRef(false)
  const layoutDirtyRef = useRef(false)
  const lastTidyRef = useRef(0)
  const layoutEpochRef = useRef('')
  const prevRootRef = useRef(graph?.rootId ?? '')
  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const mapReady = active && mapSize.width > 0 && mapSize.height > 0

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR')
    if (!query || !activeGraph) return []
    return activeGraph.nodes
      .filter((node) => node.kind !== 'layerGroup')
      .filter((node) => node.entityKind !== 'subquery')
      .filter((node) => {
        const label = `${node.label} ${node.subtitle ?? ''}`.toLocaleLowerCase('tr-TR')
        return label.includes(query)
      })
      .map((node) => node.id)
  }, [activeGraph, searchQuery])

  const activeSearchId = searchMatches.length
    ? searchMatches[Math.min(searchIndex, searchMatches.length - 1)]
    : null

  useEffect(() => {
    setSearchIndex((current) => Math.min(current, Math.max(0, searchMatches.length - 1)))
  }, [searchMatches.length])

  useEffect(() => {
    if (!searchQuery.trim() || !activeSearchId) {
      setSearchFocusId(null)
      return
    }
    const target = activeGraph?.nodes.find((node) => node.id === activeSearchId)
    if (!target) {
      setSearchFocusId(null)
      return
    }
    if (layoutMode === 'swimlane') {
      const availableLayerKeys = swimlaneKeysForGraph(graph as DwhLineageGraph).filter((key) => contentFilters.includes(key))
      const layerIndex = availableLayerKeys.indexOf(normalizeDwhLayer(target))
      if (layerIndex >= 0 && visibleSwimlaneCount <= layerIndex) {
        setSearchFocusId(null)
        setVisibleSwimlaneCount((current) => Math.min(availableLayerKeys.length, layerIndex + 1))
        return
      }
    } else if (target.depth > visibleMaxHop) {
      setSearchFocusId(null)
      setVisibleMaxHop((current) => Math.max(current, Math.min(graphMaxHop, target.depth)))
      return
    }
    const hasClosedIntermediateLayer =
      layoutMode !== 'swimlane' &&
      target.depth > 0 &&
      Array.from({ length: target.depth }, (_, index) => index + 1).some((depth) => !expandedLayers.has(depth))
    if (hasClosedIntermediateLayer) {
      setSearchFocusId(null)
      setExpandedLayers((current) => {
        const next = new Set(current)
        for (let depth = 1; depth <= target.depth; depth += 1) next.add(depth)
        return next.size === current.size ? current : next
      })
      return
    }
    setSearchFocusId(activeSearchId)
    setInspectedNodeId(activeSearchId)
    setInfoPanelOpen(true)
  }, [activeGraph, activeSearchId, contentFilters, expandedLayers, graph, graphMaxHop, layoutMode, searchQuery, visibleMaxHop, visibleSwimlaneCount])

  const activeFocusId = searchQuery.trim() ? searchFocusId : focusId

  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const syncSearchClasses = () => {
      root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
        const id = el.getAttribute('data-id') ?? ''
        el.classList.toggle('dwh-search-match', searchMatches.includes(id))
        el.classList.toggle('dwh-search-active', id === activeSearchId)
      })
    }
    syncSearchClasses()
    const observer = new MutationObserver(syncSearchClasses)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [activeSearchId, searchMatches])

  useEffect(() => {
    if (!activeSearchId || !mapReady) return
    let frame: number | null = null
    const timeout = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        const instance = rfInstance.current
        if (!instance) return
        const node = instance.getNode(activeSearchId)
        if (!node) return
        const width = node.width ?? (typeof node.style?.width === 'number' ? node.style.width : 220)
        const height = node.height ?? (typeof node.style?.height === 'number' ? node.style.height : 72)
        const zoom = instance.getViewport().zoom
        void instance.setCenter(
          node.position.x + width / 2,
          node.position.y + height / 2,
          { duration: 900, zoom },
        )
      })
    }, 80)
    return () => {
      window.clearTimeout(timeout)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [activeSearchId, mapReady, viewportSyncKey])

  const moveSearch = useCallback((direction: -1 | 1) => {
    if (!searchMatches.length) return
    setSearchIndex((current) => (current + direction + searchMatches.length) % searchMatches.length)
  }, [searchMatches.length])

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
    setContentFilters(allContentFilterIds)
    setHideSubqueries(false)
    setFocusId(null)
    setSearchFocusId(null)
    setInspectedNodeId(graph?.rootId ?? null)
    setInfoPanelOpen(true)
    layoutDirtyRef.current = false
  }, [allContentFilterIds, graph?.rootId])

  const inspectedNode = useMemo(
    () => {
      if (!graph) return undefined
      const hoverNode = activeFocusId
        ? activeGraph?.nodes.find((node) => node.id === activeFocusId)
        : undefined
      if (isRealLineageNode(hoverNode)) return hoverNode
      const selectedNode = activeGraph?.nodes.find((node) => node.id === inspectedNodeId)
      return isRealLineageNode(selectedNode) ? selectedNode : undefined
    },
    [activeFocusId, activeGraph, graph, inspectedNodeId],
  )
  const inspectedNodeRenderId = inspectedNode?.id ?? null

  const graphNodeStats = useMemo(
    () =>
      graph && inspectedNode
        ? graphStatsForNode(activeGraph ?? graph, inspectedNode.id)
        : EMPTY_GRAPH_STATS,
    [activeGraph, graph, inspectedNode],
  )

  const flowLayoutMode: MapLayoutMode = layoutMode === 'swimlane' ? 'ltr' : layoutMode
  const swimlaneKeys = useMemo(
    () => swimlaneKeysForGraph(graph).filter((key) => contentFilters.includes(key)),
    [contentFilters, graph],
  )
  const swimlaneMaxLayer = Math.max(1, swimlaneKeys.length)
  const visibleSwimlaneKeys = useMemo(
    () => swimlaneKeys.slice(0, Math.min(visibleSwimlaneCount, swimlaneMaxLayer)),
    [swimlaneKeys, swimlaneMaxLayer, visibleSwimlaneCount],
  )
  const visibleControlLayer = layoutMode === 'swimlane' ? Math.min(visibleSwimlaneCount, swimlaneMaxLayer) : visibleMaxHop

  useEffect(() => {
    setVisibleSwimlaneCount((count) => Math.min(Math.max(1, count), swimlaneMaxLayer))
  }, [swimlaneMaxLayer])

  useEffect(() => {
    setVisibleMaxHop((hop) => Math.min(Math.max(1, hop), graphMaxHop))
  }, [graphMaxHop])

  const radialViewport = useMemo((): RadialViewportHint | undefined => {
    if (layoutMode !== 'radial') return undefined
    const width = mapSize.width > 80 ? mapSize.width : 720
    const height = mapSize.height > 80 ? mapSize.height : 480
    return {
      width,
      height,
      fullscreen: mapExpanded,
      spokeScale: 2.15,
    }
  }, [layoutMode, mapExpanded, mapSize.height, mapSize.width])

  const layout = useMemo(
    () => {
      const baseLayout = layoutMode === 'radial' ? mapLayoutForRadial() : mapLayoutForDepth(visibleControlLayer)
      const minZoom = Math.min(baseLayout.minZoom, DWH_MIN_ZOOM)
      if (layoutMode === 'radial') {
        if (!mapExpanded || mapSize.width <= 0) {
          return { ...baseLayout, minZoom }
        }
        const aspect = mapSize.width / Math.max(mapSize.height, 1)
        return { ...baseLayout, minZoom, maxZoom: radialMaxZoom(baseLayout, true, aspect) }
      }
      if (layoutMode !== 'ltr') {
        return { ...baseLayout, minZoom }
      }
      return {
        ...baseLayout,
        nodeW: mapNodeWidth('lg'),
        colGap: 220,
        rowGap: visibleControlLayer >= 3 ? 88 : 104,
        minZoom,
      }
    },
    [layoutMode, mapExpanded, mapSize.height, mapSize.width, visibleControlLayer],
  )

  const built = useMemo<DwhBuiltMap>(
    () =>
      visualGraph
        ? buildDwhMap(
            visualGraph,
            expandedLayers,
            visibleMaxHop,
            visibleSwimlaneKeys,
            layout,
            layoutMode,
            radialViewport,
          )
        : { nodes: [] as Node<DwhNodeData>[], edges: [] as Edge[], hops: [] as number[] },
    [expandedLayers, layout, layoutMode, radialViewport, visibleMaxHop, visibleSwimlaneKeys, visualGraph],
  )

  const builtNodeSig = useMemo(
    () =>
      built.nodes
        .filter((node) => node.type === 'dwhNode')
        .map((node) => `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}`)
        .join('|'),
    [built.nodes],
  )
  const inspectedConnections = useMemo<DwhDrawerConnections>(() => {
    if (!inspectedNodeRenderId) return { sources: [], targets: [] }
    const nodeById = new Map(
      built.nodes
        .filter((node) => node.data.kind !== 'layerHeader')
        .map((node) => [node.id, node]),
    )
    const collect = (direction: 'source' | 'target') => {
      // Drawer relations must follow the raw lineage direction. Rendered edges
      // can be projected/reversed by the selected layout and are not suitable
      // for deciding which entities the inspected node reads or fills.
      const edgeList = graph?.edges ?? []
      const fullNodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]))
      const items = new Map<string, DwhDrawerConnection>()
      for (const edge of edgeList) {
        const matches = direction === 'source'
          ? edge.target === inspectedNodeRenderId
          : edge.source === inspectedNodeRenderId
        if (!matches) continue
        const neighborId = direction === 'source' ? edge.source : edge.target
        const fullNeighbor = fullNodeById?.get(neighborId)
        const visibleNeighbor = nodeById.get(neighborId)
        if (!fullNeighbor && !visibleNeighbor) continue
        const item = fullNeighbor
          ? {
              id: fullNeighbor.id,
              label: fullNeighbor.label,
              tableId: fullNeighbor.tableId,
              reportId: fullNeighbor.reportId,
              entityKind: fullNeighbor.entityKind,
              meta: `${entityLabel(fullNeighbor.entityKind)} · ${fullNeighbor.layer
                ? DWH_SWIMLANE_LABELS[normalizeDwhLayer(fullNeighbor)]
                : fullNeighbor.subtitle ?? entityLabel(fullNeighbor.entityKind)}`,
            }
          : {
              id: visibleNeighbor!.id,
              label: visibleNeighbor!.data.fullLabel || visibleNeighbor!.data.label,
              tableId: visibleNeighbor!.data.tableId,
              reportId: visibleNeighbor!.data.reportId,
              entityKind: visibleNeighbor!.data.entityKind,
              meta: `${entityLabel(visibleNeighbor!.data.entityKind)} · ${visibleNeighbor!.data.layer
                ? DWH_SWIMLANE_LABELS[visibleNeighbor!.data.layer]
                : visibleNeighbor!.data.sub}`,
            }
        const itemKey = item.tableId
          ? `table:${item.tableId}`
          : item.reportId
            ? `report:${item.reportId}`
            : item.id
        const relationCount = 1
        const existing = items.get(itemKey)
        if (existing) {
          existing.relationCount += relationCount
          continue
        }
        items.set(itemKey, {
          id: itemKey,
          label: item.label,
          meta: item.meta,
          relationCount,
        })
      }
      return Array.from(items.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr'))
    }
    return {
      sources: collect('source'),
      targets: collect('target'),
    }
  }, [built.edges, built.nodes, graph, inspectedNodeRenderId])

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

  // React Flow'un handle koordinatları radialde kenar yönüne göre değişir.
  // Custom edge ise daima aynı node merkezlerini kullanmalıdır; sürükleme
  // sonrasında bu merkez datasını güncel tutuyoruz.
  useEffect(() => {
    if (layoutMode !== 'radial') return
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    let changed = false
    const nextEdges = edges.map((edge) => {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      if (!source || !target || !source.data.radialDot || !target.data.radialDot) return edge
      const sourceCenter = source.data.kind === 'center'
      const targetCenter = target.data.kind === 'center'
      const sourceMid = radialAnchorOffset(sourceCenter)
      const targetMid = radialAnchorOffset(targetCenter)
      const data = (edge.data ?? {}) as DwhEdgeData
      const sr = sourceCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R
      const tr = targetCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R
      const sx = source.position.x + sourceMid.x
      const sy = source.position.y + sourceMid.y
      const tx = target.position.x + targetMid.x
      const ty = target.position.y + targetMid.y
      if (
        data.sx === sx &&
        data.sy === sy &&
        data.tx === tx &&
        data.ty === ty &&
        data.sr === sr &&
        data.tr === tr
      ) {
        return edge
      }
      changed = true
      return {
        ...edge,
        data: { ...data, sx, sy, tx, ty, sr, tr },
      }
    })
    if (changed) setEdges(nextEdges)
  }, [edges, layoutMode, nodes, setEdges])

  useEffect(() => {
    const rootChanged = prevRootRef.current !== (graph?.rootId ?? '')
    prevRootRef.current = graph?.rootId ?? ''
    const radialSizeEpoch = layoutMode === 'radial'
      ? `:${mapSize.width}:${mapSize.height}`
      : ''
    const layoutEpoch = `${layoutMode}:${visibleControlLayer}:${layout.size}:${mapExpanded}${radialSizeEpoch}`
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
    mapSize.height,
    mapSize.width,
    setEdges,
    setNodes,
    tidyNonce,
    visibleControlLayer,
    visibleMaxHop,
  ])

  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const active = Boolean(activeFocusId)
    const focusNodeIds = new Set<string>()
    const sourceNodeIds = new Set<string>()
    const targetNodeIds = new Set<string>()
    const focusEdgeIds = new Set<string>()
    if (activeFocusId) {
      focusNodeIds.add(activeFocusId)
      const queue = [activeFocusId]
      while (queue.length) {
        const currentId = queue.shift()
        if (!currentId) break
        for (const edge of edges) {
          if (edge.target !== currentId || focusEdgeIds.has(edge.id)) continue
          focusEdgeIds.add(edge.id)
          sourceNodeIds.add(edge.source)
          if (!focusNodeIds.has(edge.source)) {
            focusNodeIds.add(edge.source)
            queue.push(edge.source)
          }
        }
      }
      for (const edge of edges) {
        if (edge.source !== activeFocusId) continue
        focusEdgeIds.add(edge.id)
        targetNodeIds.add(edge.target)
        focusNodeIds.add(edge.target)
      }
    }
    const syncFocusClasses = () => {
      root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
        const id = el.getAttribute('data-id') ?? ''
        el.classList.remove('rf-path-on', 'rf-path-off', 'rf-path-focus', 'rf-path-source', 'rf-path-target')
        el.classList.toggle('dwh-node-inspected', id === inspectedNodeRenderId)
        if (!active) return
        const on = focusNodeIds.has(id)
        el.classList.add(on ? 'rf-path-on' : 'rf-path-off')
        if (sourceNodeIds.has(id)) el.classList.add('rf-path-source')
        if (targetNodeIds.has(id)) el.classList.add('rf-path-target')
        if (id === activeFocusId) el.classList.add('rf-path-focus')
      })
      root.querySelectorAll<HTMLElement>('.react-flow__edge').forEach((el) => {
        el.classList.remove('dd-edge-on', 'dd-edge-off', 'dd-edge-source', 'dd-edge-target')
        if (!active) return
        const edgeId =
          el.getAttribute('data-testid')?.replace(/^rf__edge-/, '') ??
          el.getAttribute('data-id') ??
          ''
        const on = focusEdgeIds.has(edgeId)
        el.classList.add(on ? 'dd-edge-on' : 'dd-edge-off')
        if (!on) return
        const edge = edges.find((candidate) => candidate.id === edgeId)
        if (edge?.source === activeFocusId) el.classList.add('dd-edge-source')
        if (edge?.target === activeFocusId) el.classList.add('dd-edge-target')
      })
    }
    syncFocusClasses()
    const observer = new MutationObserver(syncFocusClasses)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [activeFocusId, edges, inspectedNodeRenderId])

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
      if (node.data.kind === 'layerGroup') {
        setFocusId(node.id)
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

  return (
    <div
      ref={mapRef}
      className={`impact-map dd-map dwh-lineage-map ${activeFocusId ? 'is-focusing' : ''}${layoutMode === 'radial' ? ' is-radial' : ''}${layoutMode === 'swimlane' ? ' is-swimlane' : ''}${infoPanelOpen ? '' : ' is-drawer-collapsed'}`}
      onMouseLeave={() => setFocusId(null)}
    >
      {graph.truncated ? (
        <p className="map-budget-hint">
          Grafik güvenlik sınırında kesildi (en fazla 900 düğüm ve {graph.maxDepth} seviye); görünmeyen lineage dalları olabilir.
        </p>
      ) : null}
      <div className="dwh-map-search" role="search" aria-label="Haritada tablo ara">
        <input
          type="search"
          value={searchQuery}
          placeholder="Haritada tablo ara..."
          aria-label="Haritada tablo ara"
          onChange={(event) => {
            setSearchQuery(event.target.value)
            setFocusId(null)
            setSearchIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            moveSearch(event.shiftKey ? -1 : 1)
          }}
        />
        <button
          type="button"
          className="dwh-map-search-clear"
          aria-label="Aramayı temizle"
          title="Aramayı temizle"
          onClick={() => {
            setSearchQuery('')
            setFocusId(null)
            setSearchFocusId(null)
            setSearchIndex(0)
          }}
        >
          ×
        </button>
        <span className="dwh-map-search-count" aria-live="polite">
          {searchQuery.trim() ? `${searchMatches.length ? Math.min(searchIndex + 1, searchMatches.length) : 0} / ${searchMatches.length}` : ''}
        </span>
        <button
          type="button"
          className="dwh-map-search-nav"
          aria-label="Önceki eşleşme"
          title="Önceki eşleşme"
          disabled={searchMatches.length === 0}
          onClick={() => moveSearch(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="dwh-map-search-nav"
          aria-label="Sonraki eşleşme"
          title="Sonraki eşleşme"
          disabled={searchMatches.length === 0}
          onClick={() => moveSearch(1)}
        >
          ↓
        </button>
      </div>
      <div className="dwh-map-canvas-row">
      <div className="map-canvas map-canvas-dock-host">
        {layoutMode === 'swimlane' && built.swimlaneSummary ? (
          <div className="dwh-swimlane-projection-stats" aria-label="Katmanlı görünüm özeti">
            <strong>{Math.max(0, built.swimlaneSummary.uniqueNodeCount - 1)} tekil kaynak</strong>
            <span>{Math.max(0, built.swimlaneSummary.occurrenceCount - 1)} kullanım</span>
            <span>{built.swimlaneSummary.relationCount} tekil ilişki</span>
            {built.swimlaneSummary.relationUseCount > built.swimlaneSummary.relationCount ? (
              <span>{built.swimlaneSummary.relationUseCount} bağlantı kaydı</span>
            ) : null}
            {built.swimlaneSummary.hiddenSubqueryCount > 0 ? (
              <span>{built.swimlaneSummary.hiddenSubqueryCount} SQL grubu özetlendi</span>
            ) : null}
          </div>
        ) : null}
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
              nodesDraggable
              nodeDragThreshold={4}
              selectNodesOnDrag={false}
              nodesConnectable={false}
              panOnDrag
              onlyRenderVisibleElements
              minZoom={layout.minZoom}
              maxZoom={layout.maxZoom}
              onNodeClick={onNodeClick}
              onNodeDrag={() => {
                nodeDragged.current = true
                layoutDirtyRef.current = true
              }}
              onNodeMouseEnter={(_, node) => {
                if (!searchQuery.trim() && node.data.kind !== 'layerHeader') setFocusId(node.id)
              }}
              onNodeMouseLeave={() => setFocusId(null)}
              onPaneClick={() => {
                nodeDragged.current = false
                setFocusId(null)
              }}
              defaultEdgeOptions={{
                style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
                markerStart: EDGE_MARKER,
              }}
              proOptions={{ hideAttribution: true }}
            >
              <RadialLabelZoomSync
                layoutTick={`${layoutMode}-${visibleControlLayer}-${tidyNonce}-${graph.rootId}-${mapExpanded}-${mapSize.width}x${mapSize.height}`}
              />
              <MapViewportSync
                centerId={graph.rootId}
                visibleMaxHop={visibleControlLayer}
                layoutKey={`${graph.rootId}-${layout.size}-${layoutMode}-${tidyNonce}-${visibleControlLayer}-${mapExpanded}-${layoutMode === 'radial' ? [...expandedLayers].sort((a, b) => a - b).join(',') : ''}`}
                layout={layout}
                layoutMode={flowLayoutMode}
                drawerOpen={infoPanelOpen}
                mapExpanded={mapExpanded}
                viewportSyncKey={viewportSyncKey}
                topAligned={layoutMode !== 'radial'}
                readableMinZoom={layoutMode === 'swimlane' ? 0.46 : layoutMode === 'radial' ? 0.08 : 0.42}
                rightAlignOnLayerChange
                radialFocusToBounds
                suppressAutoFit={Boolean(searchQuery.trim() && activeSearchId)}
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
              contentFilters={contentFilters}
              contentFilterOptions={contentFilterOptions}
              contentExtraFilter={
                layoutMode === 'swimlane'
                  ? undefined
                  : {
                      label: 'Alt sorgusuz',
                      subLabel: 'Alt sorgu node’larını çizmeden içindeki tabloları üst node’a bağlar',
                      checked: hideSubqueries,
                      onChange: (checked) => {
                        layoutDirtyRef.current = false
                        setFocusId(null)
                        setHideSubqueries(checked)
                        setTidyNonce((nonce) => nonce + 1)
                      },
                    }
              }
              onContentFiltersChange={(ids) => {
                layoutDirtyRef.current = false
                setFocusId(null)
                setContentFilters(ids)
                setTidyNonce((nonce) => nonce + 1)
              }}
              contentFilterTitle="DWH filtresi"
              contentFilterDescription="Görünümde yer alacak DWH katmanlarını seçer"
              layerTitle={layoutMode === 'swimlane' ? 'DWH Katmanı' : 'Seviye'}
              collapseAllLabel={
                layoutMode === 'swimlane'
                  ? `Sadece ${DWH_SWIMLANE_LABELS[swimlaneKeys[0] ?? 'LD']} katmanını göster`
                  : 'Yalnızca doğrudan kaynakları göster'
              }
              collapseLayerLabel={
                layoutMode === 'swimlane'
                  ? visibleControlLayer > 1
                    ? `${DWH_SWIMLANE_LABELS[swimlaneKeys[visibleControlLayer - 1] ?? 'LD']} katmanını kapat`
                    : 'İlk DWH katmanı açık'
                  : visibleControlLayer > 1
                    ? `${visibleControlLayer - 1}. seviyeye dön`
                    : 'İlk seviye açık'
              }
              expandLayerLabel={
                layoutMode === 'swimlane'
                  ? visibleControlLayer < swimlaneMaxLayer
                    ? `${DWH_SWIMLANE_LABELS[swimlaneKeys[visibleControlLayer] ?? 'LD']} katmanını aç`
                    : 'Tüm DWH katmanları açık'
                  : visibleControlLayer < graphMaxHop
                    ? `${visibleControlLayer + 1}. seviyeyi aç`
                    : 'Tüm seviyeler açık'
              }
              expandAllLabel={layoutMode === 'swimlane' ? 'Tüm DWH katmanlarını aç' : 'Tüm seviyeleri aç'}
              layerStatusLabel={
                layoutMode === 'swimlane'
                  ? `${visibleControlLayer} / ${swimlaneMaxLayer} DWH katmanı görünür`
                  : `${visibleControlLayer} / ${graphMaxHop} seviye görünür`
              }
              autoFitAfterTidy={false}
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
        connections={inspectedConnections}
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
