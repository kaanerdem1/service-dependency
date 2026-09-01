/**
 * Harita kapsam filtresi yardımcıları.
 * Proje/jar seçilince eşleşen düğümler + merkeze giden köprü yolu kalır.
 */
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

/**
 * Merkez → hedef ana etki yolu (via zinciri).
 * Cascade yan bağları dahil edilmez.
 */
export function discoveryPathTo(
  centerId: string,
  targetId: string,
  parents: Map<string, string>,
): string[] {
  if (!targetId || targetId === centerId) return [centerId]
  const chain: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = targetId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    chain.push(cur)
    if (cur === centerId) break
    cur = parents.get(cur)
  }
  if (chain[chain.length - 1] !== centerId) chain.push(centerId)
  return chain.reverse()
}

export type ProjectOption = { id: string; label: string }
export type PackageOption = {
  id: string
  label: string
  projectId: string
  projectLabel: string
}

export type ImpactScopeFilterInput = {
  projectIds?: Iterable<string>
  packageIds?: Iterable<string>
}

/** Modül ağacından proje etiketleri */
export function projectLabelsFromTree(tree: ModuleNode[]): Map<string, string> {
  const m = new Map<string, string>()
  const walk = (node: ModuleNode) => {
    if (node.kind === 'project' || node.kind === 'group') {
      if (node.name && node.name === node.name.toUpperCase()) {
        m.set(node.id, node.name)
      } else if (node.kind === 'project') {
        const nice =
          node.name.length > 0
            ? node.name.charAt(0).toUpperCase() + node.name.slice(1)
            : node.id
        m.set(node.id, nice)
      } else {
        m.set(node.id, node.name)
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const n of tree) walk(n)
  return m
}

/** Modül ağacından jar/paket etiketleri */
export function packageLabelsFromTree(tree: ModuleNode[]): Map<string, string> {
  const m = new Map<string, string>()
  const walk = (node: ModuleNode) => {
    if (node.kind === 'package') m.set(node.id, node.name)
    for (const child of node.children ?? []) walk(child)
  }
  for (const n of tree) walk(n)
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
    if (!id || id === 'unknown') continue
    if (seen.has(id)) continue
    seen.set(
      id,
      n.service.projectLabel ||
        n.service.projectGroupLabel ||
        labels.get(id) ||
        id,
    )
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
}

/** Etki grafında geçen jar/paketler */
export function packagesInImpact(
  graph: ImpactGraph,
  labels: Map<string, string>,
  packageLabels: Map<string, string> = new Map(),
): PackageOption[] {
  const seen = new Map<string, PackageOption>()
  for (const n of graph.nodes) {
    const id = n.service.packageId
    if (!id || id === 'unknown' || seen.has(id)) continue
    seen.set(id, {
      id,
      label: n.service.packageLabel ?? packageLabels.get(id) ?? id,
      projectId: n.service.projectId,
      projectLabel:
        n.service.projectLabel ||
        n.service.projectGroupLabel ||
        labels.get(n.service.projectId) ||
        n.service.projectId,
    })
  }
  return [...seen.values()].sort((a, b) => {
    const byProject = a.projectLabel.localeCompare(b.projectLabel, 'tr')
    return byProject || a.label.localeCompare(b.label, 'tr')
  })
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
  return applyScopeFilter(graph, projectId ? { projectIds: [projectId] } : null)
}

export function applyScopeFilter(
  graph: ImpactGraph,
  scope: ImpactScopeFilterInput | null,
): ImpactProjectFilter {
  const hopOf = new Map<string, number>([[graph.center.id, 0]])
  for (const n of graph.nodes) hopOf.set(n.service.id, n.hop)

  const allIds = new Set<string>([graph.center.id])
  for (const n of graph.nodes) allIds.add(n.service.id)

  const projectIds = new Set(scope?.projectIds ?? [])
  const packageIds = new Set(scope?.packageIds ?? [])
  const active = projectIds.size > 0 || packageIds.size > 0

  if (!active) {
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
    if (
      projectIds.has(n.service.projectId) ||
      packageIds.has(n.service.packageId)
    ) {
      matchIds.add(n.service.id)
    }
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

export type BlastRadiusStats = {
  serviceCount: number
  hop1Count: number
  maxHop: number
  teamCount: number
  projectCount: number
  teamNames: string[]
  projectLabels: string[]
  /** En uzun via zinciri (hop sayısı = kenar) */
  longestViaHops: number
  /** Merkez dahil id zinciri */
  longestViaPath: string[]
}

/** Blast radius: etkilenen düğümler üzerinden özet (merkez hariç). */
export function summarizeBlastRadius(
  centerId: string,
  nodes: ImpactNode[],
  parents: Map<string, string>,
  projectLabelOf: (projectId: string) => string,
  /** Verilirse yalnız bu id’ler sayılır (filtre eşleşenleri) */
  onlyIds?: Set<string> | null,
): BlastRadiusStats {
  const scoped = onlyIds
    ? nodes.filter((n) => onlyIds.has(n.service.id))
    : nodes

  const teams = new Set<string>()
  const projects = new Set<string>()
  let hop1Count = 0
  let maxHop = 0

  for (const n of scoped) {
    maxHop = Math.max(maxHop, n.hop)
    if (n.hop === 1) hop1Count++
    const team = n.service.owner?.team?.trim()
    if (team) teams.add(team)
    if (n.service.projectId) projects.add(n.service.projectId)
  }

  let longestViaPath: string[] = [centerId]
  for (const n of scoped) {
    const path = discoveryPathTo(centerId, n.service.id, parents)
    if (path.length > longestViaPath.length) longestViaPath = path
  }

  return {
    serviceCount: scoped.length,
    hop1Count,
    maxHop,
    teamCount: teams.size,
    projectCount: projects.size,
    teamNames: [...teams].sort((a, b) => a.localeCompare(b, 'tr')),
    projectLabels: [...projects]
      .map((id) => projectLabelOf(id))
      .sort((a, b) => a.localeCompare(b, 'tr')),
    longestViaHops: Math.max(0, longestViaPath.length - 1),
    longestViaPath,
  }
}
