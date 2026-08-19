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
    /** Halka: daire + ışın etiketi (LTR kartı değil) */
    radialDot?: boolean
    /** 0 = doğu, ekran atan2 (saat yönü) */
    radialAngle?: number
    radialCx?: number
    radialCy?: number
  }
  style?: { width?: number | string; height?: number | string } | null
}

/** Halka daire çapı — kart değil; ok 2. adımda çevreye oturur */
/** Halka daire (görsel); RF kutusu etiket için büyük */
export const RADIAL_DOT_W = 8
export const RADIAL_CENTER_W = 10
export const RADIAL_HIT = 22

/** CSS ile uyumlu daire çapı (kare RF kutusu) */
export function radialNodeHeight(
  kind: string,
  _size?: MapNodeSize,
): number {
  if (kind === 'center') return RADIAL_CENTER_W
  return RADIAL_DOT_W
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
    nodeW: RADIAL_DOT_W,
    colGap: 300,
    rowGap: 112,
    tipChars: 28,
    minZoom: 0.18,
    maxZoom: 1.4,
    fitPadding: 0.18,
  }
}

/** Hop halkası merkez yarıçapı — daire + ışın etiketi sığsın */
export function radialRingCenterRadius(
  hop: number,
  _layout?: MapLayout,
  _centerW = RADIAL_CENTER_W,
  _centerH = RADIAL_CENTER_W,
): number {
  if (hop <= 0) return 0
  const first = 252
  const pitch = 228
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

export type RadialLabelSide = 'east' | 'west' | 'above' | 'below' | 'south'

/** Uzun isim: yatay etiket, merkeze göre dışarı / kutuplarda üst-alt */
export function radialLabelSide(
  angle: number,
  isCenter: boolean,
): RadialLabelSide {
  if (isCenter) return 'south'
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  if (Math.abs(c) >= 0.42) return c >= 0 ? 'east' : 'west'
  return s >= 0 ? 'below' : 'above'
}

/**
 * Daire çevresi: kaynak ışın boyunca dışarı, hedef içeri
 * (merkez kaynakta açı = çocuk açısı → düz spoke).
 */
export function radialSpokeEnds(
  cx: number,
  cy: number,
  source: { x: number; y: number; r: number },
  target: { x: number; y: number; r: number },
): { sx: number; sy: number; tx: number; ty: number } {
  const aT = Math.atan2(target.y - cy, target.x - cx)
  const rS = Math.hypot(source.x - cx, source.y - cy)
  const rT = Math.hypot(target.x - cx, target.y - cy)
  const aS = rS < 12 ? aT : Math.atan2(source.y - cy, source.x - cx)
  const srcR = rS < 12 ? source.r : rS + source.r
  const tgtR = Math.max(source.r + 8, rT - target.r)
  return {
    sx: cx + srcR * Math.cos(aS),
    sy: cy + srcR * Math.sin(aS),
    tx: cx + tgtR * Math.cos(aT),
    ty: cy + tgtR * Math.sin(aT),
  }
}

/**
 * Radial kenar eğrisi — yarıçap boyunca ilerler, açı fan gibi açılır
 * (referans görüntüdeki kavisli dallar).
 */
export function radialEdgeGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  cx: number,
  cy: number,
): { path: string; mx: number; my: number; angle: number } {
  const a2 = Math.atan2(targetY - cy, targetX - cx)
  const r1 = Math.hypot(sourceX - cx, sourceY - cy)
  const r2 = Math.hypot(targetX - cx, targetY - cy)
  const polar = (a: number, r: number) =>
    [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const

  let sa = Math.atan2(sourceY - cy, sourceX - cx)
  let sr = r1
  if (r1 < 24) {
    sr = 0
    sa = a2 - 0.16
  }
  const mid = (sr + r2) / 2
  const [x0, y0] = polar(sa, sr)
  const [c1x, c1y] = polar(sa, mid)
  const [c2x, c2y] = polar(a2, mid)
  const [x3, y3] = polar(a2, r2)
  const t = 0.5
  const u = 1 - t
  const mx =
    u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x3
  const my =
    u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y3
  const dx =
    3 * u * u * (c1x - x0) + 6 * u * t * (c2x - c1x) + 3 * t * t * (x3 - c2x)
  const dy =
    3 * u * u * (c1y - y0) + 6 * u * t * (c2y - c1y) + 3 * t * t * (y3 - c2y)
  return {
    path: `M ${x0},${y0} C ${c1x},${c1y} ${c2x},${c2y} ${x3},${y3}`,
    mx,
    my,
    angle: Math.atan2(dy, dx),
  }
}

export function radialEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  cx: number,
  cy: number,
): string {
  return radialEdgeGeometry(sourceX, sourceY, targetX, targetY, cx, cy).path
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
  const cW = RADIAL_CENTER_W
  const cH = RADIAL_CENTER_W

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
        const box = RADIAL_HIT
        return {
          ...n,
          position: { x: cx - box / 2, y: cy - box / 2 },
          data: { ...n.data, radialDot: true, radialAngle: 0, radialCx: cx, radialCy: cy },
          style: { ...n.style, width: box, height: box },
        }
      }
      return n
    })

  for (const hop of hops) {
    const R = radiusByHop.get(hop) ?? radialRingCenterRadius(hop, layout, cW, cH)
    for (const item of byHop.get(hop) ?? []) {
      const angle = angles.get(item.id) ?? 0
      const box = RADIAL_HIT
      const x = cx + R * Math.cos(angle) - box / 2
      const y = cy + R * Math.sin(angle) - box / 2
      const idx = next.findIndex((n) => n.id === item.id)
      if (idx >= 0) {
        const cur = next[idx]!
        next[idx] = {
          ...cur,
          position: { x, y },
          data: {
            ...cur.data,
            radialDot: true,
            radialAngle: angle,
            radialCx: cx,
            radialCy: cy,
          },
          style: { ...cur.style, width: box, height: box },
        }
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
