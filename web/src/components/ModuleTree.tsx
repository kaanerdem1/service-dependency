/**
 * Sol modül ağacı: proje → paket → servis → (chevron ile) metodlar.
 *
 * Etkileşim:
 * - Chevron → sadece metod listesini aç/kapa (seçim yok)
 * - Servis adı → pivot seçer
 * - Metod satırı → method odak + method haritası
 * - Arama / dış seçim → ataların açılması + satırın görünmesi
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
} from 'react'
import { createPortal } from 'react-dom'
import {
  getModuleChildren,
  getNonServiceMethods,
  getServiceTreePath,
  listMethodsForService,
} from '../api/client'
import type { MethodRef, ModuleNode } from '../types'
import { MotionTooltip } from '../motion/MotionTooltip'
import { SkeletonShimmer } from '../motion/SkeletonShimmer'
import { TreeAccordion } from '../motion/TreeAccordion'

const TIP_DELAY_MS = 1000

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

type TreeTipContextValue = {
  showTip: (text: string, anchor: HTMLElement) => void
  hideTip: () => void
}

type TreeHydrationContextValue = {
  childMap: Map<string, ModuleNode[]>
  registerChildren: (nodeId: string, children: ModuleNode[]) => void
  showNonServiceMethods: boolean
}

const TreeTipContext = createContext<TreeTipContextValue | null>(null)
const TreeHydrationContext = createContext<TreeHydrationContextValue | null>(null)

function useTreeTipHandlers(text: string) {
  const ctx = useContext(TreeTipContext)
  return {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      if (!ctx) return
      const label = e.currentTarget.querySelector('.tree-label') as HTMLElement | null
      const anchor = label ?? e.currentTarget
      const truncated =
        Boolean(label && label.scrollWidth > label.clientWidth + 1)
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
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}

function childrenOf(
  node: ModuleNode,
  childMap: Map<string, ModuleNode[]>,
): ModuleNode[] | undefined {
  return childMap.get(node.id) ?? node.children
}

/** Seçili servise giden atalar (yüklü çocuklar dahil). */
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
        data-motion="method-skeleton"
      >
        <SkeletonShimmer lines={2} />
      </div>
    )
  }
  if (methods.length === 0) {
    return (
      <p className="tree-method-status" style={{ paddingLeft: 8 + depth * 12 }}>
        Method yok
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

function TreeItem({
  node,
  depth,
  revealIds,
  followGen,
  selectedServiceId,
  selectedMethodId,
  onSelectService,
  onSelectMethod,
}: {
  node: ModuleNode
  depth: number
  revealIds: Set<string>
  followGen: number
  selectedServiceId?: string
  selectedMethodId?: string
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const hydration = useContext(TreeHydrationContext)
  const childMap = hydration?.childMap ?? new Map<string, ModuleNode[]>()
  const registerChildren = hydration?.registerChildren
  const showNonServiceMethods = hydration?.showNonServiceMethods ?? false

  const isService = node.kind === 'service'
  const resolvedChildren = childrenOf(node, childMap)
  const hasResolvedChildren = !!resolvedChildren?.length
  const canExpandLazy = Boolean(node.hasChildren && !hasResolvedChildren)
  const canExpand = hasResolvedChildren || canExpandLazy || isService
  const [open, setOpen] = useState(() => revealIds.has(node.id))
  const [loadingChildren, setLoadingChildren] = useState(false)
  const selected =
    isService &&
    node.serviceId === selectedServiceId &&
    !selectedMethodId
  const rowRef = useRef<HTMLDivElement>(null)
  const tipHandlers = useTreeTipHandlers(node.name)

  useEffect(() => {
    if (followGen > 0 && revealIds.has(node.id)) setOpen(true)
  }, [followGen, node.id])

  useLayoutEffect(() => {
    if (!selected || followGen === 0) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected, followGen])

  const loadChildren = async () => {
    if (!canExpandLazy || hasResolvedChildren) return
    setLoadingChildren(true)
    try {
      const children = await getModuleChildren(node.id)
      registerChildren?.(node.id, children)
    } catch {
      registerChildren?.(node.id, [])
    } finally {
      setLoadingChildren(false)
    }
  }

  const toggleOpen = () => {
    void (async () => {
      if (open) {
        setOpen(false)
        return
      }
      setOpen(true)
      await loadChildren()
    })()
  }

  const showChildBranch = open && (hasResolvedChildren || loadingChildren)

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
        </button>
      </div>
      <TreeAccordion open={showChildBranch}>
        {loadingChildren ? (
          <div className="tree-item" style={{ paddingLeft: 8 + (depth + 1) * 12 }}>
            <SkeletonShimmer className="tree-row skeleton" lines={1} />
          </div>
        ) : hasResolvedChildren ? (
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
  onSelectService,
  onSelectMethod,
}: Props) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [childMap, setChildMap] = useState<Map<string, ModuleNode[]>>(() => new Map())
  const [hydrateRevealIds, setHydrateRevealIds] = useState<Set<string>>(() => new Set())
  const [followGen, setFollowGen] = useState(0)
  const [showNonServiceMethods, setShowNonServiceMethods] = useState(false)
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)

  const registerChildren = useCallback((nodeId: string, children: ModuleNode[]) => {
    setChildMap((prev) => {
      if (prev.get(nodeId) === children) return prev
      const next = new Map(prev)
      next.set(nodeId, children)
      return next
    })
  }, [])

  const hydrationContext = useMemo<TreeHydrationContextValue>(
    () => ({ childMap, registerChildren, showNonServiceMethods }),
    [childMap, registerChildren, showNonServiceMethods],
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
        const opens = new Set<string>()
        for (let i = 0; i < path.length - 1; i++) {
          const seg = path[i]
          opens.add(seg.id)
          const kids = await getModuleChildren(seg.id)
          nextMap.set(seg.id, kids)
        }
        const leaf = path[path.length - 1]
        if (selectedMethodId && leaf?.kind === 'service') {
          opens.add(leaf.id)
        }
        if (!cancelled) {
          if (nextMap.size > 0) {
            setChildMap((prev) => new Map([...prev, ...nextMap]))
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
        <nav className="module-tree" aria-label="Modül ağacı">
          {nodes.map((n) => (
            <TreeItem
              key={n.id}
              node={n}
              depth={0}
              revealIds={revealIds}
              followGen={followGen}
              selectedServiceId={selectedServiceId}
              selectedMethodId={selectedMethodId}
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
