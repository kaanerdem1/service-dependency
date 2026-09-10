import { memo, useCallback, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { ProcessDecisionInfo, ProcessFlowGraph, ProcessFlowNodeKind } from '../types'
import { KTF_REFERENCE_POSITIONS, KTF_REFERENCE_ROUTES } from './processFlowReferenceLayout'

const RANK_SEP = 250
const NODE_SEP = 82
const ORIGIN = { x: 60, y: 49.2 }
const NODE_W = 168
const RAIL_PAD = 36
const RAIL_GAP = 16
const CORNER = 14

type ProcessNodeData = {
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
  decisionInfo?: ProcessDecisionInfo
}

type RouteKind = 'direct' | 'jump' | 'back'

type ProcessEdgeData = {
  originalId?: string
  labels?: string[]
  route?: RouteKind
  active?: boolean
  dim?: boolean
}

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  dummy: 'Adım',
  other: 'Adım',
}

const CRITERIA_LABEL: Record<string, string> = {
  organization: 'Organizasyon',
  organizationType: 'Org. tipi',
  organizationGroup: 'Org. grubu',
  profile: 'Profil',
  channelCode: 'Kanal',
  unit: 'Birim',
}

function formatDecisionCriteria(criteria: Record<string, string>): string {
  const entries = Object.entries(criteria)
  if (!entries.length) return 'kriter yok (diğer / varsayılan)'
  return entries.map(([k, v]) => `${CRITERIA_LABEL[k] ?? k}: ${v}`).join(' · ')
}

function Ports() {
  return (
    <>
      <Handle id="l" type="target" position={Position.Left} className="pf-h" />
      <Handle id="r" type="source" position={Position.Right} className="pf-h" />
      <Handle id="t" type="source" position={Position.Top} className="pf-h" />
      <Handle id="ti" type="target" position={Position.Top} className="pf-h" />
      <Handle id="b" type="source" position={Position.Bottom} className="pf-h" />
      <Handle id="bi" type="target" position={Position.Bottom} className="pf-h" />
    </>
  )
}

function ProcessStepNode({ data, selected }: NodeProps<ProcessNodeData>) {
  if (data.kind === 'start' || data.kind === 'end') {
    return (
      <div className={`pf-node pf-node-event is-${data.kind}${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-event-kicker">{KIND_LABEL[data.kind]}</span>
        <div className="pf-event-circle" />
        <strong className="pf-event-label">{data.label}</strong>
      </div>
    )
  }

  if (data.kind === 'decision') {
    const rules = data.decisionInfo?.rules ?? []
    return (
      <div className={`pf-node pf-node-gateway is-decision${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-event-kicker">{KIND_LABEL.decision}</span>
        <div className="pf-gateway-diamond">
          <span className="pf-gateway-mark">✕</span>
        </div>
        <strong className="pf-gateway-label">{data.label}</strong>
        {rules.length > 0 ? (
          <div className="pf-decision-info" title="Karar kriterleri">
            <span className="pf-decision-badge">i</span>
            <div className="pf-decision-tooltip">
              <div className="pf-decision-tooltip-title">
                Hangi ok neden seçilir? (istek sahibinin bilgilerine göre)
              </div>
              {rules.map((r) => (
                <div className="pf-decision-rule" key={r.transition}>
                  <span className="pf-decision-rule-key">{r.transition}</span>
                  <span className="pf-decision-rule-val">{formatDecisionCriteria(r.criteria)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`pf-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Ports />
      {data.kind === 'service' ? <span className="pf-node-icon">⚙</span> : null}
      <span className="pf-node-kind">{KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      {data.services[0] ? (
        <span className="pf-node-svc" title={data.services.join(', ')}>
          {data.services[0]}
        </span>
      ) : null}
    </div>
  )
}

function railSlot(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % 5
  return h
}

function classifyRoute(sourceX: number, targetX: number): RouteKind {
  if (targetX < sourceX - 20) return 'back'
  if (targetX - sourceX > RANK_SEP * 0.8) return 'jump'
  return 'direct'
}

function handlesFor(route: RouteKind) {
  if (route === 'jump') return { sourceHandle: 'b', targetHandle: 'bi' }
  if (route === 'back') return { sourceHandle: 't', targetHandle: 'ti' }
  return { sourceHandle: 'r', targetHandle: 'l' }
}

function kitEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  route: RouteKind,
  slotKey: string,
) {
  if (route === 'direct') {
    const path = `M ${sourceX},${sourceY} C ${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`
    return {
      path,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2,
    }
  }
  const slot = railSlot(slotKey)
  const r = CORNER
  if (route === 'back') {
    const railY = Math.min(sourceY, targetY) - RAIL_PAD - slot * RAIL_GAP
    const path = `M ${sourceX},${sourceY} L ${sourceX},${railY + r} Q ${sourceX},${railY} ${sourceX - r},${railY} L ${targetX + r},${railY} Q ${targetX},${railY} ${targetX},${railY + r} L ${targetX},${targetY}`
    return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
  }
  const railY = Math.max(sourceY, targetY) + RAIL_PAD + slot * RAIL_GAP
  const path = `M ${sourceX},${sourceY} L ${sourceX},${railY - r} Q ${sourceX},${railY} ${sourceX + r},${railY} L ${targetX - r},${railY} Q ${targetX},${railY} ${targetX},${railY - r} L ${targetX},${targetY}`
  return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
}

function ProcessEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  label,
  data,
}: EdgeProps<ProcessEdgeData>) {
  const route = data?.route ?? classifyRoute(sourceX, targetX)
  const { path: edgePath, labelX, labelY } = kitEdgePath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    route,
    data?.originalId ?? id,
  )
  const active = !!data?.active
  const dim = !!data?.dim
  const stroke = active
    ? '#2f6fed'
    : route === 'back'
      ? '#e05b4f'
      : route === 'jump'
        ? '#2f6fed'
        : '#a8b0bc'
  const dash = active ? undefined : route === 'direct' ? undefined : '5 4'
  const width = active ? 2.5 : route === 'direct' ? 1.5 : 1.3
  const opacity = active ? 1 : dim ? 0.16 : route === 'direct' ? 1 : 0.55
  const stateClass = active ? ' is-onpath' : dim ? ' is-dim' : ''
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={active ? 'url(#pf-arrow-active)' : `url(#pf-arrow-${route})`}
        style={{ ...style, stroke, strokeWidth: width, strokeDasharray: dash, opacity }}
        interactionWidth={28}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`pf-edge-label${stateClass}`}
            title={data?.labels?.length ? data.labels.join(' · ') : undefined}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

const nodeTypes: NodeTypes = { processStep: memo(ProcessStepNode) }
const edgeTypes: EdgeTypes = { processEdge: memo(ProcessEdge) }

function isDummyId(id: string) {
  return id.startsWith('d:')
}

function bundleLabel(labels: string[]) {
  const filled = labels.filter(Boolean)
  const uniq = [...new Set(filled)]
  if (uniq.length === 0) return labels.length > 1 ? `${labels.length} geçiş` : undefined
  if (uniq.length === 1) return filled.length > 1 ? `${uniq[0]} ×${filled.length}` : uniq[0]
  if (uniq.length <= 3) return uniq.join(' · ')
  return `${uniq.length} geçiş`
}

function visualSegments(graph: ProcessFlowGraph) {
  const groups = new Map<string, { from: string; to: string; ids: string[]; labels: string[] }>()
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const key = `${e.from}\0${e.to}`
    const g = groups.get(key) ?? { from: e.from, to: e.to, ids: [], labels: [] }
    g.ids.push(e.id)
    if (e.label) g.labels.push(e.label)
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => ({
    from: g.from,
    to: g.to,
    label: bundleLabel(g.labels),
    originalId: g.ids[0]!,
    labels: g.labels,
  }))
}

function layeredLayout(graph: ProcessFlowGraph) {
  const children = new Map<string, string[]>()
  for (const n of graph.nodes) {
    if (n.kind !== 'dummy') children.set(n.id, [])
  }
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const list = children.get(e.from)
    if (list && !list.includes(e.to)) list.push(e.to)
  }
  const hop = new Map<string, number>()
  const q: string[] = []
  for (const n of graph.nodes) {
    if (n.kind === 'start') {
      hop.set(n.id, 0)
      q.push(n.id)
    }
  }
  while (q.length) {
    const from = q.shift()!
    const h = hop.get(from) ?? 0
    for (const to of children.get(from) ?? []) {
      const next = h + 1
      if (!hop.has(to) || next < hop.get(to)!) {
        hop.set(to, next)
        q.push(to)
      }
    }
  }
  for (const n of graph.nodes) {
    if (n.kind !== 'dummy' && !hop.has(n.id)) hop.set(n.id, 0)
  }
  const byHop = new Map<number, string[]>()
  for (const [id, h] of hop) {
    const list = byHop.get(h) ?? []
    list.push(id)
    byHop.set(h, list)
  }
  const positions: Record<string, { x: number; y: number }> = {}
  for (const h of [...byHop.keys()].sort((a, b) => a - b)) {
    const ids = (byHop.get(h) ?? []).sort((a, b) => a.localeCompare(b, 'tr'))
    ids.forEach((id, i) => {
      positions[id] = { x: ORIGIN.x + h * RANK_SEP, y: ORIGIN.y + i * NODE_SEP }
    })
  }
  return positions
}

function positionsFor(graph: ProcessFlowGraph) {
  const fallback = layeredLayout(graph)
  if (graph.no !== '105116') return fallback
  const out = { ...fallback }
  for (const n of graph.nodes) {
    if (n.kind === 'dummy') continue
    const ref = KTF_REFERENCE_POSITIONS[n.id] ?? KTF_REFERENCE_POSITIONS[n.name]
    if (ref) out[n.id] = ref
  }
  return out
}

function routeFor(graph: ProcessFlowGraph, from: string, to: string, fromX: number, toX: number): RouteKind {
  if (graph.no === '105116') {
    const hit = KTF_REFERENCE_ROUTES[`${from}\0${to}`]
    if (hit) return hit.route
  }
  return classifyRoute(fromX + NODE_W, toX)
}

function buildGraph(graph: ProcessFlowGraph): { nodes: Node[]; edges: Edge[] } {
  const positions = positionsFor(graph)
  const nodes: Node[] = graph.nodes
    .filter((n) => n.kind !== 'dummy')
    .map((n) => ({
      id: n.id,
      type: 'processStep',
      position: positions[n.id] ?? ORIGIN,
      data: {
        label: n.name,
        kind: n.kind,
        services: n.services,
        decisionInfo: n.decisionInfo,
      } satisfies ProcessNodeData,
      draggable: true,
    }))
  const posOf = (id: string) => nodes.find((n) => n.id === id)?.position ?? ORIGIN
  const edges: Edge[] = visualSegments(graph).map((e) => {
    const route = routeFor(graph, e.from, e.to, posOf(e.from).x, posOf(e.to).x)
    return {
      id: `b:${e.from}>${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'processEdge',
      ...handlesFor(route),
      data: {
        originalId: e.originalId,
        labels: e.labels,
        route,
      } satisfies ProcessEdgeData,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#a8b0bc' },
    }
  })
  return { nodes, edges }
}

function EdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
      <defs>
        <marker id="pf-arrow-direct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8b0bc" />
        </marker>
        <marker id="pf-arrow-jump" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f6fed" />
        </marker>
        <marker id="pf-arrow-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#e05b4f" />
        </marker>
        <marker id="pf-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f6fed" />
        </marker>
      </defs>
    </svg>
  )
}

function ProcessFlowMapInner({ graph }: { graph: ProcessFlowGraph }) {
  const seed = useMemo(() => buildGraph(graph), [graph])
  const [nodes, , onNodesChange] = useNodesState(seed.nodes)
  const [edges] = useEdgesState(seed.edges)
  const [hoverId, setHoverId] = useState<string>()
  const [dragId, setDragId] = useState<string>()
  const dragRef = useRef<string>()
  const focusId = dragId ?? hoverId

  const neighborhood = useMemo(() => {
    if (!focusId) return null
    const nodeIds = new Set<string>([focusId])
    const edgeIds = new Set<string>()
    for (const e of edges) {
      if (e.source !== focusId && e.target !== focusId) continue
      edgeIds.add(e.id)
      nodeIds.add(e.source)
      nodeIds.add(e.target)
    }
    return { nodeIds, edgeIds }
  }, [edges, focusId])

  const shownNodes = useMemo(() => {
    if (!neighborhood) return nodes
    const decorated = nodes.map((n) => {
      const active = neighborhood.nodeIds.has(n.id)
      return {
        ...n,
        className: active ? 'pf-node-onpath' : 'pf-node-offpath',
        zIndex: active ? 4 : 0,
      }
    })
    return [
      ...decorated.filter((n) => n.className !== 'pf-node-onpath'),
      ...decorated.filter((n) => n.className === 'pf-node-onpath'),
    ]
  }, [neighborhood, nodes])

  const shownEdges = useMemo(() => {
    if (!neighborhood) return edges
    const decorated = edges.map((e) => {
      const active = neighborhood.edgeIds.has(e.id)
      const data = e.data as ProcessEdgeData | undefined
      return {
        ...e,
        zIndex: active ? 3 : 0,
        className: active ? 'pf-edge-onpath' : 'pf-edge-offpath',
        data: { ...data, active, dim: !active },
      }
    })
    return [
      ...decorated.filter((e) => !e.data.active),
      ...decorated.filter((e) => e.data.active),
    ]
  }, [edges, neighborhood])

  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    setHoverId(node.id)
  }, [])
  const onNodeMouseLeave = useCallback(() => {
    if (!dragRef.current) setHoverId(undefined)
  }, [])
  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragRef.current = node.id
    setDragId(node.id)
    setHoverId(node.id)
  }, [])
  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    dragRef.current = node.id
    setDragId(node.id)
  }, [])
  const onNodeDragStop = useCallback(() => {
    dragRef.current = undefined
    setDragId(undefined)
  }, [])

  return (
    <div className="pf-map-wrap">
      <EdgeMarkers />
      <ReactFlow
        nodes={shownNodes}
        edges={shownEdges}
        onNodesChange={onNodesChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        nodesDraggable
        panOnDrag
        panOnScroll
        zoomOnScroll
        minZoom={0.06}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background id="pf-dots" variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#c5ccd4" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function ProcessFlowMap({ graph }: { graph: ProcessFlowGraph }) {
  return (
    <ReactFlowProvider>
      <ProcessFlowMapInner key={graph.no} graph={graph} />
    </ReactFlowProvider>
  )
}
