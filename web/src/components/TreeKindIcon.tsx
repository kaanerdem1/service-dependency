import type { ReactNode } from 'react'
import type { ModuleNode } from '../types'

type Kind = ModuleNode['kind'] | 'group' | 'package' | 'service' | 'method'

type Props = {
  kind: Kind
  size?: number
  className?: string
  title?: string
}

/** Flat stroke icons — Lucide tarzı (folder / package / layers / braces) */
export function TreeKindIcon({ kind, size = 14, className, title }: Props) {
  const resolved = kind === 'project' ? 'group' : kind
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    className: `tree-kind-icon tree-kind-icon--${resolved}${className ? ` ${className}` : ''}`,
  }

  let paths: ReactNode
  switch (resolved) {
    case 'group':
      // folder
      paths = (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </>
      )
      break
    case 'package':
      // package
      paths = (
        <>
          <path d="M16.5 9.4 7.55 4.24" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.29 7 12 12l8.71-5" />
          <path d="M12 22V12" />
        </>
      )
      break
    case 'service':
      // layers
      paths = (
        <>
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 12.57-8.58 3.91a2 2 0 0 1-1.66 0L3.18 12.57" />
          <path d="m22 17.57-8.58 3.91a2 2 0 0 1-1.66 0L3.18 17.57" />
        </>
      )
      break
    case 'method':
    default:
      // braces — kod metodu
      paths = (
        <>
          <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
          <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
        </>
      )
      break
  }

  return (
    <span className={`tree-kind-wrap is-${resolved}`} title={title}>
      <svg {...common}>{paths}</svg>
    </span>
  )
}

export const TREE_KIND_ICON_SET = [
  { kind: 'group' as const, label: 'Grup', source: 'Lucide folder' },
  { kind: 'package' as const, label: 'Jar', source: 'Lucide package' },
  { kind: 'service' as const, label: 'Servis', source: 'Lucide layers' },
  { kind: 'method' as const, label: 'Metod', source: 'Lucide braces' },
]
