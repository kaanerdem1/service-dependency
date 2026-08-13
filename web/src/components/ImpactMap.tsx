import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
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
  discoveryParents,
  filterEdges,
  filterNodes,
  type ProjectOption,
} from '../impact/projectFilter'
import { listMethodsForService } from '../api/client'
import type { ImpactGraph, ImpactNode, MethodRef } from '../types'
import {
  BlastRadiusSummary,
  ImpactLegend,
  PathBreadcrumb,
  ProjectFilterHint,
} from './ImpactChrome'

type Props = {
  graph: ImpactGraph
  projectOptions: ProjectOption[]
  onPivot: (serviceId: string) => void
  /** Metod chip → detay */
  onSelectMethod?: (serviceId: string, methodId: string) => void
  /** +N → servisin Metodlar sekmesi */
  onBrowseMethods?: (serviceId: string) => void
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

type MethodBadgeData = {
  serviceId: string
  count: number
  expanded: boolean
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

function MethodBadgeView({ data }: NodeProps<MethodBadgeData>) {
  return (
    <div
      className={`dd-method-badge ${data.expanded ? 'expanded' : ''}`}
      title="Metod listesini aç / kapa"
    >
      {data.count} metod
    </div>
  )
}

const nodeTypes = {
  serviceNode: memo(ServiceNodeView),
  methodBadge: memo(MethodBadgeView),
}

const BADGE_GAP = 14

/** Harita zoom’unu bozmayan taşınabilir metod penceresi (varsayılan yukarı) */
function MethodPopover({
  serviceId,
  serviceName,
  methods,
  mapRef,
  onSelectMethod,
  onClose,
}: {
  serviceId: string
  serviceName: string
  methods: MethodRef[]
  mapRef: RefObject<HTMLDivElement | null>
  onSelectMethod: (serviceId: string, methodId: string) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origTop: number
    origLeft: number
  } | null>(null)
  const placedOnce = useRef(false)

  useEffect(() => {
    placedOnce.current = false
    setPos(null)
  }, [serviceId])

  useEffect(() => {
    if (placedOnce.current || !mapRef.current) return
    const root = mapRef.current
    const anchor =
      root.querySelector<HTMLElement>(`[data-id="mbadge-${serviceId}"]`) ??
      root.querySelector<HTMLElement>(`[data-id="${serviceId}"]`)
    if (!anchor) return
    const rootBox = root.getBoundingClientRect()
    const box = anchor.getBoundingClientRect()
    const popH = 280
    const popW = 240
    // Varsayılan: rozetin üstüne aç
    let top = box.top - rootBox.top - popH - 8
    if (top < 8) top = box.bottom - rootBox.top + 8
    let left = box.left - rootBox.left
    left = Math.max(8, Math.min(left, rootBox.width - popW - 8))
    setPos({ top, left })
    placedOnce.current = true
  }, [mapRef, serviceId, methods.length])

  const onDragStart = (e: ReactMouseEvent) => {
    if (!pos || (e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTop: pos.top,
      origLeft: pos.left,
    }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      const root = mapRef.current
      if (!d || !root) return
      const rootBox = root.getBoundingClientRect()
      const nextTop = d.origTop + (ev.clientY - d.startY)
      const nextLeft = d.origLeft + (ev.clientX - d.startX)
      setPos({
        top: Math.max(4, Math.min(nextTop, rootBox.height - 80)),
        left: Math.max(4, Math.min(nextLeft, rootBox.width - 120)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const ranked = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return [...methods]
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.className.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          b.callerCount + b.calleeCount - (a.callerCount + a.calleeCount),
      )
  }, [methods, filter])

  if (!pos) return null

  return (
    <div
      className="method-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`${serviceName} metodları`}
    >
      <header
        className="method-popover-head method-popover-drag"
        onMouseDown={onDragStart}
        title="Sürükleyerek taşı"
      >
        <div>
          <strong>{methods.length} metod</strong>
          <span className="muted"> · {serviceName}</span>
          <span className="method-popover-drag-hint">⠿</span>
        </div>
        <button type="button" className="btn ghost path-layer-btn" onClick={onClose}>
          Kapat
        </button>
      </header>
      <p className="method-popover-legend">
        <span title="Bu metodu çağıranlar">çağıran ←</span>
        <span aria-hidden>·</span>
        <span title="Bu metodun çağırdıkları">çağırılan →</span>
      </p>
      <input
        type="search"
        className="method-popover-filter"
        placeholder="Filtre…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="method-popover-list">
        {ranked.length === 0 ? (
          <li className="method-popover-empty">Eşleşme yok</li>
        ) : (
          ranked.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelectMethod(serviceId, m.id)}
              >
                <span className="fly-class">{m.className}</span>
                <span className="fly-name">{m.name}</span>
                <span className="fly-meta">
                  <span title="Çağıran (kim çağırıyor)">
                    çağıran {m.callerCount}
                  </span>
                  <span aria-hidden> · </span>
                  <span title="Çağırılan (kimi çağırıyor)">
                    çağırılan {m.calleeCount}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

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

/** Katman aç/kapa / metod overlay sonrası görünümü ekrana sığdır */
function FitViewOnLayers({
  visibleMaxHop,
  nodeCount,
  layoutKey,
}: {
  visibleMaxHop: number
  nodeCount: number
  layoutKey: string | number | boolean
}) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const id = window.setTimeout(() => {
      fitView({ padding: 0.22, duration: 320 })
    }, 40)
    return () => window.clearTimeout(id)
  }, [visibleMaxHop, nodeCount, layoutKey, fitView])
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
  rowGap = ROW_GAP,
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
  const centerY = 40 + ((rowCount - 1) * rowGap) / 2

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
          y: 40 + i * rowGap,
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
          y: 40 + col.length * rowGap,
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
  onSelectMethod,
  onBrowseMethods: _onBrowseMethods,
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
  const [showLinkedMethods, setShowLinkedMethods] = useState(false)
  const [expandedMethodServiceId, setExpandedMethodServiceId] = useState<
    string | null
  >(null)
  const [methodsByService, setMethodsByService] = useState<
    Record<string, MethodRef[]>
  >({})
  const [methodsLoading, setMethodsLoading] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)

  const filter = useMemo(
    () => applyProjectFilter(graph, projectFilter || null),
    [graph, projectFilter],
  )
  const filterLabel =
    projectOptions.find((p) => p.id === projectFilter)?.label ?? ''

  const projectLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projectOptions) m.set(p.id, p.label)
    for (const n of graph.nodes) {
      if (!m.has(n.service.projectId)) {
        m.set(n.service.projectId, n.service.projectId)
      }
    }
    return m
  }, [projectOptions, graph.nodes])

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
        ROW_GAP,
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

  /** Via zinciri: tam graf ebeveynleri (filtre köprüsü dahil) */
  const parents = useMemo(
    () => discoveryParents(graph.center.id, graph.edges),
    [graph.center.id, graph.edges],
  )

  const nameById = useMemo(() => {
    const m = new Map<string, string>([[graph.center.id, graph.center.name]])
    for (const n of graph.nodes) m.set(n.service.id, n.service.name)
    return m
  }, [graph])

  /** Kenar hover’da hedef ucun via yolu */
  const breadcrumbFocus = useMemo(() => {
    if (focusId && !focusId.startsWith('collapsed-')) return focusId
    if (!focusEdgeId) return null
    const edge = built.edges.find((e) => e.id === focusEdgeId)
    const d = edge?.data as { toId?: string; fromId?: string } | undefined
    return d?.toId ?? edge?.target ?? null
  }, [focusId, focusEdgeId, built.edges])

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
    setShowLinkedMethods(false)
    setExpandedMethodServiceId(null)
    setMethodsByService({})
  }, [graph.center.id])

  useEffect(() => {
    if (!projectFilter || filter.matchCount === 0) return
    setVisibleMaxHop(Math.max(1, filter.deepestHop))
    setExpandedLayers(new Set(filteredGraph.nodes.map((n) => n.hop)))
  }, [projectFilter, filter.matchCount, filter.deepestHop, filteredGraph.nodes])

  const visibleServiceIds = useMemo(() => {
    return built.nodes
      .filter((n) => n.data.kind === 'center' || n.data.kind === 'service')
      .map((n) => n.id)
  }, [built.nodes])

  useEffect(() => {
    if (!showLinkedMethods) {
      setMethodsByService({})
      setMethodsLoading(false)
      setExpandedMethodServiceId(null)
      return
    }
    let cancelled = false
    setMethodsLoading(true)
    void Promise.all(
      visibleServiceIds.map(async (id) => {
        const list = await listMethodsForService(id)
        return [id, list] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return
        setMethodsByService(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!cancelled) setMethodsByService({})
      })
      .finally(() => {
        if (!cancelled) setMethodsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showLinkedMethods, visibleServiceIds])

  // Yalnız “N metod” rozeti — liste HTML popover (zoom bozulmasın)
  useEffect(() => {
    type AnyNode = Node<ServiceNodeData | MethodBadgeData>
    const out: AnyNode[] = built.nodes.map((n) => ({ ...n }))

    if (showLinkedMethods) {
      for (const n of built.nodes) {
        if (n.data.kind !== 'center' && n.data.kind !== 'service') continue
        const count = (methodsByService[n.id] ?? []).length
        if (!count) continue
        out.push({
          id: `mbadge-${n.id}`,
          type: 'methodBadge',
          data: {
            serviceId: n.id,
            count,
            expanded: expandedMethodServiceId === n.id,
          },
          position: {
            x: n.position.x + NODE_W + BADGE_GAP,
            y: n.position.y + 18,
          },
          draggable: false,
          selectable: true,
        })
      }
    }

    setNodes(out as Node<ServiceNodeData>[])
  }, [
    built,
    showLinkedMethods,
    methodsByService,
    expandedMethodServiceId,
    setNodes,
  ])

  // Hover / metod flyout: ego dışını soluklaştır
  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const methodFocus = expandedMethodServiceId
    const active = Boolean(methodFocus || focusId || focusEdgeId)
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.remove('rf-path-on', 'rf-path-off', 'rf-path-focus')
      if (!active) return
      let on = false
      if (methodFocus) {
        on = id === methodFocus || id === `mbadge-${methodFocus}`
      } else if (focusEdgeId) {
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
      if (id === focusId || id === methodFocus) el.classList.add('rf-path-focus')
    })
  }, [
    egoIds,
    focusId,
    focusEdgeId,
    nodes,
    built.edges,
    expandedMethodServiceId,
  ])

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
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'methodBadge') {
        const d = node.data as MethodBadgeData
        setExpandedMethodServiceId((cur) =>
          cur === d.serviceId ? null : d.serviceId,
        )
        return
      }
      const data = node.data as ServiceNodeData
      if (data.kind === 'collapsed') {
        setExpandedLayers((prev) => new Set(prev).add(data.hop))
        return
      }
      if (node.id === graph.center.id) {
        onClearCenter?.()
        return
      }
      setExpandedMethodServiceId(null)
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

  const focusing = Boolean(
    focusId || focusEdgeId || expandedMethodServiceId,
  )

  return (
    <div
      ref={mapRef}
      className={`impact-map dd-map ${focusing ? 'is-focusing' : ''}`}
      data-focus={
        expandedMethodServiceId ?? focusId ?? focusEdgeId ?? undefined
      }
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
          <span className="path-bar-sep" aria-hidden />
          <button
            type="button"
            className={`btn ghost path-layer-btn ${showLinkedMethods ? 'on' : ''}`}
            aria-pressed={showLinkedMethods}
            onClick={() => setShowLinkedMethods((v) => !v)}
            title="Servis düğümlerinde bağlı metod özeti (2–3 veya +N)"
          >
            {methodsLoading
              ? 'Metodlar…'
              : showLinkedMethods
                ? 'Bağlı metodlar: açık'
                : 'Bağlı metodları göster'}
          </button>
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
      <BlastRadiusSummary
        centerId={graph.center.id}
        nodes={graph.nodes}
        parents={parents}
        projectLabels={projectLabels}
        matchIds={projectFilter ? filter.matchIds : null}
        bridgeCount={projectFilter ? filter.bridgeIds.size : 0}
        filterLabel={filterLabel || undefined}
        truncated={graph.truncated}
      />
      <PathBreadcrumb
        centerId={graph.center.id}
        focusId={breadcrumbFocus}
        parents={parents}
        nameById={nameById}
        onSelect={(id) =>
          id === graph.center.id ? onClearCenter?.() : onPivot(id)
        }
      />
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
          layoutKey={`${showLinkedMethods}-${Object.keys(methodsByService).length}`}
        />
        <Background gap={22} color="#e4e0d6" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {expandedMethodServiceId &&
        onSelectMethod &&
        (methodsByService[expandedMethodServiceId]?.length ?? 0) > 0 && (
          <MethodPopover
            serviceId={expandedMethodServiceId}
            serviceName={
              nameById.get(expandedMethodServiceId) ?? expandedMethodServiceId
            }
            methods={methodsByService[expandedMethodServiceId]!}
            mapRef={mapRef}
            onSelectMethod={onSelectMethod}
            onClose={() => setExpandedMethodServiceId(null)}
          />
        )}
    </div>
  )
}
