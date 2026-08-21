/**
 * Method etki haritası — seçili metodun çağıran blast’ı.
 *
 * viewMode:
 * - services → servis düğümleri (çağıran servisler)
 * - methods  → method düğümleri (daha ince call-graph)
 *
 * Kaynak: GET /api/methods/:id/impact-graph
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
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
  radialAnchorOffset,
  radialLabelDomStyle,
  radialLabelSide,
  radialNodeHitStyle,
  wrapRadialName,
  type MapLayout,
  type MapLayoutMode,
  type RadialLabelSide,
} from '../impact/mapLayout'
import type { MethodImpactGraph, MethodRef } from '../types'
import { MapCanvasBar, MapViewportSync, RadialLabelZoomSync } from './ImpactChrome'

type Props = {
  graph: MethodImpactGraph
  onSelectMethod: (serviceId: string, methodId: string) => void
  onSelectService: (serviceId: string) => void
  onClearMethod: () => void
  onPivotBack?: () => void
  onPivotForward?: () => void
  canPivotBack?: boolean
  canPivotForward?: boolean
}

/** Servis özeti ↔ method detayı geçişi (üst toolbar). */
type ViewMode = 'services' | 'methods'

const LEFT_X = 40
const MAX_VISIBLE_PER_LAYER = 4
const RADIAL_HOP1_CAP = 8
const MIN_COLLAPSE_COUNT = 3

const EDGE_COLOR = '#2f6f55'
const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color: EDGE_COLOR,
} as const

type MapNodeData = {
  label: string
  fullLabel: string
  showTip: boolean
  size: MapLayout['size']
  sub: string
  kind: 'center' | 'service' | 'method' | 'collapsed'
  hop: number
  serviceId?: string
  methodId?: string
  count?: number
  hiddenIds?: string[]
  radialDot?: boolean
  radialAngle?: number
  radialCx?: number
  radialCy?: number
  radialLabelSide?: RadialLabelSide
  radialLabelGapBoost?: number
}

function MapNodeView({ data, xPos, yPos }: NodeProps<MapNodeData>) {
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
        ? `Aç · ${data.count ?? 0} öğe daha`
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
        'dd-node method-map-node',
        `size-${data.size}`,
        isCenter && 'center',
        isCollapsed && 'collapsed',
        data.kind === 'service' && 'svc-agg',
        radial && 'radial-dot',
      ]
        .filter(Boolean)
        .join(' ')}
      style={radial ? { width: 'auto', height: 'auto', overflow: 'visible' } : undefined}
    >
      <Handle type="target" position={Position.Left} id="in" className="dd-handle" />
      <div className="dd-node-ring" />
      <div className="dd-node-body">
        {!radial && (
          <>
            {label}
            <span className="dd-node-hop">{data.sub}</span>
            {!isCenter && !isCollapsed && (
              <span className="dd-node-hop">{data.hop}. katman</span>
            )}
            {isCollapsed && (
              <span className="dd-node-hop">
                Aç · {data.count} öğe daha
              </span>
            )}
          </>
        )}
      </div>
      {radial && (
        <div className="dd-radial-shell" style={radialHit}>
          <span
            className={`dd-radial-core${isCenter ? ' is-center' : ''}`}
            aria-hidden
          />
          {isCenter ? (
            <span
              className="dd-radial-label is-center-label"
              style={radialLabelDomStyle(
                'below',
                data.fullLabel || data.label,
                true,
                'Merkez',
              )}
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
              className={[
                'dd-radial-label',
                data.showTip && 'name-tip is-short',
              ]
                .filter(Boolean)
                .join(' ')}
              style={radialLabelStyle}
              data-tip={data.showTip ? data.fullLabel : undefined}
            >
              {hopLine ? (
                <span className="dd-radial-hop">{hopLine}</span>
              ) : null}
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" className="dd-handle" />
    </div>
  )
}

const nodeTypes = { methodNode: memo(MapNodeView) }

type LayerItem = {
  id: string
  hop: number
  label: string
  sub: string
  kind: 'service' | 'method'
  serviceId: string
  methodId?: string
  methodCount?: number
}

/** Metod blast → servis blast (çağıran servisler; min hop) */
function layersAsServices(graph: MethodImpactGraph): {
  items: LayerItem[]
  edges: { fromId: string; toId: string; hop: number }[]
} {
  const centerSvc = graph.center.serviceId
  const hopBySvc = new Map<string, number>()
  const nameBySvc = new Map<string, string>()
  const countBySvc = new Map<string, number>()

  nameBySvc.set(centerSvc, graph.center.serviceName)
  for (const n of graph.nodes) {
    const sid = n.method.serviceId
    if (sid === centerSvc) continue
    nameBySvc.set(sid, n.method.serviceName)
    countBySvc.set(sid, (countBySvc.get(sid) ?? 0) + 1)
    const prev = hopBySvc.get(sid)
    if (prev === undefined || n.hop < prev) hopBySvc.set(sid, n.hop)
  }

  const items: LayerItem[] = [...hopBySvc.entries()].map(([sid, hop]) => ({
    id: sid,
    hop,
    label: nameBySvc.get(sid) ?? sid,
    sub: `${countBySvc.get(sid) ?? 1} çağıran method`,
    kind: 'service' as const,
    serviceId: sid,
    methodCount: countBySvc.get(sid) ?? 1,
  }))

  const edgeSet = new Set<string>()
  const edges: { fromId: string; toId: string; hop: number }[] = []
  for (const e of graph.edges) {
    const fromM =
      e.fromId === graph.center.id
        ? graph.center
        : graph.nodes.find((n) => n.method.id === e.fromId)?.method
    const toM = graph.nodes.find((n) => n.method.id === e.toId)?.method
    if (!fromM || !toM) continue
    if (fromM.serviceId === toM.serviceId) continue
    const key = `${fromM.serviceId}->${toM.serviceId}`
    if (edgeSet.has(key)) continue
    edgeSet.add(key)
    const hop = hopBySvc.get(toM.serviceId) ?? e.hop
    edges.push({ fromId: fromM.serviceId, toId: toM.serviceId, hop })
  }

  return { items, edges }
}

function layersAsMethods(graph: MethodImpactGraph): {
  items: LayerItem[]
  edges: { fromId: string; toId: string; hop: number }[]
} {
  const items: LayerItem[] = graph.nodes.map((n) => ({
    id: n.method.id,
    hop: n.hop,
    label: `${n.method.className}.${n.method.name}`,
    sub: n.method.serviceName,
    kind: 'method' as const,
    serviceId: n.method.serviceId,
    methodId: n.method.id,
  }))
  return {
    items,
    edges: graph.edges.map((e) => ({
      fromId: e.fromId,
      toId: e.toId,
      hop: e.hop,
    })),
  }
}

function buildLayeredMap(
  center: MethodRef,
  mode: ViewMode,
  items: LayerItem[],
  rawEdges: { fromId: string; toId: string; hop: number }[],
  expandedLayers: Set<number>,
  visibleMaxHop: number,
  layout: MapLayout,
  layoutMode: MapLayoutMode = 'ltr',
): { nodes: Node<MapNodeData>[]; edges: Edge[] } {
  const { nodeW, colGap, rowGap, size, tipChars } = layout
  const colPitch = nodeW + colGap
  const byHop = new Map<number, LayerItem[]>()
  for (const it of items) {
    const list = byHop.get(it.hop) ?? []
    list.push(it)
    byHop.set(it.hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)

  const centerFull =
    mode === 'services'
      ? center.serviceName
      : `${center.className}.${center.name}`
  const centerSub =
    mode === 'services'
      ? `${center.className}.${center.name}`
      : center.serviceName

  const nodes: Node<MapNodeData>[] = [
    {
      id: mode === 'services' ? center.serviceId : center.id,
      type: 'methodNode',
      data: {
        label: centerFull,
        fullLabel: centerFull,
        showTip: mapLabelNeedsTip(centerFull, tipChars),
        size,
        sub: compactMapLabel(centerSub, Math.min(36, tipChars)),
        kind: 'center',
        hop: 0,
        serviceId: center.serviceId,
        methodId: center.id,
      },
      position: { x: LEFT_X, y: 80 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  const visibleIds = new Set<string>([nodes[0]!.id])
  const centerId = nodes[0]!.id

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    const all = byHop.get(hop) ?? []
    const expanded = expandedLayers.has(hop)
    let visible = all
    let hidden: LayerItem[] = []
    const cap =
      layoutMode === 'radial' ? RADIAL_HOP1_CAP : MAX_VISIBLE_PER_LAYER
    const minRest = layoutMode === 'radial' ? 1 : MIN_COLLAPSE_COUNT
    if (!expanded && all.length > cap) {
      const rest = all.length - cap
      if (rest >= minRest) {
        visible = all.slice(0, cap)
        hidden = all.slice(cap)
      }
    }

    visible.forEach((it, i) => {
      visibleIds.add(it.id)
      nodes.push({
        id: it.id,
        type: 'methodNode',
        data: {
          label: it.label,
          fullLabel: it.label,
          showTip: mapLabelNeedsTip(
            it.label,
            layoutMode === 'radial' ? 14 : tipChars,
          ),
          size,
          sub: compactMapLabel(it.sub, Math.min(32, tipChars - 4)),
          kind: it.kind,
          hop,
          serviceId: it.serviceId,
          methodId: it.methodId,
          count: it.methodCount,
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + i * rowGap,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    })

    if (hidden.length) {
      const collapseId = `collapsed-mhop-${hop}`
      nodes.push({
        id: collapseId,
        type: 'methodNode',
        data: {
          label: `+${hidden.length} servis daha`,
          fullLabel: `+${hidden.length} servis daha`,
          showTip: false,
          size,
          sub: `${hop}. katman`,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((h) => h.id),
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + visible.length * rowGap,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    }
  }

  const hop1Count =
    nodes.filter((n) => n.data.hop === 1 && n.data.kind !== 'collapsed')
      .length || 1
  const centerNode = nodes.find((n) => n.id === centerId)
  if (centerNode) {
    centerNode.position.y = 40 + ((hop1Count - 1) * rowGap) / 2
  }

  const edges: Edge[] = []
  for (const e of rawEdges) {
    if (e.hop > visibleMaxHop) continue
    const sourceVisible = visibleIds.has(e.fromId)
    const targetVisible = visibleIds.has(e.toId)
    const collapseId = `collapsed-mhop-${e.hop}`
    const hasCollapse = nodes.some((n) => n.id === collapseId)

    const mk = (id: string, source: string, target: string): Edge => ({
      id,
      source,
      target,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      markerEnd: EDGE_MARKER,
      className: 'dd-edge method-via',
      style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
      data: { fromId: e.fromId, toId: e.toId },
    })

    if (sourceVisible && targetVisible) {
      edges.push(mk(`${e.fromId}->${e.toId}`, e.fromId, e.toId))
    } else if (sourceVisible && !targetVisible && hasCollapse) {
      const id = `${e.fromId}->${collapseId}`
      if (!edges.some((x) => x.id === id)) {
        edges.push(mk(id, e.fromId, collapseId))
      }
    }
  }

  return {
    nodes:
      layoutMode === 'radial'
        ? applyRadialLayout(nodes, layout, {
            centerId,
            originX: LEFT_X,
            treeParent: (() => {
              const m = new Map<string, string>()
              for (const e of rawEdges) {
                if (e.toId === centerId) continue
                if (!m.has(e.toId)) m.set(e.toId, e.fromId)
              }
              return m
            })(),
          }).nodes
        : nodes,
    edges,
  }
}

export function MethodImpactMap({
  graph,
  onSelectMethod,
  onSelectService,
  onClearMethod,
  onPivotBack,
  onPivotForward,
  canPivotBack = false,
  canPivotForward = false,
}: Props) {
  /** Varsayılan: çağıran servisler */
  const [viewMode, setViewMode] = useState<ViewMode>('services')
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set())
  const [visibleMaxHop, setVisibleMaxHop] = useState(1)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [tidyNonce, setTidyNonce] = useState(0)
  const [layoutMode, setLayoutMode] = useState<MapLayoutMode>('ltr')
  const [pivotFlash, setPivotFlash] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const nodeDragged = useRef(false)
  const lastTidyRef = useRef(0)
  const layoutEpochRef = useRef('')
  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const layoutDirtyRef = useRef(false)
  const prevCenterLayoutRef = useRef(graph.center.id)

  const layered = useMemo(() => {
    return viewMode === 'services'
      ? layersAsServices(graph)
      : layersAsMethods(graph)
  }, [graph, viewMode])

  const maxHopAvailable = useMemo(() => {
    let m = 1
    for (const it of layered.items) m = Math.max(m, it.hop)
    return Math.max(1, m)
  }, [layered.items])

  const layout = useMemo(
    () =>
      layoutMode === 'radial'
        ? mapLayoutForRadial()
        : mapLayoutForDepth(visibleMaxHop),
    [visibleMaxHop, layoutMode],
  )

  const built = useMemo(
    () =>
      buildLayeredMap(
        graph.center,
        viewMode,
        layered.items,
        layered.edges,
        expandedLayers,
        visibleMaxHop,
        layout,
        layoutMode,
      ),
    [graph.center, viewMode, layered, expandedLayers, visibleMaxHop, layout, layoutMode],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  useEffect(() => {
    setExpandedLayers(new Set())
    setVisibleMaxHop(1)
    setFocusId(null)
    setViewMode('services')
    layoutDirtyRef.current = false
    setPivotFlash(true)
    const t = window.setTimeout(() => setPivotFlash(false), 560)
    return () => window.clearTimeout(t)
  }, [graph.center.id])

  useEffect(() => {
    setExpandedLayers(new Set())
    setVisibleMaxHop(1)
    setFocusId(null)
  }, [viewMode])

  useEffect(() => {
    const centerChanged = prevCenterLayoutRef.current !== graph.center.id
    prevCenterLayoutRef.current = graph.center.id
    const layoutEpoch = `${layoutMode}:${visibleMaxHop}:${layout.size}`
    const epochChanged = layoutEpochRef.current !== layoutEpoch
    layoutEpochRef.current = layoutEpoch
    const resetLayout =
      tidyNonce !== lastTidyRef.current || centerChanged || epochChanged
    lastTidyRef.current = tidyNonce
    setNodes((current) => {
      const posById = new Map(current.map((n) => [n.id, n.position]))
      return built.nodes.map((n) => ({
        ...n,
        position: resetLayout
          ? n.position
          : (posById.get(n.id) ?? n.position),
      }))
    })
    setEdges(built.edges)
  }, [
    built,
    tidyNonce,
    graph.center.id,
    layoutMode,
    visibleMaxHop,
    layout.size,
    setNodes,
    setEdges,
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
          (e) =>
            (e.source === focusId || e.target === focusId) &&
            (e.source === id || e.target === id),
        )
      el.classList.add(on ? 'rf-path-on' : 'rf-path-off')
      if (id === focusId) el.classList.add('rf-path-focus')
    })
    root.querySelectorAll<HTMLElement>('.react-flow__edge').forEach((el) => {
      el.classList.remove('dd-edge-on', 'dd-edge-off')
      if (!active) return
      const eid = el.getAttribute('data-id') ?? ''
      const edge = edges.find((e) => e.id === eid)
      const on =
        edge &&
        (edge.source === focusId ||
          edge.target === focusId ||
          (edge.data as { fromId?: string })?.fromId === focusId ||
          (edge.data as { toId?: string })?.toId === focusId)
      el.classList.add(on ? 'dd-edge-on' : 'dd-edge-off')
    })
  }, [focusId, edges])

  const centerNodeId =
    viewMode === 'services' ? graph.center.serviceId : graph.center.id

  const pivotToNode = useCallback(
    (node: Node<MapNodeData>, onDone: () => void) => {
      if (!layoutDirtyRef.current) {
        onDone()
        return
      }
      const inst = rfInstance.current
      if (inst) {
        inst.setCenter(
          node.position.x + layout.nodeW / 2,
          node.position.y + 48,
          { zoom: inst.getZoom(), duration: 340 },
        )
        window.setTimeout(onDone, 320)
        return
      }
      onDone()
    },
    [layout.nodeW],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<MapNodeData>) => {
      if (nodeDragged.current) {
        nodeDragged.current = false
        return
      }
      if (node.data.kind === 'collapsed') {
        setExpandedLayers((prev) => new Set(prev).add(node.data.hop))
        return
      }
      if (node.data.kind === 'center') {
        onClearMethod()
        return
      }
      if (viewMode === 'services' && node.data.serviceId) {
        pivotToNode(node, () => onSelectService(node.data.serviceId!))
        return
      }
      if (node.data.methodId && node.data.serviceId) {
        onSelectMethod(node.data.serviceId, node.data.methodId)
      }
    },
    [onClearMethod, onSelectMethod, onSelectService, pivotToNode, viewMode],
  )

  const serviceCount = useMemo(() => {
    const s = new Set(graph.nodes.map((n) => n.method.serviceId))
    s.delete(graph.center.serviceId)
    return s.size
  }, [graph])

  return (
    <div
      ref={mapRef}
      className={`impact-map dd-map method-impact-map ${focusId ? 'is-focusing' : ''}${pivotFlash ? ' is-pivot-flash' : ''}${layoutMode === 'radial' ? ' is-radial' : ''}`}
      onMouseLeave={() => setFocusId(null)}
    >
      <div className="path-layer-bar">
        <div className="path-layer-left">
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotBack}
            onClick={onPivotBack}
          >
            ← Geri
          </button>
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotForward}
            onClick={onPivotForward}
          >
            İleri →
          </button>
          <span className="path-bar-sep" aria-hidden />
          <span className="method-map-kicker">
            {viewMode === 'services'
              ? 'Çağıran servisler'
              : 'Çağıran method’lar'}
          </span>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            onClick={() => onSelectService(graph.center.serviceId)}
            title="Servis haritasına dön"
          >
            ← {graph.center.serviceName}
          </button>
          <span className="path-bar-sep" aria-hidden />
          <button
            type="button"
            className="btn ghost path-layer-btn"
            aria-pressed={viewMode === 'methods'}
            onClick={() =>
              setViewMode((m) => (m === 'methods' ? 'services' : 'methods'))
            }
            title="Method seviyesinde çağıran zinciri"
          >
            {viewMode === 'methods'
              ? 'Sadece bağlı olduğu servisleri göster'
              : 'Sadece bağlı olduğu method’ları göster'}
          </button>
        </div>
      </div>
      <p className="method-map-banner">
        Merkez:{' '}
        <strong>
          {graph.center.className}.{graph.center.name}
        </strong>{' '}
        ·{' '}
        {viewMode === 'services'
          ? `çağıran ${serviceCount} servis · ${graph.nodes.length} method`
          : `çağıran blast · ${graph.nodes.length} method`}
        {graph.truncated ? ` · ${graph.reason ?? 'kesildi'}` : ''}
      </p>
      <div className="map-canvas map-canvas-dock-host">
      <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
        onNodeMouseEnter={(_, n) => setFocusId(n.id)}
        onNodeMouseLeave={() => setFocusId(null)}
        onPaneClick={() => {
          nodeDragged.current = false
        }}
        defaultEdgeOptions={{
          style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
          markerEnd: EDGE_MARKER,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <RadialLabelZoomSync
          layoutTick={`${layoutMode}-${visibleMaxHop}-${tidyNonce}-${graph.center.id}`}
        />
        <MapViewportSync
          centerId={centerNodeId}
          visibleMaxHop={visibleMaxHop}
          layoutKey={`${viewMode}-${expandedLayers.size}-${graph.center.id}-${layout.size}-${layoutMode}-${tidyNonce}`}
          layout={layout}
          layoutMode={layoutMode}
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
          maxHopAvailable={maxHopAvailable}
          layout={layout}
          layoutMode={layoutMode}
          truncated={graph.truncated}
          onCollapseLayer={() => setVisibleMaxHop((h) => Math.max(1, h - 1))}
          onExpandLayer={() =>
            setVisibleMaxHop((h) => Math.min(maxHopAvailable, h + 1))
          }
          onExpandAll={() => {
            setVisibleMaxHop(maxHopAvailable)
            setExpandedLayers(new Set(layered.items.map((n) => n.hop)))
          }}
          onCollapseAll={() => {
            setVisibleMaxHop(1)
            setExpandedLayers(new Set())
          }}
          onTidyUp={() => {
            layoutDirtyRef.current = false
            setTidyNonce((n) => n + 1)
          }}
          onToggleLayoutMode={() => {
            layoutDirtyRef.current = false
            setLayoutMode((m) => (m === 'ltr' ? 'radial' : 'ltr'))
            setTidyNonce((n) => n + 1)
          }}
        />
      </ReactFlowProvider>
      </div>
    </div>
  )
}
