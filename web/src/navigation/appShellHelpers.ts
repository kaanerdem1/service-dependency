/**
 * Kabuk yardımcıları — drawer başlangıcı ve klavye hedefi.
 *
 * Ne yapar: Persist edilen nav’dan favoriler/iş akışları drawer’ını açar;
 *   kısayol dinleyicilerinin input içinde çalışmamasını sağlar.
 * Ne yapmaz: State tutmaz.
 */

type RestoredNav = {
  sidebarDrawer?: 'none' | 'shortcuts' | 'workflows'
  processFlowNo?: string
  processRouteId?: string
  workflowInfoId?: string
} | null

export function initialSidebarDrawer(restored: RestoredNav): {
  shortcutsOpen: boolean
  workflowsOpen: boolean
} {
  const drawer = restored?.sidebarDrawer
  if (drawer === 'shortcuts') return { shortcutsOpen: true, workflowsOpen: false }
  if (drawer === 'workflows') return { shortcutsOpen: false, workflowsOpen: true }
  if (restored?.processFlowNo || restored?.processRouteId || restored?.workflowInfoId) {
    return { shortcutsOpen: false, workflowsOpen: true }
  }
  return { shortcutsOpen: false, workflowsOpen: false }
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
