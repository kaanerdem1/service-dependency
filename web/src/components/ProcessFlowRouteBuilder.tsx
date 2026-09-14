import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import type {
  ProcessFlowGraph,
  ProcessFlowNodeKind,
  ProcessIncomingTransition,
  ProcessOutgoingTransition,
} from '../types'
import {
  saveProcessRoute,
  type SavedProcessRoute,
} from '../processRouteStore'
import { exportProcessPathSnapshotPdf } from '../snapshot/processPathSnapshot'
import { buildUserRouteSnapshotSteps } from './processPathNarrative'
import { ProcessFlowDetailDrawer } from './ProcessFlowDetailDrawer'
import { ProcessFlowRouteBar } from './ProcessFlowRouteBar'
import { summarizeProcessFlow } from './processFlowSummary'
import {
  autoAdvanceRoute,
  chooseRouteEdge,
  createUserRoute,
  goRouteBack,
  goRouteForward,
  outgoingRouteEdges,
  reconcileRouteWithGraph,
  routeCurrentVisit,
  routeProgress,
  visibleRouteVisits,
  type UserRouteState,
} from './processUserRoute'

type RouteNodeData = {
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
  visitNumber: number
}

type RouteChoiceData = {
  edgeId: string
  edgeLabel: string
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
}

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  subprocess: 'Alt süreç',
  other: 'Adım',
  dummy: 'Adım',
}

const STEP_X = 260
const ORIGIN_X = 48
const ORIGIN_Y = 168
const FAN_GAP = 118
const CHOICE_PREFIX = 'choice:'

function isDummyId(id: string) {
  return id.startsWith('d:')
}

function incomingTransitionsFor(
  graph: ProcessFlowGraph,
  nodeId: string,
): ProcessIncomingTransition[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const rows: ProcessIncomingTransition[] = []
  for (const edge of graph.edges) {
    if (edge.to !== nodeId || isDummyId(edge.from)) continue
    const from = byId.get(edge.from)
    if (!from) continue
    rows.push({
      fromId: edge.from,
      fromName: from.name,
      fromKind: from.kind,
      label: edge.label?.trim() || undefined,
    })
  }
  return rows
}

function outgoingTransitionsFor(
  graph: ProcessFlowGraph,
  nodeId: string,
): ProcessOutgoingTransition[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const rows: ProcessOutgoingTransition[] = []
  for (const edge of graph.edges) {
    if (edge.from !== nodeId || isDummyId(edge.to)) continue
    const to = byId.get(edge.to)
    if (!to) continue
    rows.push({
      toId: edge.to,
      toName: to.name,
      toKind: to.kind,
      label: edge.label?.trim() || undefined,
    })
  }
  return rows
}

function choiceFan(count: number, x: number, y: number) {
  if (count <= 0) return []
  if (count === 1) return [{ x, y }]
  const mid = (count - 1) / 2
  return Array.from({ length: count }, (_, index) => ({
    x,
    y: y + (index - mid) * FAN_GAP,
  }))
}

function SnapshotGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        d="M8 1.5v8.4M8 9.9 5 6.9M8 9.9l3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 10.8v2c0 .66.54 1.2 1.2 1.2h8.6c.66 0 1.2-.54 1.2-1.2v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RouteStepNode({ data, selected }: NodeProps<RouteNodeData>) {
  return (
    <div className={`pf-node pf-route-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="pf-h" />
      <Handle type="source" position={Position.Right} className="pf-h" />
      <span className="pf-node-kind">{KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      {data.visitNumber > 1 ? (
        <span className="pf-route-visit-badge">{data.visitNumber}. ziyaret</span>
      ) : null}
      {data.services[0] ? <span className="pf-node-svc">{data.services[0]}</span> : null}
    </div>
  )
}

function RouteChoiceNode({ data }: NodeProps<RouteChoiceData>) {
  return (
    <div className={`pf-node pf-route-choice-node is-${data.kind}`}>
      <Handle type="target" position={Position.Left} className="pf-h" />
      <Handle type="source" position={Position.Right} className="pf-h" />
      <span className="pf-route-choice-kicker">{data.edgeLabel || 'Geçiş'}</span>
      <span className="pf-node-kind">{KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      {data.services[0] ? <span className="pf-node-svc">{data.services[0]}</span> : null}
    </div>
  )
}

const nodeTypes = { routeStep: RouteStepNode, routeChoice: RouteChoiceNode }

function ProcessFlowRouteBuilderInner({
  graph,
  screens,
  savedRoute,
  onExitRoute,
  onDismiss,
  onRouteSaved,
  onOpenService,
  onOpenSubProcess,
}: {
  graph: ProcessFlowGraph
  screens?: ReactNode
  savedRoute?: SavedProcessRoute
  onExitRoute: () => void
  onDismiss?: () => void
  onRouteSaved?: (route: SavedProcessRoute) => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
}) {
  const processNo = graph.catalogNo ?? graph.no
  const processTitle = graph.descriptionTr || graph.label || graph.parName || processNo
  const summary = useMemo(() => summarizeProcessFlow(graph), [graph])
  const [state, setState] = useState<UserRouteState>(() => {
    if (savedRoute) return reconcileRouteWithGraph(graph, savedRoute.state)
    return autoAdvanceRoute(graph, createUserRoute(graph))
  })
  const [readOnly, setReadOnly] = useState(Boolean(savedRoute))
  const [selectedIndex, setSelectedIndex] = useState<number>()
  const [saveOpen, setSaveOpen] = useState(false)
  const [routeName, setRouteName] = useState(savedRoute?.name ?? '')
  const [activeRoute, setActiveRoute] = useState(savedRoute)
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const mapCanvasRef = useRef<HTMLDivElement>(null)
  const { getNodes, fitView } = useReactFlow()
  const visits = useMemo(() => visibleRouteVisits(state), [state])
  const current = routeCurrentVisit(state)
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const choices = useMemo(() => {
    if (readOnly || !current) return []
    return outgoingRouteEdges(graph, current.nodeId)
  }, [current, graph, readOnly])
  const selectedVisit = selectedIndex != null ? visits[selectedIndex] : undefined
  const selectedNode = selectedVisit ? byId.get(selectedVisit.nodeId) : undefined
  const cameraFocusIds = useMemo(
    () => [
      ...visits.slice(-1).map((visit) => visit.visitId),
      ...choices.map((edge) => `${CHOICE_PREFIX}${edge.id}`),
    ],
    [choices, visits],
  )
  const cameraKey = cameraFocusIds.join('|')

  const nodes = useMemo<Node[]>(() => {
    const committed: Node<RouteNodeData>[] = visits.map((visit, index) => {
      const source = byId.get(visit.nodeId)
      return {
        id: visit.visitId,
        type: 'routeStep',
        position: { x: ORIGIN_X + index * STEP_X, y: ORIGIN_Y },
        data: {
          label: source?.name ?? visit.nodeId,
          kind: source?.kind ?? 'other',
          services: source?.services ?? [],
          visitNumber: visit.ordinal,
        },
        className: 'pf-route-node-wrap',
        selected: selectedIndex === index,
        draggable: false,
        style: { width: 168 },
      }
    })
    if (!choices.length || !visits.length) return committed
    const fan = choiceFan(choices.length, ORIGIN_X + visits.length * STEP_X, ORIGIN_Y)
    const ghosts: Node<RouteChoiceData>[] = choices.map((edge, index) => {
      const target = byId.get(edge.to)
      return {
        id: `${CHOICE_PREFIX}${edge.id}`,
        type: 'routeChoice',
        position: fan[index] ?? { x: ORIGIN_X + visits.length * STEP_X, y: ORIGIN_Y },
        data: {
          edgeId: edge.id,
          edgeLabel: edge.label?.trim() || 'Etiketsiz geçiş',
          label: target?.name ?? edge.to,
          kind: target?.kind ?? 'other',
          services: target?.services ?? [],
        },
        className: 'pf-route-choice-wrap',
        draggable: false,
        selectable: false,
        style: { width: 168 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }
    })
    return [...committed, ...ghosts]
  }, [byId, choices, selectedIndex, visits])

  const edges = useMemo<Edge[]>(() => {
    const committed: Edge[] = visits.slice(1).map((visit, index) => ({
      id: `route:${visits[index].visitId}:${visit.visitId}`,
      source: visits[index].visitId,
      target: visit.visitId,
      label: visit.incomingLabel,
      type: 'straight',
      className: 'pf-edge-onpath',
      style: { stroke: '#2f6fed', strokeWidth: 2.2 },
      labelStyle: { fill: '#1e40af', fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.96 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 6,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: '#2f6fed',
      },
    }))
    if (!choices.length || !visits.length) return committed
    const sourceId = visits[visits.length - 1].visitId
    const many = choices.length > 1
    const ghosts: Edge[] = choices.map((edge) => ({
      id: `ghost:${edge.id}`,
      source: sourceId,
      target: `${CHOICE_PREFIX}${edge.id}`,
      label: edge.label?.trim() || undefined,
      type: many ? 'default' : 'straight',
      className: 'pf-route-ghost-edge',
      style: {
        stroke: '#2f6fed',
        strokeWidth: many ? 1.7 : 2,
        strokeDasharray: '7 5',
        opacity: 0.85,
      },
      labelStyle: { fill: '#1e40af', fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.96 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 6,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: '#2f6fed',
      },
    }))
    return [...committed, ...ghosts]
  }, [choices, visits])

  useEffect(() => {
    let cancelled = false
    const focusIds = cameraFocusIds
    const run = () => {
      if (cancelled) return
      const present = getNodes().filter((node) => focusIds.includes(node.id))
      if (!present.length) return
      void fitView({
        nodes: present,
        padding: 0.34,
        duration: 480,
        minZoom: 0.45,
        maxZoom: 1.15,
      })
    }
    const frame = requestAnimationFrame(() => requestAnimationFrame(run))
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [cameraFocusIds, cameraKey, fitView, getNodes])

  const choose = useCallback(
    (edgeId: string) => {
      setState((currentState) => chooseRouteEdge(graph, currentState, edgeId))
      setSelectedIndex(undefined)
    },
    [graph],
  )

  const save = () => {
    const name = routeName.trim()
    if (!name) return
    if (activeRoute && !window.confirm(`“${activeRoute.name}” rotası güncellensin mi?`)) return
    const route = saveProcessRoute({
      id: activeRoute?.id,
      processNo,
      processTitle,
      name,
      state,
      status: routeProgress(graph, state),
      graphUpdatedAt: graph.updatedAt,
    })
    setActiveRoute(route)
    setRouteName(route.name)
    setSaveOpen(false)
    setReadOnly(true)
    onRouteSaved?.(route)
  }

  const exportPdf = useCallback(
    async (endIndex: number) => {
      const mapEl = mapCanvasRef.current
      if (!mapEl || visits.length === 0 || snapshotBusy) return
      const prefix = visits.slice(0, Math.max(0, endIndex) + 1)
      setSnapshotBusy(true)
      try {
        await exportProcessPathSnapshotPdf({
          mapEl,
          pathNodeIds: new Set(prefix.map((visit) => visit.visitId)),
          pathEdges: prefix.slice(1).map((visit, index) => ({
            fromId: prefix[index].visitId,
            toId: visit.visitId,
            label: visit.incomingLabel,
          })),
          getNodes,
          steps: buildUserRouteSnapshotSteps(graph, prefix),
          processTitle: `${processTitle} · ${activeRoute?.name ?? (routeName.trim() || 'Akış Rotası')}`,
          processNo,
          targetName: byId.get(prefix.at(-1)?.nodeId ?? '')?.name ?? 'Rota',
        })
      } finally {
        setSnapshotBusy(false)
      }
    },
    [activeRoute?.name, byId, getNodes, graph, processNo, processTitle, routeName, snapshotBusy, visits],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selectedIndex != null) {
        event.preventDefault()
        setSelectedIndex(undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex])

  const stale =
    savedRoute?.graphUpdatedAt &&
    graph.updatedAt &&
    savedRoute.graphUpdatedAt !== graph.updatedAt
  const selectedPathSteps = selectedVisit
    ? buildUserRouteSnapshotSteps(graph, visits.slice(0, (selectedIndex ?? 0) + 1))
    : []
  const routeStatus = `${activeRoute?.name ?? 'Yeni rota'} · ${visits.length} ziyaret · ${
    routeProgress(graph, state) === 'completed' ? 'Tamamlandı' : 'Taslak'
  }`

  return (
    <div className="pf-map-wrap pf-route-wrap">
      <header className="pf-map-head">
        <h1 className="pf-map-title">{summary.title}</h1>
        <p className="pf-map-subtitle">{summary.subtitle}</p>
        {summary.metaLine ? <p className="pf-map-meta">{summary.metaLine}</p> : null}
        {summary.statsLine ? <p className="pf-map-summary">{summary.statsLine}</p> : null}
        <p className="pf-map-summary">{routeStatus}</p>
        {screens}
        <button type="button" className="pf-route-start" onClick={onExitRoute}>
          Tüm Akış
        </button>
      </header>
      {stale ? (
        <p className="pf-route-stale">Süreç tanımı bu rota kaydedildikten sonra güncellenmiş. Düzenlemeden önce adımları kontrol edin.</p>
      ) : null}
      <ProcessFlowRouteBar
        graph={graph}
        visits={visits}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />
      <div
        ref={mapCanvasRef}
        className={`pf-map-canvas pf-route-canvas${selectedNode ? ' is-drawer-open' : ''}`}
      >
        {selectedNode ? (
          <button
            type="button"
            className="pf-detail-scrim"
            aria-label="Detayı kapat"
            onClick={() => setSelectedIndex(undefined)}
          />
        ) : null}
        <div className="pf-map-tools">
          <button
            type="button"
            className="pf-add-note"
            disabled={!state.cursor || readOnly}
            onClick={() => {
              setState(goRouteBack)
              setSelectedIndex(undefined)
            }}
          >
            ← Geri
          </button>
          <button
            type="button"
            className="pf-add-note"
            disabled={state.cursor >= state.visits.length - 1 || readOnly}
            onClick={() => {
              setState(goRouteForward)
              setSelectedIndex(undefined)
            }}
          >
            İleri →
          </button>
          {readOnly ? (
            <button type="button" className="pf-add-note" onClick={() => setReadOnly(false)}>
              Düzenle
            </button>
          ) : (
            <button type="button" className="pf-add-note" onClick={() => setSaveOpen(true)}>
              Kaydet
            </button>
          )}
          <button
            type="button"
            className="pf-route-snapshot"
            onClick={() => void exportPdf(visits.length - 1)}
            disabled={snapshotBusy || visits.length === 0}
            title="Görünen rotanın PDF snapshot’ını indir"
            aria-label="Snapshot indir (PDF)"
          >
            {snapshotBusy ? '…' : <SnapshotGlyph />}
            Snapshot
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => {
            if (node.type === 'routeChoice') {
              if (!readOnly) choose((node.data as RouteChoiceData).edgeId)
              return
            }
            const index = visits.findIndex((visit) => visit.visitId === node.id)
            setSelectedIndex(index >= 0 ? index : undefined)
          }}
          onPaneClick={() => setSelectedIndex(undefined)}
          minZoom={0.15}
          maxZoom={1.8}
          defaultViewport={{ x: 40, y: 80, zoom: 0.92 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#c5ccd4" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {selectedNode && selectedVisit ? (
          <ProcessFlowDetailDrawer
            open
            nodeId={selectedNode.id}
            nodeName={
              selectedVisit.ordinal > 1
                ? `${selectedNode.name} (${selectedVisit.ordinal}. ziyaret)`
                : selectedNode.name
            }
            kind={selectedNode.kind}
            details={selectedNode.details}
            decisionInfo={selectedNode.decisionInfo}
            services={selectedNode.services}
            subProcessNo={selectedNode.subProcessNo}
            incoming={incomingTransitionsFor(graph, selectedNode.id)}
            outgoing={outgoingTransitionsFor(graph, selectedNode.id)}
            path={selectedPathSteps}
            onSnapshot={() => void exportPdf(selectedIndex ?? 0)}
            snapshotBusy={snapshotBusy}
            onClose={() => setSelectedIndex(undefined)}
            onOpenService={
              onOpenService
                ? (serviceName, serviceId) =>
                    onOpenService(serviceName, selectedNode.id, serviceId)
                : undefined
            }
            onOpenSubProcess={
              onOpenSubProcess
                ? (nextProcessNo) => onOpenSubProcess(nextProcessNo, selectedNode.id)
                : undefined
            }
          />
        ) : null}
      </div>
      {onDismiss ? (
        <button type="button" className="pf-map-close" onClick={onDismiss}>
          Kapat
        </button>
      ) : null}

      {saveOpen ? (
        <div className="pf-route-save-backdrop" role="presentation" onMouseDown={() => setSaveOpen(false)}>
          <section className="pf-route-save-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <h2>{activeRoute ? 'Rotayı güncelle' : 'Rotayı kaydet'}</h2>
            <label>
              Rota adı
              <input
                autoFocus
                value={routeName}
                onChange={(event) => setRouteName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') save()
                  if (event.key === 'Escape') setSaveOpen(false)
                }}
                placeholder="Örn. Bölge onay rotası"
              />
            </label>
            <p>Yalnız haritada şu anda görünen {visits.length} adım kaydedilir.</p>
            <div>
              <button type="button" onClick={() => setSaveOpen(false)}>Vazgeç</button>
              <button type="button" className="is-primary" disabled={!routeName.trim()} onClick={save}>Kaydet</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export function ProcessFlowRouteBuilder(props: Parameters<typeof ProcessFlowRouteBuilderInner>[0]) {
  return (
    <ReactFlowProvider>
      <ProcessFlowRouteBuilderInner {...props} />
    </ReactFlowProvider>
  )
}
