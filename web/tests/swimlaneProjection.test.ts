import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDwhSwimlaneProjection } from '../src/dwh/swimlaneProjection.ts'
import type { DwhLineageGraph, DwhLineageNode } from '../src/dwh/types.ts'

function node(
  id: string,
  entityKey: string,
  depth: number,
  layer: string | null,
  kind: DwhLineageNode['kind'] = 'table',
): DwhLineageNode {
  const tableId = Number(entityKey.replace('table:', ''))
  return {
    id,
    entityKey,
    entityKind: 'table',
    kind,
    label: `TABLE_${tableId}`,
    tableId,
    layer,
    depth,
  }
}

test('keeps occurrences separate and preserves the layer lane', () => {
  const graph: DwhLineageGraph = {
    rootId: 'report:1',
    rootKind: 'report',
    truncated: false,
    maxDepth: 4,
    nodes: [
      {
        id: 'report:1',
        entityKey: 'report:1',
        entityKind: 'report',
        kind: 'report',
        label: 'REPORT_1',
        reportId: 1,
        depth: 0,
      },
      node('a-main', 'table:10', 1, 'LD'),
      node('a-ref', 'table:10', 1, 'LD', 'reference'),
      {
        id: 'subquery:7',
        entityKey: 'subquery:7',
        entityKind: 'subquery',
        kind: 'subquery',
        label: 'CTE',
        subqueryId: 7,
        depth: 2,
      },
      node('b-main', 'table:20', 3, 'TR'),
    ],
    edges: [
      { id: 'report-a-1', source: 'a-main', target: 'report:1', kind: 'reportSql' },
      { id: 'report-a-2', source: 'a-ref', target: 'report:1', kind: 'reportSql' },
      { id: 'a-subquery', source: 'subquery:7', target: 'a-main', kind: 'subquery' },
      {
        id: 'subquery-b',
        source: 'b-main',
        target: 'subquery:7',
        kind: 'statement',
        statementIds: [41, 42],
      },
    ],
  }

  const projection = buildDwhSwimlaneProjection(graph, ['LD', 'TR'])
  const tableA = projection.nodes.find((item) => item.node.entityKey === 'table:10')
  const tableB = projection.nodes.find((item) => item.node.entityKey === 'table:20')
  assert.equal(tableA?.occurrenceCount, 1)
  assert.equal(projection.nodes.find((item) => item.node.id === 'a-ref')?.referenceCount, 1)
  assert.equal(projection.nodes.length, 4)
  assert.equal(tableA?.layer, 'LD')
  assert.equal(tableB?.layer, 'TR')

  const reportEdges = projection.edges.filter((edge) => edge.source === 'report:1')
  assert.equal(reportEdges.length, 2)
  assert.deepEqual(new Set(reportEdges.map((edge) => edge.target)), new Set(['a-main', 'a-ref']))

  const statementEdge = projection.edges.find(
    (edge) => edge.source === tableA?.id && edge.target === tableB?.id,
  )
  assert.deepEqual(statementEdge?.statementIds, [41, 42])
  assert.equal(statementEdge?.kind, 'statement')
  assert.equal(statementEdge?.relationCount, 1)
  assert.equal(projection.edges.some((edge) => edge.source === 'subquery:7'), false)
})

test('does not bridge across a hidden real table', () => {
  const graph: DwhLineageGraph = {
    rootId: 'table:1',
    rootKind: 'table',
    truncated: false,
    maxDepth: 3,
    nodes: [
      node('table:1', 'table:1', 0, 'LD'),
      node('hidden-tr', 'table:2', 1, 'TR'),
      node('visible-ex', 'table:3', 2, 'EX'),
    ],
    edges: [
      { id: 'root-tr', source: 'hidden-tr', target: 'table:1', kind: 'statement' },
      { id: 'tr-ex', source: 'visible-ex', target: 'hidden-tr', kind: 'statement' },
    ],
  }

  const projection = buildDwhSwimlaneProjection(graph, ['LD', 'EX'])
  assert.deepEqual(projection.nodes.map((item) => item.id), ['table:1'])
  assert.equal(projection.edges.length, 0)
})
