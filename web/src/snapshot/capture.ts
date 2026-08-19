import { toPng } from 'html-to-image'
import type { SnapshotScreenshot } from '../types'

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
  surface: SnapshotScreenshot['surface'],
  watermark?: string[],
): Promise<SnapshotScreenshot | undefined> {
  try {
    let dataUrl = await toPng(el, {
      pixelRatio: 1,
      cacheBust: true,
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
}): Promise<SnapshotScreenshot[]> {
  const shots: SnapshotScreenshot[] = []
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

export function downloadSnapshotPng(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
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
