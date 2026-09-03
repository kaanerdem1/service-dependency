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
import { TreeKindIcon } from './TreeKindIcon'
import type { MethodRef, ModuleNode } from '../types'
import { MotionTooltip } from '../motion/MotionTooltip'
import { SkeletonShimmer } from '../motion/SkeletonShimmer'
import { StatusBadge } from '../motion/StatusBadge'
import { TreeAccordion } from '../motion/TreeAccordion'
import { useModuleTreeKeyboard } from '../useModuleTreeKeyboard'

const TIP_DELAY_MS = 1000
const SERVICE_PAGE_SIZE = 50
const VIRTUALIZE_MIN_ROWS = 200
const ROW_HEIGHT_PX = 34

const KIND_LABEL: Record<ModuleNode['kind'], string> = {
  group: 'proje grubu',
  project: 'proje',
  package: 'jar',
  service: 'servis',
  method: 'method',
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
  openIds: Set<string>
  setBranchOpenId: (nodeId: string, open: boolean) => void
  registerChildren: (nodeId: string, children: ModuleNode[], page: PageState) => void
  appendChildren: (nodeId: string, children: ModuleNode[], page: PageState) => void
  setSort: (nodeId: string, sort: TreeSort) => void
  loadMore: (nodeId: string) => Promise<void>
  showNonServiceMethods: boolean
  expandedServiceIds: Set<string>
  setServiceExpanded: (serviceId: string, expanded: boolean) => void
  /** Arama odak: seçili jar id */
  focusJarId?: string
  focusServiceId?: string
  focusShowAll: boolean
  revealFocusJarServices: () => void
  /** Kullanıcı başka jar açınca takip/scroll kilidini bırak */
  releaseFocusFollow: () => void
  focusFollowScroll: boolean
}

type TreeSnapshot = {
  childMap: Map<string, ModuleNode[]>
  pageMeta: Map<string, PageState>
  sortByParent: Map<string, TreeSort>
  openIds: Set<string>
  expandedServiceIds: Set<string>
  hydrateRevealIds: Set<string>
  scrollTop: number
}

const TreeTipContext = createContext<TreeTipContextValue | null>(null)
const TreeHydrationContext = createContext<TreeHydrationContextValue | null>(null)

function isPaginatedParent(nodeId: string): boolean {
  return nodeId === 'unlocated' || nodeId.startsWith('art-')
}

function pinServiceToTop(items: ModuleNode[], serviceId: string): ModuleNode[] {
  const idx = items.findIndex((c) => c.kind === 'service' && c.serviceId === serviceId)
  if (idx <= 0) return items
  const next = [...items]
  const [hit] = next.splice(idx, 1)
  return [hit, ...next]
}

function useTreeTipHandlers(text: string, options?: { force?: boolean }) {
  const ctx = useContext(TreeTipContext)
  return {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      if (!ctx) return
      const label = e.currentTarget.querySelector('.tree-label') as HTMLElement | null
      const anchor = label ?? e.currentTarget
      const truncated = Boolean(label && label.scrollWidth > label.clientWidth + 1)
      if (!options?.force && text.length <= 22 && !truncated) return
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
  selectedCatalogNodeId?: string
  scrollParentRef?: RefObject<HTMLElement | null>
  showNonServiceMethods?: boolean
  pinServiceId?: string
  /** Klavye gezinmesi (favoriler drawer açıkken kapatılır) */
  keyboardEnabled?: boolean
  /** Arama odağından çık (seçim kalsın, ağaç konumu korunur) */
  onClearPin?: () => void
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
  onSelectCatalogNode?: (node: ModuleNode) => void
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
        data-tree-nav={methodId}
        onClick={onSelect}
        {...tipHandlers}
      >
        <span className="chev spacer" />
        <TreeKindIcon kind="method" size={14} title={KIND_LABEL.method} />
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

function TreeLoadMoreRow({
  depth,
  remaining,
  loading,
  parentNodeId,
  onLoad,
}: {
  depth: number
  remaining: number
  loading: boolean
  parentNodeId: string
  onLoad: () => void
}) {
  return (
    <div className="tree-item">
      <button
        type="button"
        className="tree-load-more"
        style={{ paddingLeft: 8 + depth * 12 }}
        data-tree-nav={`load-more-${parentNodeId}`}
        disabled={loading}
        onClick={() => void onLoad()}
      >
        {loading ? 'Yükleniyor…' : `+${Math.min(SERVICE_PAGE_SIZE, remaining)} servis daha göster`}
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

function measureScrollMargin(host: HTMLElement, scrollEl: HTMLElement): number {
  return (
    host.getBoundingClientRect().top -
    scrollEl.getBoundingClientRect().top +
    scrollEl.scrollTop
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
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const host = hostRef.current
    const scrollEl = scrollParentRef?.current
    if (!host || !scrollEl) return

    const sync = () => {
      const next = measureScrollMargin(host, scrollEl)
      setScrollMargin((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
    }
    sync()

    const ro = new ResizeObserver(sync)
    ro.observe(host)
    let ancestor: HTMLElement | null = host.parentElement
    while (ancestor && ancestor !== scrollEl) {
      ro.observe(ancestor)
      ancestor = ancestor.parentElement
    }
    return () => ro.disconnect()
  }, [scrollParentRef, children.length, followGen])

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => scrollParentRef?.current ?? hostRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 16,
    scrollMargin,
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
                transform: `translateY(${item.start - scrollMargin}px)`,
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
  selectedCatalogNodeId,
  scrollParentRef,
  onSelectService,
  onSelectMethod,
  onSelectCatalogNode,
}: {
  node: ModuleNode
  depth: number
  revealIds: Set<string>
  followGen: number
  selectedServiceId?: string
  selectedMethodId?: string
  selectedCatalogNodeId?: string
  scrollParentRef?: RefObject<HTMLElement | null>
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
  onSelectCatalogNode?: (node: ModuleNode) => void
}) {
  const hydration = useContext(TreeHydrationContext)
  const childMap = hydration?.childMap ?? new Map<string, ModuleNode[]>()
  const pageMeta = hydration?.pageMeta ?? new Map<string, PageState>()
  const sortByParent = hydration?.sortByParent ?? new Map<string, TreeSort>()
  const openIds = hydration?.openIds ?? new Set<string>()
  const setBranchOpenId = hydration?.setBranchOpenId
  const registerChildren = hydration?.registerChildren
  const loadMore = hydration?.loadMore
  const showNonServiceMethods = hydration?.showNonServiceMethods ?? false
  const expandedServiceIds = hydration?.expandedServiceIds ?? new Set<string>()
  const setServiceExpanded = hydration?.setServiceExpanded
  const focusJarId = hydration?.focusJarId
  const focusServiceId = hydration?.focusServiceId
  const focusShowAll = hydration?.focusShowAll ?? true
  const revealFocusJarServices = hydration?.revealFocusJarServices
  const releaseFocusFollow = hydration?.releaseFocusFollow

  const isService = node.kind === 'service'
  const resolvedChildren = childrenOf(node, childMap)
  let displayChildren = resolvedChildren
  const focusCompact =
    Boolean(focusJarId && focusServiceId && node.id === focusJarId && !focusShowAll)
  if (focusCompact && displayChildren) {
    displayChildren = displayChildren.filter((c) => c.serviceId === focusServiceId)
  }
  const hasResolvedChildren = !!displayChildren?.length
  const canExpandLazy = Boolean(node.hasChildren && !resolvedChildren?.length)
  const canExpand = hasResolvedChildren || canExpandLazy || isService || Boolean(resolvedChildren)
  const open =
    isService && node.serviceId
      ? expandedServiceIds.has(node.serviceId)
      : openIds.has(node.id)
  const [loadingChildren, setLoadingChildren] = useState(false)
  const isCatalogNode = node.kind === 'group' || node.kind === 'package'
  const selected =
    isService && node.serviceId === selectedServiceId && !selectedMethodId
  const catalogSelected = isCatalogNode && selectedCatalogNodeId === node.id
  const rowRef = useRef<HTMLDivElement>(null)
  const tipText =
    node.kind === 'group' && node.description
      ? `${node.name} — ${node.description}`
      : node.name
  const tipHandlers = useTreeTipHandlers(tipText, {
    force: node.kind === 'group' && Boolean(node.description),
  })
  const paginated = isPaginatedParent(node.id) && !focusCompact
  const meta = pageMeta.get(node.id)
  const sort = sortByParent.get(node.id) ?? meta?.sort ?? 'name'
  const loadedCount = displayChildren?.length ?? 0
  const total = meta?.total ?? node.childCount ?? loadedCount
  const hasMore = !focusCompact && paginated && loadedCount > 0 && loadedCount < total
  const sortReloading = meta?.sortReloading ?? false
  const hiddenSiblingCount = focusCompact
    ? Math.max(0, (meta?.total ?? node.childCount ?? 1) - 1)
    : 0
  const nextBatchCount = Math.min(SERVICE_PAGE_SIZE, hiddenSiblingCount)

  const setOpenState = useCallback(
    (next: boolean) => {
      if (isService && node.serviceId) {
        setServiceExpanded?.(node.serviceId, next)
        return
      }
      setBranchOpenId?.(node.id, next)
    },
    [isService, node.serviceId, node.id, setServiceExpanded, setBranchOpenId],
  )

  useEffect(() => {
    if (followGen === 0) return
    if (!revealIds.has(node.id)) return
    if (isService && node.serviceId) {
      setServiceExpanded?.(node.serviceId, true)
    } else {
      setBranchOpenId?.(node.id, true)
    }
    // revealIds bilerek deps'te yok — childMap her güncellemesinde tekrar tetiklenmesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followGen, node.id, isService, node.serviceId, setServiceExpanded, setBranchOpenId])

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
    if (resolvedChildren?.length && !anchorServiceId) return
    await fetchChildren(anchorServiceId)
  }

  const toggleOpen = () => {
    void (async () => {
      if (open) {
        setOpenState(false)
        return
      }
      // Arama odağındayken başka jar/grup açılırsa odağı bırak — scroll/konum bozulmasın
      if (
        focusServiceId &&
        focusJarId &&
        (node.kind === 'package' || node.kind === 'group') &&
        node.id !== focusJarId
      ) {
        releaseFocusFollow?.()
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
        className={`tree-row ${selected ? 'selected' : ''}${catalogSelected ? ' catalog-selected' : ''} kind-${node.kind}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        data-tree-node={node.id}
        data-tree-nav={node.id}
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
        <TreeKindIcon kind={node.kind} size={14} title={KIND_LABEL[node.kind]} />
        <button
          type="button"
          className="tree-label-btn"
          {...tipHandlers}
          onClick={() => {
            if (isService && node.serviceId) {
              onSelectService(node.serviceId)
              return
            }
            if (isCatalogNode && onSelectCatalogNode) {
              onSelectCatalogNode(node)
              return
            }
            if (canExpand) {
              void toggleOpen()
            }
          }}
        >
          <span className="tree-label-stack">
            <span className="tree-label">{node.name}</span>
            {node.kind === 'group' && node.description ? (
              <span className="tree-group-desc">{node.description}</span>
            ) : null}
          </span>
          {node.kind === 'package' && node.childCount != null && node.childCount > 0 ? (
            <StatusBadge tone="ok" className="tree-jar-count">
              {node.childCount} servis
            </StatusBadge>
          ) : null}
        </button>
      </div>
      <TreeAccordion open={showChildBranch}>
        {loadingChildren || sortReloading ? (
          <div className="tree-item" style={{ paddingLeft: 8 + (depth + 1) * 12 }}>
            <SkeletonShimmer className="tree-row skeleton" lines={3} />
          </div>
        ) : hasResolvedChildren ? (
          paginated && displayChildren!.length >= VIRTUALIZE_MIN_ROWS ? (
            <VirtualServiceRows
              children={displayChildren!}
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
            displayChildren!.map((child) => (
              <TreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                revealIds={revealIds}
                followGen={followGen}
                selectedServiceId={selectedServiceId}
                selectedMethodId={selectedMethodId}
                selectedCatalogNodeId={selectedCatalogNodeId}
                scrollParentRef={scrollParentRef}
                onSelectService={onSelectService}
                onSelectMethod={onSelectMethod}
                onSelectCatalogNode={onSelectCatalogNode}
              />
            ))
          )
        ) : null}
        {focusCompact && nextBatchCount > 0 ? (
          <div
            className="tree-focus-more"
            style={{ paddingLeft: 8 + (depth + 1) * 12 }}
          >
            <button
              type="button"
              className="tree-focus-more-btn"
              data-tree-nav={`focus-more-${node.id}`}
              onClick={() => revealFocusJarServices?.()}
            >
              +{nextBatchCount} servis daha göster
            </button>
          </div>
        ) : null}
        {hasMore ? (
          <TreeLoadMoreRow
            depth={depth + 1}
            remaining={total - loadedCount}
            loading={meta?.loadingMore ?? false}
            parentNodeId={node.id}
            onLoad={() => void loadMore?.(node.id)}
          />
        ) : null}
        {showNonServiceMethods && isArtifactNode(node) && hasResolvedChildren && !focusCompact ? (
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
  selectedCatalogNodeId,
  scrollParentRef,
  showNonServiceMethods = false,
  pinServiceId,
  keyboardEnabled = true,
  onClearPin,
  onSelectService,
  onSelectMethod,
  onSelectCatalogNode,
}: Props) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [childMap, setChildMap] = useState<Map<string, ModuleNode[]>>(() => new Map())
  const [pageMeta, setPageMeta] = useState<Map<string, PageState>>(() => new Map())
  const [sortByParent, setSortByParent] = useState<Map<string, TreeSort>>(() => new Map())
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const [hydrateRevealIds, setHydrateRevealIds] = useState<Set<string>>(() => new Set())
  const [followGen, setFollowGen] = useState(0)
  const [expandedServiceIds, setExpandedServiceIds] = useState<Set<string>>(() => new Set())
  const [focusJarId, setFocusJarId] = useState<string>()
  const [focusShowAll, setFocusShowAll] = useState(false)
  const [focusFollowScroll, setFocusFollowScroll] = useState(true)
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)
  const listRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef<TreeSnapshot | null>(null)
  const focusSessionRef = useRef<string | null>(null)
  /** Kullanıcı ağaçta gezerek odağı bıraktı — snapshot restore / re-hydrate yok */
  const focusAbandonedRef = useRef(false)
  const childMapRef = useRef(childMap)
  const pageMetaRef = useRef(pageMeta)
  const sortByParentRef = useRef(sortByParent)
  const openIdsRef = useRef(openIds)
  const expandedServiceIdsRef = useRef(expandedServiceIds)
  const hydrateRevealIdsRef = useRef(hydrateRevealIds)
  childMapRef.current = childMap
  pageMetaRef.current = pageMeta
  sortByParentRef.current = sortByParent
  openIdsRef.current = openIds
  expandedServiceIdsRef.current = expandedServiceIds
  hydrateRevealIdsRef.current = hydrateRevealIds

  const setServiceExpanded = useCallback((serviceId: string, expanded: boolean) => {
    setExpandedServiceIds((prev) => {
      const next = new Set(prev)
      if (expanded) next.add(serviceId)
      else next.delete(serviceId)
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
      return next
    })
  }, [])

  const setBranchOpenId = useCallback((nodeId: string, open: boolean) => {
    setOpenIds((prev) => {
      const has = prev.has(nodeId)
      if (open === has) return prev
      const next = new Set(prev)
      if (open) next.add(nodeId)
      else next.delete(nodeId)
      return next
    })
  }, [])

  const captureSnapshot = useCallback((): TreeSnapshot => {
    return {
      childMap: new Map(childMapRef.current),
      pageMeta: new Map(pageMetaRef.current),
      sortByParent: new Map(sortByParentRef.current),
      openIds: new Set(openIdsRef.current),
      expandedServiceIds: new Set(expandedServiceIdsRef.current),
      hydrateRevealIds: new Set(hydrateRevealIdsRef.current),
      scrollTop: scrollParentRef?.current?.scrollTop ?? 0,
    }
  }, [scrollParentRef])

  const restoreSnapshot = useCallback(
    (snap: TreeSnapshot) => {
      setChildMap(snap.childMap)
      setPageMeta(snap.pageMeta)
      setSortByParent(snap.sortByParent)
      setOpenIds(snap.openIds)
      setExpandedServiceIds(snap.expandedServiceIds)
      setHydrateRevealIds(snap.hydrateRevealIds)
      setFocusJarId(undefined)
      setFocusShowAll(false)
      setFocusFollowScroll(true)
      focusSessionRef.current = null
      focusAbandonedRef.current = false
      setFollowGen((g) => g + 1)
      requestAnimationFrame(() => {
        if (scrollParentRef?.current) {
          scrollParentRef.current.scrollTop = snap.scrollTop
        }
      })
    },
    [scrollParentRef],
  )

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
      const nextOffset = meta.offset + meta.limit

      setPageMeta((prev) => {
        const next = new Map(prev)
        next.set(nodeId, { ...meta, loadingMore: true })
        return next
      })

      try {
        const page = await getModuleChildren(nodeId, {
          limit: meta.limit || SERVICE_PAGE_SIZE,
          offset: nextOffset,
          sort,
        })
        setChildMap((prev) => {
          const next = new Map(prev)
          const existing = next.get(nodeId) ?? []
          let merged = [...existing, ...page.items]
          if (pinServiceId && nodeId === focusJarId) {
            const seen = new Set<string>()
            merged = merged.filter((c) => {
              const key = c.serviceId ?? c.id
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            merged = pinServiceToTop(merged, pinServiceId)
          }
          next.set(nodeId, merged)
          return next
        })
        setPageMeta((prev) => {
          const n = new Map(prev)
          n.set(nodeId, {
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            sort,
            loadingMore: false,
          })
          return n
        })
      } catch {
        setPageMeta((prev) => {
          const next = new Map(prev)
          next.set(nodeId, { ...meta, loadingMore: false })
          return next
        })
      }
    },
    [childMap, pageMeta, sortByParent, pinServiceId, focusJarId],
  )

  const releaseFocusFollow = useCallback(() => {
    // Arama odağını bırak: seçim (harita) kalsın, ağaç konumu korunur, geri snap yok
    focusAbandonedRef.current = true
    focusSessionRef.current = null
    snapshotRef.current = null
    setFocusFollowScroll(false)
    setFocusJarId(undefined)
    setFocusShowAll(true)
    onClearPin?.()
  }, [onClearPin])

  const revealFocusJarServices = useCallback(() => {
    const jarId = focusJarId
    const serviceId = pinServiceId
    if (!jarId || !serviceId) return
    void (async () => {
      try {
        const page = await getModuleChildren(jarId, {
          limit: SERVICE_PAGE_SIZE,
          offset: 0,
          sort: 'name',
        })
        const focused =
          childMapRef.current.get(jarId)?.find((c) => c.serviceId === serviceId) ??
          page.items.find((c) => c.serviceId === serviceId)
        const rest = page.items.filter((c) => c.serviceId !== serviceId)
        const items = focused
          ? [focused, ...rest].slice(0, SERVICE_PAGE_SIZE)
          : pinServiceToTop(page.items, serviceId)
        registerChildren(jarId, items, {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          sort: 'name',
          loadingMore: false,
        })
        setFocusShowAll(true)
      } catch {
        setFocusShowAll(true)
      }
    })()
  }, [focusJarId, pinServiceId, registerChildren])

  const hydrationContext = useMemo<TreeHydrationContextValue>(
    () => ({
      childMap,
      pageMeta,
      sortByParent,
      openIds,
      setBranchOpenId,
      registerChildren,
      appendChildren,
      setSort,
      loadMore,
      showNonServiceMethods,
      expandedServiceIds,
      setServiceExpanded,
      focusJarId,
      focusServiceId: pinServiceId,
      focusShowAll,
      revealFocusJarServices,
      releaseFocusFollow,
      focusFollowScroll,
    }),
    [
      childMap,
      pageMeta,
      sortByParent,
      openIds,
      setBranchOpenId,
      registerChildren,
      appendChildren,
      setSort,
      loadMore,
      showNonServiceMethods,
      expandedServiceIds,
      setServiceExpanded,
      focusJarId,
      pinServiceId,
      focusShowAll,
      revealFocusJarServices,
      releaseFocusFollow,
      focusFollowScroll,
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

  const prevSelectedRef = useRef(selectedServiceId)
  if (prevSelectedRef.current !== selectedServiceId) {
    prevSelectedRef.current = selectedServiceId
    // Yeni servis seçimi — abandon kilidini kaldır (ağaç/harita hydrate edebilsin)
    if (pinServiceId !== selectedServiceId) {
      focusAbandonedRef.current = false
    }
  }

  useEffect(() => {
    if (pinServiceId) {
      focusAbandonedRef.current = false
      if (!snapshotRef.current) {
        snapshotRef.current = captureSnapshot()
      }
      return
    }
    // Pin kalktı: "Seçimi bırak" → snapshot geri yükle.
    // Kullanıcı başka jar açarak odağı bıraktıysa → ağacı olduğu gibi bırak.
    if (snapshotRef.current && !focusAbandonedRef.current) {
      restoreSnapshot(snapshotRef.current)
    }
    snapshotRef.current = null
    focusSessionRef.current = null
  }, [pinServiceId, captureSnapshot, restoreSnapshot])

  useEffect(() => {
    if (!selectedServiceId?.startsWith('sd-')) {
      setHydrateRevealIds(new Set())
      focusAbandonedRef.current = false
      return
    }
    let cancelled = false
    const shouldFocus = pinServiceId === selectedServiceId
    const isNewFocusSession = shouldFocus && focusSessionRef.current !== selectedServiceId

    // Aynı seçili serviste odağı ağaç gezintisiyle bıraktık — re-hydrate/snap yok
    if (!shouldFocus && focusAbandonedRef.current) {
      return
    }

    if (shouldFocus && isNewFocusSession) {
      focusAbandonedRef.current = false
    }

    // Aynı arama odağı oturumu — jarları tekrar kapatma / scroll etme
    if (shouldFocus && !isNewFocusSession) {
      return
    }

    void (async () => {
      try {
        const { path } = await getServiceTreePath(selectedServiceId)
        if (cancelled || path.length === 0) return
        if (focusAbandonedRef.current) return

        const nextMap = new Map<string, ModuleNode[]>()
        const nextMeta = new Map<string, PageState>()
        const opens = new Set<string>()

        const jarSeg = path.find((s) => s.kind === 'package' || s.id.startsWith('art-'))
        const serviceSeg = path.find((s) => s.kind === 'service')

        for (let i = 0; i < path.length - 1; i++) {
          const seg = path[i]
          const nextSeg = path[i + 1]
          opens.add(seg.id)
          const anchor =
            isPaginatedParent(seg.id) && nextSeg?.kind === 'service'
              ? nextSeg.serviceId
              : undefined

          if (shouldFocus && jarSeg && seg.id === jarSeg.id && serviceSeg) {
            const page = await getModuleChildren(seg.id, {
              limit: SERVICE_PAGE_SIZE,
              offset: 0,
            })
            if (cancelled || focusAbandonedRef.current) return
            const only =
              page.items.find((c) => c.serviceId === serviceSeg.serviceId) ??
              ({
                id: serviceSeg.id,
                kind: 'service' as const,
                name: serviceSeg.name,
                serviceId: serviceSeg.serviceId,
                hasChildren: false,
              } satisfies ModuleNode)
            nextMap.set(seg.id, [only])
            nextMeta.set(seg.id, {
              total: page.total,
              limit: page.limit,
              offset: 0,
              sort: 'name',
              loadingMore: false,
            })
            continue
          }

          const page = await getModuleChildren(seg.id, {
            anchorServiceId: shouldFocus ? undefined : anchor,
            offset: shouldFocus && anchor ? 0 : undefined,
          })
          if (cancelled || focusAbandonedRef.current) return
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
        if (!cancelled && !focusAbandonedRef.current) {
          if (nextMap.size > 0) {
            setChildMap((prev) => new Map([...prev, ...nextMap]))
            setPageMeta((prev) => new Map([...prev, ...nextMeta]))
          }
          if (shouldFocus && isNewFocusSession) {
            focusSessionRef.current = selectedServiceId
            setFocusJarId(jarSeg?.id)
            setFocusShowAll(false)
            setFocusFollowScroll(true)
            setOpenIds((prev) => {
              const next = new Set<string>()
              for (const id of prev) {
                if (!id.startsWith('art-')) next.add(id)
              }
              for (const id of opens) next.add(id)
              return next
            })
          } else if (!shouldFocus) {
            focusSessionRef.current = null
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
  }, [selectedServiceId, selectedMethodId, pinServiceId])

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
    if (!focusFollowScroll || focusAbandonedRef.current) return
    if (!selectedServiceId || followGen === 0) return

    const scrollFocusedIntoView = () => {
      if (focusAbandonedRef.current || !focusFollowScroll) return
      const serviceSel = selectedMethodId
        ? `[data-tree-method="${CSS.escape(selectedMethodId)}"]`
        : `[data-tree-service="${CSS.escape(selectedServiceId)}"]`
      const serviceEl = document.querySelector(serviceSel)
      if (serviceEl) {
        // Servisi merkeze al — jar alt kenardaysa çocuk satır kesilmesin
        serviceEl.scrollIntoView({ block: 'center', inline: 'nearest' })
        return true
      }
      if (focusJarId) {
        document
          .querySelector(`[data-tree-node="${CSS.escape(focusJarId)}"]`)
          ?.scrollIntoView({ block: 'center', inline: 'nearest' })
      }
      return false
    }

    // Accordion + child hydrate sonrası birkaç deneme
    const t1 = window.setTimeout(() => {
      if (scrollFocusedIntoView()) return
      window.setTimeout(scrollFocusedIntoView, 220)
    }, 120)
    const t2 = window.setTimeout(scrollFocusedIntoView, 480)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [followGen, selectedServiceId, selectedMethodId, focusFollowScroll, focusJarId])

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
    },
    [],
  )

  useModuleTreeKeyboard({
    enabled: keyboardEnabled,
    scrollParentRef,
    treeRef: listRef,
  })

  return (
    <TreeTipContext.Provider value={tipContext}>
      <TreeHydrationContext.Provider value={hydrationContext}>
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
              selectedCatalogNodeId={selectedCatalogNodeId}
              scrollParentRef={scrollParentRef}
              onSelectService={onSelectService}
              onSelectMethod={onSelectMethod}
              onSelectCatalogNode={onSelectCatalogNode}
            />
          ))}
        </nav>
        <TreeHoverTipPortal tip={tip} />
      </TreeHydrationContext.Provider>
    </TreeTipContext.Provider>
  )
}
