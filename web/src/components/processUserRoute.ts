/**
 * Kullanıcı akış rotası — state makinesi (tam akıştan ayrı).
 *
 * Ne yapar: Start’tan itibaren seçilen geçişlerle `visits` + `cursor` tutar;
 *   tek çıkışlı zinciri otomatik ilerletir; geri/ileri; kayıtlı rotayı güncel
 *   grafla uzlaştırır (`reconcileRouteWithGraph`).
 * Ne yapmaz: UI, PDF, localStorage yazmaz. Kayıt `processRouteStore.ts`.
 * Tam akış vs rota: docs/process-flow.md
 */
import type { ProcessFlowGraph } from '../types'

export type RouteVisit = {
  visitId: string
  nodeId: string
  ordinal: number
  incomingEdgeId?: string
  incomingLabel?: string
}

export type UserRouteState = {
  visits: RouteVisit[]
  cursor: number
}

export type RouteProgress = 'draft' | 'completed'

export function visibleRouteVisits(state: UserRouteState): RouteVisit[] {
  return state.visits.slice(0, state.cursor + 1)
}

export function routeCurrentVisit(state: UserRouteState): RouteVisit | undefined {
  return state.visits[state.cursor]
}

export function outgoingRouteEdges(graph: ProcessFlowGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.from === nodeId && !edge.to.startsWith('d:'))
}

function visitFor(nodeId: string, visits: RouteVisit[], edge?: ProcessFlowGraph['edges'][number]): RouteVisit {
  const ordinal = visits.filter((visit) => visit.nodeId === nodeId).length + 1
  return {
    visitId: `${nodeId}::visit:${ordinal}`,
    nodeId,
    ordinal,
    incomingEdgeId: edge?.id,
    incomingLabel: edge?.label?.trim() || undefined,
  }
}

export function createUserRoute(graph: ProcessFlowGraph, startNodeId?: string): UserRouteState {
  const start =
    (startNodeId ? graph.nodes.find((node) => node.id === startNodeId) : undefined) ??
    graph.nodes.find((node) => node.kind === 'start') ??
    graph.nodes.find((node) => node.kind !== 'dummy')
  if (!start) return { visits: [], cursor: -1 }
  return { visits: [visitFor(start.id, [])], cursor: 0 }
}

function appendEdge(
  graph: ProcessFlowGraph,
  visits: RouteVisit[],
  edge: ProcessFlowGraph['edges'][number],
): RouteVisit[] {
  const current = visits.at(-1)
  if (!current || edge.from !== current.nodeId) return visits
  if (!graph.nodes.some((node) => node.id === edge.to)) return visits
  return [...visits, visitFor(edge.to, visits, edge)]
}

/**
 * Tek çıkışlı zinciri bir sonraki dallanma/bitişe kadar ekler.
 * Aynı edge ikinci kez otomatik geçilecekse durur; böylece tek çıkışlı
 * döngüler sonsuz çalışmaz ve kullanıcı o geçişi bilinçli seçebilir.
 */
export function autoAdvanceRoute(
  graph: ProcessFlowGraph,
  initial: UserRouteState,
  maxAutoSteps = 200,
): UserRouteState {
  let visits = visibleRouteVisits(initial)
  const traversed = new Set(visits.map((visit) => visit.incomingEdgeId).filter(Boolean))

  for (let step = 0; step < maxAutoSteps; step++) {
    const current = visits.at(-1)
    if (!current) break
    const outgoing = outgoingRouteEdges(graph, current.nodeId)
    if (outgoing.length !== 1) break
    const edge = outgoing[0]
    if (traversed.has(edge.id)) break
    const next = appendEdge(graph, visits, edge)
    if (next === visits) break
    visits = next
    traversed.add(edge.id)
  }
  return { visits, cursor: visits.length - 1 }
}

export function chooseRouteEdge(
  graph: ProcessFlowGraph,
  state: UserRouteState,
  edgeId: string,
): UserRouteState {
  const prefix = visibleRouteVisits(state)
  const current = prefix.at(-1)
  const edge = graph.edges.find((candidate) => candidate.id === edgeId)
  if (!current || !edge || edge.from !== current.nodeId) return state
  const visits = appendEdge(graph, prefix, edge)
  return autoAdvanceRoute(graph, { visits, cursor: visits.length - 1 })
}

export function goRouteBack(state: UserRouteState): UserRouteState {
  if (state.cursor <= 0) return state
  return { ...state, cursor: state.cursor - 1 }
}

export function goRouteForward(state: UserRouteState): UserRouteState {
  if (state.cursor >= state.visits.length - 1) return state
  return { ...state, cursor: state.cursor + 1 }
}

export function routeProgress(graph: ProcessFlowGraph, state: UserRouteState): RouteProgress {
  const current = routeCurrentVisit(state)
  return current && outgoingRouteEdges(graph, current.nodeId).length === 0 ? 'completed' : 'draft'
}

export function transitionCaption(label?: string | null) {
  const name = label?.trim()
  return name || undefined
}

export function routePrefix(state: UserRouteState, visitIndex: number): UserRouteState {
  const cursor = Math.max(0, Math.min(visitIndex, state.cursor))
  return { visits: state.visits.slice(0, cursor + 1), cursor }
}

/** Görünür adım dizisi (node + gelen edge) kayıtlı rota ile aynı mı. */
export function routeVisibleVisitsEqual(a: UserRouteState, b: UserRouteState): boolean {
  const va = visibleRouteVisits(a)
  const vb = visibleRouteVisits(b)
  if (va.length !== vb.length) return false
  return va.every(
    (v, i) => v.nodeId === vb[i].nodeId && v.incomingEdgeId === vb[i].incomingEdgeId,
  )
}

/** Kayıtlı rota varken “farklı kaydet” anlamlı mı (adım veya ad değişmiş). */
export function savedRouteHasChanges(
  state: UserRouteState,
  saved: UserRouteState,
  name: string,
  savedName: string,
): boolean {
  return !routeVisibleVisitsEqual(state, saved) || name.trim() !== savedName.trim()
}

/** Eski bir grafik sürümünde kaydedilmiş rotayı son doğrulanabilir geçişte keser. */
export function reconcileRouteWithGraph(
  graph: ProcessFlowGraph,
  state: UserRouteState,
): UserRouteState {
  const prefix = visibleRouteVisits(state)
  if (!prefix.length || !graph.nodes.some((node) => node.id === prefix[0].nodeId)) {
    return autoAdvanceRoute(graph, createUserRoute(graph))
  }
  const valid = [prefix[0]]
  for (let index = 1; index < prefix.length; index++) {
    const previous = valid.at(-1)
    const visit = prefix[index]
    const edge = graph.edges.find((candidate) => candidate.id === visit.incomingEdgeId)
    if (
      !previous ||
      !edge ||
      edge.from !== previous.nodeId ||
      edge.to !== visit.nodeId ||
      !graph.nodes.some((node) => node.id === visit.nodeId)
    ) {
      break
    }
    valid.push(visit)
  }
  return { visits: valid, cursor: valid.length - 1 }
}
