import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProcessFlowGraph } from '../src/types.ts'
import { buildGraph, focusHighlightFor } from '../src/components/process/processFlowMap/buildGraph.ts'
import { classifyRoute } from '../src/components/process/processFlowMap/edgeGeometry.ts'
import { RANK_SEP } from '../src/components/process/processFlowMap/constants.ts'

/** Minimal doğrusal süreç — layout regresyonu için sabit koordinat snapshot. */
const MINI_LINEAR: ProcessFlowGraph = {
  no: 'test-linear',
  oid: 'oid-test-linear',
  label: 'Linear',
  nodes: [
    { id: 'start-1', name: 'Başla', kind: 'start', services: [] },
    { id: 'task-1', name: 'Görev', kind: 'task', services: [] },
    { id: 'end-1', name: 'Bitir', kind: 'end', services: [] },
  ],
  edges: [
    { id: 'e1', from: 'start-1', to: 'task-1' },
    { id: 'e2', from: 'task-1', to: 'end-1' },
  ],
  positions: {},
}

test('buildGraph: mini zincir düğüm ve kenar sayısı', () => {
  const { nodes, edges } = buildGraph(MINI_LINEAR)
  assert.equal(nodes.length, 3)
  assert.equal(edges.length, 2)
  assert.ok(nodes.every((n) => n.type === 'processStep'))
  assert.ok(edges.every((e) => e.type === 'processEdge'))
})

test('buildGraph: mini zincir konumları (layeredLayout snapshot)', () => {
  const { nodes } = buildGraph(MINI_LINEAR)
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
  assert.deepEqual(pos['start-1'], { x: 60, y: 49.2 })
  assert.deepEqual(pos['task-1'], { x: 310, y: 49.2 })
  assert.deepEqual(pos['end-1'], { x: 560, y: 49.2 })
})

test('classifyRoute: ileri / jump / back sınıfları', () => {
  assert.equal(classifyRoute(100, 200), 'direct')
  assert.equal(classifyRoute(100, 100 + RANK_SEP * 0.9), 'jump')
  assert.equal(classifyRoute(400, 100), 'back')
})

test('focusHighlightFor: start→task kanonik yol', () => {
  const { edges } = buildGraph(MINI_LINEAR)
  const bundle = focusHighlightFor(MINI_LINEAR, 'task-1', edges)
  assert.ok(bundle)
  assert.equal(bundle!.canonical, true)
  assert.ok(bundle!.highlight.nodeIds.has('start-1'))
  assert.ok(bundle!.highlight.nodeIds.has('task-1'))
  assert.ok(bundle!.highlight.orderedIds.includes('start-1'))
})
