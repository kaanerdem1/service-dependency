import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { ImpactGraph, ImpactNode } from '../types'

type Props = {
  graph: ImpactGraph
  onPivot: (serviceId: string) => void
  onClearCenter?: () => void
}

const NODE_W = 168
const COL_GAP = 260
const ROW_GAP = 88
const LEFT_X = 48
/** İlk N görünür; kalan 1–2 ise hepsini göster, kalan ≥3 ise +N collapsed */
const MAX_VISIBLE_PER_LAYER = 4
const MIN_COLLAPSE_COUNT = 3

type ServiceNodeData = {
  label: string
  kind: 'center' | 'service' | 'collapsed'
  hop: number
  hiddenIds?: string[]
  count?: number
}

function ServiceNodeView({ data }: NodeProps<ServiceNodeData>) {
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed'
  return (
    <div
      className={[
        'dd-node',
        isCenter && 'center',
        isCollapsed && 'collapsed',
        data.hop > 1 && 'indirect',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Left} className="dd-handle" />
      <div className="dd-node-ring" />
      <div className="dd-node-body">
        <span className="dd-node-label">{data.label}</span>
        {!isCenter && !isCollapsed && (
          <span className="dd-node-hop">{data.hop}. katman</span>
        )}
        {isCollapsed && (
          <span className="dd-node-hop">genişlet · {data.count} servis</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="dd-handle" />
    </div>
  )
}

const nodeTypes = { serviceNode: memo(ServiceNodeView) }

function splitLayer(all: ImpactNode[], expanded: boolean) {
  if (expanded || all.length <= MAX_VISIBLE_PER_LAYER) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  const hiddenCount = all.length - MAX_VISIBLE_PER_LAYER
  // +1 / +2 mantıksız → direkt göster
  if (hiddenCount < MIN_COLLAPSE_COUNT) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  return {
    visible: all.slice(0, MAX_VISIBLE_PER_LAYER),
    hidden: all.slice(MAX_VISIBLE_PER_LAYER),
  }
}

function buildGraph(
  graph: ImpactGraph,
  expandedLayers: Set<number>,
): { nodes: Node<ServiceNodeData>[]; edges: Edge[] } {
  const { center, nodes: impactNodes, edges: impactEdges } = graph
  const hopOf = new Map<string, number>([[center.id, 0]])
  const byHop = new Map<number, ImpactNode[]>()

  for (const n of impactNodes) {
    hopOf.set(n.service.id, n.hop)
    const list = byHop.get(n.hop) ?? []
    list.push(n)
    byHop.set(n.hop, list)
  }

  const hops = [...byHop.keys()].sort((a, b) => a - b)
  const visibleByHop = new Map<number, ImpactNode[]>()
  const collapsedMeta = new Map<number, ImpactNode[]>()

  for (const hop of hops) {
    const { visible, hidden } = splitLayer(
      byHop.get(hop)!,
      expandedLayers.has(hop),
    )
    visibleByHop.set(hop, visible)
    if (hidden.length) collapsedMeta.set(hop, hidden)
  }

  let rowCount = 1
  for (const hop of hops) {
    const vis = visibleByHop.get(hop)?.length ?? 0
    const extra = collapsedMeta.has(hop) ? 1 : 0
    rowCount = Math.max(rowCount, vis + extra)
  }
  const centerY = 40 + ((rowCount - 1) * ROW_GAP) / 2

  const nodes: Node<ServiceNodeData>[] = [
    {
      id: center.id,
      type: 'serviceNode',
      data: { label: center.name, kind: 'center', hop: 0 },
      position: { x: LEFT_X, y: centerY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    },
  ]

  const visibleIds = new Set<string>([center.id])

  for (const hop of hops) {
    const col = visibleByHop.get(hop) ?? []
    col.forEach((n, i) => {
      visibleIds.add(n.service.id)
      nodes.push({
        id: n.service.id,
        type: 'serviceNode',
        data: { label: n.service.name, kind: 'service', hop },
        position: {
          x: LEFT_X + hop * (NODE_W + COL_GAP),
          y: 40 + i * ROW_GAP,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      })
    })

    const hidden = collapsedMeta.get(hop)
    if (hidden?.length) {
      const collapseId = `collapsed-hop-${hop}`
      nodes.push({
        id: collapseId,
        type: 'serviceNode',
        data: {
          label: `+${hidden.length} daha`,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((h) => h.service.id),
        },
        position: {
          x: LEFT_X + hop * (NODE_W + COL_GAP),
          y: 40 + col.length * ROW_GAP,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      })
    }
  }

  const seen = new Set<string>()
  const edges: Edge[] = []

  for (const e of impactEdges) {
    const fromHop = hopOf.get(e.fromId)
    const toHop = hopOf.get(e.toId)
    if (fromHop === undefined || toHop === undefined) continue
    // En uzun yol katmanında atlamalı kenarlar da çizilsin (örn. Billing→FinanceBatch)
    let source = e.fromId
    let target = e.toId

    if (!visibleIds.has(target)) {
      const collapseId = `collapsed-hop-${toHop}`
      if (!nodes.some((n) => n.id === collapseId)) continue
      target = collapseId
    }
    if (!visibleIds.has(source) && source !== center.id) {
      const collapseId = `collapsed-hop-${fromHop}`
      if (!nodes.some((n) => n.id === collapseId)) continue
      source = collapseId
    }

    if (!nodes.some((n) => n.id === source) || !nodes.some((n) => n.id === target)) {
      continue
    }

    const key = `${source}->${target}`
    if (seen.has(key)) continue
    seen.add(key)

    const direct = toHop === 1
    edges.push({
      id: key,
      source,
      target,
      type: 'default',
      animated: false,
      className: direct ? 'dd-edge direct' : 'dd-edge indirect',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: direct ? '#2f6f55' : '#8a847a',
      },
      style: {
        stroke: direct ? '#3d7a60' : '#a39e94',
        strokeWidth: direct ? 2.2 : 1.4,
        strokeDasharray: direct ? undefined : '6 5',
      },
      data: { fromId: e.fromId, toId: e.toId, hop: toHop },
    })
  }

  return { nodes, edges }
}

function relatedEdge(focusId: string, e: Edge) {
  if (e.source === focusId || e.target === focusId) return true
  const d = e.data as { fromId?: string; toId?: string } | undefined
  return d?.fromId === focusId || d?.toId === focusId
}

export function ImpactMap({ graph, onPivot, onClearCenter }: Props) {
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)

  const built = useMemo(
    () => buildGraph(graph, expandedLayers),
    [graph, expandedLayers],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  useEffect(() => {
    setExpandedLayers(new Set())
    setFocusId(null)
  }, [graph.center.id])

  useEffect(() => {
    setNodes(built.nodes)
  }, [built, setNodes])

  // Hover: yalnız kenar stilleri (node rewrite = titreme)
  useEffect(() => {
    setEdges(
      built.edges.map((e) => {
        const on = !focusId || relatedEdge(focusId, e)
        return {
          ...e,
          animated: Boolean(focusId && on),
          style: {
            ...e.style,
            opacity: !focusId || on ? 1 : 0.1,
            strokeWidth:
              focusId && on
                ? Number(e.style?.strokeWidth ?? 2) + 0.6
                : e.style?.strokeWidth,
          },
        }
      }),
    )
  }, [built.edges, focusId, setEdges])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<ServiceNodeData>) => {
      if (node.data.kind === 'collapsed') {
        setExpandedLayers((prev) => new Set(prev).add(node.data.hop))
        return
      }
      if (node.id === graph.center.id) {
        onClearCenter?.()
        return
      }
      onPivot(node.id)
    },
    [graph.center.id, onClearCenter, onPivot],
  )

  return (
    <div
      className={`impact-map dd-map ${focusId ? 'is-focusing' : ''}`}
      data-focus={focusId ?? undefined}
    >
      <p className="map-legend">
        Seçili servis → etkilenenler · katman = en kısa yol (1 = doğrudan / onay)
        {graph.truncated ? ' · görünüm kısaltıldı' : ''}
      </p>
      {graph.truncated && graph.reason && (
        <p className="map-budget-hint">{graph.reason}</p>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        minZoom={0.35}
        maxZoom={1.5}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, node) => setFocusId(node.id)}
        onNodeMouseLeave={() => setFocusId(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} color="#e4e0d6" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
