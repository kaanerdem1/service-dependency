import type {
  AffectedService,
  ImpactEdge,
  ImpactGraph,
  ImpactNode,
  ModuleNode,
  Service,
} from '../types'
import { affectsEdges, moduleTree, services } from './data'
import {
  buildMethodImpactGraph,
  getCalleeRefs,
  getCallerRefs,
  listMethodRefsForService,
  listMethodsLinkedToPivot,
  methodImpact,
  searchMethods as searchMethodsLocal,
} from './methods'

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms))

/** Görünüm bütçesi: taşmazsa hop uzar (max 3). Onay kapsamı değil. */
export const IMPACT_VIEW = {
  maxHops: 3,
  maxNodesSimple: 28,
  maxNodesAdvanced: 48,
} as const

export async function getModuleTree(): Promise<ModuleNode[]> {
  await delay()
  return moduleTree
}

export async function getService(id: string): Promise<Service | undefined> {
  await delay(80)
  return services[id]
}

/** Onay listesi — yalnız 1 hop (doğrudan etkilenenler / downstream) */
export async function getAffected(serviceId: string): Promise<AffectedService[]> {
  await delay()
  const ids = affectsEdges[serviceId] ?? []
  return ids
    .map((id) => services[id])
    .filter(Boolean)
    .map((service) => ({ service, hop: 1 }))
}

export async function getNeighbors(serviceId: string) {
  await delay()
  const downstream = await getAffected(serviceId)
  const upstreamIds = Object.entries(affectsEdges)
    .filter(([, tos]) => tos.includes(serviceId))
    .map(([fromId]) => fromId)
  const upstream = upstreamIds
    .map((id) => services[id])
    .filter(Boolean)
    .map((service) => ({ service, hop: 1 as const }))
  return { upstream, downstream }
}

/**
 * Harita katmanı = en kısa yol (BFS) — Etkilenenler / onay ile uyumlu.
 * 1 = doğrudan, 2+ = dolaylı.
 */
export function buildImpactGraph(
  centerId: string,
  maxNodes: number,
  maxHops = IMPACT_VIEW.maxHops,
): ImpactGraph | undefined {
  const center = services[centerId]
  if (!center) return undefined

  const nodes: ImpactNode[] = []
  const edges: ImpactEdge[] = []
  const depth = new Map<string, number>([[centerId, 0]])
  let frontier = [centerId]
  let hopsDrawn = 0
  let truncated = false
  let reason: string | undefined

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextIds: string[] = []
    const seenThisHop = new Set<string>()

    for (const fromId of frontier) {
      for (const toId of affectsEdges[fromId] ?? []) {
        if (toId === centerId) continue
        edges.push({ fromId, toId, hop })
        if (depth.has(toId) || seenThisHop.has(toId)) continue
        seenThisHop.add(toId)
        nextIds.push(toId)
      }
    }

    if (nextIds.length === 0) break

    if (nodes.length + nextIds.length > maxNodes) {
      truncated = true
      reason = `${hop}. katman eklenmedi — görünüm bütçesi (~${maxNodes} düğüm). Pivot ile devam edin.`
      break
    }

    for (const id of nextIds) {
      const service = services[id]
      if (!service) continue
      depth.set(id, hop)
      nodes.push({ service, hop })
    }

    frontier = nextIds
    hopsDrawn = hop
  }

  return { center, nodes, edges, hopsDrawn, truncated, reason }
}

export async function getImpactGraph(
  serviceId: string,
): Promise<ImpactGraph | undefined> {
  await delay()
  return buildImpactGraph(serviceId, IMPACT_VIEW.maxNodesAdvanced)
}

export async function searchServices(query: string): Promise<Service[]> {
  await delay(100)
  const q = query.trim().toLowerCase()
  if (!q) return Object.values(services)
  return Object.values(services).filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.owner?.name.toLowerCase().includes(q) ||
      s.owner?.team?.toLowerCase().includes(q),
  )
}

export async function listMethodsForService(
  serviceId: string,
  linkedTo?: string,
) {
  await delay(80)
  if (linkedTo) return listMethodsLinkedToPivot(serviceId, linkedTo)
  return listMethodRefsForService(serviceId)
}

export async function getMethodCallers(methodId: string) {
  await delay(80)
  return getCallerRefs(methodId)
}

export async function getMethodCallees(methodId: string) {
  await delay(80)
  return getCalleeRefs(methodId)
}

export async function getMethodImpact(methodId: string) {
  await delay(80)
  return methodImpact(methodId)
}

export async function getMethodImpactGraph(methodId: string) {
  await delay(100)
  return buildMethodImpactGraph(methodId)
}

export async function searchMethods(query: string) {
  await delay(80)
  return searchMethodsLocal(query)
}
