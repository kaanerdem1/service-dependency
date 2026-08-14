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
export const MAP_INFO_PANEL_RESERVE = 268

export function mapLeftX(): number {
  return 48 + MAP_INFO_PANEL_RESERVE
}

/** fitView kenar boşluğu */
export function fitViewPaddingForLayout(layout: MapLayout): number {
  return layout.fitPadding + 0.06
}

/** Görünen max hop’a göre layout (1 = yalnızca komşular) */
export function mapLayoutForDepth(visibleMaxHop: number): MapLayout {
  if (visibleMaxHop <= 1) {
    return {
      size: 'lg',
      nodeW: 288,
      colGap: 360,
      rowGap: 118,
      tipChars: 52,
      minZoom: 0.55,
      maxZoom: 1.4,
      fitPadding: 0.16,
    }
  }
  if (visibleMaxHop === 2) {
    return {
      size: 'md',
      nodeW: 248,
      colGap: 300,
      rowGap: 104,
      tipChars: 44,
      minZoom: 0.4,
      maxZoom: 1.25,
      fitPadding: 0.2,
    }
  }
  return {
    size: 'sm',
    nodeW: 200,
    colGap: 240,
    rowGap: 90,
    tipChars: 36,
    minZoom: 0.28,
    maxZoom: 1.15,
    fitPadding: 0.22,
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
