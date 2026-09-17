/**
 * Rota / tam-akış yolu → snapshot PDF anlatım adımları.
 *
 * Ne yapar: Graf + sıralı düğüm id’lerinden `ProcessPathSnapshotStep[]` üretir
 *   (tam akış path focus veya kayıtlı rota ziyaretleri).
 * Ne yapmaz: PDF çizmez; onu `snapshot/processPathSnapshot.ts` yapar.
 * Tam akış vs rota: docs/process-flow.md
 */
import type { ProcessFlowGraph, ProcessFlowNodeKind } from '../types'
import type { ProcessPathSnapshotStep } from '../snapshot/processPathSnapshot'
import type { RouteVisit } from './processUserRoute'

/** pathToFocus.orderedIds + graph → PDF anlatım adımları (katman = displayStep). */
export function buildPathSnapshotSteps(
  graph: ProcessFlowGraph,
  orderedIds: string[],
  onPathNodeIds: Set<string>,
  rankOf: (nodeId: string) => number,
): ProcessPathSnapshotStep[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const onPath = new Set(orderedIds)
  for (const nid of onPathNodeIds) onPath.add(nid)

  return orderedIds.map((id) => {
    const n = byId.get(id)
    const displayStep = rankOf(id) + 1
    const outgoing = graph.edges
      .filter((e) => e.from === id && onPath.has(e.to))
      .map((e) => ({
        toId: e.to,
        toName: byId.get(e.to)?.name ?? e.to,
        label: e.label?.trim() || undefined,
        targetStep: rankOf(e.to) + 1,
      }))
      .sort((a, b) => {
        const la = a.label ?? ''
        const lb = b.label ?? ''
        if (la !== lb) return la.localeCompare(lb, 'tr')
        return a.toName.localeCompare(b.toName, 'tr')
      })
    return {
      id,
      name: n?.name ?? id,
      kind: (n?.kind ?? 'other') as ProcessFlowNodeKind,
      displayStep,
      outgoing,
      label: outgoing[0]?.label,
    }
  })
}

/** Kullanıcının seçtiği tek rotayı occurrence sırasıyla PDF anlatımına çevirir. */
export function buildUserRouteSnapshotSteps(
  graph: ProcessFlowGraph,
  visits: RouteVisit[],
): ProcessPathSnapshotStep[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  return visits.map((visit, index) => {
    const node = byId.get(visit.nodeId)
    const next = visits[index + 1]
    const edge = next?.incomingEdgeId
      ? graph.edges.find((candidate) => candidate.id === next.incomingEdgeId)
      : undefined
    return {
      id: visit.visitId,
      name: `${node?.name ?? visit.nodeId}${visit.ordinal > 1 ? ` (${visit.ordinal}. ziyaret)` : ''}`,
      kind: (node?.kind ?? 'other') as ProcessFlowNodeKind,
      displayStep: index + 1,
      outgoing: next
        ? [
            {
              toId: next.visitId,
              toName: byId.get(next.nodeId)?.name ?? next.nodeId,
              label: edge?.label?.trim() || next.incomingLabel,
              targetStep: index + 2,
            },
          ]
        : [],
      label: edge?.label?.trim() || next?.incomingLabel,
    }
  })
}
