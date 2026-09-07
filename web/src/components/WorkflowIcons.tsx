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
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="6" cy="6" r="2.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="18" r="2.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="6" r="2.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 8.2v7.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.2 6h5.2a4.6 4.6 0 0 1 4.6 4.6V18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
