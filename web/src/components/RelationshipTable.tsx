/**
 * Tablo sekmesi — Excel katman grid + ağaç aç/kapa.
 *
 * Hub’larda impact hop 2 kesilse bile ▶ ile neighbors lazy yüklenir.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getNeighbors } from '../api/client'
import { EmptyState } from './EmptyState'
import { SkeletonShimmer } from '../motion/SkeletonShimmer'
import type { AffectedService, ImpactGraph, Service } from '../types'

export type RelTableMode = 'callers' | 'callees'

type Props = {
  pivot: Service
  impact?: ImpactGraph
  callers: AffectedService[]
  callees: AffectedService[]
  loading?: boolean
  visibleMaxHop: number
  onVisibleMaxHopChange: (hop: number) => void
  onPivot: (serviceId: string) => void
  projectLabels: Map<string, string>
  projectFilter?: string
  projectFilterLabel?: string
  onClearProjectFilter?: () => void
}

type SvcRef = {
  id: string
  name: string
  project: string
  projectId: string
  groupKey: string
  groupLabel: string
  /** Bilinen / tahmini alt çağıran sayısı */
  callerHint: number
}

type LayerNode = SvcRef & { children: LayerNode[] }

type DisplayRow = {
  key: string
  index?: number
  showL1: boolean
  l1: SvcRef
  l1HasChildren: boolean
  l1Expanded: boolean
  l1ChildCount: number
  l1Loading: boolean
  showL2: boolean
  l2?: SvcRef
  l2HasChildren: boolean
  l2Expanded: boolean
  l2ChildCount: number
  l2Loading: boolean
  showL3?: boolean
  l3?: SvcRef
  l3HasChildren?: boolean
  l3Expanded?: boolean
  l3ChildCount?: number
  l3Loading?: boolean
  l4?: SvcRef
}

type ColId = 'layer1' | 'layer2' | 'layer3' | 'layer4'
type SortKey = 'layer1' | 'layer2' | 'layer3' | 'layer4'

const COL_STORAGE = 'sd-rel-table-col-widths-v6'
const MODE_STORAGE = 'sd-rel-table-mode'

const DEFAULT_WIDTHS: Record<ColId, number> = {
  layer1: 260,
  layer2: 260,
  layer3: 260,
  layer4: 260,
}

const MIN_WIDTHS: Record<ColId, number> = {
  layer1: 140,
  layer2: 140,
  layer3: 140,
  layer4: 140,
}

function projectOf(s: Service, labels: Map<string, string>) {
  return (
    s.projectLabel ||
    s.projectGroupLabel ||
    labels.get(s.projectId) ||
    s.projectId
  )
}

function groupOf(s: Service, labels: Map<string, string>) {
  const label =
    s.projectGroupLabel ||
    s.projectLabel ||
    labels.get(s.projectId) ||
    s.projectId
  const key = s.projectGroupId || s.projectId || label
  return { groupKey: key, groupLabel: label }
}

function toRef(s: Service, labels: Map<string, string>): SvcRef {
  const g = groupOf(s, labels)
  return {
    id: s.id,
    name: s.name,
    project: projectOf(s, labels),
    projectId: s.projectId,
    groupKey: g.groupKey,
    groupLabel: g.groupLabel,
    callerHint: s.affectedCount ?? 0,
  }
}

function loadWidths(): Record<ColId, number> {
  try {
    const raw = localStorage.getItem(COL_STORAGE)
    if (!raw) return { ...DEFAULT_WIDTHS }
    return { ...DEFAULT_WIDTHS, ...(JSON.parse(raw) as Partial<Record<ColId, number>>) }
  } catch {
    return { ...DEFAULT_WIDTHS }
  }
}

function loadMode(): RelTableMode {
  try {
    return localStorage.getItem(MODE_STORAGE) === 'callees' ? 'callees' : 'callers'
  } catch {
    return 'callers'
  }
}

function buildServiceIndex(
  pivot: Service,
  impact: ImpactGraph | undefined,
  callers: AffectedService[],
  callees: AffectedService[],
): Map<string, Service> {
  const m = new Map<string, Service>()
  m.set(pivot.id, pivot)
  if (impact) {
    m.set(impact.center.id, impact.center)
    for (const n of impact.nodes) m.set(n.service.id, n.service)
  }
  for (const x of callers) m.set(x.service.id, x.service)
  for (const x of callees) m.set(x.service.id, x.service)
  return m
}

/** Impact edge hop: fromId ← toId (toId çağırır fromId). */
function impactChildren(
  impact: ImpactGraph | undefined,
  parentId: string,
  hop: number,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  if (!impact?.edges.length) return ids
  for (const e of impact.edges) {
    if (e.hop !== hop || e.fromId !== parentId) continue
    if (seen.has(e.toId)) continue
    seen.add(e.toId)
    ids.push(e.toId)
  }
  return ids
}

function resolveLayerChildren(
  parentId: string,
  existing: LayerNode[],
  lazyChildren: Map<string, LayerNode[]>,
): LayerNode[] {
  const base = lazyChildren.get(parentId) ?? existing
  return base.map((n) => ({
    ...n,
    children: resolveLayerChildren(n.id, n.children, lazyChildren),
  }))
}

function buildCallerTree(
  pivot: Service,
  impact: ImpactGraph | undefined,
  callers: AffectedService[],
  labels: Map<string, string>,
  lazyChildren: Map<string, LayerNode[]>,
): LayerNode[] {
  const byId = buildServiceIndex(pivot, impact, callers, [])
  const layer1Ids: string[] = []
  const seenL1 = new Set<string>()

  for (const x of callers) {
    if (seenL1.has(x.service.id)) continue
    seenL1.add(x.service.id)
    layer1Ids.push(x.service.id)
  }
  if (layer1Ids.length === 0 && impact) {
    for (const e of impact.edges) {
      if (e.hop !== 1 || e.fromId !== pivot.id) continue
      if (seenL1.has(e.toId)) continue
      seenL1.add(e.toId)
      layer1Ids.push(e.toId)
    }
  }

  return layer1Ids
    .map((l1Id) => {
      const l1 = byId.get(l1Id)
      if (!l1) return null
      const fromImpact = impactChildren(impact, l1Id, 2)
        .map((id) => {
          const s = byId.get(id)
          if (!s) return null
          const l3 =
            impactChildren(impact, id, 3)
              .map((l3Id) => {
                const s3 = byId.get(l3Id)
                if (!s3) return null
                const l4 = impactChildren(impact, l3Id, 4)
                  .map((l4Id) => {
                    const s4 = byId.get(l4Id)
                    return s4 ? { ...toRef(s4, labels), children: [] } : null
                  })
                  .filter(Boolean) as LayerNode[]
                return { ...toRef(s3, labels), children: l4 }
              })
              .filter(Boolean) as LayerNode[]
          return { ...toRef(s, labels), children: l3 }
        })
        .filter(Boolean) as LayerNode[]

      // lazy L1/L2/L3 birleşimi — L1 cache L2 çocuklarını ezmesin
      const children = resolveLayerChildren(l1Id, fromImpact, lazyChildren)
      return { ...toRef(l1, labels), children }
    })
    .filter(Boolean) as LayerNode[]
}

function buildCalleeTree(
  callees: AffectedService[],
  labels: Map<string, string>,
): LayerNode[] {
  return callees.map((x) => ({ ...toRef(x.service, labels), children: [] }))
}

function ColResizeHandle({
  col,
  onResize,
}: {
  col: ColId
  onResize: (col: ColId, width: number) => void
}) {
  const startX = useRef(0)
  const startW = useRef(0)
  return (
    <span
      className="rel-col-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Sütun genişliği"
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const th = (e.currentTarget as HTMLElement).closest('th')
        startX.current = e.clientX
        startW.current = th?.getBoundingClientRect().width ?? DEFAULT_WIDTHS[col]
        const onMove = (ev: MouseEvent) => {
          onResize(
            col,
            Math.max(MIN_WIDTHS[col], startW.current + (ev.clientX - startX.current)),
          )
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          document.body.classList.remove('rel-table-resizing')
        }
        document.body.classList.add('rel-table-resizing')
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }}
    />
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`rel-chevron${open ? ' is-open' : ''}`}
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ServiceCell({
  svc,
  onPivot,
}: {
  svc?: SvcRef
  onPivot: (id: string) => void
}) {
  if (!svc) return <span className="rel-cell-empty">—</span>
  return (
    <button
      type="button"
      className="rel-svc-link"
      onClick={() => onPivot(svc.id)}
      title="Bu servise geç"
    >
      <span className="rel-svc-name">{svc.name}</span>
      <span className="rel-svc-meta">
        <span className="rel-svc-id">{svc.id}</span>
        <span className="rel-svc-proj">{svc.project}</span>
      </span>
    </button>
  )
}

function flattenVisible(
  tree: LayerNode[],
  showL2: boolean,
  showL3: boolean,
  showL4: boolean,
  expandedL2: Set<string>,
  emptyOpenL2: Set<string>,
  expandedL3: Set<string>,
  emptyOpenL3: Set<string>,
  loadingIds: Set<string>,
): DisplayRow[] {
  const rows: DisplayRow[] = []
  let index = 0

  for (const l1 of tree) {
    index += 1
    const l1Loading = loadingIds.has(l1.id)
    const l1ChildCount = l1.children.length || l1.callerHint

    if (!showL2) {
      rows.push({
        key: `l1-${l1.id}`,
        index,
        showL1: true,
        l1,
        l1HasChildren: false,
        l1Expanded: true,
        l1ChildCount,
        l1Loading: false,
        showL2: false,
        l2HasChildren: false,
        l2Expanded: false,
        l2ChildCount: 0,
        l2Loading: false,
      })
      continue
    }

    if (l1Loading && l1.children.length === 0) {
      rows.push({
        key: `l1-${l1.id}-loading`,
        index,
        showL1: true,
        l1,
        l1HasChildren: false,
        l1Expanded: true,
        l1ChildCount,
        l1Loading: true,
        showL2: false,
        l2HasChildren: false,
        l2Expanded: false,
        l2ChildCount: 0,
        l2Loading: false,
      })
      continue
    }

    if (l1.children.length === 0) {
      rows.push({
        key: `l1-${l1.id}-empty`,
        index,
        showL1: true,
        l1,
        l1HasChildren: false,
        l1Expanded: true,
        l1ChildCount: 0,
        l1Loading: false,
        showL2: false,
        l2HasChildren: false,
        l2Expanded: false,
        l2ChildCount: 0,
        l2Loading: false,
      })
      continue
    }

    let first = true
    for (const l2 of l1.children) {
      const l2Key = `${l1.id}::${l2.id}`
      const l2ChevronOpen = expandedL2.has(l2Key) || emptyOpenL2.has(l2Key)
      const l2Expanded = expandedL2.has(l2Key)
      const l2Loading = loadingIds.has(l2.id)
      const l2ChildCount = l2.children.length || l2.callerHint

      if (!l2Expanded) {
        rows.push({
          key: `l1-${l1.id}-l2-${l2.id}`,
          index: first ? index : undefined,
          showL1: first,
          l1,
          l1HasChildren: false,
          l1Expanded: true,
          l1ChildCount: l1.children.length,
          l1Loading: false,
          showL2: true,
          l2,
          l2HasChildren: true,
          l2Expanded: l2ChevronOpen,
          l2ChildCount,
          l2Loading,
        })
        first = false
        continue
      }

      if (l2Loading && l2.children.length === 0) {
        rows.push({
          key: `l1-${l1.id}-l2-${l2.id}-loading`,
          index: first ? index : undefined,
          showL1: first,
          l1,
          l1HasChildren: false,
          l1Expanded: true,
          l1ChildCount: l1.children.length,
          l1Loading: false,
          showL2: true,
          l2,
          l2HasChildren: true,
          l2Expanded: true,
          l2ChildCount,
          l2Loading: true,
        })
        first = false
        continue
      }

      if (l2.children.length === 0) {
        rows.push({
          key: `l1-${l1.id}-l2-${l2.id}-empty`,
          index: first ? index : undefined,
          showL1: first,
          l1,
          l1HasChildren: false,
          l1Expanded: true,
          l1ChildCount: l1.children.length,
          l1Loading: false,
          showL2: true,
          l2,
          l2HasChildren: true,
          l2Expanded: true,
          l2ChildCount: 0,
          l2Loading: false,
        })
        first = false
        continue
      }

      if (!showL3) {
        rows.push({
          key: `l1-${l1.id}-l2-${l2.id}-open`,
          index: first ? index : undefined,
          showL1: first,
          l1,
          l1HasChildren: false,
          l1Expanded: true,
          l1ChildCount: l1.children.length,
          l1Loading: false,
          showL2: true,
          l2,
          l2HasChildren: true,
          l2Expanded: true,
          l2ChildCount: l2.children.length,
          l2Loading: false,
        })
        first = false
        continue
      }

      let firstL2 = true
      for (const l3 of l2.children) {
        const l3Key = `${l2Key}::${l3.id}`
        const l3ChevronOpen = expandedL3.has(l3Key) || emptyOpenL3.has(l3Key)
        const l3Expanded = expandedL3.has(l3Key)
        const l3Loading = loadingIds.has(l3.id)
        const l3ChildCount = l3.children.length || l3.callerHint

        if (!l3Expanded) {
          rows.push({
            key: `l1-${l1.id}-l2-${l2.id}-l3-${l3.id}`,
            index: first ? index : undefined,
            showL1: first,
            l1,
            l1HasChildren: false,
            l1Expanded: true,
            l1ChildCount: l1.children.length,
            l1Loading: false,
            showL2: firstL2,
            l2,
            l2HasChildren: true,
            l2Expanded: true,
            l2ChildCount: l2.children.length,
            l2Loading: false,
            showL3: true,
            l3,
            l3HasChildren: true,
            l3Expanded: l3ChevronOpen,
            l3ChildCount,
            l3Loading,
          })
          first = false
          firstL2 = false
          continue
        }

        if (l3Loading && l3.children.length === 0) {
          rows.push({
            key: `l1-${l1.id}-l2-${l2.id}-l3-${l3.id}-loading`,
            index: first ? index : undefined,
            showL1: first,
            l1,
            l1HasChildren: false,
            l1Expanded: true,
            l1ChildCount: l1.children.length,
            l1Loading: false,
            showL2: firstL2,
            l2,
            l2HasChildren: true,
            l2Expanded: true,
            l2ChildCount: l2.children.length,
            l2Loading: false,
            showL3: true,
            l3,
            l3HasChildren: true,
            l3Expanded: true,
            l3ChildCount,
            l3Loading: true,
          })
          first = false
          firstL2 = false
          continue
        }

        if (l3.children.length === 0) {
          rows.push({
            key: `l1-${l1.id}-l2-${l2.id}-l3-${l3.id}-open`,
            index: first ? index : undefined,
            showL1: first,
            l1,
            l1HasChildren: false,
            l1Expanded: true,
            l1ChildCount: l1.children.length,
            l1Loading: false,
            showL2: firstL2,
            l2,
            l2HasChildren: true,
            l2Expanded: true,
            l2ChildCount: l2.children.length,
            l2Loading: false,
            showL3: true,
            l3,
            l3HasChildren: true,
            l3Expanded: true,
            l3ChildCount: l3.children.length,
            l3Loading: false,
          })
          first = false
          firstL2 = false
          continue
        }

        let firstL3 = true
        for (const l4 of l3.children) {
          rows.push({
            key: `l1-${l1.id}-l2-${l2.id}-l3-${l3.id}-l4-${l4.id}`,
            index: first ? index : undefined,
            showL1: first,
            l1,
            l1HasChildren: false,
            l1Expanded: true,
            l1ChildCount: l1.children.length,
            l1Loading: false,
            showL2: firstL2,
            l2,
            l2HasChildren: true,
            l2Expanded: true,
            l2ChildCount: l2.children.length,
            l2Loading: false,
            showL3: firstL3,
            l3,
            l3HasChildren: true,
            l3Expanded: true,
            l3ChildCount: l3.children.length,
            l3Loading: false,
            l4,
          })
          first = false
          firstL2 = false
          firstL3 = false
        }
      }
    }
  }

  return rows
}

function filterNodeDeep(
  n: LayerNode,
  mapFilter: string | undefined,
  grp: string,
  needle: string,
): LayerNode | null {
  const filteredKids = n.children
    .map((c) => filterNodeDeep(c, mapFilter, grp, needle))
    .filter(Boolean) as LayerNode[]

  const selfProjectOk = !mapFilter || n.projectId === mapFilter
  const selfGroupOk = !grp || n.groupKey === grp
  const selfTextOk =
    !needle ||
    `${n.name} ${n.id} ${n.project} ${n.groupLabel}`.toLowerCase().includes(needle)

  if ((selfProjectOk && selfGroupOk && selfTextOk) || filteredKids.length > 0) {
    return { ...n, children: filteredKids }
  }
  return null
}

export function RelationshipTable({
  pivot,
  impact,
  callers,
  callees,
  loading,
  visibleMaxHop: _visibleMaxHop,
  onVisibleMaxHopChange: _onVisibleMaxHopChange,
  onPivot,
  projectLabels,
  projectFilter,
  projectFilterLabel,
  onClearProjectFilter,
}: Props) {
  const [mode, setMode] = useState<RelTableMode>(loadMode)
  const [q, setQ] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('layer1')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [widths, setWidths] = useState(loadWidths)
  const [expandedL2, setExpandedL2] = useState<Set<string>>(() => new Set())
  const [emptyOpenL2, setEmptyOpenL2] = useState<Set<string>>(() => new Set())
  const [expandedL3, setExpandedL3] = useState<Set<string>>(() => new Set())
  const [emptyOpenL3, setEmptyOpenL3] = useState<Set<string>>(() => new Set())
  const [lazyChildren, setLazyChildren] = useState<Map<string, LayerNode[]>>(
    () => new Map(),
  )
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingScroll = useRef<{
    tableTop: number
    tableLeft: number
    winY: number
  } | null>(null)

  const captureScroll = () => {
    const el = scrollRef.current
    pendingScroll.current = {
      tableTop: el?.scrollTop ?? 0,
      tableLeft: el?.scrollLeft ?? 0,
      winY: window.scrollY,
    }
  }

  useLayoutEffect(() => {
    const pending = pendingScroll.current
    if (!pending) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = pending.tableTop
      el.scrollLeft = pending.tableLeft
    }
    if (Math.abs(window.scrollY - pending.winY) > 1) {
      window.scrollTo(0, pending.winY)
    }
    pendingScroll.current = null
  })

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  useEffect(() => {
    try {
      localStorage.setItem(COL_STORAGE, JSON.stringify(widths))
    } catch {
      /* ignore */
    }
  }, [widths])

  useEffect(() => {
    setExpandedL2(new Set())
    setEmptyOpenL2(new Set())
    setExpandedL3(new Set())
    setEmptyOpenL3(new Set())
    setLazyChildren(new Map())
    setLoadedIds(new Set())
    setLoadingIds(new Set())
  }, [pivot.id, mode])

  const showLayer2 = mode === 'callers'
  const showLayer3 = mode === 'callers'
  const showLayer4 = mode === 'callers' && expandedL3.size > 0

  const loadedRef = useRef(loadedIds)
  const loadingRef = useRef(loadingIds)
  const lazyRef = useRef(lazyChildren)
  loadedRef.current = loadedIds
  loadingRef.current = loadingIds
  lazyRef.current = lazyChildren

  const loadCallersOf = useCallback(
    async (serviceId: string): Promise<LayerNode[]> => {
      if (loadedRef.current.has(serviceId)) {
        return lazyRef.current.get(serviceId) ?? []
      }
      if (loadingRef.current.has(serviceId)) {
        return lazyRef.current.get(serviceId) ?? []
      }
      setLoadingIds((prev) => new Set(prev).add(serviceId))
      try {
        const neighbors = await getNeighbors(serviceId)
        const kids: LayerNode[] = neighbors.downstream.map((x) => ({
          ...toRef(x.service, projectLabels),
          children: [],
        }))
        setLazyChildren((prev) => {
          const next = new Map(prev)
          next.set(serviceId, kids)
          return next
        })
        setLoadedIds((prev) => new Set(prev).add(serviceId))
        return kids
      } catch {
        setLazyChildren((prev) => {
          const next = new Map(prev)
          next.set(serviceId, [])
          return next
        })
        setLoadedIds((prev) => new Set(prev).add(serviceId))
        return []
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(serviceId)
          return next
        })
      }
    },
    [projectLabels],
  )

  const tree = useMemo(() => {
    if (mode === 'callers') {
      return buildCallerTree(pivot, impact, callers, projectLabels, lazyChildren)
    }
    return buildCalleeTree(callees, projectLabels)
  }, [mode, pivot, impact, callers, callees, projectLabels, lazyChildren])

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of tree) map.set(n.groupKey, n.groupLabel)
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
  }, [tree])

  const filteredTree = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tree
      .map((n) => filterNodeDeep(n, projectFilter, groupFilter, needle))
      .filter(Boolean) as LayerNode[]
  }, [tree, q, groupFilter, projectFilter])

  const sortedTree = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filteredTree]
    copy.sort((a, b) => {
      if (sortKey === 'layer1') return a.name.localeCompare(b.name, 'tr') * dir
      if (sortKey === 'layer2') {
        const an = a.children[0]?.name ?? ''
        const bn = b.children[0]?.name ?? ''
        return an.localeCompare(bn, 'tr') * dir || a.name.localeCompare(b.name, 'tr')
      }
      const an = a.children[0]?.children[0]?.name ?? ''
      const bn = b.children[0]?.children[0]?.name ?? ''
      return an.localeCompare(bn, 'tr') * dir || a.name.localeCompare(b.name, 'tr')
    })
    return copy
  }, [filteredTree, sortKey, sortDir])

  // 2. katman içeriği: L1 çocuklarını kuyrukla yükle (ok yok, her zaman görünür)
  useEffect(() => {
    if (mode !== 'callers') return
    const pending = sortedTree
      .map((n) => n.id)
      .filter((id) => !loadedRef.current.has(id) && !loadingRef.current.has(id))
    for (const id of pending.slice(0, 6)) void loadCallersOf(id)
  }, [sortedTree, loadedIds, loadingIds, mode, loadCallersOf])

  const displayRows = useMemo(
    () =>
      flattenVisible(
        sortedTree,
        showLayer2,
        showLayer3,
        showLayer4,
        expandedL2,
        emptyOpenL2,
        expandedL3,
        emptyOpenL3,
        loadingIds,
      ),
    [
      sortedTree,
      showLayer2,
      showLayer3,
      showLayer4,
      expandedL2,
      emptyOpenL2,
      expandedL3,
      emptyOpenL3,
      loadingIds,
    ],
  )

  const l1Count = sortedTree.length

  const toggleL2 = (l1Id: string, l2Id: string) => {
    const key = `${l1Id}::${l2Id}`
    captureScroll()
    if (expandedL2.has(key) || emptyOpenL2.has(key)) {
      setExpandedL2((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      setEmptyOpenL2((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      // Bu L2 altındaki L3 açıkları da kapat
      setExpandedL3((prev) => {
        const next = new Set([...prev].filter((k) => !k.startsWith(`${key}::`)))
        return next
      })
      setEmptyOpenL3((prev) => {
        const next = new Set([...prev].filter((k) => !k.startsWith(`${key}::`)))
        return next
      })
      return
    }

    let existingL2ChildCount = 0
    for (const l1 of sortedTree) {
      if (l1.id !== l1Id) continue
      for (const l2 of l1.children) {
        if (l2.id === l2Id) {
          existingL2ChildCount = l2.children.length
          break
        }
      }
    }

    if (existingL2ChildCount > 0) {
      setExpandedL2((prev) => new Set(prev).add(key))
      void loadCallersOf(l2Id)
      return
    }

    void (async () => {
      const kids = await loadCallersOf(l2Id)
      captureScroll()
      if (kids.length > 0) {
        setExpandedL2((prev) => new Set(prev).add(key))
      } else {
        setEmptyOpenL2((prev) => new Set(prev).add(key))
      }
    })()
  }

  const toggleL3 = (l1Id: string, l2Id: string, l3Id: string) => {
    const key = `${l1Id}::${l2Id}::${l3Id}`
    captureScroll()
    if (expandedL3.has(key) || emptyOpenL3.has(key)) {
      setExpandedL3((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      setEmptyOpenL3((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }

    let existingChildCount = 0
    outer: for (const l1 of sortedTree) {
      for (const l2 of l1.children) {
        if (l2.id !== l2Id) continue
        for (const l3 of l2.children) {
          if (l3.id === l3Id) {
            existingChildCount = l3.children.length
            break outer
          }
        }
      }
    }

    if (existingChildCount > 0) {
      setExpandedL3((prev) => new Set(prev).add(key))
      void loadCallersOf(l3Id)
      return
    }

    void (async () => {
      const kids = await loadCallersOf(l3Id)
      captureScroll()
      if (kids.length > 0) {
        setExpandedL3((prev) => new Set(prev).add(key))
      } else {
        setEmptyOpenL3((prev) => new Set(prev).add(key))
      }
    })()
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const resizeCol = (col: ColId, width: number) => {
    setWidths((prev) => ({ ...prev, [col]: width }))
  }

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  if (loading) {
    return (
      <div className="rel-table-wrap" data-motion="rel-table-skeleton">
        <SkeletonShimmer lines={6} />
      </div>
    )
  }

  const col1Title =
    mode === 'callers' ? 'Seçili Servisi Çağıran' : 'Seçili Servisin Çağırdığı'

  return (
    <div className="rel-table-wrap">
      <div className="rel-table-toolbar">
        <div className="rel-table-segments" role="tablist" aria-label="Tablo yönü">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'callers'}
            className={mode === 'callers' ? 'on' : ''}
            onClick={() => setMode('callers')}
          >
            Çağıranlar Tablosu
            <span className="rel-seg-count">
              {mode === 'callers' ? l1Count : callers.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'callees'}
            className={mode === 'callees' ? 'on' : ''}
            onClick={() => setMode('callees')}
          >
            Çağırdıkları Tablosu
            <span className="rel-seg-count">{callees.length}</span>
          </button>
        </div>

        <div className="rel-table-tools">
          <label className="rel-group-filter">
            <span className="rel-group-filter-label">Proje grubu</span>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              aria-label="Proje grubuna göre filtrele"
            >
              <option value="">Tümü</option>
              {groupOptions.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <input
            className="rel-table-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Servis ara…"
            aria-label="Tablo araması"
          />
        </div>
      </div>

      {projectFilter && projectFilterLabel ? (
        <div className="neighbor-table-filter rel-table-filter-banner">
          <span>
            Harita proje filtresi: <strong>{projectFilterLabel}</strong>
          </span>
          {onClearProjectFilter ? (
            <button type="button" className="btn ghost compact" onClick={onClearProjectFilter}>
              Filtreyi kaldır
            </button>
          ) : null}
        </div>
      ) : null}

      {displayRows.length === 0 ? (
        <EmptyState
          what={
            q.trim() || groupFilter
              ? 'Filtreye uyan satır yok.'
              : mode === 'callers'
                ? 'Bu servisi çağıran başka servis kaydı yok.'
                : 'Bu servisin doğrudan çağırdığı servis yok.'
          }
          action={
            q.trim() || groupFilter
              ? 'Aramayı veya proje grubu filtresini temizleyin.'
              : undefined
          }
        />
      ) : (
        <div className="rel-table-scroll" ref={scrollRef}>
          <table className="rel-table">
            <colgroup>
              <col style={{ width: widths.layer1 }} />
              {showLayer2 ? <col style={{ width: widths.layer2 }} /> : null}
              {showLayer3 ? <col style={{ width: widths.layer3 }} /> : null}
              {showLayer4 ? <col style={{ width: widths.layer4 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <button type="button" className="rel-th-btn" onClick={() => toggleSort('layer1')}>
                    {col1Title}
                    {sortMark('layer1')}
                  </button>
                  <ColResizeHandle col="layer1" onResize={resizeCol} />
                </th>
                {showLayer2 ? (
                  <th scope="col">
                    <button
                      type="button"
                      className="rel-th-btn"
                      onClick={() => toggleSort('layer2')}
                    >
                      2. Katman
                      {sortMark('layer2')}
                    </button>
                    <ColResizeHandle col="layer2" onResize={resizeCol} />
                  </th>
                ) : null}
                {showLayer3 ? (
                  <th scope="col">
                    <button
                      type="button"
                      className="rel-th-btn"
                      onClick={() => toggleSort('layer3')}
                    >
                      3. Katman
                      {sortMark('layer3')}
                    </button>
                    <ColResizeHandle col="layer3" onResize={resizeCol} />
                  </th>
                ) : null}
                {showLayer4 ? (
                  <th scope="col">
                    <button
                      type="button"
                      className="rel-th-btn"
                      onClick={() => toggleSort('layer4')}
                    >
                      4. Katman
                      {sortMark('layer4')}
                    </button>
                    <ColResizeHandle col="layer4" onResize={resizeCol} />
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.showL1 ? (
                      <div className="rel-cell-with-toggle">
                        {r.index != null ? (
                          <span className="rel-inline-num">{r.index}</span>
                        ) : (
                          <span className="rel-inline-num is-blank" aria-hidden />
                        )}
                        <ServiceCell svc={r.l1} onPivot={onPivot} />
                      </div>
                    ) : (
                      <div className="rel-cell-with-toggle">
                        <span className="rel-inline-num is-blank" aria-hidden />
                      </div>
                    )}
                  </td>
                  {showLayer2 ? (
                    <td>
                      {r.l1Loading ? (
                        <span className="rel-collapsed-hint">Yükleniyor…</span>
                      ) : r.showL2 && r.l2 ? (
                        <div className="rel-cell-with-toggle">
                          <button
                            type="button"
                            className="rel-toggle"
                            aria-expanded={r.l2Expanded}
                            aria-label={
                              r.l2Expanded ? '3. katmanı kapat' : '3. katmanı aç'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleL2(r.l1.id, r.l2!.id)}
                          >
                            <Chevron open={r.l2Expanded} />
                          </button>
                          <ServiceCell svc={r.l2} onPivot={onPivot} />
                        </div>
                      ) : (
                        <span className="rel-cell-empty">—</span>
                      )}
                    </td>
                  ) : null}
                  {showLayer3 ? (
                    <td>
                      {r.l2Loading ? (
                        <span className="rel-collapsed-hint">Yükleniyor…</span>
                      ) : r.l2Expanded && r.showL3 && r.l3 ? (
                        <div className="rel-cell-with-toggle">
                          <button
                            type="button"
                            className="rel-toggle"
                            aria-expanded={Boolean(r.l3Expanded)}
                            aria-label={
                              r.l3Expanded ? '4. katmanı kapat' : '4. katmanı aç'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleL3(r.l1.id, r.l2!.id, r.l3!.id)}
                          >
                            <Chevron open={Boolean(r.l3Expanded)} />
                          </button>
                          <ServiceCell svc={r.l3} onPivot={onPivot} />
                        </div>
                      ) : r.l2Expanded ? (
                        <span className="rel-cell-empty">—</span>
                      ) : (
                        <span className="rel-cell-empty">—</span>
                      )}
                    </td>
                  ) : null}
                  {showLayer4 ? (
                    <td>
                      {r.l3Loading ? (
                        <span className="rel-collapsed-hint">Yükleniyor…</span>
                      ) : r.l3Expanded && r.l4 ? (
                        <ServiceCell svc={r.l4} onPivot={onPivot} />
                      ) : (
                        <span className="rel-cell-empty">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="rel-table-foot">
        {l1Count} servis (1. katman)
        {showLayer2 ? ` · görünür ${displayRows.length} satır` : ''}
        {groupFilter ? ' · grup filtresi açık' : ''}
      </footer>
    </div>
  )
}
