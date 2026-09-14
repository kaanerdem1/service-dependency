import assert from 'node:assert/strict'
import test from 'node:test'
import { auditProcessDefinitionXml, parseProcessDefinitionXml } from './parProcessParser.js'

test('audit: örnek XML parser ile birebir uyumlu', () => {
  const xml = `<process-definition name="P1">
      <start-state name="Başlangıç">
        <transition name="Devam" to="Ara"/>
      </start-state>
      <node name="Ara" />
      <end-state name="Bitiş"/>
    </process-definition>`
  const audit = auditProcessDefinitionXml(xml, 'fallback')
  assert.equal(audit.ok, true, audit.issues.join('; '))
})

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

test('karar düğümünde geçiş içi servisler details Geçiş grubunda', () => {
  const graph = parseProcessDefinitionXml(
    `<process-definition name="P4">
      <decision name="YetkiKarar">
        <handler class="tr.example.MakerDecisionHandler"/>
        <transition name="Onayla" to="Son">
          <event type="transition">
            <service service-name="SVC_ONAYLA" call-type="sync"/>
          </event>
        </transition>
        <transition name="Reddet" to="Son"/>
      </decision>
      <end-state name="Son"/>
    </process-definition>`,
    'fallback',
  )
  const node = graph.nodes.find((n) => n.id === 'YetkiKarar')
  assert.ok(node?.details?.groups.some((g) => g.title === 'Geçiş: Onayla'))
  const geçis = node?.details?.groups.find((g) => g.title === 'Geçiş: Onayla')
  assert.ok(geçis?.rows.some((r) => r.value.includes('SVC_ONAYLA')))
  assert.ok(node?.services.includes('SVC_ONAYLA'))
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
