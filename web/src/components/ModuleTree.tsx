import { useState } from 'react'
import type { ModuleNode } from '../types'

type Props = {
  nodes: ModuleNode[]
  selectedServiceId?: string
  onSelectService: (serviceId: string) => void
}

function TreeItem({
  node,
  depth,
  selectedServiceId,
  onSelectService,
}: {
  node: ModuleNode
  depth: number
  selectedServiceId?: string
  onSelectService: (serviceId: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = !!node.children?.length
  const isService = node.kind === 'service'
  const selected = isService && node.serviceId === selectedServiceId

  return (
    <div className="tree-item">
      <button
        type="button"
        className={`tree-row ${selected ? 'selected' : ''} kind-${node.kind}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (isService && node.serviceId) onSelectService(node.serviceId)
          else if (hasChildren) setOpen((v) => !v)
        }}
      >
        {hasChildren && <span className="chev">{open ? '▾' : '▸'}</span>}
        {!hasChildren && <span className="chev spacer" />}
        <span className="tree-label">{node.name}</span>
        <span className="tree-kind">{node.kind}</span>
      </button>
      {open &&
        hasChildren &&
        node.children!.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedServiceId={selectedServiceId}
            onSelectService={onSelectService}
          />
        ))}
    </div>
  )
}

export function ModuleTree({ nodes, selectedServiceId, onSelectService }: Props) {
  return (
    <nav className="module-tree" aria-label="Modül ağacı">
      {nodes.map((n) => (
        <TreeItem
          key={n.id}
          node={n}
          depth={0}
          selectedServiceId={selectedServiceId}
          onSelectService={onSelectService}
        />
      ))}
    </nav>
  )
}
