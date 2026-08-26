/**
 * Servis etki haritası (React Flow, gelişmiş görünüm).
 *
 * - Merkez solda; hop sütunları sağa doğru
 * - Yeşil ok = ana etki yolu; turuncu kesikli = yan (cascade) bağ
 * - Katman aç/kapa, proje filtresi, “bağlı methodları göster”
 * - Düğüm etiketi 2 satır; uzunsa hover’da tam ad
 *
 * Zoom / katman / lejant: orta-alt MapCanvasBar. Sidebar class adı `.left` olmamalı
 * (React Flow panel class’ı `left` ile çakışır).
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { layoutSpring, listItemTransition } from '../motion/config'
import ReactFlow, {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  getBezierPath,
  getStraightPath,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  applyProjectFilter,
  discoveryParents,
  filterEdges,
  filterNodes,
  type ProjectOption,
} from '../impact/projectFilter'
import { animateViewport, easeInOutCubic, easeOutCubic, lerp, waitMs } from '../impact/pivotTransition'
import {
  createServiceNote,
  deleteServiceNote,
  getNoteCounts,
  listMethodsForService,
  listServiceNotes,
} from '../api/client'
import {
  RADIAL_CENTER_HIT,
  RADIAL_DOT_R,
  RADIAL_HIT,
  applyRadialLayout,
  mapLabelNeedsTip,
  mapLayoutForDepth,
  mapLayoutForRadial,
  mapLeftX,
  mapNodeSizeFor,
  mapNodeWidth,
  radialAnchorOffset,
  radialEdgeGeometry,
  radialHandlePair,
  radialLabelDomStyle,
  radialLabelSide,
  radialNodeHitStyle,
  radialMaxZoom,
  radialSpokeEnds,
  wrapRadialName,
  type MapLayout,
  type MapLayoutMode,
  type RadialLabelSide,
  type RadialViewportHint,
} from '../impact/mapLayout'
import type {
  ImpactGraph,
  ImpactNode,
  MethodRef,
  NoteVisibility,
  ServiceNote,
} from '../types'
import {
  MapCanvasBar,
  MapInfoPanel,
  MapViewportSync,
  ProjectFilterHint,
  RadialLabelZoomSync,
  type VisitStep,
} from './ImpactChrome'
import { saveExploreSnapshot } from '../api/client'
import { captureSnapshotScreenshots, downloadSnapshotPng } from '../snapshot/capture'
import { snapshotHasMapImage } from '../snapshot/imageUrl'
import { useSnapshotTrailOptional } from '../snapshot/trail'
import { snapshotWatermarkLines } from '../snapshot/useSnapshotPack'

type Props = {
  graph: ImpactGraph
  projectOptions: ProjectOption[]
  onPivot: (serviceId: string) => void
  /** Metod chip → detay */
  onSelectMethod?: (serviceId: string, methodId: string) => void
  /** +N → servisin Metodlar sekmesi */
  onBrowseMethods?: (serviceId: string) => void
  onClearCenter?: () => void
  onPivotBack?: () => void
  onPivotForward?: () => void
  canPivotBack?: boolean
  canPivotForward?: boolean
  visitPath?: VisitStep[]
  visitPathIndex?: number
  onVisitSelect?: (index: number) => void
  mapExpanded?: boolean
  /** Geri/ileri: bu ziyarette bırakılan katman durumu */
  restoredView?: { visibleMaxHop: number; expandedLayers: number[] }
  onViewStateChange?: (view: {
    visibleMaxHop: number
    expandedLayers: number[]
  }) => void
  navDirection?: 'back' | 'forward' | null
  onNavDirectionConsumed?: () => void
  /** Session kullanıcı — notlar + snapshot */
  sessionUserId?: string
  sessionUserName?: string
  onMapRoot?: (el: HTMLDivElement | null) => void
  onBeforeSnapshot?: () => void
  onSnapshotSaved?: (snapshot: import('../types').Snapshot) => void
  /** Ağaç / arama ile yeni merkez → LTR'ye dön */
  forceLtrSignal?: number
}

const MAP_LAYOUT_MODE_KEY = 'sd-impact-map-layout-mode'

const LEFT_X = mapLeftX()
/** LTR: ilk 4; radial 1. katman: 8, fazlası +N */
const MAX_VISIBLE_PER_LAYER = 4
const RADIAL_HOP1_CAP = 8
const MIN_COLLAPSE_COUNT = 3
type ServiceNodeData = {
  label: string
  fullLabel: string
  showTip: boolean
  size: MapLayout['size']
  kind: 'center' | 'service' | 'collapsed'
  hop: number
  hiddenIds?: string[]
  count?: number
  /** Filtre dışı ama eşleşmeye giden ara düğüm */
  bridge?: boolean
  /** Proje filtresine uyan etkilenen servis */
  match?: boolean
  /** Görünür not sayısı (rozet) */
  noteCount?: number
  radialDot?: boolean
  radialAngle?: number
  radialCx?: number
  radialCy?: number
  radialLabelSide?: RadialLabelSide
  radialLabelGapBoost?: number
  /** Katman açılışında sıralı giriş (0-based) */
  revealIndex?: number
}

type MethodBadgeData = {
  serviceId: string
  count: number
  expanded: boolean
}

type RingGuideData = {
  radius: number
  hop: number
}

function radialHopLine(
  data: ServiceNodeData,
  isCenter: boolean,
  isCollapsed: boolean,
): string | null {
  if (isCenter) return null
  if (isCollapsed) return `Aç · ${data.count ?? 0} servis daha`
  if (data.bridge) return 'Ara yol · filtre dışı'
  if (data.match) return `${data.hop}. katman · eşleşen`
  return `${data.hop}. katman`
}

function RingGuideView({ data }: NodeProps<RingGuideData>) {
  return (
    <div
      className="map-radial-ring"
      style={{ width: data.radius * 2, height: data.radius * 2 }}
      aria-hidden
    />
  )
}

function ServiceNodeView({ id, data, xPos, yPos }: NodeProps<ServiceNodeData>) {
  const reduced = useReducedMotion()
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed'
  const radial = Boolean(data.radialDot)
  const liveAngle = (() => {
    if (!radial || isCenter) return data.radialAngle ?? 0
    if (typeof data.radialCx === 'number' && typeof data.radialCy === 'number') {
      const mid = radialAnchorOffset(false)
      return Math.atan2(yPos + mid.y - data.radialCy, xPos + mid.x - data.radialCx)
    }
    return data.radialAngle ?? 0
  })()
  const labelSide = radial
    ? data.radialLabelSide ?? radialLabelSide(liveAngle, isCenter)
    : null
  const noteCount = data.noteCount ?? 0
  const showNoteBadge =
    !radial &&
    !isCollapsed &&
    (isCenter || data.kind === 'service')
  const label = (
    <span
      className={`dd-node-label${data.showTip ? ' name-tip is-short' : ''}`}
      data-tip={data.showTip ? data.fullLabel : undefined}
    >
      {data.label}
    </span>
  )
  const radialHit = radial
    ? { ...radialNodeHitStyle(isCenter), position: 'relative' as const, overflow: 'visible' as const }
    : undefined
  const hopLine = radial ? radialHopLine(data, isCenter, isCollapsed) : null
  const radialLabelStyle =
    radial && labelSide
      ? radialLabelDomStyle(
          labelSide,
          data.fullLabel || data.label,
          isCenter,
          hopLine,
          data.radialLabelGapBoost ?? 0,
          data.hop ?? 1,
        )
      : undefined

  const reveal =
    data.revealIndex !== undefined && !reduced
  const nodeClass = [
    'dd-node',
    `size-${data.size}`,
    isCenter && 'center',
    isCollapsed && 'collapsed',
    data.bridge && 'bridge',
    data.match && 'match',
    !data.bridge && !data.match && data.hop > 1 && 'indirect',
    radial && 'radial-dot',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className={nodeClass}
      style={radial ? { width: 'auto', height: 'auto', overflow: 'visible' } : undefined}
      data-motion={reveal ? 'node-layer-reveal' : undefined}
      initial={reveal ? { opacity: 0, y: 14, scale: 0.94 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reveal ? listItemTransition(data.revealIndex!) : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="dd-handle"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        className="dd-handle dir"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="in-right"
        className="dd-handle dir"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="in-bottom"
        className="dd-handle dir"
      />
      {isCenter ? (
        <motion.div
          className="dd-node-ring"
          layoutId="impact-pivot-ring"
          transition={layoutSpring}
        />
      ) : (
        <div className="dd-node-ring" />
      )}
      {showNoteBadge && (
        <button
          type="button"
          className={`dd-note-badge nodrag nopan${noteCount > 0 ? ' has-count' : ''}`}
          title={noteCount > 0 ? `${noteCount} not` : 'Not ekle'}
          aria-label={noteCount > 0 ? `${noteCount} not` : 'Not ekle'}
          onClick={(e) => {
            e.stopPropagation()
            window.dispatchEvent(
              new CustomEvent('map-open-notes', {
                detail: { serviceId: id },
              }),
            )
          }}
        >
          {noteCount > 0 ? <span>{noteCount}</span> : <span aria-hidden>+</span>}
        </button>
      )}
      <div className="dd-node-body">
        {!radial && (
          <>
            {label}
            {!isCenter && !isCollapsed && (
              <span className="dd-node-hop">
                {data.bridge
                  ? 'ara yol · filtre dışı'
                  : data.match
                    ? `${data.hop}. katman · eşleşen`
                    : `${data.hop}. katman`}
              </span>
            )}
            {isCollapsed && (
              <span className="dd-node-hop">
                Aç · {data.count} servis daha
              </span>
            )}
          </>
        )}
      </div>
      {radial && (
        <div className="dd-radial-shell" style={radialHit}>
          <span
            className={`dd-radial-core${isCenter ? ' is-center' : ''}`}
            aria-hidden
          />
          {isCenter ? (
            <span
              className="dd-radial-label is-center-label"
              style={radialLabelDomStyle(
                'below',
                data.fullLabel || data.label,
                true,
                'Merkez',
              )}
            >
              <span className="dd-radial-kicker is-center-badge">Merkez</span>
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          ) : (
            <span
              className={[
                'dd-radial-label',
                data.showTip && 'name-tip is-short',
              ]
                .filter(Boolean)
                .join(' ')}
              style={radialLabelStyle}
              data-tip={data.showTip ? data.fullLabel : undefined}
            >
              {hopLine ? (
                <span className="dd-radial-hop">{hopLine}</span>
              ) : null}
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="dd-handle"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="out-top"
        className="dd-handle dir"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="out-left"
        className="dd-handle dir"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        className="dd-handle dir"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="side-out"
        className="dd-handle side"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="side-in"
        className="dd-handle side"
      />
    </motion.div>
  )
}

function MethodBadgeView({ data }: NodeProps<MethodBadgeData>) {
  return (
    <div
      className={`dd-method-badge ${data.expanded ? 'expanded' : ''}`}
      title={`${data.count} metod çağırıyor — listeyi aç`}
    >
      {data.count} metod
    </div>
  )
}

const nodeTypes = {
  serviceNode: memo(ServiceNodeView),
  methodBadge: memo(MethodBadgeView),
  radialRing: memo(RingGuideView),
}

const BADGE_GAP = 14

/** Serviste başka yere çağrı yapan metodlar */
function methodsWithOutgoing(list: MethodRef[]) {
  return list.filter((m) => m.calleeCount > 0)
}

/** Harita zoom’unu bozmayan taşınabilir metod penceresi (varsayılan yukarı) */
function MethodPopover({
  serviceId,
  serviceName,
  methods,
  mapRef,
  onSelectMethod,
  onClose,
}: {
  serviceId: string
  serviceName: string
  methods: MethodRef[]
  mapRef: RefObject<HTMLDivElement | null>
  onSelectMethod: (serviceId: string, methodId: string) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origTop: number
    origLeft: number
  } | null>(null)
  const placedOnce = useRef(false)

  useEffect(() => {
    placedOnce.current = false
    setPos(null)
  }, [serviceId])

  useEffect(() => {
    if (placedOnce.current || !mapRef.current) return
    const root = mapRef.current
    const anchor =
      root.querySelector<HTMLElement>(`[data-id="mbadge-${serviceId}"]`) ??
      root.querySelector<HTMLElement>(`[data-id="${serviceId}"]`)
    if (!anchor) return
    const rootBox = root.getBoundingClientRect()
    const box = anchor.getBoundingClientRect()
    const popH = 280
    const popW = 240
    // Varsayılan: rozetin üstüne aç
    let top = box.top - rootBox.top - popH - 8
    if (top < 8) top = box.bottom - rootBox.top + 8
    let left = box.left - rootBox.left
    left = Math.max(8, Math.min(left, rootBox.width - popW - 8))
    setPos({ top, left })
    placedOnce.current = true
  }, [mapRef, serviceId, methods.length])

  const onDragStart = (e: ReactMouseEvent) => {
    if (!pos || (e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTop: pos.top,
      origLeft: pos.left,
    }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      const root = mapRef.current
      if (!d || !root) return
      const rootBox = root.getBoundingClientRect()
      const nextTop = d.origTop + (ev.clientY - d.startY)
      const nextLeft = d.origLeft + (ev.clientX - d.startX)
      setPos({
        top: Math.max(4, Math.min(nextTop, rootBox.height - 80)),
        left: Math.max(4, Math.min(nextLeft, rootBox.width - 120)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const ranked = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return methodsWithOutgoing(methods)
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.className.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        `${a.className}.${a.name}`.localeCompare(
          `${b.className}.${b.name}`,
          'tr',
        ),
      )
  }, [methods, filter])

  if (!pos) return null

  return (
    <div
      className="method-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`${serviceName} method’ları`}
    >
      <header
        className="method-popover-head method-popover-drag"
        onMouseDown={onDragStart}
        title="Sürükleyerek taşı"
      >
        <div className="method-popover-title">
          <strong>{ranked.length} metod</strong>
          <span className="muted"> · {serviceName}</span>
          <span className="method-popover-drag-hint" aria-hidden>
            ⠿
          </span>
        </div>
        <button
          type="button"
          className="method-popover-close"
          onClick={onClose}
          aria-label="Method listesini kapat"
          title="Kapat"
        >
          ×
        </button>
      </header>
      <input
        type="search"
        className="method-popover-filter"
        placeholder="Filtre…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="method-popover-list">
        {ranked.length === 0 ? (
          <li className="method-popover-empty">Çağrı yapan metod yok</li>
        ) : (
          ranked.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelectMethod(serviceId, m.id)}
              >
                <span className="fly-class">{m.className}</span>
                <span className="fly-name">{m.name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

const NOTE_BODY_MAX = 280

/** Servis notları popup (method popover gibi sürüklenir) */
function NotesPopover({
  serviceId,
  serviceName,
  sessionUserId,
  mapRef,
  onClose,
  onCountsChanged,
}: {
  serviceId: string
  serviceName: string
  sessionUserId: string
  mapRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onCountsChanged: () => void
}) {
  const [notes, setNotes] = useState<ServiceNote[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('team')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origTop: number
    origLeft: number
  } | null>(null)
  const placedOnce = useRef(false)

  const reload = useCallback(() => {
    setLoading(true)
    void listServiceNotes(serviceId, sessionUserId)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [serviceId, sessionUserId])

  useEffect(() => {
    placedOnce.current = false
    setPos(null)
    setBody('')
    setError(null)
    reload()
  }, [serviceId, reload])

  useEffect(() => {
    if (placedOnce.current || !mapRef.current) return
    const root = mapRef.current
    const anchor = root.querySelector<HTMLElement>(`[data-id="${serviceId}"]`)
    if (!anchor) return
    const rootBox = root.getBoundingClientRect()
    const box = anchor.getBoundingClientRect()
    const popH = 320
    const popW = 280
    let top = box.top - rootBox.top - popH - 8
    if (top < 8) top = box.bottom - rootBox.top + 8
    let left = box.left - rootBox.left
    left = Math.max(8, Math.min(left, rootBox.width - popW - 8))
    setPos({ top, left })
    placedOnce.current = true
  }, [mapRef, serviceId, notes.length])

  const onDragStart = (e: ReactMouseEvent) => {
    if (!pos || (e.target as HTMLElement).closest('button, input, textarea, select'))
      return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTop: pos.top,
      origLeft: pos.left,
    }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      const root = mapRef.current
      if (!d || !root) return
      const rootBox = root.getBoundingClientRect()
      setPos({
        top: Math.max(4, Math.min(d.origTop + (ev.clientY - d.startY), rootBox.height - 80)),
        left: Math.max(4, Math.min(d.origLeft + (ev.clientX - d.startX), rootBox.width - 120)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const submit = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      await createServiceNote({
        serviceId,
        authorId: sessionUserId,
        body: text,
        visibility,
      })
      setBody('')
      reload()
      onCountsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (noteId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteServiceNote(noteId, sessionUserId)
      reload()
      onCountsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setBusy(false)
    }
  }

  if (!pos) return null

  return (
    <div
      className="notes-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`${serviceName} notları`}
    >
      <header
        className="notes-popover-head notes-popover-drag"
        onMouseDown={onDragStart}
        title="Sürükleyerek taşı"
      >
        <div className="notes-popover-title">
          <strong>Notlar</strong>
          <span className="notes-popover-drag-hint" aria-hidden>
            ⠿
          </span>
        </div>
        <button
          type="button"
          className="method-popover-close"
          onClick={onClose}
          aria-label="Notları kapat"
          title="Kapat"
        >
          ×
        </button>
      </header>
      <ul className="notes-popover-list">
        {loading ? (
          <li className="notes-popover-empty">Yükleniyor…</li>
        ) : notes.length === 0 ? (
          <li className="notes-popover-empty">Henüz not yok</li>
        ) : (
          notes.map((n) => (
            <li
              key={n.id}
              className={
                n.authorRole === 'lead' ? 'notes-item is-lead' : 'notes-item'
              }
            >
              <div className="notes-item-meta">
                <span className="notes-item-author">
                  {n.authorName}
                  {n.authorRole === 'lead' ? (
                    <span className="notes-lead-tag">Lead</span>
                  ) : null}
                </span>
                <span className="notes-item-when">
                  {new Date(n.createdAt).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {n.visibility === 'all' ? ' · herkes' : ' · ekip'}
                </span>
              </div>
              <p className="notes-item-body">{n.body}</p>
              {n.authorId === sessionUserId && (
                <button
                  type="button"
                  className="notes-item-delete"
                  disabled={busy}
                  onClick={() => void remove(n.id)}
                >
                  Sil
                </button>
              )}
            </li>
          ))
        )}
      </ul>
      <div className="notes-popover-composer">
        <textarea
          rows={2}
          maxLength={NOTE_BODY_MAX}
          placeholder="Kısa not… (Enter gönder)"
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div className="notes-composer-row">
          <select
            value={visibility}
            disabled={busy}
            onChange={(e) =>
              setVisibility(e.target.value === 'all' ? 'all' : 'team')
            }
            aria-label="Görünürlük"
          >
            <option value="team">Ekip</option>
            <option value="all">Herkes</option>
          </select>
          <span className="notes-char-count">
            {body.trim().length}/{NOTE_BODY_MAX}
          </span>
          <button
            type="button"
            className="notes-submit"
            disabled={busy || !body.trim()}
            onClick={() => void submit()}
          >
            Ekle
          </button>
        </div>
        {error && <p className="notes-error">{error}</p>}
      </div>
    </div>
  )
}

type FanEdgeData = {
  fromId?: string
  toId?: string
  hop?: number
  kind?: 'tree' | 'cascade'
  fanIndex?: number
  fanCount?: number
  sameColumn?: boolean
  /** Radial eğri için halka merkezi */
  cx?: number
  cy?: number
  /** Düğüm merkezleri + daire yarıçapı (kenar handle değil) */
  sx?: number
  sy?: number
  sr?: number
  tx?: number
  ty?: number
  tr?: number
}

/**
 * Dar alanda çoklu kenar: boşluğa (sağa / yayılı) soft fan.
 * Aynı kolon → sağa büyük yay; kolonlar arası → eğrilik ofseti.
 */
function FanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<FanEdgeData>) {
  const fan = data?.fanIndex ?? 0
  const fanCount = Math.max(1, data?.fanCount ?? 1)
  const mid = (fanCount - 1) / 2
  const spread = (fan - mid) * 26
  const sameCol =
    data?.sameColumn === true || Math.abs(sourceX - targetX) < 28

  let edgePath: string
  if (sameCol) {
    // Tek yön ok (yalnız markerEnd) — sağ boşluğa yumuşak yay
    const bulge =
      Math.max(sourceX, targetX) + 118 + fan * 38 + Math.abs(spread) * 0.45
    const y1 = sourceY + spread * 0.28
    const y2 = targetY + spread * 0.28
    edgePath = `M ${sourceX},${sourceY} C ${bulge},${y1} ${bulge},${y2} ${targetX},${targetY}`
  } else {
    const curvature = 0.52 + Math.abs(fan - mid) * 0.04
    const [path] = getBezierPath({
      sourceX,
      sourceY: sourceY + spread * 0.2,
      targetX,
      targetY: targetY + spread * 0.2,
      sourcePosition,
      targetPosition,
      curvature,
    })
    edgePath = path
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
      interactionWidth={28}
    />
  )
}

/** Radial: eğri + yön oku yolun ortasında (uçta isim/nokta ile kesişmesin) */
function RadialEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps<FanEdgeData>) {
  const cx = data?.cx
  const cy = data?.cy
  const geom = (() => {
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
      const mx = (sourceX + targetX) / 2
      const my = (sourceY + targetY) / 2
      return {
        path,
        mx,
        my,
        angle: Math.atan2(targetY - sourceY, targetX - sourceX),
      }
    }
    const ends = radialSpokeEnds(
      cx,
      cy,
      {
        x: data?.sx ?? sourceX,
        y: data?.sy ?? sourceY,
        r: data?.sr ?? 9,
      },
      {
        x: data?.tx ?? targetX,
        y: data?.ty ?? targetY,
        r: data?.tr ?? 9,
      },
    )
    return radialEdgeGeometry(ends.sx, ends.sy, ends.tx, ends.ty, cx, cy)
  })()
  const fill = (style?.stroke as string) || '#6e6e6e'
  return (
    <>
      <BaseEdge
        id={id}
        path={geom.path}
        style={style}
        interactionWidth={28}
      />
      <polygon
        className="dd-radial-mid-arrow"
        points="-9,-7 16,0 -9,7 -2,0"
        fill={fill}
        transform={`translate(${geom.mx},${geom.my}) rotate(${(geom.angle * 180) / Math.PI})`}
        pointerEvents="none"
      />
    </>
  )
}

const edgeTypes = { fan: memo(FanEdge), radial: memo(RadialEdge) }

function assignFanIndices(
  edges: Edge[],
  hopOf: Map<string, number>,
): Edge[] {
  const into = new Map<string, Edge[]>()
  const out = new Map<string, Edge[]>()
  for (const e of edges) {
    const tin = into.get(e.target) ?? []
    tin.push(e)
    into.set(e.target, tin)
    const tout = out.get(e.source) ?? []
    tout.push(e)
    out.set(e.source, tout)
  }

  return edges.map((e) => {
    const d = e.data as FanEdgeData
    const fromHop = hopOf.get(d.fromId ?? e.source)
    const toHop = hopOf.get(d.toId ?? e.target)
    const sameColumn = fromHop !== undefined && fromHop === toHop
    const intoList = into.get(e.target) ?? [e]
    const outList = out.get(e.source) ?? [e]
    const bundle =
      sameColumn || d.kind === 'cascade'
        ? intoList.length >= outList.length
          ? intoList
          : outList
        : intoList.length > 1
          ? intoList
          : outList
    const fanIndex = Math.max(0, bundle.indexOf(e))
    const fanCount = bundle.length
    return {
      ...e,
      type: 'fan',
      data: { ...d, fanIndex, fanCount, sameColumn },
    }
  })
}

function splitLayer(
  all: ImpactNode[],
  expanded: boolean,
  hop: number,
  layoutMode: MapLayoutMode,
) {
  if (expanded) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  const cap =
    layoutMode === 'radial' && hop === 1
      ? RADIAL_HOP1_CAP
      : layoutMode === 'radial'
        ? RADIAL_HOP1_CAP
        : MAX_VISIBLE_PER_LAYER
  const minRest = layoutMode === 'radial' ? 1 : MIN_COLLAPSE_COUNT
  if (all.length <= cap) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  const hidden = all.slice(cap)
  if (hidden.length < minRest) {
    return { visible: all, hidden: [] as ImpactNode[] }
  }
  return {
    visible: all.slice(0, cap),
    hidden,
  }
}

function buildGraph(
  graph: ImpactGraph,
  expandedLayers: Set<number>,
  bridgeIds: Set<string> = new Set(),
  matchIds: Set<string> = new Set(),
  visibleMaxHop = 1,
  forceExpandCollapsed = false,
  filterActive = false,
  layout: MapLayout = mapLayoutForDepth(1),
  layoutMode: MapLayoutMode = 'ltr',
  radialViewport?: RadialViewportHint,
): { nodes: Node<ServiceNodeData>[]; edges: Edge[]; hops: number[] } {
  const { center, nodes: impactNodes, edges: impactEdges } = graph
  const { nodeW, colGap, rowGap, tipChars } = layout
  const hopOf = new Map<string, number>([[center.id, 0]])
  const byHop = new Map<number, ImpactNode[]>()

  for (const n of impactNodes) {
    hopOf.set(n.service.id, n.hop)
    const list = byHop.get(n.hop) ?? []
    list.push(n)
    byHop.set(n.hop, list)
  }

  const hops = [...byHop.keys()].sort((a, b) => a - b)
  const visibleByHop = new Map<number, ImpactNode[]>()
  const collapsedMeta = new Map<number, ImpactNode[]>()

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    const { visible, hidden } = splitLayer(
      byHop.get(hop)!,
      forceExpandCollapsed || expandedLayers.has(hop),
      hop,
      layoutMode,
    )
    visibleByHop.set(hop, visible)
    if (hidden.length) collapsedMeta.set(hop, hidden)
  }

  let rowCount = 1
  for (const hop of hops) {
    const vis = visibleByHop.get(hop)?.length ?? 0
    const extra = collapsedMeta.has(hop) ? 1 : 0
    rowCount = Math.max(rowCount, vis + extra)
  }
  const centerY = 22 + ((rowCount - 1) * rowGap) / 2
  const colPitch = nodeW + colGap
  const centerSize =
    layoutMode === 'radial' ? 'md' : mapNodeSizeFor('center', 0, visibleMaxHop)
  const centerW = layoutMode === 'radial' ? RADIAL_CENTER_HIT : 372

  /** Sol pad yok — harita origin mapLeftX() */
  const nodes: Node<ServiceNodeData>[] = [
    {
      id: center.id,
      type: 'serviceNode',
      data: {
        label: center.name,
        fullLabel: center.name,
        showTip: false,
        size: centerSize,
        kind: 'center',
        hop: 0,
      },
      position: { x: LEFT_X, y: centerY - 18 },
      style: { width: centerW },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    },
  ]

  const visibleIds = new Set<string>([center.id])

  for (const hop of hops) {
    if (hop > visibleMaxHop) continue
    const col = visibleByHop.get(hop) ?? []
    col.forEach((n, i) => {
      visibleIds.add(n.service.id)
      const nodeSize =
        layoutMode === 'radial'
          ? 'md'
          : mapNodeSizeFor('service', hop, visibleMaxHop)
      const w =
        layoutMode === 'radial' ? layout.nodeW : mapNodeWidth(nodeSize)
      nodes.push({
        id: n.service.id,
        type: 'serviceNode',
        data: {
          label: n.service.name,
          fullLabel: n.service.name,
          showTip: mapLabelNeedsTip(
            n.service.name,
            layoutMode === 'radial' ? 48 : tipChars,
          ),
          size: nodeSize,
          kind: 'service',
          hop,
          bridge: filterActive && bridgeIds.has(n.service.id),
          match: filterActive && matchIds.has(n.service.id),
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + i * rowGap,
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    })

    const hidden = collapsedMeta.get(hop)
    if (hidden?.length) {
      const collapseId = `collapsed-hop-${hop}`
      const collapseLabel = `+${hidden.length} servis daha`
      const nodeSize =
        layoutMode === 'radial'
          ? 'md'
          : mapNodeSizeFor('collapsed', hop, visibleMaxHop)
      const w =
        layoutMode === 'radial'
          ? Math.round(layout.nodeW * 0.88)
          : mapNodeWidth(nodeSize)
      nodes.push({
        id: collapseId,
        type: 'serviceNode',
        data: {
          label: collapseLabel,
          fullLabel: collapseLabel,
          showTip: false,
          size: nodeSize,
          kind: 'collapsed',
          hop,
          count: hidden.length,
          hiddenIds: hidden.map((h) => h.service.id),
        },
        position: {
          x: LEFT_X + hop * colPitch,
          y: 40 + col.length * rowGap,
        },
        style: { width: w },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      })
    }
  }

  /** BFS keşif ebeveyni → tree; diğerleri cascade */
  const treeParent = new Map<string, string>()
  for (const e of impactEdges) {
    if (e.toId === center.id) continue
    if (!treeParent.has(e.toId)) treeParent.set(e.toId, e.fromId)
  }

  const seen = new Set<string>()
  const edges: Edge[] = []

  for (const e of impactEdges) {
    const fromHop = hopOf.get(e.fromId)
    const toHop = hopOf.get(e.toId)
    if (fromHop === undefined || toHop === undefined) continue
    // En uzun yol katmanında atlamalı kenarlar da çizilsin (örn. Billing→FinanceBatch)
    let source = e.fromId
    let target = e.toId

    if (!visibleIds.has(target)) {
      const collapseId = `collapsed-hop-${toHop}`
      if (!nodes.some((n) => n.id === collapseId)) continue
      target = collapseId
    }
    if (!visibleIds.has(source) && source !== center.id) {
      const collapseId = `collapsed-hop-${fromHop}`
      if (!nodes.some((n) => n.id === collapseId)) continue
      source = collapseId
    }

    if (!nodes.some((n) => n.id === source) || !nodes.some((n) => n.id === target)) {
      continue
    }

    const key = `${source}->${target}`
    if (seen.has(key)) continue
    seen.add(key)

    const isCascade = treeParent.get(e.toId) !== e.fromId
    /** Halka görünümde yalnız ağaç (spoke) — cascade okları karışıklığın ana kaynağı */
    if (layoutMode === 'radial' && isCascade) continue

    const direct = toHop === 1 && !isCascade
    const sameColumn = fromHop === toHop
    /** Geriye cascade: sağ rota + çift ok */
    const sideRoute = isCascade && (sameColumn || fromHop > toHop)
    const stroke = isCascade
      ? 'var(--map-side)'
      : direct
        ? 'var(--map-path-mid)'
        : 'var(--map-idle)'
    const radialTree = layoutMode === 'radial' && !isCascade
    edges.push({
      id: key,
      source,
      target,
      sourceHandle: sideRoute ? 'side-out' : 'out',
      targetHandle: sideRoute ? 'side-in' : 'in',
      type: layoutMode === 'radial' ? 'radial' : 'fan',
      animated: false,
      className: isCascade
        ? 'dd-edge cascade'
        : radialTree
          ? 'dd-edge radial-link'
          : direct
            ? 'dd-edge direct'
            : 'dd-edge indirect',
      markerEnd: radialTree
        ? {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: '#6a645a',
          }
        : {
            type: MarkerType.ArrowClosed,
            width: isCascade ? 18 : 16,
            height: isCascade ? 18 : 16,
            color: isCascade ? '#a56b38' : direct ? '#2f6f55' : '#8a847a',
          },
      style: radialTree
        ? {
            stroke: '#6a645a',
            strokeWidth: 2,
            opacity: 0.55,
            fill: 'none',
          }
        : {
            stroke,
            strokeWidth: isCascade ? 2.2 : direct ? 2.2 : 1.4,
            strokeDasharray: isCascade ? '5 4' : direct ? undefined : '6 5',
          },
      data: {
        fromId: e.fromId,
        toId: e.toId,
        hop: toHop,
        kind: isCascade ? 'cascade' : 'tree',
        sameColumn: sideRoute,
      },
    })
  }

  let radialCenter: { cx: number; cy: number } | null = null
  const positioned =
    layoutMode === 'radial'
      ? (() => {
          const { nodes: placed, cx, cy } = applyRadialLayout(
            nodes,
            layout,
            {
              centerId: center.id,
              centerWidth: centerW,
              treeParent,
              viewport: radialViewport,
            },
          )
          radialCenter = { cx, cy }
          return placed
        })()
      : nodes

  let finalEdges =
    layoutMode === 'radial' ? edges : assignFanIndices(edges, hopOf)

  if (layoutMode === 'radial' && radialCenter) {
    const { cx, cy } = radialCenter
    const posOf = new Map(
      positioned
        .filter((n) => n.type === 'serviceNode' || n.id === center.id)
        .map((n) => [n.id, n]),
    )
    finalEdges = finalEdges.map((e) => {
      const s = posOf.get(e.source)
      const t = posOf.get(e.target)
      if (!s || !t) return e
      const sCenter = (s.data as ServiceNodeData).kind === 'center'
      const tCenter = (t.data as ServiceNodeData).kind === 'center'
      const sw = sCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const sh = sCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const tw = tCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const th = tCenter ? RADIAL_CENTER_HIT : RADIAL_HIT
      const smid = radialAnchorOffset(sCenter)
      const tmid = radialAnchorOffset(tCenter)
      const visualR = sCenter ? 24 : RADIAL_DOT_R
      const visualRt = tCenter ? 24 : RADIAL_DOT_R
      const handles = radialHandlePair(
        { x: s.position.x, y: s.position.y, w: sw, h: sh },
        { x: t.position.x, y: t.position.y, w: tw, h: th },
      )
      const prev = (e.data ?? {}) as FanEdgeData
      return {
        ...e,
        ...handles,
        type: 'radial' as const,
        data: {
          ...prev,
          cx,
          cy,
          sx: s.position.x + smid.x,
          sy: s.position.y + smid.y,
          tx: t.position.x + tmid.x,
          ty: t.position.y + tmid.y,
          sr: visualR,
          tr: visualRt,
        },
      }
    })
  }

  return { nodes: positioned, edges: finalEdges, hops }
}

/** Hover ego: yalnız oğuna değen uçlar (path / hop-2 zinciri yok) */
function neighborIds(focusId: string, rfEdges: Edge[]): Set<string> {
  const ids = new Set<string>([focusId])
  for (const e of rfEdges) {
    const d = e.data as { fromId?: string; toId?: string } | undefined
    const a = d?.fromId ?? e.source
    const b = d?.toId ?? e.target
    const touches =
      a === focusId ||
      b === focusId ||
      e.source === focusId ||
      e.target === focusId
    if (!touches) continue
    ids.add(e.source)
    ids.add(e.target)
    ids.add(a)
    ids.add(b)
  }
  return ids
}

function edgeTouchesFocus(e: Edge, focusId: string | null) {
  if (!focusId) return true
  const d = e.data as { fromId?: string; toId?: string } | undefined
  const a = d?.fromId ?? e.source
  const b = d?.toId ?? e.target
  return (
    a === focusId ||
    b === focusId ||
    e.source === focusId ||
    e.target === focusId
  )
}

function reactFlowEdgeId(el: HTMLElement): string {
  const testId = el.getAttribute('data-testid')
  if (testId?.startsWith('rf__edge-')) return testId.slice('rf__edge-'.length)
  return el.getAttribute('data-id') ?? ''
}

export function ImpactMap({
  graph,
  projectOptions,
  onPivot,
  onSelectMethod,
  onBrowseMethods: _onBrowseMethods,
  onClearCenter,
  onPivotBack,
  onPivotForward,
  canPivotBack = false,
  canPivotForward = false,
  visitPath = [],
  visitPathIndex = -1,
  onVisitSelect,
  mapExpanded = false,
  restoredView,
  onViewStateChange,
  navDirection = null,
  onNavDirectionConsumed,
  sessionUserId,
  sessionUserName,
  onMapRoot,
  onBeforeSnapshot,
  onSnapshotSaved,
  forceLtrSignal = 0,
}: Props) {
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [snapshotSaving, setSnapshotSaving] = useState(false)
  const trail = useSnapshotTrailOptional()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('sd-map-drawer-open', infoPanelOpen)
    root.classList.toggle('sd-map-drawer-collapsed', !infoPanelOpen)
    return () => {
      root.classList.remove('sd-map-drawer-open', 'sd-map-drawer-collapsed')
    }
  }, [infoPanelOpen])

  const restoredViewRef = useRef(restoredView)
  restoredViewRef.current = restoredView
  const onViewStateChangeRef = useRef(onViewStateChange)
  onViewStateChangeRef.current = onViewStateChange
  const skipViewNotifyRef = useRef(false)

  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(() => {
    return new Set(restoredView?.expandedLayers ?? [])
  })
  const [visibleMaxHop, setVisibleMaxHop] = useState(
    () => restoredView?.visibleMaxHop ?? 1,
  )
  const [projectFilter, setProjectFilter] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null)
  const [showLinkedMethods, setShowLinkedMethods] = useState(false)
  const [showCascadeEdges, setShowCascadeEdges] = useState(false)
  const [expandedMethodServiceId, setExpandedMethodServiceId] = useState<
    string | null
  >(null)
  const [notesServiceId, setNotesServiceId] = useState<string | null>(null)
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [methodsByService, setMethodsByService] = useState<
    Record<string, MethodRef[]>
  >({})
  const [methodsLoading, setMethodsLoading] = useState(false)
  const [tidyNonce, setTidyNonce] = useState(0)
  const [layoutMode, setLayoutMode] = useState<MapLayoutMode>(() =>
    window.sessionStorage.getItem(MAP_LAYOUT_MODE_KEY) === 'radial'
      ? 'radial'
      : 'ltr',
  )
  const [pivotFlash, setPivotFlash] = useState(false)
  const [pivotMorphing, setPivotMorphing] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapPane, setMapPane] = useState({ w: 0, h: 0 })
  const [userInteracting, setUserInteracting] = useState(false)
  const interactEndTimer = useRef(0)
  const nodeDragged = useRef(false)
  const lastTidyRef = useRef(0)
  const layoutEpochRef = useRef('')
  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const pivotMorphingRef = useRef(false)
  const layoutDirtyRef = useRef(false)
  const pivotAnimRef = useRef(0)
  const prevCenterLayoutRef = useRef(graph.center.id)
  const prevBuiltIdsRef = useRef<Set<string>>(new Set())
  const prevVisibleHopRef = useRef(visibleMaxHop)
  const revealClearTimerRef = useRef(0)

  const filter = useMemo(
    () => applyProjectFilter(graph, projectFilter || null),
    [graph, projectFilter],
  )
  const filterLabel =
    projectOptions.find((p) => p.id === projectFilter)?.label ?? ''

  const projectLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projectOptions) m.set(p.id, p.label)
    for (const n of graph.nodes) {
      if (!m.has(n.service.projectId)) {
        m.set(n.service.projectId, n.service.projectId)
      }
    }
    return m
  }, [projectOptions, graph.nodes])

  const filteredGraph = useMemo((): ImpactGraph => {
    if (!projectFilter) return graph
    return {
      ...graph,
      nodes: filterNodes(graph.nodes, filter.keepIds),
      edges: filterEdges(graph.edges, filter.keepIds),
    }
  }, [graph, projectFilter, filter.keepIds])

  const maxHopAvailable = useMemo(() => {
    let m = 1
    for (const n of filteredGraph.nodes) m = Math.max(m, n.hop)
    return m
  }, [filteredGraph.nodes])

  const lastForceLtr = useRef(forceLtrSignal)
  useEffect(() => {
    if (!forceLtrSignal || forceLtrSignal === lastForceLtr.current) return
    lastForceLtr.current = forceLtrSignal
    setLayoutMode('ltr')
    window.sessionStorage.setItem(MAP_LAYOUT_MODE_KEY, 'ltr')
    layoutDirtyRef.current = false
    setTidyNonce((n) => n + 1)
  }, [forceLtrSignal])

  useEffect(() => {
    trail?.syncView({
      layout: layoutMode,
      visibleMaxHop,
      maxHopAvailable,
      showCascadeEdges,
    })
  }, [trail, layoutMode, visibleMaxHop, maxHopAvailable, showCascadeEdges])

  useEffect(() => {
    trail?.syncUi({ drawerOpen: infoPanelOpen })
  }, [trail, infoPanelOpen])

  useEffect(() => {
    trail?.syncFocus({
      level: 'service',
      id: graph.center.id,
      label: graph.center.name,
      treePath: [
        graph.center.projectId,
        graph.center.packageId,
        graph.center.name,
      ],
      serviceId: graph.center.id,
    })
  }, [trail, graph.center])

  const attachMapRef = useCallback(
    (el: HTMLDivElement | null) => {
      mapRef.current = el
      onMapRoot?.(el)
    },
    [onMapRoot],
  )

  const handleSaveSnapshot = useCallback(async () => {
    if (!sessionUserId || !trail) return
    setSnapshotSaving(true)
    try {
      onBeforeSnapshot?.()
      const base = trail.getClientPayload()
      const screenshots = await captureSnapshotScreenshots({
        mapRoot: mapRef.current,
        workspaceRoot: document.querySelector('.workspace'),
        watermark: snapshotWatermarkLines([`Keşif · ${graph.center.name}`]),
      })
      const snap = await saveExploreSnapshot({
        personId: sessionUserId,
        personName: sessionUserName,
        client: { ...base, screenshots },
      })
      if (snapshotHasMapImage(snap)) {
        const mapShot = snap.screenshots!.find((s) => s.surface === 'map')!
        void downloadSnapshotPng(mapShot.url, `${snap.id}.png`)
      }
      onSnapshotSaved?.(snap)
    } catch (e) {
      console.error('[snapshot]', e)
    } finally {
      setSnapshotSaving(false)
    }
  }, [sessionUserId, sessionUserName, trail, graph.center.name, onBeforeSnapshot, onSnapshotSaved])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    let t = 0
    const measure = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      setMapPane((prev) =>
        Math.abs(prev.w - w) < 24 && Math.abs(prev.h - h) < 24 ? prev : { w, h },
      )
    }
    measure()
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t)
      t = window.setTimeout(measure, 160)
    })
    ro.observe(el)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [mapExpanded])

  useEffect(() => {
    return () => window.clearTimeout(interactEndTimer.current)
  }, [])

  const radialViewport = useMemo((): RadialViewportHint | undefined => {
    if (layoutMode !== 'radial') return undefined
    const w = mapPane.w || (typeof window !== 'undefined' ? window.innerWidth : 960)
    const h = mapPane.h || (typeof window !== 'undefined' ? window.innerHeight : 640)
    return { width: w, height: h, fullscreen: mapExpanded }
  }, [layoutMode, mapPane.w, mapPane.h, mapExpanded])

  const layout = useMemo(() => {
    const base =
      layoutMode === 'radial'
        ? mapLayoutForRadial()
        : mapLayoutForDepth(visibleMaxHop)
    if (layoutMode !== 'radial' || !mapExpanded || mapPane.w <= 0) return base
    const aspect = mapPane.w / Math.max(mapPane.h, 1)
    return { ...base, maxZoom: radialMaxZoom(base, true, aspect) }
  }, [visibleMaxHop, layoutMode, mapExpanded, mapPane.w, mapPane.h])

  const built = useMemo(
    () =>
      buildGraph(
        filteredGraph,
        expandedLayers,
        projectFilter ? filter.bridgeIds : new Set(),
        projectFilter ? filter.matchIds : new Set(),
        visibleMaxHop,
        Boolean(projectFilter),
        Boolean(projectFilter),
        layout,
        layoutMode,
        radialViewport,
      ),
    [
      filteredGraph,
      expandedLayers,
      projectFilter,
      filter.bridgeIds,
      filter.matchIds,
      visibleMaxHop,
      layout,
      layoutMode,
      radialViewport,
    ],
  )

  const builtNodeSig = useMemo(
    () =>
      built.nodes
        .filter((n) => n.type === 'serviceNode')
        .map(
          (n) =>
            `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}`,
        )
        .join('|'),
    [built.nodes],
  )

  const [viewportSyncKey, setViewportSyncKey] = useState(0)
  useLayoutEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setViewportSyncKey((k) => k + 1)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [builtNodeSig, visibleMaxHop, layout.size, graph.center.id, tidyNonce])

  const cascadeCount = useMemo(
    () =>
      built.edges.filter(
        (e) => (e.data as { kind?: string } | undefined)?.kind === 'cascade',
      ).length,
    [built.edges],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (layoutMode !== 'radial') {
        onNodesChange(changes)
        return
      }
      const centerMove = changes.find(
        (c) =>
          c.type === 'position' &&
          c.id === graph.center.id &&
          c.position,
      )
      const cx =
        centerMove && centerMove.type === 'position' && centerMove.position
          ? centerMove.position.x + radialAnchorOffset(true).x
          : null
      const cy =
        centerMove && centerMove.type === 'position' && centerMove.position
          ? centerMove.position.y + radialAnchorOffset(true).y
          : null
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds)
        if (cx == null || cy == null) return next
        return next.map((n) => {
          const d = n.data as ServiceNodeData
          if (!d.radialDot) return n
          return { ...n, data: { ...d, radialCx: cx, radialCy: cy } }
        })
      })
      if (cx != null && cy != null) {
        setEdges((eds) =>
          eds.map((e) => ({
            ...e,
            data: { ...(e.data as FanEdgeData), cx, cy },
          })),
        )
      }
    },
    [onNodesChange, layoutMode, graph.center.id, setNodes, setEdges],
  )

  /** Via zinciri: tam graf ebeveynleri (filtre köprüsü dahil) */
  const parents = useMemo(
    () => discoveryParents(graph.center.id, graph.edges),
    [graph.center.id, graph.edges],
  )

  const nameById = useMemo(() => {
    const m = new Map<string, string>([[graph.center.id, graph.center.name]])
    for (const n of graph.nodes) m.set(n.service.id, n.service.name)
    return m
  }, [graph])

  /** Kenar hover’da hedef ucun via yolu */
  const breadcrumbFocus = useMemo(() => {
    if (focusId && !focusId.startsWith('collapsed-')) return focusId
    if (!focusEdgeId) return null
    const edge = built.edges.find((e) => e.id === focusEdgeId)
    const d = edge?.data as { toId?: string; fromId?: string } | undefined
    return d?.toId ?? edge?.target ?? null
  }, [focusId, focusEdgeId, built.edges])

  const egoIds = useMemo(() => {
    if (!focusId || focusId.startsWith('collapsed-')) return null
    return neighborIds(focusId, built.edges)
  }, [focusId, built.edges])

  useEffect(() => {
    skipViewNotifyRef.current = true
    const saved = restoredViewRef.current
    setExpandedLayers(new Set(saved?.expandedLayers ?? []))
    setVisibleMaxHop(saved?.visibleMaxHop ?? 1)
    setFocusId(null)
    setFocusEdgeId(null)
    setProjectFilter('')
    setShowLinkedMethods(false)
    setExpandedMethodServiceId(null)
    setNotesServiceId(null)
    setMethodsByService({})
    setNoteCounts({})
    layoutDirtyRef.current = false
    setPivotFlash(true)
    const t = window.setTimeout(() => setPivotFlash(false), 560)
    const t2 = window.setTimeout(() => {
      skipViewNotifyRef.current = false
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
    }
  }, [graph.center.id])

  useEffect(() => {
    if (mapExpanded) return
    setInfoPanelOpen(true)
  }, [graph.center.id, mapExpanded])

  useEffect(() => {
    if (skipViewNotifyRef.current) return
    onViewStateChangeRef.current?.({
      visibleMaxHop,
      expandedLayers: [...expandedLayers].sort((a, b) => a - b),
    })
  }, [visibleMaxHop, expandedLayers])

  useEffect(() => {
    if (!projectFilter || filter.matchCount === 0) return
    setVisibleMaxHop(Math.max(1, filter.deepestHop))
    setExpandedLayers(new Set(filteredGraph.nodes.map((n) => n.hop)))
  }, [projectFilter, filter.matchCount, filter.deepestHop, filteredGraph.nodes])

  const visibleServiceIds = useMemo(() => {
    return built.nodes
      .filter((n) => n.data.kind === 'center' || n.data.kind === 'service')
      .map((n) => n.id)
  }, [built.nodes])

  useEffect(() => {
    if (!showLinkedMethods) {
      setMethodsByService({})
      setMethodsLoading(false)
      setExpandedMethodServiceId(null)
      return
    }
    let cancelled = false
    setMethodsLoading(true)
    void Promise.all(
      visibleServiceIds.map(async (id) => {
        // Servisin kendi method kataloğu (tümü)
        const list = await listMethodsForService(id)
        return [id, list] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return
        setMethodsByService(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!cancelled) setMethodsByService({})
      })
      .finally(() => {
        if (!cancelled) setMethodsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showLinkedMethods, visibleServiceIds])

  const refreshNoteCounts = useCallback(() => {
    if (!sessionUserId || visibleServiceIds.length === 0) {
      setNoteCounts({})
      return
    }
    void getNoteCounts(visibleServiceIds, sessionUserId)
      .then(setNoteCounts)
      .catch(() => setNoteCounts({}))
  }, [sessionUserId, visibleServiceIds])

  useEffect(() => {
    refreshNoteCounts()
  }, [refreshNoteCounts])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ serviceId: string }>).detail
      if (!detail?.serviceId || !sessionUserId) return
      setExpandedMethodServiceId(null)
      setNotesServiceId(detail.serviceId)
    }
    window.addEventListener('map-open-notes', onOpen)
    return () => window.removeEventListener('map-open-notes', onOpen)
  }, [sessionUserId])

  // Rozetler + sürüklenen konumları koru (Hizala / pivot morph / merkez değişimi hariç)
  useEffect(() => {
    if (pivotMorphingRef.current) return

    const centerChanged = prevCenterLayoutRef.current !== graph.center.id
    prevCenterLayoutRef.current = graph.center.id
    const layoutEpoch = `${layoutMode}:${visibleMaxHop}:${layout.size}:${mapExpanded}`
    const epochChanged = layoutEpochRef.current !== layoutEpoch
    layoutEpochRef.current = layoutEpoch
    const resetLayout =
      tidyNonce !== lastTidyRef.current ||
      centerChanged ||
      epochChanged
    lastTidyRef.current = tidyNonce

    const hopExpanded =
      visibleMaxHop > prevVisibleHopRef.current && !centerChanged
    const revealById = new Map<string, number>()
    if (hopExpanded) {
      const newcomers = built.nodes.filter(
        (n) =>
          n.type === 'serviceNode' &&
          !prevBuiltIdsRef.current.has(n.id) &&
          n.id !== graph.center.id,
      )
      newcomers.sort((a, b) => {
        const da = a.data as ServiceNodeData
        const db = b.data as ServiceNodeData
        if (da.hop !== db.hop) return da.hop - db.hop
        if (a.position.y !== b.position.y) return a.position.y - b.position.y
        return a.position.x - b.position.x
      })
      newcomers.forEach((n, i) => revealById.set(n.id, i))
    }
    prevVisibleHopRef.current = visibleMaxHop
    prevBuiltIdsRef.current = new Set(
      built.nodes.filter((n) => n.type === 'serviceNode').map((n) => n.id),
    )

    type AnyNode = Node<ServiceNodeData | MethodBadgeData | RingGuideData>
    setNodes((current) => {
      const posById = new Map(current.map((n) => [n.id, n.position]))
      const out: AnyNode[] = built.nodes.map((n) => ({
        ...n,
        data:
          'kind' in n.data
            ? {
                ...n.data,
                revealIndex: revealById.get(n.id),
                noteCount:
                  n.data.kind === 'center' || n.data.kind === 'service'
                    ? (noteCounts[n.id] ?? 0)
                    : n.data.noteCount,
              }
            : n.data,
        position: resetLayout ? n.position : (posById.get(n.id) ?? n.position),
      }))

      if (showLinkedMethods) {
        for (const n of out) {
          const d = n.data
          if (!('kind' in d) || (d.kind !== 'center' && d.kind !== 'service')) {
            continue
          }
          const count = methodsWithOutgoing(methodsByService[n.id] ?? []).length
          if (!count) continue
          out.push({
            id: `mbadge-${n.id}`,
            type: 'methodBadge',
            data: {
              serviceId: n.id,
              count,
              expanded: expandedMethodServiceId === n.id,
            },
            position: {
              x: n.position.x + (layoutMode === 'radial' ? 0 : layout.nodeW + BADGE_GAP),
              y:
                n.position.y +
                (layoutMode === 'radial' ? layout.nodeW + 6 : 18),
            },
            draggable: false,
            selectable: true,
          })
        }
      }

      return out as Node<ServiceNodeData>[]
    })

    if (revealById.size > 0) {
      window.clearTimeout(revealClearTimerRef.current)
      const revealedIds = [...revealById.keys()]
      revealClearTimerRef.current = window.setTimeout(() => {
        setNodes((current) =>
          current.map((node) => {
            if (!revealedIds.includes(node.id) || !('kind' in node.data)) {
              return node
            }
            const d = node.data as ServiceNodeData
            if (d.revealIndex === undefined) return node
            const { revealIndex: _r, ...rest } = d
            return { ...node, data: rest }
          }),
        )
      }, 520)
    }
  }, [
    built,
    layout.nodeW,
    layout.size,
    layoutMode,
    visibleMaxHop,
    showLinkedMethods,
    methodsByService,
    expandedMethodServiceId,
    noteCounts,
    tidyNonce,
    graph.center.id,
    setNodes,
  ])

  // Hover / metod flyout: ego dışını soluklaştır
  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    const methodFocus = expandedMethodServiceId
    const active = Boolean(methodFocus || focusId || focusEdgeId)
    const edgeFocusing = !userInteracting && Boolean(focusId || focusEdgeId)
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
      const id = el.getAttribute('data-id') ?? ''
      el.classList.remove('rf-path-on', 'rf-path-off', 'rf-path-focus')
      if (!active) return
      let on = false
      if (methodFocus) {
        on = id === methodFocus || id === `mbadge-${methodFocus}`
      } else if (focusEdgeId) {
        const edge = built.edges.find((x) => x.id === focusEdgeId)
        const d = edge?.data as { fromId?: string; toId?: string } | undefined
        on =
          id === edge?.source ||
          id === edge?.target ||
          id === d?.fromId ||
          id === d?.toId
      } else if (egoIds) {
        const data = nodes.find((n) => n.id === id)?.data as
          | ServiceNodeData
          | undefined
        on =
          egoIds.has(id) ||
          (data?.kind === 'collapsed' &&
            Boolean(data.hiddenIds?.some((hid) => egoIds.has(hid))))
      }
      el.classList.add(on ? 'rf-path-on' : 'rf-path-off')
      if (id === focusId || id === methodFocus) el.classList.add('rf-path-focus')
    })
    root.querySelectorAll<HTMLElement>('.react-flow__edge').forEach((el) => {
      el.classList.remove('dd-edge-on', 'dd-edge-off')
      if (!edgeFocusing) return
      const eid = reactFlowEdgeId(el)
      const edge = built.edges.find((e) => e.id === eid)
      if (!edge) return
      if (
        !showCascadeEdges &&
        (edge.data as { kind?: string } | undefined)?.kind === 'cascade'
      ) {
        el.classList.add('dd-edge-off')
        return
      }
      const on = focusEdgeId
        ? eid === focusEdgeId
        : edgeTouchesFocus(edge, focusId)
      el.classList.add(on ? 'dd-edge-on' : 'dd-edge-off')
    })
  }, [
    egoIds,
    focusId,
    focusEdgeId,
    nodes,
    built.edges,
    expandedMethodServiceId,
    userInteracting,
    showCascadeEdges,
  ])

  useEffect(() => {
    const sourceEdges = showCascadeEdges
      ? built.edges
      : built.edges.filter(
          (e) =>
            (e.data as { kind?: string } | undefined)?.kind !== 'cascade',
        )
    setEdges(sourceEdges)
  }, [built.edges, showCascadeEdges, setEdges])

  const pivotToNode = useCallback(
    async (node: Node) => {
      const targetId = node.id
      const fromCenterId = graph.center.id

      const inst = rfInstance.current
      if (!inst) {
        onPivot(targetId)
        return
      }

      const centerNode = inst.getNode(fromCenterId)
      const targetNode = inst.getNode(targetId)
      if (!centerNode || !targetNode) {
        onPivot(targetId)
        return
      }

      const animId = ++pivotAnimRef.current
      pivotMorphingRef.current = true
      setPivotMorphing(true)

      const nodeFocusX = (n: Node) => n.position.x + layout.nodeW / 2
      const nodeFocusY = (n: Node) => n.position.y + 48
      const startVp = inst.getViewport()

      await animateViewport(
        inst,
        { ...startVp, zoom: Math.max(layout.minZoom, startVp.zoom * 0.86) },
        240,
        easeOutCubic,
      )
      if (pivotAnimRef.current !== animId) return

      inst.setCenter(nodeFocusX(targetNode), nodeFocusY(targetNode), {
        zoom: inst.getZoom(),
        duration: 280,
      })
      await waitMs(280)
      if (pivotAnimRef.current !== animId) return

      const centerStart = { ...centerNode.position }
      const targetStart = { ...targetNode.position }
      const targetEnd = { ...centerStart }
      const colPitch = layout.nodeW + layout.colGap
      const centerEnd = {
        x: centerStart.x - colPitch * 1.05,
        y: centerStart.y,
      }
      const morphMs = 540
      const t0 = performance.now()

      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          if (pivotAnimRef.current !== animId) {
            resolve()
            return
          }
          const t = Math.min(1, (now - t0) / morphMs)
          const e = easeOutCubic(t)
          const targetPos = {
            x: lerp(targetStart.x, targetEnd.x, e),
            y: lerp(targetStart.y, targetEnd.y, e),
          }
          const oldCenterPos = {
            x: lerp(centerStart.x, centerEnd.x, e),
            y: lerp(centerStart.y, centerEnd.y, e),
          }

          setNodes((current) => {
            const posById = new Map<string, { x: number; y: number }>()
            for (const n of current) {
              if (n.id === targetId) posById.set(n.id, targetPos)
              else if (n.id === fromCenterId) posById.set(n.id, oldCenterPos)
              else posById.set(n.id, n.position)
            }
            return current.map((n) => {
              if (n.id === targetId) {
                return {
                  ...n,
                  position: targetPos,
                  className: 'pivot-incoming',
                }
              }
              if (n.id === fromCenterId) {
                return {
                  ...n,
                  position: oldCenterPos,
                  className: 'pivot-slide-out',
                  style: {
                    ...n.style,
                    opacity: 1 - e * 0.45,
                  },
                }
              }
              if (n.type === 'methodBadge') {
                const sid = (n.data as unknown as MethodBadgeData).serviceId
                const parent = posById.get(sid)
                if (parent) {
                  return {
                    ...n,
                    position: {
                      x: parent.x + layout.nodeW + BADGE_GAP,
                      y: parent.y + 18,
                    },
                  }
                }
              }
              return n
            })
          })

          inst.setCenter(
            targetPos.x + layout.nodeW / 2,
            targetPos.y + 48,
            { zoom: inst.getZoom(), duration: 0 },
          )

          if (t < 1) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })

      if (pivotAnimRef.current !== animId) return

      const settledVp = inst.getViewport()
      await animateViewport(
        inst,
        {
          ...settledVp,
          zoom: Math.min(layout.maxZoom, Math.max(layout.minZoom, settledVp.zoom * 1.06)),
        },
        300,
        easeInOutCubic,
      )
      if (pivotAnimRef.current !== animId) return

      pivotMorphingRef.current = false
      setPivotMorphing(false)
      layoutDirtyRef.current = false
      onPivot(targetId)
    },
    [graph.center.id, layout.colGap, layout.maxZoom, layout.minZoom, layout.nodeW, onPivot, setNodes],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (pivotMorphingRef.current) return
      if (nodeDragged.current) {
        nodeDragged.current = false
        return
      }
      if (node.type === 'methodBadge') {
        const d = node.data as MethodBadgeData
        setNotesServiceId(null)
        setExpandedMethodServiceId((cur) =>
          cur === d.serviceId ? null : d.serviceId,
        )
        return
      }
      const data = node.data as ServiceNodeData
      if (data.kind === 'collapsed') {
        setExpandedLayers((prev) => new Set(prev).add(data.hop))
        return
      }
      if (node.id === graph.center.id) {
        onClearCenter?.()
        return
      }
      setExpandedMethodServiceId(null)
      setNotesServiceId(null)
      pivotToNode(node)
    },
    [graph.center.id, onClearCenter, pivotToNode],
  )

  const clearHoverFocus = useCallback(() => {
    setFocusId(null)
    setFocusEdgeId(null)
  }, [])

  const onMoveStart = useCallback(() => {
    window.clearTimeout(interactEndTimer.current)
    setUserInteracting(true)
    setFocusId(null)
    setFocusEdgeId(null)
  }, [])

  const onMoveEnd = useCallback(() => {
    window.clearTimeout(interactEndTimer.current)
    interactEndTimer.current = window.setTimeout(() => {
      setUserInteracting(false)
    }, 120)
  }, [])

  const onNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (e.buttons || userInteracting) return
      setFocusEdgeId(null)
      setFocusId((prev) => (prev === node.id ? prev : node.id))
    },
    [userInteracting],
  )

  const onNodeMouseLeave = useCallback(() => {
    setFocusId(null)
  }, [])

  const onEdgeMouseEnter = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      if (e.buttons || userInteracting) return
      setFocusId(null)
      setFocusEdgeId(edge.id)
    },
    [userInteracting],
  )

  const onEdgeMouseLeave = useCallback(() => {
    setFocusEdgeId(null)
  }, [])

  const focusing = Boolean(
    !userInteracting && (focusId || focusEdgeId || expandedMethodServiceId),
  )

  const slideExitThen = useCallback(
    async (dir: 'back' | 'forward', then: () => void) => {
      if (pivotMorphingRef.current) return
      const inst = rfInstance.current
      const animId = ++pivotAnimRef.current
      pivotMorphingRef.current = true
      setPivotMorphing(true)

      if (inst) {
        const vp = inst.getViewport()
        const slide = dir === 'back' ? 130 : -130
        await animateViewport(
          inst,
          { x: vp.x + slide, y: vp.y, zoom: vp.zoom },
          340,
          easeInOutCubic,
          vp,
        )
        if (pivotAnimRef.current !== animId) return
      } else {
        await waitMs(200)
      }

      pivotMorphingRef.current = false
      setPivotMorphing(false)
      then()
    },
    [],
  )

  const handlePivotBack = useCallback(() => {
    if (!onPivotBack || !canPivotBack) return
    void slideExitThen('back', onPivotBack)
  }, [canPivotBack, onPivotBack, slideExitThen])

  const handlePivotForward = useCallback(() => {
    if (!onPivotForward || !canPivotForward) return
    void slideExitThen('forward', onPivotForward)
  }, [canPivotForward, onPivotForward, slideExitThen])

  return (
    <div
      ref={attachMapRef}
      className={`impact-map dd-map ${focusing ? 'is-focusing' : ''}${pivotFlash ? ' is-pivot-flash' : ''}${pivotMorphing ? ' is-pivot-morph' : ''}${navDirection === 'back' ? ' is-nav-back' : ''}${navDirection === 'forward' ? ' is-nav-forward' : ''}${layoutMode === 'radial' ? ' is-radial' : ''}${infoPanelOpen ? '' : ' is-drawer-collapsed'}`}
      data-focus={
        expandedMethodServiceId ?? focusId ?? focusEdgeId ?? undefined
      }
      onMouseLeave={clearHoverFocus}
    >
      <div className="map-canvas-row">
      <div className="map-canvas">
      <div className="path-layer-bar">
        <div className="path-layer-left">
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotBack || pivotMorphing}
            onClick={handlePivotBack}
            title="Önceki pivot"
          >
            ← Geri
          </button>
          <button
            type="button"
            className="map-nav-btn path-layer-btn"
            disabled={!canPivotForward || pivotMorphing}
            onClick={handlePivotForward}
            title="Sonraki pivot"
          >
            İleri →
          </button>
        </div>
      </div>
      {projectFilter && (
        <ProjectFilterHint
          filterLabel={filterLabel}
          matchCount={filter.matchCount}
          deepestHop={filter.deepestHop}
          bridgeCount={filter.bridgeIds.size}
          hop1EmptyButDeeper={filter.hop1EmptyButDeeper}
        />
      )}
      {graph.truncated && graph.reason && (
        <p className="map-budget-hint">{graph.reason}</p>
      )}
      <div className="map-canvas-dock-host">
      <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => {
          rfInstance.current = inst
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable
        nodeDragThreshold={4}
        selectNodesOnDrag={false}
        nodesConnectable={false}
        panOnDrag
        onlyRenderVisibleElements={false}
        minZoom={layout.minZoom}
        maxZoom={layout.maxZoom}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onNodeDrag={() => {
          nodeDragged.current = true
          layoutDirtyRef.current = true
        }}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onPaneClick={() => {
          nodeDragged.current = false
          clearHoverFocus()
        }}
        proOptions={{ hideAttribution: true }}
      >
        <RadialLabelZoomSync
          layoutTick={`${layoutMode}-${visibleMaxHop}-${tidyNonce}-${graph.center.id}-${mapExpanded}`}
        />
        <MapViewportSync
          centerId={graph.center.id}
          visibleMaxHop={visibleMaxHop}
          layoutKey={`${showLinkedMethods}-${Object.keys(methodsByService).length}-${layout.size}-${layoutMode}-${mapExpanded}-${tidyNonce}-${visibleMaxHop}`}
          layout={layout}
          layoutMode={layoutMode}
          drawerOpen={infoPanelOpen}
          mapExpanded={mapExpanded}
          navDirection={navDirection}
          onNavDirectionConsumed={onNavDirectionConsumed}
          userInteracting={userInteracting}
          viewportSyncKey={viewportSyncKey}
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.55}
          color="var(--map-dot)"
        />
      </ReactFlow>
        <MapCanvasBar
          visibleMaxHop={visibleMaxHop}
          maxHopAvailable={maxHopAvailable}
          layout={layout}
          drawerOpen={infoPanelOpen}
          layoutMode={layoutMode}
          truncated={graph.truncated}
          cascadeCount={cascadeCount}
          showCascadeEdges={showCascadeEdges}
          onToggleCascadeEdges={() => {
            trail?.record(
              'cascade_toggle',
              undefined,
              showCascadeEdges ? 'Yan bağ kapatıldı' : 'Yan bağ açıldı',
            )
            setShowCascadeEdges((v) => !v)
          }}
          onCollapseLayer={() => {
            const next = Math.max(1, visibleMaxHop - 1)
            trail?.record(
              'layer_change',
              undefined,
              next === visibleMaxHop
                ? 'Katman kapatıldı (zaten minimum)'
                : `Katman kapatıldı (${visibleMaxHop} → ${next})`,
            )
            setVisibleMaxHop(next)
          }}
          onExpandLayer={() => {
            const next = Math.min(maxHopAvailable, visibleMaxHop + 1)
            trail?.record(
              'layer_change',
              undefined,
              next === visibleMaxHop
                ? 'Katman açıldı (zaten maksimum)'
                : `Katman açıldı (${visibleMaxHop} → ${next})`,
            )
            setVisibleMaxHop(next)
          }}
          onExpandAll={() => {
            trail?.record(
              'layer_change',
              undefined,
              `Tüm katmanlar açıldı (${visibleMaxHop} → ${maxHopAvailable})`,
            )
            setVisibleMaxHop(maxHopAvailable)
            setExpandedLayers(new Set(filteredGraph.nodes.map((n) => n.hop)))
          }}
          onCollapseAll={() => {
            trail?.record('layer_change', undefined, 'Tüm katmanlar kapatıldı (→ 1)')
            setVisibleMaxHop(1)
            setExpandedLayers(new Set())
          }}
          onTidyUp={() => {
            layoutDirtyRef.current = false
            setTidyNonce((n) => n + 1)
          }}
          onToggleLayoutMode={() => {
            trail?.record(
              'layout_toggle',
              undefined,
              layoutMode === 'ltr' ? 'Layout LTR → Radial' : 'Layout Radial → LTR',
            )
            layoutDirtyRef.current = false
            setLayoutMode((mode) => {
              const next = mode === 'ltr' ? 'radial' : 'ltr'
              window.sessionStorage.setItem(MAP_LAYOUT_MODE_KEY, next)
              return next
            })
            setTidyNonce((n) => n + 1)
          }}
          onSaveSnapshot={
            sessionUserId && trail ? () => void handleSaveSnapshot() : undefined
          }
          snapshotSaving={snapshotSaving}
          showLinkedMethods={showLinkedMethods}
          methodsLoading={methodsLoading}
          onToggleLinkedMethods={() => setShowLinkedMethods((value) => !value)}
          projectFilter={projectFilter}
          projectOptions={projectOptions}
          onProjectFilterChange={setProjectFilter}
        />
      </ReactFlowProvider>
      </div>
      </div>
      <MapInfoPanel
        center={graph.center}
        projectLabel={
          projectLabels.get(graph.center.projectId) ?? graph.center.projectId
        }
        centerId={graph.center.id}
        nodes={graph.nodes}
        parents={parents}
        projectLabels={projectLabels}
        matchIds={projectFilter ? filter.matchIds : null}
        bridgeCount={projectFilter ? filter.bridgeIds.size : 0}
        filterLabel={filterLabel || undefined}
        truncated={graph.truncated}
        visitPath={visitPath}
        visitPathIndex={visitPathIndex}
        onVisitSelect={(i) => onVisitSelect?.(i)}
        focusId={breadcrumbFocus}
        nameById={nameById}
        onHoverPathSelect={(id) =>
          id === graph.center.id ? onClearCenter?.() : onPivot(id)
        }
        open={infoPanelOpen}
        onOpenChange={(open) => {
          trail?.record(
            'drawer_toggle',
            undefined,
            open ? 'Etki özeti açıldı' : 'Etki özeti kapatıldı',
          )
          setInfoPanelOpen(open)
        }}
      />
      </div>
      {expandedMethodServiceId &&
        onSelectMethod &&
        methodsWithOutgoing(methodsByService[expandedMethodServiceId] ?? [])
          .length > 0 && (
          <MethodPopover
            serviceId={expandedMethodServiceId}
            serviceName={
              nameById.get(expandedMethodServiceId) ?? expandedMethodServiceId
            }
            methods={methodsWithOutgoing(
              methodsByService[expandedMethodServiceId]!,
            )}
            mapRef={mapRef}
            onSelectMethod={onSelectMethod}
            onClose={() => setExpandedMethodServiceId(null)}
          />
        )}
      {notesServiceId && sessionUserId && (
        <NotesPopover
          serviceId={notesServiceId}
          serviceName={nameById.get(notesServiceId) ?? notesServiceId}
          sessionUserId={sessionUserId}
          mapRef={mapRef}
          onClose={() => setNotesServiceId(null)}
          onCountsChanged={refreshNoteCounts}
        />
      )}
    </div>
  )
}
