import assert from 'node:assert/strict'
import test from 'node:test'
import type { Express } from 'express'
import { registerCatalogRoutes } from './registerCatalogRoutes.js'

/** Refactor regresyonu: katalog HTTP uçları kaybolmasın / çoğalmasın. */
const EXPECTED_ROUTES: { method: string; path: string }[] = [
  { method: 'get', path: '/api/health' },
  { method: 'get', path: '/api/session-users' },
  { method: 'get', path: '/api/modules' },
  { method: 'get', path: '/api/modules/:nodeId/children' },
  { method: 'get', path: '/api/modules/:nodeId/non-service-methods' },
  { method: 'get', path: '/api/catalog/group/:nodeId' },
  { method: 'get', path: '/api/catalog/artifact/:nodeId' },
  { method: 'get', path: '/api/services' },
  { method: 'post', path: '/api/services/resolve-names' },
  { method: 'get', path: '/api/services/:id' },
  { method: 'get', path: '/api/services/:id/context' },
  { method: 'get', path: '/api/services/:id/tree-path' },
  { method: 'get', path: '/api/services/:id/neighbors' },
  { method: 'get', path: '/api/services/:id/affected' },
  { method: 'get', path: '/api/services/:id/impact' },
  { method: 'get', path: '/api/services/:id/methods' },
  { method: 'get', path: '/api/services/:id/processes' },
  { method: 'get', path: '/api/services/:id/screens' },
  { method: 'get', path: '/api/services/:id/locations' },
  { method: 'get', path: '/api/services/:id/notes' },
  { method: 'post', path: '/api/services/:id/notes' },
  { method: 'get', path: '/api/services/:id/change-requests' },
  { method: 'get', path: '/api/notes/counts' },
  { method: 'delete', path: '/api/notes/:noteId' },
  { method: 'get', path: '/api/processes' },
  { method: 'get', path: '/api/processes/:no/flow' },
  { method: 'get', path: '/api/processes/:no/screens' },
  { method: 'post', path: '/api/processes/resolve-refs' },
  { method: 'patch', path: '/api/processes/:no/node-descriptions' },
  { method: 'get', path: '/api/methods' },
  { method: 'get', path: '/api/methods/:id' },
  { method: 'get', path: '/api/methods/:id/callers' },
  { method: 'get', path: '/api/methods/:id/callees' },
  { method: 'get', path: '/api/methods/:id/impact' },
  { method: 'get', path: '/api/methods/:id/impact-graph' },
  { method: 'get', path: '/api/meta/process-parse-audit' },
  { method: 'get', path: '/api/meta/process-catalog-health' },
  { method: 'get', path: '/api/meta/call-graph-consistency' },
  { method: 'post', path: '/api/change-requests' },
  { method: 'get', path: '/api/change-requests/:id' },
  { method: 'patch', path: '/api/change-requests/:id/flags/:serviceId' },
  { method: 'get', path: '/api/change-requests/:id/snapshots' },
  { method: 'get', path: '/api/inbox/:ownerId' },
  { method: 'post', path: '/api/inbox/:ownerId/read' },
  { method: 'post', path: '/api/snapshots' },
  { method: 'get', path: '/api/snapshots/:id' },
  { method: 'get', path: '/api/snapshots/:id/image' },
]

function mockExpress(): { app: Express; routes: { method: string; path: string }[] } {
  const routes: { method: string; path: string }[] = []
  const chain = () => app
  const app = {
    get(path: string, ..._handlers: unknown[]) {
      routes.push({ method: 'get', path })
      return chain()
    },
    post(path: string, ..._handlers: unknown[]) {
      routes.push({ method: 'post', path })
      return chain()
    },
    patch(path: string, ..._handlers: unknown[]) {
      routes.push({ method: 'patch', path })
      return chain()
    },
    put(path: string, ..._handlers: unknown[]) {
      routes.push({ method: 'put', path })
      return chain()
    },
    delete(path: string, ..._handlers: unknown[]) {
      routes.push({ method: 'delete', path })
      return chain()
    },
  } as unknown as Express
  return { app, routes }
}

test('registerCatalogRoutes tüm katalog uçlarını kaydeder', () => {
  const { app, routes } = mockExpress()
  registerCatalogRoutes(app)
  const norm = (r: { method: string; path: string }) => `${r.method} ${r.path}`
  const got = routes.map(norm).sort()
  const want = EXPECTED_ROUTES.map(norm).sort()
  assert.deepEqual(got, want)
})
