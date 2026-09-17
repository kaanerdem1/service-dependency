import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { layoutSpring } from '../../motion/config'
import { TreeKindIcon } from '../sidebar/TreeKindIcon'
import {
  FOLDER_MIME,
  STEP_MIME,
  beginWorkflowDrag,
  endWorkflowDrag,
  type WorkflowFolder,
  type WorkflowSequenceItem,
} from '../../stores/workflowStore'

type Props = {
  parentId?: string
  items: WorkflowSequenceItem[]
  variant: 'drawer' | 'info'
  onPlaceStep: (stepId: string, folderId: string | undefined, index: number) => void
  onPlaceFolder: (folderId: string, parentId: string | undefined, index: number) => void
  onSelect: (serviceId: string) => void
  onRemove?: (stepId: string) => void
  focusServiceId?: string
  afterRow?: (item: WorkflowSequenceItem, index: number) => ReactNode
  renderFolder: (folder: WorkflowFolder, index: number) => ReactNode
  readOnly?: boolean
}

function isSequenceDrag(e: ReactDragEvent) {
  const types = [...e.dataTransfer.types].map((t) => t.toLowerCase())
  return (
    types.includes(STEP_MIME) ||
    types.includes(FOLDER_MIME) ||
    types.includes('text/plain') ||
    types.includes('text')
  )
}

function parseSequenceId(e: ReactDragEvent): string | undefined {
  const folderId = e.dataTransfer.getData(FOLDER_MIME)
  if (folderId) return folderId
  const stepId = e.dataTransfer.getData(STEP_MIME)
  if (stepId) return stepId
  const raw = e.dataTransfer.getData('text/plain')
  if (raw.startsWith('step:')) return raw.slice(5)
  if (raw.startsWith('folder:')) return raw.slice(7)
  return raw || undefined
}

export function WorkflowStepReorder({
  parentId,
  items,
  variant,
  onPlaceStep,
  onPlaceFolder,
  onSelect,
  onRemove,
  focusServiceId,
  afterRow,
  renderFolder,
  readOnly = false,
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

  const dragged = dragId ? items.find((it) => it.id === dragId) : undefined
  const others = dragId ? items.filter((it) => it.id !== dragId) : items
  const slot = insertAt ?? others.length
  const shown: WorkflowSequenceItem[] =
    dragged && insertAt != null
      ? [...others.slice(0, slot), dragged, ...others.slice(slot)]
      : items

  const hoverIndex = (clientY: number, overId: string) => {
    const over = others.findIndex((it) => it.id === overId)
    if (over < 0) return
    const el = listRef.current?.querySelector(`[data-seq-id="${overId}"]`)
    const rect = el?.getBoundingClientRect()
    const after = rect ? clientY > rect.top + rect.height / 2 : false
    setInsertAt(after ? over + 1 : over)
  }

  const finish = (e: ReactDragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (readOnly) return
    const folderDragId = e.dataTransfer.getData(FOLDER_MIME)
    const stepRaw = e.dataTransfer.getData(STEP_MIME) || e.dataTransfer.getData('text/plain')
    const index = insertAt
    clearDrag()
    if (index == null) return
    if (folderDragId) {
      onPlaceFolder(folderDragId, parentId, index)
      return
    }
    if (!stepRaw || stepRaw.startsWith('folder:')) return
    const stepId = stepRaw.startsWith('step:') ? stepRaw.slice(5) : stepRaw
    if (stepId) onPlaceStep(stepId, parentId, index)
  }

  return (
    <div
      ref={listRef}
      className={`wf-reorder${info ? ' is-info' : ' is-drawer'}${dragId ? ' is-dragging' : ''}${readOnly ? ' is-readonly' : ''}`}
      onDragOver={(e) => {
        if (readOnly || !isSequenceDrag(e)) return
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
              data-seq-id={item.id}
              className={`wf-reorder-slot${item.kind === 'folder' ? ' is-folder' : ''}`}
              onDragStart={() => {
                if (readOnly) return
                setDragId(item.id)
                setInsertAt(items.findIndex((it) => it.id === item.id))
              }}
              onDragEnd={clearDrag}
              onDragOver={(e) => {
                if (readOnly || !isSequenceDrag(e)) return
                e.preventDefault()
                e.stopPropagation()
                if (!dragId) {
                  const id = parseSequenceId(e)
                  if (id) setDragId(id)
                }
                hoverIndex(e.clientY, item.id)
              }}
              onDrop={finish}
            >
              {item.kind === 'step' ? (
                <div
                  draggable={!readOnly}
                  className={`wf-reorder-row${info ? ' is-info' : ''}${focusServiceId === item.step.serviceId ? ' is-focus' : ''}${readOnly ? ' is-readonly' : ''}`}
                  onDragStart={(e) => {
                    if (readOnly) {
                      e.preventDefault()
                      return
                    }
                    beginWorkflowDrag('step')
                    e.dataTransfer.setData(STEP_MIME, item.id)
                    e.dataTransfer.setData('text/plain', `step:${item.id}`)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={clearDrag}
                >
                  {readOnly ? null : (
                    <span className="sc-drag-handle" aria-hidden title="Sıralamak için sürükle">
                      ⋮⋮
                    </span>
                  )}
                  {info ? <span className="wf-step-index">{index + 1}</span> : null}
                  <button
                    type="button"
                    className={info ? 'wf-info-service-main' : 'sc-row-main'}
                    title={item.step.canonicalName}
                    onClick={() => onSelect(item.step.serviceId)}
                  >
                    <TreeKindIcon kind="service" size={info ? 16 : 14} />
                    <span className={info ? 'wf-info-service-name' : 'sc-row-alias'}>
                      {item.step.canonicalName}
                    </span>
                    {info ? <span className="wf-info-service-go">Aç</span> : null}
                  </button>
                  {onRemove && !readOnly ? (
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
              ) : (
                renderFolder(item.folder, index)
              )}
            </div>
            {afterRow && !lifting ? afterRow(item, index) : null}
          </motion.div>
        )
      })}
    </div>
  )
}
