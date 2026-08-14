/**
 * Harita okunabilirliği (Datadog / SigNoz yaklaşımı):
 * - Ego + katman: az hop → büyük düğüm; çok hop → kompakt
 * - Node etiketi: 2 satır (CSS clamp); sığmazsa açık hover kartı
 * - fitView maxZoom ile 1 katmanda aşırı küçülmeyi engelle
 * - Düzen: varsayılan LTR; isteğe bağlı radial (halka)
 */

export type MapNodeSize = 'lg' | 'md' | 'sm'

/** Varsayılan katmanlı (LTR); radial = merkez + hop halkaları */
export type MapLayoutMode = 'ltr' | 'radial'

export type MapLayout = {
  size: MapNodeSize
  nodeW: number
  colGap: number
  rowGap: number
  /** ~2 satıra sığma eşiği (karakter); üstü → hover’da tam ad */
  tipChars: number
  minZoom: number
  maxZoom: number
  fitPadding: number
}

type RadialLayoutNode = {
  id: string
  position: { x: number; y: number }
  data: {
    hop: number
    kind: string
    label?: string
    fullLabel?: string
    size?: MapNodeSize
  }
  style?: { width?: number | string } | null
}

/** CSS ile uyumlu yaklaşık düğüm yükseklikleri (body min-height + padding) */
export function radialNodeHeight(
  kind: string,
  size: MapNodeSize | undefined,
): number {
  if (kind === 'center') return 140
  if (size === 'lg') return 102
  if (size === 'sm') return 78
  return 88
}

/**
 * Dikdörtgen merkezden açı yönünde kenara kadar mesafe.
 * Geniş kartta yatay/dikey “yakınlık” farkını dengeler.
 */
export function rectExtentAlongRay(
  halfW: number,
  halfH: number,
  angle: number,
): number {
  const c = Math.abs(Math.cos(angle))
  const s = Math.abs(Math.sin(angle))
  const xHit = c < 1e-8 ? Number.POSITIVE_INFINITY : halfW / c
  const yHit = s < 1e-8 ? Number.POSITIVE_INFINITY : halfH / s
  return Math.min(xHit, yHit)
}

/**
 * Radial layout sabitleri — hop derinliği layout’u küçültmesin;
 * halkalar eşit merkez mesafesinde.
 */
export function mapLayoutForRadial(): MapLayout {
  return {
    size: 'md',
    nodeW: 248,
    colGap: 300,
    rowGap: 112,
    tipChars: 44,
    minZoom: 0.22,
    maxZoom: 1.25,
    fitPadding: 0.08,
  }
}

export const RADIAL_CENTER_W = 292

/** Hop halkası merkez yarıçapı — 1→2→3 eşit adım, 3 hop ekrana sığsın */
export function radialRingCenterRadius(
  hop: number,
  layout: MapLayout,
  centerW = RADIAL_CENTER_W,
  centerH = 140,
): number {
  if (hop <= 0) return 0
  const corner = Math.hypot(centerW / 2, centerH / 2)
  const pitch = Math.max(168, layout.nodeW * 0.52 + 56)
  const first = corner + 52 + layout.nodeW * 0.28
  return first + (hop - 1) * pitch
}

/** @deprecated radialRingCenterRadius kullan */
export function radialClearance(hop: number, layout: MapLayout): number {
  return radialRingCenterRadius(hop, layout) - RADIAL_CENTER_W / 2
}

function nodeWidth(n: RadialLayoutNode, layout: MapLayout): number {
  return typeof n.style?.width === 'number' ? n.style.width : layout.nodeW
}

/** Alt ağaç yaprağı sayısı — dilim genişliği buna göre */
function subtreeWeight(
  id: string,
  childrenOf: Map<string, string[]>,
  memo: Map<string, number>,
): number {
  const cached = memo.get(id)
  if (cached !== undefined) return cached
  const kids = childrenOf.get(id) ?? []
  const w = kids.length
    ? kids.reduce((s, k) => s + subtreeWeight(k, childrenOf, memo), 0)
    : 1
  memo.set(id, w)
  return w
}

/**
 * Klasik radial tidy-tree: ebeveyn dilimini alt ağaç ağırlığına göre böl;
 * düğüm açısı = dilim ortası. Çapraz kenar azalır, referans görüntüdeki gibi.
 */
function assignRadialAngles(
  centerId: string,
  nodeIds: Set<string>,
  treeParent: Map<string, string> | undefined,
  labelOf: (id: string) => string,
): Map<string, number> {
  const angles = new Map<string, number>()
  const childrenOf = new Map<string, string[]>()

  for (const id of nodeIds) {
    const rawParent = treeParent?.get(id)
    const parent =
      rawParent && (rawParent === centerId || nodeIds.has(rawParent))
        ? rawParent
        : centerId
    const list = childrenOf.get(parent) ?? []
    list.push(id)
    childrenOf.set(parent, list)
  }

  for (const [pid, kids] of childrenOf) {
    childrenOf.set(
      pid,
      [...kids].sort((a, b) =>
        labelOf(a).localeCompare(labelOf(b), 'tr'),
      ),
    )
  }

  const memo = new Map<string, number>()
  const start = -Math.PI / 2
  const end = start + 2 * Math.PI

  const place = (parentId: string, a0: number, a1: number) => {
    const kids = childrenOf.get(parentId) ?? []
    if (!kids.length) return
    const weights = kids.map((k) => subtreeWeight(k, childrenOf, memo))
    const total = weights.reduce((s, w) => s + w, 0) || kids.length
    const span = a1 - a0
    let cursor = a0
    kids.forEach((kid, i) => {
      const share = span * (weights[i]! / total)
      const k0 = cursor
      const k1 = cursor + share
      angles.set(kid, (k0 + k1) / 2)
      place(kid, k0, k1)
      cursor = k1
    })
  }

  place(centerId, start, end)
  return angles
}

/**
 * Açı çiftine göre handle — oklar düğümün doğru kenarından çıksın/girsin.
 */
export function radialHandlePair(
  from: { x: number; y: number; w: number; h?: number },
  to: { x: number; y: number; w: number; h?: number },
): { sourceHandle: string; targetHandle: string } {
  const fh = from.h ?? 90
  const th = to.h ?? 90
  const dx = to.x + to.w / 2 - (from.x + from.w / 2)
  const dy = to.y + th / 2 - (from.y + fh / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'out', targetHandle: 'in' }
      : { sourceHandle: 'out-left', targetHandle: 'in-right' }
  }
  return dy >= 0
    ? { sourceHandle: 'out-bottom', targetHandle: 'in-top' }
    : { sourceHandle: 'out-top', targetHandle: 'in-bottom' }
}

/**
 * Radial kenar eğrisi — yarıçap boyunca ilerler, açı fan gibi açılır
 * (referans görüntüdeki kavisli dallar).
 */
export function radialEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  cx: number,
  cy: number,
): string {
  const a1 = Math.atan2(sourceY - cy, sourceX - cx)
  const a2 = Math.atan2(targetY - cy, targetX - cx)
  const r1 = Math.hypot(sourceX - cx, sourceY - cy)
  const r2 = Math.hypot(targetX - cx, targetY - cy)

  // Merkeze çok yakın kaynak → düz spoke
  if (r1 < 28) {
    return `M ${sourceX},${sourceY} L ${targetX},${targetY}`
  }

  let da = a2 - a1
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI

  // Küçük açı farkı → hafif eğri / düz
  if (Math.abs(da) < 0.04) {
    return `M ${sourceX},${sourceY} L ${targetX},${targetY}`
  }

  const c1r = r1 + (r2 - r1) * 0.35
  const c2r = r1 + (r2 - r1) * 0.7
  const c1x = cx + c1r * Math.cos(a1)
  const c1y = cy + c1r * Math.sin(a1)
  const c2x = cx + c2r * Math.cos(a2)
  const c2y = cy + c2r * Math.sin(a2)
  return `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`
}

export type RadialLayoutResult<T> = {
  nodes: T[]
  /** Halka kılavuzları (hop → yarıçap), merkez (cx,cy) */
  rings: { hop: number; radius: number }[]
  cx: number
  cy: number
}

/**
 * Radial tidy-tree (referans):
 * - Merkez ortada
 * - Hop = eşit yarıçaplı halka
 * - Açı = alt ağaç diliminin ortası (çapraz bağ yok)
 */
export function applyRadialLayout<T extends RadialLayoutNode>(
  nodes: T[],
  layout: MapLayout,
  options: {
    centerId: string
    leftPadId?: string
    centerWidth?: number
    originX?: number
    treeParent?: Map<string, string>
  },
): RadialLayoutResult<T> {
  const {
    centerId,
    leftPadId = '__map-left-pad',
    centerWidth,
    originX = mapLeftX(),
    treeParent,
  } = options
  const center = nodes.find((n) => n.id === centerId)
  if (!center) {
    return { nodes, rings: [], cx: originX, cy: 400 }
  }

  const byHop = new Map<number, T[]>()
  const idToNode = new Map<string, T>()
  let maxHop = 0
  for (const n of nodes) {
    if (n.id === centerId || n.id === leftPadId) continue
    if (n.id.startsWith('__ring-')) continue
    const hop = Math.max(1, n.data.hop || 1)
    maxHop = Math.max(maxHop, hop)
    const list = byHop.get(hop) ?? []
    list.push(n)
    byHop.set(hop, list)
    idToNode.set(n.id, n)
  }

  const hops = [...byHop.keys()].sort((a, b) => a - b)
  const cW =
    centerWidth ??
    (typeof center.style?.width === 'number'
      ? center.style.width
      : RADIAL_CENTER_W)
  const cH = radialNodeHeight('center', 'lg')
  const halfCW = cW / 2
  const halfCH = cH / 2

  const nodeIds = new Set(idToNode.keys())
  const angles = assignRadialAngles(
    centerId,
    nodeIds,
    treeParent,
    (id) => {
      const n = idToNode.get(id)
      return (n?.data.fullLabel ?? n?.data.label ?? id).toLowerCase()
    },
  )

  const radiusByHop = new Map<number, number>()
  const rings: { hop: number; radius: number }[] = []
  let maxCenterDist = 0
  for (const hop of hops) {
    const R = radialRingCenterRadius(hop, layout, cW, cH)
    radiusByHop.set(hop, R)
    rings.push({ hop, radius: R })
    maxCenterDist = Math.max(maxCenterDist, R)
  }

  const cx = originX + maxCenterDist + 24
  const cy = maxCenterDist + 160

  const next: T[] = nodes
    .filter((n) => !n.id.startsWith('__ring-'))
    .map((n) => {
      if (n.id === leftPadId) {
        return { ...n, position: { x: 0, y: cy - 12 } }
      }
      if (n.id === centerId) {
        return {
          ...n,
          position: { x: cx - halfCW, y: cy - halfCH },
        }
      }
      return n
    })

  for (const hop of hops) {
    const R = radiusByHop.get(hop) ?? radialRingCenterRadius(hop, layout, cW, cH)
    for (const item of byHop.get(hop) ?? []) {
      const angle = angles.get(item.id) ?? 0
      const w = nodeWidth(item, layout)
      const h = radialNodeHeight(item.data.kind, item.data.size)
      const x = cx + R * Math.cos(angle) - w / 2
      const y = cy + R * Math.sin(angle) - h / 2
      const idx = next.findIndex((n) => n.id === item.id)
      if (idx >= 0) {
        next[idx] = { ...next[idx]!, position: { x, y } }
      }
    }
  }

  return { nodes: next, rings, cx, cy }
}

/**
 * Sol bilgi paneli için fitView bbox’ına dahil edilen görünmez pad genişliği.
 * Kamera kaydırılmaz — pad düğümü boşluğu grafikte tutar.
 */
export const MAP_INFO_PANEL_RESERVE = 280

export function mapLeftX(): number {
  return 48 + MAP_INFO_PANEL_RESERVE
}

/** fitView kenar boşluğu */
export function fitViewPaddingForLayout(layout: MapLayout): number {
  return layout.fitPadding + 0.05
}

export function mapNodeWidth(size: MapNodeSize): number {
  if (size === 'lg') return 320
  if (size === 'md') return 280
  return 244
}

/** Merkez her zaman büyük; diğerleri hop + açık derinlik ile dinamik */
export function mapNodeSizeFor(
  kind: 'center' | 'service' | 'collapsed',
  hop: number,
  visibleMaxHop: number,
): MapNodeSize {
  if (kind === 'center') return 'lg'
  if (kind === 'collapsed') {
    return visibleMaxHop <= 1 ? 'md' : 'sm'
  }
  if (hop <= 1) {
    return visibleMaxHop <= 1 ? 'lg' : 'md'
  }
  if (hop === 2) {
    return visibleMaxHop <= 2 ? 'md' : 'sm'
  }
  return 'sm'
}

/**
 * Büyük harita için sütun aralığı / zoom.
 * Hop kapanınca lg sütun düzenine döner.
 */
export function mapLayoutForDepth(visibleMaxHop: number): MapLayout {
  if (visibleMaxHop <= 1) {
    return {
      size: 'lg',
      nodeW: 320,
      colGap: 380,
      rowGap: 132,
      tipChars: 56,
      minZoom: 0.62,
      maxZoom: 1.45,
      fitPadding: 0.14,
    }
  }
  if (visibleMaxHop === 2) {
    return {
      size: 'md',
      nodeW: 280,
      colGap: 330,
      rowGap: 122,
      tipChars: 48,
      minZoom: 0.55,
      maxZoom: 1.35,
      fitPadding: 0.16,
    }
  }
  return {
    size: 'sm',
    nodeW: 244,
    colGap: 290,
    rowGap: 112,
    tipChars: 40,
    minZoom: 0.5,
    maxZoom: 1.25,
    fitPadding: 0.16,
  }
}

/** 2 satırlık node’a sığmama ihtimali → hover kartı göster */
export function mapLabelNeedsTip(
  name: string,
  tipChars: number,
): boolean {
  return name.trim().length > tipChars
}

/** Breadcrumb / dar yerler için sondan kısaltma (ortadan … değil) */
export function compactMapLabel(name: string, maxChars: number): string {
  const raw = name.trim()
  if (!raw || raw.length <= maxChars) return raw
  return `${raw.slice(0, Math.max(8, maxChars - 1))}…`
}
