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

export function normalizeDwhLayer(node?: DwhLineageNode): DwhSwimlaneKey {
  if (!node) return 'DIGER'
  const raw = (node.layer || node.subtitle || '').trim().toLocaleUpperCase('tr-TR')
  if (raw === 'LD') return 'LD'
  if (raw === 'TR') return 'TR'
  if (raw === 'EX') return 'EX'
  if (raw === 'KAYNAK' || raw === 'SOURCE') return 'KAYNAK'
  return 'DIGER'
}

function representativeRank(node: DwhLineageNode) {
  if (node.kind === node.entityKind) return 0
  if (node.kind === 'reference') return 1
  return 2
}

function preferRepresentative(current: DwhLineageNode, candidate: DwhLineageNode) {
  const rankDiff = representativeRank(candidate) - representativeRank(current)
  if (rankDiff !== 0) return rankDiff < 0 ? candidate : current
  if (candidate.depth !== current.depth) return candidate.depth < current.depth ? candidate : current
  return candidate.id.localeCompare(current.id, 'tr') < 0 ? candidate : current
}

function edgeKind(kinds: Set<DwhLineageEdgeKind>): DwhLineageEdgeKind {
  if (kinds.has('reportSql')) return 'reportSql'
  if (kinds.has('statement')) return 'statement'
  return 'subquery'
}

/**
 * Projects the occurrence graph into a table-identity summary. Subqueries are
 * transparent, while hidden real tables stop traversal so no false direct edge
 * is introduced by a layer filter.
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
  const reachableOriginalIds = new Set<string>([graph.rootId])
  const encounteredSubqueryIds = new Set<string>()
  const originalQueue = [graph.rootId]
  while (originalQueue.length) {
    const parentId = originalQueue.shift()
    if (!parentId) break
    for (const edge of childrenByParent.get(parentId) ?? []) {
      const child = nodeById.get(edge.source)
      if (!child) continue
      if (child.entityKind === 'subquery') {
        if (encounteredSubqueryIds.has(child.id)) continue
        encounteredSubqueryIds.add(child.id)
        originalQueue.push(child.id)
        continue
      }
      if (!visibleLayerSet.has(normalizeDwhLayer(child)) || reachableOriginalIds.has(child.id)) {
        continue
      }
      reachableOriginalIds.add(child.id)
      originalQueue.push(child.id)
    }
  }
  const membersByEntity = new Map<string, DwhLineageNode[]>()

  for (const node of graph.nodes) {
    if (node.entityKind === 'subquery') continue
    if (!reachableOriginalIds.has(node.id)) continue
    const members = membersByEntity.get(node.entityKey) ?? []
    members.push(node)
    membersByEntity.set(node.entityKey, members)
  }

  const projectedNodes: DwhSwimlaneProjectionNode[] = []
  const groupByMemberId = new Map<string, DwhSwimlaneProjectionNode>()

  for (const members of membersByEntity.values()) {
    let representative = members[0]
    for (let index = 1; index < members.length; index += 1) {
      representative = preferRepresentative(representative, members[index])
    }
    const isRootEntity = members.some((node) => node.id === graph.rootId)
    if (isRootEntity) representative = root
    const projected: DwhSwimlaneProjectionNode = {
      id: isRootEntity ? graph.rootId : representative.id,
      node: representative,
      layer: normalizeDwhLayer(representative),
      memberIds: members.map((node) => node.id),
      occurrenceCount: members.length,
      referenceCount: members.filter((node) => node.kind === 'reference').length,
      cycleCount: members.filter((node) => node.kind === 'cycle').length,
      minDepth: Math.min(...members.map((node) => node.depth)),
    }
    projectedNodes.push(projected)
    for (const member of members) groupByMemberId.set(member.id, projected)
  }

  type EdgeAccumulator = {
    source: string
    target: string
    kinds: Set<DwhLineageEdgeKind>
    statementIds: Set<number>
    originalEdgeIds: Set<string>
    relationCount: number
    minDepth: number
  }

  const accumulated = new Map<string, EdgeAccumulator>()

  for (const parentGroup of projectedNodes) {
    for (const parentMemberId of parentGroup.memberIds) {
      const queue = (childrenByParent.get(parentMemberId) ?? []).map((edge) => ({
        edge,
        pathKinds: new Set<DwhLineageEdgeKind>([edge.kind]),
        pathStatements: new Set(edge.statementIds ?? []),
        pathEdges: new Set([edge.id]),
      }))
      const visitedSubqueries = new Set<string>()

      while (queue.length) {
        const current = queue.shift()
        if (!current) break
        const childNode = nodeById.get(current.edge.source)
        if (!childNode) continue

        if (childNode.entityKind === 'subquery') {
          if (visitedSubqueries.has(childNode.id)) continue
          visitedSubqueries.add(childNode.id)
          for (const nextEdge of childrenByParent.get(childNode.id) ?? []) {
            queue.push({
              edge: nextEdge,
              pathKinds: new Set([...current.pathKinds, nextEdge.kind]),
              pathStatements: new Set([
                ...current.pathStatements,
                ...(nextEdge.statementIds ?? []),
              ]),
              pathEdges: new Set([...current.pathEdges, nextEdge.id]),
            })
          }
          continue
        }

        const childGroup = groupByMemberId.get(childNode.id)
        if (!childGroup || childGroup.id === parentGroup.id) continue

        const key = `${parentGroup.id}->${childGroup.id}`
        const entry = accumulated.get(key) ?? {
          source: parentGroup.id,
          target: childGroup.id,
          kinds: new Set<DwhLineageEdgeKind>(),
          statementIds: new Set<number>(),
          originalEdgeIds: new Set<string>(),
          relationCount: 0,
          minDepth: childGroup.minDepth,
        }
        current.pathKinds.forEach((kind) => entry.kinds.add(kind))
        current.pathStatements.forEach((statementId) => entry.statementIds.add(statementId))
        current.pathEdges.forEach((edgeId) => entry.originalEdgeIds.add(edgeId))
        entry.relationCount += 1
        entry.minDepth = Math.min(entry.minDepth, childGroup.minDepth)
        accumulated.set(key, entry)
      }
    }
  }

  const allProjectedEdges = Array.from(accumulated.values()).map((entry) => ({
    id: `swimlane:${entry.source}->${entry.target}`,
    source: entry.source,
    target: entry.target,
    kind: edgeKind(entry.kinds),
    statementIds: Array.from(entry.statementIds).sort((a, b) => a - b),
    originalEdgeIds: Array.from(entry.originalEdgeIds).sort(),
    relationCount: entry.relationCount,
    minDepth: entry.minDepth,
  }))

  const reachableIds = new Set<string>([graph.rootId])
  const reachableQueue = [graph.rootId]
  while (reachableQueue.length) {
    const sourceId = reachableQueue.shift()
    if (!sourceId) break
    for (const edge of allProjectedEdges) {
      if (edge.source !== sourceId || reachableIds.has(edge.target)) continue
      reachableIds.add(edge.target)
      reachableQueue.push(edge.target)
    }
  }
  const reachableNodes = projectedNodes.filter((node) => reachableIds.has(node.id))
  const projectedEdges = allProjectedEdges.filter(
    (edge) => reachableIds.has(edge.source) && reachableIds.has(edge.target),
  )

  return {
    nodes: reachableNodes,
    edges: projectedEdges,
    originalNodeCount: reachableNodes.reduce((total, node) => total + node.occurrenceCount, 0),
    hiddenSubqueryCount: encounteredSubqueryIds.size,
  }
}
