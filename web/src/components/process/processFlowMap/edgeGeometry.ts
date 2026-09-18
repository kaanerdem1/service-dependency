import type { Edge } from 'reactflow'
import type { ProcessFlowNodeKind } from '../../types'
import {
  CORNER,
  GATEWAY_H,
  NODE_H,
  NODE_W,
  RAIL_GAP,
  RAIL_PAD,
  RANK_SEP,
} from './constants.js'
import { PROCESS_FLOW_ORIGIN as ORIGIN } from '../processFlowCamera.js'
import type { RouteKind } from './types.js'

export function assignRailSlots(
  edges: Edge[],
  positions: Record<string, { x: number; y: number }>,
): Map<string, number> {
  const backTouch = new Map<string, Edge[]>()
  const jumpTouch = new Map<string, Edge[]>()
  const pushInto = (m: Map<string, Edge[]>, key: string, e: Edge) => {
    const list = m.get(key) ?? []
    list.push(e)
    m.set(key, list)
  }
  for (const e of edges) {
    const route = (e.data as ProcessEdgeData | undefined)?.route
    if (route === 'back') {
      pushInto(backTouch, e.source, e)
      pushInto(backTouch, e.target, e)
    } else if (route === 'jump') {
      pushInto(jumpTouch, e.source, e)
      pushInto(jumpTouch, e.target, e)
    }
  }
  const yOf = (id: string) => positions[id]?.y ?? 0
  const otherEndY = (e: Edge, touchedNode: string) =>
    yOf(e.source === touchedNode ? e.target : e.source)
  /** touchMap: nodeId -> o düğüme dokunan okların listesi. Her düğüm için
   * kendi içinde sıralı slotlar üretir; sonucu nodeId -> (edgeId -> slot). */
  const slotsPerNode = (touchMap: Map<string, Edge[]>): Map<string, Map<string, number>> => {
    const out = new Map<string, Map<string, number>>()
    for (const [node, list] of touchMap) {
      const sorted = [...list].sort(
        (a, b) => otherEndY(a, node) - otherEndY(b, node) || a.id.localeCompare(b.id),
      )
      const m = new Map<string, number>()
      sorted.forEach((e, i) => m.set(e.id, i))
      out.set(node, m)
    }
    return out
  }
  const backPerNode = slotsPerNode(backTouch)
  const jumpPerNode = slotsPerNode(jumpTouch)

  const slotOf = new Map<string, number>()
  for (const e of edges) {
    const route = (e.data as ProcessEdgeData | undefined)?.route
    const perNode = route === 'back' ? backPerNode : route === 'jump' ? jumpPerNode : undefined
    if (!perNode) continue
    const s1 = perNode.get(e.source)?.get(e.id) ?? 0
    const s2 = perNode.get(e.target)?.get(e.id) ?? 0
    slotOf.set(e.id, Math.max(s1, s2))
  }
  return slotOf
}

export function classifyRoute(sourceX: number, targetX: number): RouteKind {
  if (targetX < sourceX - 20) return 'back'
  if (targetX - sourceX > RANK_SEP * 0.8) return 'jump'
  return 'direct'
}

export function handlesFor(route: RouteKind) {
  if (route === 'jump') return { sourceHandle: 'b', targetHandle: 'bi' }
  // "Geri" oku üst rayı kullanır ama üstten çıkış yasak: sağdan çıkıp
  // hedefin üstüne (sadece giriş) bağlanır.
  if (route === 'back') return { sourceHandle: 'r', targetHandle: 'ti' }
  return { sourceHandle: 'r', targetHandle: 'l' }
}

export function nodeBox(
  pos: { x: number; y: number },
  kind?: ProcessFlowNodeKind,
): { left: number; top: number; right: number; bottom: number } {
  const h = kind === 'decision' ? GATEWAY_H : kind === 'start' || kind === 'end' ? 64 : NODE_H
  const w = kind === 'decision' ? 132 : NODE_W
  return { left: pos.x, top: pos.y, right: pos.x + w, bottom: pos.y + h }
}

export function flowBand(
  positions: Record<string, { x: number; y: number }>,
  kindById: Map<string, ProcessFlowNodeKind>,
) {
  let minY = ORIGIN.y
  let maxY = ORIGIN.y + NODE_H
  for (const [id, pos] of Object.entries(positions)) {
    const box = nodeBox(pos, kindById.get(id))
    minY = Math.min(minY, box.top)
    maxY = Math.max(maxY, box.bottom)
  }
  return { minY, maxY }
}

export function corridorObstacles(
  positions: Record<string, { x: number; y: number }>,
  kindById: Map<string, ProcessFlowNodeKind>,
  xMin: number,
  xMax: number,
  exclude: Set<string>,
) {
  let minTop = Infinity
  let maxBottom = -Infinity
  for (const [id, pos] of Object.entries(positions)) {
    if (exclude.has(id)) continue
    const box = nodeBox(pos, kindById.get(id))
    if (box.right < xMin || box.left > xMax) continue
    minTop = Math.min(minTop, box.top)
    maxBottom = Math.max(maxBottom, box.bottom)
  }
  return { minTop, maxBottom }
}

export function kitEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  route: RouteKind,
  slotKey: string,
  referenceRailY: number | undefined,
  bandMinY: number,
  bandMaxY: number,
  lane = 0,
  slot = 0,
) {
  const lift = lane * 18
  if (route === 'direct') {
    const path = `M ${sourceX},${sourceY} C ${sourceX + 50},${sourceY + lift} ${targetX - 50},${targetY + lift} ${targetX},${targetY}`
    return {
      path,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2 + lift,
    }
  }
  // referenceRailY normalde withEdgeRoutes tarafından her zaman doldurulur
  // (bkz. assignRailSlots); burası sadece pozisyon bulunamayan istisnai bir
  // durum için son çare (slot=0) olarak kalır.
  void slotKey
  // Köşe yarıçapı, dikey/yatay mesafeye göre sınırlanır; böylece kısa
  // saplarda bile eğri kendi üstüne binmez ama mümkün olduğunca geniş ve
  // yuvarlak kalır — "çıkış -> ray -> giriş" sert dik açı gibi görünmesin.
  const roundBack = (railY: number) => {
    const rV = Math.min(CORNER, Math.abs(railY - sourceY) * 0.9, Math.abs(railY - targetY) * 0.9)
    const rH = Math.min(CORNER, Math.abs(targetX - sourceX) * 0.4)
    const r = Math.max(4, Math.min(rV, rH))
    return r
  }
  // Aynı düğümden (kaynak) birden fazla back/jump oku çıkıyorsa, hepsi aynı
  // handle noktasından aynı yönde "kanca" ile çıkarsa, farklı raylara gitse
  // bile ÇIKIŞTA hâlâ üst üste düz bir çizgi gibi görünür (bkz. "3 ok
  // dümdüz aşağı inip sonra ayrılıyor" şikayeti). Bu yüzden kanca uzunluğu
  // (kx), o okun slot sırasına göre kademelenir — her ok düğümden hemen
  // farklı bir X'e doğru ayrılarak çıkar, aşağıda değil ÇIKIŞTA ayrışırlar.
  const SLOT_STAGGER = 14
  if (route === 'back') {
    const railY = (referenceRailY ?? bandMinY - RAIL_PAD) + lift
    const r = roundBack(railY)
    // Çıkış: düğümün sağından hemen dikey fırlamak yerine önce biraz sağa
    // (yataya) açılıp, sonra rayına yumuşakça kıvrılarak yükselir. Aynı
    // sütundaki birden fazla görevin çıkışı böylece üst üste binen dümdüz
    // dikey çizgiler gibi görünmez; her biri kendi düğümünden ayrışarak,
    // eğri bir "kanca" ile çıkar — yön daha net okunur.
    const kx = Math.max(16, Math.min(34, r + 8)) + slot * SLOT_STAGGER
    const path = `M ${sourceX},${sourceY} C ${sourceX + kx},${sourceY} ${sourceX + kx},${railY + r} ${sourceX + kx},${railY + r} Q ${sourceX + kx},${railY} ${sourceX + kx - r},${railY} L ${targetX + r},${railY} Q ${targetX},${railY} ${targetX},${railY + r} L ${targetX},${targetY}`
    return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
  }
  const railY = (referenceRailY ?? bandMaxY + RAIL_PAD) + lift
  const r = roundBack(railY)
  const kx = Math.max(16, Math.min(34, r + 8)) + slot * SLOT_STAGGER
  const path = `M ${sourceX},${sourceY} C ${sourceX + kx},${sourceY} ${sourceX + kx},${railY - r} ${sourceX + kx},${railY - r} Q ${sourceX + kx},${railY} ${sourceX + kx - r},${railY} L ${targetX - r},${railY} Q ${targetX},${railY} ${targetX},${railY - r} L ${targetX},${targetY}`
  return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
}
