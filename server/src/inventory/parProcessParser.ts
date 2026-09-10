import { ELEMENT_SIZES, layoutProcess, type BpmnElementType, type BpmnFlowElement, type BpmnProcess } from '@bpmnkit/core'

export type ProcessFlowNodeKind =
  | 'start'
  | 'end'
  | 'task'
  | 'decision'
  | 'service'
  | 'other'
  | 'dummy'

/** Bir karar (decision) düğümünün handler'ı, hangi kriter (organizasyon,
 * profil, kanal...) hangi geçişe (transition) eşleniyor bilgisini taşır —
 * XML'deki <handler>/<makers>/<maker> bloklarından çıkarılır. Amaç: BPM
 * sürecindeki "KBPFYET", "TRMBP" gibi kodların NEYE göre seçildiğini UI'da
 * gösterebilmek (bkz. ProcessFlowCanvas karar düğümü ipucu). */
export type ProcessDecisionRule = {
  /** Geçişin adı — ProcessFlowEdge.label ile eşleşir (örn. "KBPFYET"). */
  transition: string
  /** Boş olmayan kriter alanları, örn. { organization: '794', profile: '384' }. */
  criteria: Record<string, string>
}

export type ProcessDecisionInfo = {
  /** jBPM handler sınıfı (örn. tr.com.cs.foja.bpm.core.decision.MakerDecisionHandler). */
  handlerClass?: string
  rules: ProcessDecisionRule[]
}

export type ProcessFlowNode = {
  id: string
  name: string
  kind: ProcessFlowNodeKind
  services: string[]
  /** Sadece kind === 'decision' için: XML handler'ından çıkarılan kural seti. */
  decisionInfo?: ProcessDecisionInfo
  /** XML’deki tek düğüm; canvas’ta kararın yanında gösterilen kopya. */
  copyOf?: string
}

export type ProcessFlowEdge = {
  id: string
  from: string
  to: string
  label?: string
  /** Alt otobüs: 2 ara nokta (katman katman yılan değil). */
  via?: string[]
}

export type ProcessFlowGraph = {
  no: string
  label: string | null
  nodes: ProcessFlowNode[]
  edges: ProcessFlowEdge[]
}

const NODE_TAGS = [
  'start-state',
  'end-state',
  'task-node',
  'decision',
  'node',
  'state',
  'process-state',
  'fork',
  'join',
] as const

function kindFromTag(tag: string, inner: string): ProcessFlowNodeKind {
  if (tag === 'start-state') return 'start'
  if (tag === 'end-state') return 'end'
  if (tag === 'decision' || tag === 'fork') return 'decision'
  if (tag === 'task-node') return 'task'
  if (/execute-services/i.test(inner) || /service-name=/i.test(inner)) return 'service'
  return 'other'
}

function attr(open: string, name: string): string | undefined {
  const m = open.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))
  return m?.[1]
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function findTagClose(xml: string, start: number, tag: string): number {
  const re = new RegExp(`<${tag}\\b([^>]*?)(/)?\\s*>|</${tag}\\s*>`, 'gi')
  re.lastIndex = start
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const isClose = m[0].startsWith('</')
    const selfClose = Boolean(m[2])
    if (isClose) {
      depth -= 1
      if (depth === 0) return m.index + m[0].length
    } else if (!selfClose) {
      depth += 1
    }
  }
  return -1
}

function extractRootChildren(xml: string): { tag: string; open: string; inner: string }[] {
  const defOpen = xml.match(/<process-definition\b[^>]*>/i)
  if (!defOpen || defOpen.index == null) return []
  const bodyStart = defOpen.index + defOpen[0].length
  const bodyEnd = xml.toLowerCase().lastIndexOf('</process-definition>')
  const body = bodyEnd > bodyStart ? xml.slice(bodyStart, bodyEnd) : xml.slice(bodyStart)
  const out: { tag: string; open: string; inner: string }[] = []
  const tagAlt = NODE_TAGS.join('|')
  const re = new RegExp(`<(${tagAlt})\\b([^>]*)(/?)>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase()
    const open = m[0]
    if (m[3] === '/') {
      out.push({ tag, open, inner: '' })
      continue
    }
    const innerStart = m.index + m[0].length
    const closeAt = findTagClose(body, innerStart, tag)
    if (closeAt < 0) continue
    out.push({ tag, open, inner: body.slice(innerStart, closeAt) })
    re.lastIndex = closeAt
  }
  return out
}

function extractTransitions(inner: string, open: string): { name?: string; to: string }[] {
  const hay = `${open}\n${inner}`
  const rows: { name?: string; to: string }[] = []
  const re = /<transition\b([^>]*)\/?>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(hay))) {
    const to = attr(m[1], 'to')
    if (!to) continue
    const name = attr(m[1], 'name')
    rows.push({ to: decode(to), name: name ? decode(name) : undefined })
  }
  return rows
}

/** Karar (decision) düğümünün <handler class="..."> bloğunu okur. Çoğu BPM
 * karar handler'ı (örn. MakerDecisionHandler) tekrarlayan "kayıt" blokları
 * kullanır (<maker>...<transitionRef>X</transitionRef></maker>) — hangi
 * geçişin hangi kriterle seçildiğini generic biçimde çıkarır: aynı adı
 * tekrar eden, öznitesiz (attribute'suz) her `<tag>...</tag>` bloğunu bir
 * "kayıt" say, içinde transitionRef/transition/ref/outcome benzeri bir alan
 * varsa onu geçiş adı, diğer boş olmayan yaprakları kriter olarak al. */
function extractDecisionInfo(inner: string): ProcessDecisionInfo | undefined {
  const handlerMatch = inner.match(/<handler\s+class\s*=\s*"([^"]+)"/i)
  if (!handlerMatch) return undefined
  const handlerClass = decode(handlerMatch[1])
  const rules: ProcessDecisionRule[] = []
  const refFieldRe = /^(transitionRef|transition-ref|outcome|ref)$/i
  const blockRe = /<(\w+)>((?:(?!<\/?\1\b)[\s\S])*?)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(inner))) {
    const body = m[2]
    const refMatch = body.match(/<(transitionRef|transition-ref|outcome|ref)>([^<]*)<\/\1>/i)
    if (!refMatch) continue
    const transition = decode(refMatch[2]).trim()
    if (!transition) continue
    const criteria: Record<string, string> = {}
    const leafRe = /<(\w+)>([^<]*)<\/\1>/g
    let lm: RegExpExecArray | null
    while ((lm = leafRe.exec(body))) {
      const key = lm[1]
      if (refFieldRe.test(key)) continue
      const value = decode(lm[2]).trim()
      if (!value) continue
      criteria[key] = value
    }
    rules.push({ transition, criteria })
  }
  return { handlerClass, rules }
}

function extractServices(inner: string): string[] {
  const names: string[] = []
  const re = /service-name\s*=\s*"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(inner))) {
    const name = decode(m[1]).trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

export function parseProcessDefinitionXml(xml: string, fallbackNo: string): ProcessFlowGraph {
  const defOpen = xml.match(/<process-definition\b[^>]*>/i)?.[0] ?? ''
  const no = attr(defOpen, 'name') || fallbackNo
  const labelRaw = attr(defOpen, 'label')
  const children = extractRootChildren(xml)
  const nodes: ProcessFlowNode[] = []
  const edges: ProcessFlowEdge[] = []
  const seen = new Set<string>()

  for (const child of children) {
    const name = attr(child.open, 'name')
    if (!name) continue
    const id = decode(name)
    if (seen.has(id)) continue
    seen.add(id)
    const kind = kindFromTag(child.tag, child.inner)
    const services = extractServices(child.inner)
    nodes.push({
      id,
      name: id,
      kind,
      services,
      decisionInfo: kind === 'decision' ? extractDecisionInfo(child.inner) : undefined,
    })
    for (const tr of extractTransitions(child.inner, child.open)) {
      edges.push({
        id: `${id}→${tr.to}:${tr.name ?? ''}`,
        from: id,
        to: tr.to,
        label: tr.name?.trim() ? tr.name.trim() : undefined,
      })
    }
  }

  for (const e of edges) {
    if (!seen.has(e.to)) {
      seen.add(e.to)
      nodes.push({ id: e.to, name: e.to, kind: 'other', services: [] })
    }
  }

  return {
    no,
    label: labelRaw ? decode(labelRaw) : null,
    nodes,
    edges,
  }
}

function bpmnTypeFor(kind: ProcessFlowNodeKind): BpmnElementType {
  if (kind === 'start') return 'startEvent'
  if (kind === 'end') return 'endEvent'
  if (kind === 'decision') return 'exclusiveGateway'
  if (kind === 'service') return 'serviceTask'
  if (kind === 'task') return 'userTask'
  return 'task'
}

function toBpmnElement(node: ProcessFlowNode): BpmnFlowElement {
  const type = bpmnTypeFor(node.kind)
  const base = {
    id: node.id,
    name: node.name,
    incoming: [] as string[],
    outgoing: [] as string[],
    extensionElements: [],
    unknownAttributes: {},
  }
  if (type === 'startEvent' || type === 'endEvent') {
    return { ...base, type, eventDefinitions: [] }
  }
  return { ...base, type } as BpmnFlowElement
}

function toBpmnProcess(graph: ProcessFlowGraph): BpmnProcess {
  const reals = graph.nodes.filter((n) => n.kind !== 'dummy')
  return {
    id: `p_${graph.no}`,
    name: graph.label ?? graph.no,
    extensionElements: [],
    flowElements: reals.map(toBpmnElement),
    sequenceFlows: graph.edges.map((e) => ({
      id: e.id,
      name: e.label,
      sourceRef: e.from,
      targetRef: e.to,
      extensionElements: [],
      unknownAttributes: {},
    })),
    textAnnotations: [],
    associations: [],
    groups: [],
    unknownAttributes: {},
  }
}

/**
 * BPMN Kit semantic auto-layout (https://bpmnkit.com/auto-layout):
 * rank + branch bands + orthogonal routes that go around shapes.
 */
ELEMENT_SIZES.userTask = { width: 200, height: 96 }
ELEMENT_SIZES.serviceTask = { width: 200, height: 96 }
ELEMENT_SIZES.task = { width: 200, height: 96 }
ELEMENT_SIZES.exclusiveGateway = { width: 80, height: 92 }
ELEMENT_SIZES.startEvent = { width: 48, height: 80 }
ELEMENT_SIZES.endEvent = { width: 48, height: 80 }

export function layoutProcessFlow(graph: ProcessFlowGraph): ProcessFlowGraph & {
  positions: Record<string, { x: number; y: number }>
} {
  const reals = graph.nodes.filter((n) => n.kind !== 'dummy')
  const result = layoutProcess(toBpmnProcess({ ...graph, nodes: reals }), 'semantic')
  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of result.nodes) {
    positions[n.id] = { x: n.bounds.x, y: n.bounds.y }
  }
  let orphanY = Math.max(48, ...Object.values(positions).map((p) => p.y + 80))
  for (const n of reals) {
    if (positions[n.id]) continue
    positions[n.id] = { x: 48, y: orphanY }
    orphanY += 112
  }

  const laidById = new Map(result.edges.map((e) => [e.id, e]))
  const dummyNodes: ProcessFlowNode[] = []
  const edges = graph.edges.map((e) => {
    const laid = laidById.get(e.id)
    const mids = (laid?.waypoints ?? []).slice(1, -1)
    if (mids.length === 0) return e
    const via = mids.map((wp, i) => {
      const id = `d:b:${e.id}:${i}`
      dummyNodes.push({ id, name: '', kind: 'dummy', services: [] })
      positions[id] = { x: wp.x - 4, y: wp.y - 4 }
      return id
    })
    return { ...e, via }
  })

  return { ...graph, nodes: [...reals, ...dummyNodes], edges, positions }
}

