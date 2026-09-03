import type {
  Snapshot,
  TrailAction,
  TrailEntry,
  UiChromeState,
} from '../types'
import { sidebarOpenLabel } from './sidebarState'

function sidebarLabel(ui: UiChromeState): string {
  return sidebarOpenLabel(ui.sidebarOpen)
}

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
  if (tab === 'screens') return 'Ekranlar sekmesi'
  if (tab === 'processes') return 'Process sekmesi'
  return 'Harita sekmesi'
}

function uiSnippet(ui: UiChromeState): string {
  const parts = [
    tabLabel(ui.activeTab),
    ui.drawerOpen ? 'etki özeti açık' : 'etki özeti kapalı',
    sidebarLabel(ui),
  ]
  if (ui.searchOpen) parts.push('arama açık')
  if (ui.selectedMethodId) parts.push(`metod seçili`)
  return parts.join(' · ')
}

function actionLabel(entry: TrailEntry): string {
  if (entry.detail?.trim()) return entry.detail.trim()
  if (entry.action === 'tree_select') return 'Ağaçtan servis seçildi'
  if (entry.action === 'map_select') return 'Haritadan yeni servis seçildi'
  if (entry.action === 'search_select') return 'Arama ile seçildi'
  if (entry.action === 'nav_back') return 'Geri (geçmiş)'
  if (entry.action === 'nav_forward') return 'İleri (geçmiş)'
  return ACTION_FALLBACK[entry.action] ?? entry.action
}

function shortServiceLabel(name: string, max = 36): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

/** Hop-1 = merkez değişince doğrudan etkilenen servisler (onay listesi) */
export function formatHop1Summary(snap: Snapshot): string {
  const rows = snap.impact.hop1
  if (!rows.length) return 'Doğrudan etkilenen servis yok'
  const n = rows.length
  const preview = rows
    .slice(0, 2)
    .map((r) => shortServiceLabel(r.label))
    .join(', ')
  const more = n > 2 ? ` ve ${n - 2} servis daha` : ''
  return `Doğrudan etkilenen ${n} servis: ${preview}${more}`
}

export function formatHop1Title(snap: Snapshot): string | undefined {
  const rows = snap.impact.hop1
  if (!rows.length) return undefined
  return rows.map((r) => r.label).join('\n')
}

export function formatTrailEntry(entry: TrailEntry, index: number): string {
  const time = new Date(entry.at).toLocaleTimeString('tr-TR')
  const action = actionLabel(entry)
  const target = entry.target?.label
    ? ` → ${shortServiceLabel(entry.target.label, 48)}`
    : ''
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
        : snap.uiChrome.activeTab === 'screens'
          ? 'Ekranlar'
          : snap.uiChrome.activeTab === 'processes'
            ? 'Process'
            : 'Harita'
  const drawer = snap.uiChrome.drawerOpen ? 'etki özeti açık' : 'etki özeti kapalı'
  return `Son durum: ${layout} · katman ${v.visibleMaxHop}/${v.maxHopAvailable} · ${cascade} · ${tab} · ${drawer} · ${sidebarLabel(snap.uiChrome)}`
}
