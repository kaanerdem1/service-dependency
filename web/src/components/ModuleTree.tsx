/**
 * Sol modül ağacı: proje → paket → servis → (chevron ile) metodlar.
 *
 * Etkileşim:
 * - Chevron → sadece metod listesini aç/kapa (seçim yok)
 * - Servis adı → pivot seçer
 * - Metod satırı → method odak + method haritası
 * - Arama / dış seçim → ataların açılması + satırın görünmesi
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listMethodsForService } from '../api/client'
import type { MethodRef, ModuleNode } from '../types'

const KIND_LABEL: Record<ModuleNode['kind'], string> = {
  project: 'proje',
  package: 'paket',
  service: 'servis',
  method: 'method',
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
        return (
          <div key={m.id} className="tree-item">
            <button
              type="button"
              className={`tree-row ${selected ? 'selected' : ''} kind-method`}
              style={{ paddingLeft: 8 + depth * 12 }}
              data-tree-method={m.id}
              onClick={() => onSelectMethod(serviceId, m.id)}
            >
              <span className="chev spacer" />
              <span className="tree-label" title={`${m.className}.${m.name}`}>
                <span className="tree-method-class">{m.className}.</span>
                {m.name}
              </span>
              <span className="tree-kind">{KIND_LABEL.method}</span>
            </button>
          </div>
        )
      })}
    </>
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
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="chev spacer" />
        )}
        <button
          type="button"
          className="tree-label-btn"
          onClick={() => {
            if (isService && node.serviceId) {
              onSelectService(node.serviceId)
              return
            }
            if (canExpand) setOpen((v) => !v)
          }}
        >
          <span className="tree-label" title={node.name}>
            {node.name}
          </span>
        </button>
          <span className="tree-kind">{KIND_LABEL[node.kind]}</span>
      </div>
      {open &&
        hasStaticChildren &&
        node.children!.map((child) => (
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
        ))}
      {open && isService && node.serviceId && (
        <MethodLeaves
          serviceId={node.serviceId}
          selectedMethodId={
            selectedServiceId === node.serviceId ? selectedMethodId : undefined
          }
          depth={depth + 1}
          onSelectMethod={onSelectMethod}
        />
      )}
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

  return (
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
  )
}
