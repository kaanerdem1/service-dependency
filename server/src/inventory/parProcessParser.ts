import { ELEMENT_SIZES, layoutProcess, type BpmnElementType, type BpmnFlowElement, type BpmnProcess } from '@bpmnkit/core'

export type ProcessFlowNodeKind =
  | 'start'
  | 'end'
  | 'task'
  | 'decision'
  | 'service'
  | 'subprocess'
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

export type ProcessDetailRow = { label: string; value: string }

export type ProcessDetailGroup = { title: string; rows: ProcessDetailRow[] }

/** Task/node XML’inden çıkarılan dolu alanlar — drawer’da gösterilir. */
export type ProcessNodeDetails = { groups: ProcessDetailGroup[] }

export type ProcessFlowNode = {
  id: string
  name: string
  kind: ProcessFlowNodeKind
  services: string[]
  /** Sadece kind === 'decision' için: XML handler'ından çıkarılan kural seti. */
  decisionInfo?: ProcessDecisionInfo
  /** Task/node event ve assignment alanları (yalnızca dolu olanlar). */
  details?: ProcessNodeDetails
  /** process-state → sub-process name (hedef süreç no). */
  subProcessNo?: string
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
  if (tag === 'process-state') return 'subprocess'
  if (tag === 'decision' || tag === 'fork') return 'decision'
  if (tag === 'task-node') return 'task'
  if (/execute-services/i.test(inner) || /service-name=/i.test(inner)) return 'service'
  return 'other'
}

function extractSubProcessNo(inner: string): string | undefined {
  const m = inner.match(/<sub-process\b[^>]*\bname\s*=\s*"([^"]+)"/i)
  const raw = m?.[1]?.trim()
  return raw ? decode(raw) : undefined
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

function isSelfClosingTag(open: string): boolean {
  return /\/\s*>$/.test(open)
}

function findTagClose(xml: string, start: number, tag: string): number {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi')
  re.lastIndex = start
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const isClose = m[0].startsWith('</')
    if (isClose) {
      depth -= 1
      if (depth === 0) return m.index + m[0].length
    } else if (!isSelfClosingTag(m[0])) {
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
  const re = new RegExp(`<(${tagAlt})\\b[^>]*>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase()
    const open = m[0]
    if (isSelfClosingTag(open)) {
      out.push({ tag, open, inner: '' })
      continue
    }
    const innerStart = m.index + m[0].length
    const closeAt = findTagClose(body, innerStart, tag)
    if (closeAt < 0) {
      const nodeName = attr(open, 'name') ?? '(isimsiz)'
      console.warn(
        `[process-parser] ${tag} "${nodeName}" için kapanış etiketi bulunamadı; yalnız bu düğüm atlandı.`,
      )
      continue
    }
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

const DETAIL_FIELD_LABELS: Record<string, string> = {
  organization: 'Organizasyon',
  organizationType: 'Org. tipi',
  organizationGroup: 'Org. grubu',
  profile: 'Profil',
  channelCode: 'Kanal',
  unit: 'Birim',
  actorCount: 'Onaycı sayısı',
  rule: 'Kural',
}

function pushDetailRow(rows: ProcessDetailRow[], label: string, value: string | undefined) {
  const v = value?.trim()
  if (!v) return
  rows.push({ label, value: decode(v) })
}

function extractServiceDetailRows(inner: string): ProcessDetailRow[] {
  const rows: ProcessDetailRow[] = []
  const re = /<service\b([^>]*)\/?>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(inner))) {
    const name = attr(m[1], 'service-name')
    if (!name) continue
    const callType = attr(m[1], 'call-type')
    const writeToInput = attr(m[1], 'write-to-input')
    const bits = [decode(name)]
    if (callType) bits.push(`call-type: ${callType}`)
    if (writeToInput === 'true') bits.push('write-to-input')
    rows.push({ label: 'Servis', value: bits.join(' · ') })
  }
  return rows
}

function extractEventBlock(inner: string, eventType: string): string | undefined {
  const re = new RegExp(`<event\\s+type="${eventType}"\\b[^>]*>([\\s\\S]*?)<\\/event>`, 'i')
  return re.exec(inner)?.[1]
}

/** Task/node içindeki dolu XML alanlarını gruplar halinde çıkarır. */
function extractNodeDetails(inner: string): ProcessNodeDetails | undefined {
  const groups: ProcessDetailGroup[] = []

  const enter = extractEventBlock(inner, 'node-enter')
  if (enter) {
    const rows: ProcessDetailRow[] = []
    const status = enter.match(/<set-status\b[^>]*\bprocess\s*=\s*"([^"]+)"/i)
    if (status?.[1]) rows.push({ label: 'Durum kodu', value: decode(status[1]) })
    rows.push(...extractServiceDetailRows(enter))
    if (rows.length) groups.push({ title: 'Giriş', rows })
  }

  const leave = extractEventBlock(inner, 'node-leave')
  if (leave) {
    const rows = extractServiceDetailRows(leave)
    if (rows.length) groups.push({ title: 'Çıkış', rows })
  }

  const assignmentMatch = inner.match(/<assignment\b([^>]*)>([\s\S]*?)<\/assignment>/i)
  if (assignmentMatch) {
    const cls = attr(assignmentMatch[1], 'class')
    if (cls?.trim()) {
      groups.push({
        title: 'Atama',
        rows: [{ label: 'Handler', value: decode(cls) }],
      })
    }
    const actorRe = /<actor>([\s\S]*?)<\/actor>/gi
    let actorIdx = 0
    let am: RegExpExecArray | null
    while ((am = actorRe.exec(assignmentMatch[2]))) {
      actorIdx++
      const rows: ProcessDetailRow[] = []
      const body = am[1]
      const leafRe = /<(organization|profile|unit|actorCount|rule)>([^<]*)<\/\1>/gi
      let lm: RegExpExecArray | null
      while ((lm = leafRe.exec(body))) {
        pushDetailRow(rows, DETAIL_FIELD_LABELS[lm[1]] ?? lm[1], lm[2])
      }
      const screen = body.match(/<screen\s+name\s*=\s*"([^"]+)"/i)
      if (screen?.[1]) pushDetailRow(rows, 'Ekran', screen[1])
      if (rows.length) {
        groups.push({ title: actorIdx > 1 ? `Onaycı ${actorIdx}` : 'Onaycı', rows })
      }
    }
  }

  const timer = inner.match(/<timer\b([^>]*)\/?>/i)
  if (timer) {
    const due = attr(timer[1], 'duedate') ?? attr(timer[1], 'due-date')
    if (due?.trim()) groups.push({ title: 'Zamanlayıcı', rows: [{ label: 'Vade', value: decode(due) }] })
  }

  const desc = inner.match(/<description>([^<]*)<\/description>/i)
  if (desc?.[1]?.trim()) {
    groups.push({ title: 'Açıklama', rows: [{ label: 'Metin', value: decode(desc[1]) }] })
  }

  const transitionRe = /<transition\b([^>]*)>([\s\S]*?)<\/transition>/gi
  let tm: RegExpExecArray | null
  while ((tm = transitionRe.exec(inner))) {
    const trName = attr(tm[1], 'name')
    const rows = extractServiceDetailRows(tm[2])
    if (!rows.length) continue
    groups.push({
      title: trName?.trim() ? `Geçiş: ${decode(trName.trim())}` : 'Geçiş servisleri',
      rows,
    })
  }

  if (groups.length === 0) return undefined
  return { groups }
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
    const subProcessNo = child.tag === 'process-state' ? extractSubProcessNo(child.inner) : undefined
    nodes.push({
      id,
      name: id,
      kind,
      services,
      subProcessNo,
      decisionInfo: kind === 'decision' ? extractDecisionInfo(child.inner) : undefined,
      details: kind !== 'decision' && kind !== 'subprocess' ? extractNodeDetails(child.inner) : undefined,
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

export type ProcessParseAudit = {
  ok: boolean
  processNo: string
  issues: string[]
  counts: {
    xmlNamedRootNodes: number
    xmlDuplicateRootNames: number
    xmlUnnamedRootNodes: number
    xmlTransitions: number
    parsedNodes: number
    parsedEdges: number
  }
}

/** XML yapısı ile parser çıktısını karşılaştırır (regresyon / env.process audit). */
export function auditProcessDefinitionXml(xml: string, fallbackNo: string): ProcessParseAudit {
  const graph = parseProcessDefinitionXml(xml, fallbackNo)
  const children = extractRootChildren(xml)
  const issues: string[] = []

  const seenRoot = new Set<string>()
  let xmlNamedRootNodes = 0
  let xmlDuplicateRootNames = 0
  let xmlUnnamedRootNodes = 0
  let xmlTransitions = 0
  const expectedNodeIds = new Set<string>()
  const expectedEdges: { from: string; to: string; label: string }[] = []

  for (const child of children) {
    const name = attr(child.open, 'name')
    if (!name) {
      xmlUnnamedRootNodes += 1
      continue
    }
    xmlNamedRootNodes += 1
    const id = decode(name)
    if (seenRoot.has(id)) {
      xmlDuplicateRootNames += 1
      continue
    }
    seenRoot.add(id)
    expectedNodeIds.add(id)
    for (const tr of extractTransitions(child.inner, child.open)) {
      xmlTransitions += 1
      expectedEdges.push({
        from: id,
        to: tr.to,
        label: tr.name?.trim() ?? '',
      })
    }
  }
  for (const e of expectedEdges) expectedNodeIds.add(e.to)

  const parsedNodeIds = new Set(graph.nodes.map((n) => n.id))
  const parsedEdgeKeys = new Set(
    graph.edges.map((e) => `${e.from}\0${e.to}\0${e.label ?? ''}`),
  )
  const expectedEdgeKeys = new Set(
    expectedEdges.map((e) => `${e.from}\0${e.to}\0${e.label}`),
  )

  if (graph.edges.length !== expectedEdges.length) {
    issues.push(
      `edge sayısı: parse=${graph.edges.length}, xml=${expectedEdges.length}`,
    )
  }
  for (const key of expectedEdgeKeys) {
    if (!parsedEdgeKeys.has(key)) {
      issues.push(`eksik kenar: ${key.replace(/\0/g, ' → ')}`)
    }
  }
  for (const key of parsedEdgeKeys) {
    if (!expectedEdgeKeys.has(key)) {
      issues.push(`fazla kenar: ${key.replace(/\0/g, ' → ')}`)
    }
  }
  for (const id of expectedNodeIds) {
    if (!parsedNodeIds.has(id)) issues.push(`eksik düğüm: ${id}`)
  }
  for (const id of parsedNodeIds) {
    if (!expectedNodeIds.has(id)) issues.push(`fazla düğüm: ${id}`)
  }
  if (xmlDuplicateRootNames > 0) {
    issues.push(
      `${xmlDuplicateRootNames} kök düğüm aynı name ile tekrarlandı (parser yalnız ilkinde geçişleri alır)`,
    )
  }
  if (xmlUnnamedRootNodes > 0) {
    issues.push(`${xmlUnnamedRootNodes} kök düğümde name yok (atlandı)`)
  }

  return {
    ok: issues.length === 0,
    processNo: graph.no,
    issues,
    counts: {
      xmlNamedRootNodes,
      xmlDuplicateRootNames,
      xmlUnnamedRootNodes,
      xmlTransitions,
      parsedNodes: graph.nodes.length,
      parsedEdges: graph.edges.length,
    },
  }
}

function bpmnTypeFor(kind: ProcessFlowNodeKind): BpmnElementType {
  if (kind === 'start') return 'startEvent'
  if (kind === 'end') return 'endEvent'
  if (kind === 'decision') return 'exclusiveGateway'
  if (kind === 'service') return 'serviceTask'
  if (kind === 'subprocess') return 'callActivity'
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

