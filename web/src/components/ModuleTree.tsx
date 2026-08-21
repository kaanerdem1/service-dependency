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
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { listMethodsForService } from '../api/client'
import type { MethodRef, ModuleNode } from '../types'
import { MotionTooltip } from '../motion/MotionTooltip'
import { TreeAccordion } from '../motion/TreeAccordion'

const TIP_DELAY_MS = 1000

const KIND_LABEL: Record<ModuleNode['kind'], string> = {
  project: 'proje',
  package: 'jar',
  service: 'servis',
  method: 'method',
}

const KIND_INITIAL: Record<ModuleNode['kind'], string> = {
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

const TreeTipContext = createContext<TreeTipContextValue | null>(null)

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

/** Seçili servise (ve method varsa servise) giden ataları aç. */
function revealAncestorIds(
  nodes: ModuleNode[],
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
    for (const child of node.children ?? []) {
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
      <p className="tree-method-status" style={{ paddingLeft: 8 + depth * 12 }}>
        Methods…
      </p>
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

function TreeItem({
  node,
  depth,
  revealIds,
  selectedServiceId,
  selectedMethodId,
  onSelectService,
  onSelectMethod,
}: {
  node: ModuleNode
  depth: number
  revealIds: Set<string>
  selectedServiceId?: string
  selectedMethodId?: string
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const isService = node.kind === 'service'
  const hasStaticChildren = !!node.children?.length
  const canExpand = hasStaticChildren || isService
  const [open, setOpen] = useState(
    () => (depth < 2 && !isService) || revealIds.has(node.id),
  )
  const selected =
    isService &&
    node.serviceId === selectedServiceId &&
    !selectedMethodId
  const rowRef = useRef<HTMLDivElement>(null)
  const tipHandlers = useTreeTipHandlers(node.name)

  useEffect(() => {
    if (revealIds.has(node.id)) setOpen(true)
  }, [revealIds, node.id])

  useLayoutEffect(() => {
    if (!selected) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

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
            onClick={() => setOpen((v) => !v)}
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
            if (canExpand) setOpen((v) => !v)
          }}
        >
          <span className="tree-label">{node.name}</span>
        </button>
      </div>
      <TreeAccordion open={open && hasStaticChildren}>
        {hasStaticChildren
          ? node.children!.map((child) => (
              <TreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                revealIds={revealIds}
                selectedServiceId={selectedServiceId}
                selectedMethodId={selectedMethodId}
                onSelectService={onSelectService}
                onSelectMethod={onSelectMethod}
              />
            ))
          : null}
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
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)

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

  const revealIds = useMemo(
    () => revealAncestorIds(nodes, selectedServiceId, selectedMethodId),
    [nodes, selectedServiceId, selectedMethodId],
  )

  useEffect(() => {
    if (!selectedServiceId) return
    const sel = selectedMethodId
      ? `[data-tree-method="${CSS.escape(selectedMethodId)}"]`
      : `[data-tree-service="${CSS.escape(selectedServiceId)}"]`
    const t = window.setTimeout(() => {
      document.querySelector(sel)?.scrollIntoView({ block: 'nearest' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [selectedServiceId, selectedMethodId, revealIds])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return (
    <TreeTipContext.Provider value={tipContext}>
      <nav className="module-tree" aria-label="Modül ağacı">
        {nodes.map((n) => (
          <TreeItem
            key={n.id}
            node={n}
            depth={0}
            revealIds={revealIds}
            selectedServiceId={selectedServiceId}
            selectedMethodId={selectedMethodId}
            onSelectService={onSelectService}
            onSelectMethod={onSelectMethod}
          />
        ))}
      </nav>
      <TreeHoverTipPortal tip={tip} />
    </TreeTipContext.Provider>
  )
}
