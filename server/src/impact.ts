/**
 * Servis etki grafı — harita / “etki yolu” için.
 * Kaynak: affectsEdges. Onay kapısı buradan değil; yalnız hop===1 listesinden.
 */
import { affectsEdges, services } from './data.js'

/** UI düğüm bütçesi: basit görünüm daha az, gelişmiş biraz daha fazla. */
export const IMPACT_VIEW = {
  maxHops: 3,
  maxNodesSimple: 28,
  maxNodesAdvanced: 48,
} as const

/**
 * Katman = en kısa yol (BFS).
 * - hop 1 = doğrudan (onay listesi ile aynı küme)
 * - hop 2+ = dolaylı zincir (sadece görsel keşif)
 * Aynı servise hem kısa hem uzun yol varsa kısa hop kazanır.
 * Bütçe aşılırsa truncated=true; kullanıcı pivot ile devam eder.
 */
export function buildImpactGraph(
  centerId: string,
  maxNodes: number,
  maxHops = IMPACT_VIEW.maxHops,
) {
  const center = services[centerId]
  if (!center) return undefined

  const nodes: { service: (typeof services)[string]; hop: number }[] = []
  const edges: { fromId: string; toId: string; hop: number }[] = []
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
