import { Position, type Edge, type Node } from 'reactflow'
import {
  applyRadialLayout,
  compactMapLabel,
  mapLabelNeedsTip,
  type MapLayout,
  type MapLayoutMode,
} from '../../../impact/mapLayout'
import type { MethodImpactGraph, MethodRef } from '../../../types'
import {
  EDGE_COLOR,
  EDGE_MARKER,
  LEFT_X,
  MAX_VISIBLE_PER_LAYER,
  MIN_COLLAPSE_COUNT,
  RADIAL_HOP1_CAP,
} from './constants'
import type { LayerItem, MapNodeData, ViewMode } from './types'

/** Metod blast → servis blast (çağıran servisler; min hop) */
export function layersAsServices(graph: MethodImpactGraph): {
  items: LayerItem[]
  edges: { fromId: string; toId: string; hop: number }[]
} {
  const centerSvc = graph.center.serviceId
  const hopBySvc = new Map<string, number>()
  const nameBySvc = new Map<string, string>()
  const countBySvc = new Map<string, number>()

  nameBySvc.set(centerSvc, graph.center.serviceName)
  for (const n of graph.nodes) {
    const sid = n.method.serviceId
    if (sid === centerSvc) continue
    nameBySvc.set(sid, n.method.serviceName)
    countBySvc.set(sid, (countBySvc.get(sid) ?? 0) + 1)
    const prev = hopBySvc.get(sid)
    if (prev === undefined || n.hop < prev) hopBySvc.set(sid, n.hop)
  }

  const items: LayerItem[] = [...hopBySvc.entries()].map(([sid, hop]) => ({
    id: sid,
    hop,
    label: nameBySvc.get(sid) ?? sid,
    sub: `${countBySvc.get(sid) ?? 1} çağıran method`,
    kind: 'service' as const,
    serviceId: sid,
    methodCount: countBySvc.get(sid) ?? 1,
  }))

  const edgeSet = new Set<string>()
  const edges: { fromId: string; toId: string; hop: number }[] = []
  for (const e of graph.edges) {
    const fromM =
      e.fromId === graph.center.id
        ? graph.center
        : graph.nodes.find((n) => n.method.id === e.fromId)?.method
    const toM = graph.nodes.find((n) => n.method.id === e.toId)?.method
    if (!fromM || !toM) continue
    if (fromM.serviceId === toM.serviceId) continue
    const key = `${fromM.serviceId}->${toM.serviceId}`
    if (edgeSet.has(key)) continue
    edgeSet.add(key)
    const hop = hopBySvc.get(toM.serviceId) ?? e.hop
    edges.push({ fromId: fromM.serviceId, toId: toM.serviceId, hop })
  }

  return { items, edges }
}

export function layersAsMethods(graph: MethodImpactGraph): {
  items: LayerItem[]
  edges: { fromId: string; toId: string; hop: number }[]
} {
  const items: LayerItem[] = graph.nodes.map((n) => ({
    id: n.method.id,
    hop: n.hop,
    label: `${n.method.className}.${n.method.name}`,
    sub: n.method.serviceName,
    kind: 'method' as const,
    serviceId: n.method.serviceId,
    methodId: n.method.id,
  }))
  return {
    items,
    edges: graph.edges.map((e) => ({
      fromId: e.fromId,
      toId: e.toId,
      hop: e.hop,
    })),
  }
}

export function buildLayeredMap(
  center: MethodRef,
  mode: ViewMode,
  items: LayerItem[],
  rawEdges: { fromId: string; toId: string; hop: number }[],
  expandedLayers: Set<number>,
  visibleMaxHop: number,
  layout: MapLayout,
  layoutMode: MapLayoutMode = 'ltr',
): { nodes: Node<MapNodeData>[]; edges: Edge[] } {
  const { nodeW, colGap, rowGap, size, tipChars } = layout
  const colPitch = nodeW + colGap
  const byHop = new Map<number, LayerItem[]>()
  for (const it of items) {
    const list = byHop.get(it.hop) ?? []
    list.push(it)
    byHop.set(it.hop, list)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)

  const centerFull =
    mode === 'services'
      ? center.serviceName
      : `${center.className}.${center.name}`
  const centerSub =
    mode === 'services'
      ? `${center.className}.${center.name}`
      : center.serviceName

  const nodes: Node<MapNodeData>[] = [
    {
      id: mode === 'services' ? center.serviceId : center.id,
      type: 'methodNode',
      data: {
        label: centerFull,
        fullLabel: centerFull,
        showTip: mapLabelNeedsTip(centerFull, tipChars),
        size,
        sub: compactMapLabel(centerSub, Math.min(36, tipChars)),
        kind: 'center',
        hop: 0,
        serviceId: center.serviceId,
        methodId: center.id,
      },
      position: { x: LEFT_X, y: 80 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  const visibleIds = new Set<string>([nodes[0]!.id])
  const centerId = nodes[0]!.id

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    const all = byHop.get(hop) ?? []
    const expanded = expandedLayers.has(hop)
    let visible = all
    let hidden: LayerItem[] = []
    const cap =
      layoutMode === 'radial' ? RADIAL_HOP1_CAP : MAX_VISIBLE_PER_LAYER
    const minRest = layoutMode === 'radial' ? 1 : MIN_COLLAPSE_COUNT
    if (!expanded && all.length > cap) {
      const rest = all.length - cap
      if (rest >= minRest) {
        visible = all.slice(0, cap)
        hidden = all.slice(cap)
      }
    }

    visible.forEach((it, i) => {
      visibleIds.add(it.id)
      nodes.push({
        id: it.id,
        type: 'methodNode',
        data: {
          label: it.label,
          fullLabel: it.label,
          showTip: mapLabelNeedsTip(
            it.label,
            layoutMode === 'radial' ? 14 : tipChars,
          ),
          size,
          sub: compactMapLabel(it.sub, Math.min(32, tipChars - 4)),
          kind: it.kind,
          hop,
          serviceId: it.serviceId,
          methodId: it.methodId,
          count: it.methodCount,
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + i * rowGap,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    })

    if (hidden.length) {
      const collapseId = `collapsed-mhop-${hop}`
      nodes.push({
        id: collapseId,
        type: 'methodNode',
        data: {
          label: `+${hidden.length} servis daha`,
          fullLabel: `+${hidden.length} servis daha`,
          showTip: false,
          size,
          sub: `${hop}. katman`,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((h) => h.id),
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + visible.length * rowGap,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    }
  }

  const hop1Count =
    nodes.filter((n) => n.data.hop === 1 && n.data.kind !== 'collapsed')
      .length || 1
  const centerNode = nodes.find((n) => n.id === centerId)
  if (centerNode) {
    centerNode.position.y = 40 + ((hop1Count - 1) * rowGap) / 2
  }

  const edges: Edge[] = []
  for (const e of rawEdges) {
    if (e.hop > visibleMaxHop) continue
    const sourceVisible = visibleIds.has(e.fromId)
    const targetVisible = visibleIds.has(e.toId)
    const collapseId = `collapsed-mhop-${e.hop}`
    const hasCollapse = nodes.some((n) => n.id === collapseId)

    const mk = (id: string, source: string, target: string): Edge => ({
      id,
      source,
      target,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      markerEnd: EDGE_MARKER,
      className: 'dd-edge method-via',
      style: { stroke: EDGE_COLOR, strokeWidth: 2.5 },
      data: { fromId: e.fromId, toId: e.toId },
    })

    if (sourceVisible && targetVisible) {
      edges.push(mk(`${e.fromId}->${e.toId}`, e.fromId, e.toId))
    } else if (sourceVisible && !targetVisible && hasCollapse) {
      const id = `${e.fromId}->${collapseId}`
      if (!edges.some((x) => x.id === id)) {
        edges.push(mk(id, e.fromId, collapseId))
      }
    }
  }

  return {
    nodes:
      layoutMode === 'radial'
        ? applyRadialLayout(nodes, layout, {
            centerId,
            originX: LEFT_X,
            treeParent: (() => {
              const m = new Map<string, string>()
              for (const e of rawEdges) {
                if (e.toId === centerId) continue
                if (!m.has(e.toId)) m.set(e.toId, e.fromId)
              }
              return m
            })(),
          }).nodes
        : nodes,
    edges,
  }
}
