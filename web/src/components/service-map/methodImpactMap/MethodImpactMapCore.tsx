import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  mapLayoutForDepth,
  mapLayoutForRadial,
  type MapLayoutMode,
} from '../../../impact/mapLayout'
import { EDGE_COLOR, EDGE_MARKER } from './constants'
import { MapCanvasBar, MapViewportSync, RadialLabelZoomSync } from '../ImpactChrome'
import {
  buildLayeredMap,
  layersAsMethods,
  layersAsServices,
} from './buildGraph'
import { methodImpactNodeTypes } from './nodes'
import type { MethodImpactMapProps, MapNodeData, ViewMode } from './types'

export function MethodImpactMap({
  graph,
  onSelectMethod,
  onSelectService,
  onClearMethod,
  onPivotBack,
  onPivotForward,
  canPivotBack = false,
  canPivotForward = false,
}: MethodImpactMapProps) {
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

  const builtNodeSig = useMemo(
    () =>
      built.nodes
        .filter((n) => n.type === 'serviceNode')
        .map(
          (n) =>
            `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}`,
        )
        .join('|'),
    [built.nodes],
  )

  const [viewportSyncKey, setViewportSyncKey] = useState(0)
  useLayoutEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setViewportSyncKey((k) => k + 1)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [builtNodeSig, visibleMaxHop, layout.size, graph.center.id, tidyNonce])

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
      const eid =
        el.getAttribute('data-testid')?.replace(/^rf__edge-/, '') ??
        el.getAttribute('data-id') ??
        ''
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
        nodeTypes={methodImpactNodeTypes}
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
          layoutKey={`${viewMode}-${expandedLayers.size}-${graph.center.id}-${layout.size}-${layoutMode}-${tidyNonce}-${visibleMaxHop}`}
          layout={layout}
          layoutMode={layoutMode}
          viewportSyncKey={viewportSyncKey}
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
            setLayoutMode((m: MapLayoutMode) => (m === 'ltr' ? 'radial' : 'ltr'))
            setTidyNonce((n) => n + 1)
          }}
        />
      </ReactFlowProvider>
      </div>
    </div>
  )
}
