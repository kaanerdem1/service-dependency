import type { ImpactEdge, ImpactGraph, ImpactNode, ModuleNode } from '../types'

/** BFS keşif ebeveyni — filtrede ara yol (bridge) için */
export function discoveryParents(
  centerId: string,
  edges: ImpactEdge[],
): Map<string, string> {
  const parent = new Map<string, string>()
  for (const e of edges) {
    if (e.toId === centerId) continue
    if (!parent.has(e.toId)) parent.set(e.toId, e.fromId)
  }
  return parent
}

export type ProjectOption = { id: string; label: string }

/** Modül ağacından proje etiketleri */
export function projectLabelsFromTree(tree: ModuleNode[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const n of tree) {
    if (n.kind === 'project') {
      const nice =
        n.name.length > 0
          ? n.name.charAt(0).toUpperCase() + n.name.slice(1)
          : n.id
      m.set(n.id, `${nice} Project`)
    }
  }
  return m
}

/** Etki grafında geçen projeler (merkez hariç etkilenenler) */
export function projectsInImpact(
  graph: ImpactGraph,
  labels: Map<string, string>,
): ProjectOption[] {
  const seen = new Map<string, string>()
  for (const n of graph.nodes) {
    const id = n.service.projectId
    if (!id || seen.has(id)) continue
    seen.set(id, labels.get(id) ?? id)
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
}

export type ImpactProjectFilter = {
  /** Filtreye uyan servisler */
  matchIds: Set<string>
  /** Eşleşmeye giden ara yol (filtre dışı ama görünür) */
  bridgeIds: Set<string>
  /** Merkez + match + bridge */
  keepIds: Set<string>
  hop1Matches: number
  matchCount: number
  deepestHop: number
  /** 1. katmanda yok, daha derinde var */
  hop1EmptyButDeeper: boolean
}

export function applyProjectFilter(
  graph: ImpactGraph,
  projectId: string | null,
): ImpactProjectFilter {
  const hopOf = new Map<string, number>([[graph.center.id, 0]])
  for (const n of graph.nodes) hopOf.set(n.service.id, n.hop)

  const allIds = new Set<string>([graph.center.id])
  for (const n of graph.nodes) allIds.add(n.service.id)

  if (!projectId) {
    let deepestHop = 0
    let hop1Matches = 0
    for (const n of graph.nodes) {
      deepestHop = Math.max(deepestHop, n.hop)
      if (n.hop === 1) hop1Matches++
    }
    return {
      matchIds: new Set(allIds),
      bridgeIds: new Set(),
      keepIds: allIds,
      hop1Matches,
      matchCount: graph.nodes.length,
      deepestHop,
      hop1EmptyButDeeper: false,
    }
  }

  const parents = discoveryParents(graph.center.id, graph.edges)
  const matchIds = new Set<string>()
  for (const n of graph.nodes) {
    if (n.service.projectId === projectId) matchIds.add(n.service.id)
  }

  const bridgeIds = new Set<string>()
  let deepestHop = 0
  let hop1Matches = 0
  for (const id of matchIds) {
    const hop = hopOf.get(id) ?? 0
    deepestHop = Math.max(deepestHop, hop)
    if (hop === 1) hop1Matches++
    let cur = parents.get(id)
    while (cur && cur !== graph.center.id) {
      if (!matchIds.has(cur)) bridgeIds.add(cur)
      cur = parents.get(cur)
    }
  }

  const keepIds = new Set<string>([graph.center.id, ...matchIds, ...bridgeIds])
  return {
    matchIds,
    bridgeIds,
    keepIds,
    hop1Matches,
    matchCount: matchIds.size,
    deepestHop,
    hop1EmptyButDeeper: hop1Matches === 0 && matchIds.size > 0,
  }
}

export function filterNodes(
  nodes: ImpactNode[],
  keepIds: Set<string>,
): ImpactNode[] {
  return nodes.filter((n) => keepIds.has(n.service.id))
}

export function filterEdges(
  edges: ImpactEdge[],
  keepIds: Set<string>,
): ImpactEdge[] {
  return edges.filter((e) => keepIds.has(e.fromId) && keepIds.has(e.toId))
}
