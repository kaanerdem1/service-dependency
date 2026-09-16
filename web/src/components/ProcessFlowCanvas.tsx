import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { ProcessDecisionInfo, ProcessFlowGraph, ProcessFlowNodeKind } from '../types'
import { ProcessNodeServicePreview } from './ProcessNodeServicePreview'
const COLLAPSE_AT = 20
/** HTML referans: kolon 250, satır ~100. Aşağı oklar kısalsın diye satır daha sık. */
const RANK_SEP = 250
const NODE_SEP = 92
const ORIGIN = { x: 60, y: 72 }
const FAN_LIMIT = 5
const RAIL_PAD = 40
const RAIL_GAP = 18
const CORNER = 14

type ProcessNodeData = {
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
  hiddenChildCount: number
  decisionInfo?: ProcessDecisionInfo
  orphan?: boolean
  copyOf?: string
}

/** XML'deki handler kriter alan adlarını okunur Türkçe etiketlere çevirir. */
const CRITERIA_LABEL: Record<string, string> = {
  organization: 'Organizasyon',
  organizationType: 'Org. tipi',
  organizationGroup: 'Org. grubu',
  profile: 'Profil',
  channelCode: 'Kanal',
  unit: 'Birim',
}

function formatDecisionCriteria(criteria: Record<string, string>): string {
  const entries = Object.entries(criteria)
  if (!entries.length) return 'kriter yok (diğer / varsayılan)'
  return entries.map(([k, v]) => `${CRITERIA_LABEL[k] ?? k}: ${v}`).join(' · ')
}

type NoteNodeData = {
  text: string
  onChange: (text: string) => void
  onRemove: () => void
  onResizeEnd: () => void
}

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  subprocess: 'Alt süreç',
  dummy: 'Adım',
  other: 'Adım',
}

/** BPMN benzeri gösterim: olaylar (start/end) daire, karar (gateway) baklava,
 * görev/servis dikdörtgen. Şekil türü tek bakışta ayırt edilsin. */
function ProcessStepNode({ data, selected }: NodeProps<ProcessNodeData>) {
  if (data.kind === 'dummy') {
    return (
      <div className="pf-dummy" aria-hidden>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }
  const badge =
    data.hiddenChildCount > 0 ? (
      <span className="pf-node-more-badge">+{data.hiddenChildCount}</span>
    ) : null

  if (data.kind === 'start' || data.kind === 'end') {
    return (
      <div
        className={`pf-node pf-node-event is-${data.kind}${selected ? ' is-selected' : ''}${data.orphan ? ' is-orphan' : ''}${data.copyOf ? ' is-copy' : ''}`}
        title={
          data.orphan
            ? 'XML’de tanımlı ama hiçbir geçiş bu adıma gitmiyor. Grafikte kullanılmıyor; motor/süre aşımı/alert ile çağrılıyor olabilir.'
            : data.copyOf
              ? 'XML’de tek bitiş; burada kararın yanında gösteriliyor.'
              : undefined
        }
      >
        <Handle type="target" position={Position.Left} />
        <span className="pf-event-kicker">
          {data.orphan ? 'Bağlantısız' : KIND_LABEL[data.kind]}
        </span>
        <div className={`pf-event-circle${data.orphan ? ' is-orphan' : ''}`}>{badge}</div>
        <strong className="pf-event-label">{data.label}</strong>
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }

  if (data.kind === 'decision') {
    const rules = data.decisionInfo?.rules ?? []
    return (
      <div className={`pf-node pf-node-gateway is-decision${selected ? ' is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} />
        <span className="pf-event-kicker">{KIND_LABEL.decision}</span>
        <div className="pf-gateway-diamond">
          <span className="pf-gateway-mark">✕</span>
          {badge}
        </div>
        <strong className="pf-gateway-label">{data.label}</strong>
        {rules.length > 0 ? (
          <div className="pf-decision-info" title="Karar kriterleri">
            <span className="pf-decision-badge">i</span>
            <div className="pf-decision-tooltip">
              <div className="pf-decision-tooltip-title">
                Hangi ok neden seçilir? (istek sahibinin bilgilerine göre)
              </div>
              {rules.map((r) => (
                <div className="pf-decision-rule" key={r.transition}>
                  <span className="pf-decision-rule-key">{r.transition}</span>
                  <span className="pf-decision-rule-val">{formatDecisionCriteria(r.criteria)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <ProcessNodeServicePreview services={data.services} />
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }

  return (
    <div className={`pf-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      {data.kind === 'service' ? <span className="pf-node-icon">⚙</span> : null}
      <span className="pf-node-kind">{data.orphan ? 'Bağlantısız' : KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      <ProcessNodeServicePreview services={data.services} />
      {data.hiddenChildCount > 0 ? (
        <span className="pf-node-more">+{data.hiddenChildCount} adım</span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

type ProcessEdgeData = {
  dim?: boolean
  active?: boolean
  sourceKind?: ProcessFlowNodeKind
  originalId?: string
  originalIds?: string[]
  labels?: string[]
  route?: 'direct' | 'jump' | 'back'
  flowKind?: 'revise' | 'reject' | 'approve'
  railY?: number
  bandMinY?: number
  bandMaxY?: number
}

function isHappyLabel(label?: string) {
  return /^(true|evet|onayla|onay|tamam|1)$/i.test((label ?? '').trim())
}

function isRejectLabel(label?: string) {
  return /^(false|hayır|hayir|reddet)$/i.test((label ?? '').trim())
}

function isRevisionLabel(label?: string) {
  return /değişiklik|degisiklik/i.test(label ?? '')
}

function railSlot(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % 5
  return h
}

function labelsBetween(graph: ProcessFlowGraph, from: string, to: string) {
  return graph.edges.filter((e) => e.from === from && e.to === to).map((e) => e.label)
}

function classifyRoute(sourceX: number, targetX: number) {
  if (targetX < sourceX - 20) return 'back' as const
  if (targetX - sourceX > RANK_SEP * 0.8) return 'jump' as const
  return 'direct' as const
}

function kitEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  route: 'direct' | 'jump' | 'back',
  slotKey: string,
  referenceRailY: number | undefined,
  bandMinY: number,
  bandMaxY: number,
) {
  if (route === 'direct') {
    const path = `M ${sourceX},${sourceY} C ${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`
    return {
      path,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2,
    }
  }
  const slot = railSlot(slotKey)
  const r = CORNER
  if (route === 'back') {
    const railY = referenceRailY ?? bandMinY - RAIL_PAD - slot * RAIL_GAP
    const path = `M ${sourceX},${sourceY} L ${sourceX},${railY + r} Q ${sourceX},${railY} ${sourceX - r},${railY} L ${targetX + r},${railY} Q ${targetX},${railY} ${targetX},${railY + r} L ${targetX},${targetY}`
    return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
  }
  const railY = referenceRailY ?? bandMaxY + RAIL_PAD + slot * RAIL_GAP
  const path = `M ${sourceX},${sourceY} L ${sourceX},${railY - r} Q ${sourceX},${railY} ${sourceX + r},${railY} L ${targetX - r},${railY} Q ${targetX},${railY} ${targetX},${railY - r} L ${targetX},${targetY}`
  return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
}

/** Referans HTML: yakın adım kübik, uzak sıçrama alt ray, geri dönüş üst ray. */
function ProcessEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps<ProcessEdgeData>) {
  const route = data?.route ?? classifyRoute(sourceX, targetX)
  const bandMinY = data?.bandMinY ?? Math.min(sourceY, targetY)
  const bandMaxY = data?.bandMaxY ?? Math.max(sourceY, targetY)
  const { path: edgePath, labelX, labelY } = kitEdgePath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    route,
    data?.originalId ?? id,
    data?.railY,
    bandMinY,
    bandMaxY,
  )
  const stateClass = data?.active ? ' is-onpath' : data?.dim ? ' is-dim' : ''
  const title = data?.labels?.length ? data.labels.join(' · ') : undefined
  const stroke = data?.active
    ? '#2f6fed'
    : route === 'back'
      ? '#e05b4f'
      : route === 'jump'
        ? '#2f6fed'
        : '#a8b0bc'
  const dash = data?.active ? undefined : route === 'direct' ? undefined : '5 4'
  const width = data?.active ? 2.4 : route === 'direct' ? 1.5 : 1.3
  const opacity = data?.active ? 1 : route === 'direct' ? 1 : 0.55
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, stroke, strokeWidth: width, strokeDasharray: dash, opacity }}
        interactionWidth={28}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`pf-edge-label${stateClass}`}
            title={title}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

const edgeTypes: EdgeTypes = {
  processEdge: memo(ProcessEdge),
}

function NoteNode({ data, selected }: NodeProps<NoteNodeData>) {
  return (
    <div className={`pf-note${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={90}
        color="#e3b341"
        handleStyle={{ width: 9, height: 9, borderRadius: 2 }}
        onResizeEnd={() => data.onResizeEnd()}
      />
      <Handle type="target" position={Position.Top} />
      <textarea
        value={data.text}
        placeholder="Not…"
        onChange={(e) => data.onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <button type="button" className="pf-note-x" onClick={data.onRemove} aria-label="Notu sil">
        ×
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  processStep: memo(ProcessStepNode),
  processNote: memo(NoteNode),
}

type UiState = {
  notes: { id: string; text: string; x: number; y: number; width?: number; height?: number }[]
  positions: Record<string, { x: number; y: number }>
}

function storageKey(no: string) {
  return `sd-process-flow-v3:${no}`
}

function readUi(no: string): UiState {
  try {
    const raw = localStorage.getItem(storageKey(no))
    if (!raw) return { notes: [], positions: {} }
    const o = JSON.parse(raw) as UiState
    return {
      notes: Array.isArray(o.notes) ? o.notes : [],
      positions: o.positions && typeof o.positions === 'object' ? o.positions : {},
    }
  } catch {
    return { notes: [], positions: {} }
  }
}

function writeUi(no: string, next: UiState) {
  try {
    localStorage.setItem(storageKey(no), JSON.stringify(next))
  } catch {
    /* quota */
  }
}

function isDummyId(id: string) {
  return id.startsWith('d:')
}

function realNodes(graph: ProcessFlowGraph) {
  return graph.nodes.filter((n) => n.kind !== 'dummy')
}

function hiddenRealChildren(
  id: string,
  childrenOf: Map<string, string[]>,
  revealed: Set<string>,
) {
  return (childrenOf.get(id) ?? []).filter((to) => !isDummyId(to) && !revealed.has(to)).length
}

function isExceptionSink(graph: ProcessFlowGraph, id: string) {
  const n = graph.nodes.find((row) => row.id === id)
  if (!n || n.kind === 'dummy') return false
  const nm = n.name.trim().toLowerCase()
  if (/^(reddet|runactionservices|iptal et)$/i.test(nm)) {
    return true
  }
  return n.kind === 'end' && nm === 'end1'
}

function primaryTargets(
  graph: ProcessFlowGraph,
  id: string,
  childrenOf: Map<string, string[]>,
) {
  const seen: string[] = []
  for (const to of childrenOf.get(id) ?? []) {
    if (isDummyId(to) || isExceptionSink(graph, to)) continue
    const revision = graph.edges.some(
      (e) => e.from === id && e.to === to && isRevisionLabel(e.label),
    )
    const onlyRevision =
      revision &&
      graph.edges
        .filter((e) => e.from === id && e.to === to)
        .every((e) => isRevisionLabel(e.label))
    if (onlyRevision) continue
    if (!seen.includes(to)) seen.push(to)
  }
  return seen
}

function isApprovalLeaf(
  graph: ProcessFlowGraph,
  id: string,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
) {
  const kind = kindOf(graph, id)
  if (kind !== 'task' && kind !== 'service') return false
  const kids = primaryTargets(graph, id, childrenOf)
  if (kids.length === 0) return true
  if (kids.length === 1) {
    const hub = kids[0]!
    const ins = (incomingOf.get(hub) ?? []).filter((p) => !isDummyId(p)).length
    return ins >= 3
  }
  return false
}

function isDetailFork(
  graph: ProcessFlowGraph,
  id: string,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
) {
  const kids = primaryTargets(graph, id, childrenOf)
  if (kids.length < 2) return false
  const leaf = (k: string) => isApprovalLeaf(graph, k, childrenOf, incomingOf)
  if (kids.every(leaf)) return true
  if (kids.every((k) => kindOf(graph, k) === 'decision')) return true
  const leaves = kids.filter(leaf)
  const rest = kids.filter((k) => !leaf(k))
  return leaves.length >= 2 && rest.length <= 1 && rest.every((k) => kindOf(graph, k) === 'decision')
}

function isCompletionGate(graph: ProcessFlowGraph, id: string, childrenOf: Map<string, string[]>) {
  return (childrenOf.get(id) ?? []).some(
    (to) => !isDummyId(to) && (isExceptionSink(graph, to) || kindOf(graph, to) === 'end'),
  )
}

function pickPrimary(
  graph: ProcessFlowGraph,
  id: string,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
) {
  const kids = primaryTargets(graph, id, childrenOf)
  if (kids.length === 0) return undefined
  if (kids.length === 1) return kids[0]
  for (const e of graph.edges) {
    if (e.from !== id || !kids.includes(e.to)) continue
    if (
      isHappyLabel(e.label) &&
      !isApprovalLeaf(graph, e.to, childrenOf, incomingOf)
    ) {
      return e.to
    }
  }
  for (const e of graph.edges) {
    if (e.from === id && kids.includes(e.to) && isHappyLabel(e.label)) return e.to
  }
  for (const k of kids) {
    if (isCompletionGate(graph, k, childrenOf)) return k
  }
  const cont = kids.filter((k) => !isApprovalLeaf(graph, k, childrenOf, incomingOf))
  if (cont.length === 1) return cont[0]
  return kids[0]
}

function fromDecisionsOnly(
  graph: ProcessFlowGraph,
  id: string,
  incomingOf: Map<string, string[]>,
) {
  const ps = (incomingOf.get(id) ?? []).filter(
    (p) => !isDummyId(p) && !isExceptionSink(graph, p),
  )
  return ps.length > 0 && ps.every((p) => kindOf(graph, p) === 'decision')
}

function orphanIdsOf(graph: ProcessFlowGraph, incomingOf: Map<string, string[]>) {
  const ids = new Set<string>()
  for (const n of graph.nodes) {
    if (n.kind === 'dummy' || n.kind === 'start') continue
    if ((incomingOf.get(n.id) ?? []).length === 0) ids.add(n.id)
  }
  return ids
}

function exceptionStrip(
  graph: ProcessFlowGraph,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
  orphans: Set<string>,
  includeOrphans: boolean,
) {
  const ids = new Set<string>()
  for (const n of graph.nodes) {
    if (n.kind === 'dummy') continue
    if (isExceptionSink(graph, n.id)) ids.add(n.id)
    if (includeOrphans && orphans.has(n.id)) ids.add(n.id)
  }
  for (const e of graph.edges) {
    if (!isRevisionLabel(e.label) || isDummyId(e.to)) continue
    ids.add(e.to)
    for (const t of childrenOf.get(e.to) ?? []) {
      if (kindOf(graph, t) === 'task') ids.add(t)
    }
  }
  return ids
}

function spineWalk(
  graph: ProcessFlowGraph,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
) {
  const starts = graph.nodes.filter((n) => n.kind === 'start').map((n) => n.id)
  const seed = new Set<string>(starts)
  const queue = [...starts]
  const seen = new Set<string>()
  while (queue.length) {
    const n = queue.shift()!
    if (seen.has(n)) continue
    seen.add(n)
    if (isExceptionSink(graph, n)) continue
    const kids = primaryTargets(graph, n, childrenOf)
    const kind = kindOf(graph, n)
    if (kind === 'start' || kind === 'end') seed.add(n)
    if ((kind === 'task' || kind === 'service') && !isApprovalLeaf(graph, n, childrenOf, incomingOf)) {
      seed.add(n)
    }
    if ((kids.length >= 2 && !isDetailFork(graph, n, childrenOf, incomingOf)) ||
      (isCompletionGate(graph, n, childrenOf) && kind === 'decision')) {
      seed.add(n)
    }
    if (isDetailFork(graph, n, childrenOf, incomingOf)) {
      if (!(kind === 'decision' && fromDecisionsOnly(graph, n, incomingOf))) seed.add(n)
      const next = pickPrimary(graph, n, childrenOf, incomingOf)
      if (next) queue.push(next)
      continue
    }
    if (kids.length >= 2) {
      for (const t of kids) {
        if (isApprovalLeaf(graph, t, childrenOf, incomingOf)) continue
        seed.add(t)
        queue.push(t)
      }
      continue
    }
    if (kids.length === 1) {
      const t = kids[0]!
      if (isApprovalLeaf(graph, t, childrenOf, incomingOf)) continue
      if (isCompletionGate(graph, n, childrenOf) && kind === 'decision') continue
      const tk = kindOf(graph, t)
      if (tk === 'task' || tk === 'service' || tk === 'end') {
        seed.add(t)
        queue.push(t)
      } else {
        if (
          kind === 'task' ||
          kind === 'service' ||
          kind === 'start' ||
          isCompletionGate(graph, t, childrenOf) ||
          (primaryTargets(graph, t, childrenOf).length >= 2 &&
            !isDetailFork(graph, t, childrenOf, incomingOf))
        ) {
          seed.add(t)
        }
        queue.push(t)
      }
    }
  }
  for (const id of [...seed]) {
    if (isExceptionSink(graph, id)) continue
    if (kindOf(graph, id) !== 'decision') continue
    if (isCompletionGate(graph, id, childrenOf)) continue
    const ins = (incomingOf.get(id) ?? []).filter((p) => !isDummyId(p)).length
    if (ins < 3 || !isDetailFork(graph, id, childrenOf, incomingOf)) continue
    seed.delete(id)
  }
  return seed
}

function seedRevealed(
  graph: ProcessFlowGraph,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
  includeOrphans = false,
): Set<string> {
  const reals = realNodes(graph)
  if (reals.length <= COLLAPSE_AT) {
    return new Set(reals.map((n) => n.id))
  }
  const orphans = orphanIdsOf(graph, incomingOf)
  const ids = spineWalk(graph, childrenOf, incomingOf)
  for (const id of exceptionStrip(graph, childrenOf, incomingOf, orphans, includeOrphans)) {
    ids.add(id)
  }
  return ids
}

function bundleLabel(labels: string[]) {
  const filled = labels.filter(Boolean)
  const uniq = [...new Set(filled)]
  if (uniq.length === 0) return labels.length > 1 ? `${labels.length} geçiş` : undefined
  if (uniq.length === 1) return filled.length > 1 ? `${uniq[0]} ×${filled.length}` : uniq[0]
  if (uniq.length <= 3) return uniq.join(' · ')
  return `${uniq.length} geçiş`
}

/** Aynı kaynak→hedef: tek ok. Birden fazla koşul etikette toplanır. */
function visualSegments(graph: ProcessFlowGraph) {
  const groups = new Map<string, { from: string; to: string; ids: string[]; labels: string[] }>()
  for (const e of graph.edges) {
    if (isDummyId(e.from) || isDummyId(e.to)) continue
    const key = `${e.from}\0${e.to}`
    const g = groups.get(key) ?? { from: e.from, to: e.to, ids: [], labels: [] }
    g.ids.push(e.id)
    if (e.label) g.labels.push(e.label)
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => ({
    id: g.ids[0]!,
    from: g.from,
    to: g.to,
    label: bundleLabel(g.labels),
    originalId: g.ids[0]!,
    originalIds: g.ids,
    labels: g.labels,
    isLast: true,
    flowKind: flowKindOf(g.labels),
  }))
}

function flowKindOf(labels: string[]): 'revise' | 'reject' | 'approve' | undefined {
  if (labels.some(isRevisionLabel)) return 'revise'
  if (labels.some(isRejectLabel) && !labels.some(isHappyLabel)) return 'reject'
  if (labels.some(isHappyLabel)) return 'approve'
  return undefined
}

function visualSegmentsRevealed(
  graph: ProcessFlowGraph,
  revealed: Set<string>,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
) {
  const direct = visualSegments(graph).filter(
    (e) => revealed.has(e.from) && revealed.has(e.to),
  )
  const have = new Set(direct.map((e) => `${e.from}\0${e.to}`))
  const extra: ReturnType<typeof visualSegments> = []
  for (const from of revealed) {
    if (isDummyId(from) || isExceptionSink(graph, from)) continue
    const first = pickPrimary(graph, from, childrenOf, incomingOf)
    if (!first || revealed.has(first) || isExceptionSink(graph, first)) continue
    let prev = from
    let cur: string | undefined = first
    let skipped = 0
    const ids: string[] = []
    const labels: string[] = []
    const seen = new Set<string>([from])
    while (cur && !revealed.has(cur) && !isExceptionSink(graph, cur) && !seen.has(cur)) {
      seen.add(cur)
      skipped++
      const hop = graph.edges.find((e) => e.from === prev && e.to === cur)
      if (hop) {
        ids.push(hop.id)
        if (hop.label) labels.push(hop.label)
      }
      prev = cur
      cur = pickPrimary(graph, cur, childrenOf, incomingOf)
    }
    if (!cur || !revealed.has(cur) || skipped === 0) continue
    const key = `${from}\0${cur}`
    if (have.has(key)) continue
    have.add(key)
    extra.push({
      id: `c:${from}>${cur}`,
      from,
      to: cur,
      label: skipped > 1 ? `${skipped} adım` : bundleLabel(labels),
      originalId: ids[0] ?? `c:${from}>${cur}`,
      originalIds: ids.length ? ids : [`c:${from}>${cur}`],
      labels: labels.length ? labels : [`${skipped} adım`],
      isLast: true,
      flowKind: 'approve' as const,
    })
  }
  return [...direct, ...extra]
}

function kindOf(graph: ProcessFlowGraph, id: string) {
  return graph.nodes.find((n) => n.id === id)?.kind
}

function nameOf(graph: ProcessFlowGraph, id: string) {
  return graph.nodes.find((n) => n.id === id)?.name ?? id
}

function hubSet(
  graph: ProcessFlowGraph,
  ids: Set<string>,
  incomingOf: Map<string, string[]>,
) {
  const hubs = new Set<string>()
  for (const id of ids) {
    if (isDummyId(id)) continue
    const inc = (incomingOf.get(id) ?? []).filter((p) => ids.has(p) && p !== id)
    const name = nameOf(graph, id).toLowerCase()
    if (isExceptionSink(graph, id)) hubs.add(id)
    else if (inc.length >= 3) hubs.add(id)
    else if (inc.length >= 2 && /^(reddet|runactionservices)$/i.test(name.trim())) hubs.add(id)
    else if (/şube havuzu/i.test(name)) hubs.add(id)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const id of ids) {
      if (hubs.has(id) || isDummyId(id) || kindOf(graph, id) === 'start') continue
      const parents = (incomingOf.get(id) ?? []).filter((p) => ids.has(p) && p !== id)
      if (parents.length && parents.every((p) => hubs.has(p))) {
        hubs.add(id)
        changed = true
      }
    }
  }
  return hubs
}

function spineWeight(
  graph: ProcessFlowGraph,
  id: string,
  parents: string[],
  hubs: Set<string>,
) {
  const kind = kindOf(graph, id)
  if (hubs.has(id) || kind === 'end') return 5
  if (parents.some((p) => labelsBetween(graph, p, id).some(isHappyLabel))) return 0
  if (parents.some((p) => labelsBetween(graph, p, id).some(isRejectLabel))) return 3
  return 1
}

function layoutRevealed(
  graph: ProcessFlowGraph,
  ids: Set<string>,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
): Record<string, { x: number; y: number }> {
  const hubs = hubSet(graph, ids, incomingOf)
  const hop = new Map<string, number>()
  const indeg = new Map<string, number>()
  const main = [...ids].filter((id) => !isDummyId(id) && !hubs.has(id))
  for (const id of main) indeg.set(id, 0)
  for (const from of main) {
    for (const to of childrenOf.get(from) ?? []) {
      if (!ids.has(to) || hubs.has(to) || isDummyId(to) || to === from) continue
      indeg.set(to, (indeg.get(to) ?? 0) + 1)
    }
  }
  const queue: string[] = []
  const starts = graph.nodes.filter((n) => n.kind === 'start' && ids.has(n.id) && !hubs.has(n.id)).map((n) => n.id)
  for (const [id, d] of indeg) {
    if (d === 0) {
      hop.set(id, 0)
      queue.push(id)
    }
  }
  for (const id of starts) {
    if (!hop.has(id)) {
      hop.set(id, 0)
      queue.push(id)
    }
  }
  while (queue.length) {
    const from = queue.shift()!
    const h = hop.get(from) ?? 0
    for (const to of childrenOf.get(from) ?? []) {
      if (!ids.has(to) || hubs.has(to) || isDummyId(to) || to === from) continue
      const next = h + 1
      const prev = hop.get(to)
      if (prev == null || next > prev) hop.set(to, next)
      const left = (indeg.get(to) ?? 1) - 1
      indeg.set(to, Math.max(0, left))
      if (left === 0) queue.push(to)
    }
  }
  let guard = 0
  while (main.some((id) => !hop.has(id)) && guard++ < ids.size) {
    for (const id of main) {
      if (hop.has(id)) continue
      const ps = (incomingOf.get(id) ?? []).filter((p) => hop.has(p) && !hubs.has(p))
      hop.set(id, ps.length ? Math.max(...ps.map((p) => hop.get(p)!)) + 1 : 0)
    }
  }
  const maxMain = Math.max(0, ...[...hop.values()])
  const hubOrder = [...hubs].sort((a, b) => {
    const ia = (incomingOf.get(a) ?? []).filter((p) => ids.has(p)).length
    const ib = (incomingOf.get(b) ?? []).filter((p) => ids.has(p)).length
    return ib - ia || nameOf(graph, a).localeCompare(nameOf(graph, b), 'tr')
  })
  hubOrder.forEach((id, i) => hop.set(id, maxMain + 1 + i))

  const byHop = new Map<number, string[]>()
  for (const [id, h] of hop) {
    const list = byHop.get(h) ?? []
    list.push(id)
    byHop.set(h, list)
  }
  const positions: Record<string, { x: number; y: number }> = {}
  const hops = [...byHop.keys()].sort((a, b) => a - b)
  for (const h of hops) {
    const list = byHop.get(h) ?? []
    const scored = list.map((id) => {
      const parents = (incomingOf.get(id) ?? []).filter((p) => hop.has(p) && (hop.get(p) ?? 0) < h)
      const ys = parents.map((p) => positions[p]?.y).filter((y): y is number => y != null)
      const bary = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : ORIGIN.y
      return { id, bary, w: spineWeight(graph, id, parents, hubs) }
    })
    scored.sort((a, b) => a.w - b.w || a.bary - b.bary || a.id.localeCompare(b.id))
    scored.forEach((s, i) => {
      positions[s.id] = {
        x: ORIGIN.x + h * RANK_SEP,
        y: ORIGIN.y + i * NODE_SEP,
      }
    })
  }
  let orphanY = ORIGIN.y
  for (const p of Object.values(positions)) orphanY = Math.max(orphanY, p.y)
  orphanY += NODE_SEP * 2
  for (const id of ids) {
    if (positions[id] || isDummyId(id)) continue
    positions[id] = { x: ORIGIN.x, y: orphanY }
    orphanY += NODE_SEP
  }
  return positions
}

function flowBand(positions: Record<string, { x: number; y: number }>, revealed: Set<string>) {
  let minY = ORIGIN.y
  let maxY = ORIGIN.y + 72
  for (const [id, p] of Object.entries(positions)) {
    if (!revealed.has(id)) continue
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + 96)
  }
  return { minY, maxY }
}

function withEdgeRoutes(
  graph: ProcessFlowGraph,
  edges: Edge[],
  positions: Record<string, { x: number; y: number }>,
  revealed: Set<string>,
): Edge[] {
  const band = flowBand(positions, revealed)
  return edges.map((e) => {
    const from = positions[e.source]
    const to = positions[e.target]
    const flowKind = (e.data as ProcessEdgeData | undefined)?.flowKind
    const fromX = from ? from.x + 180 : 0
    const toX = to ? to.x : 0
    let route: 'direct' | 'jump' | 'back' = from && to ? classifyRoute(fromX, toX) : 'direct'
    if (flowKind === 'revise') route = 'back'
    else if (flowKind === 'reject' || (to && isExceptionSink(graph, e.target))) route = 'jump'
    return {
      ...e,
      data: {
        ...e.data,
        route,
        bandMinY: band.minY,
        bandMaxY: band.maxY,
      },
    }
  })
}

function exploreElements(
  graph: ProcessFlowGraph,
  revealed: Set<string>,
  positions: Record<string, { x: number; y: number }>,
  orphanIds: Set<string>,
  nodeKindById: Map<string, ProcessFlowNodeKind>,
  childrenOf: Map<string, string[]>,
  incomingOf: Map<string, string[]>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes
    .filter((n) => n.kind !== 'dummy')
    .map((n) => ({
      id: n.id,
      type: 'processStep',
      position: positions[n.id] ?? ORIGIN,
      hidden: !revealed.has(n.id),
      data: {
        label: n.name,
        kind: n.kind,
        services: n.services,
        hiddenChildCount: hiddenRealChildren(n.id, childrenOf, revealed),
        decisionInfo: n.decisionInfo,
        orphan: orphanIds.has(n.id),
        copyOf: n.copyOf,
      },
      draggable: true,
    }))
  const edges: Edge[] = withEdgeRoutes(
    graph,
    visualSegmentsRevealed(graph, revealed, childrenOf, incomingOf).map((e) => ({
      id: `b:${e.from}>${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'processEdge',
      hidden: !revealed.has(e.from) || !revealed.has(e.to),
      data: {
        sourceKind: nodeKindById.get(e.from),
        originalId: e.originalId,
        originalIds: e.originalIds,
        labels: e.labels,
        flowKind: e.flowKind,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#64748b' },
    })),
    positions,
    revealed,
  )
  return { nodes, edges }
}

function outgoingMap(graph: ProcessFlowGraph) {
  const m = new Map<string, string[]>()
  for (const e of graph.edges) {
    const list = m.get(e.from) ?? []
    if (!list.includes(e.to)) list.push(e.to)
    m.set(e.from, list)
  }
  return m
}

function incomingMap(graph: ProcessFlowGraph) {
  const m = new Map<string, string[]>()
  for (const e of graph.edges) {
    const list = m.get(e.to) ?? []
    if (!list.includes(e.from)) list.push(e.from)
    m.set(e.to, list)
  }
  return m
}

/** Hover: yalnızca hedefe gelen 2 hop (ebeveynler + o oklar). Çıkış / kardeş uçları yok. */
const HOVER_HOPS = 2

function incomingNeighborhood(
  hoveredId: string,
  incomingOf: Map<string, string[]>,
  edges: ProcessFlowGraph['edges'],
) {
  const nodeIds = new Set<string>([hoveredId])
  const edgeIds = new Set<string>()
  let frontier = [hoveredId]
  for (let hop = 0; hop < HOVER_HOPS; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const p of incomingOf.get(id) ?? []) {
        if (isDummyId(p)) continue
        for (const e of edges) {
          if (e.from === p && e.to === id) edgeIds.add(e.id)
        }
        if (!nodeIds.has(p)) {
          nodeIds.add(p)
          next.push(p)
        }
      }
    }
    frontier = next
  }
  return { nodeIds, edgeIds }
}

type Props = {
  graph: ProcessFlowGraph
}

function FlowInner({ graph }: Props) {
  const { fitView } = useReactFlow()
  const [selectedId, setSelectedId] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const [revealed, setRevealed] = useState(() =>
    seedRevealed(graph, outgoingMap(graph), incomingMap(graph)),
  )
  const [viewMode, setViewMode] = useState<'omurga' | 'detay' | 'istisna'>('omurga')
  const [hoveredId, setHoveredId] = useState<string>()
  const childrenOf = useMemo(() => outgoingMap(graph), [graph])
  const incomingOf = useMemo(() => incomingMap(graph), [graph])
  const orphanIds = useMemo(() => orphanIdsOf(graph, incomingOf), [graph, incomingOf])
  const nodeKindById = useMemo(() => {
    const map = new Map<string, ProcessFlowNodeKind>()
    for (const n of graph.nodes) map.set(n.id, n.kind)
    return map
  }, [graph])

  const pathHighlight = useMemo(
    () => (hoveredId ? incomingNeighborhood(hoveredId, incomingOf, graph.edges) : null),
    [hoveredId, incomingOf, graph.edges],
  )

  const persistFromNodes = useCallback(
    (list: Node[]) => {
      const positions: Record<string, { x: number; y: number }> = {}
      const notes: UiState['notes'] = []
      for (const n of list) {
        if (n.type === 'processNote') {
          notes.push({
            id: n.id,
            text: (n.data as NoteNodeData).text ?? '',
            x: n.position.x,
            y: n.position.y,
            width: typeof n.width === 'number' ? n.width : undefined,
            height: typeof n.height === 'number' ? n.height : undefined,
          })
        } else if ((n.data as ProcessNodeData | undefined)?.kind !== 'dummy') {
          positions[n.id] = n.position
        }
      }
      writeUi(graph.no, { notes, positions })
    },
    [graph.no],
  )

  const buildBase = useCallback(() => {
    const seed = seedRevealed(graph, childrenOf, incomingOf)
    const ui = readUi(graph.no)
    const laid = layoutRevealed(graph, seed, childrenOf, incomingOf)
    const { nodes, edges } = exploreElements(
      graph,
      seed,
      laid,
      orphanIds,
      nodeKindById,
      childrenOf,
      incomingOf,
    )
    for (const note of ui.notes) {
      nodes.push({
        id: note.id,
        type: 'processNote',
        position: { x: note.x, y: note.y },
        width: note.width,
        height: note.height,
        data: {
          text: note.text,
          onChange: () => undefined,
          onRemove: () => undefined,
          onResizeEnd: () => undefined,
        },
        draggable: true,
      })
    }
    return { nodes, edges }
  }, [graph, childrenOf, incomingOf, nodeKindById, orphanIds])

  const initial = useMemo(() => buildBase(), [graph.no])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  const persistCurrent = useCallback(() => {
    setNodes((rows) => {
      persistFromNodes(rows)
      return rows
    })
  }, [persistFromNodes, setNodes])

  useEffect(() => {
    setRevealed(seedRevealed(graph, childrenOf, incomingOf))
    setViewMode('omurga')
    setSelectedId(undefined)
    setExpanded(false)
  }, [graph, childrenOf, incomingOf])

  useEffect(() => {
    const laid = layoutRevealed(graph, revealed, childrenOf, incomingOf)
    const { nodes: nextNodes, edges: nextEdges } = exploreElements(
      graph,
      revealed,
      laid,
      orphanIds,
      nodeKindById,
      childrenOf,
      incomingOf,
    )
    setNodes((curr) => {
      const existingNotes = curr.filter((n) => n.type === 'processNote')
      const notes =
        existingNotes.length > 0
          ? existingNotes
          : readUi(graph.no).notes.map((note) => ({
              id: note.id,
              type: 'processNote' as const,
              position: { x: note.x, y: note.y },
              width: note.width,
              height: note.height,
              data: {
                text: note.text,
                onChange: () => undefined,
                onRemove: () => undefined,
                onResizeEnd: () => undefined,
              },
              draggable: true,
            }))
      return [...nextNodes, ...notes]
    })
    setEdges(nextEdges)
    const t = window.setTimeout(() => {
      fitView({ padding: 0.28, duration: 160, maxZoom: 1.05, includeHiddenNodes: false })
    }, 40)
    return () => window.clearTimeout(t)
  }, [revealed, graph, childrenOf, incomingOf, setNodes, setEdges, fitView, orphanIds, nodeKindById])

  useEffect(() => {
    setNodes((curr) =>
      curr.map((n) => {
        if (n.type !== 'processNote') return n
        return {
          ...n,
          data: {
            ...(n.data as NoteNodeData),
            onChange: (text: string) => {
              setNodes((rows) => {
                const next = rows.map((row) =>
                  row.id === n.id ? { ...row, data: { ...row.data, text } } : row,
                )
                persistFromNodes(next)
                return next
              })
            },
            onRemove: () => {
              setNodes((rows) => {
                const next = rows.filter((row) => row.id !== n.id)
                persistFromNodes(next)
                return next
              })
            },
            onResizeEnd: persistCurrent,
          },
        }
      }),
    )
  }, [graph.no, persistFromNodes, persistCurrent, setNodes])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setExpanded(false)
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [expanded])

  useEffect(() => {
    const t = window.setTimeout(() => {
      fitView({ padding: 0.28, duration: expanded ? 180 : 0, maxZoom: 1.05, includeHiddenNodes: false })
    }, expanded ? 40 : 0)
    return () => window.clearTimeout(t)
  }, [expanded, graph.no, fitView])

  const onNodeClick = (_e: unknown, node: Node) => {
    if (node.type === 'processNote') return
    if ((node.data as ProcessNodeData | undefined)?.kind === 'dummy') return
    setSelectedId(node.id)
    const hiddenKids = (childrenOf.get(node.id) ?? []).filter(
      (id) => !isDummyId(id) && !revealed.has(id),
    )
    if (hiddenKids.length === 0) return
    setViewMode('detay')
    const batch = hiddenKids.slice(0, FAN_LIMIT)
    setRevealed((prev) => {
      const next = new Set(prev)
      for (const id of batch) next.add(id)
      return next
    })
  }

  const collapseAll = () => {
    setViewMode('omurga')
    setRevealed(seedRevealed(graph, childrenOf, incomingOf, false))
    setSelectedId(undefined)
  }

  const showExceptions = () => {
    setViewMode('istisna')
    setRevealed(seedRevealed(graph, childrenOf, incomingOf, true))
    setSelectedId(undefined)
  }

  const expandLayer = () => {
    setViewMode('detay')
    const frontier: { parentId: string; kids: string[] }[] = []
    for (const id of revealed) {
      if (isDummyId(id)) continue
      const kids = (childrenOf.get(id) ?? []).filter((to) => !isDummyId(to) && !revealed.has(to))
      if (kids.length) frontier.push({ parentId: id, kids: kids.slice(0, FAN_LIMIT) })
    }
    if (!frontier.length) return
    const added = frontier.flatMap((f) => f.kids)
    setRevealed((prev) => {
      const next = new Set(prev)
      for (const id of added) next.add(id)
      return next
    })
  }

  const resetLayout = () => {
    const seed = revealed
    const laid = layoutRevealed(graph, seed, childrenOf, incomingOf)
    setNodes((curr) => {
      const next = curr.map((n) => {
        if (n.type === 'processNote') return n
        return { ...n, position: laid[n.id] ?? n.position }
      })
      writeUi(graph.no, {
        notes: next
          .filter((n) => n.type === 'processNote')
          .map((n) => ({
            id: n.id,
            text: (n.data as NoteNodeData).text ?? '',
            x: n.position.x,
            y: n.position.y,
            width: typeof n.width === 'number' ? n.width : undefined,
            height: typeof n.height === 'number' ? n.height : undefined,
          })),
        positions: {},
      })
      return next
    })
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.28, duration: 180, maxZoom: 1.05, includeHiddenNodes: false })
    })
  }

  const addNote = () => {
    const id = `note-${Date.now()}`
    setNodes((curr) => {
      const next: Node[] = [
        ...curr,
        {
          id,
          type: 'processNote',
          position: { x: 48, y: 48 },
          width: 168,
          height: 108,
          data: {
            text: '',
            onChange: (text: string) => {
              setNodes((rows) => {
                const mapped = rows.map((row) =>
                  row.id === id ? { ...row, data: { ...row.data, text } } : row,
                )
                persistFromNodes(mapped)
                return mapped
              })
            },
            onRemove: () => {
              setNodes((rows) => {
                const mapped = rows.filter((row) => row.id !== id)
                persistFromNodes(mapped)
                return mapped
              })
            },
            onResizeEnd: persistCurrent,
          },
          draggable: true,
        },
      ]
      persistFromNodes(next)
      return next
    })
  }

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChange(changes)
  }

  const handleNodeMouseEnter = (_e: unknown, node: Node) => {
    if (node.type === 'processNote') return
    if ((node.data as ProcessNodeData | undefined)?.kind === 'dummy') return
    setHoveredId(node.id)
  }

  const handleNodeMouseLeave = () => setHoveredId(undefined)

  const displayNodes = useMemo(() => {
    if (!pathHighlight) return nodes
    const decorated = nodes.map((n) => {
      if (n.type === 'processNote') return n
      const active = pathHighlight.nodeIds.has(n.id)
      return { ...n, className: active ? 'pf-node-onpath' : 'pf-node-offpath' }
    })
    const rest = decorated.filter((n) => n.className !== 'pf-node-onpath')
    const active = decorated.filter((n) => n.className === 'pf-node-onpath')
    return [...rest, ...active]
  }, [nodes, pathHighlight])

  const displayEdges = useMemo(() => {
    if (!pathHighlight) return edges
    // Aktif (vurgulanan) kenarları listenin SONUNA taşı: React Flow kenarları
    // tek bir SVG içinde DOM sırasına göre çizer, z-index'in etkisi olmaz —
    // bu yüzden üstte görünmesi gereken ok, dizide en son olmalı.
    const decorated = edges.map((e) => {
      const ids = (e.data as ProcessEdgeData | undefined)?.originalIds
      const active = ids?.length
        ? ids.some((id) => pathHighlight.edgeIds.has(id))
        : pathHighlight.edgeIds.has(
            (e.data as ProcessEdgeData | undefined)?.originalId ?? e.id,
          )
      const route = (e.data as ProcessEdgeData | undefined)?.route
      const routeClass =
        route === 'jump' ? ' pf-edge-jump' : route === 'back' ? ' pf-edge-back' : ''
      return {
        ...e,
        className: `${active ? 'pf-edge-onpath' : 'pf-edge-offpath'}${routeClass}`,
        zIndex: active ? 1 : 0,
        data: { ...e.data, active, dim: !active },
        markerEnd: active
          ? { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#2f6fed' }
          : e.markerEnd,
      }
    })
    const dimmed = decorated.filter((e) => !e.data.active)
    const active = decorated.filter((e) => e.data.active)
    return [...dimmed, ...active]
  }, [edges, pathHighlight])

  const realCount = realNodes(graph).length
  const selected = graph.nodes.find((n) => n.id === selectedId && n.kind !== 'dummy')

  return (
    <div className="pf-shell">
      <div className={`pf-canvas-wrap${expanded ? ' is-expanded' : ''}`}>
        <div className="pf-canvas-tools">
          <button
            type="button"
            className="tl-zoom"
            title={expanded ? 'Küçült (Esc)' : 'Tam ekran'}
            aria-label={expanded ? 'Küçült' : 'Tam ekran'}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="tl-zoom-glyph" aria-hidden>
              {expanded ? (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path
                    d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path
                    d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          </button>
          <div className="pf-view-tabs" role="tablist" aria-label="Süreç katmanı">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'omurga'}
              className={`pf-view-tab${viewMode === 'omurga' ? ' is-on' : ''}`}
              onClick={collapseAll}
              title="Mutlu yol ve birincil kararlar (XML’den türetilir)"
            >
              Omurga
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'detay'}
              className={`pf-view-tab${viewMode === 'detay' ? ' is-on' : ''}`}
              onClick={expandLayer}
              title="Görünür her adımın bir sonraki XML komşularını aç"
            >
              Detay
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'istisna'}
              className={`pf-view-tab${viewMode === 'istisna' ? ' is-on' : ''}`}
              onClick={showExceptions}
              title="Reddet, Değişiklik Yap, bağlantısız uçlar"
            >
              İstisna
            </button>
          </div>
          <button type="button" className="pf-add-note" onClick={addNote}>
            Not ekle
          </button>
          <button
            type="button"
            className="pf-add-note"
            onClick={resetLayout}
            title="Düğüm konumlarını ilk yerleşime al"
          >
            Eski haline döndür
          </button>
        </div>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => {
            setNodes((curr) => {
              persistFromNodes(curr)
              return curr
            })
          }}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          nodesConnectable={false}
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          minZoom={0.15}
          maxZoom={1.8}
          fitView
          fitViewOptions={{ padding: 0.28, maxZoom: 1.05, includeHiddenNodes: false }}
          defaultEdgeOptions={{
            style: { stroke: '#94a3b8', strokeWidth: 1.4 },
          }}
          defaultViewport={{ x: 24, y: 24, zoom: 0.85 }}
          proOptions={{ hideAttribution: true }}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedId(undefined)}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      {selected && !expanded ? (
        <aside className="pf-detail">
          <p className="pf-detail-kicker">{KIND_LABEL[selected.kind]}</p>
          <h3 className="pf-detail-title">{selected.name}</h3>
          {selected.services.length ? (
            <ul className="pf-detail-svcs">
              {selected.services.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="pf-detail-empty">Bu adımda servis çağrısı yok.</p>
          )}
          {selected.copyOf ? (
            <p className="pf-detail-hint">
              XML’de tek adım; diyagramda kararın yanında görsel kopya olarak duruyor.
            </p>
          ) : null}
          <p className="pf-detail-hint">
            {realCount > COLLAPSE_AT
              ? 'Omurga XML’den türetilir (~ana kararlar). Kutuya tıkla veya Detay: içerideki geçişler. İstisna: Reddet / Değişiklik Yap / bağlantısız uçlar. Kaynak hâlâ 137 geçiş; özet yerini tutmaz.'
              : 'Sürükle, zoom ve not ekle. XML’e yazılmaz.'}
          </p>
          <p className="pf-detail-hint">
            Bir düğümün üzerine gel: yalnızca o adıma gelen 2 hop (düğüm + ok) vurgulanır.
          </p>
        </aside>
      ) : null}
    </div>
  )
}

export function ProcessFlowCanvas({ graph }: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner graph={graph} />
    </ReactFlowProvider>
  )
}
