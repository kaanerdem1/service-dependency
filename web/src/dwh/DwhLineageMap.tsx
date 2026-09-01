import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  BaseEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
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
import { MapCanvasBar, MapViewportSync, RadialLabelZoomSync } from '../components/ImpactChrome'
import type {
  DwhLineageEntityKind,
  DwhLineageGraph,
  DwhLineageNode,
  DwhLineageNodeKind,
} from './types'

type Props = {
  graph?: DwhLineageGraph
  loading?: boolean
  mapExpanded?: boolean
  active?: boolean
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
  kind: 'center' | DwhLineageNodeKind | 'collapsed'
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
}

const LEFT_X = 40
const MAX_VISIBLE_PER_LAYER = 5
const RADIAL_VISIBLE_CAP = 10
const MIN_COLLAPSE_COUNT = 3
const EDGE_COLOR = '#2f6f55'
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
  cx?: number
  cy?: number
  sx?: number
  sy?: number
  tx?: number
  ty?: number
  sr?: number
  tr?: number
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

const DwhRadialEdgeMemo = memo(DwhRadialEdge)

const DWH_EDGE_TYPES = {
  radial: DwhRadialEdgeMemo,
}

function DwhFlowNode({ data, xPos, yPos }: NodeProps<DwhNodeData>) {
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed'
  const radial = Boolean(data.radialDot)
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
      <Handle type="target" position={Position.Left} id="in" className="dd-handle" />
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
      <Handle type="source" position={Position.Right} id="out" className="dd-handle" />
    </div>
  )
}

const DwhFlowNodeMemo = memo(DwhFlowNode)

const DWH_NODE_TYPES = {
  dwhNode: DwhFlowNodeMemo,
}

function splitLayer(
  all: DwhLineageNode[],
  expanded: boolean,
  layoutMode: MapLayoutMode,
) {
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

function buildDwhMap(
  graph: DwhLineageGraph,
  expandedLayers: Set<number>,
  visibleMaxHop: number,
  layout: MapLayout,
  layoutMode: MapLayoutMode,
): { nodes: Node<DwhNodeData>[]; edges: Edge[]; hops: number[] } {
  const { nodeW, colGap, rowGap, tipChars } = layout
  const colPitch = nodeW + colGap
  const root = graph.nodes.find((node) => node.id === graph.rootId) ?? graph.nodes[0]
  if (!root) return { nodes: [], edges: [], hops: [] }

  const byHop = new Map<number, DwhLineageNode[]>()
  for (const node of graph.nodes) {
    if (node.id === graph.rootId) continue
    const hop = Math.max(1, node.depth)
    const list = byHop.get(hop) ?? []
    list.push(node)
    byHop.set(hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)
  const visibleByHop = new Map<number, DwhLineageNode[]>()
  const collapsedMeta = new Map<number, DwhLineageNode[]>()

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
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
    if (hop > visibleMaxHop) continue
    const visible = visibleByHop.get(hop) ?? []
    visible.forEach((node, i) => {
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
      type: radialTree ? 'radial' : 'smoothstep',
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
  onSelectTable,
  onSelectReport,
}: Props) {
  const graphMaxHop = useMemo(() => maxHop(graph), [graph])
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set())
  const [visibleMaxHop, setVisibleMaxHop] = useState(graphMaxHop)
  const [layoutMode, setLayoutMode] = useState<MapLayoutMode>('ltr')
  const [focusId, setFocusId] = useState<string | null>(null)
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
    setVisibleMaxHop(graphMaxHop)
    setExpandedLayers(new Set())
    setFocusId(null)
    layoutDirtyRef.current = false
  }, [graph?.rootId, graphMaxHop])

  const layout = useMemo(
    () => (layoutMode === 'radial' ? mapLayoutForRadial() : mapLayoutForDepth(visibleMaxHop)),
    [layoutMode, visibleMaxHop],
  )

  const built = useMemo(
    () =>
      graph
        ? buildDwhMap(graph, expandedLayers, visibleMaxHop, layout, layoutMode)
        : { nodes: [] as Node<DwhNodeData>[], edges: [] as Edge[], hops: [] as number[] },
    [graph, expandedLayers, visibleMaxHop, layout, layoutMode],
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
    visibleMaxHop,
    layout.size,
    graph?.rootId,
    tidyNonce,
    mapExpanded,
    mapSize.width,
    mapSize.height,
  ])

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
    const layoutEpoch = `${layoutMode}:${visibleMaxHop}:${layout.size}:${mapExpanded}`
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
    visibleMaxHop,
  ])

  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const active = Boolean(focusId)
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.remove('rf-path-on', 'rf-path-off', 'rf-path-focus')
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
  }, [edges, focusId])

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
      if (node.data.entityKind === 'table' && node.data.tableId) onSelectTable(node.data.tableId)
      if (node.data.entityKind === 'report' && node.data.reportId) onSelectReport(node.data.reportId)
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
      className={`impact-map dd-map dwh-lineage-map ${focusId ? 'is-focusing' : ''}${layoutMode === 'radial' ? ' is-radial' : ''}`}
      onMouseLeave={() => setFocusId(null)}
    >
      {graph.truncated ? (
        <p className="map-budget-hint">Grafik sınır nedeniyle kısaltıldı.</p>
      ) : null}
      <div className="map-canvas map-canvas-dock-host">
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
              onNodeMouseEnter={(_, node) => setFocusId(node.id)}
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
                layoutTick={`${layoutMode}-${visibleMaxHop}-${tidyNonce}-${graph.rootId}-${mapExpanded}`}
              />
              <MapViewportSync
                centerId={graph.rootId}
                visibleMaxHop={visibleMaxHop}
                layoutKey={`${expandedLayers.size}-${graph.rootId}-${layout.size}-${layoutMode}-${tidyNonce}-${visibleMaxHop}-${mapExpanded}`}
                layout={layout}
                layoutMode={layoutMode}
                mapExpanded={mapExpanded}
                viewportSyncKey={viewportSyncKey}
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={18}
                size={1.55}
                color="var(--map-dot)"
              />
            </ReactFlow>
            <MapCanvasBar
              visibleMaxHop={visibleMaxHop}
              maxHopAvailable={graphMaxHop}
              layout={layout}
              layoutMode={layoutMode}
              truncated={graph.truncated}
              onCollapseLayer={() => setVisibleMaxHop((hop) => Math.max(1, hop - 1))}
              onExpandLayer={() => setVisibleMaxHop((hop) => Math.min(graphMaxHop, hop + 1))}
              onExpandAll={() => {
                setVisibleMaxHop(graphMaxHop)
                setExpandedLayers(new Set(built.hops))
              }}
              onCollapseAll={() => {
                setVisibleMaxHop(1)
                setExpandedLayers(new Set())
              }}
              onTidyUp={() => {
                layoutDirtyRef.current = false
                setTidyNonce((nonce) => nonce + 1)
              }}
              onToggleLayoutMode={() => {
                layoutDirtyRef.current = false
                setLayoutMode((mode) => (mode === 'ltr' ? 'radial' : 'ltr'))
                setTidyNonce((nonce) => nonce + 1)
              }}
            />
          </ReactFlowProvider>
        ) : (
          <div className="dwh-map-empty">Lineage grafiği hazırlanıyor...</div>
        )}
      </div>
    </div>
  )
}

export function DwhLineageMap(props: Props) {
  return <DwhLineageMapInner {...props} />
}
