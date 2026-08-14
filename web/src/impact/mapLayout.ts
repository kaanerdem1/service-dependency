/**
 * Harita okunabilirliği (Datadog / SigNoz yaklaşımı):
 * - Ego + katman: az hop → büyük düğüm; çok hop → kompakt
 * - Node etiketi: 2 satır (CSS clamp); sığmazsa açık hover kartı
 * - fitView maxZoom ile 1 katmanda aşırı küçülmeyi engelle
 */

export type MapNodeSize = 'lg' | 'md' | 'sm'

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
  // 1. katman: tek katmanda lg, daha derin görünümde md
  if (hop <= 1) {
    return visibleMaxHop <= 1 ? 'lg' : 'md'
  }
  // 2. katman
  if (hop === 2) {
    return visibleMaxHop <= 2 ? 'md' : 'sm'
  }
  // 3+ katman
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
