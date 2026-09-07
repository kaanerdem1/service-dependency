import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { layoutSpring } from '../motion/config'
import { TreeKindIcon } from './TreeKindIcon'
import { FOLDER_MIME, STEP_MIME, beginWorkflowDrag, endWorkflowDrag, type WorkflowStep } from '../workflowStore'

type Props = {
  folderId?: string
  steps: WorkflowStep[]
  variant: 'drawer' | 'info'
  onPlace: (stepId: string, folderId: string | undefined, index: number) => void
  onSelect: (serviceId: string) => void
  onRemove?: (stepId: string) => void
  focusServiceId?: string
  afterRow?: (step: WorkflowStep, index: number) => ReactNode
}

function parseStepId(e: ReactDragEvent): string | undefined {
  const custom = e.dataTransfer.getData(STEP_MIME)
  if (custom) return custom
  const raw = e.dataTransfer.getData('text/plain')
  if (raw.startsWith('step:')) return raw.slice(5)
  if (raw.startsWith('folder:')) return undefined
  return raw || undefined
}

function isStepDrag(e: ReactDragEvent) {
  const types = [...e.dataTransfer.types].map((t) => t.toLowerCase())
  if (types.includes(FOLDER_MIME)) return false
  return (
    types.includes(STEP_MIME) ||
    types.includes('text/plain') ||
    types.includes('text')
  )
}

export function WorkflowStepReorder({
  folderId,
  steps,
  variant,
  onPlace,
  onSelect,
  onRemove,
  focusServiceId,
  afterRow,
}: Props) {
  const [dragId, setDragId] = useState<string>()
  const [insertAt, setInsertAt] = useState<number>()
  const listRef = useRef<HTMLDivElement>(null)
  const info = variant === 'info'

  const clearDrag = () => {
    endWorkflowDrag()
    setDragId(undefined)
    setInsertAt(undefined)
  }

  useEffect(() => {
    window.addEventListener('dragend', clearDrag)
    return () => window.removeEventListener('dragend', clearDrag)
  }, [])

  const dragged = dragId ? steps.find((s) => s.id === dragId) : undefined
  const others = dragId ? steps.filter((s) => s.id !== dragId) : steps
  const slot = insertAt ?? others.length
  const shown: WorkflowStep[] =
    dragged && insertAt != null
      ? [...others.slice(0, slot), dragged, ...others.slice(slot)]
      : steps

  const hoverIndex = (clientY: number, overId: string) => {
    const over = others.findIndex((s) => s.id === overId)
    if (over < 0) return
    const el = listRef.current?.querySelector(`[data-step-id="${overId}"]`)
    const rect = el?.getBoundingClientRect()
    const after = rect ? clientY > rect.top + rect.height / 2 : false
    setInsertAt(after ? over + 1 : over)
  }

  const finish = (e: ReactDragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const id = parseStepId(e) ?? dragId
    const index = insertAt
    clearDrag()
    if (!id || index == null) return
    onPlace(id, folderId, index)
  }

  return (
    <div
      ref={listRef}
      className={`wf-reorder${info ? ' is-info' : ' is-drawer'}${dragId ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        if (!isStepDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={finish}
    >
      {shown.map((item, index) => {
        const lifting = dragId === item.id
        return (
          <motion.div
            key={item.id}
            layout
            transition={layoutSpring}
            className={`wf-reorder-item${lifting ? ' is-lifted' : ''}`}
          >
            <div
              data-step-id={item.id}
              draggable
              className={`wf-reorder-row${info ? ' is-info' : ''}${focusServiceId === item.serviceId ? ' is-focus' : ''}`}
              onDragStart={(e) => {
                beginWorkflowDrag('step')
                e.dataTransfer.setData(STEP_MIME, item.id)
                e.dataTransfer.setData('text/plain', `step:${item.id}`)
                e.dataTransfer.effectAllowed = 'move'
                setDragId(item.id)
                setInsertAt(steps.findIndex((s) => s.id === item.id))
              }}
              onDragEnd={clearDrag}
              onDragOver={(e) => {
                if (!isStepDrag(e)) return
                e.preventDefault()
                e.stopPropagation()
                if (!dragId) {
                  const id = parseStepId(e)
                  if (id) setDragId(id)
                }
                hoverIndex(e.clientY, item.id)
              }}
              onDrop={finish}
            >
              <span className="sc-drag-handle" aria-hidden title="Sıralamak için sürükle">
                ⋮⋮
              </span>
              <span className="wf-step-index">{index + 1}</span>
              <button
                type="button"
                className={info ? 'wf-info-service-main' : 'sc-row-main'}
                title={item.canonicalName}
                onClick={() => onSelect(item.serviceId)}
              >
                <TreeKindIcon kind="service" size={info ? 16 : 14} />
                <span className={info ? 'wf-info-service-name' : 'sc-row-alias'}>
                  {item.canonicalName}
                </span>
                {info ? <span className="wf-info-service-go">Aç</span> : null}
              </button>
              {onRemove ? (
                <button
                  type="button"
                  className="sc-icon-btn sc-icon-btn-danger"
                  title="Akıştan kaldır"
                  aria-label="Akıştan kaldır"
                  onClick={() => onRemove(item.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
            {afterRow && !lifting ? afterRow(item, index) : null}
          </motion.div>
        )
      })}
    </div>
  )
}
