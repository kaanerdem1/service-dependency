/**
 * Eski keşif canvas yerleşimi (KTF / ProcessFlowCanvas — Faz 3b).
 *
 * Ne yapar: Görünür düğüm kümesini kolonlara dizer (`layoutRevealed`); hover
 *   için gelen 2 hop komşuluğu (`incomingNeighborhood`).
 * Ne yapmaz: Tam akış `ProcessFlowMap` layout’una dokunmaz (farklı ORIGIN/NODE_SEP).
 * Veri: Yalnız graf + id kümesi; localStorage yok.
 */
import type { ProcessFlowGraph } from '../../types'

/** HTML referans: kolon 250, satır ~100. Aşağı oklar kısalsın diye satır daha sık. */
export const RANK_SEP = 250
export const NODE_SEP = 92
export const ORIGIN = { x: 60, y: 72 }

export function isHappyLabel(label?: string) {
  return /^(true|evet|onayla|onay|tamam|1)$/i.test((label ?? '').trim())
}

export function isRejectLabel(label?: string) {
  return /^(false|hayır|hayir|reddet)$/i.test((label ?? '').trim())
}

export function labelsBetween(graph: ProcessFlowGraph, from: string, to: string) {
  return graph.edges.filter((e) => e.from === from && e.to === to).map((e) => e.label)
}

export function isDummyId(id: string) {
  return id.startsWith('d:')
}

export function isExceptionSink(graph: ProcessFlowGraph, id: string) {
  const n = graph.nodes.find((row) => row.id === id)
  if (!n || n.kind === 'dummy') return false
  const nm = n.name.trim().toLowerCase()
  if (/^(reddet|runactionservices|iptal et)$/i.test(nm)) {
    return true
  }
  return n.kind === 'end' && nm === 'end1'
}

export function kindOf(graph: ProcessFlowGraph, id: string) {
  return graph.nodes.find((n) => n.id === id)?.kind
}

export function nameOf(graph: ProcessFlowGraph, id: string) {
  return graph.nodes.find((n) => n.id === id)?.name ?? id
}

function hubSet(
  graph: ProcessFlowGraph,
  ids: Set<string>,
  incomingOf: Map<string, string[]>,
) {
  const hubs = new Set<string>()
  for (const id of ids) {
    if (isDummyId(id)) continue
    const inc = (incomingOf.get(id) ?? []).filter((p) => ids.has(p) && p !== id)
    const name = nameOf(graph, id).toLowerCase()
    if (isExceptionSink(graph, id)) hubs.add(id)
    else if (inc.length >= 3) hubs.add(id)
    else if (inc.length >= 2 && /^(reddet|runactionservices)$/i.test(name.trim())) hubs.add(id)
    else if (/şube havuzu/i.test(name)) hubs.add(id)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const id of ids) {
      if (hubs.has(id) || isDummyId(id) || kindOf(graph, id) === 'start') continue
      const parents = (incomingOf.get(id) ?? []).filter((p) => ids.has(p) && p !== id)
      if (parents.length && parents.every((p) => hubs.has(p))) {
        hubs.add(id)
        changed = true
      }
    }
  }
  return hubs
}

function spineWeight(
  graph: ProcessFlowGraph,
  id: string,
  parents: string[],
  hubs: Set<string>,
) {
  const kind = kindOf(graph, id)
  if (hubs.has(id) || kind === 'end') return 5
  if (parents.some((p) => labelsBetween(graph, p, id).some(isHappyLabel))) return 0
  if (parents.some((p) => labelsBetween(graph, p, id).some(isRejectLabel))) return 3
  return 1
}

export function layoutRevealed(
  graph: ProcessFlowGraph,
  ids: Set<string>,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
): Record<string, { x: number; y: number }> {
  const hubs = hubSet(graph, ids, incomingOf)
  const hop = new Map<string, number>()
  const indeg = new Map<string, number>()
  const main = [...ids].filter((id) => !isDummyId(id) && !hubs.has(id))
  for (const id of main) indeg.set(id, 0)
  for (const from of main) {
    for (const to of childrenOf.get(from) ?? []) {
      if (!ids.has(to) || hubs.has(to) || isDummyId(to) || to === from) continue
      indeg.set(to, (indeg.get(to) ?? 0) + 1)
    }
  }
  const queue: string[] = []
  const starts = graph.nodes.filter((n) => n.kind === 'start' && ids.has(n.id) && !hubs.has(n.id)).map((n) => n.id)
  for (const [id, d] of indeg) {
    if (d === 0) {
      hop.set(id, 0)
      queue.push(id)
    }
  }
  for (const id of starts) {
    if (!hop.has(id)) {
      hop.set(id, 0)
      queue.push(id)
    }
  }
  while (queue.length) {
    const from = queue.shift()!
    const h = hop.get(from) ?? 0
    for (const to of childrenOf.get(from) ?? []) {
      if (!ids.has(to) || hubs.has(to) || isDummyId(to) || to === from) continue
      const next = h + 1
      const prev = hop.get(to)
      if (prev == null || next > prev) hop.set(to, next)
      const left = (indeg.get(to) ?? 1) - 1
      indeg.set(to, Math.max(0, left))
      if (left === 0) queue.push(to)
    }
  }
  let guard = 0
  while (main.some((id) => !hop.has(id)) && guard++ < ids.size) {
    for (const id of main) {
      if (hop.has(id)) continue
      const ps = (incomingOf.get(id) ?? []).filter((p) => hop.has(p) && !hubs.has(p))
      hop.set(id, ps.length ? Math.max(...ps.map((p) => hop.get(p)!)) + 1 : 0)
    }
  }
  const maxMain = Math.max(0, ...[...hop.values()])
  const hubOrder = [...hubs].sort((a, b) => {
    const ia = (incomingOf.get(a) ?? []).filter((p) => ids.has(p)).length
    const ib = (incomingOf.get(b) ?? []).filter((p) => ids.has(p)).length
    return ib - ia || nameOf(graph, a).localeCompare(nameOf(graph, b), 'tr')
  })
  hubOrder.forEach((id, i) => hop.set(id, maxMain + 1 + i))

  const byHop = new Map<number, string[]>()
  for (const [id, h] of hop) {
    const list = byHop.get(h) ?? []
    list.push(id)
    byHop.set(h, list)
  }
  const positions: Record<string, { x: number; y: number }> = {}
  const hops = [...byHop.keys()].sort((a, b) => a - b)
  for (const h of hops) {
    const list = byHop.get(h) ?? []
    const scored = list.map((id) => {
      const parents = (incomingOf.get(id) ?? []).filter((p) => hop.has(p) && (hop.get(p) ?? 0) < h)
      const ys = parents.map((p) => positions[p]?.y).filter((y): y is number => y != null)
      const bary = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : ORIGIN.y
      return { id, bary, w: spineWeight(graph, id, parents, hubs) }
    })
    scored.sort((a, b) => a.w - b.w || a.bary - b.bary || a.id.localeCompare(b.id))
    scored.forEach((s, i) => {
      positions[s.id] = {
        x: ORIGIN.x + h * RANK_SEP,
        y: ORIGIN.y + i * NODE_SEP,
      }
    })
  }
  let orphanY = ORIGIN.y
  for (const p of Object.values(positions)) orphanY = Math.max(orphanY, p.y)
  orphanY += NODE_SEP * 2
  for (const id of ids) {
    if (positions[id] || isDummyId(id)) continue
    positions[id] = { x: ORIGIN.x, y: orphanY }
    orphanY += NODE_SEP
  }
  return positions
}

/** Hover: yalnızca hedefe gelen 2 hop (ebeveynler + o oklar). Çıkış / kardeş uçları yok. */
const HOVER_HOPS = 2

export function incomingNeighborhood(
  hoveredId: string,
  incomingOf: Map<string, string[]>,
  edges: ProcessFlowGraph['edges'],
) {
  const nodeIds = new Set<string>([hoveredId])
  const edgeIds = new Set<string>()
  let frontier = [hoveredId]
  for (let hop = 0; hop < HOVER_HOPS; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const p of incomingOf.get(id) ?? []) {
        if (isDummyId(p)) continue
        for (const e of edges) {
          if (e.from === p && e.to === id) edgeIds.add(e.id)
        }
        if (!nodeIds.has(p)) {
          nodeIds.add(p)
          next.push(p)
        }
      }
    }
    frontier = next
  }
  return { nodeIds, edgeIds }
}
