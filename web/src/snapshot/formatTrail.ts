import type {
  Snapshot,
  TrailAction,
  TrailEntry,
  UiChromeState,
} from '../types'

/** detail yoksa eski snapshot’lar için kaba geri dönüş */
const ACTION_FALLBACK: Partial<Record<TrailAction, string>> = {
  layer_change: 'Katman ayarı değiştirildi',
  cascade_toggle: 'Yan bağ görünümü değiştirildi',
  layout_toggle: 'Layout değiştirildi',
  drawer_toggle: 'Etki özeti değiştirildi',
  sidebar_toggle: 'Sol modül paneli değiştirildi',
  theme_toggle: 'Tema değiştirildi',
  tab_change: 'Sekme değiştirildi',
}

function tabLabel(tab: UiChromeState['activeTab']): string {
  if (tab === 'affected') return 'İlişkiler sekmesi'
  if (tab === 'overview') return 'Servis işlevi sekmesi'
  return 'Harita sekmesi'
}

function uiSnippet(ui: UiChromeState): string {
  const parts = [
    tabLabel(ui.activeTab),
    ui.drawerOpen ? 'etki özeti açık' : 'etki özeti kapalı',
    ui.sidebarOpen ? 'sol modül paneli açık' : 'sol modül paneli kapalı',
  ]
  if (ui.searchOpen) parts.push('arama açık')
  if (ui.selectedMethodId) parts.push(`method: ${ui.selectedMethodId}`)
  return parts.join(' · ')
}

function actionLabel(entry: TrailEntry): string {
  if (entry.detail?.trim()) return entry.detail.trim()
  if (entry.action === 'tree_select') return 'Ağaçtan servis seçildi'
  if (entry.action === 'map_select') return 'Haritadan pivot'
  if (entry.action === 'search_select') return 'Arama ile seçildi'
  if (entry.action === 'nav_back') return 'Geri (geçmiş)'
  if (entry.action === 'nav_forward') return 'İleri (geçmiş)'
  return ACTION_FALLBACK[entry.action] ?? entry.action
}

export function formatTrailEntry(entry: TrailEntry, index: number): string {
  const time = new Date(entry.at).toLocaleTimeString('tr-TR')
  const action = actionLabel(entry)
  const target = entry.target?.label ? ` → ${entry.target.label}` : ''
  return `${index + 1}. ${time} — ${action}${target} (${uiSnippet(entry.uiAfter)})`
}

export function formatTrailSummary(trail: TrailEntry[]): string[] {
  return trail.map((entry, i) => formatTrailEntry(entry, i))
}

export function formatViewStateSummary(snap: Snapshot): string {
  const v = snap.viewState
  const layout = v.layout === 'radial' ? 'Radial' : 'LTR'
  const cascade = v.showCascadeEdges ? 'yan bağ açık' : 'yan bağ kapalı'
  const tab =
    snap.uiChrome.activeTab === 'affected'
      ? 'İlişkiler'
      : snap.uiChrome.activeTab === 'overview'
        ? 'Servis işlevi'
        : 'Harita'
  const drawer = snap.uiChrome.drawerOpen ? 'etki özeti açık' : 'etki özeti kapalı'
  const sidebar = snap.uiChrome.sidebarOpen
    ? 'sol modül paneli açık'
    : 'sol modül paneli kapalı'
  return `Son durum: ${layout} · katman ${v.visibleMaxHop}/${v.maxHopAvailable} · ${cascade} · ${tab} · ${drawer} · ${sidebar}`
}
