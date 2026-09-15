import type { ProcessFlowGraph, ProcessNodeDetails, ServiceScreenLink } from '../types'

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
