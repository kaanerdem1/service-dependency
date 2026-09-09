import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { ProcessFlowGraph, ProcessFlowNodeKind } from '../types'

const COLLAPSE_AT = 8

type ProcessNodeData = {
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
  hiddenChildCount: number
}

type NoteNodeData = {
  text: string
  onChange: (text: string) => void
  onRemove: () => void
  onResizeEnd: () => void
}

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  other: 'Adım',
}

/** BPMN benzeri gösterim: olaylar (start/end) daire, karar (gateway) baklava,
 * görev/servis dikdörtgen. Şekil türü tek bakışta ayırt edilsin. */
function ProcessStepNode({ data, selected }: NodeProps<ProcessNodeData>) {
  const badge =
    data.hiddenChildCount > 0 ? (
      <span className="pf-node-more-badge">+{data.hiddenChildCount}</span>
    ) : null

  if (data.kind === 'start' || data.kind === 'end') {
    return (
      <div className={`pf-node pf-node-event is-${data.kind}${selected ? ' is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} />
        <span className="pf-event-kicker">{KIND_LABEL[data.kind]}</span>
        <div className="pf-event-circle">{badge}</div>
        <strong className="pf-event-label">{data.label}</strong>
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }

  if (data.kind === 'decision') {
    return (
      <div className={`pf-node pf-node-gateway is-decision${selected ? ' is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} />
        <span className="pf-event-kicker">{KIND_LABEL.decision}</span>
        <div className="pf-gateway-diamond">
          <span className="pf-gateway-mark">✕</span>
          {badge}
        </div>
        <strong className="pf-gateway-label">{data.label}</strong>
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }

  return (
    <div className={`pf-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      {data.kind === 'service' ? <span className="pf-node-icon">⚙</span> : null}
      <span className="pf-node-kind">{KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      {data.services[0] ? (
        <span className="pf-node-svc" title={data.services.join(', ')}>
          {data.services[0]}
        </span>
      ) : null}
      {data.hiddenChildCount > 0 ? (
        <span className="pf-node-more">+{data.hiddenChildCount} adım</span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

type ProcessEdgeData = {
  dim?: boolean
  active?: boolean
}

type Point = [number, number]

/** Düğümler yeniden konumlandırılsa da esnek kalan kübik bezier: sabit
 * dik-açı köşeleri yerine kaynak/hedef doğrultusuna göre uzayan bir kontrol
 * kolu kullanır — Sugiyama tarzı yerleşimde dallanan/yakınsayan oklar iç içe
 * geçmeden ayrı eğriler olarak görünür (servis haritasındaki mantık). */
function bezierControlOffset(dx: number, dy: number) {
  return Math.max(56, Math.abs(dx) * 0.42, Math.abs(dy) * 0.3)
}

function bezierControlPoint(x: number, y: number, position: Position, offset: number): Point {
  switch (position) {
    case Position.Left:
      return [x - offset, y]
    case Position.Right:
      return [x + offset, y]
    case Position.Top:
      return [x, y - offset]
    case Position.Bottom:
      return [x, y + offset]
    default:
      return [x, y]
  }
}

/** t parametresindeki noktayı AYNI eğri üzerinden hesaplar (kontrol
 * noktalarını paylaşır) — bu yüzden etiket, düğüm sürüklendiğinde de tam
 * olarak okun üzerinde kalır, doğrusal bir yaklaşıklık kaymaz. */
function cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ]
}

/** Etiketi kenarın orta noktası yerine çıkış ucuna yakın konumlandırır:
 * aynı düğümden çıkan “Onayla/Reddet” gibi birden çok ok, kesişme bölgesinde
 * değil kendi kaynağının yanında okunur. */
function ProcessEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps<ProcessEdgeData>) {
  const offset = bezierControlOffset(targetX - sourceX, targetY - sourceY)
  const p0: Point = [sourceX, sourceY]
  const p3: Point = [targetX, targetY]
  const p1 = bezierControlPoint(sourceX, sourceY, sourcePosition, offset)
  const p2 = bezierControlPoint(targetX, targetY, targetPosition, offset)
  const edgePath = `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`
  const [lx, ly] = cubicBezierPoint(0.2, p0, p1, p2, p3)
  const stateClass = data?.active ? ' is-onpath' : data?.dim ? ' is-dim' : ''
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`pf-edge-label${stateClass}`}
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

const edgeTypes: EdgeTypes = {
  processEdge: memo(ProcessEdge),
}

function NoteNode({ data, selected }: NodeProps<NoteNodeData>) {
  return (
    <div className={`pf-note${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={90}
        color="#e3b341"
        handleStyle={{ width: 9, height: 9, borderRadius: 2 }}
        onResizeEnd={() => data.onResizeEnd()}
      />
      <Handle type="target" position={Position.Top} />
      <textarea
        value={data.text}
        placeholder="Not…"
        onChange={(e) => data.onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <button type="button" className="pf-note-x" onClick={data.onRemove} aria-label="Notu sil">
        ×
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  processStep: memo(ProcessStepNode),
  processNote: memo(NoteNode),
}

type UiState = {
  notes: { id: string; text: string; x: number; y: number; width?: number; height?: number }[]
  positions: Record<string, { x: number; y: number }>
}

function storageKey(no: string) {
  return `sd-process-flow-ui:${no}`
}

function readUi(no: string): UiState {
  try {
    const raw = localStorage.getItem(storageKey(no))
    if (!raw) return { notes: [], positions: {} }
    const o = JSON.parse(raw) as UiState
    return {
      notes: Array.isArray(o.notes) ? o.notes : [],
      positions: o.positions && typeof o.positions === 'object' ? o.positions : {},
    }
  } catch {
    return { notes: [], positions: {} }
  }
}

function writeUi(no: string, next: UiState) {
  try {
    localStorage.setItem(storageKey(no), JSON.stringify(next))
  } catch {
    /* quota */
  }
}

function seedRevealed(graph: ProcessFlowGraph): Set<string> {
  if (graph.nodes.length <= COLLAPSE_AT) {
    return new Set(graph.nodes.map((n) => n.id))
  }
  const starts = graph.nodes.filter((n) => n.kind === 'start').map((n) => n.id)
  const ids = new Set(starts.length ? starts : graph.nodes.slice(0, 1).map((n) => n.id))
  for (const e of graph.edges) {
    if (ids.has(e.from)) ids.add(e.to)
  }
  return ids
}

function outgoingMap(graph: ProcessFlowGraph) {
  const m = new Map<string, string[]>()
  for (const e of graph.edges) {
    const list = m.get(e.from) ?? []
    if (!list.includes(e.to)) list.push(e.to)
    m.set(e.from, list)
  }
  return m
}

function incomingMap(graph: ProcessFlowGraph) {
  const m = new Map<string, string[]>()
  for (const e of graph.edges) {
    const list = m.get(e.to) ?? []
    if (!list.includes(e.from)) list.push(e.from)
    m.set(e.to, list)
  }
  return m
}

/** Bir düğümden başlayıp geriye (atalar) ve ileriye (soyundan gelenler) doğru ulaşılan
 * tüm düğüm/kenar kimliklerini toplar — sadece 1 komşuluk değil, bütün yol. */
function fullPathFrom(
  hoveredId: string,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
  edges: ProcessFlowGraph['edges'],
) {
  const ancestors = new Set<string>()
  const stackA = [hoveredId]
  while (stackA.length) {
    const cur = stackA.pop()!
    for (const p of incomingOf.get(cur) ?? []) {
      if (p !== hoveredId && !ancestors.has(p)) {
        ancestors.add(p)
        stackA.push(p)
      }
    }
  }
  const descendants = new Set<string>()
  const stackD = [hoveredId]
  while (stackD.length) {
    const cur = stackD.pop()!
    for (const c of childrenOf.get(cur) ?? []) {
      if (c !== hoveredId && !descendants.has(c)) {
        descendants.add(c)
        stackD.push(c)
      }
    }
  }
  const nodeIds = new Set<string>([hoveredId, ...ancestors, ...descendants])
  const edgeIds = new Set<string>()
  for (const e of edges) {
    const fromLeadsIn = e.from === hoveredId || ancestors.has(e.from)
    const toLeadsOut = e.to === hoveredId || descendants.has(e.to)
    if ((fromLeadsIn && nodeIds.has(e.to)) || (toLeadsOut && nodeIds.has(e.from))) {
      edgeIds.add(e.id)
    }
  }
  return { nodeIds, edgeIds }
}

type Props = {
  graph: ProcessFlowGraph
}

function FlowInner({ graph }: Props) {
  const { fitView } = useReactFlow()
  const [selectedId, setSelectedId] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const [revealed, setRevealed] = useState(() => seedRevealed(graph))
  const [hoveredId, setHoveredId] = useState<string>()
  const childrenOf = useMemo(() => outgoingMap(graph), [graph])
  const incomingOf = useMemo(() => incomingMap(graph), [graph])

  const pathHighlight = useMemo(
    () => (hoveredId ? fullPathFrom(hoveredId, childrenOf, incomingOf, graph.edges) : null),
    [hoveredId, childrenOf, incomingOf, graph.edges],
  )

  const hiddenChildCount = useCallback(
    (id: string) => (childrenOf.get(id) ?? []).filter((to) => !revealed.has(to)).length,
    [childrenOf, revealed],
  )

  const applyVisibility = useCallback(
    (list: Node[]): Node[] =>
      list.map((n) => {
        if (n.type === 'processNote') return { ...n, hidden: false }
        const extra = hiddenChildCount(n.id)
        return {
          ...n,
          hidden: !revealed.has(n.id),
          data: { ...n.data, hiddenChildCount: extra },
        }
      }),
    [hiddenChildCount, revealed],
  )

  const persistFromNodes = useCallback(
    (list: Node[]) => {
      const positions: Record<string, { x: number; y: number }> = {}
      const notes: UiState['notes'] = []
      for (const n of list) {
        if (n.type === 'processNote') {
          notes.push({
            id: n.id,
            text: (n.data as NoteNodeData).text ?? '',
            x: n.position.x,
            y: n.position.y,
            width: typeof n.width === 'number' ? n.width : undefined,
            height: typeof n.height === 'number' ? n.height : undefined,
          })
        } else {
          positions[n.id] = n.position
        }
      }
      writeUi(graph.no, { notes, positions })
    },
    [graph.no],
  )

  const buildBase = useCallback(() => {
    const ui = readUi(graph.no)
    const nodes: Node[] = graph.nodes.map((n) => {
      const pos = ui.positions[n.id] ?? graph.positions[n.id] ?? { x: 40, y: 40 }
      return {
        id: n.id,
        type: 'processStep',
        position: pos,
        hidden: !revealed.has(n.id),
        data: {
          label: n.name,
          kind: n.kind,
          services: n.services,
          hiddenChildCount: 0,
        },
        draggable: true,
      }
    })
    for (const note of ui.notes) {
      nodes.push({
        id: note.id,
        type: 'processNote',
        position: { x: note.x, y: note.y },
        width: note.width,
        height: note.height,
        data: {
          text: note.text,
          onChange: () => undefined,
          onRemove: () => undefined,
          onResizeEnd: () => undefined,
        },
        draggable: true,
      })
    }
    const edges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'processEdge',
      hidden: !revealed.has(e.from) || !revealed.has(e.to),
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#64748b' },
    }))
    return { nodes, edges }
  }, [graph, revealed])

  const initial = useMemo(() => buildBase(), [graph.no])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  const persistCurrent = useCallback(() => {
    setNodes((rows) => {
      persistFromNodes(rows)
      return rows
    })
  }, [persistFromNodes, setNodes])

  useEffect(() => {
    const seed = seedRevealed(graph)
    setRevealed(seed)
    setSelectedId(undefined)
    setExpanded(false)
    const ui = readUi(graph.no)
    const nextNodes: Node[] = graph.nodes.map((n) => {
      const pos = ui.positions[n.id] ?? graph.positions[n.id] ?? { x: 40, y: 40 }
      return {
        id: n.id,
        type: 'processStep',
        position: pos,
        hidden: !seed.has(n.id),
        data: {
          label: n.name,
          kind: n.kind,
          services: n.services,
          hiddenChildCount: (outgoingMap(graph).get(n.id) ?? []).filter((to) => !seed.has(to))
            .length,
        },
        draggable: true,
      }
    })
    for (const note of ui.notes) {
      nextNodes.push({
        id: note.id,
        type: 'processNote',
        position: { x: note.x, y: note.y },
        width: note.width,
        height: note.height,
        data: {
          text: note.text,
          onChange: () => undefined,
          onRemove: () => undefined,
          onResizeEnd: () => undefined,
        },
        draggable: true,
      })
    }
    setNodes(nextNodes)
    setEdges(
      graph.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.label,
        type: 'processEdge',
        hidden: !seed.has(e.from) || !seed.has(e.to),
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#64748b' },
      })),
    )
  }, [graph, setNodes, setEdges])

  useEffect(() => {
    setNodes((curr) => applyVisibility(curr))
    setEdges((curr) =>
      curr.map((e) => ({
        ...e,
        hidden: !revealed.has(e.source) || !revealed.has(e.target),
      })),
    )
  }, [revealed, applyVisibility, setNodes, setEdges])

  useEffect(() => {
    setNodes((curr) =>
      curr.map((n) => {
        if (n.type !== 'processNote') return n
        return {
          ...n,
          data: {
            ...(n.data as NoteNodeData),
            onChange: (text: string) => {
              setNodes((rows) => {
                const next = rows.map((row) =>
                  row.id === n.id ? { ...row, data: { ...row.data, text } } : row,
                )
                persistFromNodes(next)
                return next
              })
            },
            onRemove: () => {
              setNodes((rows) => {
                const next = rows.filter((row) => row.id !== n.id)
                persistFromNodes(next)
                return next
              })
            },
            onResizeEnd: persistCurrent,
          },
        }
      }),
    )
  }, [graph.no, persistFromNodes, persistCurrent, setNodes])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setExpanded(false)
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [expanded])

  useEffect(() => {
    const t = window.setTimeout(() => {
      fitView({ padding: 0.22, duration: expanded ? 180 : 0, maxZoom: 1.05 })
    }, expanded ? 40 : 0)
    return () => window.clearTimeout(t)
  }, [expanded, graph.no, fitView])

  const onNodeClick = (_e: unknown, node: Node) => {
    if (node.type === 'processNote') return
    setSelectedId(node.id)
    const hiddenKids = (childrenOf.get(node.id) ?? []).filter((id) => !revealed.has(id))
    if (hiddenKids.length === 0) return
    setRevealed((prev) => {
      const next = new Set(prev)
      for (const id of hiddenKids) next.add(id)
      return next
    })
  }

  const collapseAll = () => {
    setRevealed(seedRevealed(graph))
    setSelectedId(undefined)
  }

  const expandAll = () => {
    setRevealed(new Set(graph.nodes.map((n) => n.id)))
  }

  const resetLayout = () => {
    setNodes((curr) => {
      const next = curr.map((n) => {
        if (n.type === 'processNote') return n
        return { ...n, position: graph.positions[n.id] ?? { x: 40, y: 40 } }
      })
      writeUi(graph.no, {
        notes: next
          .filter((n) => n.type === 'processNote')
          .map((n) => ({
            id: n.id,
            text: (n.data as NoteNodeData).text ?? '',
            x: n.position.x,
            y: n.position.y,
            width: typeof n.width === 'number' ? n.width : undefined,
            height: typeof n.height === 'number' ? n.height : undefined,
          })),
        positions: {},
      })
      return next
    })
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.22, duration: 180, maxZoom: 1.05 })
    })
  }

  const addNote = () => {
    const id = `note-${Date.now()}`
    setNodes((curr) => {
      const next: Node[] = [
        ...curr,
        {
          id,
          type: 'processNote',
          position: { x: 48, y: 48 },
          width: 168,
          height: 108,
          data: {
            text: '',
            onChange: (text: string) => {
              setNodes((rows) => {
                const mapped = rows.map((row) =>
                  row.id === id ? { ...row, data: { ...row.data, text } } : row,
                )
                persistFromNodes(mapped)
                return mapped
              })
            },
            onRemove: () => {
              setNodes((rows) => {
                const mapped = rows.filter((row) => row.id !== id)
                persistFromNodes(mapped)
                return mapped
              })
            },
            onResizeEnd: persistCurrent,
          },
          draggable: true,
        },
      ]
      persistFromNodes(next)
      return next
    })
  }

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChange(changes)
  }

  const handleNodeMouseEnter = (_e: unknown, node: Node) => {
    if (node.type === 'processNote') return
    setHoveredId(node.id)
  }

  const handleNodeMouseLeave = () => setHoveredId(undefined)

  const displayNodes = useMemo(() => {
    if (!pathHighlight) return nodes
    const decorated = nodes.map((n) => {
      if (n.type === 'processNote') return n
      const active = pathHighlight.nodeIds.has(n.id)
      return { ...n, className: active ? 'pf-node-onpath' : 'pf-node-offpath' }
    })
    const rest = decorated.filter((n) => n.className !== 'pf-node-onpath')
    const active = decorated.filter((n) => n.className === 'pf-node-onpath')
    return [...rest, ...active]
  }, [nodes, pathHighlight])

  const displayEdges = useMemo(() => {
    if (!pathHighlight) return edges
    // Aktif (vurgulanan) kenarları listenin SONUNA taşı: React Flow kenarları
    // tek bir SVG içinde DOM sırasına göre çizer, z-index'in etkisi olmaz —
    // bu yüzden üstte görünmesi gereken ok, dizide en son olmalı.
    const decorated = edges.map((e) => {
      const active = pathHighlight.edgeIds.has(e.id)
      return {
        ...e,
        className: active ? 'pf-edge-onpath' : 'pf-edge-offpath',
        zIndex: active ? 1 : 0,
        data: { active, dim: !active },
        markerEnd: active
          ? { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#2f6fed' }
          : e.markerEnd,
      }
    })
    const dimmed = decorated.filter((e) => !e.data.active)
    const active = decorated.filter((e) => e.data.active)
    return [...dimmed, ...active]
  }, [edges, pathHighlight])

  const selected = graph.nodes.find((n) => n.id === selectedId)
  const collapsed = graph.nodes.length > COLLAPSE_AT && revealed.size < graph.nodes.length

  return (
    <div className="pf-shell">
      <div className={`pf-canvas-wrap${expanded ? ' is-expanded' : ''}`}>
        <div className="pf-canvas-tools">
          <button
            type="button"
            className="tl-zoom"
            title={expanded ? 'Küçült (Esc)' : 'Tam ekran'}
            aria-label={expanded ? 'Küçült' : 'Tam ekran'}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="tl-zoom-glyph" aria-hidden>
              {expanded ? (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path
                    d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path
                    d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          </button>
          <button type="button" className="pf-add-note" onClick={addNote}>
            Not ekle
          </button>
          <button
            type="button"
            className="pf-add-note"
            onClick={resetLayout}
            title="Düğüm konumlarını ilk yerleşime al"
          >
            Eski haline döndür
          </button>
          {graph.nodes.length > COLLAPSE_AT ? (
            collapsed ? (
              <button type="button" className="pf-add-note" onClick={expandAll}>
                Tümünü aç
              </button>
            ) : (
              <button type="button" className="pf-add-note" onClick={collapseAll}>
                Daralt
              </button>
            )
          ) : null}
        </div>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => {
            setNodes((curr) => {
              persistFromNodes(curr)
              return curr
            })
          }}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          nodesConnectable={false}
          minZoom={0.15}
          maxZoom={1.8}
          defaultEdgeOptions={{
            style: { stroke: '#94a3b8', strokeWidth: 1.4 },
          }}
          defaultViewport={{ x: 24, y: 24, zoom: 0.85 }}
          proOptions={{ hideAttribution: true }}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedId(undefined)}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      {selected && !expanded ? (
        <aside className="pf-detail">
          <p className="pf-detail-kicker">{KIND_LABEL[selected.kind]}</p>
          <h3 className="pf-detail-title">{selected.name}</h3>
          {selected.services.length ? (
            <ul className="pf-detail-svcs">
              {selected.services.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="pf-detail-empty">Bu adımda servis çağrısı yok.</p>
          )}
          <p className="pf-detail-hint">
            {collapsed
              ? '“+N adım” olan düğüme tıkla; yeni adımlar yerinde açılır, ekran kaymaz.'
              : 'Sürükle, zoom ve not ekle. XML’e yazılmaz.'}
          </p>
          <p className="pf-detail-hint">
            Bir düğümün üzerine gel: baştan sona bütün yolu (tüm atalar ve tüm soyundan gelenler)
            vurgular.
          </p>
        </aside>
      ) : null}
    </div>
  )
}

export function ProcessFlowCanvas({ graph }: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner graph={graph} />
    </ReactFlowProvider>
  )
}
