import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProcessFlowGraph } from '../../../web/src/types.js'
import {
  autoAdvanceRoute,
  chooseRouteEdge,
  createUserRoute,
  goRouteBack,
  goRouteForward,
  reconcileRouteWithGraph,
  routeProgress,
  routeVisibleVisitsEqual,
  savedRouteHasChanges,
  transitionCaption,
  visibleRouteVisits,
} from '../../../web/src/components/process/processUserRoute.js'
import { buildUserRouteSnapshotSteps } from '../../../web/src/components/process/processPathNarrative.js'

const graph: ProcessFlowGraph = {
  no: 'P1',
  oid: '1',
  label: 'Test',
  positions: {},
  nodes: [
    { id: 'start', name: 'Başlangıç', kind: 'start', services: [] },
    { id: 'check', name: 'Kontrol', kind: 'decision', services: [] },
    { id: 'approve', name: 'Onay', kind: 'task', services: [] },
    { id: 'edit', name: 'Düzelt', kind: 'task', services: [] },
    { id: 'done', name: 'Bitti', kind: 'end', services: [] },
  ],
  edges: [
    { id: 'start-check', from: 'start', to: 'check' },
    { id: 'yes', from: 'check', to: 'approve', label: 'Evet' },
    { id: 'no', from: 'check', to: 'edit', label: 'Hayır' },
    { id: 'approve-done', from: 'approve', to: 'done' },
    { id: 'edit-check', from: 'edit', to: 'check' },
  ],
}

test('tek çıkışlı zincirde dallanmaya kadar otomatik ilerler', () => {
  const route = autoAdvanceRoute(graph, createUserRoute(graph))
  assert.deepEqual(visibleRouteVisits(route).map((visit) => visit.nodeId), ['start', 'check'])
})

test('seçimden sonra bitişe ilerler ve tamamlanır', () => {
  const initial = autoAdvanceRoute(graph, createUserRoute(graph))
  const route = chooseRouteEdge(graph, initial, 'yes')
  assert.deepEqual(visibleRouteVisits(route).map((visit) => visit.nodeId), [
    'start',
    'check',
    'approve',
    'done',
  ])
  assert.equal(routeProgress(graph, route), 'completed')
})

test('döngüde aynı düğümü yeni ziyaret olarak tutar', () => {
  const initial = autoAdvanceRoute(graph, createUserRoute(graph))
  const route = chooseRouteEdge(graph, initial, 'no')
  assert.deepEqual(visibleRouteVisits(route).map((visit) => visit.nodeId), [
    'start',
    'check',
    'edit',
    'check',
  ])
  assert.equal(route.visits.at(-1)?.ordinal, 2)
})

test('geri/ileri çalışır; geri sonrası yeni seçim ileri geçmişini siler', () => {
  const initial = autoAdvanceRoute(graph, createUserRoute(graph))
  const approved = chooseRouteEdge(graph, initial, 'yes')
  const back = goRouteBack(goRouteBack(approved))
  assert.deepEqual(visibleRouteVisits(back).map((visit) => visit.nodeId), ['start', 'check'])
  assert.equal(visibleRouteVisits(goRouteForward(back)).at(-1)?.nodeId, 'approve')
  const changed = chooseRouteEdge(graph, back, 'no')
  assert.equal(changed.visits.some((visit) => visit.nodeId === 'approve'), false)
})

test('eski grafik kimlikleri rotayı son geçerli occurrence noktasında keser', () => {
  const route = chooseRouteEdge(
    graph,
    autoAdvanceRoute(graph, createUserRoute(graph)),
    'yes',
  )
  const changedGraph = { ...graph, edges: graph.edges.filter((edge) => edge.id !== 'approve-done') }
  const reconciled = reconcileRouteWithGraph(changedGraph, route)
  assert.deepEqual(reconciled.visits.map((visit) => visit.nodeId), ['start', 'check', 'approve'])
})

test('PDF anlatımı seçilen edge ve tekrar ziyaretleri kronolojik korur', () => {
  const route = chooseRouteEdge(
    graph,
    autoAdvanceRoute(graph, createUserRoute(graph)),
    'no',
  )
  const steps = buildUserRouteSnapshotSteps(graph, route.visits)
  assert.deepEqual(steps.map((step) => step.displayStep), [1, 2, 3, 4])
  assert.equal(steps[1].outgoing[0].label, 'Hayır')
  assert.match(steps[3].name, /2\. ziyaret/)
})

test('boş XML transition name etiketsiz kalır', () => {
  assert.equal(transitionCaption(undefined), undefined)
  assert.equal(transitionCaption('  '), undefined)
  assert.equal(transitionCaption('Onayla'), 'Onayla')

  const unlabeled: ProcessFlowGraph = {
    ...graph,
    edges: [
      { id: 'start-check', from: 'start', to: 'check' },
      { id: 'to-end', from: 'check', to: 'done' },
    ],
  }
  const route = autoAdvanceRoute(unlabeled, createUserRoute(unlabeled))
  assert.deepEqual(visibleRouteVisits(route).map((visit) => visit.nodeId), ['start', 'check', 'done'])
  const back = goRouteBack(route)
  assert.equal(visibleRouteVisits(back).at(-1)?.nodeId, 'check')
  assert.equal(transitionCaption(visibleRouteVisits(back).at(-1)?.incomingLabel), undefined)
})

test('savedRouteHasChanges adım veya ad farkını algılar', () => {
  const base = autoAdvanceRoute(graph, createUserRoute(graph))
  const branched = chooseRouteEdge(graph, goRouteBack(base), 'check-edit')
  assert.ok(routeVisibleVisitsEqual(base, base))
  assert.ok(!routeVisibleVisitsEqual(base, branched))
  assert.ok(!savedRouteHasChanges(base, base, 'Rota A', 'Rota A'))
  assert.ok(savedRouteHasChanges(base, base, 'Rota B', 'Rota A'))
  assert.ok(savedRouteHasChanges(branched, base, 'Rota A', 'Rota A'))
})
