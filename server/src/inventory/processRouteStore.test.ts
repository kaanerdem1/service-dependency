import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteProcessRoute,
  readProcessRoutes,
  renameProcessRoute,
  saveProcessRoute,
} from '../../../web/src/processRouteStore.js'

test('rota store görünür prefixi saklar, yeniden adlandırır ve siler', () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dispatchEvent: () => true },
  })

  const route = saveProcessRoute({
    processNo: 'P1',
    processTitle: 'Test',
    name: 'Onay rotası',
    status: 'draft',
    state: {
      visits: [
        { visitId: 'a::visit:1', nodeId: 'a', ordinal: 1 },
        { visitId: 'b::visit:1', nodeId: 'b', ordinal: 1, incomingEdgeId: 'a-b' },
        { visitId: 'c::visit:1', nodeId: 'c', ordinal: 1, incomingEdgeId: 'b-c' },
      ],
      cursor: 1,
    },
  })
  assert.equal(readProcessRoutes().routes[0].state.visits.length, 2)
  assert.equal(renameProcessRoute(route.id, 'Yeni ad').routes[0].name, 'Yeni ad')
  assert.equal(deleteProcessRoute(route.id).routes.length, 0)
})
