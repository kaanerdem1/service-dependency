import { TreeKindIcon } from './TreeKindIcon'
import type { WorkflowFolderIcon } from '../workflowStore'

export function WorkflowFolderGlyph({
  icon = 'flow',
  size = 14,
}: {
  icon?: WorkflowFolderIcon
  size?: number
}) {
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
  }
  if (icon === 'folder') {
    return <TreeKindIcon kind="group" size={size} />
  }
  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="2.1" />
      <circle cx="6" cy="18" r="2.1" />
      <circle cx="18" cy="6" r="2.1" />
      <path d="M6 8.1v7.8" />
      <path d="M8.1 6h5.1a4.8 4.8 0 0 1 4.8 4.8V18" />
    </svg>
  )
}

export function GitBranchIcon({ filled }: { filled?: boolean }) {
  const sw = filled ? 1.5 : 1.35
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <circle
        cx="6"
        cy="6"
        r="2.15"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={sw}
      />
      <circle
        cx="6"
        cy="18"
        r="2.15"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={sw}
      />
      <circle
        cx="18"
        cy="6"
        r="2.15"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={sw}
      />
      <path d="M6 8.15v7.7" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <path
        d="M8.15 6h5.15a4.55 4.55 0 0 1 4.55 4.55V18"
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
