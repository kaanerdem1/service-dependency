import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
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
}

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  other: 'Adım',
}

function ProcessStepNode({ data, selected }: NodeProps<ProcessNodeData>) {
  return (
    <div className={`pf-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
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

function NoteNode({ data, selected }: NodeProps<NoteNodeData>) {
  return (
    <div className={`pf-note${selected ? ' is-selected' : ''}`}>
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
  notes: { id: string; text: string; x: number; y: number }[]
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

type Props = {
  graph: ProcessFlowGraph
}

function FlowInner({ graph }: Props) {
  const { fitView } = useReactFlow()
  const [selectedId, setSelectedId] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const [revealed, setRevealed] = useState(() => seedRevealed(graph))
  const childrenOf = useMemo(() => outgoingMap(graph), [graph])

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
        data: { text: note.text, onChange: () => undefined, onRemove: () => undefined },
        draggable: true,
      })
    }
    const edges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      hidden: !revealed.has(e.from) || !revealed.has(e.to),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }))
    return { nodes, edges }
  }, [graph, revealed])

  const initial = useMemo(() => buildBase(), [graph.no])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

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
        data: { text: note.text, onChange: () => undefined, onRemove: () => undefined },
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
        hidden: !seed.has(e.from) || !seed.has(e.to),
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
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
          },
        }
      }),
    )
  }, [graph.no, persistFromNodes, setNodes])

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
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => {
            setNodes((curr) => {
              persistFromNodes(curr)
              return curr
            })
          }}
          nodesConnectable={false}
          minZoom={0.15}
          maxZoom={1.8}
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
