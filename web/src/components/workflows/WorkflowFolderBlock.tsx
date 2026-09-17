/**
 * Akış takibi klasör/akış düğümü (ağaç satırı + iç içe çocuklar).
 *
 * Ne yapar: Klasör başlığı, yeniden adlandırma, sürükle-bırak, alt adımlar.
 * Ne yapmaz: localStorage yazmaz; tüm mutasyonlar üstten callback.
 * İlgili: workflows/rehber.md
 */
import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import { WorkflowFolderGlyph } from '../workflow-stage/WorkflowIcons'
import { WorkflowStepReorder } from '../workflow-stage/WorkflowStepReorder'
import {
  FOLDER_MIME,
  beginWorkflowDrag,
  canNestUnder,
  endWorkflowDrag,
  folderAcceptsSteps,
  pureOrganizerChildren,
  sequenceInFolder,
  type WorkflowFolder,
  type WorkflowsStore,
} from '../../stores/workflowStore'
import { DropZone } from './WorkflowDropZone'

function InlineRename({
  value,
  onCommit,
  onCancel,
  className,
  ariaLabel,
}: {
  value: string
  onCommit: (next: string) => void
  onCancel: () => void
  className?: string
  ariaLabel: string
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [value])

  return (
    <input
      ref={inputRef}
      type="text"
      className={className ?? 'sc-inline-rename'}
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          onCommit(draft)
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        }
      }}
      onBlur={() => onCommit(draft)}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

export function FolderBlock({
  folder,
  store,
  nested,
  depth = 0,
  selectedFolderId,
  expandedFolders,
  focusServiceId,
  onSelectFolder,
  onToggle,
  onRename,
  onDelete,
  onAddChild,
  onSelectService,
  onRemove,
  onMove,
  onMoveFolder,
  onPlaceStep,
  onPlaceFolder,
  onOpenInfo,
  editingFolderId,
  onStartEdit,
  onStopEdit,
  canEdit = true,
}: {
  folder: WorkflowFolder
  store: WorkflowsStore
  nested?: boolean
  depth?: number
  selectedFolderId?: string
  expandedFolders: Set<string>
  focusServiceId?: string
  onSelectFolder: (id: string) => void
  onToggle: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAddChild: (parentId: string) => void
  onSelectService: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, folderId?: string) => void
  onMoveFolder: (dragId: string, folderId?: string) => void
  onPlaceStep: (stepId: string, folderId: string | undefined, index: number) => void
  onPlaceFolder: (folderId: string, parentId: string | undefined, index: number) => void
  onOpenInfo: (id: string) => void
  editingFolderId?: string
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  canEdit?: boolean
}) {
  const editing = editingFolderId === folder.id
  const sequence = sequenceInFolder(store, folder.id)
  const organizerKids = pureOrganizerChildren(store, folder.id)
  const collapsed = !expandedFolders.has(folder.id)
  const selected = selectedFolderId === folder.id
  const allowChild = canNestUnder(store, folder.id)
  const organizer = !folderAcceptsSteps(store, folder)

  const onFolderDragStart = (e: ReactDragEvent) => {
    beginWorkflowDrag('folder')
    e.dataTransfer.setData(FOLDER_MIME, folder.id)
    e.dataTransfer.setData('text/plain', `folder:${folder.id}`)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <section
      className={`sc-folder${nested ? ' is-nested' : ''}${organizer ? ' is-organizer' : ' is-flow'}${selected ? ' is-selected' : ''}`}
      style={{ ['--wf-depth' as string]: String(depth) }}
    >
      <DropZone
        folderId={folder.id}
        acceptSteps={!organizer}
        locked={!canEdit}
        onDropStep={onMove}
        onDropFolder={onMoveFolder}
      >
        <div
          className="sc-folder-head"
          draggable={canEdit}
          onDragStart={canEdit ? onFolderDragStart : undefined}
          onDragEnd={canEdit ? () => endWorkflowDrag() : undefined}
        >
          <button
            type="button"
            className="sc-folder-chev-btn"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Klasörü aç' : 'Klasörü daralt'}
            onClick={() => onToggle(folder.id)}
          >
            <span className="sc-folder-chev">{collapsed ? '▸' : '▾'}</span>
          </button>
          <button
            type="button"
            className="sc-folder-toggle"
            title="Bilgi sayfasını aç"
            onClick={() => {
              onSelectFolder(folder.id)
              onOpenInfo(folder.id)
            }}
          >
            {canEdit ? (
              <span className="sc-drag-handle" aria-hidden>
                ⋮⋮
              </span>
            ) : null}
            <WorkflowFolderGlyph icon={folder.icon ?? 'flow'} size={14} />
            {editing ? (
              <InlineRename
                value={folder.name}
                ariaLabel="Akış adı"
                className="sc-inline-rename sc-inline-rename-folder"
                onCommit={(next) => {
                  onRename(folder.id, next)
                  onStopEdit()
                }}
                onCancel={onStopEdit}
              />
            ) : (
              <span className="sc-folder-name">{folder.name}</span>
            )}
          </button>
          {canEdit ? (
          <div className="sc-folder-actions">
            {allowChild ? (
              <button
                type="button"
                className="sc-icon-btn"
                title="Alt akış ekle"
                aria-label="Alt akış ekle"
                onClick={() => onAddChild(folder.id)}
              >
                +
              </button>
            ) : null}
            <button
              type="button"
              className="sc-icon-btn sc-icon-btn-edit"
              title="Yeniden adlandır"
              aria-label="Yeniden adlandır"
              onClick={() => onStartEdit(folder.id)}
            >
              ✎
            </button>
            <button
              type="button"
              className="sc-icon-btn sc-icon-btn-danger"
              title="Klasörü sil"
              aria-label="Klasörü sil"
              onClick={() => onDelete(folder.id)}
            >
              ×
            </button>
          </div>
          ) : null}
        </div>
      </DropZone>
      {!collapsed ? (
        <div className="sc-folder-body wf-tree-body">
          {sequence.length > 0 ? (
            <WorkflowStepReorder
              parentId={folder.id}
              items={sequence}
              variant="drawer"
              onPlaceStep={onPlaceStep}
              onPlaceFolder={onPlaceFolder}
              onSelect={onSelectService}
              onRemove={canEdit ? onRemove : undefined}
              focusServiceId={focusServiceId}
              readOnly={!canEdit}
              renderFolder={(childFolder) => (
                <FolderBlock
                  key={childFolder.id}
                  folder={childFolder}
                  store={store}
                  nested
                  depth={depth + 1}
                  selectedFolderId={selectedFolderId}
                  expandedFolders={expandedFolders}
                  focusServiceId={focusServiceId}
                  onSelectFolder={onSelectFolder}
                  onToggle={onToggle}
                  onRename={onRename}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                  onSelectService={onSelectService}
                  onRemove={onRemove}
                  onMove={onMove}
                  onMoveFolder={onMoveFolder}
                  onPlaceStep={onPlaceStep}
                  onPlaceFolder={onPlaceFolder}
                  onOpenInfo={onOpenInfo}
                  editingFolderId={editingFolderId}
                  onStartEdit={onStartEdit}
                  onStopEdit={onStopEdit}
                  canEdit={canEdit}
                />
              )}
            />
          ) : null}
        </div>
      ) : null}
      {!collapsed
        ? organizerKids.map((child) => (
            <FolderBlock
              key={child.id}
              folder={child}
              store={store}
              nested
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              focusServiceId={focusServiceId}
              onSelectFolder={onSelectFolder}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onSelectService={onSelectService}
              onRemove={onRemove}
              onMove={onMove}
              onMoveFolder={onMoveFolder}
              onPlaceStep={onPlaceStep}
              onPlaceFolder={onPlaceFolder}
              onOpenInfo={onOpenInfo}
              editingFolderId={editingFolderId}
              onStartEdit={onStartEdit}
              onStopEdit={onStopEdit}
              canEdit={canEdit}
            />
          ))
        : null}
    </section>
  )
}
