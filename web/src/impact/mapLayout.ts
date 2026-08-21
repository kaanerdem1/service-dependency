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

export type RadialLabelSide = 'east' | 'west' | 'above' | 'below' | 'south'

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
    radialLabelSide?: RadialLabelSide
    radialLabelGapBoost?: number
  }
  style?: { width?: number | string; height?: number | string } | null
}

/** Halka daire çapı — kart değil; ok 2. adımda çevreye oturur */
/** Halka daire (görsel); RF kutusu etiket için büyük */
export const RADIAL_DOT_W = 8
export const RADIAL_CENTER_W = 48
export const RADIAL_HIT = 22
export const RADIAL_CENTER_HIT = 48

/** Görsel daire yarıçapı — HTML prototip: merkez 24, 1. katman 9 */
export const RADIAL_DOT_R = 9
export const RADIAL_CENTER_DOT_R = 24
/** Ok, nokta kenarından bu kadar önce biter */
export const RADIAL_EDGE_END_GAP = 6

function radialDotRadius(isCenter: boolean): number {
  return isCenter ? RADIAL_CENTER_DOT_R : RADIAL_DOT_R
}

/** RF kutusunun geometrik merkezi (etiket/ok bu noktaya göre) */
export function radialAnchorOffset(isCenter: boolean): { x: number; y: number } {
  const box = isCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
  return { x: box / 2, y: box / 2 }
}

/** Merkez daire kenarı + 2px (ok buradan çıkar) */
export function radialCenterSpokeR(_angle?: number): number {
  return RADIAL_CENTER_DOT_R + 2
}

/** CSS ile uyumlu daire çapı (kare RF kutusu) */
export function radialNodeHeight(
  kind: string,
  _size?: MapNodeSize,
): number {
  if (kind === 'center') return RADIAL_CENTER_HIT
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
    minZoom: 0.45,
    maxZoom: 1.4,
    fitPadding: 0.22,
  }
}

const RADIAL_LABEL_MAX_W = 168
const RADIAL_LABEL_CHAR_W = 6.7
const RADIAL_LABEL_LINE_H = 15
export const RADIAL_LABEL_GAP = 18

function radialLabelGap(
  side: RadialLabelSide,
  isCenter: boolean,
  lineCount: number,
  boost = 0,
  hop = 1,
): number {
  let gap = RADIAL_LABEL_GAP + boost
  if (lineCount >= 3) gap += 6
  if (side === 'west') {
    gap += 10
    if (hop >= 2) gap += 10
    if (hop >= 3) gap += 16
  } else if (side === 'east') {
    gap += 3
    if (hop >= 3) gap += 4
  }
  return radialDotRadius(isCenter) + gap
}

export function wrapRadialName(name: string, maxLen = 24): string[] {
  const parts = name.trim().split('_').filter(Boolean)
  if (parts.length <= 1) {
    const t = name.trim() || '·'
    if (t.length <= maxLen) return [t]
    const lines: string[] = []
    for (let i = 0; i < t.length && lines.length < 4; i += maxLen) {
      lines.push(t.slice(i, i + maxLen))
    }
    return lines
  }
  const lines: string[] = []
  let cur = ''
  for (const p of parts) {
    const candidate = cur ? `${cur}_${p}` : p
    if (candidate.length > maxLen && cur) {
      lines.push(cur)
      cur = p
    } else cur = candidate
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 4)
}

export function radialLabelMetrics(
  name: string,
  isCenter: boolean,
  hopLine?: string | null,
): {
  w: number
  h: number
} {
  const lines = wrapRadialName(name)
  const hopH = hopLine ? 13 : 0
  const w = Math.min(
    RADIAL_LABEL_MAX_W,
    Math.max(28, ...lines.map((l) => l.length * RADIAL_LABEL_CHAR_W)),
  )
  const h = hopH + (isCenter ? 12 : 0) + lines.length * RADIAL_LABEL_LINE_H
  return { w, h }
}

export function radialLabelBox(
  cx: number,
  cy: number,
  side: RadialLabelSide,
  name: string,
  isCenter: boolean,
  hopLine?: string | null,
  gapBoost = 0,
  hop = 1,
): { x: number; y: number; w: number; h: number } {
  const hopH = hopLine ? 13 : 0
  const lines = wrapRadialName(name)
  const { w, h } = radialLabelMetrics(name, isCenter, hopLine)
  const g = radialLabelGap(side, isCenter, lines.length, gapBoost, hop)
  if (side === 'east') {
    return { x: cx + g, y: cy - hopH, w, h }
  }
  if (side === 'west') {
    return { x: cx - g - w, y: cy - hopH, w, h }
  }
  if (side === 'above') {
    return { x: cx - w / 2, y: cy - g - h, w, h }
  }
  return { x: cx - w / 2, y: cy + g, w, h }
}

/** Nokta merkezinden etiket başlangıcına mesafe (dotR + gap) */
export function radialLabelOffset(isCenter: boolean): number {
  return radialDotRadius(isCenter) + RADIAL_LABEL_GAP
}

export type RadialLabelPlacementStyle = {
  left?: number | string
  right?: number | string
  top?: number | string
  bottom?: number | string
  transform?: string
  textAlign?: 'left' | 'right' | 'center'
  alignItems?: 'flex-start' | 'flex-end' | 'center'
}

/** radialLabelBox ile aynı gap — DOM'da doğrudan uygulanır */
export function radialLabelDomStyle(
  side: RadialLabelSide,
  name: string,
  isCenter: boolean,
  hopLine?: string | null,
  gapBoost = 0,
  hop = 1,
): RadialLabelPlacementStyle {
  const half = (isCenter ? RADIAL_CENTER_HIT : RADIAL_HIT) / 2
  const lines = wrapRadialName(name)
  const g = radialLabelGap(side, isCenter, lines.length, gapBoost, hop)
  const hopH = hopLine ? 13 : 0
  const textH = Math.max(RADIAL_LABEL_LINE_H, lines.length * RADIAL_LABEL_LINE_H)
  const blockH = hopH + textH

  switch (side) {
    case 'east':
      return {
        left: half + g,
        top: half - hopH,
        transform: 'none',
        textAlign: 'left',
        alignItems: 'flex-start',
      }
    case 'west':
      return {
        right: half + g,
        left: 'auto',
        top: half - hopH,
        transform: 'none',
        textAlign: 'right',
        alignItems: 'flex-end',
      }
    case 'above':
      return {
        left: half,
        top: half - g - blockH,
        transform: 'translateX(-50%)',
        textAlign: 'center',
        alignItems: 'center',
      }
    case 'below':
    case 'south':
    default:
      return {
        left: half,
        top: half + g,
        transform: 'translateX(-50%)',
        textAlign: 'center',
        alignItems: 'center',
      }
  }
}

/** @deprecated radialLabelDomStyle kullan */
export function radialLabelPlacementStyle(
  side: RadialLabelSide,
  isCenter: boolean,
): RadialLabelPlacementStyle {
  return radialLabelDomStyle(side, '', isCenter, null)
}

export function radialNodeHitStyle(isCenter: boolean): {
  width: number
  height: number
} {
  const box = isCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
  return { width: box, height: box }
}

export type RadialBoundsItem = {
  cx: number
  cy: number
  angle: number
  name: string
  kind: string
  side?: RadialLabelSide
}

/** Radial düğüm + ışın etiketi sınır kutusu */
export function radialGraphBounds(items: RadialBoundsItem[]): {
  x: number
  y: number
  width: number
  height: number
} | null {
  if (!items.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const half = RADIAL_HIT / 2
  for (const it of items) {
    const isCenter = it.kind === 'center'
    const side = it.side ?? radialLabelSide(it.angle, isCenter)
    const boxes = isCenter
      ? [
          {
            x: it.cx - RADIAL_CENTER_HIT / 2,
            y: it.cy - RADIAL_CENTER_HIT / 2,
            w: RADIAL_CENTER_HIT,
            h: RADIAL_CENTER_HIT,
          },
          radialLabelBox(it.cx, it.cy, 'below', it.name, true),
        ]
      : [
          { x: it.cx - half, y: it.cy - half, w: RADIAL_HIT, h: RADIAL_HIT },
          radialLabelBox(it.cx, it.cy, side, it.name, isCenter),
        ]
    for (const b of boxes) {
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Merkez ekran ortasında; zoom tüm etiketleri sığdırır (RF padding = bounds çarpanı) */
export function radialViewportForCenter(
  bounds: { x: number; y: number; width: number; height: number },
  center: { cx: number; cy: number },
  paneW: number,
  paneH: number,
  opts: {
    minZoom: number
    maxZoom: number
    padding: number
    fullscreen?: boolean
  },
): { x: number; y: number; zoom: number } {
  const pad = Math.max(0.06, opts.padding)
  const safeW = Math.max(bounds.width, 80)
  const safeH = Math.max(bounds.height, 80)
  let zoom = Math.min(
    paneW / (safeW * (1 + pad)),
    paneH / (safeH * (1 + pad)),
    opts.maxZoom,
  )
  zoom = Math.max(zoom, opts.minZoom)

  if (opts.fullscreen && paneW > paneH * 1.15) {
    const fillZoom = (paneW * 0.9) / (safeW * (1 + pad * 0.55))
    zoom = Math.min(opts.maxZoom, Math.max(zoom, fillZoom))
  }

  let x = paneW / 2 - center.cx * zoom
  let y = paneH / 2 - center.cy * zoom

  const marginX = Math.max(40, paneW * 0.035)
  const marginTop = Math.max(36, paneH * 0.05)
  const marginBottom = Math.max(88, paneH * 0.11)

  const corners: [number, number][] = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ]
  for (let i = 0; i < 5; i++) {
    let ok = true
    for (const [fx, fy] of corners) {
      const sx = fx * zoom + x
      const sy = fy * zoom + y
      if (
        sx < marginX ||
        sx > paneW - marginX ||
        sy < marginTop ||
        sy > paneH - marginBottom
      ) {
        ok = false
        break
      }
    }
    if (ok) break
    zoom = Math.max(opts.minZoom, zoom * 0.94)
    x = paneW / 2 - center.cx * zoom
    y = paneH / 2 - center.cy * zoom
  }

  return { x, y, zoom }
}

export type RadialViewportHint = {
  width: number
  height: number
  fullscreen?: boolean
}

/** Geniş ekranda yatay elips; tam ekranda halkaları büyüt */
export function radialLayoutProfile(hint: RadialViewportHint): {
  stretchX: number
  stretchY: number
  radiusScale: number
  compactOrigin: boolean
} {
  const w = Math.max(hint.width, 320)
  const h = Math.max(hint.height, 240)
  const aspect = w / h
  const fullscreen = Boolean(hint.fullscreen)

  /** Elips dikeyi ezmesin — halkalar çakışır. Geniş ekranda hafif yatay aç. */
  const stretchX =
    aspect > 1.18 ? 1 + Math.min(fullscreen ? 0.22 : 0.1, (aspect - 1.18) * 0.28) : 1
  const stretchY = 1
  const radiusScale = fullscreen ? 1.08 : 1

  return {
    stretchX,
    stretchY,
    radiusScale,
    compactOrigin: fullscreen,
  }
}

export function radialMaxZoom(
  layout: MapLayout,
  fullscreen: boolean,
  aspect: number,
): number {
  if (!fullscreen) return layout.maxZoom
  return Math.min(2.5, layout.maxZoom + 0.55 + Math.min(0.45, Math.max(0, aspect - 1) * 0.35))
}

function rectsHit(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  )
}

/** Çakışan halka etiketleri — merkez ve düşük hop öncelikli; gizlenenler hover’da */
export function occludedRadialLabelIds(
  items: {
    id: string
    hop: number
    kind: string
    cx: number
    cy: number
    angle: number
    name: string
    side?: RadialLabelSide
  }[],
): Set<string> {
  const hidden = new Set<string>()
  const kept: { x: number; y: number; w: number; h: number }[] = []
  for (const it of items) {
    const dotR = radialDotRadius(it.kind === 'center')
    const d = dotR * 2 + 4
    kept.push({ x: it.cx - d / 2, y: it.cy - d / 2, w: d, h: d })
  }
  const ranked = [...items].sort((a, b) => {
    const pa = a.kind === 'center' ? -1 : a.hop
    const pb = b.kind === 'center' ? -1 : b.hop
    if (pa !== pb) return pa - pb
    return a.name.length - b.name.length
  })
  for (const it of ranked) {
    const isCenter = it.kind === 'center'
    const side = it.side ?? radialLabelSide(it.angle, isCenter)
    const box = radialLabelBox(it.cx, it.cy, side, it.name, isCenter)
    if (isCenter) {
      kept.push(box)
      continue
    }
    const hit = kept.some((k) => rectsHit(box, k, 5))
    if (hit) hidden.add(it.id)
    else kept.push(box)
  }
  return hidden
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

function _nodeWidth(n: RadialLayoutNode, layout: MapLayout): number {
  return typeof n.style?.width === 'number' ? n.style.width : layout.nodeW
}
void _nodeWidth

/**
 * Radial açı: 1. halka tam daireye eşit aralık (Datadog / Eades);
 * daha derin halkalar ebeveyn diliminde eşit aralık — çapraz kenar yok.
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

  const pad = 0.08
  const place = (parentId: string, a0: number, a1: number, depth: number) => {
    const kids = childrenOf.get(parentId) ?? []
    if (!kids.length) return
    const span = a1 - a0
    const inner = depth === 0 ? 0 : Math.min(span * pad, 0.18)
    const usable = Math.max(0.2, span - inner * 2)
    const step = usable / kids.length
    kids.forEach((kid, i) => {
      const k0 = a0 + inner + i * step
      const k1 = k0 + step
      angles.set(kid, (k0 + k1) / 2)
      place(kid, k0, k1, depth + 1)
    })
  }

  place(centerId, Math.PI / 2 + 0.42, Math.PI / 2 + Math.PI * 2 - 0.42, 0)
  return angles
}

function angDist(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = Math.PI * 2 - d
  return d
}

/** Etiketin teğet (halka boyunca) ve ışın (yarıçap) boyutu */
function radialSlotSize(name: string, angle: number, isCenter: boolean): {
  tangent: number
  radial: number
} {
  const { w, h } = radialLabelMetrics(name, isCenter)
  const side = radialLabelSide(angle, isCenter)
  const gap = RADIAL_LABEL_GAP + radialDotRadius(isCenter)
  if (side === 'east' || side === 'west') {
    return { tangent: h + 10, radial: w + gap + 8 }
  }
  return { tangent: w + 12, radial: h + gap + 8 }
}

/**
 * ELK radial overlap-removal: halkayı komşu kutular sığana kadar büyüt.
 * https://eclipse.dev/elk/reference/algorithms/org.eclipse.elk.radial.html
 */
function packRadialRingRadii(
  hops: number[],
  byHop: Map<number, { id: string; name: string }[]>,
  angles: Map<string, number>,
  radiusScale: number,
): Map<number, number> {
  const radiusByHop = new Map<number, number>()
  let prevR = 0
  let prevRadial = 36
  for (const hop of hops) {
    const items = (byHop.get(hop) ?? [])
      .map((n) => ({
        ...n,
        angle: angles.get(n.id) ?? 0,
      }))
      .sort((a, b) => a.angle - b.angle)
    let rNeed = 140 * radiusScale
    if (items.length >= 2) {
      for (let i = 0; i < items.length; i++) {
        const a = items[i]!
        const b = items[(i + 1) % items.length]!
        const d = Math.max(angDist(a.angle, b.angle), 0.1)
        const ta = radialSlotSize(a.name, a.angle, false).tangent
        const tb = radialSlotSize(b.name, b.angle, false).tangent
        const half = (ta + tb) / 2 + 28
        rNeed = Math.max(rNeed, half / Math.sin(Math.min(Math.PI / 2, d / 2)))
      }
    } else if (items.length === 1) {
      rNeed = Math.max(rNeed, 180 * radiusScale)
    }
    const thisRadial = Math.max(
      ...items.map((n) => radialSlotSize(n.name, n.angle, false).radial),
      48,
    )
    const fromPrev = prevR + prevRadial + thisRadial + 36
    const hop1Floor =
      hop === hops[0] ? Math.max(240 * radiusScale, 36 * Math.max(items.length, 1)) : 0
    const R = Math.max(rNeed, fromPrev, hop1Floor)
    radiusByHop.set(hop, R)
    prevR = R
    prevRadial = thisRadial
  }
  return radiusByHop
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

/** Ok ışınına göre sağ / sol / üst / alt — referans radial.md */
export function radialLabelSidePrefs(
  angle: number,
  isCenter: boolean,
): RadialLabelSide[] {
  if (isCenter) return ['below', 'above', 'east', 'west']
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  if (c > 0.35) return ['east', 'below', 'above', 'west']
  if (c < -0.35) {
    // Sol yarım: east etiketi merkeze doğru biner — asla kullanma
    return s < 0
      ? ['west', 'above', 'below']
      : ['west', 'below', 'above']
  }
  if (s >= 0) return ['below', 'east', 'west', 'above']
  return ['above', 'east', 'west', 'below']
}

export function radialLabelSide(
  angle: number,
  isCenter: boolean,
): RadialLabelSide {
  return radialLabelSidePrefs(angle, isCenter)[0] ?? 'east'
}

function pointInRect(
  x: number,
  y: number,
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function segHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  b: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  const r = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 8) return false
  const t0 = Math.min(0.22, 14 / len)
  const t1 = 1 - t0
  const ax = x1 + dx * t0
  const ay = y1 + dy * t0
  const bx = x1 + dx * t1
  const by = y1 + dy * t1
  if (pointInRect(ax, ay, r) || pointInRect(bx, by, r)) return true
  const corners: [number, number][] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
    [r.x, r.y],
  ]
  for (let i = 0; i < 4; i++) {
    const [cx1, cy1] = corners[i]!
    const [cx2, cy2] = corners[i + 1]!
    if (segmentsCross(ax, ay, bx, by, cx1, cy1, cx2, cy2)) return true
  }
  return false
}

function radialQuadControl(
  x0: number,
  y0: number,
  x3: number,
  y3: number,
): { c1x: number; c1y: number } {
  const dx = x3 - x0
  const dy = y3 - y0
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const mxq = (x0 + x3) / 2
  const myq = (y0 + y3) / 2
  const bow = dist * 0.09
  return { c1x: mxq + -uy * bow, c1y: myq + ux * bow }
}

function quadPoint(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  x3: number,
  y3: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * x0 + 2 * u * t * c1x + t * t * x3,
    y: u * u * y0 + 2 * u * t * c1y + t * t * y3,
  }
}

/** radialEdgeGeometry ile aynı quadratic eğri — label kutusuna değer mi? */
function quadBezierHitsRect(
  x0: number,
  y0: number,
  x3: number,
  y3: number,
  b: { x: number; y: number; w: number; h: number },
  pad: number,
  segments = 14,
): boolean {
  const { c1x, c1y } = radialQuadControl(x0, y0, x3, y3)
  let px = x0
  let py = y0
  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const { x, y } = quadPoint(x0, y0, c1x, c1y, x3, y3, t)
    if (segHitsRect(px, py, x, y, b, pad)) return true
    px = x
    py = y
  }
  return false
}

function segmentsCross(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
): boolean {
  const d = (a2x - a1x) * (b2y - b1y) - (a2y - a1y) * (b2x - b1x)
  if (Math.abs(d) < 1e-8) return false
  const t = ((b1x - a1x) * (b2y - b1y) - (b1y - a1y) * (b2x - b1x)) / d
  const u = ((b1x - a1x) * (a2y - a1y) - (b1y - a1y) * (a2x - a1x)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function placeRadialLabels<T extends RadialLayoutNode>(
  nodes: T[],
  opts: {
    centerId: string
    leftPadId: string
    treeParent?: Map<string, string>
  },
): T[] {
  type Item = {
    id: string
    hop: number
    kind: string
    cx: number
    cy: number
    angle: number
    name: string
    isCenter: boolean
  }
  const items: Item[] = []
  const pos = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    if (n.id === opts.leftPadId || n.id.startsWith('__')) continue
    const d = n.data
    if (!d.radialDot) continue
    const isCenter = n.id === opts.centerId || d.kind === 'center'
    const mid = radialAnchorOffset(isCenter)
    const cx = n.position.x + mid.x
    const cy = n.position.y + mid.y
    pos.set(n.id, { x: cx, y: cy })
    items.push({
      id: n.id,
      hop: isCenter ? 0 : Math.max(1, d.hop || 1),
      kind: d.kind,
      cx,
      cy,
      angle: d.radialAngle ?? 0,
      name: String(d.fullLabel ?? d.label ?? n.id),
      isCenter,
    })
  }

  const edges: { a: string; b: string }[] = []
  for (const it of items) {
    if (it.isCenter) continue
    const parent = opts.treeParent?.get(it.id) ?? opts.centerId
    if (pos.has(parent)) edges.push({ a: parent, b: it.id })
  }

  const dots = items.map((it) =>
    it.isCenter
      ? {
          id: it.id,
          x: it.cx - RADIAL_CENTER_HIT / 2,
          y: it.cy - RADIAL_CENTER_HIT / 2,
          w: RADIAL_CENTER_HIT,
          h: RADIAL_CENTER_HIT,
        }
      : {
          id: it.id,
          x: it.cx - 8,
          y: it.cy - 8,
          w: 16,
          h: 16,
        },
  )

  items.sort((a, b) => a.hop - b.hop || a.angle - b.angle)
  const chosen = new Map<string, RadialLabelSide>()
  const chosenBoost = new Map<string, number>()
  const centerIt = items.find((it) => it.isCenter)
  const isCenterById = new Map(items.map((it) => [it.id, it.isCenter]))
  const labelBoxes: { id: string; box: { x: number; y: number; w: number; h: number } }[] =
    centerIt
      ? [
          {
            id: centerIt.id,
            box: {
              x: centerIt.cx - RADIAL_CENTER_HIT / 2,
              y: centerIt.cy - RADIAL_CENTER_HIT / 2,
              w: RADIAL_CENTER_HIT,
              h: RADIAL_CENTER_HIT,
            },
          },
        ]
      : []

  const radialEdgeHitsLabelBox = (
    e: { a: string; b: string },
    box: { x: number; y: number; w: number; h: number },
    pad: number,
  ): boolean => {
    const pa = pos.get(e.a)
    const pb = pos.get(e.b)
    if (!pa || !pb) return false
    const ra = radialDotRadius(isCenterById.get(e.a) ?? false)
    const rb = radialDotRadius(isCenterById.get(e.b) ?? false)
    const ends = radialSpokeEnds(
      centerIt?.cx ?? 0,
      centerIt?.cy ?? 0,
      { x: pa.x, y: pa.y, r: ra },
      { x: pb.x, y: pb.y, r: rb },
    )
    return quadBezierHitsRect(ends.sx, ends.sy, ends.tx, ends.ty, box, pad)
  }

  for (const it of items) {
    if (it.isCenter) continue
    const hop = it.hop
    const hopLine = `${hop}. katman`
    const isLeft = Math.cos(it.angle) < -0.35
    let prefs = radialLabelSidePrefs(it.angle, it.isCenter)
    if (hop >= 2 && Math.cos(it.angle) < -0.3) {
      prefs = [
        'west',
        ...prefs.filter((p) => p !== 'west' && p !== 'east'),
      ] as RadialLabelSide[]
    }
    let side = prefs[0] ?? 'west'
    let gapBoost = 0
    outer: for (let pass = 0; pass < 3; pass++) {
      gapBoost = pass === 0 ? 0 : pass === 1 ? 10 : 18
      const tryPrefs =
        pass === 2 && isLeft
          ? (['west', ...prefs.filter((p) => p !== 'west')] as RadialLabelSide[])
          : prefs
      for (const cand of tryPrefs) {
        const box = radialLabelBox(
          it.cx,
          it.cy,
          cand,
          it.name,
          it.isCenter,
          hopLine,
          gapBoost,
          hop,
        )
        const hitLabel = labelBoxes.some(
          (k) => k.id !== it.id && rectsHit(box, k.box, 6),
        )
        if (hitLabel) continue
        const hitDot = dots.some(
          (dot) => dot.id !== it.id && rectsHit(box, dot, 4),
        )
        if (hitDot) continue
        const hitEdge = edges.some((e) => radialEdgeHitsLabelBox(e, box, 5))
        if (hitEdge) continue
        side = cand
        gapBoost = pass === 0 ? 0 : pass === 1 ? 10 : 18
        labelBoxes.push({
          id: it.id,
          box: radialLabelBox(
            it.cx,
            it.cy,
            side,
            it.name,
            it.isCenter,
            hopLine,
            gapBoost,
            hop,
          ),
        })
        chosen.set(it.id, side)
        chosenBoost.set(it.id, gapBoost)
        break outer
      }
    }
    if (!chosen.has(it.id)) {
      chosen.set(it.id, side)
      chosenBoost.set(it.id, 0)
      labelBoxes.push({
        id: it.id,
        box: radialLabelBox(it.cx, it.cy, side, it.name, it.isCenter, hopLine, 0, hop),
      })
    }
  }

  return nodes.map((n) => {
    const side = chosen.get(n.id)
    if (!side) return n
    return {
      ...n,
      data: {
        ...n.data,
        radialLabelSide: side,
        radialLabelGapBoost: chosenBoost.get(n.id) ?? 0,
      },
    }
  })
}

/**
 * Daire çevresi: kaynak ışın boyunca dışarı, hedef içeri
 * (merkez kaynakta açı = çocuk açısı → düz spoke).
 */
export function radialSpokeEnds(
  _cx: number,
  _cy: number,
  source: { x: number; y: number; r: number },
  target: { x: number; y: number; r: number },
): { sx: number; sy: number; tx: number; ty: number } {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  return {
    sx: source.x + ux * (source.r + 2),
    sy: source.y + uy * (source.r + 2),
    tx: target.x - ux * (target.r + RADIAL_EDGE_END_GAP),
    ty: target.y - uy * (target.r + RADIAL_EDGE_END_GAP),
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
  _cx: number,
  _cy: number,
): { path: string; mx: number; my: number; angle: number } {
  const x0 = sourceX
  const y0 = sourceY
  const x3 = targetX
  const y3 = targetY
  const { c1x, c1y } = radialQuadControl(x0, y0, x3, y3)
  const t = 0.5
  const u = 1 - t
  const mx = u * u * x0 + 2 * u * t * c1x + t * t * x3
  const my = u * u * y0 + 2 * u * t * c1y + t * t * y3
  return {
    path: `M ${x0},${y0} Q ${c1x},${c1y} ${x3},${y3}`,
    mx,
    my,
    angle: Math.atan2(y3 - y0, x3 - x0),
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
    viewport?: RadialViewportHint
  },
): RadialLayoutResult<T> {
  const {
    centerId,
    leftPadId = '__map-left-pad',
    originX = mapLeftX(),
    treeParent,
    viewport,
  } = options
  const profile = radialLayoutProfile(
    viewport ?? { width: 960, height: 640, fullscreen: false },
  )
  const { stretchX, stretchY, radiusScale, compactOrigin } = profile
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

  const hopNames = new Map<number, { id: string; name: string }[]>()
  for (const hop of hops) {
    hopNames.set(
      hop,
      (byHop.get(hop) ?? []).map((n) => ({
        id: n.id,
        name: String(n.data.fullLabel ?? n.data.label ?? n.id),
      })),
    )
  }

  const radiusByHop = packRadialRingRadii(hops, hopNames, angles, radiusScale)
  const rings: { hop: number; radius: number }[] = hops.map((hop) => ({
    hop,
    radius: radiusByHop.get(hop) ?? 0,
  }))
  let maxCenterDist = 0
  for (const r of rings) maxCenterDist = Math.max(maxCenterDist, r.radius)

  const labelPad = compactOrigin ? 96 : 56
  const maxRx = maxCenterDist * stretchX
  const maxRy = maxCenterDist * stretchY
  const cx = compactOrigin ? maxRx + labelPad : originX + maxRx + 24
  const cy = maxRy + (compactOrigin ? 52 : 72)

  const next: T[] = nodes
    .filter((n) => !n.id.startsWith('__ring-'))
    .map((n) => {
      if (n.id === leftPadId) {
        return { ...n, position: { x: 0, y: cy - 12 } }
      }
      if (n.id === centerId) {
        const w = RADIAL_CENTER_HIT
        const h = RADIAL_CENTER_HIT
        return {
          ...n,
          position: { x: cx - w / 2, y: cy - h / 2 },
          data: { ...n.data, radialDot: true, radialAngle: 0, radialCx: cx, radialCy: cy },
          style: { ...n.style, width: w, height: h },
        }
      }
      return n
    })

  for (const hop of hops) {
    const R = radiusByHop.get(hop) ?? radialRingCenterRadius(hop, layout)
    for (const item of byHop.get(hop) ?? []) {
      const angle = angles.get(item.id) ?? 0
      const box = RADIAL_HIT
      const x = cx + R * stretchX * Math.cos(angle) - box / 2
      const y = cy + R * stretchY * Math.sin(angle) - box / 2
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

  const bumpUntilClear = () => {
    type Box = {
      id: string
      hop: number
      box: { x: number; y: number; w: number; h: number }
    }
    const boxes: Box[] = []
    for (const n of next) {
      if (n.id === leftPadId || n.id.startsWith('__')) continue
      const d = n.data
      if (!d.radialDot) continue
      const isCenter = n.id === centerId
      const mid = radialAnchorOffset(isCenter)
      const px = n.position.x + mid.x
      const py = n.position.y + mid.y
      const ang = d.radialAngle ?? 0
      const name = String(d.fullLabel ?? d.label ?? n.id)
      boxes.push({
        id: n.id,
        hop: isCenter ? 0 : Math.max(1, d.hop || 1),
        box: isCenter
          ? {
              x: px - RADIAL_CENTER_HIT / 2,
              y: py - RADIAL_CENTER_HIT / 2,
              w: RADIAL_CENTER_HIT,
              h: RADIAL_CENTER_HIT,
            }
          : radialLabelBox(px, py, radialLabelSide(ang, isCenter), name, isCenter),
      })
    }
    let hitHop = 0
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (!rectsHit(boxes[i]!.box, boxes[j]!.box, 8)) continue
        hitHop = Math.max(hitHop, boxes[i]!.hop, boxes[j]!.hop)
      }
    }
    return hitHop
  }

  const placeHop = (hop: number, R: number) => {
    radiusByHop.set(hop, R)
    const ring = rings.find((x) => x.hop === hop)
    if (ring) ring.radius = R
    maxCenterDist = Math.max(maxCenterDist, R)
    const box = RADIAL_HIT
    for (const item of byHop.get(hop) ?? []) {
      const angle = angles.get(item.id) ?? 0
      const idx = next.findIndex((n) => n.id === item.id)
      if (idx < 0) continue
      next[idx] = {
        ...next[idx]!,
        position: {
          x: cx + R * stretchX * Math.cos(angle) - box / 2,
          y: cy + R * stretchY * Math.sin(angle) - box / 2,
        },
      }
    }
  }

  for (let iter = 0; iter < 8; iter++) {
    const hop = bumpUntilClear()
    if (!hop) break
    placeHop(hop, (radiusByHop.get(hop) ?? 0) + 52)
    let prev = 0
    for (const h of hops) {
      const need = h === hops[0] ? 0 : prev + 88
      const r = Math.max(radiusByHop.get(h) ?? 0, need)
      if (r !== radiusByHop.get(h)) placeHop(h, r)
      prev = r
    }
  }

  return {
    nodes: placeRadialLabels(next, {
      centerId,
      leftPadId,
      treeParent,
    }),
    rings,
    cx,
    cy,
  }
}

export function mapLeftX(): number {
  return 48
}

/** fitView kenar boşluğu */
export function fitViewPaddingForLayout(layout: MapLayout): number {
  return layout.fitPadding + 0.05
}

export type FitChromeOpts = {
  drawerOpen?: boolean
  radial?: boolean
  fullscreen?: boolean
}

/** Drawer + alt dock için fitView padding (tek sayı — React Flow sınırı) */
export function fitViewPaddingForChrome(
  layout: MapLayout,
  opts?: FitChromeOpts,
): number {
  let p = layout.fitPadding + 0.05 + 0.08
  if (opts?.drawerOpen) p += 0.14
  else p += 0.07
  if (opts?.radial) p += opts.fullscreen ? 0.02 : 0.06
  if (opts?.radial && opts?.fullscreen) p = Math.max(0.08, p - 0.14)
  return p
}

export function mapNodeWidth(size: MapNodeSize): number {
  if (size === 'lg') return 344
  if (size === 'md') return 300
  return 260
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
      nodeW: 344,
      colGap: 400,
      rowGap: 140,
      tipChars: 56,
      minZoom: 0.62,
      maxZoom: 1.45,
      fitPadding: 0.14,
    }
  }
  if (visibleMaxHop === 2) {
    return {
      size: 'md',
      nodeW: 300,
      colGap: 350,
      rowGap: 128,
      tipChars: 48,
      minZoom: 0.55,
      maxZoom: 1.35,
      fitPadding: 0.16,
    }
  }
  return {
    size: 'sm',
    nodeW: 260,
    colGap: 310,
    rowGap: 118,
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
