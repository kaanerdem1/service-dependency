import type { UserRouteState } from './components/processUserRoute'

export const PROCESS_ROUTES_CHANGED_EVENT = 'sd-process-routes-changed'
const STORAGE_KEY = 'sd-process-flow-routes:v1'
const MAX_ROUTES = 60
const MAX_VISITS = 300

export type SavedProcessRoute = {
  id: string
  processNo: string
  processTitle: string
  name: string
  state: UserRouteState
  status: 'draft' | 'completed'
  graphUpdatedAt?: string | null
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

type ProcessRouteStore = { routes: SavedProcessRoute[] }

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 140) : fallback
}

function normalizeRoute(value: unknown): SavedProcessRoute | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<SavedProcessRoute>
  if (!cleanText(row.id) || !cleanText(row.processNo) || !cleanText(row.name)) return null
  const visits = Array.isArray(row.state?.visits)
    ? row.state.visits
        .filter((visit) => visit && typeof visit.nodeId === 'string' && typeof visit.visitId === 'string')
        .slice(0, MAX_VISITS)
    : []
  if (!visits.length) return null
  const cursor = Math.max(0, Math.min(Number(row.state?.cursor ?? visits.length - 1), visits.length - 1))
  const now = Date.now()
  return {
    id: cleanText(row.id),
    processNo: cleanText(row.processNo),
    processTitle: cleanText(row.processTitle, cleanText(row.processNo)),
    name: cleanText(row.name),
    state: { visits, cursor },
    status: 'completed',
    graphUpdatedAt: typeof row.graphUpdatedAt === 'string' ? row.graphUpdatedAt : null,
    createdAt: Number(row.createdAt) || now,
    updatedAt: Number(row.updatedAt) || now,
    lastOpenedAt: Number(row.lastOpenedAt) || Number(row.updatedAt) || now,
  }
}

export function readProcessRoutes(): ProcessRouteStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { routes?: unknown[] }
    const routes = (parsed.routes ?? [])
      .map(normalizeRoute)
      .filter((route): route is SavedProcessRoute => Boolean(route))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ROUTES)
    return { routes }
  } catch {
    return { routes: [] }
  }
}

function writeProcessRoutes(routes: SavedProcessRoute[]): ProcessRouteStore {
  const next = { routes: routes.slice(0, MAX_ROUTES) }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(PROCESS_ROUTES_CHANGED_EVENT))
  } catch {
    // Quota/privacy mode: keep the UI usable; caller receives in-memory result.
  }
  return next
}

export function getProcessRoute(id?: string): SavedProcessRoute | undefined {
  if (!id) return undefined
  return readProcessRoutes().routes.find((route) => route.id === id)
}

export function saveProcessRoute(input: {
  id?: string
  processNo: string
  processTitle: string
  name: string
  state: UserRouteState
  status: SavedProcessRoute['status']
  graphUpdatedAt?: string | null
}): SavedProcessRoute {
  const store = readProcessRoutes()
  const existing = input.id ? store.routes.find((route) => route.id === input.id) : undefined
  const now = Date.now()
  const visibleVisits = input.state.visits.slice(0, input.state.cursor + 1)
  const route: SavedProcessRoute = {
    id: existing?.id ?? `pr-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    processNo: input.processNo,
    processTitle: input.processTitle,
    name: input.name.trim().slice(0, 140),
    state: { visits: visibleVisits, cursor: visibleVisits.length - 1 },
    status: 'completed',
    graphUpdatedAt: input.graphUpdatedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastOpenedAt: now,
  }
  writeProcessRoutes([route, ...store.routes.filter((item) => item.id !== route.id)])
  return route
}

export function deleteProcessRoute(id: string): ProcessRouteStore {
  return writeProcessRoutes(readProcessRoutes().routes.filter((route) => route.id !== id))
}

export function renameProcessRoute(id: string, name: string): ProcessRouteStore {
  const nextName = name.trim().slice(0, 140)
  if (!nextName) return readProcessRoutes()
  const now = Date.now()
  return writeProcessRoutes(
    readProcessRoutes().routes.map((route) =>
      route.id === id ? { ...route, name: nextName, updatedAt: now } : route,
    ),
  )
}

export function touchProcessRoute(id: string): ProcessRouteStore {
  const now = Date.now()
  return writeProcessRoutes(
    readProcessRoutes().routes.map((route) =>
      route.id === id ? { ...route, lastOpenedAt: now } : route,
    ),
  )
}

export function routesForPanel(activeProcessNo?: string): SavedProcessRoute[] {
  const routes = readProcessRoutes().routes
  return [...routes].sort((a, b) => {
    const aActive = a.processNo === activeProcessNo ? 1 : 0
    const bActive = b.processNo === activeProcessNo ? 1 : 0
    return bActive - aActive || b.lastOpenedAt - a.lastOpenedAt
  })
}
