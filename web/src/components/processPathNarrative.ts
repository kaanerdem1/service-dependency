import type { ProcessFlowGraph, ProcessFlowNodeKind } from '../types'
import type { ProcessPathSnapshotStep } from '../snapshot/processPathSnapshot'

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
