import { useEffect, useState } from 'react'
import { MotionPopover } from '../motion/MotionPopover'
import {
  WORKFLOWS_CHANGED_EVENT,
  readWorkflows,
  workflowsForService,
  type ServiceWorkflowHit,
} from '../workflowStore'
import { WorkflowFolderGlyph } from './WorkflowIcons'

type Props = {
  serviceId: string
  onOpenFlow: (folderId: string) => void
  onOpenRoot: () => void
}

export function ServiceWorkflowChip({ serviceId, onOpenFlow, onOpenRoot }: Props) {
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<ServiceWorkflowHit[]>(() =>
    workflowsForService(serviceId),
  )

  useEffect(() => {
    const refresh = () => setHits(workflowsForService(serviceId, readWorkflows()))
    refresh()
    window.addEventListener(WORKFLOWS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(WORKFLOWS_CHANGED_EVENT, refresh)
  }, [serviceId])

  if (hits.length === 0) return null

  return (
    <MotionPopover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      label="Bu servisin akışları"
      className="stage-wf-chip"
      panelClassName="stage-wf-chip-panel"
      trigger={
        <button
          type="button"
          className={`stage-wf-chip-btn${open ? ' is-open' : ''}`}
          aria-expanded={open}
          title="Bu servisin geçtiği iş akışları"
          onClick={() => setOpen((v) => !v)}
        >
          <WorkflowFolderGlyph size={11} />
          <span>{hits.length === 1 ? '1 akış' : `${hits.length} akış`}</span>
        </button>
      }
    >
      <ul className="stage-wf-chip-list">
        {hits.map((hit) => (
          <li key={hit.folderId ?? 'root'}>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                if (hit.folderId) onOpenFlow(hit.folderId)
                else onOpenRoot()
              }}
            >
              <strong>{hit.name}</strong>
              {hit.path !== hit.name ? <span>{hit.path}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </MotionPopover>
  )
}
