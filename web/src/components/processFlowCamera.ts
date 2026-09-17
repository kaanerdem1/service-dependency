/**
 * Tam akış haritası kamerası (Faz 3b).
 *
 * Ne yapar: İlk viewport (start düğümü), yatay span, tıklanınca/arayınca
 *   düğümü kareye alma (`fitView`).
 * Ne yapmaz: Layout üretmez; hover/drag state tutmaz.
 * Not: Harita her hover’da rebuild edilmez; kamera yalnız seçim/arama/focus’ta kayar.
 */
import type { Node } from 'reactflow'
import { sinkCopyRealId } from './processFlowIds'

export const PROCESS_FLOW_ORIGIN = { x: 60, y: 49.2 }
export const PROCESS_FLOW_WIDE_SPAN = 1600
export const PROCESS_FLOW_START_ZOOM = 0.9

export function startCamera(
  nodes: Node[],
  origin = PROCESS_FLOW_ORIGIN,
  zoom = PROCESS_FLOW_START_ZOOM,
) {
  const start =
    nodes.find((n) => (n.data as { kind?: string } | undefined)?.kind === 'start') ?? nodes[0]
  return {
    x: 72 - (start?.position.x ?? origin.x) * zoom,
    y: 120 - (start?.position.y ?? origin.y) * zoom,
    zoom,
  }
}

export function graphSpanX(nodes: Node[]) {
  let minX = Infinity
  let maxX = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x)
    maxX = Math.max(maxX, n.position.x)
  }
  return Number.isFinite(minX) ? maxX - minX : 0
}

export function frameNodeOnCanvas(
  fitView: (opts: {
    nodes: Node[]
    padding: number
    duration: number
    minZoom: number
    maxZoom: number
  }) => unknown,
  getNodes: () => Node[],
  targetId: string,
) {
  requestAnimationFrame(() => {
    const candidates = getNodes().filter(
      (n) => n.type !== 'processNote' && sinkCopyRealId(n.id) === targetId,
    )
    const primary = candidates.find((n) => !n.id.includes('::near')) ?? candidates[0]
    if (!primary) return
    void fitView({
      nodes: [primary],
      padding: 0.46,
      duration: 480,
      minZoom: 0.45,
      maxZoom: 1.15,
    })
  })
}
