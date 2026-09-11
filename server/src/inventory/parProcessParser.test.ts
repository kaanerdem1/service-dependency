import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProcessDefinitionXml } from './parProcessParser.js'

test('root seviyesindeki self-closing düğümleri kaybetmez', () => {
  const graph = parseProcessDefinitionXml(
    `<process-definition name="P1">
      <start-state name="Başlangıç">
        <transition name="Devam" to="Ara"/>
      </start-state>
      <node name="Ara" />
      <end-state name="Bitiş"/>
    </process-definition>`,
    'fallback',
  )

  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['Başlangıç', 'Ara', 'Bitiş'],
  )
  assert.equal(graph.edges[0]?.to, 'Ara')
})

test('iç içe self-closing aynı tag kapanış derinliğini bozmaz', () => {
  const graph = parseProcessDefinitionXml(
    `<process-definition name="P2">
      <node name="A">
        <node name="metadata"/>
        <transition name="İlerle" to="B"/>
      </node>
      <task-node name="B">
        <transition to="Son"/>
      </task-node>
      <end-state name="Son"/>
    </process-definition>`,
    'fallback',
  )

  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['A', 'B', 'Son'],
  )
  assert.deepEqual(
    graph.edges.map((edge) => [edge.from, edge.to]),
    [
      ['A', 'B'],
      ['B', 'Son'],
    ],
  )
})

test('bozuk bir düğümden sonra gelen geçerli kök düğümleri parse eder', () => {
  const originalWarn = console.warn
  const warnings: string[] = []
  console.warn = (message?: unknown) => warnings.push(String(message))

  try {
    const graph = parseProcessDefinitionXml(
      `<process-definition name="P3">
        <node name="Bozuk">
        <task-node name="Sağlam">
          <transition to="Son"/>
        </task-node>
        <end-state name="Son"/>
      </process-definition>`,
      'fallback',
    )

    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ['Sağlam', 'Son'],
    )
    assert.match(warnings[0] ?? '', /Bozuk.*atlandı/)
  } finally {
    console.warn = originalWarn
  }
})
