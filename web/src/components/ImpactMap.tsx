import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  Position,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  applyProjectFilter,
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

const NODE_W = 168
const COL_GAP = 300
const ROW_GAP = 96
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
  /** Filtre dışı ama eşleşmeye giden ara düğüm */
  bridge?: boolean
  /** Proje filtresine uyan etkilenen servis */
  match?: boolean
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
        data.bridge && 'bridge',
        data.match && 'match',
        !data.bridge && !data.match && data.hop > 1 && 'indirect',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="dd-handle"
      />
      <div className="dd-node-ring" />
      <div className="dd-node-body">
        <span className="dd-node-label">{data.label}</span>
        {!isCenter && !isCollapsed && (
          <span className="dd-node-hop">
            {data.bridge
              ? 'ara yol · filtre dışı'
              : data.match
                ? `${data.hop}. katman · eşleşen`
                : `${data.hop}. katman`}
          </span>
        )}
        {isCollapsed && (
          <span className="dd-node-hop">genişlet · {data.count} servis</span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="dd-handle"
      />
      {/* Aynı kolon cascade: sağ boşluğa yumuşak U */}
      <Handle
        type="source"
        position={Position.Right}
        id="side-out"
        className="dd-handle side"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="side-in"
        className="dd-handle side"
      />
    </div>
  )
}

const nodeTypes = { serviceNode: memo(ServiceNodeView) }

type FanEdgeData = {
  fromId?: string
  toId?: string
  hop?: number
  kind?: 'tree' | 'cascade'
  fanIndex?: number
  fanCount?: number
  sameColumn?: boolean
}

/**
 * Dar alanda çoklu kenar: boşluğa (sağa / yayılı) soft fan.
 * Aynı kolon → sağa büyük yay; kolonlar arası → eğrilik ofseti.
 */
function FanEdge({
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
}: EdgeProps<FanEdgeData>) {
  const fan = data?.fanIndex ?? 0
  const fanCount = Math.max(1, data?.fanCount ?? 1)
  const mid = (fanCount - 1) / 2
  const spread = (fan - mid) * 26
  const sameCol =
    data?.sameColumn === true || Math.abs(sourceX - targetX) < 28

  let edgePath: string
  if (sameCol) {
    // Tek yön ok (yalnız markerEnd) — sağ boşluğa yumuşak yay
    const bulge =
      Math.max(sourceX, targetX) + 96 + fan * 40 + Math.abs(spread) * 0.5
    const y1 = sourceY + spread * 0.35
    const y2 = targetY + spread * 0.35
    edgePath = `M ${sourceX},${sourceY} C ${bulge},${y1} ${bulge},${y2} ${targetX},${targetY}`
  } else {
    const curvature = 0.32 + Math.abs(fan - mid) * 0.05
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

/** Katman aç/kapa sonrası görünümü ekrana sığdır */
function FitViewOnLayers({
  visibleMaxHop,
  nodeCount,
}: {
  visibleMaxHop: number
  nodeCount: number
}) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const id = window.setTimeout(() => {
      fitView({ padding: 0.22, duration: 320 })
    }, 40)
    return () => window.clearTimeout(id)
  }, [visibleMaxHop, nodeCount, fitView])
  return null
}

const edgeTypes = { fan: memo(FanEdge) }

function assignFanIndices(
  edges: Edge[],
  hopOf: Map<string, number>,
): Edge[] {
  const into = new Map<string, Edge[]>()
  const out = new Map<string, Edge[]>()
  for (const e of edges) {
    const tin = into.get(e.target) ?? []
    tin.push(e)
    into.set(e.target, tin)
    const tout = out.get(e.source) ?? []
    tout.push(e)
    out.set(e.source, tout)
  }

  return edges.map((e) => {
    const d = e.data as FanEdgeData
    const fromHop = hopOf.get(d.fromId ?? e.source)
    const toHop = hopOf.get(d.toId ?? e.target)
    const sameColumn = fromHop !== undefined && fromHop === toHop
    const intoList = into.get(e.target) ?? [e]
    const outList = out.get(e.source) ?? [e]
    const bundle =
      sameColumn || d.kind === 'cascade'
        ? intoList.length >= outList.length
          ? intoList
          : outList
        : intoList.length > 1
          ? intoList
          : outList
    const fanIndex = Math.max(0, bundle.indexOf(e))
    const fanCount = bundle.length
    return {
      ...e,
      type: 'fan',
      data: { ...d, fanIndex, fanCount, sameColumn },
    }
  })
}

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
  bridgeIds: Set<string> = new Set(),
  matchIds: Set<string> = new Set(),
  visibleMaxHop = 1,
  forceExpandCollapsed = false,
  filterActive = false,
): { nodes: Node<ServiceNodeData>[]; edges: Edge[]; hops: number[] } {
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
    if (hop > visibleMaxHop) continue
    const { visible, hidden } = splitLayer(
      byHop.get(hop)!,
      forceExpandCollapsed || expandedLayers.has(hop),
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
    if (hop > visibleMaxHop) continue
    const col = visibleByHop.get(hop) ?? []
    col.forEach((n, i) => {
      visibleIds.add(n.service.id)
      nodes.push({
        id: n.service.id,
        type: 'serviceNode',
        data: {
          label: n.service.name,
          kind: 'service',
          hop,
          bridge: filterActive && bridgeIds.has(n.service.id),
          match: filterActive && matchIds.has(n.service.id),
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

  /** BFS keşif ebeveyni → tree; diğerleri cascade */
  const treeParent = new Map<string, string>()
  for (const e of impactEdges) {
    if (e.toId === center.id) continue
    if (!treeParent.has(e.toId)) treeParent.set(e.toId, e.fromId)
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

    const isCascade = treeParent.get(e.toId) !== e.fromId
    const direct = toHop === 1 && !isCascade
    const sameColumn = fromHop === toHop
    /** Geriye cascade: sağ rota + çift ok */
    const sideRoute = isCascade && (sameColumn || fromHop > toHop)
    const stroke = isCascade ? '#c4783a' : direct ? '#3d7a60' : '#a39e94'
    edges.push({
      id: key,
      source,
      target,
      sourceHandle: sideRoute ? 'side-out' : 'out',
      targetHandle: sideRoute ? 'side-in' : 'in',
      type: 'fan',
      animated: false,
      className: isCascade
        ? 'dd-edge cascade'
        : direct
          ? 'dd-edge direct'
          : 'dd-edge indirect',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: isCascade ? 18 : 16,
        height: isCascade ? 18 : 16,
        color: isCascade ? '#c4783a' : direct ? '#2f6f55' : '#8a847a',
      },
      style: {
        stroke,
        strokeWidth: isCascade ? 2.2 : direct ? 2.2 : 1.4,
        strokeDasharray: isCascade ? '5 4' : direct ? undefined : '6 5',
      },
      data: {
        fromId: e.fromId,
        toId: e.toId,
        hop: toHop,
        kind: isCascade ? 'cascade' : 'tree',
        sameColumn: sideRoute,
      },
    })
  }

  return { nodes, edges: assignFanIndices(edges, hopOf), hops }
}

/** Hover ego: yalnız oğuna değen uçlar (path / hop-2 zinciri yok) */
function neighborIds(focusId: string, rfEdges: Edge[]): Set<string> {
  const ids = new Set<string>([focusId])
  for (const e of rfEdges) {
    const d = e.data as { fromId?: string; toId?: string } | undefined
    const a = d?.fromId ?? e.source
    const b = d?.toId ?? e.target
    const touches =
      a === focusId ||
      b === focusId ||
      e.source === focusId ||
      e.target === focusId
    if (!touches) continue
    ids.add(e.source)
    ids.add(e.target)
    ids.add(a)
    ids.add(b)
  }
  return ids
}

function edgeTouchesFocus(e: Edge, focusId: string | null) {
  if (!focusId) return true
  const d = e.data as { fromId?: string; toId?: string } | undefined
  const a = d?.fromId ?? e.source
  const b = d?.toId ?? e.target
  return (
    a === focusId ||
    b === focusId ||
    e.source === focusId ||
    e.target === focusId
  )
}

export function ImpactMap({
  graph,
  projectOptions,
  onPivot,
  onClearCenter,
  onPivotBack,
  onPivotForward,
  canPivotBack = false,
  canPivotForward = false,
}: Props) {
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set())
  const [visibleMaxHop, setVisibleMaxHop] = useState(1)
  const [projectFilter, setProjectFilter] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const filter = useMemo(
    () => applyProjectFilter(graph, projectFilter || null),
    [graph, projectFilter],
  )
  const filterLabel =
    projectOptions.find((p) => p.id === projectFilter)?.label ?? ''

  const filteredGraph = useMemo((): ImpactGraph => {
    if (!projectFilter) return graph
    return {
      ...graph,
      nodes: filterNodes(graph.nodes, filter.keepIds),
      edges: filterEdges(graph.edges, filter.keepIds),
    }
  }, [graph, projectFilter, filter.keepIds])

  const maxHopAvailable = useMemo(() => {
    let m = 1
    for (const n of filteredGraph.nodes) m = Math.max(m, n.hop)
    return m
  }, [filteredGraph.nodes])

  const nextHop =
    visibleMaxHop < maxHopAvailable ? visibleMaxHop + 1 : undefined
  const canExpandLayer = Boolean(nextHop)
  const canCollapseLayer = visibleMaxHop > 1
  const canExpandAll = visibleMaxHop < maxHopAvailable
  const canCollapseAll = visibleMaxHop > 1

  const built = useMemo(
    () =>
      buildGraph(
        filteredGraph,
        expandedLayers,
        projectFilter ? filter.bridgeIds : new Set(),
        projectFilter ? filter.matchIds : new Set(),
        visibleMaxHop,
        Boolean(projectFilter),
        Boolean(projectFilter),
      ),
    [
      filteredGraph,
      expandedLayers,
      projectFilter,
      filter.bridgeIds,
      filter.matchIds,
      visibleMaxHop,
    ],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  const egoIds = useMemo(() => {
    if (!focusId || focusId.startsWith('collapsed-')) return null
    return neighborIds(focusId, built.edges)
  }, [focusId, built.edges])

  useEffect(() => {
    setExpandedLayers(new Set())
    setVisibleMaxHop(1)
    setFocusId(null)
    setFocusEdgeId(null)
    setProjectFilter('')
  }, [graph.center.id])

  useEffect(() => {
    if (!projectFilter || filter.matchCount === 0) return
    setVisibleMaxHop(Math.max(1, filter.deepestHop))
    setExpandedLayers(new Set(filteredGraph.nodes.map((n) => n.hop)))
  }, [projectFilter, filter.matchCount, filter.deepestHop, filteredGraph.nodes])

  // Node listesini yalnız graf değişince yaz — hover’da setNodes = titreme
  useEffect(() => {
    setNodes(built.nodes)
  }, [built, setNodes])

  // Hover parlaması: yalnız ego (odak + doğrudan komşular)
  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const active = Boolean(focusId || focusEdgeId)
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.remove('rf-path-on', 'rf-path-off', 'rf-path-focus')
      if (!active) return
      let on = false
      if (focusEdgeId) {
        const edge = built.edges.find((x) => x.id === focusEdgeId)
        const d = edge?.data as { fromId?: string; toId?: string } | undefined
        on =
          id === edge?.source ||
          id === edge?.target ||
          id === d?.fromId ||
          id === d?.toId
      } else if (egoIds) {
        const data = nodes.find((n) => n.id === id)?.data as
          | ServiceNodeData
          | undefined
        on =
          egoIds.has(id) ||
          (data?.kind === 'collapsed' &&
            Boolean(data.hiddenIds?.some((hid) => egoIds.has(hid))))
      }
      el.classList.add(on ? 'rf-path-on' : 'rf-path-off')
      if (id === focusId) el.classList.add('rf-path-focus')
    })
  }, [egoIds, focusId, focusEdgeId, nodes, built.edges])

  // Hover: yalnız oğuna değen kenarlar · tree yeşil / cascade turuncu
  useEffect(() => {
    const focusing = Boolean(focusId || focusEdgeId)
    setEdges(
      built.edges.map((e) => {
        const on = focusEdgeId
          ? e.id === focusEdgeId
          : edgeTouchesFocus(e, focusId)
        const kind =
          (e.data as { kind?: string } | undefined)?.kind === 'cascade'
            ? 'cascade'
            : 'tree'
        const hot = focusing && on
        const color = !focusing
          ? kind === 'cascade'
            ? '#c4783a'
            : ((e.style?.stroke as string) ?? '#3d7a60')
          : hot
            ? kind === 'cascade'
              ? '#a85f24'
              : '#2f6f55'
            : '#cfc8bc'
        return {
          ...e,
          animated: false,
          interactionWidth: 28,
          className: [
            String(e.className ?? '')
              .replace(/\bdd-edge-(on|off)\b/g, '')
              .trim(),
            hot ? (kind === 'cascade' ? 'dd-edge-on cascade' : 'dd-edge-on') : '',
            focusing && !on ? 'dd-edge-off' : '',
          ]
            .filter(Boolean)
            .join(' '),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: hot ? 18 : 16,
            height: hot ? 18 : 16,
            color,
          },
          markerStart: undefined,
          style: {
            ...e.style,
            opacity: !focusing || on ? 1 : 0.1,
            strokeWidth:
              hot ? (kind === 'cascade' ? 2.4 : 2.8) : e.style?.strokeWidth,
            stroke: color,
            strokeDasharray:
              kind === 'cascade'
                ? '5 4'
                : hot
                  ? undefined
                  : e.style?.strokeDasharray,
          },
        }
      }),
    )
  }, [built.edges, focusId, focusEdgeId, setEdges])

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

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setFocusEdgeId(null)
    setFocusId((prev) => (prev === node.id ? prev : node.id))
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    setFocusId(null)
  }, [])

  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    setFocusId(null)
    setFocusEdgeId(edge.id)
  }, [])

  const onEdgeMouseLeave = useCallback(() => {
    setFocusEdgeId(null)
  }, [])

  const focusing = Boolean(focusId || focusEdgeId)

  return (
    <div
      ref={mapRef}
      className={`impact-map dd-map ${focusing ? 'is-focusing' : ''}`}
      data-focus={focusId ?? focusEdgeId ?? undefined}
    >
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
          <ImpactLegend truncated={graph.truncated} />
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
            onClick={() => {
              setVisibleMaxHop(maxHopAvailable)
              setExpandedLayers(
                new Set(filteredGraph.nodes.map((n) => n.hop)),
              )
            }}
            title="Tüm katmanları aç"
          >
            Bütün katmanları aç
          </button>
          <button
            type="button"
            className="btn ghost path-layer-btn"
            disabled={!canCollapseAll}
            onClick={() => {
              setVisibleMaxHop(1)
              setExpandedLayers(new Set())
            }}
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
      {graph.truncated && graph.reason && (
        <p className="map-budget-hint">{graph.reason}</p>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        minZoom={0.25}
        maxZoom={1.5}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnLayers
          visibleMaxHop={visibleMaxHop}
          nodeCount={nodes.length}
        />
        <Background gap={22} color="#e4e0d6" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
