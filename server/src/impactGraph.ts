/**
 * Servis etki grafı — BFS (mock + inventory ortak).
 */
import type { Service } from './data.js'

export const IMPACT_VIEW = {
  maxHops: 3,
  maxNodesSimple: 28,
  maxNodesAdvanced: 48,
  partialHop1Cap: 16,
} as const

export type ImpactGraphDeps = {
  getService: (id: string) => Service | undefined
  getDownstream: (id: string) => string[]
}

export type ImpactGraphResult = {
  center: Service
  nodes: { service: Service; hop: number }[]
  edges: { fromId: string; toId: string; hop: number }[]
  hopsDrawn: number
  truncated: boolean
  reason?: string
  totalHop1?: number
  shownHop1?: number
}

function sortByServiceName(ids: string[], getService: ImpactGraphDeps['getService']): string[] {
  return [...ids].sort((a, b) => {
    const an = getService(a)?.name ?? a
    const bn = getService(b)?.name ?? b
    return an.localeCompare(bn, 'tr')
  })
}

export function buildImpactGraphFrom(
  centerId: string,
  maxNodes: number,
  deps: ImpactGraphDeps,
  maxHops: number = IMPACT_VIEW.maxHops,
  partialHop1Cap: number = IMPACT_VIEW.partialHop1Cap,
): ImpactGraphResult | undefined {
  const center = deps.getService(centerId)
  if (!center) return undefined

  const nodes: ImpactGraphResult['nodes'] = []
  const edges: ImpactGraphResult['edges'] = []
  const depth = new Map<string, number>([[centerId, 0]])
  let frontier = [centerId]
  let hopsDrawn = 0
  let truncated = false
  let reason: string | undefined
  let totalHop1: number | undefined
  let shownHop1: number | undefined

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextIds: string[] = []
    const seenThisHop = new Set<string>()

    for (const fromId of frontier) {
      for (const toId of deps.getDownstream(fromId)) {
        if (toId === centerId) continue
        edges.push({ fromId, toId, hop })
        if (depth.has(toId) || seenThisHop.has(toId)) continue
        seenThisHop.add(toId)
        nextIds.push(toId)
      }
    }

    if (nextIds.length === 0) break

    let admit = sortByServiceName(nextIds, deps.getService)

    if (hop === 1) {
      totalHop1 = admit.length
      if (admit.length > partialHop1Cap) {
        truncated = true
        shownHop1 = admit.length
        reason = `${totalHop1} servis doğrudan etkilenir. Haritada +N gruplara ayrıldı. Tam liste: Tablo sekmesi.`
      } else {
        shownHop1 = admit.length
      }
    } else if (nodes.length + admit.length > maxNodes) {
      truncated = true
      reason = `${hop}. katman eklenmedi — görünüm bütçesi (~${maxNodes} düğüm). Pivot ile devam edin.`
      break
    }

    for (const id of admit) {
      const service = deps.getService(id)
      if (!service) continue
      depth.set(id, hop)
      nodes.push({ service, hop })
    }

    if (hop === 1 && truncated) {
      frontier = admit
      hopsDrawn = hop
      break
    }

    frontier = admit
    hopsDrawn = hop
  }

  return { center, nodes, edges, hopsDrawn, truncated, reason, totalHop1, shownHop1 }
}
