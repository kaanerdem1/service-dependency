import { MarkerType, Position, type Edge, type Node } from 'reactflow'
import {
  applyRadialLayout,
  compactMapLabel,
  mapLabelNeedsTip,
  mapLayoutForDepth,
  mapNodeSizeFor,
  mapNodeWidth,
  radialAnchorOffset,
  radialHandlePair,
  type MapLayout,
  type MapLayoutMode,
  type RadialViewportHint,
} from '../../../impact/mapLayout'
import {
  RADIAL_CENTER_HIT,
  RADIAL_DOT_R,
  RADIAL_HIT,
} from '../../../impact/mapLayout'
import type { ImpactGraph, ImpactNode } from '../../../types'
import {
  LEFT_X,
  MAX_VISIBLE_PER_LAYER,
  MIN_COLLAPSE_COUNT,
  RADIAL_HOP1_CAP,
} from './constants'
import type { FanEdgeData, ServiceNodeData } from './types'

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

function splitLayer(
  all: ImpactNode[],
  expanded: boolean,
  hop: number,
  layoutMode: MapLayoutMode,
) {
  if (expanded) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  const cap =
    layoutMode === 'radial' && hop === 1
      ? RADIAL_HOP1_CAP
      : layoutMode === 'radial'
        ? RADIAL_HOP1_CAP
        : MAX_VISIBLE_PER_LAYER
  const minRest = layoutMode === 'radial' ? 1 : MIN_COLLAPSE_COUNT
  if (all.length <= cap) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  const hidden = all.slice(cap)
  if (hidden.length < minRest) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  return {
    visible: all.slice(0, cap),
    hidden,
  }
}

function splitRestIntoBubbles(
  rest: ImpactNode[],
  bubbleCount: number,
): { key: string; label: string; nodes: ImpactNode[] }[] {
  if (!rest.length) return []
  const n = Math.max(1, bubbleCount)
  const size = Math.ceil(rest.length / n)
  const clusters: { key: string; label: string; nodes: ImpactNode[] }[] = []
  for (let i = 0; i < n; i++) {
    const slice = rest.slice(i * size, (i + 1) * size)
    if (!slice.length) continue
    clusters.push({
      key: `b${i}`,
      label: `+${slice.length} servis`,
      nodes: slice,
    })
  }
  return clusters
}

/**
 * Radial hop-1: ≤8 hepsi ayrı.
 * 9–40: 6 servis + 2 bubble (kalan yarı yarıya, 20→7+7).
 * Daha kalabalık: 8–16 bubble (~20’lik).
 */
function chunkHop1Bubbles(
  nodes: ImpactNode[],
  expandedKey?: string,
): { visible: ImpactNode[]; clusters: { key: string; label: string; nodes: ImpactNode[] }[] } {
  const ringSlots = 8
  const keepIndividual = 6
  const overflowBubbles = 2
  const hybridMax = 40
  const perBubble = 20

  let visible: ImpactNode[] = []
  let clusters: { key: string; label: string; nodes: ImpactNode[] }[] = []

  if (nodes.length <= ringSlots) {
    visible = nodes
  } else if (nodes.length <= hybridMax) {
    visible = nodes.slice(0, keepIndividual)
    clusters = splitRestIntoBubbles(nodes.slice(keepIndividual), overflowBubbles)
  } else {
    const slotCount = Math.min(16, Math.max(8, Math.ceil(nodes.length / perBubble)))
    clusters = splitRestIntoBubbles(nodes, slotCount)
  }

  if (expandedKey) {
    const open = clusters.find((c) => c.key === expandedKey)
    return { visible: open?.nodes ?? [], clusters: [] }
  }

  return { visible, clusters }
}

export function buildGraph(
  graph: ImpactGraph,
  expandedLayers: Set<number>,
  bridgeIds: Set<string> = new Set(),
  matchIds: Set<string> = new Set(),
  visibleMaxHop = 1,
  forceExpandCollapsed = false,
  filterActive = false,
  layout: MapLayout = mapLayoutForDepth(1),
  layoutMode: MapLayoutMode = 'ltr',
  radialViewport?: RadialViewportHint,
  expandedProjectClusters: Set<string> = new Set(),
): { nodes: Node<ServiceNodeData>[]; edges: Edge[]; hops: number[] } {
  const { center, nodes: impactNodes, edges: impactEdges } = graph
  const { nodeW, colGap, rowGap, tipChars } = layout
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
    if (layoutMode === 'radial' && hop === 1) {
      visibleByHop.set(hop, byHop.get(hop)!)
      continue
    }
    const { visible, hidden } = splitLayer(
      byHop.get(hop)!,
      forceExpandCollapsed || expandedLayers.has(hop),
      hop,
      layoutMode,
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
  const centerY = 22 + ((rowCount - 1) * rowGap) / 2
  const colPitch = nodeW + colGap
  const centerSize =
    layoutMode === 'radial' ? 'md' : mapNodeSizeFor('center', 0, visibleMaxHop)
  const centerW = layoutMode === 'radial' ? RADIAL_CENTER_HIT : 372

  /** Sol pad yok — harita origin mapLeftX() */
  const nodes: Node<ServiceNodeData>[] = [
    {
      id: center.id,
      type: 'serviceNode',
      data: {
        label: center.name,
        fullLabel: center.name,
        showTip: false,
        size: centerSize,
        kind: 'center',
        hop: 0,
      },
      position: { x: LEFT_X, y: centerY - 18 },
      style: { width: centerW },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  const visibleIds = new Set<string>([center.id])

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    let col = visibleByHop.get(hop) ?? []
    const clusterNodes: { key: string; label: string; nodes: ImpactNode[] }[] = []

    if (layoutMode === 'radial' && hop === 1) {
      const expandedKey = [...expandedProjectClusters][0]
      const grouped = chunkHop1Bubbles(col, expandedKey)
      col = grouped.visible
      clusterNodes.push(...grouped.clusters)
    }

    col.forEach((n, i) => {
      visibleIds.add(n.service.id)
      const nodeSize =
        layoutMode === 'radial'
          ? 'md'
          : mapNodeSizeFor('service', hop, visibleMaxHop)
      const w =
        layoutMode === 'radial' ? layout.nodeW : mapNodeWidth(nodeSize)
      nodes.push({
        id: n.service.id,
        type: 'serviceNode',
        data: {
          label: layoutMode === 'radial' ? n.service.name : compactMapLabel(n.service.name, 18),
          fullLabel: n.service.name,
          showTip:
            layoutMode === 'radial'
              ? false
              : mapLabelNeedsTip(n.service.name, tipChars),
          size: nodeSize,
          kind: 'service',
          hop,
          bridge: filterActive && bridgeIds.has(n.service.id),
          match: filterActive && matchIds.has(n.service.id),
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + i * rowGap,
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    })

    clusterNodes.forEach((cluster, i) => {
      const collapseId = `cluster-hop-${hop}-${cluster.key}`
      visibleIds.add(collapseId)
      const nodeSize = layoutMode === 'radial' ? 'md' : mapNodeSizeFor('collapsed', hop, visibleMaxHop)
      const w =
        layoutMode === 'radial'
          ? Math.round(layout.nodeW * 0.92)
          : mapNodeWidth(nodeSize)
      nodes.push({
        id: collapseId,
        type: 'serviceNode',
        data: {
          label: `+${cluster.nodes.length} servis`,
          fullLabel: `+${cluster.nodes.length} servis`,
          showTip: false,
          size: nodeSize,
          kind: 'cluster',
          hop,
          clusterKey: cluster.key,
          hiddenIds: cluster.nodes.map((n) => n.service.id),
          count: cluster.nodes.length,
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + (col.length + i) * rowGap,
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    })

    const hidden = collapsedMeta.get(hop)
    if (hidden?.length) {
      const collapseId = `collapsed-hop-${hop}`
      const collapseLabel = `Radial'da aç · +${hidden.length} servis`
      const nodeSize =
        layoutMode === 'radial'
          ? 'md'
          : mapNodeSizeFor('collapsed', hop, visibleMaxHop)
      const w =
        layoutMode === 'radial'
          ? Math.round(layout.nodeW * 0.88)
          : mapNodeWidth(nodeSize)
      nodes.push({
        id: collapseId,
        type: 'serviceNode',
        data: {
          label: collapseLabel,
          fullLabel: collapseLabel,
          showTip: false,
          size: nodeSize,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((h) => h.service.id),
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + col.length * rowGap,
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    }
  }

  /** BFS keşif ebeveyni → tree; diğerleri cascade */
  const treeParent = new Map<string, string>()
  for (const e of impactEdges) {
    if (e.toId === center.id) continue
    if (!treeParent.has(e.toId)) treeParent.set(e.toId, e.fromId)
  }

  const serviceToCluster = new Map<string, string>()
  for (const n of nodes) {
    const d = n.data as ServiceNodeData
    if (d.kind === 'cluster' && d.hiddenIds?.length) {
      for (const sid of d.hiddenIds) serviceToCluster.set(sid, n.id)
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
      const clusterId = serviceToCluster.get(target)
      if (clusterId) {
        target = clusterId
      } else {
        const collapseId = `collapsed-hop-${toHop}`
        if (!nodes.some((n) => n.id === collapseId)) continue
        target = collapseId
      }
    }
    if (!visibleIds.has(source) && source !== center.id) {
      const clusterId = serviceToCluster.get(source)
      if (clusterId) {
        source = clusterId
      } else {
        const collapseId = `collapsed-hop-${fromHop}`
        if (!nodes.some((n) => n.id === collapseId)) continue
        source = collapseId
      }
    }

    if (!nodes.some((n) => n.id === source) || !nodes.some((n) => n.id === target)) {
      continue
    }

    const key = `${source}->${target}`
    if (seen.has(key)) continue
    seen.add(key)

    const isCascade = treeParent.get(e.toId) !== e.fromId
    /** Halka görünümde yalnız ağaç (spoke) — cascade okları karışıklığın ana kaynağı */
    if (layoutMode === 'radial' && isCascade) continue

    const direct = toHop === 1 && !isCascade
    const sameColumn = fromHop === toHop
    /** Geriye cascade: sağ rota + çift ok */
    const sideRoute = isCascade && (sameColumn || fromHop > toHop)
    const stroke = isCascade
      ? 'var(--map-side)'
      : direct
        ? 'var(--map-path-mid)'
        : 'var(--map-idle)'
    const radialTree = layoutMode === 'radial' && !isCascade
    edges.push({
      id: key,
      source,
      target,
      sourceHandle: sideRoute ? 'side-out' : 'out',
      targetHandle: sideRoute ? 'side-in' : 'in',
      type: layoutMode === 'radial' ? 'radial' : 'fan',
      animated: false,
      className: isCascade
        ? 'dd-edge cascade'
        : radialTree
          ? 'dd-edge radial-link'
          : direct
            ? 'dd-edge direct'
            : 'dd-edge indirect',
      markerEnd: radialTree
        ? {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: '#6a645a',
          }
        : {
            type: MarkerType.ArrowClosed,
            width: isCascade ? 18 : 16,
            height: isCascade ? 18 : 16,
            color: isCascade ? '#a56b38' : direct ? '#2f6f55' : '#8a847a',
          },
      style: radialTree
        ? {
            stroke: '#6a645a',
            strokeWidth: 2,
            opacity: 0.55,
            fill: 'none',
          }
        : {
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

  let radialCenter: { cx: number; cy: number } | null = null
  const positioned =
    layoutMode === 'radial'
      ? (() => {
          const { nodes: placed, cx, cy } = applyRadialLayout(
            nodes,
            layout,
            {
              centerId: center.id,
              centerWidth: centerW,
              treeParent,
              viewport: radialViewport,
            },
          )
          radialCenter = { cx, cy }
          return placed
        })()
      : nodes

  let finalEdges =
    layoutMode === 'radial' ? edges : assignFanIndices(edges, hopOf)

  if (layoutMode === 'radial' && radialCenter) {
    const { cx, cy } = radialCenter
    const posOf = new Map(
      positioned
        .filter((n) => n.type === 'serviceNode' || n.id === center.id)
        .map((n) => [n.id, n]),
    )
    finalEdges = finalEdges.map((e) => {
      const s = posOf.get(e.source)
      const t = posOf.get(e.target)
      if (!s || !t) return e
      const sCenter = (s.data as ServiceNodeData).kind === 'center'
      const tCenter = (t.data as ServiceNodeData).kind === 'center'
      const sw = sCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const sh = sCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const tw = tCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const th = tCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const smid = radialAnchorOffset(sCenter)
      const tmid = radialAnchorOffset(tCenter)
      const visualR = sCenter ? 24 : RADIAL_DOT_R
      const visualRt = tCenter ? 24 : RADIAL_DOT_R
      const handles = radialHandlePair(
        { x: s.position.x, y: s.position.y, w: sw, h: sh },
        { x: t.position.x, y: t.position.y, w: tw, h: th },
      )
      const prev = (e.data ?? {}) as FanEdgeData
      return {
        ...e,
        ...handles,
        type: 'radial' as const,
        data: {
          ...prev,
          cx,
          cy,
          sx: s.position.x + smid.x,
          sy: s.position.y + smid.y,
          tx: t.position.x + tmid.x,
          ty: t.position.y + tmid.y,
          sr: visualR,
          tr: visualRt,
        },
      }
    })
  }

  return { nodes: positioned, edges: finalEdges, hops }
}

/** Hover ego: yalnız oğuna değen uçlar (path / hop-2 zinciri yok) */
export function neighborIds(focusId: string, rfEdges: Edge[]): Set<string> {
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

export function edgeTouchesFocus(e: Edge, focusId: string | null) {
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

export function reactFlowEdgeId(el: HTMLElement): string {
  const testId = el.getAttribute('data-testid')
  if (testId?.startsWith('rf__edge-')) return testId.slice('rf__edge-'.length)
  return el.getAttribute('data-id') ?? ''
}
