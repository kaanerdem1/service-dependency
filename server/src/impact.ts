/**
 * Servis etki grafı — mock katalog.
 */
import { affectsEdges, services } from './data.js'
import { buildImpactGraphFrom, IMPACT_VIEW } from './impactGraph.js'

export { IMPACT_VIEW }

export function buildImpactGraph(
  centerId: string,
  maxNodes: number,
  maxHops: number = IMPACT_VIEW.maxHops,
) {
  return buildImpactGraphFrom(
    centerId,
    maxNodes,
    {
      getService: (id) => services[id],
      getDownstream: (id) => affectsEdges[id] ?? [],
    },
    maxHops,
  )
}
