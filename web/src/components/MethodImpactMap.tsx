import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { MethodImpactGraph, MethodRef } from '../types'

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

type ViewMode = 'services' | 'methods'

const NODE_W = 176
const COL_GAP = 280
const ROW_GAP = 96
const LEFT_X = 40
const MAX_VISIBLE_PER_LAYER = 4
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
  sub: string
  kind: 'center' | 'service' | 'method' | 'collapsed'
  hop: number
  serviceId?: string
  methodId?: string
  count?: number
  hiddenIds?: string[]
}

function MapNodeView({ data }: NodeProps<MapNodeData>) {
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed'
  return (
    <div
      className={[
        'dd-node method-map-node',
        isCenter && 'center',
        isCollapsed && 'collapsed',
        data.kind === 'service' && 'svc-agg',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Left} id="in" className="dd-handle" />
      <div className="dd-node-ring" />
      <div className="dd-node-body">
        <span className="dd-node-label">{data.label}</span>
        <span className="dd-node-hop">{data.sub}</span>
        {!isCenter && !isCollapsed && (
          <span className="dd-node-hop">{data.hop}. katman</span>
        )}
        {isCollapsed && (
          <span className="dd-node-hop">
            genişlet · {data.count}{' '}
            {data.kind === 'collapsed' ? 'öğe' : ''}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="out" className="dd-handle" />
    </div>
  )
}

const nodeTypes = { methodNode: memo(MapNodeView) }

function FitViewOnLayers({
  visibleMaxHop,
  nodeCount,
  layoutKey,
}: {
  visibleMaxHop: number
  nodeCount: number
  layoutKey: string | number
}) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const id = window.setTimeout(() => {
      fitView({ padding: 0.24, duration: 320 })
    }, 40)
    return () => window.clearTimeout(id)
  }, [visibleMaxHop, nodeCount, layoutKey, fitView])
  return null
}

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
): { nodes: Node<MapNodeData>[]; edges: Edge[] } {
  const byHop = new Map<number, LayerItem[]>()
  for (const it of items) {
    const list = byHop.get(it.hop) ?? []
    list.push(it)
    byHop.set(it.hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)

  const centerLabel =
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
        label: centerLabel,
        sub: centerSub,
        kind: 'center',
        hop: 0,
        serviceId: center.serviceId,
        methodId: center.id,
      },
      position: { x: LEFT_X, y: 80 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
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
    if (!expanded && all.length > MAX_VISIBLE_PER_LAYER) {
      const rest = all.length - MAX_VISIBLE_PER_LAYER
      if (rest >= MIN_COLLAPSE_COUNT) {
        visible = all.slice(0, MAX_VISIBLE_PER_LAYER)
        hidden = all.slice(MAX_VISIBLE_PER_LAYER)
      }
    }

    visible.forEach((it, i) => {
      visibleIds.add(it.id)
      nodes.push({
        id: it.id,
        type: 'methodNode',
        data: {
          label: it.label,
          sub: it.sub,
          kind: it.kind,
          hop,
          serviceId: it.serviceId,
          methodId: it.methodId,
          count: it.methodCount,
        },
        position: {
          x: LEFT_X + hop * (NODE_W + COL_GAP),
          y: 40 + i * ROW_GAP,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      })
    })

    if (hidden.length) {
      const collapseId = `collapsed-mhop-${hop}`
      nodes.push({
        id: collapseId,
        type: 'methodNode',
        data: {
          label: `+${hidden.length} daha`,
          sub: `${hop}. katman`,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((h) => h.id),
        },
        position: {
          x: LEFT_X + hop * (NODE_W + COL_GAP),
          y: 40 + visible.length * ROW_GAP,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      })
    }
  }

  const hop1Count =
    nodes.filter((n) => n.data.hop === 1 && n.data.kind !== 'collapsed')
      .length || 1
  const centerNode = nodes.find((n) => n.id === centerId)
  if (centerNode) {
    centerNode.position.y = 40 + ((hop1Count - 1) * ROW_GAP) / 2
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

  return { nodes, edges }
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
  const mapRef = useRef<HTMLDivElement>(null)

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

  const built = useMemo(
    () =>
      buildLayeredMap(
        graph.center,
        viewMode,
        layered.items,
        layered.edges,
        expandedLayers,
        visibleMaxHop,
      ),
    [graph.center, viewMode, layered, expandedLayers, visibleMaxHop],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  useEffect(() => {
    setExpandedLayers(new Set())
    setVisibleMaxHop(1)
    setFocusId(null)
    setViewMode('services')
  }, [graph.center.id])

  useEffect(() => {
    setExpandedLayers(new Set())
    setVisibleMaxHop(1)
    setFocusId(null)
  }, [viewMode])

  useEffect(() => {
    setNodes(built.nodes)
    setEdges(built.edges)
  }, [built, setNodes, setEdges])

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

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<MapNodeData>) => {
      if (node.data.kind === 'collapsed') {
        setExpandedLayers((prev) => new Set(prev).add(node.data.hop))
        return
      }
      if (node.data.kind === 'center') {
        onClearMethod()
        return
      }
      if (viewMode === 'services' && node.data.serviceId) {
        onSelectService(node.data.serviceId)
        return
      }
      if (node.data.methodId && node.data.serviceId) {
        onSelectMethod(node.data.serviceId, node.data.methodId)
      }
    },
    [onClearMethod, onSelectMethod, onSelectService, viewMode],
  )

  const nextHop =
    visibleMaxHop < maxHopAvailable ? visibleMaxHop + 1 : undefined

  const serviceCount = useMemo(() => {
    const s = new Set(graph.nodes.map((n) => n.method.serviceId))
    s.delete(graph.center.serviceId)
    return s.size
  }, [graph])

  return (
    <div
      ref={mapRef}
      className={`impact-map dd-map method-impact-map ${focusId ? 'is-focusing' : ''}`}
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
        <div className="path-layer-actions">
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={visibleMaxHop <= 1}
            onClick={() => setVisibleMaxHop((h) => Math.max(1, h - 1))}
          >
            Katmanı daralt
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={!nextHop}
            onClick={() =>
              setVisibleMaxHop((h) => Math.min(maxHopAvailable, h + 1))
            }
          >
            {nextHop ? `${nextHop}. katmanı aç` : 'Katmanlar açık'}
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={visibleMaxHop >= maxHopAvailable}
            onClick={() => {
              setVisibleMaxHop(maxHopAvailable)
              setExpandedLayers(new Set(layered.items.map((n) => n.hop)))
            }}
          >
            Bütün katmanları aç
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={visibleMaxHop <= 1}
            onClick={() => {
              setVisibleMaxHop(1)
              setExpandedLayers(new Set())
            }}
          >
            Hepsini daralt
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        minZoom={0.2}
        maxZoom={1.6}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, n) => setFocusId(n.id)}
        onNodeMouseLeave={() => setFocusId(null)}
        defaultEdgeOptions={{
          style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
          markerEnd: EDGE_MARKER,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnLayers
          visibleMaxHop={visibleMaxHop}
          nodeCount={nodes.length}
          layoutKey={`${viewMode}-${expandedLayers.size}-${graph.center.id}`}
        />
        <Background gap={22} color="#e4e0d6" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
