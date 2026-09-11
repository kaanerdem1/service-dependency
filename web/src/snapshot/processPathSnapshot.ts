import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { getNodesBounds, type Node } from 'reactflow'
import type { ProcessFlowNodeKind } from '../types'
import turkishRegularUrl from '../assets/fonts/OpenSans-Regular.ttf?url'
import turkishBoldUrl from '../assets/fonts/OpenSans-Bold.ttf?url'

export type ProcessPathSnapshotStep = {
  id: string
  name: string
  kind: ProcessFlowNodeKind
  /** Bu adımdan bir sonraki adıma geçiş etiketi (varsa). */
  label?: string
}

const KIND_LABEL_TR: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  subprocess: 'Alt süreç',
  dummy: 'Adım',
  other: 'Adım',
}

/**
 * Snapshot'ın altında bulunacak, PDF'ten ayrık, düz/serileştirilebilir veri.
 * Bilinçli olarak PDF'e bağımlı değil — ileride "Kendi Senaryonu Oluştur"
 * (iş akışı/senaryo) özelliği geldiğinde, aynı veri bir akış adımına
 * kanıt/ek olarak eklenebilsin diye ayrı tutuldu.
 */
export function buildProcessPathSnapshotData(opts: {
  processNo: string
  processTitle: string
  targetNodeId: string
  targetName: string
  steps: ProcessPathSnapshotStep[]
}) {
  return {
    processNo: opts.processNo,
    processTitle: opts.processTitle,
    targetNodeId: opts.targetNodeId,
    targetName: opts.targetName,
    capturedAt: new Date().toISOString(),
    steps: opts.steps,
  }
}

export type ProcessPathSnapshotData = ReturnType<typeof buildProcessPathSnapshotData>

function sanitizeFilenamePart(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

// jsPDF'in varsayılan `helvetica` fontu WinAnsi kodlamasını kullanır; bu
// kodlamada ş/ğ/ı/İ karakterleri YOK (ç/ö/ü/Ç/Ö/Ü var). Türkçe metnin
// PDF'te doğru görünmesi için Latin Extended-A (Türkçe) kapsayan bir TTF
// gömülüyor. NOT: jsPDF'in kendi TTF/cmap çözümleyicisi, DejaVu Sans gibi
// çok-yazı-sistemli/dev fontlarda (binlerce glif, seyrek/segment tabanlı
// cmap) bazı Latin Extended-A karakterleri için YANLIŞ glif id'si
// üretiyor (bilinen bir jsPDF sınırlaması). Open Sans gibi sade/tek yazı
// sistemli bir font bu sorunu yaşamıyor — bu yüzden onu kullanıyoruz.
// Yalnızca bu export tetiklendiğinde, tek sefer indirilip base64'e
// çevrilip cache'leniyor (ana bundle'ı şişirmiyor).
let turkishFontPromise: Promise<{ regular: string; bold: string }> | null = null

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function loadTurkishFonts(): Promise<{ regular: string; bold: string }> {
  if (!turkishFontPromise) {
    turkishFontPromise = (async () => {
      const [regularBuf, boldBuf] = await Promise.all([
        fetch(turkishRegularUrl).then((r) => r.arrayBuffer()),
        fetch(turkishBoldUrl).then((r) => r.arrayBuffer()),
      ])
      const [regular, bold] = await Promise.all([
        arrayBufferToBase64(regularBuf),
        arrayBufferToBase64(boldBuf),
      ])
      return { regular, bold }
    })()
  }
  return turkishFontPromise
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
}

// React Flow kenar id'leri iç mantıkta ayraç olarak `\u0000` (NUL)
// kullanıyor (bkz. sinkCopy/route eşleme anahtarları). Bu, DOM'da gerçek
// `id`/`aria-*` özniteliği olarak kalıyor — XML 1.0'da NUL (ve diğer C0
// kontrol karakterleri) hiçbir öznitelik değerinde GEÇERLİ DEĞİL. html-to-
// image, DOM'u SVG+foreignObject olarak XML'e serileştirdiğinde bu tek
// karakter yüzünden üretilen SVG bozuk oluyor ve <img> asla yüklenmiyor —
// boyuttan bağımsız (kısa yollarda da aynı hata). Çözüm: yakalamadan önce
// bu karakterleri geçici olarak temizle, sonra ORİJİNALE geri yükle.
// eslint-disable-next-line no-control-regex -- kasıtlı: XML 1.0'da geçersiz kontrol karakterlerini yakalıyoruz
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function sanitizeAttributesForXml(root: HTMLElement): Array<() => void> {
  const restores: Array<() => void> = []
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (!XML_INVALID_CHARS.test(attr.value)) continue
      const name = attr.name
      const prev = attr.value
      el.setAttribute(name, prev.replace(XML_INVALID_CHARS, '_'))
      restores.push(() => el.setAttribute(name, prev))
    }
  })
  return restores
}

function waitPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/** ProcessFlowMap sink-copy düğümleri `\0` ile gerçek id'yi taşır. */
function sinkCopyRealId(id: string): string {
  const i = id.indexOf('\0')
  return i >= 0 ? id.slice(0, i) : id
}

const SNAKE_MAX_ROW_WIDTH = 1500
/** Karar-karar yatay aralığı (ProcessFlowMap RANK_SEP) — tüm düğüm tipleri aynı slotta. */
const SNAKE_SLOT = 250
/** Satır başına en fazla düğüm — sığmazsa daha erken alt satıra iner. */
const SNAKE_MAX_SLOTS_PER_ROW = 4
const SNAKE_ROW_GAP = 90
const SNAKE_PADDING = 40
const SNAKE_ARROW_COLOR = '#2563eb'
const FALLBACK_NODE_W = 190
const FALLBACK_NODE_H = 70
/** Snapshot okları düğüm kutularından en az bu kadar uzak kalır. */
const ROUTE_CLEARANCE = 14
/** Aynı düğüm kenarındaki portlar arası minimum mesafe (px). */
const PORT_SPREAD = 24
/** Paralel okların aynı yatay/dikey şeritte binmemesi için ray aralığı. */
const RAIL_LANE_GAP = 18
const PORT_STUB = 26

type SnakeItem = { id: string; x: number; y: number; w: number; h: number; rowIdx: number; dir: 1 | -1 }
type SnapRect = { l: number; r: number; t: number; b: number }
type Pt = { x: number; y: number }

/**
 * Yol çok genişse (tek sıraya sığmıyorsa), düğümleri "yılan" (boustrophedon)
 * düzeninde satırlara böler: sıra sağa doğru ilerler, satır dolunca aşağı
 * inip bir sonraki satır SOLA doğru devam eder, o da dolunca tekrar aşağı
 * inip SAĞA döner — böylece tek satırlık dev bir şerit yerine kompakt,
 * okunaklı bir blok elde edilir. Düğüm/ok boyutları HİÇ küçültülmez.
 */
function packSnakeRows(
  items: Array<{ id: string; w: number; h: number }>,
): { laid: SnakeItem[]; width: number; height: number } {
  const maxSlotsPerRow = Math.min(
    SNAKE_MAX_SLOTS_PER_ROW,
    Math.max(1, Math.floor(SNAKE_MAX_ROW_WIDTH / SNAKE_SLOT)),
  )
  type Row = { items: Array<{ id: string; w: number; h: number }>; height: number }
  const rows: Row[] = []
  let current: Array<{ id: string; w: number; h: number }> = []
  for (const item of items) {
    if (current.length >= maxSlotsPerRow) {
      rows.push({ items: current, height: Math.max(...current.map((c) => c.h)) })
      current = [item]
    } else {
      current.push(item)
    }
  }
  if (current.length > 0) {
    rows.push({ items: current, height: Math.max(...current.map((c) => c.h)) })
  }

  const canvasWidth = maxSlotsPerRow * SNAKE_SLOT
  const laid: SnakeItem[] = []
  let y = 0
  rows.forEach((row, rowIdx) => {
    const dir: 1 | -1 = rowIdx % 2 === 0 ? 1 : -1
    row.items.forEach((item, slotIdx) => {
      const slotX = slotIdx * SNAKE_SLOT
      const x =
        dir === 1
          ? slotX + (SNAKE_SLOT - item.w) / 2
          : canvasWidth - (slotIdx + 1) * SNAKE_SLOT + (SNAKE_SLOT - item.w) / 2
      laid.push({
        id: item.id,
        x,
        y: y + (row.height - item.h) / 2,
        w: item.w,
        h: item.h,
        rowIdx,
        dir,
      })
    })
    y += row.height + SNAKE_ROW_GAP
  })

  return { laid, width: canvasWidth, height: Math.max(0, y - SNAKE_ROW_GAP) }
}

/** Kısa yollar: canlı grafik konumlarını koru, okları snapshot katmanında çiz. */
function packNaturalLayout(
  pathNodes: Node[],
  steps: ProcessPathSnapshotStep[],
  bounds: { x: number; y: number },
): { laid: SnakeItem[]; width: number; height: number } {
  const nodeById = new Map<string, Node>()
  for (const n of pathNodes) {
    nodeById.set(n.id, n)
    const real = sinkCopyRealId(n.id)
    if (real !== n.id) nodeById.set(real, n)
  }

  const raw: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
  for (const s of steps) {
    const n = nodeById.get(s.id)
    raw.push({
      id: s.id,
      x: (n?.position.x ?? 0) - bounds.x,
      y: (n?.position.y ?? 0) - bounds.y,
      w: n?.width ?? FALLBACK_NODE_W,
      h: n?.height ?? FALLBACK_NODE_H,
    })
  }

  raw.sort((a, b) => a.y - b.y || a.x - b.x)
  const laid: SnakeItem[] = []
  let rowIdx = 0
  let anchorY = -Infinity
  for (const item of raw) {
    if (item.y - anchorY > 56) {
      rowIdx++
      anchorY = item.y
    }
    laid.push({
      ...item,
      rowIdx,
      dir: rowIdx % 2 === 0 ? 1 : -1,
    })
  }

  const width = Math.max(0, ...laid.map((l) => l.x + l.w))
  const height = Math.max(0, ...laid.map((l) => l.y + l.h))
  return { laid, width, height }
}

/**
 * Yılan düzeni için, gerçek düğüm DOM elemanlarını (görünüşleri birebir
 * korunacak şekilde) klonlayıp yeni konumlara yerleştiren, aralarına da
 * düz/dönüş okları çizen bağımsız bir DOM ağacı üretir. Sonuç, sayfaya
 * (görünmez şekilde) eklenir; çağıran taraf yakalama bitince `cleanup()`
 * ile kaldırmalı.
 */
type PathEdgeDraw = { fromId: string; toId: string; label?: string }

type SnakePort = { x: number; y: number; side: 'left' | 'right' | 'top' | 'bottom' }

const SNAKE_ARROW_SIZE = 9
/** Ok ucu düğüm kenarına neredeyse değsin (1–2 px boşluk). */
const SNAKE_PORT_INSET = 1

function snakeNodeRect(item: SnakeItem, pad: number) {
  return {
    l: pad + item.x,
    r: pad + item.x + item.w,
    t: pad + item.y,
    b: pad + item.y + item.h,
    cx: pad + item.x + item.w / 2,
    cy: pad + item.y + item.h / 2,
  }
}

function snakePort(item: SnakeItem, side: SnakePort['side'], pad: number, offsetAlong = 0): SnakePort {
  const r = snakeNodeRect(item, pad)
  switch (side) {
    case 'right':
      return { x: r.r - SNAKE_PORT_INSET, y: r.cy + offsetAlong, side }
    case 'left':
      return { x: r.l + SNAKE_PORT_INSET, y: r.cy + offsetAlong, side }
    case 'bottom':
      return { x: r.cx + offsetAlong, y: r.b - SNAKE_PORT_INSET, side }
    case 'top':
      return { x: r.cx + offsetAlong, y: r.t + SNAKE_PORT_INSET, side }
  }
}

function pickSnakePorts(cur: SnakeItem, next: SnakeItem, pad: number): { from: SnakePort; to: SnakePort } {
  const a = snakeNodeRect(cur, pad)
  const b = snakeNodeRect(next, pad)
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy

  if (cur.rowIdx === next.rowIdx) {
    if (dx >= 0) {
      return {
        from: snakePort(cur, 'right', pad),
        to: snakePort(next, 'left', pad),
      }
    }
    return {
      from: snakePort(cur, 'left', pad),
      to: snakePort(next, 'right', pad),
    }
  }

  // Satır farkı olsa bile esas yön yataysa soldan/sağdan bağlan — "aşağı
  // iniyor gibi" yanlış okuma olmasın (örn. 3. satır sağ uç).
  if (Math.abs(dx) > Math.abs(dy) * 0.55 || (Math.abs(dx) > 80 && Math.abs(dy) < 80)) {
    return dx > 0
      ? { from: snakePort(cur, 'right', pad), to: snakePort(next, 'left', pad) }
      : { from: snakePort(cur, 'left', pad), to: snakePort(next, 'right', pad) }
  }

  if (dy > 0) {
    // hedef aşağıda
    if (dx > 40) return { from: snakePort(cur, 'right', pad), to: snakePort(next, 'top', pad) }
    if (dx < -40) return { from: snakePort(cur, 'left', pad), to: snakePort(next, 'top', pad) }
    return { from: snakePort(cur, 'bottom', pad), to: snakePort(next, 'top', pad) }
  }

  // hedef yukarıda
  if (dx > 40) return { from: snakePort(cur, 'right', pad), to: snakePort(next, 'bottom', pad) }
  if (dx < -40) return { from: snakePort(cur, 'left', pad), to: snakePort(next, 'bottom', pad) }
  return { from: snakePort(cur, 'top', pad), to: snakePort(next, 'bottom', pad) }
}

function inflateRect(r: SnapRect, m: number): SnapRect {
  return { l: r.l - m, r: r.r + m, t: r.t - m, b: r.b + m }
}

function rectsOverlap(a: SnapRect, b: SnapRect, gap = 0): boolean {
  return a.l - gap < b.r && a.r + gap > b.l && a.t - gap < b.b && a.b + gap > b.t
}

function portKey(p: SnakePort): string {
  return `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}`
}

function nudgePort(
  item: SnakeItem,
  side: SnakePort['side'],
  pad: number,
  baseSpread: number,
  attempt: number,
): SnakePort {
  return snakePort(item, side, pad, baseSpread + attempt * 8)
}

/** Giriş/çıkış aynı kenarda ise birbirinden uzaklaştır. */
function biasedPortSpread(
  side: SnakePort['side'],
  role: 'from' | 'to',
  idx: number,
  n: number,
): number {
  const base = n <= 1 ? 0 : (idx - (n - 1) / 2) * PORT_SPREAD
  const bias = PORT_SPREAD * 0.35
  if (side === 'bottom') return role === 'to' ? base - bias : base + bias
  if (side === 'top') return role === 'to' ? base + bias : base - bias
  if (side === 'right') return role === 'from' ? base + bias : base - bias
  return role === 'to' ? base + bias : base - bias
}

type EdgeRailLane = { railOffset: number; dropXOffset: number; arcOffset: number }

function assignEdgeRailLanes(
  pathEdges: PathEdgeDraw[],
  laidById: Map<string, SnakeItem>,
  ports: Map<string, { from: SnakePort; to: SnakePort }>,
  pad: number,
): Map<string, EdgeRailLane> {
  type HSeg = { ek: string; y: number; x1: number; x2: number }
  type VSeg = { ek: string; x: number; y1: number; y2: number }
  const hSegs: HSeg[] = []
  const vSegs: VSeg[] = []

  for (const pe of pathEdges) {
    const ek = `${pe.fromId}\0${pe.toId}`
    const cur = laidById.get(pe.fromId)
    const next = laidById.get(pe.toId)
    const p = ports.get(ek)
    if (!cur || !next || !p) continue

    if (cur.rowIdx === next.rowIdx) {
      const xLo = Math.min(p.from.x, p.to.x)
      const xHi = Math.max(p.from.x, p.to.x)
      const corridorY = (p.from.y + p.to.y) / 2
      hSegs.push({ ek, y: corridorY - ROUTE_CLEARANCE, x1: xLo, x2: xHi })
    } else {
      const fromR = snakeNodeRect(cur, pad)
      const railY = fromR.b + SNAKE_ROW_GAP / 2
      hSegs.push({
        ek,
        y: railY,
        x1: Math.min(p.from.x, p.to.x),
        x2: Math.max(p.from.x, p.to.x),
      })
      vSegs.push({ ek, x: p.from.x, y1: Math.min(p.from.y, railY), y2: Math.max(p.from.y, railY) })
      vSegs.push({ ek, x: p.to.x, y1: Math.min(p.to.y, railY), y2: Math.max(p.to.y, railY) })
    }
  }

  const lanes = new Map<string, EdgeRailLane>()
  const mergeLane = (ek: string, patch: Partial<EdgeRailLane>) => {
    const prev = lanes.get(ek) ?? { railOffset: 0, dropXOffset: 0, arcOffset: 0 }
    lanes.set(ek, {
      railOffset: Math.max(prev.railOffset, patch.railOffset ?? 0),
      dropXOffset: Math.max(prev.dropXOffset, patch.dropXOffset ?? 0),
      arcOffset: Math.max(prev.arcOffset, patch.arcOffset ?? 0),
    })
  }

  const assignHLanes = (segs: HSeg[]) => {
    const sorted = [...segs].sort((a, b) => a.y - b.y || a.x1 - b.x1)
    const placed: Array<{ y: number; x1: number; x2: number; lane: number }> = []
    for (const seg of sorted) {
      let lane = 0
      for (;;) {
        const y = seg.y + lane * RAIL_LANE_GAP
        const clash = placed.some(
          (p) =>
            p.lane === lane &&
            Math.abs(p.y - y) < 8 &&
            p.x1 < seg.x2 + 12 &&
            p.x2 + 12 > seg.x1,
        )
        if (!clash) {
          placed.push({ y, x1: seg.x1, x2: seg.x2, lane })
          mergeLane(seg.ek, {
            railOffset: lane * RAIL_LANE_GAP,
            dropXOffset: lane * 12,
            arcOffset: lane * RAIL_LANE_GAP,
          })
          break
        }
        lane++
      }
    }
  }

  const assignVLanes = (segs: VSeg[]) => {
    const sorted = [...segs].sort((a, b) => a.x - b.x || a.y1 - b.y1)
    const placed: Array<{ x: number; y1: number; y2: number; lane: number }> = []
    for (const seg of sorted) {
      let lane = 0
      for (;;) {
        const x = seg.x + lane * 14
        const clash = placed.some(
          (p) =>
            p.lane === lane &&
            Math.abs(p.x - x) < 8 &&
            p.y1 < seg.y2 + 10 &&
            p.y2 + 10 > seg.y1,
        )
        if (!clash) {
          placed.push({ x, y1: seg.y1, y2: seg.y2, lane })
          mergeLane(seg.ek, { dropXOffset: lane * 14 })
          break
        }
        lane++
      }
    }
  }

  assignHLanes(hSegs)
  assignVLanes(vSegs)

  for (const pe of pathEdges) {
    const ek = `${pe.fromId}\0${pe.toId}`
    if (!lanes.has(ek)) lanes.set(ek, { railOffset: 0, dropXOffset: 0, arcOffset: 0 })
  }
  return lanes
}

function assignSnapshotPorts(
  pathEdges: PathEdgeDraw[],
  laidById: Map<string, SnakeItem>,
  pad: number,
): Map<string, { from: SnakePort; to: SnakePort }> {
  type SideGroup = { edge: PathEdgeDraw; item: SnakeItem; side: SnakePort['side']; role: 'from' | 'to' }[]
  const srcGroups = new Map<string, SideGroup>()
  const tgtGroups = new Map<string, SideGroup>()
  const baseSide = new Map<string, { fromSide: SnakePort['side']; toSide: SnakePort['side'] }>()

  for (const pe of pathEdges) {
    const cur = laidById.get(pe.fromId)
    const next = laidById.get(pe.toId)
    if (!cur || !next) continue
    const base = pickSnakePorts(cur, next, pad)
    const ek = `${pe.fromId}\0${pe.toId}`
    baseSide.set(ek, { fromSide: base.from.side, toSide: base.to.side })
    const sk = `${pe.fromId}:${base.from.side}:out`
    const tk = `${pe.toId}:${base.to.side}:in`
    const sg = srcGroups.get(sk) ?? []
    sg.push({ edge: pe, item: cur, side: base.from.side, role: 'from' })
    srcGroups.set(sk, sg)
    const tg = tgtGroups.get(tk) ?? []
    tg.push({ edge: pe, item: next, side: base.to.side, role: 'to' })
    tgtGroups.set(tk, tg)
  }

  const used = new Set<string>()
  const ports = new Map<string, { from?: SnakePort; to?: SnakePort }>()

  const placeGroup = (groups: Map<string, SideGroup>, role: 'from' | 'to') => {
    for (const [, list] of groups) {
      list.sort((a, b) => {
        const otherA = role === 'from' ? a.edge.toId : a.edge.fromId
        const otherB = role === 'from' ? b.edge.toId : b.edge.fromId
        const pa = laidById.get(otherA)
        const pb = laidById.get(otherB)
        const ya = pa?.y ?? 0
        const yb = pb?.y ?? 0
        return ya - yb || a.edge.fromId.localeCompare(b.edge.fromId)
      })
      const n = list.length
      list.forEach((entry, idx) => {
        const spread = biasedPortSpread(entry.side, role, idx, n)
        let port = snakePort(entry.item, entry.side, pad, spread)
        let attempt = 0
        while (used.has(portKey(port)) && attempt < 12) {
          port = nudgePort(entry.item, entry.side, pad, spread, attempt + 1)
          attempt++
        }
        used.add(portKey(port))
        const ek = `${entry.edge.fromId}\0${entry.edge.toId}`
        const slot = ports.get(ek) ?? {}
        if (role === 'from') slot.from = port
        else slot.to = port
        ports.set(ek, slot)
      })
    }
  }

  placeGroup(srcGroups, 'from')
  placeGroup(tgtGroups, 'to')

  const out = new Map<string, { from: SnakePort; to: SnakePort }>()
  for (const pe of pathEdges) {
    const ek = `${pe.fromId}\0${pe.toId}`
    const p = ports.get(ek)
    const cur = laidById.get(pe.fromId)
    const next = laidById.get(pe.toId)
    const sides = baseSide.get(ek)
    if (!p?.from || !p?.to || !cur || !next || !sides) continue
    out.set(ek, { from: p.from, to: p.to })
  }
  return out
}

function clearHorizontalRail(y: number, x1: number, x2: number, obstacles: SnapRect[]): number {
  const lo = Math.min(x1, x2)
  const hi = Math.max(x1, x2)
  let rail = y
  for (let attempt = 0; attempt < 8; attempt++) {
    const hit = obstacles.some((o) => o.l < hi && o.r > lo && o.t < rail + 4 && o.b > rail - 4)
    if (!hit) return rail
    rail += 16
  }
  return rail
}

function polylineLength(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return len
}

function pointAlongPolyline(pts: Pt[], dist: number): { p: Pt; angle: number } {
  if (pts.length < 2) return { p: pts[0] ?? { x: 0, y: 0 }, angle: 0 }
  let left = dist
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (left <= seg || i === pts.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0
      return {
        p: {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        },
        angle: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x),
      }
    }
    left -= seg
  }
  const last = pts.length - 1
  return {
    p: pts[last],
    angle: Math.atan2(pts[last].y - pts[last - 1].y, pts[last].x - pts[last - 1].x),
  }
}

function smoothPathFromPoints(pts: Pt[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    const [a, b] = pts
    const k = Math.min(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.38)
    const c1x = a.x + (b.x > a.x ? k : b.x < a.x ? -k : 0)
    const c1y = a.y + (b.y > a.y ? k : b.y < a.y ? -k : 0)
    const c2x = b.x + (b.x > a.x ? -k : b.x < a.x ? k : 0)
    const c2y = b.y + (b.y > a.y ? -k : b.y < a.y ? k : 0)
    return `M ${a.x},${a.y} C ${c1x},${c1y} ${c2x},${c2y} ${b.x},${b.y}`
  }
  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const next = pts[i + 1]
    if (!next) {
      d += ` L ${curr.x},${curr.y}`
      continue
    }
    const r = 10
    const dx1 = curr.x - prev.x
    const dy1 = curr.y - prev.y
    const len1 = Math.hypot(dx1, dy1) || 1
    const dx2 = next.x - curr.x
    const dy2 = next.y - curr.y
    const len2 = Math.hypot(dx2, dy2) || 1
    const p1 = { x: curr.x - (dx1 / len1) * Math.min(r, len1 / 2), y: curr.y - (dy1 / len1) * Math.min(r, len1 / 2) }
    const p2 = { x: curr.x + (dx2 / len2) * Math.min(r, len2 / 2), y: curr.y + (dy2 / len2) * Math.min(r, len2 / 2) }
    d += ` L ${p1.x},${p1.y} Q ${curr.x},${curr.y} ${p2.x},${p2.y}`
  }
  return d
}

function routeSnapshotEdge(
  from: SnakePort,
  to: SnakePort,
  fromItem: SnakeItem,
  toItem: SnakeItem,
  allItems: SnakeItem[],
  pad: number,
  lane: EdgeRailLane,
): { d: string; poly: Pt[]; tipX: number; tipY: number; angle: number } {
  const blocks = allItems
    .filter((it) => it.id !== fromItem.id && it.id !== toItem.id)
    .map((it) => inflateRect(snakeNodeRect(it, pad), ROUTE_CLEARANCE))

  const sameRow = fromItem.rowIdx === toItem.rowIdx
  let pts: Pt[]

  if (sameRow) {
    const corridorY = (from.y + to.y) / 2
    const xLo = Math.min(from.x, to.x)
    const xHi = Math.max(from.x, to.x)
    const blocking = blocks.filter(
      (o) => o.r > xLo && o.l < xHi && o.b > corridorY - 18 && o.t < corridorY + 18,
    )
    if (blocking.length === 0 && Math.abs(from.y - to.y) < 6) {
      const stub = PORT_STUB + lane.dropXOffset * 0.2
      const exit: Pt = { ...from }
      if (from.side === 'right') exit.x = from.x + stub
      else if (from.side === 'left') exit.x = from.x - stub
      const entry: Pt = { ...to }
      if (to.side === 'left') entry.x = to.x - stub
      else if (to.side === 'right') entry.x = to.x + stub
      pts = [from, exit, entry, to]
    } else {
      const arcY =
        (blocking.length > 0
          ? Math.min(...blocking.map((o) => o.t)) - ROUTE_CLEARANCE
          : corridorY - ROUTE_CLEARANCE) - lane.arcOffset
      pts = [
        from,
        { x: from.x, y: arcY },
        { x: to.x, y: arcY },
        to,
      ]
    }
  } else if (
    (from.side === 'right' && to.side === 'left') ||
    (from.side === 'left' && to.side === 'right')
  ) {
    // Yatay baskın bağlantı: önce yatay çık, gerekirse hafif kavis — dikey
    // şeritte binme olmasın.
    const stub = PORT_STUB
    const exit: Pt = { ...from }
    const entry: Pt = { ...to }
    if (from.side === 'right') exit.x = from.x + stub + lane.dropXOffset
    else exit.x = from.x - stub - lane.dropXOffset
    if (to.side === 'left') entry.x = to.x - stub - lane.dropXOffset
    else entry.x = to.x + stub + lane.dropXOffset
    if (Math.abs(from.y - to.y) < 10) {
      pts = [from, exit, entry, to]
    } else {
      const midY = (from.y + to.y) / 2 + lane.railOffset
      pts = [from, exit, { x: exit.x, y: midY }, { x: entry.x, y: midY }, entry, to]
    }
  } else {
    const fromR0 = snakeNodeRect(fromItem, pad)
    let railY = fromR0.b + SNAKE_ROW_GAP / 2 + lane.railOffset
    railY = clearHorizontalRail(railY, from.x, to.x, blocks)

    const exit: Pt = { ...from }
    switch (from.side) {
      case 'right':
        exit.x = from.x + PORT_STUB + lane.dropXOffset
        break
      case 'left':
        exit.x = from.x - PORT_STUB - lane.dropXOffset
        break
      case 'bottom':
        exit.x = from.x + lane.dropXOffset
        exit.y = from.y + PORT_STUB
        break
      case 'top':
        exit.x = from.x + lane.dropXOffset
        exit.y = from.y - PORT_STUB
        break
    }

    const entry: Pt = { ...to }
    switch (to.side) {
      case 'left':
        entry.x = to.x - PORT_STUB - lane.dropXOffset * 0.5
        break
      case 'right':
        entry.x = to.x + PORT_STUB + lane.dropXOffset * 0.5
        break
      case 'top':
        entry.x = to.x + lane.dropXOffset * 0.5
        entry.y = to.y - PORT_STUB
        break
      case 'bottom':
        entry.x = to.x + lane.dropXOffset * 0.5
        entry.y = to.y + PORT_STUB
        break
    }

    const dropX = exit.x
    const approachX = entry.x
    pts = [from, exit, { x: dropX, y: railY }, { x: approachX, y: railY }, entry, to]
  }

  const d = smoothPathFromPoints(pts)
  const total = polylineLength(pts)
  const near = pointAlongPolyline(pts, Math.max(0, total - 8))
  return { d, poly: pts, tipX: to.x, tipY: to.y, angle: near.angle }
}

type SnapshotLabel = {
  edgeKey: string
  text: string
  x: number
  y: number
  angle: number
}

function labelBox(l: SnapshotLabel): SnapRect {
  const w = Math.max(34, l.text.length * 6.5 + 16)
  const h = 18
  return { l: l.x - w / 2, r: l.x + w / 2, t: l.y - h / 2, b: l.y + h / 2 }
}

function resolveSnapshotLabels(labels: SnapshotLabel[], nodeRects: SnapRect[]): SnapshotLabel[] {
  const resolved = labels.map((l) => ({ ...l }))
  const maxIter = 40
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false
    for (let i = 0; i < resolved.length; i++) {
      const lb = labelBox(resolved[i])
      for (const nr of nodeRects) {
        if (!rectsOverlap(lb, nr, 4)) continue
        resolved[i].y -= 14
        resolved[i].x += 8
        moved = true
      }
      for (let j = i + 1; j < resolved.length; j++) {
        const lb2 = labelBox(resolved[j])
        if (!rectsOverlap(lb, lb2, 6)) continue
        resolved[j].y += 16
        resolved[j].x += 12
        resolved[i].x -= 8
        moved = true
      }
    }
    if (!moved) break
  }
  return resolved
}

function buildSnapshotCaptureContainer(
  mountEl: HTMLElement,
  viewportEl: HTMLElement,
  pathNodes: Node[],
  steps: ProcessPathSnapshotStep[],
  pathEdges: PathEdgeDraw[],
  layout: 'snake' | 'natural',
  bounds?: { x: number; y: number },
): { container: HTMLElement; width: number; height: number; cleanup: () => void } {
  const nodeById = new Map(pathNodes.map((n) => [n.id, n]))
  const liveElById = new Map<string, HTMLElement>()
  viewportEl.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
    const id = el.getAttribute('data-id')
    if (!id) return
    liveElById.set(id, el)
    const real = sinkCopyRealId(id)
    if (real !== id) liveElById.set(real, el)
  })

  const items = steps.map((s) => {
    const n = nodeById.get(s.id)
    return { id: s.id, w: n?.width ?? FALLBACK_NODE_W, h: n?.height ?? FALLBACK_NODE_H }
  })
  const { laid, width, height } =
    layout === 'snake'
      ? packSnakeRows(items)
      : packNaturalLayout(pathNodes, steps, bounds ?? { x: 0, y: 0 })
  const laidById = new Map(laid.map((l) => [l.id, l]))
  const nodeRects = laid.map((item) => snakeNodeRect(item, SNAKE_PADDING))

  const container = document.createElement('div')
  container.className = 'pf-snake-capture-root'
  // opacity:0 ve ekran-dışı konum html-to-image'de boş PNG üretir;
  // harita canvas'ına görünür yerleştir, CSS ile ana akış gizlenir.
  container.style.position = 'absolute'
  container.style.left = '0'
  container.style.top = '0'
  container.style.zIndex = '30'
  container.style.width = `${width + SNAKE_PADDING * 2}px`
  container.style.height = `${height + SNAKE_PADDING * 2}px`
  container.style.background = '#ffffff'
  container.style.overflow = 'hidden'

  const svgNs = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('width', String(width + SNAKE_PADDING * 2))
  svg.setAttribute('height', String(height + SNAKE_PADDING * 2))
  svg.style.position = 'absolute'
  svg.style.left = '0'
  svg.style.top = '0'
  container.appendChild(svg)

  function addArrowHead(tipX: number, tipY: number, angle: number) {
    const size = SNAKE_ARROW_SIZE
    const wing = Math.PI / 6.5
    const x1 = tipX - size * Math.cos(angle - wing)
    const y1 = tipY - size * Math.sin(angle - wing)
    const x2 = tipX - size * Math.cos(angle + wing)
    const y2 = tipY - size * Math.sin(angle + wing)
    const poly = document.createElementNS(svgNs, 'polygon')
    poly.setAttribute('points', `${tipX},${tipY} ${x1},${y1} ${x2},${y2}`)
    poly.setAttribute('fill', SNAKE_ARROW_COLOR)
    svg.appendChild(poly)
  }

  const assignedPorts = assignSnapshotPorts(pathEdges, laidById, SNAKE_PADDING)
  const edgeLanes = assignEdgeRailLanes(pathEdges, laidById, assignedPorts, SNAKE_PADDING)
  const pendingLabels: SnapshotLabel[] = []

  for (const pe of pathEdges) {
    const cur = laidById.get(pe.fromId)
    const next = laidById.get(pe.toId)
    if (!cur || !next) continue
    const ek = `${pe.fromId}\0${pe.toId}`
    const ports = assignedPorts.get(ek)
    if (!ports) continue
    const lane = edgeLanes.get(ek) ?? { railOffset: 0, dropXOffset: 0, arcOffset: 0 }

    const { d, poly, tipX, tipY, angle } = routeSnapshotEdge(
      ports.from,
      ports.to,
      cur,
      next,
      laid,
      SNAKE_PADDING,
      lane,
    )
    const path = document.createElementNS(svgNs, 'path')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', SNAKE_ARROW_COLOR)
    path.setAttribute('stroke-width', '2')
    path.setAttribute('d', d)
    svg.appendChild(path)
    addArrowHead(tipX, tipY, angle)

    const label = pe.label?.trim()
    if (label) {
      const total = polylineLength(poly)
      const at = pointAlongPolyline(poly, Math.min(total * 0.28, 72))
      const nx = -Math.sin(at.angle)
      const ny = Math.cos(at.angle)
      pendingLabels.push({
        edgeKey: ek,
        text: label,
        x: at.p.x + nx * 14,
        y: at.p.y + ny * 14,
        angle: at.angle,
      })
    }
  }

  const resolvedLabels = resolveSnapshotLabels(pendingLabels, nodeRects)
  for (const lbl of resolvedLabels) {
    const labelEl = document.createElement('div')
    labelEl.textContent = lbl.text
    labelEl.style.position = 'absolute'
    labelEl.style.left = `${lbl.x}px`
    labelEl.style.top = `${lbl.y}px`
    labelEl.style.transform = 'translate(-50%, -50%)'
    labelEl.style.fontSize = '10px'
    labelEl.style.fontWeight = '600'
    labelEl.style.fontFamily = 'Inter, Arial, sans-serif'
    labelEl.style.color = '#1e40af'
    labelEl.style.background = '#ffffff'
    labelEl.style.padding = '2px 6px'
    labelEl.style.borderRadius = '6px'
    labelEl.style.border = '1px solid #93c5fd'
    labelEl.style.boxShadow = '0 1px 2px rgba(15,23,42,0.08)'
    labelEl.style.whiteSpace = 'nowrap'
    labelEl.style.zIndex = '40'
    labelEl.style.pointerEvents = 'none'
    container.appendChild(labelEl)
  }

  let cloneCount = 0
  for (const step of steps) {
    const pos = laidById.get(step.id)
    const liveEl = liveElById.get(step.id)
    if (!pos || !liveEl) continue
    const clone = liveEl.cloneNode(true) as HTMLElement
    clone.classList.remove('pf-node-offpath', 'pf-edge-offpath')
    clone.classList.add('pf-node-onpath')
    clone.style.position = 'absolute'
    clone.style.left = `${SNAKE_PADDING + pos.x}px`
    clone.style.top = `${SNAKE_PADDING + pos.y}px`
    clone.style.transform = 'none'
    clone.style.margin = '0'
    clone.style.opacity = '1'
    clone.style.visibility = 'visible'
    container.appendChild(clone)
    cloneCount++
  }

  if (cloneCount === 0) {
    container.remove()
    throw new Error('Yol düğümleri DOM\'da bulunamadı (klonlanamadı)')
  }

  mountEl.appendChild(container)
  return {
    container,
    width: width + SNAKE_PADDING * 2,
    height: height + SNAKE_PADDING * 2,
    cleanup: () => container.remove(),
  }
}

/**
 * Yolu, EKRANDAKİ canlı pan/zoom'a hiç dokunmadan, sabit zoom=1 ile tam
 * çözünürlükte yakalar — React Flow'un resmi "export image" deseni
 * (getNodesBounds + `.react-flow__viewport` üzerinde transform override).
 * Bu yüzden yol ne kadar uzun olursa olsun metin küçülmez, görsel sadece
 * genişler; PDF'te yakınlaştırınca da (kaynak PNG zaten yüksek çözünürlük)
 * bulanıklaşmaz.
 */
export async function exportProcessPathSnapshotPdf(opts: {
  mapEl: HTMLElement
  pathNodeIds: Set<string>
  pathEdges: PathEdgeDraw[]
  getNodes: () => Node[]
  steps: ProcessPathSnapshotStep[]
  processTitle: string
  processNo: string
  targetName: string
}): Promise<void> {
  const { mapEl, pathNodeIds, pathEdges, getNodes, steps, processTitle, processNo, targetName } =
    opts

  const pathNodes = getNodes().filter(
    (n) => pathNodeIds.has(n.id) || pathNodeIds.has(sinkCopyRealId(n.id)),
  )
  if (pathNodes.length === 0) throw new Error('Yol düğümleri bulunamadı')

  const viewportEl =
    mapEl.querySelector<HTMLElement>('.react-flow__viewport') ??
    mapEl.querySelector<HTMLElement>('.react-flow')
  if (!viewportEl) throw new Error('React Flow viewport elementi bulunamadı')

  const bounds = getNodesBounds(pathNodes)

  // Snapshot görseli HER ZAMAN bağımsız bir katmanda üretilir — canlı
  // ProcessFlowMap okları/etiketleri PDF'e yansımaz, chart'a dokunulmaz.
  const useSnakeLayout = bounds.width > SNAKE_MAX_ROW_WIDTH
  const { container, width, height, cleanup } = buildSnapshotCaptureContainer(
    mapEl,
    viewportEl,
    pathNodes,
    steps,
    pathEdges,
    useSnakeLayout ? 'snake' : 'natural',
    { x: bounds.x, y: bounds.y },
  )
  const restore = sanitizeAttributesForXml(container)
  let dataUrl: string
  try {
    await waitPaint()
    await waitPaint()
    const captureW = width + SNAKE_PADDING * 2
    const captureH = height + SNAKE_PADDING * 2
    const pixelRatio = Math.max(1, Math.min(2.5, 8000 / Math.max(captureW, captureH)))
    dataUrl = await toPng(container, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: '#ffffff',
      skipFonts: false,
      width: captureW,
      height: captureH,
    })
  } finally {
    restore.forEach((fn) => fn())
    cleanup()
  }

  const img = await loadImage(dataUrl)
  if (img.width < 2 || img.height < 2) {
    throw new Error('Yol görseli yakalanamadı (boş görüntü)')
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const fonts = await loadTurkishFonts()
  doc.addFileToVFS('PfSans.ttf', fonts.regular)
  doc.addFont('PfSans.ttf', 'PfSans', 'normal', undefined, 'Identity-H')
  doc.addFileToVFS('PfSans-Bold.ttf', fonts.bold)
  doc.addFont('PfSans-Bold.ttf', 'PfSans', 'bold', undefined, 'Identity-H')

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 32

  doc.setFontSize(14)
  doc.setFont('PfSans', 'bold')
  doc.text(`${processTitle} (${processNo})`, margin, margin)
  doc.setFont('PfSans', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(`Hedef adım: ${targetName}`, margin, margin + 16)
  doc.setTextColor(0, 0, 0)

  const imgTop = margin + 30
  const maxW = pageW - margin * 2
  const maxH = pageH * 0.5
  const scale = Math.min(maxW / img.width, maxH / img.height, 1)
  const w = img.width * scale
  const h = img.height * scale
  doc.addImage(dataUrl, 'PNG', margin + (maxW - w) / 2, imgTop, w, h)

  let y = imgTop + h + 26
  doc.setFontSize(11)
  doc.setFont('PfSans', 'bold')
  doc.text('Baştan hedefe kadar izlenen yol', margin, y)
  y += 18
  doc.setFont('PfSans', 'normal')
  doc.setFontSize(9.5)

  steps.forEach((step, i) => {
    if (y > pageH - margin) {
      doc.addPage()
      y = margin
    }
    const kindLabel = KIND_LABEL_TR[step.kind] ?? step.kind
    const line = `${i + 1}. [${kindLabel}] ${step.name}`
    doc.text(line, margin, y)
    y += 14
    if (step.label) {
      if (y > pageH - margin) {
        doc.addPage()
        y = margin
      }
      doc.setTextColor(90, 90, 90)
      doc.text(`     -> geçiş: ${step.label}`, margin, y)
      doc.setTextColor(0, 0, 0)
      y += 14
    }
  })

  const filename = `${sanitizeFilenamePart(processNo)}_${sanitizeFilenamePart(targetName)}_yol.pdf`
  doc.save(filename)
}
