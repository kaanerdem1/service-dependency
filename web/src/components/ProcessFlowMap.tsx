import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
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
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type {
  ProcessDecisionInfo,
  ProcessFlowGraph,
  ProcessFlowNodeKind,
  ProcessIncomingTransition,
  ProcessOutgoingTransition,
  ProcessNodeDetails,
} from '../types'
import { ProcessFlowDetailDrawer } from './ProcessFlowDetailDrawer'
import { KTF_REFERENCE_POSITIONS, KTF_REFERENCE_ROUTES } from './processFlowReferenceLayout'
import {
  NOTE_COLLAPSED_HEIGHT,
  NOTE_COLLAPSED_WIDTH,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  NOTE_MAX_HEIGHT,
  NOTE_MAX_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  readProcessFlowNotes,
  writeProcessFlowNotes,
  type ProcessFlowNote,
} from './processFlowNotes'
import { summarizeProcessFlow } from './processFlowSummary'

const RANK_SEP = 250
const NODE_SEP = 108
const FAN_GAP = 122
const COL_GAP = 112
const ORIGIN = { x: 60, y: 49.2 }
const NODE_W = 168
const NODE_H = 76
const GATEWAY_H = 108
const RAIL_PAD = 36
const RAIL_GAP = 28
const CORNER = 36
const WIDE_SPAN = 1600
const START_ZOOM = 0.9

type ProcessNodeData = {
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
  subProcessNo?: string
  decisionInfo?: ProcessDecisionInfo
  details?: ProcessNodeDetails
}

type RouteKind = 'direct' | 'jump' | 'back'

type ProcessEdgeData = {
  originalId?: string
  labels?: string[]
  route?: RouteKind
  lane?: number
  railY?: number
  /** Aynı kaynaktan (jump) veya aynı hedefe (back) birden fazla ok varsa,
   * her birinin ray içindeki sırası — çıkışta hemen ayrışsınlar diye
   * kancanın yatay uzunluğu bu değere göre kademelenir (bkz. kitEdgePath). */
  slot?: number
  bandMinY?: number
  bandMaxY?: number
  active?: boolean
  dim?: boolean
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

/** Üstten sadece giriş kabul edilir, hiçbir zaman çıkış olmaz — bir düğümün
 * üzerinden ok başlatmak, akışı okurken "bu adımdan mı çıkıyor, mu giriyor"
 * karışıklığına yol açıyordu. Çıkışlar sadece sağdan (ileri) veya alttan
 * (uzak sıçrama) olur.
 *
 * Alttaki iki handle ('b' çıkış, 'bi' giriş) kasıtlı olarak farklı X
 * noktalarına oturtulur (%38 / %62) — ikisi de tam ortada (varsayılan %50)
 * olsaydı, bir düğüme alttan gelen "jump" oku ile o düğümden alta çıkan
 * başka bir "jump" oku BİREBİR aynı pikselden giriş/çıkış yapardı; bu da
 * hangisinin giriş hangisinin çıkış olduğunu ayırt edilemez hale getiriyordu
 * (bkz. 105116 "Fiyatlama ve Risk Vadesi Bölge Yetkisinde mi?" kararı). */
function Ports() {
  return (
    <>
      <Handle id="l" type="target" position={Position.Left} className="pf-h" />
      <Handle id="r" type="source" position={Position.Right} className="pf-h" />
      <Handle id="ti" type="target" position={Position.Top} className="pf-h" />
      <Handle id="b" type="source" position={Position.Bottom} className="pf-h" style={{ left: '62%' }} />
      <Handle id="bi" type="target" position={Position.Bottom} className="pf-h" style={{ left: '38%' }} />
    </>
  )
}

function ProcessStepNode({ data, selected }: NodeProps<ProcessNodeData>) {
  if (data.kind === 'start' || data.kind === 'end') {
    return (
      <div className={`pf-node pf-node-event is-${data.kind}${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-event-kicker">{KIND_LABEL[data.kind]}</span>
        <div className="pf-event-circle" />
        <strong className="pf-event-label">{data.label}</strong>
      </div>
    )
  }

  if (data.kind === 'subprocess') {
    return (
      <div className={`pf-node is-subprocess${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-node-icon">↳</span>
        <span className="pf-node-kind">{KIND_LABEL.subprocess}</span>
        <strong className="pf-node-title">{data.label}</strong>
        {data.subProcessNo ? (
          <span className="pf-node-subproc" title={`Alt süreç: ${data.subProcessNo}`}>
            {data.subProcessNo}
          </span>
        ) : null}
      </div>
    )
  }

  if (data.kind === 'decision') {
    return (
      <div className={`pf-node pf-node-gateway is-decision${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-event-kicker">{KIND_LABEL.decision}</span>
        <div className="pf-gateway-diamond">
          <span className="pf-gateway-mark">✕</span>
        </div>
        <strong className="pf-gateway-label">{data.label}</strong>
      </div>
    )
  }

  return (
    <div className={`pf-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Ports />
      {data.kind === 'service' ? <span className="pf-node-icon">⚙</span> : null}
      <span className="pf-node-kind">{KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      {data.services[0] ? (
        <span className="pf-node-svc" title={data.services.join(', ')}>
          {data.services[0]}
        </span>
      ) : null}
    </div>
  )
}

/** Bir düğüme DOKUNAN (kaynak VEYA hedef olarak — ikisi de sayılır) aynı
 * rota tipindeki (back/jump) tüm okları, hash tabanlı sözde-rastgele bir
 * ofset yerine, diğer ucun Y konumuna göre sıralı ve çakışmasız bir "slot"
 * (0,1,2,...) atar. Böylece örn. 3 ayrı görevden aynı karara dönen "Onay"
 * okları üst üste binmez, her biri kendi rayında ayrışmış görünür.
 *
 * ÖNEMLİ: bir düğümün SADECE kaynak-grubu veya SADECE hedef-grubu ayrı ayrı
 * gruplanırsa yetmez — örn. bir karara alttan "jump" ile giren BİR ok ile o
 * karardan alta çıkan BAŞKA bir "jump" ok, iki farklı grupta (biri hedef
 * grubu, biri kaynak grubu) ayrı ayrı slot=0 alıp aynı yatay rayda üst üste
 * biner (105116'da "Fiyatlama ve Risk Vadesi Bölge Yetkisinde mi?" kararına
 * giren/çıkan iki "false" oku gibi). Bu yüzden bir düğüme DOKUNAN tüm
 * back/jump okları TEK bir gruba toplanır (yön farkı olmadan) ve bir okun
 * nihai slotu, iki ucundaki (kaynak + hedef) grup slotlarının BÜYÜĞÜ olur —
 * herhangi bir ucu paylaşan iki ok asla aynı slotta kalmaz. */
function assignRailSlots(
  edges: Edge[],
  positions: Record<string, { x: number; y: number }>,
): Map<string, number> {
  const backTouch = new Map<string, Edge[]>()
  const jumpTouch = new Map<string, Edge[]>()
  const pushInto = (m: Map<string, Edge[]>, key: string, e: Edge) => {
    const list = m.get(key) ?? []
    list.push(e)
    m.set(key, list)
  }
  for (const e of edges) {
    const route = (e.data as ProcessEdgeData | undefined)?.route
    if (route === 'back') {
      pushInto(backTouch, e.source, e)
      pushInto(backTouch, e.target, e)
    } else if (route === 'jump') {
      pushInto(jumpTouch, e.source, e)
      pushInto(jumpTouch, e.target, e)
    }
  }
  const yOf = (id: string) => positions[id]?.y ?? 0
  const otherEndY = (e: Edge, touchedNode: string) =>
    yOf(e.source === touchedNode ? e.target : e.source)
  /** touchMap: nodeId -> o düğüme dokunan okların listesi. Her düğüm için
   * kendi içinde sıralı slotlar üretir; sonucu nodeId -> (edgeId -> slot). */
  const slotsPerNode = (touchMap: Map<string, Edge[]>): Map<string, Map<string, number>> => {
    const out = new Map<string, Map<string, number>>()
    for (const [node, list] of touchMap) {
      const sorted = [...list].sort(
        (a, b) => otherEndY(a, node) - otherEndY(b, node) || a.id.localeCompare(b.id),
      )
      const m = new Map<string, number>()
      sorted.forEach((e, i) => m.set(e.id, i))
      out.set(node, m)
    }
    return out
  }
  const backPerNode = slotsPerNode(backTouch)
  const jumpPerNode = slotsPerNode(jumpTouch)

  const slotOf = new Map<string, number>()
  for (const e of edges) {
    const route = (e.data as ProcessEdgeData | undefined)?.route
    const perNode = route === 'back' ? backPerNode : route === 'jump' ? jumpPerNode : undefined
    if (!perNode) continue
    const s1 = perNode.get(e.source)?.get(e.id) ?? 0
    const s2 = perNode.get(e.target)?.get(e.id) ?? 0
    slotOf.set(e.id, Math.max(s1, s2))
  }
  return slotOf
}

function classifyRoute(sourceX: number, targetX: number): RouteKind {
  if (targetX < sourceX - 20) return 'back'
  if (targetX - sourceX > RANK_SEP * 0.8) return 'jump'
  return 'direct'
}

function handlesFor(route: RouteKind) {
  if (route === 'jump') return { sourceHandle: 'b', targetHandle: 'bi' }
  // "Geri" oku üst rayı kullanır ama üstten çıkış yasak: sağdan çıkıp
  // hedefin üstüne (sadece giriş) bağlanır.
  if (route === 'back') return { sourceHandle: 'r', targetHandle: 'ti' }
  return { sourceHandle: 'r', targetHandle: 'l' }
}

function nodeBox(
  pos: { x: number; y: number },
  kind?: ProcessFlowNodeKind,
): { left: number; top: number; right: number; bottom: number } {
  const h = kind === 'decision' ? GATEWAY_H : kind === 'start' || kind === 'end' ? 64 : NODE_H
  const w = kind === 'decision' ? 132 : NODE_W
  return { left: pos.x, top: pos.y, right: pos.x + w, bottom: pos.y + h }
}

function flowBand(
  positions: Record<string, { x: number; y: number }>,
  kindById: Map<string, ProcessFlowNodeKind>,
) {
  let minY = ORIGIN.y
  let maxY = ORIGIN.y + NODE_H
  for (const [id, pos] of Object.entries(positions)) {
    const box = nodeBox(pos, kindById.get(id))
    minY = Math.min(minY, box.top)
    maxY = Math.max(maxY, box.bottom)
  }
  return { minY, maxY }
}

function corridorObstacles(
  positions: Record<string, { x: number; y: number }>,
  kindById: Map<string, ProcessFlowNodeKind>,
  xMin: number,
  xMax: number,
  exclude: Set<string>,
) {
  let minTop = Infinity
  let maxBottom = -Infinity
  for (const [id, pos] of Object.entries(positions)) {
    if (exclude.has(id)) continue
    const box = nodeBox(pos, kindById.get(id))
    if (box.right < xMin || box.left > xMax) continue
    minTop = Math.min(minTop, box.top)
    maxBottom = Math.max(maxBottom, box.bottom)
  }
  return { minTop, maxBottom }
}

function kitEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  route: RouteKind,
  slotKey: string,
  referenceRailY: number | undefined,
  bandMinY: number,
  bandMaxY: number,
  lane = 0,
  slot = 0,
) {
  const lift = lane * 18
  if (route === 'direct') {
    const path = `M ${sourceX},${sourceY} C ${sourceX + 50},${sourceY + lift} ${targetX - 50},${targetY + lift} ${targetX},${targetY}`
    return {
      path,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2 + lift,
    }
  }
  // referenceRailY normalde withEdgeRoutes tarafından her zaman doldurulur
  // (bkz. assignRailSlots); burası sadece pozisyon bulunamayan istisnai bir
  // durum için son çare (slot=0) olarak kalır.
  void slotKey
  // Köşe yarıçapı, dikey/yatay mesafeye göre sınırlanır; böylece kısa
  // saplarda bile eğri kendi üstüne binmez ama mümkün olduğunca geniş ve
  // yuvarlak kalır — "çıkış -> ray -> giriş" sert dik açı gibi görünmesin.
  const roundBack = (railY: number) => {
    const rV = Math.min(CORNER, Math.abs(railY - sourceY) * 0.9, Math.abs(railY - targetY) * 0.9)
    const rH = Math.min(CORNER, Math.abs(targetX - sourceX) * 0.4)
    const r = Math.max(4, Math.min(rV, rH))
    return r
  }
  // Aynı düğümden (kaynak) birden fazla back/jump oku çıkıyorsa, hepsi aynı
  // handle noktasından aynı yönde "kanca" ile çıkarsa, farklı raylara gitse
  // bile ÇIKIŞTA hâlâ üst üste düz bir çizgi gibi görünür (bkz. "3 ok
  // dümdüz aşağı inip sonra ayrılıyor" şikayeti). Bu yüzden kanca uzunluğu
  // (kx), o okun slot sırasına göre kademelenir — her ok düğümden hemen
  // farklı bir X'e doğru ayrılarak çıkar, aşağıda değil ÇIKIŞTA ayrışırlar.
  const SLOT_STAGGER = 14
  if (route === 'back') {
    const railY = (referenceRailY ?? bandMinY - RAIL_PAD) + lift
    const r = roundBack(railY)
    // Çıkış: düğümün sağından hemen dikey fırlamak yerine önce biraz sağa
    // (yataya) açılıp, sonra rayına yumuşakça kıvrılarak yükselir. Aynı
    // sütundaki birden fazla görevin çıkışı böylece üst üste binen dümdüz
    // dikey çizgiler gibi görünmez; her biri kendi düğümünden ayrışarak,
    // eğri bir "kanca" ile çıkar — yön daha net okunur.
    const kx = Math.max(16, Math.min(34, r + 8)) + slot * SLOT_STAGGER
    const path = `M ${sourceX},${sourceY} C ${sourceX + kx},${sourceY} ${sourceX + kx},${railY + r} ${sourceX + kx},${railY + r} Q ${sourceX + kx},${railY} ${sourceX + kx - r},${railY} L ${targetX + r},${railY} Q ${targetX},${railY} ${targetX},${railY + r} L ${targetX},${targetY}`
    return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
  }
  const railY = (referenceRailY ?? bandMaxY + RAIL_PAD) + lift
  const r = roundBack(railY)
  const kx = Math.max(16, Math.min(34, r + 8)) + slot * SLOT_STAGGER
  const path = `M ${sourceX},${sourceY} C ${sourceX + kx},${sourceY} ${sourceX + kx},${railY - r} ${sourceX + kx},${railY - r} Q ${sourceX + kx},${railY} ${sourceX + kx - r},${railY} L ${targetX - r},${railY} Q ${targetX},${railY} ${targetX},${railY - r} L ${targetX},${targetY}`
  return { path, labelX: (sourceX + targetX) / 2, labelY: railY }
}

function ProcessEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
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
    data?.lane ?? 0,
    data?.slot ?? 0,
  )
  const active = !!data?.active
  const dim = !!data?.dim
  const stroke = active
    ? '#2f6fed'
    : route === 'back'
      ? '#e05b4f'
      : route === 'jump'
        ? '#2f6fed'
        : '#a8b0bc'
  const dash = active ? undefined : route === 'direct' ? undefined : '5 4'
  const width = active ? 2.5 : route === 'direct' ? 1.5 : 1.3
  const opacity = active ? 1 : dim ? 0.16 : route === 'direct' ? 1 : 0.55
  const stateClass = active ? ' is-onpath' : dim ? ' is-dim' : ''
  // Akış yönünü belirtmek için label'ın hemen öncesine ve sonrasına küçük
  // ok işaretleri koyulur — "akan" animasyon yerine sabit, okunması kolay
  // bir yön ipucu. Ray tabanlı (jump/back) rotalarda etiketin durduğu segment
  // her zaman yataydır; 'direct' rotada ise gerçek eğime göre döndürülür ki
  // eğik bir çizgide yatay ok görünmesin.
  const dirSign = targetX >= sourceX ? 1 : -1
  const angleDeg =
    route === 'direct'
      ? (Math.atan2(targetY - sourceY, targetX - sourceX) * 180) / Math.PI
      : dirSign > 0
        ? 0
        : 180
  const angleRad = (angleDeg * Math.PI) / 180
  const ux = Math.cos(angleRad)
  const uy = Math.sin(angleRad)
  const span = Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY)
  const showChevrons = !!label && span > 70
  const chevronGap = 20
  const preChevron = { x: labelX - ux * chevronGap, y: labelY - uy * chevronGap }
  const postChevron = { x: labelX + ux * chevronGap, y: labelY + uy * chevronGap }
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={active ? 'url(#pf-arrow-active)' : `url(#pf-arrow-${route})`}
        style={{ ...style, stroke, strokeWidth: width, strokeDasharray: dash, opacity }}
        interactionWidth={28}
      />
      {label ? (
        <EdgeLabelRenderer>
          {showChevrons ? (
            <span
              className={`pf-edge-chevron${stateClass}`}
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                color: stroke,
                transform: `translate(-50%, -50%) translate(${preChevron.x}px, ${preChevron.y}px) rotate(${angleDeg}deg)`,
              }}
              aria-hidden
            >
              ›
            </span>
          ) : null}
          <div
            className={`pf-edge-label${stateClass}`}
            title={data?.labels?.length ? mergeTransitionLabels(data.labels) : undefined}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
          {showChevrons ? (
            <span
              className={`pf-edge-chevron${stateClass}`}
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                color: stroke,
                transform: `translate(-50%, -50%) translate(${postChevron.x}px, ${postChevron.y}px) rotate(${angleDeg}deg)`,
              }}
              aria-hidden
            >
              ›
            </span>
          ) : null}
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

type NoteNodeData = {
  text: string
  collapsed: boolean
  expandedWidth?: number
  expandedHeight?: number
  onChange: (text: string) => void
  onRemove: () => void
  onResizeEnd: () => void
  onToggleCollapse: () => void
}

function NoteNode({ data, selected }: NodeProps<NoteNodeData>) {
  if (data.collapsed) {
    const hint = data.text.trim() ? data.text : 'Açmak için tıkla'
    return (
      <div className="pf-note pf-note-collapsed" title={hint}>
        <span className="pf-note-chip">Not</span>
      </div>
    )
  }

  return (
    <div className={`pf-note${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={NOTE_MIN_WIDTH}
        minHeight={NOTE_MIN_HEIGHT}
        maxWidth={NOTE_MAX_WIDTH}
        maxHeight={NOTE_MAX_HEIGHT}
        color="#e3b341"
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 10, height: 10, borderRadius: 2 }}
        onResizeEnd={() => data.onResizeEnd()}
      />
      <div className="pf-note-toolbar">
        <button
          type="button"
          className="pf-note-del"
          onClick={(e) => {
            e.stopPropagation()
            data.onRemove()
          }}
        >
          Sil
        </button>
        <button
          type="button"
          className="pf-note-collapse"
          onClick={(e) => {
            e.stopPropagation()
            data.onToggleCollapse()
          }}
          aria-label="Notu kapat"
          title="Kapat"
        >
          −
        </button>
      </div>
      <textarea
        value={data.text}
        placeholder="Not…"
        onChange={(e) => data.onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  processStep: memo(ProcessStepNode),
  processNote: memo(NoteNode),
}
const edgeTypes: EdgeTypes = { processEdge: memo(ProcessEdge) }

function notesFromNodes(list: Node[]): ProcessFlowNote[] {
  return list
    .filter((n) => n.type === 'processNote')
    .map((n) => {
      const data = n.data as NoteNodeData
      return {
        id: n.id,
        text: data.text ?? '',
        x: n.position.x,
        y: n.position.y,
        width: typeof n.width === 'number' ? n.width : undefined,
        height: typeof n.height === 'number' ? n.height : undefined,
        collapsed: data.collapsed ?? false,
        expandedWidth: data.expandedWidth,
        expandedHeight: data.expandedHeight,
      }
    })
}

function noteActions(
  id: string,
  processNo: string,
  setNodes: ReturnType<typeof useNodesState>[1],
  persistNotes: () => void,
): Pick<NoteNodeData, 'onChange' | 'onRemove' | 'onResizeEnd' | 'onToggleCollapse'> {
  const persist = (rows: Node[]) => writeProcessFlowNotes(processNo, notesFromNodes(rows))
  return {
    onChange: (text) => {
      setNodes((rows) => {
        const next = rows.map((row) =>
          row.id === id ? { ...row, data: { ...(row.data as NoteNodeData), text } } : row,
        )
        persist(next)
        return next
      })
    },
    onRemove: () => {
      setNodes((rows) => {
        const next = rows.filter((row) => row.id !== id)
        persist(next)
        return next
      })
    },
    onResizeEnd: persistNotes,
    onToggleCollapse: () => {
      setNodes((rows) => {
        const next = rows.map((row) => {
          if (row.id !== id) return row
          const data = row.data as NoteNodeData
          if (data.collapsed) {
            return {
              ...row,
              width: data.expandedWidth ?? NOTE_DEFAULT_WIDTH,
              height: data.expandedHeight ?? NOTE_DEFAULT_HEIGHT,
              data: { ...data, collapsed: false },
            }
          }
          return {
            ...row,
            width: NOTE_COLLAPSED_WIDTH,
            height: NOTE_COLLAPSED_HEIGHT,
            data: {
              ...data,
              collapsed: true,
              expandedWidth: typeof row.width === 'number' ? row.width : NOTE_DEFAULT_WIDTH,
              expandedHeight: typeof row.height === 'number' ? row.height : NOTE_DEFAULT_HEIGHT,
            },
          }
        })
        persist(next)
        return next
      })
    },
  }
}

function noteNodesFromStorage(processNo: string): Node[] {
  return readProcessFlowNotes(processNo).map((note) => {
    const collapsed = note.collapsed ?? false
    return {
      id: note.id,
      type: 'processNote' as const,
      position: { x: note.x, y: note.y },
      width: collapsed ? NOTE_COLLAPSED_WIDTH : (note.width ?? NOTE_DEFAULT_WIDTH),
      height: collapsed ? NOTE_COLLAPSED_HEIGHT : (note.height ?? NOTE_DEFAULT_HEIGHT),
      data: {
        text: note.text,
        collapsed,
        expandedWidth: note.expandedWidth,
        expandedHeight: note.expandedHeight,
        onChange: () => undefined,
        onRemove: () => undefined,
        onResizeEnd: () => undefined,
        onToggleCollapse: () => undefined,
      } satisfies NoteNodeData,
      draggable: true,
      selectable: true,
      zIndex: 6,
    }
  })
}

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
 * (canonicalPredecessors) bu ortak DAG üzerinden çalışır — iki yerde ayrı
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

/** Her düğüm için, start'tan ona giden EN UZUN yolda hemen önceki düğümü
 * ("kanonik" öncül) hesaplar. Bu, o düğüme "gerçekte" nasıl ulaşıldığını
 * gösteren tek, deterministik bir zincir üretir — hover/seçim anında
 * start'tan o düğüme kadar olan yolu vurgulamak için kullanılır. Kopuk
 * (start'tan erişilemeyen) düğümlerin öncülü yoktur. */
function canonicalPredecessors(graph: ProcessFlowGraph): Map<string, string> {
  const { starts, dagChildren } = buildDag(graph)
  const reached = reachableFromStarts(starts, dagChildren)
  const idSet = reached
  const indegree = new Map<string, number>([...reached].map((id) => [id, 0]))
  for (const id of reached) {
    for (const to of dagChildren.get(id) ?? []) {
      if (idSet.has(to)) indegree.set(to, (indegree.get(to) ?? 0) + 1)
    }
  }
  const rank = new Map<string, number>()
  const pred = new Map<string, string>()
  const queue = [...reached]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b, 'tr'))
  for (const id of queue) rank.set(id, 0)
  for (const id of starts) rank.set(id, 0)
  const remaining = new Map(indegree)
  while (queue.length) {
    const from = queue.shift()!
    const h = rank.get(from) ?? 0
    for (const to of dagChildren.get(from) ?? []) {
      if (!idSet.has(to)) continue
      const candidate = h + 1
      if (candidate > (rank.get(to) ?? -1)) {
        rank.set(to, candidate)
        pred.set(to, from)
      }
      const left = (remaining.get(to) ?? 0) - 1
      remaining.set(to, left)
      if (left === 0) queue.push(to)
    }
  }
  return pred
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

function withEdgeRoutes(
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

function incomingTransitionsFor(
  graph: ProcessFlowGraph,
  nodeId: string,
): ProcessIncomingTransition[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const rows: ProcessIncomingTransition[] = []
  for (const e of graph.edges) {
    if (e.to !== nodeId || isDummyId(e.from)) continue
    const from = byId.get(e.from)
    if (!from) continue
    rows.push({
      fromId: e.from,
      fromName: from.name,
      fromKind: from.kind,
      label: e.label?.trim() || undefined,
    })
  }
  return rows
}

/** Seçili adımdan çıkan TÜM geçişler (label + hedef) — servisi olmayan
 * geçişler (örn. "Reddet") "details.groups" içinde hiç görünmüyordu, bu da
 * ekranda 3 ok varken drawer'da 2 "Geçiş:" bölümü görünmesine yol açıyordu.
 * Bu liste, görünen ok sayısıyla her zaman birebir eşleşir. */
function outgoingTransitionsFor(
  graph: ProcessFlowGraph,
  nodeId: string,
): ProcessOutgoingTransition[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const rows: ProcessOutgoingTransition[] = []
  for (const e of graph.edges) {
    if (e.from !== nodeId || isDummyId(e.to)) continue
    const to = byId.get(e.to)
    if (!to) continue
    rows.push({
      toId: e.to,
      toName: to.name,
      toKind: to.kind,
      label: e.label?.trim() || undefined,
    })
  }
  return rows
}

/** Bir hedefe (örn. "Reddet") birden fazla uzak karardan "back" oku
 * geliyorsa, tek düğüm etrafında kalabalıklaşma ve uzun ray çakışması olur.
 * Deneysel çözüm: ilk kaynak gerçek düğüme bağlı kalır, kalan her kaynağın
 * yanına küçük, salt-görsel bir kopya konur ve o kaynağın oku artık kısa/
 * doğrudan bu kopyaya bağlanır — grafın kendisi (node/edge sayısı, drawer
 * içeriği) değişmez, sadece ekranda nereye çizildiği değişir. */
const SINK_COPY_GAP_X = 40
const SINK_COPY_OFFSET_Y = -52

function sinkCopyRealId(id: string): string {
  const at = id.indexOf('::near:')
  return at < 0 ? id : id.slice(0, at)
}

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

function buildGraph(graph: ProcessFlowGraph): { nodes: Node[]; edges: Edge[] } {
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
      } satisfies ProcessEdgeData,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#a8b0bc' },
    }
  })
  const routedEdges = withEdgeRoutes(graph, baseEdges, posMap)
  const { nodes: finalNodes, edges } = splitCrowdedBackSinks(graph, nodes, routedEdges, posMap)
  return { nodes: finalNodes, edges }
}

function EdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
      <defs>
        <marker id="pf-arrow-direct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8b0bc" />
        </marker>
        <marker id="pf-arrow-jump" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f6fed" />
        </marker>
        <marker id="pf-arrow-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#e05b4f" />
        </marker>
        <marker id="pf-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f6fed" />
        </marker>
      </defs>
    </svg>
  )
}

function startCamera(nodes: Node[]) {
  const start =
    nodes.find((n) => (n.data as ProcessNodeData | undefined)?.kind === 'start') ?? nodes[0]
  const zoom = START_ZOOM
  return {
    x: 72 - (start?.position.x ?? ORIGIN.x) * zoom,
    y: 120 - (start?.position.y ?? ORIGIN.y) * zoom,
    zoom,
  }
}

function graphSpanX(nodes: Node[]) {
  let minX = Infinity
  let maxX = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x)
    maxX = Math.max(maxX, n.position.x)
  }
  return Number.isFinite(minX) ? maxX - minX : 0
}

function FullscreenGlyph({ expanded }: { expanded: boolean }) {
  return (
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
  )
}

function ProcessFlowMapInner({
  graph,
  screens,
  onDismiss,
  canGoBack,
  onBackToParent,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
  onOpenSubProcess,
}: {
  graph: ProcessFlowGraph
  screens?: ReactNode
  onDismiss?: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
}) {
  const processNo = graph.catalogNo ?? graph.no
  const seed = useMemo(() => {
    const built = buildGraph(graph)
    return {
      nodes: [...built.nodes, ...noteNodesFromStorage(processNo)],
      edges: built.edges,
    }
  }, [graph, processNo])
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes)
  const [edges, setEdges] = useEdgesState(seed.edges)
  const [hoverId, setHoverId] = useState<string>()
  const [dragId, setDragId] = useState<string>()
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    initialSelectedNodeId,
  )
  const [expanded, setExpanded] = useState(false)
  const dragRef = useRef<string | undefined>(undefined)
  const dragMovedRef = useRef(false)
  const { setViewport, getNodes } = useReactFlow()
  const focusId = selectedNodeId ?? dragId ?? hoverId
  // "Buraya nasıl gelinir?" — hover/seçim anında start'tan bu düğüme kadar
  // olan TEK, kanonik (en uzun yol) zinciri vurgulamak için önceden
  // hesaplanır. Süreç değişmediği sürece yeniden hesaplanmaz.
  const canonicalPred = useMemo(() => canonicalPredecessors(graph), [graph])
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId),
    [graph.nodes, selectedNodeId],
  )
  const selectedIncoming = useMemo(
    () => (selectedNodeId ? incomingTransitionsFor(graph, selectedNodeId) : []),
    [graph, selectedNodeId],
  )
  const selectedOutgoing = useMemo(
    () => (selectedNodeId ? outgoingTransitionsFor(graph, selectedNodeId) : []),
    [graph, selectedNodeId],
  )
  const processNodes = useMemo(
    () => seed.nodes.filter((n) => n.type !== 'processNote'),
    [seed.nodes],
  )
  const wide = processNodes.length > 18 || graphSpanX(processNodes) > WIDE_SPAN
  const summary = useMemo(() => summarizeProcessFlow(graph), [graph])

  const persistNotes = useCallback(() => {
    setNodes((rows) => {
      writeProcessFlowNotes(processNo, notesFromNodes(rows))
      return rows
    })
  }, [processNo, setNodes])

  const refreshEdgeRoutes = useCallback(() => {
    const posMap = Object.fromEntries(
      getNodes()
        .filter((n) => n.type !== 'processNote')
        .map((n) => [n.id, n.position]),
    )
    setEdges((curr) => withEdgeRoutes(graph, curr, posMap))
  }, [getNodes, graph, setEdges])

  useEffect(() => {
    const built = buildGraph(graph)
    setNodes((curr) => {
      const keptNotes = curr.filter((n) => n.type === 'processNote')
      const notes = keptNotes.length > 0 ? keptNotes : noteNodesFromStorage(processNo)
      return [...built.nodes, ...notes]
    })
    setEdges(built.edges)
    if (!initialSelectedNodeId) setSelectedNodeId(undefined)
  }, [graph, initialSelectedNodeId, processNo, setNodes, setEdges])

  useEffect(() => {
    if (!initialSelectedNodeId) return
    setSelectedNodeId(initialSelectedNodeId)
    onRestoreConsumed?.()
  }, [initialSelectedNodeId, onRestoreConsumed])

  useEffect(() => {
    if (!wide) return
    setViewport(startCamera(processNodes), { duration: 0 })
  }, [graph.no, processNodes, setViewport, wide])

  useEffect(() => {
    setNodes((curr) =>
      curr.map((n) => {
        if (n.type !== 'processNote') return n
        const data = n.data as NoteNodeData
        return {
          ...n,
          data: {
            ...data,
            ...noteActions(n.id, processNo, setNodes, persistNotes),
          },
        }
      }),
    )
  }, [processNo, persistNotes, setNodes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedNodeId) {
        e.preventDefault()
        setSelectedNodeId(undefined)
        return
      }
      if (expanded) setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, selectedNodeId])

  const neighborhood = useMemo(() => {
    if (!focusId) return null
    // Görsel kopyalar ("Reddet"in kaynağa yakın kopyası gibi) için gerçek
    // düğüm kimliğine dön; kanonik zincir hep gerçek graf id'leriyle tutulur.
    const realFocus = sinkCopyRealId(focusId)
    // start'tan realFocus'a kadar öncülleri geriye doğru izleyerek TEK yolu
    // çıkar. Kopuk (start'tan erişilemeyen) düğümlerde öncül yoktur; o
    // durumda sadece kendisini vurgula (eski "yakın komşu" davranışına düşer).
    const pathNodeIds: string[] = []
    let cur: string | undefined = realFocus
    const guard = new Set<string>()
    while (cur && !guard.has(cur)) {
      pathNodeIds.push(cur)
      guard.add(cur)
      cur = canonicalPred.get(cur)
    }
    const nodeIds = new Set<string>([focusId, ...pathNodeIds])
    const edgeIds = new Set<string>()
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const target = pathNodeIds[i]
      const source = pathNodeIds[i + 1]
      for (const e of edges) {
        if (sinkCopyRealId(e.source) === source && sinkCopyRealId(e.target) === target) {
          edgeIds.add(e.id)
        }
      }
    }
    // Odaklanılan düğümün doğrudan komşuları da (yol dışında kalsa bile)
    // hafifçe göz önünde tutulsun diye eklenir — sadece kendisine giren/çıkan
    // okları da işaretle (fan-out'un tamamı değil, en azından hemen
    // önceki/sonraki bağlamı kaybetmesin).
    for (const e of edges) {
      if (e.source !== focusId && e.target !== focusId) continue
      edgeIds.add(e.id)
      nodeIds.add(e.source)
      nodeIds.add(e.target)
    }
    return { nodeIds, edgeIds }
  }, [edges, focusId, canonicalPred])

  const shownNodes = useMemo(() => {
    const base = nodes.map((n) => {
      if (n.type === 'processNote') {
        return { ...n, zIndex: 6, className: 'pf-note-node' }
      }
      const isSelected = !!selectedNodeId && sinkCopyRealId(n.id) === selectedNodeId
      return {
        ...n,
        className: [n.className, isSelected ? 'pf-node-detail-selected' : ''].filter(Boolean).join(' '),
        selected: isSelected,
        zIndex: isSelected ? 14 : 6,
      }
    })
    if (!neighborhood) return base
    const decorated = base.map((n) => {
      if (n.type === 'processNote') return n
      const active = neighborhood.nodeIds.has(n.id)
      return {
        ...n,
        className: [active ? 'pf-node-onpath' : 'pf-node-offpath', n.className]
          .filter(Boolean)
          .join(' '),
        zIndex: (!!selectedNodeId && sinkCopyRealId(n.id) === selectedNodeId) ? 14 : active ? 12 : 6,
      }
    })
    const processOnly = decorated.filter((n) => n.type !== 'processNote')
    const notes = decorated.filter((n) => n.type === 'processNote')
    return [
      ...processOnly.filter((n) => n.className !== 'pf-node-onpath'),
      ...processOnly.filter((n) => n.className === 'pf-node-onpath'),
      ...notes,
    ]
  }, [neighborhood, nodes, selectedNodeId])

  const shownEdges = useMemo(() => {
    if (!neighborhood) return edges
    const decorated = edges.map((e) => {
      const active = neighborhood.edgeIds.has(e.id)
      const data = e.data as ProcessEdgeData | undefined
      return {
        ...e,
        zIndex: active ? 2 : 1,
        className: active ? 'pf-edge-onpath' : 'pf-edge-offpath',
        data: { ...data, active, dim: !active },
      }
    })
    return [
      ...decorated.filter((e) => !e.data.active),
      ...decorated.filter((e) => e.data.active),
    ]
  }, [edges, neighborhood])

  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    if (node.type === 'processNote') return
    setHoverId(node.id)
  }, [])
  const onNodeMouseLeave = useCallback(() => {
    if (!dragRef.current) setHoverId(undefined)
  }, [])
  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragMovedRef.current = false
    dragRef.current = node.id
    setDragId(node.id)
    setHoverId(node.id)
  }, [])
  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    dragMovedRef.current = true
    dragRef.current = node.id
    setDragId(node.id)
  }, [])
  const onNodeDragStop = useCallback(() => {
    dragRef.current = undefined
    setDragId(undefined)
    persistNotes()
    refreshEdgeRoutes()
    window.setTimeout(() => {
      dragMovedRef.current = false
    }, 0)
  }, [persistNotes, refreshEdgeRoutes])
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (dragMovedRef.current) return
    if (node.type === 'processNote') {
      const data = node.data as NoteNodeData
      if (data.collapsed) data.onToggleCollapse()
      return
    }
    setSelectedNodeId(sinkCopyRealId(node.id))
  }, [])
  const addNote = useCallback(() => {
    const id = `note-${Date.now()}`
    setNodes((curr) => {
      const next: Node[] = [
        ...curr,
        {
          id,
          type: 'processNote',
          position: { x: 48, y: 48 },
          width: NOTE_DEFAULT_WIDTH,
          height: NOTE_DEFAULT_HEIGHT,
          data: {
            text: '',
            collapsed: false,
            ...noteActions(id, processNo, setNodes, persistNotes),
          } satisfies NoteNodeData,
          draggable: true,
          selectable: true,
          zIndex: 6,
        },
      ]
      writeProcessFlowNotes(processNo, notesFromNodes(next))
      return next
    })
  }, [persistNotes, processNo, setNodes])
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(undefined)
  }, [])
  const closeDetail = useCallback(() => setSelectedNodeId(undefined), [])

  return (
    <div className={`pf-map-wrap${expanded ? ' is-expanded' : ''}`}>
      <header className="pf-map-head">
        <h1 className="pf-map-title">{summary.title}</h1>
        <p className="pf-map-subtitle">{summary.subtitle}</p>
        {summary.metaLine ? <p className="pf-map-meta">{summary.metaLine}</p> : null}
        {summary.statsLine ? <p className="pf-map-summary">{summary.statsLine}</p> : null}
        {screens}
      </header>
      {canGoBack && onBackToParent ? (
        <button type="button" className="pf-map-back" onClick={onBackToParent}>
          ← Geri
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="pf-map-close" onClick={onDismiss}>
          Kapat
        </button>
      ) : null}
      <div className={`pf-map-canvas${selectedNodeId ? ' is-drawer-open' : ''}`}>
        {selectedNodeId ? (
          <button
            type="button"
            className="pf-detail-scrim"
            aria-label="Detayı kapat"
            onClick={closeDetail}
          />
        ) : null}
        <div className="pf-map-tools">
          <button type="button" className="pf-add-note" onClick={addNote}>
            Not ekle
          </button>
          <button
            type="button"
            className="tl-zoom"
            title={expanded ? 'Küçült (Esc)' : 'Tam ekran'}
            aria-label={expanded ? 'Küçült' : 'Tam ekran'}
            onClick={() => setExpanded((v) => !v)}
          >
            <FullscreenGlyph expanded={expanded} />
          </button>
        </div>
        <EdgeMarkers />
        <ReactFlow
        nodes={shownNodes}
        edges={shownEdges}
        onNodesChange={onNodesChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        nodesDraggable
        panOnDrag
        panOnScroll
        zoomOnScroll
        minZoom={0.06}
        maxZoom={1.8}
        fitView={!wide}
        fitViewOptions={{ padding: 0.16 }}
        defaultViewport={wide ? startCamera(processNodes) : undefined}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background id="pf-dots" variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#c5ccd4" />
        <Controls showInteractive={false} />
        </ReactFlow>
        {selectedNode ? (
          <ProcessFlowDetailDrawer
            open
            nodeId={selectedNode.id}
            nodeName={selectedNode.name}
            kind={selectedNode.kind}
            details={selectedNode.details}
            decisionInfo={selectedNode.decisionInfo}
            services={selectedNode.services}
            subProcessNo={selectedNode.subProcessNo}
            incoming={selectedIncoming}
            outgoing={selectedOutgoing}
            onClose={closeDetail}
            onOpenService={
              onOpenService
                ? (serviceName, serviceId) =>
                    onOpenService(serviceName, selectedNode.id, serviceId)
                : undefined
            }
            onOpenSubProcess={
              onOpenSubProcess
                ? (processNo) => onOpenSubProcess(processNo, selectedNode.id)
                : undefined
            }
          />
        ) : null}
      </div>
    </div>
  )
}

export function ProcessFlowMap({
  graph,
  screens,
  onDismiss,
  canGoBack,
  onBackToParent,
  initialSelectedNodeId,
  onRestoreConsumed,
  onOpenService,
  onOpenSubProcess,
}: {
  graph: ProcessFlowGraph
  screens?: ReactNode
  onDismiss?: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
}) {
  return (
    <ReactFlowProvider>
      <ProcessFlowMapInner
        key={graph.no}
        graph={graph}
        screens={screens}
        onDismiss={onDismiss}
        canGoBack={canGoBack}
        onBackToParent={onBackToParent}
        initialSelectedNodeId={initialSelectedNodeId}
        onRestoreConsumed={onRestoreConsumed}
        onOpenService={onOpenService}
        onOpenSubProcess={onOpenSubProcess}
      />
    </ReactFlowProvider>
  )
}
