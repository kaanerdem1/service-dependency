const STORAGE_KEY = 'sd-dwh-navigation-v1'

export type PersistedDwhVisit = {
  kind: 'table' | 'report'
  id: number
  name: string
}

export type PersistedDwhNav = {
  v: 1
  catalogTab: 'tables' | 'reports'
  favoritesOpen?: boolean
  stageTab: 'map' | 'lineage' | 'query' | 'columns' | 'impact'
  detailKind: 'table' | 'report'
  selectedTableId?: number
  selectedReportId?: number
  rootTableId?: number
  rootReportId?: number
  visitHistory?: PersistedDwhVisit[]
  visitIndex?: number
}

export function readPersistedDwhNav(): PersistedDwhNav | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedDwhNav
    if (parsed?.v !== 1) return null
    if (parsed.catalogTab !== 'tables' && parsed.catalogTab !== 'reports') return null
    return parsed
  } catch {
    return null
  }
}

export function writePersistedDwhNav(nav: PersistedDwhNav): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nav))
  } catch {
    /* quota / private mode */
  }
}
