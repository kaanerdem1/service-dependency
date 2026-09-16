import type { AppSurface } from './components/SurfaceSwitch'
import type { StageTabId } from './motion/StageTabs'

const STORAGE_KEY = 'sd-app-navigation-v1'

export type PersistedVisitEntry = {
  id: string
  visibleMaxHop: number
  expandedLayers: number[]
}

export type PersistedCatalogNode = {
  id: string
  kind: 'group' | 'package'
  name: string
}

export type PersistedSidebarDrawer = 'none' | 'shortcuts' | 'workflows'

export type PersistedAppNav = {
  v: 1
  surface: AppSurface
  sidebarDrawer?: PersistedSidebarDrawer
  tab?: StageTabId
  pivotId?: string
  selectedMethodId?: string
  catalogNode?: PersistedCatalogNode | null
  processFlowNo?: string
  processRouteId?: string
  workflowInfoId?: string
  workflowResumeId?: string
  processFlowStack?: Array<{ processNo: string; nodeId?: string }>
  history?: PersistedVisitEntry[]
  historyIndex?: number
  treeQuery?: string
}

function isSurface(value: unknown): value is AppSurface {
  return value === 'services' || value === 'dwh'
}

export function readPersistedAppNav(): PersistedAppNav | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedAppNav
    if (parsed?.v !== 1 || !isSurface(parsed.surface)) return null
    return parsed
  } catch {
    return null
  }
}

export function writePersistedAppNav(nav: PersistedAppNav): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nav))
  } catch {
    /* quota / private mode */
  }
}
