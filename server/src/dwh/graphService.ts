import { getReport } from './reportService.js'
import { getTable } from './tableService.js'
import {
  listReportTreeChildren,
  listSubqueryTreeChildren,
  listTableTreeChildren,
} from './treeService.js'
import type {
  DwhLineageEdge,
  DwhLineageEntityKind,
  DwhLineageGraph,
  DwhLineageNode,
  DwhLineageNodeKind,
  DwhTable,
  DwhTreeNode,
} from './types.js'

const MAX_GRAPH_NODES = 900

type WalkContext = {
  graph: ReturnType<typeof graphBuilder>
  simple: boolean
  maxDepth: number
  expandedEntityKeys: Set<string>
}

function treeEntityKind(node: Pick<DwhTreeNode, 'kind'>): DwhLineageEntityKind | undefined {
  if (node.kind === 'table' || node.kind === 'report' || node.kind === 'subquery') return node.kind
  return undefined
}

function treeEntityKey(node: Pick<DwhTreeNode, 'kind' | 'tableId' | 'reportId' | 'subqueryId'>) {
  if (node.kind === 'table' && node.tableId !== undefined) return `table:${node.tableId}`
  if (node.kind === 'report' && node.reportId !== undefined) return `report:${node.reportId}`
  if (node.kind === 'subquery' && node.subqueryId !== undefined) return `subquery:${node.subqueryId}`
  return undefined
}

function edgeId(source: string, target: string, kind: DwhLineageEdge['kind']) {
  return `${kind}:${source}->${target}`
}

function occurrenceId(entityKey: string, parentId: string, index: number) {
  return `${entityKey}@${parentId}/${index}`
}

function graphBuilder(rootId: string, rootKind: DwhLineageGraph['rootKind'], maxDepth: number) {
  const nodes = new Map<string, DwhLineageNode>()
  const edges = new Map<string, DwhLineageEdge>()
  let truncated = false

  const addNode = (node: DwhLineageNode) => {
    if (!nodes.has(node.id) && nodes.size >= MAX_GRAPH_NODES) {
      truncated = true
      return false
    }
    nodes.set(node.id, node)
    return true
  }

  const addEdge = (edge: DwhLineageEdge) => {
    if (edges.size >= MAX_GRAPH_NODES * 2) {
      truncated = true
      return
    }
    edges.set(edge.id, edge)
  }

  return {
    addNode,
    addEdge,
    markTruncated() {
      truncated = true
    },
    hasNodeCapacity: () => nodes.size < MAX_GRAPH_NODES,
    toGraph: (): DwhLineageGraph => ({
      rootId,
      rootKind,
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
      truncated,
      maxDepth,
    }),
  }
}

function rootTableNode(table: DwhTable, id: string): DwhLineageNode {
  return {
    id,
    kind: 'table',
    entityKind: 'table',
    entityKey: `table:${table.tableId}`,
    label: table.schemaName ? `${table.schemaName}.${table.tableName}` : table.tableName,
    subtitle: table.layer,
    tableId: table.tableId,
    layer: table.layer,
    depth: 0,
  }
}

function nodeFromTreeNode(
  node: DwhTreeNode,
  id: string,
  entityKey: string,
  depth: number,
  visualKind?: Extract<DwhLineageNodeKind, 'reference' | 'cycle'>,
): DwhLineageNode | undefined {
  const entityKind = treeEntityKind(node)
  if (!entityKind) return undefined
  if (node.kind === 'table') {
    return {
      id,
      kind: visualKind ?? 'table',
      entityKind,
      entityKey,
      label: node.label,
      subtitle: visualKind === 'cycle' ? 'Döngü' : visualKind === 'reference' ? 'Referans' : node.layer,
      tableId: node.tableId,
      layer: node.layer,
      depth,
    }
  }
  if (node.kind === 'report') {
    return {
      id,
      kind: visualKind ?? 'report',
      entityKind,
      entityKey,
      label: node.label,
      subtitle: visualKind === 'cycle' ? 'Döngü' : visualKind === 'reference' ? 'Referans' : undefined,
      reportId: node.reportId,
      depth,
    }
  }
  return {
    id,
    kind: visualKind ?? 'subquery',
    entityKind,
    entityKey,
    label: node.alias ? `${node.label} · ${node.alias}` : node.label,
    subtitle: visualKind === 'cycle' ? 'Döngü' : visualKind === 'reference' ? 'Referans' : node.subqueryType,
    subqueryId: node.subqueryId,
    depth,
  }
}

function edgeFromChild(child: DwhTreeNode, childId: string, parentId: string): DwhLineageEdge {
  if (child.connection?.type === 'statement') {
    return {
      id: edgeId(childId, parentId, 'statement'),
      kind: 'statement',
      source: childId,
      target: parentId,
      label: child.connection.statementIds.length
        ? `${child.connection.statementIds.length} SQL`
        : 'SQL',
      statementIds: child.connection.statementIds,
    }
  }
  if (child.connection?.type === 'reportSql') {
    return {
      id: edgeId(childId, parentId, 'reportSql'),
      kind: 'reportSql',
      source: childId,
      target: parentId,
      label: 'rapor kaynağı',
    }
  }
  return {
    id: edgeId(childId, parentId, 'subquery'),
    kind: 'subquery',
    source: childId,
    target: parentId,
    label: child.kind === 'subquery' ? 'alt sorgu' : undefined,
  }
}

async function addChildBranch(
  child: DwhTreeNode,
  parentNodeId: string,
  childDepth: number,
  siblingIndex: number,
  pathEntityKeys: Set<string>,
  context: WalkContext,
) {
  const entityKey = treeEntityKey(child)
  if (!entityKey) return

  const isCycle = pathEntityKeys.has(entityKey)
  const isReference = !isCycle && context.expandedEntityKeys.has(entityKey)
  const childNodeId = occurrenceId(entityKey, parentNodeId, siblingIndex)
  const childNode = nodeFromTreeNode(
    child,
    childNodeId,
    entityKey,
    childDepth,
    isCycle ? 'cycle' : isReference ? 'reference' : undefined,
  )
  if (!childNode) return
  if (!context.graph.addNode(childNode)) return
  context.graph.addEdge(edgeFromChild(child, childNode.id, parentNodeId))

  if (isCycle || isReference || childDepth >= context.maxDepth || !context.graph.hasNodeCapacity()) return

  if (child.kind === 'table' && child.tableId) {
    context.expandedEntityKeys.add(entityKey)
    await walkTable(child.tableId, childNode.id, childDepth, new Set([...pathEntityKeys, entityKey]), context)
  } else if (child.kind === 'subquery' && child.subqueryId) {
    context.expandedEntityKeys.add(entityKey)
    await walkSubquery(child.subqueryId, childNode.id, childDepth, new Set([...pathEntityKeys, entityKey]), context)
  }
}

async function walkTable(
  currentTableId: number,
  parentNodeId: string,
  depth: number,
  pathEntityKeys: Set<string>,
  context: WalkContext,
) {
  if (depth >= context.maxDepth || !context.graph.hasNodeCapacity()) return
  const response = await listTableTreeChildren(currentTableId, context.simple)
  let siblingIndex = 0
  for (const child of response.children) {
    if (child.kind === 'empty') continue
    await addChildBranch(child, parentNodeId, depth + 1, siblingIndex, pathEntityKeys, context)
    siblingIndex += 1
    if (!context.graph.hasNodeCapacity()) {
      context.graph.markTruncated()
      break
    }
  }
}

async function walkSubquery(
  subqueryId: number,
  parentNodeId: string,
  depth: number,
  pathEntityKeys: Set<string>,
  context: WalkContext,
) {
  if (depth >= context.maxDepth || !context.graph.hasNodeCapacity()) return
  const response = await listSubqueryTreeChildren(subqueryId)
  let siblingIndex = 0
  for (const child of response.children) {
    if (child.kind === 'empty') continue
    await addChildBranch(child, parentNodeId, depth + 1, siblingIndex, pathEntityKeys, context)
    siblingIndex += 1
    if (!context.graph.hasNodeCapacity()) {
      context.graph.markTruncated()
      break
    }
  }
}

export async function buildTableLineageGraph(
  tableId: number,
  options: { maxDepth?: number; simple?: boolean } = {},
): Promise<DwhLineageGraph | undefined> {
  const table = await getTable(tableId)
  if (!table) return undefined

  const maxDepth = Math.min(Math.max(options.maxDepth ?? 25, 1), 25)
  const rootId = `table:${table.tableId}`
  const rootEntityKey = `table:${table.tableId}`
  const graph = graphBuilder(rootId, 'table', maxDepth)
  graph.addNode(rootTableNode(table, rootId))

  const context: WalkContext = {
    graph,
    simple: options.simple ?? false,
    maxDepth,
    expandedEntityKeys: new Set([rootEntityKey]),
  }

  await walkTable(table.tableId, rootId, 0, new Set([rootEntityKey]), context)
  return graph.toGraph()
}

export async function buildReportLineageGraph(
  reportId: number,
  options: { maxDepth?: number; simple?: boolean } = {},
): Promise<DwhLineageGraph | undefined> {
  const report = await getReport(reportId)
  if (!report) return undefined

  const maxDepth = Math.min(Math.max(options.maxDepth ?? 25, 1), 25)
  const rootId = `report:${report.reportId}`
  const rootEntityKey = `report:${report.reportId}`
  const graph = graphBuilder(rootId, 'report', maxDepth)
  graph.addNode({
    id: rootId,
    kind: 'report',
    entityKind: 'report',
    entityKey: rootEntityKey,
    label: report.reportName,
    subtitle: report.fileName,
    reportId: report.reportId,
    depth: 0,
  })

  const context: WalkContext = {
    graph,
    simple: options.simple ?? false,
    maxDepth,
    expandedEntityKeys: new Set([rootEntityKey]),
  }

  const response = await listReportTreeChildren(report.reportId)
  let siblingIndex = 0
  for (const child of response.children) {
    if (child.kind !== 'table' || !child.tableId) continue
    await addChildBranch(child, rootId, 1, siblingIndex, new Set([rootEntityKey]), context)
    siblingIndex += 1
    if (!context.graph.hasNodeCapacity()) {
      context.graph.markTruncated()
      break
    }
  }

  return graph.toGraph()
}
