/**
 * Tam BPM akışı canvas — React Flow.
 *
 * Ne yapar: API grafını çizer; arama, not, detay drawer, path snapshot PDF.
 * Layout: `processFlowMap/buildGraph.ts` (`layeredLayout`, KTF referans override).
 * Ne yapmaz: Kayıtlı rota modu (`ProcessFlowRouteBuilder`).
 * İlgili: [rehber.md](./rehber.md)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { ProcessFlowGraph, ProcessNodeDescriptionsDoc } from '../../types'
import { ProcessFlowDetailDrawer } from './ProcessFlowDetailDrawer'
import { ProcessFlowScreens } from './ProcessFlowScreens'
import { ProcessFlowMapSearch } from './ProcessFlowMapSearch'
import { processFlowSearchMatches } from './processFlowMapSearchMatch'
import {
  graphNodeIdSet,
  incomingTransitionsFor,
  outgoingTransitionsFor,
} from './processFlowDrawerNav'
import { buildPathSnapshotSteps } from './processPathNarrative'
import { exportProcessPathSnapshotPdf } from '../../snapshot/processPathSnapshot'
import {
  NOTE_COLLAPSED_HEIGHT,
  NOTE_COLLAPSED_WIDTH,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  NOTE_MAX_HEIGHT,
  NOTE_MAX_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  readProcessFlowNotes,
  writeProcessFlowNotes,
  type ProcessFlowNote,
} from './processFlowNotes'
import { summarizeProcessFlow } from './processFlowSummary'
import { sinkCopyRealId } from './processFlowIds'
import {
  frameNodeOnCanvas,
  graphSpanX,
  PROCESS_FLOW_WIDE_SPAN as WIDE_SPAN,
  startCamera,
} from './processFlowCamera'
import { useProcessFlowHover } from './useProcessFlowHover'
import {
  buildDag,
  buildGraph,
  focusHighlightFor,
  longestPathRanks,
  withEdgeRoutes,
} from './processFlowMap/buildGraph.js'
import { EdgeMarkers, FullscreenGlyph, processFlowEdgeTypes } from './processFlowMap/edges.js'
import { processFlowNodeTypes, type NoteNodeData } from './processFlowMap/nodes.js'

/** Snapshot çekimi öncesi DOM/layout'un yeni (daraltılmış) düğüm kümesiyle
 * gerçekten render/reflow olmasını beklemek için — bir animasyon
 * frame'inin tamamlanmasını bekler. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}



function notesFromNodes(list: Node[]): ProcessFlowNote[] {
  return list
    .filter((n) => n.type === 'processNote')
    .map((n) => {
      const data = n.data as NoteNodeData
      return {
        id: n.id,
        text: data.text ?? '',
        x: n.position.x,
        y: n.position.y,
        width: typeof n.width === 'number' ? n.width : undefined,
        height: typeof n.height === 'number' ? n.height : undefined,
        collapsed: data.collapsed ?? false,
        expandedWidth: data.expandedWidth,
        expandedHeight: data.expandedHeight,
      }
    })
}

function noteActions(
  id: string,
  processNo: string,
  setNodes: ReturnType<typeof useNodesState>[1],
  persistNotes: () => void,
): Pick<NoteNodeData, 'onChange' | 'onRemove' | 'onResizeEnd' | 'onToggleCollapse'> {
  const persist = (rows: Node[]) => writeProcessFlowNotes(processNo, notesFromNodes(rows))
  return {
    onChange: (text) => {
      setNodes((rows) => {
        const next = rows.map((row) =>
          row.id === id ? { ...row, data: { ...(row.data as NoteNodeData), text } } : row,
        )
        persist(next)
        return next
      })
    },
    onRemove: () => {
      setNodes((rows) => {
        const next = rows.filter((row) => row.id !== id)
        persist(next)
        return next
      })
    },
    onResizeEnd: persistNotes,
    onToggleCollapse: () => {
      setNodes((rows) => {
        const next = rows.map((row) => {
          if (row.id !== id) return row
          const data = row.data as NoteNodeData
          if (data.collapsed) {
            return {
              ...row,
              width: data.expandedWidth ?? NOTE_DEFAULT_WIDTH,
              height: data.expandedHeight ?? NOTE_DEFAULT_HEIGHT,
              data: { ...data, collapsed: false },
            }
          }
          return {
            ...row,
            width: NOTE_COLLAPSED_WIDTH,
            height: NOTE_COLLAPSED_HEIGHT,
            data: {
              ...data,
              collapsed: true,
              expandedWidth: typeof row.width === 'number' ? row.width : NOTE_DEFAULT_WIDTH,
              expandedHeight: typeof row.height === 'number' ? row.height : NOTE_DEFAULT_HEIGHT,
            },
          }
        })
        persist(next)
        return next
      })
    },
  }
}

function noteNodesFromStorage(processNo: string): Node[] {
  return readProcessFlowNotes(processNo).map((note) => {
    const collapsed = note.collapsed ?? false
    return {
      id: note.id,
      type: 'processNote' as const,
      position: { x: note.x, y: note.y },
      width: collapsed ? NOTE_COLLAPSED_WIDTH : (note.width ?? NOTE_DEFAULT_WIDTH),
      height: collapsed ? NOTE_COLLAPSED_HEIGHT : (note.height ?? NOTE_DEFAULT_HEIGHT),
      data: {
        text: note.text,
        collapsed,
        expandedWidth: note.expandedWidth,
        expandedHeight: note.expandedHeight,
        onChange: () => undefined,
        onRemove: () => undefined,
        onResizeEnd: () => undefined,
        onToggleCollapse: () => undefined,
      } satisfies NoteNodeData,
      draggable: true,
      selectable: true,
      zIndex: 6,
    }
  })
}

function ProcessFlowMapInner({
  graph,
  processScreens = [],
  onDismiss,
  canGoBack,
  onBackToParent,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
  onOpenSubProcess,
  onCreateRoute,
  canEditCatalog,
  onNodeDescriptionsChange,
}: {
  graph: ProcessFlowGraph
  processScreens?: import('../../types').ServiceScreenLink[]
  onDismiss?: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
  onCreateRoute?: () => void
  canEditCatalog?: boolean
  onNodeDescriptionsChange?: (doc: ProcessNodeDescriptionsDoc) => void
}) {
  const processNo = graph.catalogNo ?? graph.no
  const seed = useMemo(() => {
    const built = buildGraph(graph)
    return {
      nodes: [...built.nodes, ...noteNodesFromStorage(processNo)],
      edges: built.edges,
    }
  }, [graph.edges, graph.nodes, processNo])
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes)
  const [edges, setEdges] = useEdgesState(seed.edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    initialSelectedNodeId,
  )
  const [expanded, setExpanded] = useState(false)
  const [mapSearchQuery, setMapSearchQuery] = useState('')
  const [mapSearchIndex, setMapSearchIndex] = useState(0)
  const {
    hoverId,
    dragId,
    dragMovedRef,
    onNodeMouseEnter,
    onNodeMouseLeave,
    onNodeDragStart,
    onNodeDrag,
    clearDrag,
  } = useProcessFlowHover({ skipNotes: true })
  const { setViewport, getNodes, fitView } = useReactFlow()
  const [highlightScreenOid, setHighlightScreenOid] = useState<string>()
  const jumpableNodeIds = useMemo(() => graphNodeIdSet(graph), [graph.nodes])
  const [snapshotCapturing, setSnapshotCapturing] = useState(false)
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const mapCanvasRef = useRef<HTMLDivElement>(null)
  const focusId = selectedNodeId ?? dragId ?? hoverId
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId),
    [graph.nodes, selectedNodeId],
  )
  const selectedIncoming = useMemo(
    () => (selectedNodeId ? incomingTransitionsFor(graph, selectedNodeId) : []),
    [graph, selectedNodeId],
  )
  const selectedOutgoing = useMemo(
    () => (selectedNodeId ? outgoingTransitionsFor(graph, selectedNodeId) : []),
    [graph, selectedNodeId],
  )
  const processNodes = useMemo(
    () => seed.nodes.filter((n) => n.type !== 'processNote'),
    [seed.nodes],
  )
  const wide = processNodes.length > 18 || graphSpanX(processNodes) > WIDE_SPAN
  const summary = useMemo(() => summarizeProcessFlow(graph), [graph])

  const persistNotes = useCallback(() => {
    setNodes((rows) => {
      writeProcessFlowNotes(processNo, notesFromNodes(rows))
      return rows
    })
  }, [processNo, setNodes])

  const refreshEdgeRoutes = useCallback(
    (touchedNodeIds?: ReadonlySet<string>) => {
      const posMap = Object.fromEntries(
        getNodes()
          .filter((n) => n.type !== 'processNote')
          .map((n) => [n.id, n.position]),
      )
      setEdges((curr) => {
        const next = withEdgeRoutes(graph, curr, posMap)
        if (!touchedNodeIds?.size) return next
        const byId = new Map(next.map((e) => [e.id, e]))
        return curr.map((e) =>
          touchedNodeIds.has(e.source) || touchedNodeIds.has(e.target)
            ? (byId.get(e.id) ?? e)
            : e,
        )
      })
    },
    [getNodes, graph, setEdges],
  )

  useEffect(() => {
    const built = buildGraph(graph)
    setNodes((curr) => {
      const keptNotes = curr.filter((n) => n.type === 'processNote')
      const notes = keptNotes.length > 0 ? keptNotes : noteNodesFromStorage(processNo)
      return [...built.nodes, ...notes]
    })
    setEdges(built.edges)
  }, [graph.edges, graph.nodes, processNo, setNodes, setEdges])

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (!current) return current
      return graph.nodes.some((n) => n.id === current) ? current : undefined
    })
  }, [graph.nodes])

  useEffect(() => {
    if (!initialSelectedNodeId) return
    setSelectedNodeId(initialSelectedNodeId)
    onRestoreConsumed?.()
  }, [initialSelectedNodeId, onRestoreConsumed])

  useEffect(() => {
    if (!selectedNodeId) return
    frameNodeOnCanvas(fitView, getNodes, selectedNodeId)
  }, [fitView, getNodes, selectedNodeId])

  useEffect(() => {
    if (!wide) return
    setViewport(startCamera(processNodes), { duration: 0 })
  }, [graph.no, processNodes, setViewport, wide])

  useEffect(() => {
    setNodes((curr) =>
      curr.map((n) => {
        if (n.type !== 'processNote') return n
        const data = n.data as NoteNodeData
        return {
          ...n,
          data: {
            ...data,
            ...noteActions(n.id, processNo, setNodes, persistNotes),
          },
        }
      }),
    )
  }, [processNo, persistNotes, setNodes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedNodeId) {
        e.preventDefault()
        setSelectedNodeId(undefined)
        return
      }
      if (expanded) setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, selectedNodeId])

  const focusBundle = useMemo(() => {
    if (!focusId) return null
    return focusHighlightFor(graph, focusId, edges)
  }, [edges, focusId, graph])
  const pathToFocus = focusBundle?.highlight ?? null
  const focusIsCanonical = focusBundle?.canonical ?? false

  const neighborhood = useMemo(() => {
    if (!pathToFocus) return null
    return { nodeIds: pathToFocus.nodeIds, edgeIds: pathToFocus.edgeIds }
  }, [pathToFocus])

  const pathRanksOnFocus = useMemo(() => {
    if (!pathToFocus) return null
    const { starts, dagChildren } = buildDag(graph)
    const onPathReal = new Set(pathToFocus.orderedIds)
    for (const nid of pathToFocus.nodeIds) {
      onPathReal.add(sinkCopyRealId(nid))
    }
    const ids = [...onPathReal].sort((a, b) => a.localeCompare(b, 'tr'))
    return longestPathRanks(ids, dagChildren, starts)
  }, [graph, pathToFocus])

  const selectedPathSteps = useMemo(() => {
    if (!selectedNodeId || !pathToFocus || !pathRanksOnFocus) return []
    return buildPathSnapshotSteps(
      graph,
      pathToFocus.orderedIds,
      pathToFocus.nodeIds,
      (id) => pathRanksOnFocus.get(id) ?? 0,
    )
  }, [selectedNodeId, pathToFocus, pathRanksOnFocus, graph])

  const mapSearchMatches = useMemo(
    () => processFlowSearchMatches(graph, mapSearchQuery),
    [graph, mapSearchQuery],
  )
  const mapSearchMatchSet = useMemo(() => new Set(mapSearchMatches), [mapSearchMatches])
  const mapSearchActive = mapSearchQuery.trim().length > 0
  const activeMapSearchId =
    mapSearchMatches.length > 0
      ? mapSearchMatches[
          ((mapSearchIndex % mapSearchMatches.length) + mapSearchMatches.length) %
            mapSearchMatches.length
        ]
      : undefined

  useEffect(() => {
    setMapSearchIndex(0)
  }, [mapSearchQuery])

  const moveMapSearch = useCallback(
    (direction: -1 | 1) => {
      if (!mapSearchMatches.length) return
      setMapSearchIndex(
        (current) =>
          (current + direction + mapSearchMatches.length) % mapSearchMatches.length,
      )
    },
    [mapSearchMatches.length],
  )

  useEffect(() => {
    if (!mapSearchActive || !activeMapSearchId) return
    setSelectedNodeId(activeMapSearchId)
    frameNodeOnCanvas(fitView, getNodes, activeMapSearchId)
  }, [activeMapSearchId, fitView, getNodes, mapSearchActive])

  const shownNodes = useMemo(() => {
    const base = nodes.map((n) => {
      if (n.type === 'processNote') {
        return { ...n, zIndex: 6, className: 'pf-note-node' }
      }
      const realId = sinkCopyRealId(n.id)
      const isSelected = !!selectedNodeId && realId === selectedNodeId
      const isSearchMatch = mapSearchActive && mapSearchMatchSet.has(realId)
      const isSearchActive = mapSearchActive && realId === activeMapSearchId
      return {
        ...n,
        className: [
          n.className,
          isSelected ? 'pf-node-detail-selected' : '',
          isSearchMatch ? 'pf-search-match' : '',
          isSearchActive ? 'pf-search-active' : '',
        ]
          .filter(Boolean)
          .join(' '),
        selected: isSelected,
        zIndex: isSearchActive ? 15 : isSelected ? 14 : isSearchMatch ? 11 : 6,
      }
    })
    if (!neighborhood) return base
    const decorated = base.map((n) => {
      if (n.type === 'processNote') return n
      const active = neighborhood.nodeIds.has(n.id)
      const realId = sinkCopyRealId(n.id)
      const isSearchActive = mapSearchActive && realId === activeMapSearchId
      const isSearchMatch = mapSearchActive && mapSearchMatchSet.has(realId)
      const isSelected = !!selectedNodeId && realId === selectedNodeId
      return {
        ...n,
        className: [active ? 'pf-node-onpath' : '', n.className].filter(Boolean).join(' '),
        zIndex: isSearchActive ? 15 : isSelected ? 14 : active ? 12 : isSearchMatch ? 11 : 6,
      }
    })
    const processOnly = decorated.filter((n) => n.type !== 'processNote')
    const notes = decorated.filter((n) => n.type === 'processNote')
    if (snapshotCapturing && pathToFocus) {
      return processOnly.filter(
        (n) =>
          pathToFocus.nodeIds.has(n.id) ||
          pathToFocus.nodeIds.has(sinkCopyRealId(n.id)),
      )
    }
    return [...processOnly, ...notes]
  }, [
    activeMapSearchId,
    mapSearchActive,
    mapSearchMatchSet,
    neighborhood,
    nodes,
    selectedNodeId,
    snapshotCapturing,
    pathToFocus,
  ])

  const shownEdges = useMemo(() => {
    if (!neighborhood) return edges
    const decorated = edges.map((e) => {
      const active = neighborhood.edgeIds.has(e.id)
      const data = e.data as ProcessEdgeData | undefined
      return {
        ...e,
        zIndex: active ? 2 : 1,
        className: active ? 'pf-edge-onpath' : 'pf-edge-offpath',
        data: { ...data, active, dim: !active },
      }
    })
    if (snapshotCapturing && pathToFocus) {
      return decorated.filter((e) => pathToFocus.edgeIds.has(e.id))
    }
    return decorated
  }, [edges, neighborhood, snapshotCapturing, pathToFocus])

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      persistNotes()
      refreshEdgeRoutes(new Set([node.id, sinkCopyRealId(node.id)]))
      clearDrag()
    },
    [clearDrag, persistNotes, refreshEdgeRoutes],
  )
  const focusGraphNode = useCallback(
    (targetId: string) => {
      if (!jumpableNodeIds.has(targetId)) return
      setSelectedNodeId(targetId)
      frameNodeOnCanvas(fitView, getNodes, targetId)
    },
    [fitView, getNodes, jumpableNodeIds],
  )

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (dragMovedRef.current) return
      if (node.type === 'processNote') {
        const data = node.data as NoteNodeData
        if (data.collapsed) data.onToggleCollapse()
        return
      }
      const id = sinkCopyRealId(node.id)
      setSelectedNodeId(id)
      frameNodeOnCanvas(fitView, getNodes, id)
    },
    [fitView, getNodes],
  )
  const addNote = useCallback(() => {
    const id = `note-${Date.now()}`
    setNodes((curr) => {
      const next: Node[] = [
        ...curr,
        {
          id,
          type: 'processNote',
          position: { x: 48, y: 48 },
          width: NOTE_DEFAULT_WIDTH,
          height: NOTE_DEFAULT_HEIGHT,
          data: {
            text: '',
            collapsed: false,
            ...noteActions(id, processNo, setNodes, persistNotes),
          } satisfies NoteNodeData,
          draggable: true,
          selectable: true,
          zIndex: 6,
        },
      ]
      writeProcessFlowNotes(processNo, notesFromNodes(next))
      return next
    })
  }, [persistNotes, processNo, setNodes])
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(undefined)
  }, [])
  const closeDetail = useCallback(() => setSelectedNodeId(undefined), [])

  const handleSnapshot = useCallback(async () => {
    if (!selectedNode || !pathToFocus || snapshotBusy) return
    setSnapshotBusy(true)
    try {
      setSnapshotCapturing(true)
      await nextFrame()
      await nextFrame()
      await nextFrame()
      const el = mapCanvasRef.current
      if (!el) throw new Error('Harita elementi bulunamadı')
      const snapshotPathEdges = edges
        .filter((e) => pathToFocus.edgeIds.has(e.id))
        .map((e) => {
          const fromId = sinkCopyRealId(e.source)
          const toId = sinkCopyRealId(e.target)
          const ge = graph.edges.find((edge) => edge.from === fromId && edge.to === toId)
          const label = ge?.label?.trim()
          return { fromId, toId, label: label || undefined }
        })
      await exportProcessPathSnapshotPdf({
        mapEl: el,
        pathNodeIds: pathToFocus.nodeIds,
        pathEdges: snapshotPathEdges,
        getNodes,
        steps: selectedPathSteps,
        processTitle: summary.title,
        processNo,
        targetName: selectedNode.name,
      })
    } catch (err) {
      console.error('Snapshot export başarısız:', err)
      window.alert(
        `Snapshot oluşturulamadı: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setSnapshotCapturing(false)
      setSnapshotBusy(false)
    }
  }, [
    selectedNode,
    pathToFocus,
    snapshotBusy,
    getNodes,
    selectedPathSteps,
    summary.title,
    processNo,
    edges,
    graph.edges,
  ])

  return (
    <div className={`pf-map-wrap${expanded ? ' is-expanded' : ''}`}>
      <header className="pf-map-head">
        <div className="pf-map-head-primary">
          <h1 className="pf-map-title">{summary.title}</h1>
          <div className="pf-map-head-cluster">
            <span className="pf-map-subtitle">{summary.subtitle}</span>
            {summary.metaLine ? <span className="pf-map-meta">{summary.metaLine}</span> : null}
            {summary.statsLine ? <span className="pf-map-stats">{summary.statsLine}</span> : null}
          </div>
          {onCreateRoute ? (
            <button type="button" className="pf-route-start" onClick={onCreateRoute}>
              Akış Rotanı Oluştur
            </button>
          ) : null}
        </div>
        <ProcessFlowScreens screens={processScreens} highlightOid={highlightScreenOid} />
      </header>
      {canGoBack && onBackToParent ? (
        <button type="button" className="pf-map-back" onClick={onBackToParent}>
          ← Geri
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="pf-map-close" onClick={onDismiss}>
          Kapat
        </button>
      ) : null}
      <div
        ref={mapCanvasRef}
        className={`pf-map-canvas${selectedNodeId ? ' is-drawer-open' : ''}${neighborhood && !selectedNodeId ? (focusIsCanonical ? ' is-path-focus' : ' is-local-focus') : ''}${snapshotCapturing ? ' is-snapshot-capturing' : ''}`}
      >
        <ProcessFlowMapSearch
          query={mapSearchQuery}
          onQueryChange={setMapSearchQuery}
          matchCount={mapSearchMatches.length}
          matchIndex={mapSearchIndex}
          onPrev={() => moveMapSearch(-1)}
          onNext={() => moveMapSearch(1)}
        />
        <div className="pf-map-tools">
          <button
            type="button"
            className="tl-zoom"
            title={expanded ? 'Küçült (Esc)' : 'Tam ekran'}
            aria-label={expanded ? 'Küçült' : 'Tam ekran'}
            onClick={() => setExpanded((v) => !v)}
          >
            <FullscreenGlyph expanded={expanded} />
          </button>
          <button type="button" className="pf-add-note" onClick={addNote}>
            Not ekle
          </button>
        </div>
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
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={processFlowNodeTypes}
        edgeTypes={processFlowEdgeTypes}
        nodesConnectable={false}
        nodesDraggable
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        minZoom={0.06}
        maxZoom={1.8}
        fitView={!wide}
        fitViewOptions={{ padding: 0.16 }}
        defaultViewport={wide ? startCamera(processNodes) : undefined}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background id="pf-dots" variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#c5ccd4" />
        <Controls showInteractive={false} />
        </ReactFlow>
        {selectedNode ? (
          <ProcessFlowDetailDrawer
            open
            nodeId={selectedNode.id}
            nodeName={selectedNode.name}
            kind={selectedNode.kind}
            details={selectedNode.details}
            decisionInfo={selectedNode.decisionInfo}
            services={selectedNode.services}
            subProcessNo={selectedNode.subProcessNo}
            incoming={selectedIncoming}
            outgoing={selectedOutgoing}
            path={selectedPathSteps}
            onSnapshot={handleSnapshot}
            snapshotBusy={snapshotBusy}
            onClose={closeDetail}
            onOpenService={
              onOpenService
                ? (serviceName, serviceId) =>
                    onOpenService(serviceName, selectedNode.id, serviceId)
                : undefined
            }
            onOpenSubProcess={
              onOpenSubProcess
                ? (processNo) => onOpenSubProcess(processNo, selectedNode.id)
                : undefined
            }
            processScreens={processScreens}
            onHighlightScreen={setHighlightScreenOid}
            onFocusNode={focusGraphNode}
            jumpableNodeIds={jumpableNodeIds}
            processNo={processNo}
            nodeDescriptions={graph.nodeDescriptions}
            canEditCatalog={canEditCatalog}
            onNodeDescriptionsChange={onNodeDescriptionsChange}
          />
        ) : null}
      </div>
    </div>
  )
}

export function ProcessFlowMap({
  graph,
  processScreens,
  onDismiss,
  canGoBack,
  onBackToParent,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
  onOpenSubProcess,
  onCreateRoute,
  canEditCatalog,
  onNodeDescriptionsChange,
}: {
  graph: ProcessFlowGraph
  processScreens?: import('../../types').ServiceScreenLink[]
  onDismiss?: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
  onCreateRoute?: () => void
  canEditCatalog?: boolean
  onNodeDescriptionsChange?: (doc: ProcessNodeDescriptionsDoc) => void
}) {
  return (
    <ReactFlowProvider>
      <ProcessFlowMapInner
        key={graph.no}
        graph={graph}
        processScreens={processScreens}
        onDismiss={onDismiss}
        canGoBack={canGoBack}
        onBackToParent={onBackToParent}
        initialSelectedNodeId={initialSelectedNodeId}
        onRestoreConsumed={onRestoreConsumed}
        onOpenService={onOpenService}
        onOpenSubProcess={onOpenSubProcess}
        onCreateRoute={onCreateRoute}
        canEditCatalog={canEditCatalog}
        onNodeDescriptionsChange={onNodeDescriptionsChange}
      />
    </ReactFlowProvider>
  )
}
