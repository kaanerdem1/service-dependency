/**
 * Harita içi arama — düğüm adı / id eşlemesi.
 * Kullanan: `ProcessFlowMapSearch.tsx` → `ProcessFlowMap`.
 */
import type { ProcessFlowGraph } from '../types'

function isDummyId(id: string) {
  return id.startsWith('d:')
}

/** ProcessFlowMap.buildDag ile aynı mantık — arama sırası harita yol hesabıyla uyumlu kalsın. */
function buildDag(graph: ProcessFlowGraph): {
  allIds: string[]
  starts: string[]
  dagChildren: Map<string, string[]>
} {
  const allIds = graph.nodes.filter((n) => n.kind !== 'dummy').map((n) => n.id)
  const children = new Map<string, string[]>()
  for (const id of allIds) children.set(id, [])
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const list = children.get(e.from)
    if (list && !list.includes(e.to)) list.push(e.to)
  }
  for (const list of children.values()) list.sort((a, b) => a.localeCompare(b, 'tr'))

  const backEdgeKeys = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const starts = graph.nodes
    .filter((n) => n.kind === 'start')
    .map((n) => n.id)
    .sort((a, b) => a.localeCompare(b, 'tr'))
  const dfsOrder = [
    ...starts,
    ...allIds.filter((id) => !starts.includes(id)).sort((a, b) => a.localeCompare(b, 'tr')),
  ]
  const dfs = (id: string) => {
    state.set(id, 1)
    for (const to of children.get(id) ?? []) {
      const s = state.get(to)
      if (s === undefined) dfs(to)
      else if (s === 1) backEdgeKeys.add(`${id}\0${to}`)
    }
    state.set(id, 2)
  }
  for (const id of dfsOrder) if (!state.has(id)) dfs(id)

  const dagChildren = new Map<string, string[]>()
  for (const [from, list] of children) {
    dagChildren.set(
      from,
      list.filter((to) => !backEdgeKeys.has(`${from}\0${to}`)),
    )
  }
  return { allIds, starts, dagChildren }
}

function reachableFromStarts(starts: string[], dagChildren: Map<string, string[]>): Set<string> {
  const reached = new Set<string>(starts)
  const queue = [...starts]
  while (queue.length) {
    const from = queue.shift()!
    for (const to of dagChildren.get(from) ?? []) {
      if (!reached.has(to)) {
        reached.add(to)
        queue.push(to)
      }
    }
  }
  return reached
}

/** Başlangıçtan ilerleyen süreç akış sırası (DAG topolojik; döngü kenarları hariç). */
export function processFlowNodeOrder(graph: ProcessFlowGraph): string[] {
  const { allIds, starts, dagChildren } = buildDag(graph)
  const forward = reachableFromStarts(starts, dagChildren)
  const inFlow = allIds.filter((id) => forward.has(id))
  const offFlow = allIds.filter((id) => !forward.has(id)).sort((a, b) => a.localeCompare(b, 'tr'))

  const indegree = new Map<string, number>()
  for (const id of inFlow) indegree.set(id, 0)
  for (const id of inFlow) {
    for (const to of dagChildren.get(id) ?? []) {
      if (!forward.has(to)) continue
      indegree.set(to, (indegree.get(to) ?? 0) + 1)
    }
  }
  const queue = inFlow
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b, 'tr'))
  const ordered: string[] = []
  const remaining = new Map(indegree)
  while (queue.length) {
    const id = queue.shift()!
    ordered.push(id)
    for (const to of dagChildren.get(id) ?? []) {
      if (!forward.has(to)) continue
      const left = (remaining.get(to) ?? 0) - 1
      remaining.set(to, left)
      if (left === 0) queue.push(to)
    }
    queue.sort((a, b) => a.localeCompare(b, 'tr'))
  }
  for (const id of inFlow) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return [...ordered, ...offFlow]
}

export function processFlowSearchMatches(graph: ProcessFlowGraph, query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: string[] = []
  for (const node of graph.nodes) {
    if (node.kind === 'dummy') continue
    const blob = [node.id, node.name, ...(node.services ?? [])].join(' ').toLowerCase()
    if (blob.includes(q)) hits.push(node.id)
  }
  if (hits.length <= 1) return hits

  const rank = new Map(processFlowNodeOrder(graph).map((id, index) => [id, index]))
  return hits.sort((a, b) => {
    const da = rank.get(a)
    const db = rank.get(b)
    if (da != null && db != null && da !== db) return da - db
    if (da != null && db == null) return -1
    if (da == null && db != null) return 1
    return a.localeCompare(b, 'tr')
  })
}
