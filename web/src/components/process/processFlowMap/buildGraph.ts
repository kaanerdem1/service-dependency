import { MarkerType, type Edge, type Node } from 'reactflow'
import type { ProcessFlowGraph, ProcessFlowNodeKind } from '../../types'
import { KTF_REFERENCE_POSITIONS, KTF_REFERENCE_ROUTES } from '../processFlowReferenceLayout.js'
import { servicesForOutgoingLabels } from '../processFlowTransitionServices.js'
import { sinkCopyRealId } from '../processFlowIds.js'
import { PROCESS_FLOW_ORIGIN as ORIGIN } from '../processFlowCamera.js'
import {
  COL_GAP,
  FAN_GAP,
  NODE_H,
  NODE_SEP,
  NODE_W,
  RAIL_GAP,
  RAIL_PAD,
  RANK_SEP,
  SINK_COPY_GAP_X,
  SINK_COPY_OFFSET_Y,
} from './constants.js'
import {
  assignRailSlots,
  classifyRoute,
  corridorObstacles,
  flowBand,
  handlesFor,
  nodeBox,
} from './edgeGeometry.js'
import type { PathHighlight, ProcessEdgeData, ProcessNodeData, RouteKind } from './types.js'

function isDummyId(id: string) {
  return id.startsWith('d:')
}

function mergeTransitionLabels(labels: string[]): string | undefined {
  const parts = labels.map((l) => l.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  return parts.join(' / ')
}

/** Aynı from→to XML geçişlerini tek ok + birleşik etiket (2 / 3 / BOTAH). */
function visualEdges(graph: ProcessFlowGraph) {
  const groups = new Map<
    string,
    { from: string; to: string; labels: string[]; originalId: string }
  >()
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const key = `${e.from}\0${e.to}`
    const hit = groups.get(key)
    if (hit) {
      if (e.label?.trim()) hit.labels.push(e.label.trim())
      continue
    }
    groups.set(key, {
      from: e.from,
      to: e.to,
      labels: e.label?.trim() ? [e.label.trim()] : [],
      originalId: e.id,
    })
  }
  return [...groups.values()].map((g) => ({
    from: g.from,
    to: g.to,
    label: mergeTransitionLabels(g.labels),
    originalId: g.originalId,
    labels: g.labels,
    lane: 0,
  }))
}

/** Verilen düğüm alt kümesi için, DAG (döngüsüz) kenarları üzerinden
 * topolojik sırayla "en uzun yol" (longest path) rank'ı hesaplar. Kısa yol
 * (BFS) yerine en uzun yol kullanılır ki bir düğüme uzun bir zincirle de
 * ulaşılıyorsa, o zincirin gerektirdiği kadar sağa itilsin — örn. bir bitiş
 * düğümü kısa bir yolla erken erişilebiliyor olsa bile, asıl uzun ana akış
 * zinciri bitmeden sola/erken sütunlara sıkışmasın. */
function longestPathRanks(
  nodeIds: string[],
  dagChildren: Map<string, string[]>,
  forcedRootHop0: string[],
): Map<string, number> {
  const idSet = new Set(nodeIds)
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  for (const id of nodeIds) {
    for (const to of dagChildren.get(id) ?? []) {
      if (idSet.has(to)) indegree.set(to, (indegree.get(to) ?? 0) + 1)
    }
  }
  const rank = new Map<string, number>()
  const queue = nodeIds
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b, 'tr'))
  for (const id of queue) rank.set(id, 0)
  for (const id of forcedRootHop0) if (idSet.has(id)) rank.set(id, 0)
  const remaining = new Map(indegree)
  while (queue.length) {
    const from = queue.shift()!
    const h = rank.get(from) ?? 0
    for (const to of dagChildren.get(from) ?? []) {
      if (!idSet.has(to)) continue
      rank.set(to, Math.max(rank.get(to) ?? 0, h + 1))
      const left = (remaining.get(to) ?? 0) - 1
      remaining.set(to, left)
      if (left === 0) queue.push(to)
    }
  }
  // Teorik olarak kalmaması gerekir (DAG döngüsüz) ama garanti için.
  for (const id of nodeIds) if (!rank.has(id)) rank.set(id, 0)
  return rank
}

/** Bir sürecin düğüm/kenar grafiğinden, döngüleri (DFS ile tespit edilen
 * "geri" kenarları) çıkarılmış bir DAG üretir. Hem sütun/rank hesabı
 * (layeredLayout) hem de "buraya nasıl gelinir" kanonik yol hesabı
 * (pathToTarget) bu ortak DAG üzerinden çalışır — iki yerde ayrı
 * ayrı DFS/geri-kenar mantığı tekrarlanmasın diye tek noktadan üretilir. */
function buildDag(graph: ProcessFlowGraph): {
  allIds: string[]
  starts: string[]
  dagChildren: Map<string, string[]>
} {
  const allIds = graph.nodes.filter((n) => n.kind !== 'dummy').map((n) => n.id)
  const children = new Map<string, string[]>()
  for (const id of allIds) children.set(id, [])
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const list = children.get(e.from)
    if (list && !list.includes(e.to)) list.push(e.to)
  }
  // Komşu ziyaret sırası her zaman aynı olsun (isim sırası) — geri kenar
  // tespiti çalıştırmadan çalıştırmaya farklı sonuç vermesin.
  for (const list of children.values()) list.sort((a, b) => a.localeCompare(b, 'tr'))

  // DFS ile döngü oluşturan ("geri") kenarları bul. Bunlar sıralama
  // hesabına dahil edilmez; sadece görsel rotalamada 'back' sınıfında
  // kullanılır (bkz. routeFor/classifyRoute — X konumuna göre ayrıca karar
  // verir, burada asıl amaç sıralamayı bir DAG üzerinden yapabilmek).
  const backEdgeKeys = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const starts = graph.nodes
    .filter((n) => n.kind === 'start')
    .map((n) => n.id)
    .sort((a, b) => a.localeCompare(b, 'tr'))
  const dfsOrder = [...starts, ...allIds.filter((id) => !starts.includes(id)).sort((a, b) => a.localeCompare(b, 'tr'))]
  const dfs = (id: string) => {
    state.set(id, 1)
    for (const to of children.get(id) ?? []) {
      const s = state.get(to)
      if (s === undefined) dfs(to)
      else if (s === 1) backEdgeKeys.add(`${id}\0${to}`)
    }
    state.set(id, 2)
  }
  for (const id of dfsOrder) if (!state.has(id)) dfs(id)

  const dagChildren = new Map<string, string[]>()
  for (const [from, list] of children) {
    dagChildren.set(from, list.filter((to) => !backEdgeKeys.has(`${from}\0${to}`)))
  }
  return { allIds, starts, dagChildren }
}

/** start'tan DAG (döngüsüz) kenarlarla erişilebilen düğüm kümesi. */
function reachableFromStarts(starts: string[], dagChildren: Map<string, string[]>): Set<string> {
  const reached = new Set<string>(starts)
  const rq = [...starts]
  while (rq.length) {
    const from = rq.shift()!
    for (const to of dagChildren.get(from) ?? []) {
      if (!reached.has(to)) {
        reached.add(to)
        rq.push(to)
      }
    }
  }
  return reached
}

/** Start → hedef arasında HERHANGİ bir yolda kalan düğüm/kenar kümesi.
 * Kanonik tek-zincir yerine paralel dalları da kapsar (ör. 3 görev → 1 karar). */
export function pathToTarget(
  graph: ProcessFlowGraph,
  targetId: string,
  reactFlowEdges: Edge[],
): { nodeIds: Set<string>; edgeIds: Set<string>; orderedIds: string[] } | null {
  const { starts, dagChildren } = buildDag(graph)
  const forward = reachableFromStarts(starts, dagChildren)
  if (!forward.has(targetId)) return null

  const reverseAdj = new Map<string, string[]>()
  for (const id of forward) reverseAdj.set(id, [])
  for (const [from, tos] of dagChildren) {
    if (!forward.has(from)) continue
    for (const to of tos) {
      if (!forward.has(to)) continue
      reverseAdj.get(to)!.push(from)
    }
  }
  const backward = new Set<string>([targetId])
  const bq = [targetId]
  while (bq.length) {
    const cur = bq.shift()!
    for (const pred of reverseAdj.get(cur) ?? []) {
      if (!backward.has(pred)) {
        backward.add(pred)
        bq.push(pred)
      }
    }
  }

  const onPath = new Set<string>([...forward].filter((id) => backward.has(id)))
  const nodeIds = new Set<string>(onPath)
  const edgeIds = new Set<string>()

  for (const e of reactFlowEdges) {
    const from = sinkCopyRealId(e.source)
    const to = sinkCopyRealId(e.target)
    if (!onPath.has(from) || !onPath.has(to)) continue
    if (!(dagChildren.get(from) ?? []).includes(to)) continue
    edgeIds.add(e.id)
    nodeIds.add(e.source)
    nodeIds.add(e.target)
  }

  const indegree = new Map<string, number>()
  for (const id of onPath) indegree.set(id, 0)
  for (const id of onPath) {
    for (const to of dagChildren.get(id) ?? []) {
      if (!onPath.has(to)) continue
      indegree.set(to, (indegree.get(to) ?? 0) + 1)
    }
  }
  const queue = [...onPath]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b, 'tr'))
  const orderedIds: string[] = []
  const remaining = new Map(indegree)
  while (queue.length) {
    const id = queue.shift()!
    orderedIds.push(id)
    for (const to of dagChildren.get(id) ?? []) {
      if (!onPath.has(to)) continue
      const left = (remaining.get(to) ?? 0) - 1
      remaining.set(to, left)
      if (left === 0) queue.push(to)
    }
    queue.sort((a, b) => a.localeCompare(b, 'tr'))
  }

  return { nodeIds, edgeIds, orderedIds }
}

/** Start'tan DAG ile ulaşılamayan sinyal / ada düğümleri (ör. 105116 Krediler Yönetimi Onay, PBSMUD). */
function localIncidentHighlight(
  focusNodeId: string,
  reactFlowEdges: Edge[],
): { nodeIds: Set<string>; edgeIds: Set<string>; orderedIds: string[] } {
  const realFocus = sinkCopyRealId(focusNodeId)
  const nodeIds = new Set<string>([focusNodeId, realFocus])
  const edgeIds = new Set<string>()
  for (const e of reactFlowEdges) {
    const fromReal = sinkCopyRealId(e.source)
    const toReal = sinkCopyRealId(e.target)
    if (
      e.source === focusNodeId ||
      e.target === focusNodeId ||
      fromReal === realFocus ||
      toReal === realFocus
    ) {
      edgeIds.add(e.id)
      nodeIds.add(e.source)
      nodeIds.add(e.target)
    }
  }
  return { nodeIds, edgeIds, orderedIds: [realFocus] }
}

export function focusHighlightFor(
  graph: ProcessFlowGraph,
  focusNodeId: string,
  reactFlowEdges: Edge[],
): { highlight: PathHighlight; canonical: boolean } | null {
  const realFocus = sinkCopyRealId(focusNodeId)
  const path = pathToTarget(graph, realFocus, reactFlowEdges)
  if (path) {
    path.nodeIds.add(focusNodeId)
    return {
      highlight: extendPathOneStepForward(graph, path, focusNodeId, reactFlowEdges),
      canonical: true,
    }
  }
  return { highlight: localIncidentHighlight(focusNodeId, reactFlowEdges), canonical: false }
}

/** Odak düğümün hemen sonraki adım(lar)ını da vurguya dahil et (chart + snapshot). */
function extendPathOneStepForward(
  graph: ProcessFlowGraph,
  path: PathHighlight,
  focusNodeId: string,
  reactFlowEdges: Edge[],
): PathHighlight {
  const realFocus = sinkCopyRealId(focusNodeId)
  if (!path.nodeIds.has(realFocus) && !path.nodeIds.has(focusNodeId)) return path

  const nodeIds = new Set(path.nodeIds)
  const edgeIds = new Set(path.edgeIds)
  const orderedIds = [...path.orderedIds]

  for (const e of graph.edges) {
    if (e.from !== realFocus) continue
    if (!nodeIds.has(e.from)) continue
    nodeIds.add(e.to)
    if (!orderedIds.includes(e.to)) orderedIds.push(e.to)
    for (const rf of reactFlowEdges) {
      if (sinkCopyRealId(rf.source) === e.from && sinkCopyRealId(rf.target) === e.to) {
        edgeIds.add(rf.id)
        nodeIds.add(rf.source)
        nodeIds.add(rf.target)
      }
    }
  }

  return { nodeIds, edgeIds, orderedIds }
}

function layeredLayout(graph: ProcessFlowGraph) {
  const { allIds, starts, dagChildren } = buildDag(graph)
  const reached = reachableFromStarts(starts, dagChildren)
  const reachedIds = allIds.filter((id) => reached.has(id))
  const islandIds = allIds.filter((id) => !reached.has(id))

  // Ana akış en-uzun-yol rank'ı; kopuk (start'tan hiç erişilemeyen)
  // düğümler kendi aralarında sıralanıp ana akışın SAĞINA eklenir — sol
  // sütuna (start ile aynı yere) asla düşmezler.
  const hop = longestPathRanks(reachedIds, dagChildren, starts)
  let maxReachedHop = 0
  for (const h of hop.values()) maxReachedHop = Math.max(maxReachedHop, h)
  if (islandIds.length > 0) {
    const islandHop = longestPathRanks(islandIds, dagChildren, [])
    for (const [id, h] of islandHop) hop.set(id, maxReachedHop + 1 + h)
  }

  const byHop = new Map<number, string[]>()
  for (const [id, h] of hop) {
    const list = byHop.get(h) ?? []
    list.push(id)
    byHop.set(h, list)
  }
  const positions: Record<string, { x: number; y: number }> = {}
  for (const h of [...byHop.keys()].sort((a, b) => a - b)) {
    const ids = (byHop.get(h) ?? []).sort((a, b) => a.localeCompare(b, 'tr'))
    ids.forEach((id, i) => {
      positions[id] = { x: ORIGIN.x + h * RANK_SEP, y: ORIGIN.y + i * NODE_SEP }
    })
  }
  return positions
}

function resolveColumns(positions: Record<string, { x: number; y: number }>) {
  const cols = new Map<number, string[]>()
  for (const [id, p] of Object.entries(positions)) {
    const col = Math.round(p.x / 50)
    const list = cols.get(col) ?? []
    list.push(id)
    cols.set(col, list)
  }
  for (const ids of cols.values()) {
    ids.sort((a, b) => positions[a]!.y - positions[b]!.y || a.localeCompare(b, 'tr'))
    for (let i = 1; i < ids.length; i++) {
      const prev = positions[ids[i - 1]!]!
      const cur = positions[ids[i]!]!
      if (cur.y < prev.y + COL_GAP) {
        positions[ids[i]!] = { x: cur.x, y: prev.y + COL_GAP }
      }
    }
  }
}

/** Sağa giden 2–4 uç aynı satırda kalmasın; biraz dikeye açılsın. */
function spreadForwardFans(
  graph: ProcessFlowGraph,
  positions: Record<string, { x: number; y: number }>,
) {
  const children = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const list = children.get(e.from) ?? []
    if (!list.includes(e.to)) list.push(e.to)
    children.set(e.from, list)
  }
  const order = Object.keys(positions).sort((a, b) => positions[a]!.x - positions[b]!.x)
  for (const id of order) {
    const from = positions[id]
    if (!from) continue
    const near = (children.get(id) ?? []).filter((to) => {
      const p = positions[to]
      return p && p.x > from.x + 40 && p.x - from.x < RANK_SEP * 1.7
    })
    if (near.length < 2) continue
    near.sort((a, b) => positions[a]!.y - positions[b]!.y || a.localeCompare(b, 'tr'))
    const mid = near.reduce((s, k) => s + positions[k]!.y, 0) / near.length
    near.forEach((k, i) => {
      const p = positions[k]!
      positions[k] = {
        x: p.x,
        y: mid + (i - (near.length - 1) / 2) * FAN_GAP,
      }
    })
  }
  resolveColumns(positions)
}

function positionsFor(graph: ProcessFlowGraph) {
  const fallback = layeredLayout(graph)
  if (graph.no !== '105116') {
    spreadForwardFans(graph, fallback)
    return fallback
  }
  const out = { ...fallback }
  for (const n of graph.nodes) {
    if (n.kind === 'dummy') continue
    const ref = KTF_REFERENCE_POSITIONS[n.id] ?? KTF_REFERENCE_POSITIONS[n.name]
    if (ref) out[n.id] = { ...ref }
  }
  spreadForwardFans(graph, out)
  return out
}

function routeFor(graph: ProcessFlowGraph, from: string, to: string, fromX: number, toX: number): RouteKind {
  if (graph.no === '105116') {
    const hit = KTF_REFERENCE_ROUTES[`${from}\0${to}`]
    if (hit) return hit.route
  }
  return classifyRoute(fromX + NODE_W, toX)
}

function assignEdgeLanes(edges: Edge[]): Edge[] {
  const backCount = new Map<string, number>()
  const jumpCount = new Map<string, number>()
  return edges.map((e) => {
    const data = e.data as ProcessEdgeData | undefined
    const route = data?.route ?? 'direct'
    if (route === 'direct') return e
    const bucket = route === 'back' ? backCount : jumpCount
    const key = [e.source, e.target].sort().join('\0')
    const lane = bucket.get(key) ?? 0
    bucket.set(key, lane + 1)
    return { ...e, data: { ...data, lane } }
  })
}

export function withEdgeRoutes(
  graph: ProcessFlowGraph,
  edges: Edge[],
  positions: Record<string, { x: number; y: number }>,
): Edge[] {
  const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind]))
  const band = flowBand(positions, kindById)
  // Önce her okun rotası (direct/back/jump) belirlenir; slot ataması bu
  // bilgiye (özellikle aynı hedefe/kaynaktan yakınsayan gruplara) ihtiyaç
  // duyar, o yüzden iki geçişli çalışır.
  const withRoute = edges.map((e) => {
    const from = positions[e.source]
    const to = positions[e.target]
    if (!from || !to) return { e, route: undefined as RouteKind | undefined }
    const route =
      (e.data as ProcessEdgeData | undefined)?.route ??
      routeFor(graph, e.source, e.target, from.x, to.x)
    return { e: { ...e, data: { ...(e.data as ProcessEdgeData), route } } as Edge, route }
  })
  const slotOf = assignRailSlots(withRoute.map((w) => w.e), positions)
  const routed = withRoute.map(({ e, route }) => {
    const from = positions[e.source]
    const to = positions[e.target]
    if (!from || !to || !route) return e
    const xMin = Math.min(from.x, to.x) - 12
    const xMax = Math.max(from.x + NODE_W, to.x + NODE_W) + 12
    const slot = slotOf.get(e.id) ?? 0
    const obstruct = corridorObstacles(
      positions,
      kindById,
      xMin,
      xMax,
      new Set([e.source, e.target]),
    )
    // Ray Y konumu, tüm diyagramın en üst/en alt düğümüne göre değil, BU
    // okun kendi kaynağı/hedefi ve aradaki (varsa) gerçek engele göre
    // belirlenir. Eskiden global banda (flowBand) sabitlendiği için her
    // back/jump oku, aralarında hiçbir şey olmasa bile diyagramın en
    // tepesine/en dibine kadar gidip geliyordu — "dümdüz aşağı inip dik
    // açıyla dönen" görüntünün asıl sebebi buydu.
    let railY: number | undefined
    if (route === 'back') {
      const localTop = Math.min(nodeBox(from, kindById.get(e.source)).top, nodeBox(to, kindById.get(e.target)).top)
      railY = (obstruct.minTop !== Infinity ? Math.min(localTop, obstruct.minTop) : localTop) - RAIL_PAD - slot * RAIL_GAP
    } else if (route === 'jump') {
      const localBottom = Math.max(
        nodeBox(from, kindById.get(e.source)).bottom,
        nodeBox(to, kindById.get(e.target)).bottom,
      )
      railY = (obstruct.maxBottom !== -Infinity ? Math.max(localBottom, obstruct.maxBottom) : localBottom) + RAIL_PAD + slot * RAIL_GAP
    }
    return {
      ...e,
      ...handlesFor(route),
      data: {
        ...(e.data as ProcessEdgeData),
        route,
        bandMinY: band.minY,
        bandMaxY: band.maxY,
        railY,
        slot,
      } satisfies ProcessEdgeData,
    }
  })
  return assignEdgeLanes(routed)
}


/** Bir hedefe (örn. "Reddet") birden fazla uzak karardan "back" oku
 * geliyorsa, tek düğüm etrafında kalabalıklaşma ve uzun ray çakışması olur.
 * Deneysel çözüm: ilk kaynak gerçek düğüme bağlı kalır, kalan her kaynağın
 * yanına küçük, salt-görsel bir kopya konur ve o kaynağın oku artık kısa/
 * doğrudan bu kopyaya bağlanır — grafın kendisi (node/edge sayısı, drawer
 * içeriği) değişmez, sadece ekranda nereye çizildiği değişir. */
const SINK_COPY_GAP_X = 40
const SINK_COPY_OFFSET_Y = -52

function splitCrowdedBackSinks(
  graph: ProcessFlowGraph,
  nodes: Node[],
  edges: Edge[],
  positions: Record<string, { x: number; y: number }>,
): { nodes: Node[]; edges: Edge[] } {
  const outDegree = new Map<string, number>()
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1)
  }
  const backByTarget = new Map<string, Edge[]>()
  for (const e of edges) {
    if ((e.data as ProcessEdgeData | undefined)?.route !== 'back') continue
    const list = backByTarget.get(e.target) ?? []
    list.push(e)
    backByTarget.set(e.target, list)
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const extraNodes: Node[] = []
  const nextEdges = [...edges]

  for (const [targetId, list] of backByTarget) {
    // Sadece gerçek "sink" (çıkışı olmayan, örn. Reddet/İptal bitiş) düğümleri
    // için: normal ileri akışa müdahale etmeyelim.
    if (list.length < 2 || (outDegree.get(targetId) ?? 0) > 0) continue
    const targetNode = nodeById.get(targetId)
    if (!targetNode) continue

    list.slice(1).forEach((e) => {
      const sourcePos = positions[e.source]
      if (!sourcePos) return
      const copyId = `${targetId}::near:${e.source}`
      extraNodes.push({
        ...targetNode,
        id: copyId,
        position: { x: sourcePos.x + NODE_W + SINK_COPY_GAP_X, y: sourcePos.y + SINK_COPY_OFFSET_Y },
        selected: false,
        className: ['pf-node-sink-copy', typeof targetNode.className === 'string' ? targetNode.className : '']
          .filter(Boolean)
          .join(' '),
        zIndex: 6,
      })
      const idx = nextEdges.findIndex((edge) => edge.id === e.id)
      if (idx < 0) return
      nextEdges[idx] = {
        ...nextEdges[idx],
        target: copyId,
        sourceHandle: 'r',
        targetHandle: 'l',
        data: {
          ...(nextEdges[idx].data as ProcessEdgeData),
          route: 'direct',
          railY: undefined,
          lane: 0,
        } satisfies ProcessEdgeData,
      }
    })
  }

  if (extraNodes.length === 0) return { nodes, edges: nextEdges }
  return { nodes: [...nodes, ...extraNodes], edges: nextEdges }
}

export function buildGraph(graph: ProcessFlowGraph): { nodes: Node[]; edges: Edge[] } {
  const positions = positionsFor(graph)
  const nodes: Node[] = graph.nodes
    .filter((n) => n.kind !== 'dummy')
    .map((n) => ({
      id: n.id,
      type: 'processStep',
      position: positions[n.id] ?? ORIGIN,
      data: {
        label: n.name,
        kind: n.kind,
        services: n.services,
        subProcessNo: n.subProcessNo,
        decisionInfo: n.decisionInfo,
        details: n.details,
      } satisfies ProcessNodeData,
      draggable: true,
    }))
  const posOf = (id: string) => nodes.find((n) => n.id === id)?.position ?? ORIGIN
  const posMap = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
  const baseEdges: Edge[] = visualEdges(graph).map((e) => {
    const route = routeFor(graph, e.from, e.to, posOf(e.from).x, posOf(e.to).x)
    const sourceNode = graph.nodes.find((n) => n.id === e.from)
    const transitionServices = servicesForOutgoingLabels(sourceNode?.details, e.labels)
    return {
      id: `b:${e.from}\0${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'processEdge',
      ...handlesFor(route),
      data: {
        originalId: e.originalId,
        labels: e.labels,
        route,
        lane: e.lane,
        transitionServices,
      } satisfies ProcessEdgeData,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#a8b0bc' },
    }
  })
  const routedEdges = withEdgeRoutes(graph, baseEdges, posMap)
  const { nodes: finalNodes, edges } = splitCrowdedBackSinks(graph, nodes, routedEdges, posMap)
  return { nodes: finalNodes, edges }
}
