import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteProcessRoute,
  groupProcessRoutesByBpm,
  readProcessRoutes,
  renameProcessRoute,
  routeMatchesFilter,
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

test('rotalar BPM gruplarına ayrılır ve filtre ad veya süreç no ile eşleşir', () => {
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

  const visit = {
    visits: [{ visitId: 'a::visit:1', nodeId: 'a', ordinal: 1 }],
    cursor: 0,
  }
  saveProcessRoute({
    processNo: '105801',
    processTitle: 'Kredi',
    name: 'Onay rotası',
    status: 'completed',
    state: visit,
  })
  saveProcessRoute({
    processNo: '105251',
    processTitle: 'Tahsilat',
    name: 'İade yolu',
    status: 'completed',
    state: visit,
  })

  const groups = groupProcessRoutesByBpm(readProcessRoutes().routes)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].processNo, '105801')
  assert.equal(groups[0].routes.length, 1)

  assert.equal(routeMatchesFilter(groups[1].routes[0], '105251'), true)
  assert.equal(routeMatchesFilter(groups[0].routes[0], 'iade'), false)
  assert.equal(routeMatchesFilter(groups[1].routes[0], 'iade'), true)
})
