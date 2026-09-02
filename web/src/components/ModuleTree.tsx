/**
 * Sol modül ağacı: proje → paket → servis → (chevron ile) metodlar.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  getModuleChildren,
  getNonServiceMethods,
  getServiceTreePath,
  listMethodsForService,
} from '../api/client'
import type { MethodRef, ModuleNode } from '../types'
import { MotionTooltip } from '../motion/MotionTooltip'
import { SkeletonShimmer } from '../motion/SkeletonShimmer'
import { StatusBadge } from '../motion/StatusBadge'
import { TreeAccordion } from '../motion/TreeAccordion'

const TIP_DELAY_MS = 1000
const SERVICE_PAGE_SIZE = 100
const VIRTUALIZE_MIN_ROWS = 48
const ROW_HEIGHT_PX = 34

const KIND_LABEL: Record<ModuleNode['kind'], string> = {
  group: 'grup',
  project: 'proje',
  package: 'jar',
  service: 'servis',
  method: 'method',
}

const KIND_INITIAL: Record<ModuleNode['kind'], string> = {
  group: 'G',
  project: 'P',
  package: 'J',
  service: 'S',
  method: 'M',
}

type TipState = { text: string; top: number; left: number }
type TreeSort = 'name' | 'degree'

type PageState = {
  total: number
  limit: number
  offset: number
  sort: TreeSort
  loadingMore: boolean
  sortReloading?: boolean
}

type TreeTipContextValue = {
  showTip: (text: string, anchor: HTMLElement) => void
  hideTip: () => void
}

type TreeHydrationContextValue = {
  childMap: Map<string, ModuleNode[]>
  pageMeta: Map<string, PageState>
  sortByParent: Map<string, TreeSort>
  registerChildren: (nodeId: string, children: ModuleNode[], page: PageState) => void
  appendChildren: (nodeId: string, children: ModuleNode[], page: PageState) => void
  setSort: (nodeId: string, sort: TreeSort) => void
  loadMore: (nodeId: string) => Promise<void>
  showNonServiceMethods: boolean
  expandedServiceIds: Set<string>
  setServiceExpanded: (serviceId: string, expanded: boolean) => void
}

const TreeTipContext = createContext<TreeTipContextValue | null>(null)
const TreeHydrationContext = createContext<TreeHydrationContextValue | null>(null)

function isPaginatedParent(nodeId: string): boolean {
  return nodeId === 'unlocated' || nodeId.startsWith('art-')
}

function useTreeTipHandlers(text: string) {
  const ctx = useContext(TreeTipContext)
  return {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      if (!ctx) return
      const label = e.currentTarget.querySelector('.tree-label') as HTMLElement | null
      const anchor = label ?? e.currentTarget
      const truncated = Boolean(label && label.scrollWidth > label.clientWidth + 1)
      if (text.length <= 22 && !truncated) return
      ctx.showTip(text, anchor)
    },
    onMouseLeave: () => ctx?.hideTip(),
  }
}

function TreeHoverTipPortal({ tip }: { tip: TipState | null }) {
  return createPortal(
    <MotionTooltip
      open={Boolean(tip)}
      className="tree-hover-tip"
      style={tip ? { top: tip.top, left: tip.left } : undefined}
    >
      {tip?.text}
    </MotionTooltip>,
    document.body,
  )
}

type Props = {
  nodes: ModuleNode[]
  selectedServiceId?: string
  selectedMethodId?: string
  scrollParentRef?: RefObject<HTMLElement | null>
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}

function childrenOf(
  node: ModuleNode,
  childMap: Map<string, ModuleNode[]>,
): ModuleNode[] | undefined {
  return childMap.get(node.id) ?? node.children
}

function revealAncestorIds(
  nodes: ModuleNode[],
  childMap: Map<string, ModuleNode[]>,
  serviceId?: string,
  methodId?: string,
): Set<string> {
  const ids = new Set<string>()
  if (!serviceId) return ids
  const walk = (node: ModuleNode): boolean => {
    if (node.kind === 'service' && node.serviceId === serviceId) {
      if (methodId) ids.add(node.id)
      return true
    }
    let hit = false
    for (const child of childrenOf(node, childMap) ?? []) {
      if (walk(child)) hit = true
    }
    if (hit) ids.add(node.id)
    return hit
  }
  for (const n of nodes) walk(n)
  return ids
}

function MethodLeaves({
  serviceId,
  selectedMethodId,
  depth,
  onSelectMethod,
}: {
  serviceId: string
  selectedMethodId?: string
  depth: number
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const [methods, setMethods] = useState<MethodRef[]>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setMethods(undefined)
    setError(undefined)
    void listMethodsForService(serviceId)
      .then((list) => {
        if (!cancelled) setMethods(list)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Methods yüklenemedi')
        }
      })
    return () => {
      cancelled = true
    }
  }, [serviceId])

  useLayoutEffect(() => {
    if (!selectedMethodId || !methods?.some((m) => m.id === selectedMethodId)) return
    document
      .querySelector(`[data-tree-method="${CSS.escape(selectedMethodId)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [methods, selectedMethodId])

  if (error) {
    return (
      <p className="tree-method-status" style={{ paddingLeft: 8 + depth * 12 }}>
        {error}
      </p>
    )
  }
  if (!methods) {
    return (
      <div
        className="tree-method-skeleton"
        style={{ paddingLeft: 8 + depth * 12 }}
        aria-hidden
      >
        <div className="tree-method-skeleton-line" />
        <div className="tree-method-skeleton-line" />
      </div>
    )
  }
  if (methods.length === 0) {
    return (
      <p className="tree-method-status" style={{ paddingLeft: 8 + depth * 12 }}>
        Metod yok
      </p>
    )
  }

  return (
    <>
      {methods.map((m) => {
        const selected = m.id === selectedMethodId
        const fullName = `${m.className}.${m.name}`
        return (
          <MethodTreeRow
            key={m.id}
            fullName={fullName}
            className={selected ? 'selected' : ''}
            depth={depth}
            methodId={m.id}
            classNamePart={m.className}
            methodName={m.name}
            onSelect={() => onSelectMethod(serviceId, m.id)}
          />
        )
      })}
    </>
  )
}

function MethodTreeRow({
  fullName,
  className,
  depth,
  methodId,
  classNamePart,
  methodName,
  onSelect,
}: {
  fullName: string
  className: string
  depth: number
  methodId: string
  classNamePart: string
  methodName: string
  onSelect: () => void
}) {
  const tipHandlers = useTreeTipHandlers(fullName)
  return (
    <div className="tree-item">
      <button
        type="button"
        className={`tree-row ${className} kind-method`}
        style={{ paddingLeft: 8 + depth * 12 }}
        data-tree-method={methodId}
        onClick={onSelect}
        {...tipHandlers}
      >
        <span className="chev spacer" />
        <span className="tree-kind" title={KIND_LABEL.method}>
          {KIND_INITIAL.method}
        </span>
        <span className="tree-label">
          <span className="tree-method-class">{classNamePart}.</span>
          {methodName}
        </span>
      </button>
    </div>
  )
}

function isArtifactNode(node: ModuleNode): boolean {
  return node.kind === 'package' && node.id.startsWith('art-')
}

function TreeSortBar({
  parentId,
  depth,
  sort,
  onSort,
}: {
  parentId: string
  depth: number
  sort: TreeSort
  onSort: (sort: TreeSort) => void
}) {
  return (
    <div
      className="tree-sort-bar"
      style={{ paddingLeft: 8 + depth * 12 }}
      data-tree-sort-parent={parentId}
    >
      <span className="tree-sort-label">Sırala</span>
      <button
        type="button"
        className={`tree-sort-btn${sort === 'name' ? ' is-active' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onSort('name')
        }}
      >
        A–Z
      </button>
      <button
        type="button"
        className={`tree-sort-btn${sort === 'degree' ? ' is-active' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onSort('degree')
        }}
      >
        Bağımlılık Sayısı
      </button>
    </div>
  )
}

function TreeLoadMoreRow({
  depth,
  remaining,
  loading,
  onLoad,
}: {
  depth: number
  remaining: number
  loading: boolean
  onLoad: () => void
}) {
  return (
    <div className="tree-item">
      <button
        type="button"
        className="tree-load-more"
        style={{ paddingLeft: 8 + depth * 12 }}
        disabled={loading}
        onClick={() => void onLoad()}
      >
        {loading ? 'Yükleniyor…' : `${remaining} servis daha yükle ↓`}
      </button>
    </div>
  )
}

function NonServiceMethodLeaves({
  artifactNodeId,
  depth,
  selectedMethodId,
  onSelectMethod,
}: {
  artifactNodeId: string
  depth: number
  selectedMethodId?: string
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const [methods, setMethods] = useState<ModuleNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getNonServiceMethods(artifactNodeId)
      .then((rows) => {
        if (!cancelled) setMethods(rows)
      })
      .catch(() => {
        if (!cancelled) setMethods([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [artifactNodeId])

  if (loading) {
    return (
      <div style={{ paddingLeft: 8 + depth * 12 }}>
        <SkeletonShimmer className="tree-row skeleton" lines={2} />
      </div>
    )
  }
  if (methods.length === 0) {
    return (
      <p className="tree-non-service-empty" style={{ paddingLeft: 8 + depth * 12 }}>
        Servis dışı metod yok
      </p>
    )
  }

  return (
    <>
      <p className="tree-non-service-heading" style={{ paddingLeft: 8 + depth * 12 }}>
        Servis dışı metodlar
      </p>
      {methods.map((m) =>
        m.methodId ? (
          <MethodTreeRow
            key={m.id}
            fullName={m.name}
            className={m.methodId === selectedMethodId ? 'selected' : ''}
            depth={depth}
            methodId={m.methodId}
            classNamePart={m.name.split('.')[0] ?? m.name}
            methodName={
              m.name.includes('.') ? m.name.split('.').slice(1).join('.') : m.name
            }
            onSelect={() => onSelectMethod('', m.methodId!)}
          />
        ) : null,
      )}
    </>
  )
}

function VirtualServiceRows({
  children,
  depth,
  revealIds,
  followGen,
  selectedServiceId,
  selectedMethodId,
  scrollParentRef,
  onSelectService,
  onSelectMethod,
}: {
  children: ModuleNode[]
  depth: number
  revealIds: Set<string>
  followGen: number
  selectedServiceId?: string
  selectedMethodId?: string
  scrollParentRef?: RefObject<HTMLElement | null>
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const hydration = useContext(TreeHydrationContext)
  const expandedServiceIds = hydration?.expandedServiceIds ?? new Set<string>()
  const hasExpandedService = children.some(
    (c) => c.serviceId && expandedServiceIds.has(c.serviceId),
  )

  if (hasExpandedService) {
    return (
      <div className="tree-virtual-services is-plain">
        {children.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth}
            revealIds={revealIds}
            followGen={followGen}
            selectedServiceId={selectedServiceId}
            selectedMethodId={selectedMethodId}
            scrollParentRef={scrollParentRef}
            onSelectService={onSelectService}
            onSelectMethod={onSelectMethod}
          />
        ))}
      </div>
    )
  }

  return (
    <VirtualServiceRowsMeasured
      children={children}
      depth={depth}
      revealIds={revealIds}
      followGen={followGen}
      selectedServiceId={selectedServiceId}
      selectedMethodId={selectedMethodId}
      scrollParentRef={scrollParentRef}
      onSelectService={onSelectService}
      onSelectMethod={onSelectMethod}
    />
  )
}

function VirtualServiceRowsMeasured({
  children,
  depth,
  revealIds,
  followGen,
  selectedServiceId,
  selectedMethodId,
  scrollParentRef,
  onSelectService,
  onSelectMethod,
}: {
  children: ModuleNode[]
  depth: number
  revealIds: Set<string>
  followGen: number
  selectedServiceId?: string
  selectedMethodId?: string
  scrollParentRef?: RefObject<HTMLElement | null>
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => scrollParentRef?.current ?? hostRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12,
  })

  return (
    <div ref={hostRef} className="tree-virtual-services">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const child = children[item.index]
          if (!child) return null
          return (
            <div
              key={child.id}
              className="module-tree-virtual-row"
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <TreeItem
                node={child}
                depth={depth}
                revealIds={revealIds}
                followGen={followGen}
                selectedServiceId={selectedServiceId}
                selectedMethodId={selectedMethodId}
                scrollParentRef={scrollParentRef}
                onSelectService={onSelectService}
                onSelectMethod={onSelectMethod}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TreeItem({
  node,
  depth,
  revealIds,
  followGen,
  selectedServiceId,
  selectedMethodId,
  scrollParentRef,
  onSelectService,
  onSelectMethod,
}: {
  node: ModuleNode
  depth: number
  revealIds: Set<string>
  followGen: number
  selectedServiceId?: string
  selectedMethodId?: string
  scrollParentRef?: RefObject<HTMLElement | null>
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const hydration = useContext(TreeHydrationContext)
  const childMap = hydration?.childMap ?? new Map<string, ModuleNode[]>()
  const pageMeta = hydration?.pageMeta ?? new Map<string, PageState>()
  const sortByParent = hydration?.sortByParent ?? new Map<string, TreeSort>()
  const registerChildren = hydration?.registerChildren
  const setSort = hydration?.setSort
  const loadMore = hydration?.loadMore
  const showNonServiceMethods = hydration?.showNonServiceMethods ?? false
  const expandedServiceIds = hydration?.expandedServiceIds ?? new Set<string>()
  const setServiceExpanded = hydration?.setServiceExpanded

  const isService = node.kind === 'service'
  const resolvedChildren = childrenOf(node, childMap)
  const hasResolvedChildren = !!resolvedChildren?.length
  const canExpandLazy = Boolean(node.hasChildren && !hasResolvedChildren)
  const canExpand = hasResolvedChildren || canExpandLazy || isService
  const [branchOpen, setBranchOpen] = useState(() => revealIds.has(node.id))
  const open =
    isService && node.serviceId
      ? expandedServiceIds.has(node.serviceId)
      : branchOpen
  const [loadingChildren, setLoadingChildren] = useState(false)
  const selected =
    isService && node.serviceId === selectedServiceId && !selectedMethodId
  const rowRef = useRef<HTMLDivElement>(null)
  const tipHandlers = useTreeTipHandlers(node.name)
  const paginated = isPaginatedParent(node.id)
  const meta = pageMeta.get(node.id)
  const sort = sortByParent.get(node.id) ?? meta?.sort ?? 'name'
  const loadedCount = resolvedChildren?.length ?? 0
  const total = meta?.total ?? node.childCount ?? loadedCount
  const hasMore = paginated && loadedCount > 0 && loadedCount < total
  const sortReloading = meta?.sortReloading ?? false

  const setOpenState = useCallback(
    (next: boolean) => {
      if (isService && node.serviceId) {
        setServiceExpanded?.(node.serviceId, next)
        return
      }
      setBranchOpen(next)
    },
    [isService, node.serviceId, setServiceExpanded],
  )

  useEffect(() => {
    if (followGen === 0) return
    if (!revealIds.has(node.id)) return
    if (isService && node.serviceId) {
      setServiceExpanded?.(node.serviceId, true)
    } else {
      setBranchOpen(true)
    }
  }, [followGen, node.id, isService, node.serviceId, setServiceExpanded])

  useLayoutEffect(() => {
    if (followGen === 0 || !selected) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [followGen, node.id])

  const fetchChildren = async (anchorServiceId?: string) => {
    setLoadingChildren(true)
    try {
      const page = await getModuleChildren(node.id, {
        limit: SERVICE_PAGE_SIZE,
        offset: 0,
        sort,
        anchorServiceId,
      })
      registerChildren?.(node.id, page.items, {
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        sort,
        loadingMore: false,
      })
    } catch {
      registerChildren?.(node.id, [], {
        total: 0,
        limit: SERVICE_PAGE_SIZE,
        offset: 0,
        sort,
        loadingMore: false,
      })
    } finally {
      setLoadingChildren(false)
    }
  }

  const loadChildren = async (anchorServiceId?: string) => {
    if (!canExpandLazy && !paginated) return
    if (hasResolvedChildren && !anchorServiceId) return
    await fetchChildren(anchorServiceId)
  }

  const toggleOpen = () => {
    void (async () => {
      if (open) {
        setOpenState(false)
        return
      }
      setOpenState(true)
      await loadChildren()
    })()
  }

  const showChildBranch =
    open && (hasResolvedChildren || loadingChildren || sortReloading || paginated)

  return (
    <div className="tree-item">
      <div
        ref={rowRef}
        className={`tree-row ${selected ? 'selected' : ''} kind-${node.kind}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        data-tree-service={isService ? node.serviceId : undefined}
      >
        {canExpand ? (
          <button
            type="button"
            className="chev-btn"
            aria-expanded={open}
            aria-label={open ? 'Kapat' : 'Aç'}
            onClick={() => void toggleOpen()}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="chev spacer" />
        )}
        <span className="tree-kind" title={KIND_LABEL[node.kind]}>
          {KIND_INITIAL[node.kind]}
        </span>
        <button
          type="button"
          className="tree-label-btn"
          {...tipHandlers}
          onClick={() => {
            if (isService && node.serviceId) {
              onSelectService(node.serviceId)
              return
            }
            if (canExpand) {
              void toggleOpen()
            }
          }}
        >
          <span className="tree-label">{node.name}</span>
          {node.kind === 'package' && node.childCount != null && node.childCount > 0 ? (
            <StatusBadge tone="ok" className="tree-jar-count">
              {node.childCount} servis
            </StatusBadge>
          ) : null}
          {isService && sort === 'degree' && node.degree != null ? (
            <span className="tree-degree-chip" title="Bağımlılık sayısı (etkilenen servis)">
              {node.degree}
            </span>
          ) : null}
        </button>
      </div>
      <TreeAccordion open={showChildBranch}>
        {paginated && (hasResolvedChildren || sortReloading || open) ? (
          <TreeSortBar
            parentId={node.id}
            depth={depth + 1}
            sort={sort}
            onSort={(next) => {
              if (next === sort && !sortReloading) return
              setSort?.(node.id, next)
            }}
          />
        ) : null}
        {loadingChildren || sortReloading ? (
          <div className="tree-item" style={{ paddingLeft: 8 + (depth + 1) * 12 }}>
            <SkeletonShimmer className="tree-row skeleton" lines={3} />
          </div>
        ) : hasResolvedChildren ? (
          paginated && resolvedChildren!.length >= VIRTUALIZE_MIN_ROWS ? (
            <VirtualServiceRows
              children={resolvedChildren!}
              depth={depth + 1}
              revealIds={revealIds}
              followGen={followGen}
              selectedServiceId={selectedServiceId}
              selectedMethodId={selectedMethodId}
              onSelectService={onSelectService}
              onSelectMethod={onSelectMethod}
              scrollParentRef={scrollParentRef}
            />
          ) : (
            resolvedChildren!.map((child) => (
              <TreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                revealIds={revealIds}
                followGen={followGen}
                selectedServiceId={selectedServiceId}
                selectedMethodId={selectedMethodId}
                onSelectService={onSelectService}
                onSelectMethod={onSelectMethod}
              />
            ))
          )
        ) : null}
        {hasMore ? (
          <TreeLoadMoreRow
            depth={depth + 1}
            remaining={total - loadedCount}
            loading={meta?.loadingMore ?? false}
            onLoad={() => void loadMore?.(node.id)}
          />
        ) : null}
        {showNonServiceMethods && isArtifactNode(node) && hasResolvedChildren ? (
          <NonServiceMethodLeaves
            artifactNodeId={node.id}
            depth={depth + 1}
            selectedMethodId={selectedMethodId}
            onSelectMethod={onSelectMethod}
          />
        ) : null}
      </TreeAccordion>
      <TreeAccordion open={open && isService && Boolean(node.serviceId)}>
        {node.serviceId ? (
          <MethodLeaves
            serviceId={node.serviceId}
            selectedMethodId={
              selectedServiceId === node.serviceId ? selectedMethodId : undefined
            }
            depth={depth + 1}
            onSelectMethod={onSelectMethod}
          />
        ) : null}
      </TreeAccordion>
    </div>
  )
}


export function ModuleTree({
  nodes,
  selectedServiceId,
  selectedMethodId,
  scrollParentRef,
  onSelectService,
  onSelectMethod,
}: Props) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [childMap, setChildMap] = useState<Map<string, ModuleNode[]>>(() => new Map())
  const [pageMeta, setPageMeta] = useState<Map<string, PageState>>(() => new Map())
  const [sortByParent, setSortByParent] = useState<Map<string, TreeSort>>(() => new Map())
  const [hydrateRevealIds, setHydrateRevealIds] = useState<Set<string>>(() => new Set())
  const [followGen, setFollowGen] = useState(0)
  const [showNonServiceMethods, setShowNonServiceMethods] = useState(false)
  const [expandedServiceIds, setExpandedServiceIds] = useState<Set<string>>(() => new Set())
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)
  const listRef = useRef<HTMLDivElement>(null)

  const setServiceExpanded = useCallback((serviceId: string, expanded: boolean) => {
    setExpandedServiceIds((prev) => {
      const next = new Set(prev)
      if (expanded) next.add(serviceId)
      else next.delete(serviceId)
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
      return next
    })
  }, [])

  const registerChildren = useCallback(
    (nodeId: string, children: ModuleNode[], page: PageState) => {
      setChildMap((prev) => {
        const next = new Map(prev)
        next.set(nodeId, children)
        return next
      })
      setPageMeta((prev) => {
        const next = new Map(prev)
        next.set(nodeId, page)
        return next
      })
      setSortByParent((prev) => {
        const next = new Map(prev)
        next.set(nodeId, page.sort)
        return next
      })
    },
    [],
  )

  const appendChildren = useCallback(
    (nodeId: string, children: ModuleNode[], page: PageState) => {
      setChildMap((prev) => {
        const next = new Map(prev)
        const existing = next.get(nodeId) ?? []
        next.set(nodeId, [...existing, ...children])
        return next
      })
      setPageMeta((prev) => {
        const next = new Map(prev)
        next.set(nodeId, page)
        return next
      })
    },
    [],
  )

  const setSort = useCallback(
    (nodeId: string, sort: TreeSort) => {
      const prevMeta = pageMeta.get(nodeId)
      if (prevMeta?.sort === sort && !prevMeta.sortReloading) return

      setSortByParent((prev) => {
        const next = new Map(prev)
        next.set(nodeId, sort)
        return next
      })
      setPageMeta((prev) => {
        const next = new Map(prev)
        const base = prev.get(nodeId)
        next.set(nodeId, {
          total: base?.total ?? 0,
          limit: base?.limit ?? SERVICE_PAGE_SIZE,
          offset: 0,
          sort,
          loadingMore: false,
          sortReloading: true,
        })
        return next
      })
      void (async () => {
        try {
          const page = await getModuleChildren(nodeId, {
            limit: SERVICE_PAGE_SIZE,
            offset: 0,
            sort,
          })
          registerChildren(nodeId, page.items, {
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            sort,
            loadingMore: false,
            sortReloading: false,
          })
        } catch {
          registerChildren(nodeId, [], {
            total: 0,
            limit: SERVICE_PAGE_SIZE,
            offset: 0,
            sort,
            loadingMore: false,
            sortReloading: false,
          })
        }
      })()
    },
    [pageMeta, registerChildren],
  )

  const loadMore = useCallback(
    async (nodeId: string) => {
      const meta = pageMeta.get(nodeId)
      const sort = sortByParent.get(nodeId) ?? meta?.sort ?? 'name'
      const current = childMap.get(nodeId)?.length ?? 0
      if (!meta || current >= meta.total) return

      setPageMeta((prev) => {
        const next = new Map(prev)
        next.set(nodeId, { ...meta, loadingMore: true })
        return next
      })

      try {
        const page = await getModuleChildren(nodeId, {
          limit: meta.limit,
          offset: current,
          sort,
        })
        appendChildren(nodeId, page.items, {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          sort,
          loadingMore: false,
        })
      } catch {
        setPageMeta((prev) => {
          const next = new Map(prev)
          next.set(nodeId, { ...meta, loadingMore: false })
          return next
        })
      }
    },
    [appendChildren, childMap, pageMeta, sortByParent],
  )

  const hydrationContext = useMemo<TreeHydrationContextValue>(
    () => ({
      childMap,
      pageMeta,
      sortByParent,
      registerChildren,
      appendChildren,
      setSort,
      loadMore,
      showNonServiceMethods,
      expandedServiceIds,
      setServiceExpanded,
    }),
    [
      childMap,
      pageMeta,
      sortByParent,
      registerChildren,
      appendChildren,
      setSort,
      loadMore,
      showNonServiceMethods,
      expandedServiceIds,
      setServiceExpanded,
    ],
  )

  const tipContext = useMemo<TreeTipContextValue>(
    () => ({
      showTip: (text, anchor) => {
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          const r = anchor.getBoundingClientRect()
          setTip({
            text,
            top: r.top + r.height / 2,
            left: Math.min(r.right + 10, window.innerWidth - 320),
          })
        }, TIP_DELAY_MS)
      },
      hideTip: () => {
        window.clearTimeout(timerRef.current)
        setTip(null)
      },
    }),
    [],
  )

  useEffect(() => {
    if (!selectedServiceId?.startsWith('sd-')) {
      setHydrateRevealIds(new Set())
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { path } = await getServiceTreePath(selectedServiceId)
        if (cancelled || path.length === 0) return
        const nextMap = new Map<string, ModuleNode[]>()
        const nextMeta = new Map<string, PageState>()
        const opens = new Set<string>()
        for (let i = 0; i < path.length - 1; i++) {
          const seg = path[i]
          const nextSeg = path[i + 1]
          opens.add(seg.id)
          const anchor =
            isPaginatedParent(seg.id) && nextSeg?.kind === 'service'
              ? nextSeg.serviceId
              : undefined
          const page = await getModuleChildren(seg.id, { anchorServiceId: anchor })
          nextMap.set(seg.id, page.items)
          nextMeta.set(seg.id, {
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            sort: 'name',
            loadingMore: false,
          })
        }
        const leaf = path[path.length - 1]
        if (selectedMethodId && leaf?.kind === 'service') {
          opens.add(leaf.id)
          if (leaf.serviceId) {
            setExpandedServiceIds((prev) => {
              const next = new Set(prev)
              next.add(leaf.serviceId!)
              return next
            })
          }
        }
        if (!cancelled) {
          if (nextMap.size > 0) {
            setChildMap((prev) => new Map([...prev, ...nextMap]))
            setPageMeta((prev) => new Map([...prev, ...nextMeta]))
          }
          setHydrateRevealIds(opens)
          setFollowGen((g) => g + 1)
        }
      } catch {
        /* mock mod veya konumsuz servis */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedServiceId, selectedMethodId])

  const revealIds = useMemo(() => {
    const ids = revealAncestorIds(
      nodes,
      childMap,
      selectedServiceId,
      selectedMethodId,
    )
    for (const id of hydrateRevealIds) ids.add(id)
    return ids
  }, [nodes, childMap, selectedServiceId, selectedMethodId, hydrateRevealIds])

  useEffect(() => {
    if (!selectedServiceId || followGen === 0) return
    const sel = selectedMethodId
      ? `[data-tree-method="${CSS.escape(selectedMethodId)}"]`
      : `[data-tree-service="${CSS.escape(selectedServiceId)}"]`
    const t = window.setTimeout(() => {
      document.querySelector(sel)?.scrollIntoView({ block: 'nearest' })
    }, 200)
    return () => window.clearTimeout(t)
  }, [followGen, selectedServiceId, selectedMethodId])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return (
    <TreeTipContext.Provider value={tipContext}>
      <TreeHydrationContext.Provider value={hydrationContext}>
        <label className="tree-global-non-service-toggle">
          <input
            type="checkbox"
            checked={showNonServiceMethods}
            onChange={(e) => setShowNonServiceMethods(e.target.checked)}
          />
          <span>Servis dışı metodları göster</span>
        </label>
        <nav className="module-tree" aria-label="Modül ağacı" ref={listRef}>
          {nodes.map((n) => (
            <TreeItem
              key={n.id}
              node={n}
              depth={0}
              revealIds={revealIds}
              followGen={followGen}
              selectedServiceId={selectedServiceId}
              selectedMethodId={selectedMethodId}
              scrollParentRef={scrollParentRef}
              onSelectService={onSelectService}
              onSelectMethod={onSelectMethod}
            />
          ))}
        </nav>
        <TreeHoverTipPortal tip={tip} />
      </TreeHydrationContext.Provider>
    </TreeTipContext.Provider>
  )
}
