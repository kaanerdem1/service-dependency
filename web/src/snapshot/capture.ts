import { toPng } from 'html-to-image'
import type { SnapshotScreenshotUpload } from '../types'

function edgeStrokeColor(edge: Element | null): string {
  if (!edge?.classList.contains('dd-edge')) return '#2f6f55'
  if (edge.classList.contains('cascade')) return '#a56b38'
  if (edge.classList.contains('indirect')) return '#8a847a'
  if (edge.classList.contains('direct')) return '#3d7a60'
  return '#2f6f55'
}

function resolvedStroke(path: SVGPathElement, edge: Element | null): string {
  const stroke = getComputedStyle(path).stroke
  if (stroke && stroke !== 'none' && !stroke.includes('var(')) return stroke
  return edgeStrokeColor(edge)
}

function paintPath(path: SVGPathElement, edge: Element, color: string) {
  const strokeWidth = edge.classList.contains('indirect')
    ? '1.4'
    : edge.classList.contains('cascade')
      ? '2.2'
      : '2.2'

  path.setAttribute('stroke', color)
  path.setAttribute('stroke-width', strokeWidth)
  path.setAttribute('fill', 'none')
  path.style.setProperty('stroke', color, 'important')
  path.style.setProperty('stroke-width', `${strokeWidth}px`, 'important')
  path.style.setProperty('fill', 'none', 'important')
  path.style.setProperty('opacity', '1', 'important')
  path.removeAttribute('marker-end')
  path.style.markerEnd = 'none'

  const dash = getComputedStyle(path).strokeDasharray
  if (dash && dash !== 'none') {
    path.setAttribute('stroke-dasharray', dash)
    path.style.strokeDasharray = dash
  } else if (edge.classList.contains('indirect')) {
    path.setAttribute('stroke-dasharray', '6 5')
    path.style.strokeDasharray = '6 5'
  } else if (edge.classList.contains('cascade')) {
    path.setAttribute('stroke-dasharray', '5 4')
    path.style.strokeDasharray = '5 4'
  } else {
    path.removeAttribute('stroke-dasharray')
    path.style.strokeDasharray = 'none'
  }
}

/** Normal (fan) kenarlarda marker-end PNG’de düşer — uçta gerçek polygon ok */
function appendPathArrowHead(path: SVGPathElement, color: string) {
  const host = path.parentElement
  if (!host || host.querySelector('.capture-arrowhead')) return

  const len = path.getTotalLength()
  if (len < 6) return

  const tip = path.getPointAtLength(len)
  const base = path.getPointAtLength(Math.max(0, len - 14))
  const angle = Math.atan2(tip.y - base.y, tip.x - base.x)
  const size = 9
  const wing = Math.PI / 6.5
  const x1 = tip.x - size * Math.cos(angle - wing)
  const y1 = tip.y - size * Math.sin(angle - wing)
  const x2 = tip.x - size * Math.cos(angle + wing)
  const y2 = tip.y - size * Math.sin(angle + wing)

  const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  head.setAttribute('class', 'capture-arrowhead')
  head.setAttribute('points', `${tip.x},${tip.y} ${x1},${y1} ${x2},${y2}`)
  head.setAttribute('fill', color)
  head.setAttribute('stroke', color)
  head.setAttribute('stroke-width', '0.5')
  head.setAttribute('stroke-linejoin', 'round')
  head.style.setProperty('fill', color, 'important')
  head.style.setProperty('stroke', color, 'important')
  host.appendChild(head)
}

/** html-to-image SVG stroke / marker (CSS var) yakalayamaz */
function inlineReactFlowEdgeStyles(root: HTMLElement) {
  const flowRoot = root.querySelector('.react-flow') ?? root

  flowRoot.querySelectorAll('.react-flow__edge').forEach((edgeEl) => {
    const edge = edgeEl as HTMLElement
    edge.style.setProperty('opacity', '1', 'important')

    const paths = edge.querySelectorAll<SVGPathElement>('path')
    paths.forEach((path) => {
      if (path.classList.contains('react-flow__edge-interaction')) return

      const color = resolvedStroke(path, edge)
      paintPath(path, edge, color)

      if (!edge.classList.contains('radial-link')) {
        appendPathArrowHead(path, color)
      }
    })
  })

  flowRoot.querySelectorAll<SVGElement>('.dd-radial-mid-arrow').forEach((arrow) => {
    const edge = arrow.closest('.react-flow__edge')
    const cs = getComputedStyle(arrow)
    const on = edge?.classList.contains('dd-edge-on')
    const fill =
      !cs.fill || cs.fill === 'none' || cs.fill.includes('var(')
        ? on
          ? '#2f6f55'
          : '#888'
        : cs.fill
    const stroke =
      !cs.stroke || cs.stroke === 'none' || cs.stroke.includes('var(')
        ? '#fbfaf7'
        : cs.stroke
    arrow.setAttribute('fill', fill)
    arrow.setAttribute('stroke', stroke)
    arrow.style.setProperty('fill', fill, 'important')
    arrow.style.setProperty('stroke', stroke, 'important')
  })
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function watermarkCanvas(
  dataUrl: string,
  lines: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const pad = 8
      const lineH = 14
      const boxH = lines.length * lineH + pad * 2
      ctx.fillStyle = 'rgba(40, 35, 28, 0.72)'
      ctx.fillRect(pad, pad, Math.min(canvas.width - pad * 2, 420), boxH)
      ctx.fillStyle = '#f5f0e8'
      ctx.font = '11px system-ui, sans-serif'
      lines.forEach((line, i) => {
        ctx.fillText(line, pad * 2, pad + 12 + i * lineH)
      })
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('image_load'))
    img.src = dataUrl
  })
}

async function captureEl(
  el: HTMLElement,
  surface: SnapshotScreenshotUpload['surface'],
  watermark?: string[],
): Promise<SnapshotScreenshotUpload | undefined> {
  try {
    inlineReactFlowEdgeStyles(el)
    await waitForPaint()

    const target =
      el.querySelector<HTMLElement>('.react-flow') ??
      el.querySelector<HTMLElement>('.react-flow__viewport') ??
      el

    let dataUrl = await toPng(target, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ebe6dc',
      skipFonts: true,
    })
    if (watermark?.length) {
      dataUrl = await watermarkCanvas(dataUrl, watermark)
    }
    return {
      surface,
      capturedAt: new Date().toISOString(),
      dataUrl,
    }
  } catch {
    return undefined
  }
}

export async function captureSnapshotScreenshots(opts: {
  mapRoot?: HTMLElement | null
  workspaceRoot?: HTMLElement | null
  watermark: string[]
}): Promise<SnapshotScreenshotUpload[]> {
  const shots: SnapshotScreenshotUpload[] = []
  if (opts.mapRoot) {
    const map = await captureEl(opts.mapRoot, 'map', opts.watermark)
    if (map) shots.push(map)
  }
  if (opts.workspaceRoot) {
    const full = await captureEl(opts.workspaceRoot, 'full_app', opts.watermark)
    if (full) shots.push(full)
  }
  return shots
}

export function downloadSnapshotPng(dataUrlOrUrl: string, filename: string) {
  if (dataUrlOrUrl.startsWith('data:')) {
    const a = document.createElement('a')
    a.href = dataUrlOrUrl
    a.download = filename
    a.click()
    return
  }
  void downloadSnapshotPngFromUrl(dataUrlOrUrl, filename)
}

export async function downloadSnapshotPngFromUrl(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('png_download_failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objectUrl)
}

export function downloadSnapshotJson(snapshot: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
