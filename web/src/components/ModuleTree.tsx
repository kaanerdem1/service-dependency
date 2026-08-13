import { useEffect, useState } from 'react'
import { listMethodsForService } from '../api/client'
import type { MethodRef, ModuleNode } from '../types'

type Props = {
  nodes: ModuleNode[]
  selectedServiceId?: string
  selectedMethodId?: string
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
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
              title={`${m.className}.${m.name}${m.signature}`}
              onClick={() => onSelectMethod(serviceId, m.id)}
            >
              <span className="chev spacer" />
              <span className="tree-label">
                <span className="tree-method-class">{m.className}.</span>
                {m.name}
              </span>
              <span className="tree-kind">method</span>
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
  selectedServiceId,
  selectedMethodId,
  onSelectService,
  onSelectMethod,
}: {
  node: ModuleNode
  depth: number
  selectedServiceId?: string
  selectedMethodId?: string
  onSelectService: (serviceId: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
}) {
  const isService = node.kind === 'service'
  const hasStaticChildren = !!node.children?.length
  const canExpand = hasStaticChildren || isService
  const [open, setOpen] = useState(depth < 2)
  const selected =
    isService &&
    node.serviceId === selectedServiceId &&
    !selectedMethodId

  return (
    <div className="tree-item">
      <button
        type="button"
        className={`tree-row ${selected ? 'selected' : ''} kind-${node.kind}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (isService && node.serviceId) {
            onSelectService(node.serviceId)
            if (!open) setOpen(true)
            return
          }
          if (canExpand) setOpen((v) => !v)
        }}
      >
        {canExpand && <span className="chev">{open ? '▾' : '▸'}</span>}
        {!canExpand && <span className="chev spacer" />}
        <span className="tree-label">{node.name}</span>
        <span className="tree-kind">{node.kind}</span>
      </button>
      {open &&
        hasStaticChildren &&
        node.children!.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
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
  return (
    <nav className="module-tree" aria-label="Modül ağacı">
      {nodes.map((n) => (
        <TreeItem
          key={n.id}
          node={n}
          depth={0}
          selectedServiceId={selectedServiceId}
          selectedMethodId={selectedMethodId}
          onSelectService={onSelectService}
          onSelectMethod={onSelectMethod}
        />
      ))}
    </nav>
  )
}
