export type ProcessFlowNodeKind =
  | 'start'
  | 'end'
  | 'task'
  | 'decision'
  | 'service'
  | 'other'

export type ProcessFlowNode = {
  id: string
  name: string
  kind: ProcessFlowNodeKind
  services: string[]
}

export type ProcessFlowEdge = {
  id: string
  from: string
  to: string
  label?: string
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
  const openRe = new RegExp(`<${tag}\\b`, 'gi')
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi')
  let depth = 1
  let i = start
  while (i < xml.length && depth > 0) {
    openRe.lastIndex = i
    closeRe.lastIndex = i
    const nextOpen = openRe.exec(xml)
    const nextClose = closeRe.exec(xml)
    if (!nextClose) return -1
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1
      i = nextOpen.index + 1
    } else {
      depth -= 1
      if (depth === 0) return nextClose.index + nextClose[0].length
      i = nextClose.index + 1
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
    if (closeAt < 0) {
      out.push({ tag, open, inner: body.slice(innerStart) })
      break
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
    nodes.push({
      id,
      name: id,
      kind: kindFromTag(child.tag, child.inner),
      services: extractServices(child.inner),
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

/**
 * Katmanlı (Sugiyama tarzı) yerleşim: her düğüm başlangıçtan en UZUN yol
 * mesafesine (longest-path) göre bir sütuna (depth) yerleşir — böylece bir
 * yakınsama düğümü (örn. "Sil"), onu besleyen tüm dalların ötesinde durur ve
 * ok geriye/üste doğru kesişmez. Her sütun içinde satır sırası, önceki
 * sütundaki ebeveynlerinin ortalama satırına göre (barycenter) belirlenir ve
 * o sütun ebeveynlerin ortalamasına ortalanır — bu, tek bir karardan çıkan
 * çoklu dalların simetrik şekilde açılıp aynı hedefte simetrik toplanmasını
 * sağlar (kullanıcının elle dizdiği örnekteki görünüm).
 */
export function layoutProcessFlow(graph: ProcessFlowGraph): ProcessFlowGraph & {
  positions: Record<string, { x: number; y: number }>
} {
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const e of graph.edges) {
    const outList = outgoing.get(e.from) ?? []
    outList.push(e.to)
    outgoing.set(e.from, outList)
    const inList = incoming.get(e.to) ?? []
    inList.push(e.from)
    incoming.set(e.to, inList)
  }

  // 1) En-uzun-yol katmanlama (topological relaxation, döngülere karşı korumalı).
  const depth = new Map<string, number>()
  const seedIds = graph.nodes.filter((n) => n.kind === 'start').map((n) => n.id)
  const indegree = new Map<string, number>()
  for (const n of graph.nodes) indegree.set(n.id, 0)
  for (const e of graph.edges) {
    if (indegree.has(e.to)) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const id of seedIds) {
    depth.set(id, 0)
    queue.push(id)
  }
  for (const n of graph.nodes) {
    if (!depth.has(n.id) && (indegree.get(n.id) ?? 0) === 0) {
      depth.set(n.id, 0)
      queue.push(n.id)
    }
  }
  if (queue.length === 0 && graph.nodes[0]) {
    depth.set(graph.nodes[0].id, 0)
    queue.push(graph.nodes[0].id)
  }
  const guardLimit = graph.nodes.length * 4 + 64
  let guard = 0
  while (queue.length && guard < guardLimit) {
    guard += 1
    const id = queue.shift()!
    const d = depth.get(id) ?? 0
    for (const to of outgoing.get(id) ?? []) {
      const next = d + 1
      const prev = depth.get(to)
      if (prev == null || next > prev) {
        depth.set(to, next)
        queue.push(to)
      }
    }
  }
  const maxDepth = Math.max(0, ...[...depth.values()])
  let extra = 0
  for (const n of graph.nodes) {
    if (!depth.has(n.id)) {
      depth.set(n.id, maxDepth + 1 + extra)
      extra += 1
    }
  }

  const layers = new Map<number, string[]>()
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? 0
    const list = layers.get(d) ?? []
    list.push(n.id)
    layers.set(d, list)
  }
  const orderedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0])

  // 2) Barycenter satır sırası + ebeveyn ortalamasına ortalama.
  const rowOf = new Map<string, number>()
  orderedLayers.forEach(([, ids], layerIdx) => {
    if (layerIdx === 0) {
      ids.forEach((id, i) => rowOf.set(id, i))
      return
    }
    const scored = ids.map((id) => {
      const preds = incoming.get(id) ?? []
      const rows = preds.map((p) => rowOf.get(p)).filter((r): r is number => r != null)
      const bary = rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0
      return { id, bary }
    })
    scored.sort((a, b) => a.bary - b.bary)
    scored.forEach((s, i) => rowOf.set(s.id, i))
    const layerAvgRow = scored.reduce((a, s) => a + (rowOf.get(s.id) ?? 0), 0) / scored.length
    const targetAvg = scored.reduce((a, s) => a + s.bary, 0) / scored.length
    const shift = targetAvg - layerAvgRow
    scored.forEach((s) => rowOf.set(s.id, (rowOf.get(s.id) ?? 0) + shift))
  })

  const allRows = [...rowOf.values()]
  const minRow = allRows.length ? Math.min(...allRows) : 0
  const colW = 260
  const rowH = 100
  const positions: Record<string, { x: number; y: number }> = {}
  for (const [d, ids] of orderedLayers) {
    for (const id of ids) {
      const r = (rowOf.get(id) ?? 0) - minRow
      positions[id] = { x: 48 + d * colW, y: 48 + r * rowH }
    }
  }
  return { ...graph, positions }
}
