import type {
  ProcessFlowGraph,
  ProcessIncomingTransition,
  ProcessNodeDetails,
  ProcessOutgoingTransition,
  ServiceScreenLink,
} from '../types'

function isDummyId(id: string) {
  return id.startsWith('d:')
}

export function incomingTransitionsFor(
  graph: ProcessFlowGraph,
  nodeId: string,
): ProcessIncomingTransition[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const rows: ProcessIncomingTransition[] = []
  for (const e of graph.edges) {
    if (e.to !== nodeId || isDummyId(e.from)) continue
    const from = byId.get(e.from)
    if (!from) continue
    rows.push({
      fromId: e.from,
      fromName: from.name,
      fromKind: from.kind,
      label: e.label?.trim() || undefined,
    })
  }
  return rows
}

export function outgoingTransitionsFor(
  graph: ProcessFlowGraph,
  nodeId: string,
): ProcessOutgoingTransition[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const rows: ProcessOutgoingTransition[] = []
  for (const e of graph.edges) {
    if (e.from !== nodeId || isDummyId(e.to)) continue
    const to = byId.get(e.to)
    if (!to) continue
    rows.push({
      toId: e.to,
      toName: to.name,
      toKind: to.kind,
      label: e.label?.trim() || undefined,
    })
  }
  return rows
}

export function graphNodeIdSet(graph: ProcessFlowGraph): Set<string> {
  return new Set(graph.nodes.filter((n) => n.kind !== 'dummy').map((n) => n.id))
}

export function collectScreenNamesFromDetails(details?: ProcessNodeDetails): string[] {
  const names: string[] = []
  for (const group of details?.groups ?? []) {
    for (const row of group.rows) {
      if (row.label === 'Ekran' && row.value.trim()) names.push(row.value.trim())
    }
  }
  return [...new Set(names)]
}

export function matchProcessScreens(
  xmlNames: string[],
  catalog: ServiceScreenLink[],
): ServiceScreenLink[] {
  if (!xmlNames.length || !catalog.length) return []
  const byName = new Map(catalog.map((s) => [s.name.trim().toLowerCase(), s]))
  const out: ServiceScreenLink[] = []
  for (const raw of xmlNames) {
    const hit = byName.get(raw.trim().toLowerCase())
    if (hit && !out.some((s) => s.oid === hit.oid)) out.push(hit)
  }
  return out
}
