/**
 * Geçiş etiketlerinden servis adayları çıkarımı.
 * Kullanan: `ProcessFlowMap` kenar tooltip / servis ipuçları.
 */
import type { ProcessNodeDetails, ProcessDetailGroup } from '../../types'
import { transitionCaption } from './processUserRoute'

export function isTransitionDetailGroup(title: string): boolean {
  return title.toLowerCase().startsWith('geçiş')
}

function normalizeTransitionKey(key: string): string {
  return key.trim().toLowerCase()
}

export function transitionKeyFromGroupTitle(title: string): string {
  if (title.toLowerCase() === 'geçiş servisleri') return ''
  const match = title.match(/^Geçiş:\s*(.+)$/i)
  return match ? normalizeTransitionKey(match[1]) : normalizeTransitionKey(title)
}

export function parseServiceCodeFromRow(value: string): string {
  return value.split('·')[0]?.trim() ?? value.trim()
}

/** XML `Geçiş: …` grupları → geçiş adı → servis kodları. */
export function transitionServiceCodesFromDetails(
  details?: ProcessNodeDetails,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const group of details?.groups ?? []) {
    if (!isTransitionDetailGroup(group.title)) continue
    const key = transitionKeyFromGroupTitle(group.title)
    const codes: string[] = []
    for (const row of group.rows) {
      if (row.label !== 'Servis') continue
      const code = parseServiceCodeFromRow(row.value)
      if (code) codes.push(code)
    }
    if (codes.length) map.set(key, codes)
  }
  return map
}

export function servicesForOutgoingLabel(
  details: ProcessNodeDetails | undefined,
  label: string | undefined,
): string[] {
  const map = transitionServiceCodesFromDetails(details)
  if (!label?.trim()) return map.get('') ?? []
  const cap = transitionCaption(label) ?? label
  return map.get(normalizeTransitionKey(cap)) ?? []
}

export function servicesForOutgoingLabels(
  details: ProcessNodeDetails | undefined,
  labels: string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    for (const code of servicesForOutgoingLabel(details, label)) {
      if (!seen.has(code)) {
        seen.add(code)
        out.push(code)
      }
    }
  }
  if (!labels.length) {
    for (const code of servicesForOutgoingLabel(details, undefined)) {
      if (!seen.has(code)) out.push(code)
    }
  }
  return out
}

export function detailGroupsWithoutTransitionServices(
  groups: ProcessDetailGroup[],
): ProcessDetailGroup[] {
  return groups.filter((g) => !isTransitionDetailGroup(g.title))
}

export function allTransitionServiceCodes(details?: ProcessNodeDetails): string[] {
  const out = new Set<string>()
  for (const list of transitionServiceCodesFromDetails(details).values()) {
    for (const code of list) out.add(code)
  }
  return [...out]
}
