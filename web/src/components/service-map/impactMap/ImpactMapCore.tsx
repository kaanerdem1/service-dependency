import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  EdgeLabelRenderer,
  MiniMap,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  applyScopeFilter,
  discoveryParents,
  filterEdges,
  filterNodes,
} from '../../../impact/projectFilter'
import { animateViewport, easeInOutCubic, easeOutCubic, lerp, waitMs } from '../../../impact/pivotTransition'
import { getNoteCounts, listMethodsForService } from '../../../api/client'
import {
  mapLayoutForDepth,
  mapLayoutForRadial,
  radialAnchorOffset,
  radialMaxZoom,
  type MapLayoutMode,
  type RadialViewportHint,
} from '../../../impact/mapLayout'
import type { ImpactGraph, MethodRef } from '../../../types'
import {
  MapCanvasBar,
  MapInfoPanel,
  MapViewportSync,
  ProjectFilterHint,
  RadialLabelZoomSync,
} from '../ImpactChrome'
import { saveExploreSnapshot } from '../../../api/client'
import { captureSnapshotScreenshots, downloadSnapshotPng } from '../../../snapshot/capture'
import { snapshotHasMapImage } from '../../../snapshot/imageUrl'
import { useSnapshotTrailOptional } from '../../../snapshot/trail'
import { snapshotWatermarkLines } from '../../../snapshot/useSnapshotPack'
import { BADGE_GAP, MAP_LAYOUT_MODE_KEY } from './constants'
import {
  buildGraph,
  edgeTouchesFocus,
  neighborIds,
  reactFlowEdgeId,
} from './buildGraph'
import { FocusEdgeHopChip, impactMapEdgeTypes } from './edges'
import { impactMapNodeTypes } from './nodes'
import { MethodPopover, NotesPopover, methodsWithOutgoing } from './popovers'
import type {
  FanEdgeData,
  ImpactMapProps,
  MethodBadgeData,
  RingGuideData,
  ServiceNodeData,
} from './types'

export function ImpactMap({
  graph,
  projectOptions,
  packageOptions = [],
  onPivot,
  onSelectMethod,
  onBrowseMethods: _onBrowseMethods,
  onClearCenter,
  onPivotBack,
  onPivotForward,
  canPivotBack = false,
  canPivotForward = false,
  mapExpanded = false,
  restoredView,
  onViewStateChange,
  navDirection = null,
  onNavDirectionConsumed,
  sessionUserId,
  sessionUserName,
  onMapRoot,
  onBeforeSnapshot,
  onSnapshotSaved,
  forceLtrSignal = 0,
  onOpenAffectedTab,
}: ImpactMapProps) {
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [snapshotSaving, setSnapshotSaving] = useState(false)
  const trail = useSnapshotTrailOptional()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('sd-map-drawer-open', infoPanelOpen)
    root.classList.toggle('sd-map-drawer-collapsed', !infoPanelOpen)
    return () => {
      root.classList.remove('sd-map-drawer-open', 'sd-map-drawer-collapsed')
    }
  }, [infoPanelOpen])

  const restoredViewRef = useRef(restoredView)
  restoredViewRef.current = restoredView
  const onViewStateChangeRef = useRef(onViewStateChange)
  onViewStateChangeRef.current = onViewStateChange
  const skipViewNotifyRef = useRef(false)

  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(() => {
    return new Set(restoredView?.expandedLayers ?? [])
  })
  const [expandedProjectClusters, setExpandedProjectClusters] = useState<Set<string>>(
    () => new Set(),
  )
  const [visibleMaxHop, setVisibleMaxHop] = useState(
    () => restoredView?.visibleMaxHop ?? 1,
  )
  const [projectFilters, setProjectFilters] = useState<string[]>([])
  const [packageFilters, setPackageFilters] = useState<string[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null)
  const [showLinkedMethods, setShowLinkedMethods] = useState(false)
  const [showCascadeEdges, setShowCascadeEdges] = useState(false)
  const [expandedMethodServiceId, setExpandedMethodServiceId] = useState<
    string | null
  >(null)
  const [notesServiceId, setNotesServiceId] = useState<string | null>(null)
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [methodsByService, setMethodsByService] = useState<
    Record<string, MethodRef[]>
  >({})
  const [methodsLoading, setMethodsLoading] = useState(false)
  const [tidyNonce, setTidyNonce] = useState(0)
  const [layoutMode, setLayoutMode] = useState<MapLayoutMode>(() =>
    window.sessionStorage.getItem(MAP_LAYOUT_MODE_KEY) === 'radial'
      ? 'radial'
      : 'ltr',
  )
  const [pivotFlash, setPivotFlash] = useState(false)
  const [pivotMorphing, setPivotMorphing] = useState(false)
  const [focusEdgePositions, setFocusEdgePositions] = useState<{
    edge: Edge
    sourceX: number
    sourceY: number
    targetX: number
    targetY: number
    sourcePosition: Position
    targetPosition: Position
  } | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapPane, setMapPane] = useState({ w: 0, h: 0 })
  const [userInteracting, setUserInteracting] = useState(false)
  const interactEndTimer = useRef(0)
  const hoverClearTimer = useRef(0)
  const drawerHoverRef = useRef(false)
  const nodeDragged = useRef(false)
  const lastTidyRef = useRef(0)
  const layoutEpochRef = useRef('')
  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const pivotMorphingRef = useRef(false)
  const layoutDirtyRef = useRef(false)
  const pivotAnimRef = useRef(0)
  const prevCenterLayoutRef = useRef(graph.center.id)
  const prevBuiltIdsRef = useRef<Set<string>>(new Set())
  const prevVisibleHopRef = useRef(visibleMaxHop)
  const revealClearTimerRef = useRef(0)

  const hasScopeFilter = projectFilters.length > 0 || packageFilters.length > 0
  const filter = useMemo(
    () =>
      applyScopeFilter(
        graph,
        hasScopeFilter
          ? { projectIds: projectFilters, packageIds: packageFilters }
          : null,
      ),
    [graph, hasScopeFilter, projectFilters, packageFilters],
  )
  const filterLabel = useMemo(() => {
    const labels = [
      ...projectFilters.map(
        (id) => projectOptions.find((p) => p.id === id)?.label ?? id,
      ),
      ...packageFilters.map(
        (id) => packageOptions?.find((p) => p.id === id)?.label ?? id,
      ),
    ]
    if (labels.length <= 2) return labels.join(', ')
    return `${labels.length} kapsam`
  }, [projectFilters, packageFilters, projectOptions, packageOptions])

  const projectLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projectOptions) m.set(p.id, p.label)
    for (const n of graph.nodes) {
      const id = n.service.projectId
      if (!id || id === 'unknown') continue
      if (!m.has(id)) {
        m.set(
          id,
          n.service.projectLabel ||
            n.service.projectGroupLabel ||
            id,
        )
      }
    }
    if (graph.center.projectId && graph.center.projectId !== 'unknown') {
      m.set(
        graph.center.projectId,
        graph.center.projectLabel ||
          graph.center.projectGroupLabel ||
          m.get(graph.center.projectId) ||
          graph.center.projectId,
      )
    }
    return m
  }, [projectOptions, graph.nodes, graph.center])

  const filteredGraph = useMemo((): ImpactGraph => {
    if (!hasScopeFilter) return graph
    return {
      ...graph,
      nodes: filterNodes(graph.nodes, filter.keepIds),
      edges: filterEdges(graph.edges, filter.keepIds),
    }
  }, [graph, hasScopeFilter, filter.keepIds])

  const maxHopAvailable = useMemo(() => {
    let m = 1
    for (const n of filteredGraph.nodes) m = Math.max(m, n.hop)
    return m
  }, [filteredGraph.nodes])

  const lastForceLtr = useRef(forceLtrSignal)
  useEffect(() => {
    if (!forceLtrSignal || forceLtrSignal === lastForceLtr.current) return
    lastForceLtr.current = forceLtrSignal
    setLayoutMode('ltr')
    window.sessionStorage.setItem(MAP_LAYOUT_MODE_KEY, 'ltr')
    layoutDirtyRef.current = false
    setTidyNonce((n) => n + 1)
  }, [forceLtrSignal])

  useEffect(() => {
    trail?.syncView({
      layout: layoutMode,
      visibleMaxHop,
      maxHopAvailable,
      showCascadeEdges,
    })
  }, [trail, layoutMode, visibleMaxHop, maxHopAvailable, showCascadeEdges])

  useEffect(() => {
    trail?.syncUi({ drawerOpen: infoPanelOpen })
  }, [trail, infoPanelOpen])

  useEffect(() => {
    trail?.syncFocus({
      level: 'service',
      id: graph.center.id,
      label: graph.center.name,
      treePath: [
        graph.center.projectId,
        graph.center.packageId,
        graph.center.name,
      ],
      serviceId: graph.center.id,
    })
  }, [trail, graph.center])

  const attachMapRef = useCallback(
    (el: HTMLDivElement | null) => {
      mapRef.current = el
      onMapRoot?.(el)
    },
    [onMapRoot],
  )

  const handleSaveSnapshot = useCallback(async () => {
    if (!sessionUserId || !trail) return
    setSnapshotSaving(true)
    try {
      onBeforeSnapshot?.()
      const base = trail.getClientPayload()
      const screenshots = await captureSnapshotScreenshots({
        mapRoot: mapRef.current,
        workspaceRoot: document.querySelector('.workspace'),
        watermark: snapshotWatermarkLines([`Keşif · ${graph.center.name}`]),
      })
      const snap = await saveExploreSnapshot({
        personId: sessionUserId,
        personName: sessionUserName,
        client: { ...base, screenshots },
      })
      if (snapshotHasMapImage(snap)) {
        const mapShot = snap.screenshots!.find((s) => s.surface === 'map')!
        void downloadSnapshotPng(mapShot.url, `${snap.id}.png`)
      }
      onSnapshotSaved?.(snap)
    } catch (e) {
      console.error('[snapshot]', e)
    } finally {
      setSnapshotSaving(false)
    }
  }, [sessionUserId, sessionUserName, trail, graph.center.name, onBeforeSnapshot, onSnapshotSaved])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    let t = 0
    const measure = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      setMapPane((prev) =>
        Math.abs(prev.w - w) < 24 && Math.abs(prev.h - h) < 24 ? prev : { w, h },
      )
    }
    measure()
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t)
      t = window.setTimeout(measure, 160)
    })
    ro.observe(el)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [mapExpanded])

  useEffect(() => {
    return () => window.clearTimeout(interactEndTimer.current)
  }, [])

  const radialViewport = useMemo((): RadialViewportHint | undefined => {
    if (layoutMode !== 'radial') return undefined
    const w = mapPane.w > 80 ? mapPane.w : 720
    const h = mapPane.h > 80 ? mapPane.h : 480
    return {
      width: w,
      height: h,
      fullscreen: mapExpanded,
      spokeScale: 2.15,
    }
  }, [layoutMode, mapPane.w, mapPane.h, mapExpanded])

  const layout = useMemo(() => {
    const base =
      layoutMode === 'radial'
        ? mapLayoutForRadial()
        : mapLayoutForDepth(visibleMaxHop)
    if (layoutMode !== 'radial' || !mapExpanded || mapPane.w <= 0) return base
    const aspect = mapPane.w / Math.max(mapPane.h, 1)
    return { ...base, maxZoom: radialMaxZoom(base, true, aspect) }
  }, [visibleMaxHop, layoutMode, mapExpanded, mapPane.w, mapPane.h])

  const built = useMemo(
    () =>
      buildGraph(
        filteredGraph,
        expandedLayers,
        hasScopeFilter ? filter.bridgeIds : new Set(),
        hasScopeFilter ? filter.matchIds : new Set(),
        visibleMaxHop,
        hasScopeFilter,
        hasScopeFilter,
        layout,
        layoutMode,
        radialViewport,
        expandedProjectClusters,
      ),
    [
      filteredGraph,
      expandedLayers,
      expandedProjectClusters,
      projectLabels,
      hasScopeFilter,
      filter.bridgeIds,
      filter.matchIds,
      visibleMaxHop,
      layout,
      layoutMode,
      radialViewport,
    ],
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

  const cascadeCount = useMemo(
    () =>
      built.edges.filter(
        (e) => (e.data as { kind?: string } | undefined)?.kind === 'cascade',
      ).length,
    [built.edges],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (layoutMode !== 'radial') {
        onNodesChange(changes)
        return
      }
      const centerMove = changes.find(
        (c) =>
          c.type === 'position' &&
          c.id === graph.center.id &&
          c.position,
      )
      const cx =
        centerMove && centerMove.type === 'position' && centerMove.position
          ? centerMove.position.x + radialAnchorOffset(true).x
          : null
      const cy =
        centerMove && centerMove.type === 'position' && centerMove.position
          ? centerMove.position.y + radialAnchorOffset(true).y
          : null
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds)
        if (cx == null || cy == null) return next
        return next.map((n) => {
          const d = n.data as ServiceNodeData
          if (!d.radialDot) return n
          return { ...n, data: { ...d, radialCx: cx, radialCy: cy } }
        })
      })
      if (cx != null && cy != null) {
        setEdges((eds) =>
          eds.map((e) => ({
            ...e,
            data: { ...(e.data as FanEdgeData), cx, cy },
          })),
        )
      }
    },
    [onNodesChange, layoutMode, graph.center.id, setNodes, setEdges],
  )

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
    skipViewNotifyRef.current = true
    const saved = restoredViewRef.current
    setExpandedLayers(new Set(saved?.expandedLayers ?? []))
    setVisibleMaxHop(saved?.visibleMaxHop ?? 1)
    setFocusId(null)
    setFocusEdgeId(null)
    setProjectFilters([])
    setPackageFilters([])
    setExpandedProjectClusters(new Set())
    setShowLinkedMethods(false)
    setExpandedMethodServiceId(null)
    setNotesServiceId(null)
    setMethodsByService({})
    setNoteCounts({})
    layoutDirtyRef.current = false
    setPivotFlash(true)
    const t = window.setTimeout(() => setPivotFlash(false), 560)
    const t2 = window.setTimeout(() => {
      skipViewNotifyRef.current = false
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
    }
  }, [graph.center.id])

  useEffect(() => {
    if (mapExpanded) return
    setInfoPanelOpen(true)
  }, [graph.center.id, mapExpanded])

  useEffect(() => {
    if (skipViewNotifyRef.current) return
    onViewStateChangeRef.current?.({
      visibleMaxHop,
      expandedLayers: [...expandedLayers].sort((a, b) => a - b),
    })
  }, [visibleMaxHop, expandedLayers])

  useEffect(() => {
    if (!hasScopeFilter || filter.matchCount === 0) return
    setVisibleMaxHop(Math.max(1, filter.deepestHop))
    setExpandedLayers(new Set(filteredGraph.nodes.map((n) => n.hop)))
  }, [hasScopeFilter, filter.matchCount, filter.deepestHop, filteredGraph.nodes])

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
        // Servisin kendi method kataloğu (tümü)
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

  const refreshNoteCounts = useCallback(() => {
    if (!sessionUserId || visibleServiceIds.length === 0) {
      setNoteCounts({})
      return
    }
    void getNoteCounts(visibleServiceIds, sessionUserId)
      .then(setNoteCounts)
      .catch(() => setNoteCounts({}))
  }, [sessionUserId, visibleServiceIds])

  useEffect(() => {
    refreshNoteCounts()
  }, [refreshNoteCounts])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ serviceId: string }>).detail
      if (!detail?.serviceId || !sessionUserId) return
      setExpandedMethodServiceId(null)
      setNotesServiceId(detail.serviceId)
    }
    window.addEventListener('map-open-notes', onOpen)
    return () => window.removeEventListener('map-open-notes', onOpen)
  }, [sessionUserId])

  // Rozetler + sürüklenen konumları koru (Hizala / pivot morph / merkez değişimi hariç)
  useEffect(() => {
    if (pivotMorphingRef.current) return

    const centerChanged = prevCenterLayoutRef.current !== graph.center.id
    prevCenterLayoutRef.current = graph.center.id
    const layoutEpoch = `${layoutMode}:${visibleMaxHop}:${layout.size}:${mapExpanded}`
    const epochChanged = layoutEpochRef.current !== layoutEpoch
    layoutEpochRef.current = layoutEpoch
    const resetLayout =
      tidyNonce !== lastTidyRef.current ||
      centerChanged ||
      epochChanged
    lastTidyRef.current = tidyNonce

    const hopExpanded =
      visibleMaxHop > prevVisibleHopRef.current && !centerChanged
    const layoutStagger = epochChanged && !centerChanged && !hopExpanded
    const revealById = new Map<string, number>()
    if (hopExpanded || layoutStagger) {
      const newcomers = built.nodes.filter(
        (n) =>
          n.type === 'serviceNode' &&
          n.id !== graph.center.id &&
          (layoutStagger || !prevBuiltIdsRef.current.has(n.id)),
      )
      newcomers.sort((a, b) => {
        const da = a.data as ServiceNodeData
        const db = b.data as ServiceNodeData
        if (da.hop !== db.hop) return da.hop - db.hop
        if (a.position.y !== b.position.y) return a.position.y - b.position.y
        return a.position.x - b.position.x
      })
      newcomers.forEach((n, i) => revealById.set(n.id, i))
    }
    prevVisibleHopRef.current = visibleMaxHop
    prevBuiltIdsRef.current = new Set(
      built.nodes.filter((n) => n.type === 'serviceNode').map((n) => n.id),
    )

    type AnyNode = Node<ServiceNodeData | MethodBadgeData | RingGuideData>
    setNodes((current) => {
      const posById = new Map(current.map((n) => [n.id, n.position]))
      const out: AnyNode[] = built.nodes.map((n) => ({
        ...n,
        data:
          'kind' in n.data
            ? {
                ...n.data,
                revealIndex: revealById.get(n.id),
                noteCount:
                  n.data.kind === 'center' || n.data.kind === 'service'
                    ? (noteCounts[n.id] ?? 0)
                    : n.data.noteCount,
              }
            : n.data,
        position: resetLayout ? n.position : (posById.get(n.id) ?? n.position),
      }))

      if (showLinkedMethods) {
        for (const n of out) {
          const d = n.data
          if (!('kind' in d) || (d.kind !== 'center' && d.kind !== 'service')) {
            continue
          }
          const count = methodsWithOutgoing(methodsByService[n.id] ?? []).length
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
              x: n.position.x + (layoutMode === 'radial' ? 0 : layout.nodeW + BADGE_GAP),
              y:
                n.position.y +
                (layoutMode === 'radial' ? layout.nodeW + 6 : 18),
            },
            draggable: false,
            selectable: true,
          })
        }
      }

      return out as Node<ServiceNodeData>[]
    })

    if (revealById.size > 0) {
      window.clearTimeout(revealClearTimerRef.current)
      const revealedIds = [...revealById.keys()]
      revealClearTimerRef.current = window.setTimeout(() => {
        setNodes((current) =>
          current.map((node) => {
            if (!revealedIds.includes(node.id) || !('kind' in node.data)) {
              return node
            }
            const d = node.data as ServiceNodeData
            if (d.revealIndex === undefined) return node
            const { revealIndex: _r, ...rest } = d
            return { ...node, data: rest }
          }),
        )
      }, 520)
    }
  }, [
    built,
    layout.nodeW,
    layout.size,
    layoutMode,
    visibleMaxHop,
    showLinkedMethods,
    methodsByService,
    expandedMethodServiceId,
    noteCounts,
    tidyNonce,
    graph.center.id,
    setNodes,
  ])

  // Hover / metod flyout: ego dışını soluklaştır
  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const methodFocus = expandedMethodServiceId
    const active = Boolean(methodFocus || focusId || focusEdgeId)
    const edgeFocusing = !userInteracting && Boolean(focusId || focusEdgeId)
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
    root.querySelectorAll<HTMLElement>('.react-flow__edge').forEach((el) => {
      el.classList.remove('dd-edge-on', 'dd-edge-off')
      if (!edgeFocusing) return
      const eid = reactFlowEdgeId(el)
      const edge = built.edges.find((e) => e.id === eid)
      if (!edge) return
      if (
        !showCascadeEdges &&
        (edge.data as { kind?: string } | undefined)?.kind === 'cascade'
      ) {
        el.classList.add('dd-edge-off')
        return
      }
      const on = focusEdgeId
        ? eid === focusEdgeId
        : edgeTouchesFocus(edge, focusId)
      el.classList.add(on ? 'dd-edge-on' : 'dd-edge-off')
    })

    if (focusEdgeId && rfInstance.current) {
      const rfEdge = rfInstance.current
        .getEdges()
        .find((e) => e.id === focusEdgeId)
      if (rfEdge) {
        const src = rfInstance.current.getNode(rfEdge.source)
        const tgt = rfInstance.current.getNode(rfEdge.target)
        if (src && tgt) {
          const sx = src.position.x + (src.width ?? layout.nodeW) / 2
          const sy = src.position.y + 40
          const tx = tgt.position.x + (tgt.width ?? layout.nodeW) / 2
          const ty = tgt.position.y + 40
          const builtEdge = built.edges.find((e) => e.id === focusEdgeId)
          if (builtEdge) {
            setFocusEdgePositions({
              edge: builtEdge,
              sourceX: sx,
              sourceY: sy,
              targetX: tx,
              targetY: ty,
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
            })
          }
        }
      }
    } else {
      setFocusEdgePositions(null)
    }
  }, [
    egoIds,
    focusId,
    focusEdgeId,
    nodes,
    built.edges,
    expandedMethodServiceId,
    userInteracting,
    showCascadeEdges,
    layout.nodeW,
  ])

  useEffect(() => {
    const sourceEdges = showCascadeEdges
      ? built.edges
      : built.edges.filter(
          (e) =>
            (e.data as { kind?: string } | undefined)?.kind !== 'cascade',
        )
    setEdges(sourceEdges)
  }, [built.edges, showCascadeEdges, setEdges])

  const pivotToNode = useCallback(
    async (node: Node) => {
      const targetId = node.id
      const fromCenterId = graph.center.id

      const inst = rfInstance.current
      if (!inst) {
        onPivot(targetId)
        return
      }

      const centerNode = inst.getNode(fromCenterId)
      const targetNode = inst.getNode(targetId)
      if (!centerNode || !targetNode) {
        onPivot(targetId)
        return
      }

      const animId = ++pivotAnimRef.current
      pivotMorphingRef.current = true
      setPivotMorphing(true)

      const nodeFocusX = (n: Node) => n.position.x + layout.nodeW / 2
      const nodeFocusY = (n: Node) => n.position.y + 48
      const startVp = inst.getViewport()

      await animateViewport(
        inst,
        { ...startVp, zoom: Math.max(layout.minZoom, startVp.zoom * 0.86) },
        240,
        easeOutCubic,
      )
      if (pivotAnimRef.current !== animId) return

      inst.setCenter(nodeFocusX(targetNode), nodeFocusY(targetNode), {
        zoom: inst.getZoom(),
        duration: 280,
      })
      await waitMs(280)
      if (pivotAnimRef.current !== animId) return

      const centerStart = { ...centerNode.position }
      const targetStart = { ...targetNode.position }
      const targetEnd = { ...centerStart }
      const colPitch = layout.nodeW + layout.colGap
      const centerEnd = {
        x: centerStart.x - colPitch * 1.05,
        y: centerStart.y,
      }
      const morphMs = 540
      const t0 = performance.now()

      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          if (pivotAnimRef.current !== animId) {
            resolve()
            return
          }
          const t = Math.min(1, (now - t0) / morphMs)
          const e = easeOutCubic(t)
          const targetPos = {
            x: lerp(targetStart.x, targetEnd.x, e),
            y: lerp(targetStart.y, targetEnd.y, e),
          }
          const oldCenterPos = {
            x: lerp(centerStart.x, centerEnd.x, e),
            y: lerp(centerStart.y, centerEnd.y, e),
          }

          setNodes((current) => {
            const posById = new Map<string, { x: number; y: number }>()
            for (const n of current) {
              if (n.id === targetId) posById.set(n.id, targetPos)
              else if (n.id === fromCenterId) posById.set(n.id, oldCenterPos)
              else posById.set(n.id, n.position)
            }
            return current.map((n) => {
              if (n.id === targetId) {
                return {
                  ...n,
                  position: targetPos,
                  className: 'pivot-incoming',
                }
              }
              if (n.id === fromCenterId) {
                return {
                  ...n,
                  position: oldCenterPos,
                  className: 'pivot-slide-out',
                  style: {
                    ...n.style,
                    opacity: 1 - e * 0.45,
                  },
                }
              }
              if (n.type === 'methodBadge') {
                const sid = (n.data as unknown as MethodBadgeData).serviceId
                const parent = posById.get(sid)
                if (parent) {
                  return {
                    ...n,
                    position: {
                      x: parent.x + layout.nodeW + BADGE_GAP,
                      y: parent.y + 18,
                    },
                  }
                }
              }
              return n
            })
          })

          inst.setCenter(
            targetPos.x + layout.nodeW / 2,
            targetPos.y + 48,
            { zoom: inst.getZoom(), duration: 0 },
          )

          if (t < 1) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })

      if (pivotAnimRef.current !== animId) return

      const settledVp = inst.getViewport()
      await animateViewport(
        inst,
        {
          ...settledVp,
          zoom: Math.min(layout.maxZoom, Math.max(layout.minZoom, settledVp.zoom * 1.06)),
        },
        300,
        easeInOutCubic,
      )
      if (pivotAnimRef.current !== animId) return

      pivotMorphingRef.current = false
      setPivotMorphing(false)
      layoutDirtyRef.current = false
      onPivot(targetId)
    },
    [graph.center.id, layout.colGap, layout.maxZoom, layout.minZoom, layout.nodeW, onPivot, setNodes],
  )

  const switchToRadialLayout = useCallback(() => {
    trail?.record('layout_toggle', undefined, 'LTR +N → Radial')
    layoutDirtyRef.current = false
    setLayoutMode('radial')
    window.sessionStorage.setItem(MAP_LAYOUT_MODE_KEY, 'radial')
    setTidyNonce((n) => n + 1)
  }, [trail])

  const onNodeClick = useCallback(
    (event: ReactMouseEvent, node: Node) => {
      if (pivotMorphingRef.current) return
      if (nodeDragged.current) {
        nodeDragged.current = false
        return
      }
      if (node.type === 'methodBadge') {
        const d = node.data as MethodBadgeData
        setNotesServiceId(null)
        setExpandedMethodServiceId((cur) =>
          cur === d.serviceId ? null : d.serviceId,
        )
        return
      }
      const data = node.data as ServiceNodeData
      if (data.kind === 'collapsed') {
        if (layoutMode === 'ltr') {
          switchToRadialLayout()
          return
        }
        setExpandedLayers((prev) => new Set(prev).add(data.hop))
        return
      }
      if (data.kind === 'cluster' && data.clusterKey) {
        if (event?.shiftKey && onOpenAffectedTab) {
          onOpenAffectedTab(data.clusterKey)
          return
        }
        setUserInteracting(false)
        setExpandedProjectClusters(new Set([data.clusterKey]))
        return
      }
      if (node.id === graph.center.id) {
        onClearCenter?.()
        return
      }
      setExpandedMethodServiceId(null)
      setNotesServiceId(null)
      pivotToNode(node)
    },
    [graph.center.id, layoutMode, onClearCenter, onOpenAffectedTab, pivotToNode, switchToRadialLayout],
  )

  const clearHoverFocus = useCallback(() => {
    window.clearTimeout(hoverClearTimer.current)
    setFocusId(null)
    setFocusEdgeId(null)
  }, [])

  const scheduleHoverClear = useCallback(() => {
    window.clearTimeout(hoverClearTimer.current)
    hoverClearTimer.current = window.setTimeout(() => {
      if (!drawerHoverRef.current) {
        setFocusId(null)
        setFocusEdgeId(null)
      }
    }, 100)
  }, [])

  const onDrawerPointerChange = useCallback((inside: boolean) => {
    drawerHoverRef.current = inside
    if (inside) {
      window.clearTimeout(hoverClearTimer.current)
      return
    }
    scheduleHoverClear()
  }, [scheduleHoverClear])

  const onMoveStart = useCallback(() => {
    window.clearTimeout(interactEndTimer.current)
    setUserInteracting(true)
    setFocusId(null)
    setFocusEdgeId(null)
  }, [])

  const onMoveEnd = useCallback(() => {
    window.clearTimeout(interactEndTimer.current)
    interactEndTimer.current = window.setTimeout(() => {
      setUserInteracting(false)
    }, 120)
  }, [])

  const onNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (e.buttons || userInteracting) return
      window.clearTimeout(hoverClearTimer.current)
      setFocusEdgeId(null)
      setFocusId((prev) => (prev === node.id ? prev : node.id))
    },
    [userInteracting],
  )

  const onNodeMouseLeave = useCallback(() => {
    scheduleHoverClear()
  }, [scheduleHoverClear])

  const onEdgeMouseEnter = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      if (e.buttons || userInteracting) return
      window.clearTimeout(hoverClearTimer.current)
      setFocusId(null)
      setFocusEdgeId(edge.id)
    },
    [userInteracting],
  )

  const onEdgeMouseLeave = useCallback(() => {
    scheduleHoverClear()
  }, [scheduleHoverClear])

  const focusing = Boolean(
    !userInteracting && (focusId || focusEdgeId || expandedMethodServiceId),
  )

  const slideExitThen = useCallback(
    async (dir: 'back' | 'forward', then: () => void) => {
      if (pivotMorphingRef.current) return
      const inst = rfInstance.current
      const animId = ++pivotAnimRef.current
      pivotMorphingRef.current = true
      setPivotMorphing(true)

      if (inst) {
        const vp = inst.getViewport()
        const slide = dir === 'back' ? 130 : -130
        await animateViewport(
          inst,
          { x: vp.x + slide, y: vp.y, zoom: vp.zoom },
          340,
          easeInOutCubic,
          vp,
        )
        if (pivotAnimRef.current !== animId) return
      } else {
        await waitMs(200)
      }

      pivotMorphingRef.current = false
      setPivotMorphing(false)
      then()
    },
    [],
  )

  const handlePivotBack = useCallback(() => {
    if (expandedProjectClusters.size > 0) {
      setExpandedProjectClusters(new Set())
      return
    }
    if (!onPivotBack || !canPivotBack) return
    void slideExitThen('back', onPivotBack)
  }, [canPivotBack, expandedProjectClusters.size, onPivotBack, slideExitThen])

  const handlePivotForward = useCallback(() => {
    if (!onPivotForward || !canPivotForward) return
    void slideExitThen('forward', onPivotForward)
  }, [canPivotForward, onPivotForward, slideExitThen])

  return (
    <div
      ref={attachMapRef}
      className={`impact-map dd-map ${!mapExpanded ? 'is-docked-view' : ''} ${focusing ? ' is-focusing' : ''}${pivotFlash ? ' is-pivot-flash' : ''}${pivotMorphing ? ' is-pivot-morph' : ''}${navDirection === 'back' ? ' is-nav-back' : ''}${navDirection === 'forward' ? ' is-nav-forward' : ''}${layoutMode === 'radial' ? ' is-radial' : ''}${infoPanelOpen ? '' : ' is-drawer-collapsed'}`}
      data-focus={
        expandedMethodServiceId ?? focusId ?? focusEdgeId ?? undefined
      }
      onMouseLeave={clearHoverFocus}
    >
      <div className="map-canvas-row">
      <div className="map-canvas">
      <div className="path-layer-bar">
        <div className="path-layer-start" />
        <div className="path-layer-end">
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={
              (expandedProjectClusters.size === 0 && !canPivotBack) ||
              pivotMorphing
            }
            onClick={handlePivotBack}
            title={
              expandedProjectClusters.size > 0
                ? 'Gruplara dön'
                : 'Önceki pivot'
            }
          >
            ← Geri
          </button>
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotForward || pivotMorphing}
            onClick={handlePivotForward}
            title="Sonraki pivot"
          >
            İleri →
          </button>
        </div>
      </div>
      {hasScopeFilter && (
        <ProjectFilterHint
          filterLabel={filterLabel}
          matchCount={filter.matchCount}
          deepestHop={filter.deepestHop}
          bridgeCount={filter.bridgeIds.size}
          hop1EmptyButDeeper={filter.hop1EmptyButDeeper}
        />
      )}
      <div className="map-canvas-dock-host">
      <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={impactMapNodeTypes}
        edgeTypes={impactMapEdgeTypes}
        onInit={(inst) => {
          rfInstance.current = inst
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable
        nodeDragThreshold={4}
        selectNodesOnDrag={false}
        nodesConnectable={false}
        panOnDrag
        onlyRenderVisibleElements
        minZoom={layout.minZoom}
        maxZoom={layout.maxZoom}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onNodeDrag={() => {
          nodeDragged.current = true
          layoutDirtyRef.current = true
        }}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onPaneClick={() => {
          nodeDragged.current = false
          clearHoverFocus()
        }}
        proOptions={{ hideAttribution: true }}
      >
        <RadialLabelZoomSync
          layoutTick={`${layoutMode}-${visibleMaxHop}-${tidyNonce}-${graph.center.id}-${mapExpanded}-${[...expandedProjectClusters].sort().join(',')}`}
        />
        <MiniMap
          className="map-minimap"
          aria-label="Harita özeti"
          pannable
          zoomable
          nodeColor={(node) => {
            const d = node.data as ServiceNodeData | undefined
            if (d?.kind === 'center') return '#1e3a2f'
            if (d?.kind === 'collapsed' || d?.kind === 'cluster') return '#6f9b86'
            return '#3d7a60'
          }}
          maskColor="color-mix(in srgb, var(--map-bg, #fff) 72%, transparent)"
        />
        {focusEdgePositions && (
          <EdgeLabelRenderer>
            <FocusEdgeHopChip {...focusEdgePositions} />
          </EdgeLabelRenderer>
        )}
        <MapViewportSync
          centerId={graph.center.id}
          visibleMaxHop={visibleMaxHop}
          layoutKey={`${showLinkedMethods}-${Object.keys(methodsByService).length}-${layout.size}-${layoutMode}-${mapExpanded}-${tidyNonce}-${visibleMaxHop}-${[...expandedProjectClusters].sort().join(',')}`}
          layout={layout}
          layoutMode={layoutMode}
          drawerOpen={infoPanelOpen}
          mapExpanded={mapExpanded}
          navDirection={navDirection}
          onNavDirectionConsumed={onNavDirectionConsumed}
          userInteracting={userInteracting}
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
          drawerOpen={infoPanelOpen}
          layoutMode={layoutMode}
          truncated={graph.truncated}
          cascadeCount={cascadeCount}
          showCascadeEdges={showCascadeEdges}
          onToggleCascadeEdges={() => {
            trail?.record(
              'cascade_toggle',
              undefined,
              showCascadeEdges ? 'Yan bağ kapatıldı' : 'Yan bağ açıldı',
            )
            setShowCascadeEdges((v) => !v)
          }}
          onCollapseLayer={() => {
            const next = Math.max(1, visibleMaxHop - 1)
            trail?.record(
              'layer_change',
              undefined,
              next === visibleMaxHop
                ? 'Katman kapatıldı (zaten minimum)'
                : `Katman kapatıldı (${visibleMaxHop} → ${next})`,
            )
            setVisibleMaxHop(next)
          }}
          onExpandLayer={() => {
            const next = Math.min(maxHopAvailable, visibleMaxHop + 1)
            trail?.record(
              'layer_change',
              undefined,
              next === visibleMaxHop
                ? 'Katman açıldı (zaten maksimum)'
                : `Katman açıldı (${visibleMaxHop} → ${next})`,
            )
            setVisibleMaxHop(next)
          }}
          onExpandAll={() => {
            trail?.record(
              'layer_change',
              undefined,
              `Tüm katmanlar açıldı (${visibleMaxHop} → ${maxHopAvailable})`,
            )
            setVisibleMaxHop(maxHopAvailable)
            setExpandedLayers(new Set(filteredGraph.nodes.map((n) => n.hop)))
          }}
          onCollapseAll={() => {
            trail?.record('layer_change', undefined, 'Tüm katmanlar kapatıldı (→ 1)')
            setVisibleMaxHop(1)
            setExpandedLayers(new Set())
          }}
          onTidyUp={() => {
            layoutDirtyRef.current = false
            setTidyNonce((n) => n + 1)
          }}
          onToggleLayoutMode={() => {
            trail?.record(
              'layout_toggle',
              undefined,
              layoutMode === 'ltr' ? 'Layout LTR → Radial' : 'Layout Radial → LTR',
            )
            layoutDirtyRef.current = false
            setLayoutMode((mode) => {
              const next = mode === 'ltr' ? 'radial' : 'ltr'
              window.sessionStorage.setItem(MAP_LAYOUT_MODE_KEY, next)
              return next
            })
            setTidyNonce((n) => n + 1)
          }}
          onSaveSnapshot={
            sessionUserId && trail ? () => void handleSaveSnapshot() : undefined
          }
          snapshotSaving={snapshotSaving}
          showLinkedMethods={showLinkedMethods}
          methodsLoading={methodsLoading}
          onToggleLinkedMethods={() => setShowLinkedMethods((value) => !value)}
          projectFilters={projectFilters}
          projectOptions={projectOptions}
          packageFilters={packageFilters}
          packageOptions={packageOptions}
          onProjectFiltersChange={setProjectFilters}
          onPackageFiltersChange={setPackageFilters}
        />
      </ReactFlowProvider>
      </div>
      </div>
      <MapInfoPanel
        center={graph.center}
        projectLabel={
          projectLabels.get(graph.center.projectId) ?? graph.center.projectId
        }
        centerId={graph.center.id}
        nodes={graph.nodes}
        parents={parents}
        projectLabels={projectLabels}
        matchIds={hasScopeFilter ? filter.matchIds : null}
        bridgeCount={hasScopeFilter ? filter.bridgeIds.size : 0}
        filterLabel={filterLabel || undefined}
        truncated={graph.truncated}
        focusId={breadcrumbFocus}
        nameById={nameById}
        onHoverPathSelect={(id) =>
          id === graph.center.id ? onClearCenter?.() : onPivot(id)
        }
        open={infoPanelOpen}
        onOpenChange={(open) => {
          trail?.record(
            'drawer_toggle',
            undefined,
            open ? 'Etki özeti açıldı' : 'Etki özeti kapatıldı',
          )
          setInfoPanelOpen(open)
        }}
        onDrawerPointerChange={onDrawerPointerChange}
      />
      </div>
      {expandedMethodServiceId &&
        onSelectMethod &&
        methodsWithOutgoing(methodsByService[expandedMethodServiceId] ?? [])
          .length > 0 && (
          <MethodPopover
            serviceId={expandedMethodServiceId}
            serviceName={
              nameById.get(expandedMethodServiceId) ?? expandedMethodServiceId
            }
            methods={methodsWithOutgoing(
              methodsByService[expandedMethodServiceId]!,
            )}
            mapRef={mapRef}
            onSelectMethod={onSelectMethod}
            onClose={() => setExpandedMethodServiceId(null)}
          />
        )}
      {notesServiceId && sessionUserId && (
        <NotesPopover
          serviceId={notesServiceId}
          serviceName={nameById.get(notesServiceId) ?? notesServiceId}
          sessionUserId={sessionUserId}
          mapRef={mapRef}
          onClose={() => setNotesServiceId(null)}
          onCountsChanged={refreshNoteCounts}
        />
      )}
    </div>
  )
}
