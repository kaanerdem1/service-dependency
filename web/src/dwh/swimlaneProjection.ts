import type {
  DwhLineageEdgeKind,
  DwhLineageGraph,
  DwhLineageNode,
} from './types'

export type DwhSwimlaneKey = 'LD' | 'TR' | 'EX' | 'KAYNAK' | 'DIGER'

export type DwhSwimlaneProjectionNode = {
  id: string
  node: DwhLineageNode
  layer: DwhSwimlaneKey
  memberIds: string[]
  occurrenceCount: number
  referenceCount: number
  cycleCount: number
  minDepth: number
}

export type DwhSwimlaneProjectionEdge = {
  id: string
  source: string
  target: string
  kind: DwhLineageEdgeKind
  statementIds: number[]
  originalEdgeIds: string[]
  relationCount: number
  minDepth: number
}

export type DwhSwimlaneProjection = {
  nodes: DwhSwimlaneProjectionNode[]
  edges: DwhSwimlaneProjectionEdge[]
  originalNodeCount: number
  hiddenSubqueryCount: number
}

export function normalizeDwhLayer(node?: Pick<DwhLineageNode, 'layer' | 'subtitle'>): DwhSwimlaneKey {
  if (!node) return 'DIGER'
  const raw = (node.layer || node.subtitle || '').trim().toLocaleUpperCase('tr-TR')
  if (raw === 'LD') return 'LD'
  if (raw === 'TR') return 'TR'
  if (raw === 'EX') return 'EX'
  if (raw === 'KAYNAK' || raw === 'SOURCE') return 'KAYNAK'
  return 'DIGER'
}

/**
 * Projects the graph into simple, legacy-compatible swimlanes. Every reachable
 * real node keeps its own graph identity and is assigned to exactly one lane
 * from its layer. Subqueries are transparent; hidden real tables stop traversal.
 */
export function buildDwhSwimlaneProjection(
  graph: DwhLineageGraph,
  visibleLayers: readonly DwhSwimlaneKey[],
): DwhSwimlaneProjection {
  const root = graph.nodes.find((node) => node.id === graph.rootId) ?? graph.nodes[0]
  if (!root) {
    return { nodes: [], edges: [], originalNodeCount: 0, hiddenSubqueryCount: 0 }
  }

  const visibleLayerSet = new Set(visibleLayers)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, DwhLineageGraph['edges']>()
  for (const edge of graph.edges) {
    const children = childrenByParent.get(edge.target) ?? []
    children.push(edge)
    childrenByParent.set(edge.target, children)
  }
  const projectedNodes: DwhSwimlaneProjectionNode[] = []
  const projectedNodeIds = new Set<string>()
  const projectedEdges: DwhSwimlaneProjectionEdge[] = []
  const encounteredSubqueryIds = new Set<string>()
  let edgeIndex = 0

  const addNode = (node: DwhLineageNode) => {
    if (projectedNodeIds.has(node.id)) return
    projectedNodeIds.add(node.id)
    projectedNodes.push({
      id: node.id,
      node,
      layer: normalizeDwhLayer(node),
      memberIds: [node.id],
      occurrenceCount: 1,
      referenceCount: node.kind === 'reference' ? 1 : 0,
      cycleCount: node.kind === 'cycle' ? 1 : 0,
      minDepth: node.depth,
    })
  }

  const visitedRealIds = new Set<string>()
  const walk = (graphParentId: string, visualParentId: string, path: Set<string>) => {
    for (const edge of childrenByParent.get(graphParentId) ?? []) {
      const child = nodeById.get(edge.source)
      if (!child) continue

      if (child.entityKind === 'subquery') {
        if (path.has(child.id)) continue
        encounteredSubqueryIds.add(child.id)
        // Subqueries are transparent in swimlane mode. Keep their graph id only
        // for traversal, while the visible edge remains attached to the last
        // rendered real node.
        walk(child.id, visualParentId, new Set([...path, child.id]))
        continue
      }

      if (!visibleLayerSet.has(normalizeDwhLayer(child)) || child.id === graph.rootId) continue
      addNode(child)
      projectedEdges.push({
        id: `swimlane:${visualParentId}->${child.id}:${edgeIndex++}`,
        source: visualParentId,
        target: child.id,
        kind: edge.kind,
        statementIds: edge.statementIds ?? [],
        originalEdgeIds: [edge.id],
        relationCount: 1,
        minDepth: child.depth,
      })
      if (visitedRealIds.has(child.id)) continue
      visitedRealIds.add(child.id)
      walk(child.id, child.id, new Set([...path, child.id]))
    }
  }

  addNode(root)
  visitedRealIds.add(root.id)
  walk(root.id, root.id, new Set([root.id]))

  return {
    nodes: projectedNodes,
    edges: projectedEdges,
    originalNodeCount: projectedNodes.length,
    hiddenSubqueryCount: encounteredSubqueryIds.size,
  }
}
