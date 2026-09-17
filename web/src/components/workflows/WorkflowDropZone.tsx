/**
 * İş akışı drawer sürükle-bırak hedefi.
 *
 * Ne yapar: Adım veya klasör bırakılınca `onDropStep` / `onDropFolder` çağırır.
 * Ne yapmaz: Store yazmaz — taşıma `WorkflowsPanel` içindeki callback’lerde.
 * İlgili: docs/refactor-plan.md — Faz 2.
 */
import { useCallback, useEffect, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import {
  FOLDER_MIME,
  STEP_MIME,
  endWorkflowDrag,
  peekWorkflowDrag,
} from '../../workflowStore'

function isWorkflowDrag(e: ReactDragEvent) {
  const types = [...e.dataTransfer.types].map((t) => t.toLowerCase())
  return (
    types.includes(STEP_MIME) ||
    types.includes(FOLDER_MIME) ||
    types.includes('text/plain') ||
    types.includes('text')
  )
}

export function DropZone({
  folderId,
  children,
  acceptSteps = true,
  acceptFolders = true,
  locked = false,
  onDropStep,
  onDropFolder,
}: {
  folderId?: string
  children: ReactNode
  acceptSteps?: boolean
  acceptFolders?: boolean
  locked?: boolean
  onDropStep: (stepId: string, folderId?: string) => void
  onDropFolder?: (dragFolderId: string, folderId?: string) => void
}) {
  const [over, setOver] = useState(false)

  const reset = useCallback(() => setOver(false), [])

  const allowsCurrent = () => {
    if (locked) return false
    const kind = peekWorkflowDrag()
    if (kind === 'step') return acceptSteps
    if (kind === 'folder') return acceptFolders
    return acceptSteps || acceptFolders
  }

  useEffect(() => {
    const clear = () => reset()
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [reset])

  return (
    <div
      className={`sc-drop-zone${over ? ' is-over' : ''}`}
      onDragEnter={(e) => {
        if (!isWorkflowDrag(e) || !allowsCurrent()) return
        e.preventDefault()
        e.stopPropagation()
        const t = e.target
        if (t instanceof Element && (t.closest('.wf-reorder-row') || t.closest('.sc-folder-body'))) {
          return
        }
        setOver(true)
      }}
      onDragOver={(e) => {
        if (!isWorkflowDrag(e) || !allowsCurrent()) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragLeave={(e) => {
        e.stopPropagation()
        const next = e.relatedTarget as Node | null
        if (next && e.currentTarget.contains(next)) return
        setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const allowed = allowsCurrent()
        setOver(false)
        if (!allowed) {
          endWorkflowDrag()
          return
        }
        const folderDrag = e.dataTransfer.getData(FOLDER_MIME)
        const raw = e.dataTransfer.getData(STEP_MIME) || e.dataTransfer.getData('text/plain')
        endWorkflowDrag()
        if (folderDrag) {
          if (acceptFolders) onDropFolder?.(folderDrag, folderId)
          return
        }
        if (raw.startsWith('folder:')) {
          if (acceptFolders) onDropFolder?.(raw.slice(7), folderId)
          return
        }
        const stepId = raw.startsWith('step:') ? raw.slice(5) : raw
        if (stepId && acceptSteps) onDropStep(stepId, folderId)
      }}
    >
      {children}
    </div>
  )
}
