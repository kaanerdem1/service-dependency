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

/**
 * html-to-image, SVG `marker-end` referanslarını (ok başları) genelde
 * PNG'ye aktaramaz — bu yüzden her kenarın ucuna gerçek bir <polygon> ok
 * başı ekleyip marker-end'i kaldırıyoruz. Ayrıca XML için geçersiz
 * karakterleri de temizliyoruz (yukarıya bkz). Bu, YAKALAMA hedefindeki
 * CANLI DOM'u geçici olarak değiştirir; bu yüzden çağıran taraf dönen
 * `restore()` fonksiyonunu yakalama bitince MUTLAKA çağırmalı (ekrandaki
 * oklar/id'ler kalıcı olarak bozulmasın).
 */
function prepareForCapture(root: HTMLElement): () => void {
  const restores: Array<() => void> = [...sanitizeAttributesForXml(root)]
  root.querySelectorAll<SVGPathElement>('.react-flow__edge path').forEach((path) => {
    if (path.classList.contains('react-flow__edge-interaction')) return
    const len = path.getTotalLength()
    if (len < 6) return
    const prevMarker = path.getAttribute('marker-end')
    const prevMarkerStyle = path.style.markerEnd
    const color = path.getAttribute('stroke') || getComputedStyle(path).stroke || '#94a3b8'
    const tip = path.getPointAtLength(len)
    const base = path.getPointAtLength(Math.max(0, len - 12))
    const angle = Math.atan2(tip.y - base.y, tip.x - base.x)
    const size = 8
    const wing = Math.PI / 6.5
    const x1 = tip.x - size * Math.cos(angle - wing)
    const y1 = tip.y - size * Math.sin(angle - wing)
    const x2 = tip.x - size * Math.cos(angle + wing)
    const y2 = tip.y - size * Math.sin(angle + wing)
    const headEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    headEl.setAttribute('points', `${tip.x},${tip.y} ${x1},${y1} ${x2},${y2}`)
    headEl.setAttribute('fill', color)
    headEl.style.setProperty('fill', color, 'important')
    path.parentElement?.appendChild(headEl)
    path.removeAttribute('marker-end')
    path.style.markerEnd = 'none'
    restores.push(() => {
      headEl.remove()
      if (prevMarker) path.setAttribute('marker-end', prevMarker)
      path.style.markerEnd = prevMarkerStyle
    })
  })
  return () => restores.forEach((fn) => fn())
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

type SnakeItem = { id: string; x: number; y: number; w: number; h: number; rowIdx: number; dir: 1 | -1 }

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

  // Satır geçişi / çapraz: göreli konuma göre en net port çifti
  if (Math.abs(dx) > Math.abs(dy) * 0.55) {
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

function cubicControl(from: SnakePort, to: SnakePort): { c1x: number; c1y: number; c2x: number; c2y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const k = Math.max(36, Math.min(Math.hypot(dx, dy) * 0.42, 140))
  let c1x = from.x
  let c1y = from.y
  let c2x = to.x
  let c2y = to.y
  switch (from.side) {
    case 'right':
      c1x = from.x + k
      c1y = from.y
      break
    case 'left':
      c1x = from.x - k
      c1y = from.y
      break
    case 'bottom':
      c1x = from.x
      c1y = from.y + k
      break
    case 'top':
      c1x = from.x
      c1y = from.y - k
      break
  }
  switch (to.side) {
    case 'left':
      c2x = to.x - k
      c2y = to.y
      break
    case 'right':
      c2x = to.x + k
      c2y = to.y
      break
    case 'top':
      c2x = to.x
      c2y = to.y - k
      break
    case 'bottom':
      c2x = to.x
      c2y = to.y + k
      break
  }
  return { c1x, c1y, c2x, c2y }
}

function cubicPoint(
  from: SnakePort,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  to: SnakePort,
  t: number,
): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u ** 3 * from.x + 3 * u ** 2 * t * c1x + 3 * u * t ** 2 * c2x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * c1y + 3 * u * t ** 2 * c2y + t ** 3 * to.y,
  }
}

function buildSnakeBezierPath(
  from: SnakePort,
  to: SnakePort,
): { d: string; tipX: number; tipY: number; angle: number; labelX: number; labelY: number } {
  const { c1x, c1y, c2x, c2y } = cubicControl(from, to)
  const d = `M ${from.x},${from.y} C ${c1x},${c1y} ${c2x},${c2y} ${to.x},${to.y}`

  const u = 0.001
  const near = cubicPoint(from, c1x, c1y, c2x, c2y, to, 1 - u)
  const angle = Math.atan2(to.y - near.y, to.x - near.x)

  const mid = cubicPoint(from, c1x, c1y, c2x, c2y, to, 0.5)
  // Etiket eğriye dik hafif kaydır — hangi ok olduğu daha net
  const nx = -(to.y - from.y)
  const ny = to.x - from.x
  const nlen = Math.hypot(nx, ny) || 1
  const labelOff = 14
  return {
    d,
    tipX: to.x,
    tipY: to.y,
    angle,
    labelX: mid.x + (nx / nlen) * labelOff,
    labelY: mid.y + (ny / nlen) * labelOff,
  }
}

function buildSnakeCaptureContainer(
  mountEl: HTMLElement,
  viewportEl: HTMLElement,
  pathNodes: Node[],
  steps: ProcessPathSnapshotStep[],
  pathEdges: PathEdgeDraw[],
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
  const { laid, width, height } = packSnakeRows(items)
  const laidById = new Map(laid.map((l) => [l.id, l]))

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

  // Aynı düğüm+kenardan çıkan çoklu okları dikey kaydır (etiket çakışmasını azalt)
  const portUseCount = new Map<string, number>()
  const portUseIndex = new Map<string, number>()
  for (const pe of pathEdges) {
    const cur = laidById.get(pe.fromId)
    const next = laidById.get(pe.toId)
    if (!cur || !next) continue
    const base = pickSnakePorts(cur, next, SNAKE_PADDING)
    portUseCount.set(`${pe.fromId}:${base.from.side}`, (portUseCount.get(`${pe.fromId}:${base.from.side}`) ?? 0) + 1)
    portUseCount.set(`${pe.toId}:${base.to.side}`, (portUseCount.get(`${pe.toId}:${base.to.side}`) ?? 0) + 1)
  }

  function takePort(item: SnakeItem, side: SnakePort['side'], nodeId: string, role: 'from' | 'to'): SnakePort {
    const key = `${nodeId}:${side}:${role}`
    const total = portUseCount.get(`${nodeId}:${side}`) ?? 1
    const idx = portUseIndex.get(key) ?? 0
    portUseIndex.set(key, idx + 1)
    const spread = 16
    const offset = total <= 1 ? 0 : (idx - (total - 1) / 2) * spread
    return snakePort(item, side, SNAKE_PADDING, offset)
  }

  for (const pe of pathEdges) {
    const cur = laidById.get(pe.fromId)
    const next = laidById.get(pe.toId)
    if (!cur || !next) continue

    const base = pickSnakePorts(cur, next, SNAKE_PADDING)
    const from =
      (portUseCount.get(`${pe.fromId}:${base.from.side}`) ?? 0) > 1
        ? takePort(cur, base.from.side, pe.fromId, 'from')
        : base.from
    const to =
      (portUseCount.get(`${pe.toId}:${base.to.side}`) ?? 0) > 1
        ? takePort(next, base.to.side, pe.toId, 'to')
        : base.to

    const { d, tipX, tipY, angle, labelX, labelY } = buildSnakeBezierPath(from, to)
    const path = document.createElementNS(svgNs, 'path')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', SNAKE_ARROW_COLOR)
    path.setAttribute('stroke-width', '2')
    path.setAttribute('d', d)
    svg.appendChild(path)
    addArrowHead(tipX, tipY, angle)

    const label = pe.label
    if (label) {
      const labelEl = document.createElement('div')
      labelEl.textContent = label
      labelEl.style.position = 'absolute'
      labelEl.style.left = `${labelX}px`
      labelEl.style.top = `${labelY}px`
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
      container.appendChild(labelEl)
    }
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
  const PADDING = 48
  const ZOOM = 1

  // Yol tek satıra (SNAKE_MAX_ROW_WIDTH) sığıyorsa, canlı diyagramı olduğu
  // gibi (mevcut, test edilmiş yöntemle) yakalıyoruz — bu durum zaten iyi
  // çalışıyor, davranışı değiştirmiyoruz. Sığmıyorsa, düğümleri "yılan"
  // (sağa-aşağı-sola-aşağı-sağa…) düzeninde yeniden dizip o bağımsız
  // yapıyı yakalıyoruz; düğüm/ok boyutları aynı kalır, sadece daha kompakt
  // bir bloğa katlanır.
  const useSnake = bounds.width > SNAKE_MAX_ROW_WIDTH

  let dataUrl: string
  if (useSnake) {
    const { container, width, height, cleanup } = buildSnakeCaptureContainer(
      mapEl,
      viewportEl,
      pathNodes,
      steps,
      pathEdges,
    )
    const restore = sanitizeAttributesForXml(container)
    try {
      await waitPaint()
      await waitPaint()
      const pixelRatio = Math.max(1, Math.min(2.5, 8000 / Math.max(width, height)))
      dataUrl = await toPng(container, {
        pixelRatio,
        cacheBust: true,
        backgroundColor: '#ffffff',
        skipFonts: false,
        width,
        height,
      })
    } finally {
      restore.forEach((fn) => fn())
      cleanup()
    }
  } else {
    const imageWidthRaw = Math.ceil((bounds.width + PADDING * 2) * ZOOM)
    const imageHeightRaw = Math.ceil((bounds.height + PADDING * 2) * ZOOM)
    const transformX = -bounds.x * ZOOM + PADDING
    const transformY = -bounds.y * ZOOM + PADDING

    // Çok geniş yollarda toplam canvas piksel sayısı tarayıcı sınırlarını
    // aşmasın diye pixelRatio kademeli düşürülür — ama ZOOM her zaman 1
    // kalır, yani metin asla küçülmez; sadece ekstra keskinlik (DPI) azalır.
    const MAX_CANVAS_DIM = 8000
    const pixelRatio = Math.max(
      1,
      Math.min(2.5, MAX_CANVAS_DIM / Math.max(imageWidthRaw, imageHeightRaw)),
    )

    const restore = prepareForCapture(viewportEl)
    try {
      await waitPaint()
      dataUrl = await toPng(viewportEl, {
        pixelRatio,
        cacheBust: true,
        backgroundColor: '#ffffff',
        skipFonts: true,
        width: imageWidthRaw,
        height: imageHeightRaw,
        style: {
          width: `${imageWidthRaw}px`,
          height: `${imageHeightRaw}px`,
          transform: `translate(${transformX}px, ${transformY}px) scale(${ZOOM})`,
        },
      })
    } finally {
      restore()
    }
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
