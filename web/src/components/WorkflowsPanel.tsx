import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { searchServices, listPocProcesses, searchProcesses } from '../api/client'
import { rankServiceHits, SearchHitLabel } from './SearchHitLabel'
import { TreeKindIcon } from './TreeKindIcon'
import { GitBranchIcon, WorkflowFolderGlyph } from './WorkflowIcons'
import { WorkflowStepReorder } from './WorkflowStepReorder'
import {
  FOLDER_MIME,
  STEP_MIME,
  addWorkflowFolder,
  addWorkflowStep,
  beginWorkflowDrag,
  canNestUnder,
  deleteWorkflowFolder,
  endWorkflowDrag,
  folderAcceptsSteps,
  moveWorkflowFolder,
  moveWorkflowStep,
  peekWorkflowDrag,
  placeWorkflowFolder,
  placeWorkflowStep,
  pureOrganizerChildren,
  readWorkflows,
  removeWorkflowStep,
  renameWorkflowFolder,
  sequenceInFolder,
  WORKFLOWS_CHANGED_EVENT,
  type WorkflowFolder,
  type WorkflowFolderIcon,
  type WorkflowsStore,
} from '../workflowStore'
import type { ProcessCatalogItem, Service } from '../types'
import {
  deleteProcessRoute,
  PROCESS_ROUTES_CHANGED_EVENT,
  renameProcessRoute,
  routesForPanel,
  type SavedProcessRoute,
} from '../processRouteStore'

type Props = {
  open: boolean
  pivotId?: string
  pivotName?: string
  navPinned: boolean
  mapExpanded?: boolean
  onTogglePin: () => void
  onClose: () => void
  onSelectService: (serviceId: string) => void
  onOpenFolder: (folderId: string) => void
  onOpenProcess: (processNo: string) => void
  onOpenProcessRoute: (routeId: string) => void
  infoFolderId?: string
  processFlowNo?: string
  activeRouteId?: string
  canEdit?: boolean
}

function isWorkflowDrag(e: ReactDragEvent) {
  const types = [...e.dataTransfer.types].map((t) => t.toLowerCase())
  return (
    types.includes(STEP_MIME) ||
    types.includes(FOLDER_MIME) ||
    types.includes('text/plain') ||
    types.includes('text')
  )
}

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

function RouteRenameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      <path
        d="M4 20h4.2L18.2 9.8 14.2 5.8 4 16V20z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M13 7.2l3.8 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RouteDeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      <path
        d="M5.5 7.5h13M10 7.5V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M9 7.5l.65 11h4.7L15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden className="sidebar-pin-icon">
      <path
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03-1 1.03 1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={pinned ? 0 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DropZone({
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

function FolderBlock({
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

export function WorkflowsPanel({
  open,
  pivotId,
  pivotName,
  navPinned,
  mapExpanded = false,
  onTogglePin,
  onClose,
  onSelectService,
  onOpenFolder,
  onOpenProcess,
  onOpenProcessRoute,
  infoFolderId,
  processFlowNo,
  activeRouteId,
  canEdit = true,
}: Props) {
  const [store, setStore] = useState<WorkflowsStore>(() => readWorkflows())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [selectedFolderId, setSelectedFolderId] = useState<string>()
  const [editingFolderId, setEditingFolderId] = useState<string>()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [processHits, setProcessHits] = useState<ProcessCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [pocProcesses, setPocProcesses] = useState<ProcessCatalogItem[]>([])
  const [processRoutes, setProcessRoutes] = useState<SavedProcessRoute[]>(() =>
    routesForPanel(processFlowNo),
  )
  const [pendingDelete, setPendingDelete] = useState<SavedProcessRoute>()
  const [pendingRename, setPendingRename] = useState<SavedProcessRoute>()
  const [renameDraft, setRenameDraft] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setProcessHits([])
      setExpandedFolders(new Set())
      return
    }
    const data = readWorkflows()
    setStore(data)
    const t = window.setTimeout(() => searchRef.current?.focus(), 180)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listPocProcesses()
      .then((rows) => {
        if (!cancelled) setPocProcesses(rows)
      })
      .catch(() => {
        if (!cancelled) setPocProcesses([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    const refresh = () => setStore(readWorkflows())
    window.addEventListener(WORKFLOWS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(WORKFLOWS_CHANGED_EVENT, refresh)
  }, [])

  useEffect(() => {
    const refresh = () => setProcessRoutes(routesForPanel(processFlowNo))
    refresh()
    window.addEventListener(PROCESS_ROUTES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PROCESS_ROUTES_CHANGED_EVENT, refresh)
  }, [processFlowNo])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      setHits([])
      setProcessHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void Promise.all([
        searchServices(q)
          .then((rows) => rankServiceHits(rows, q).slice(0, 12))
          .catch(() => [] as Service[]),
        searchProcesses(q).catch(() => [] as ProcessCatalogItem[]),
      ])
        .then(([services, processes]) => {
          if (cancelled) return
          setHits(services)
          setProcessHits(processes)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, open])

  const rootFolders = useMemo(() => pureOrganizerChildren(store, undefined), [store])
  const rootSequence = useMemo(() => sequenceInFolder(store, undefined), [store])
  const searchingMode = query.trim().length >= 2
  const highlightId = infoFolderId ?? selectedFolderId

  const openService = useCallback(
    (serviceId: string) => {
      onSelectService(serviceId)
    },
    [onSelectService],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || mapExpanded) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, mapExpanded])

  const addToRoot = (serviceId: string, name: string) => {
    setStore(addWorkflowStep(serviceId, name, undefined))
  }

  const createNode = (kind: 'flow' | 'folder', parentId?: string) => {
    const icon: WorkflowFolderIcon = kind === 'folder' ? 'folder' : 'flow'
    const name = kind === 'folder' ? 'Yeni klasör' : 'Yeni akış'
    const next = addWorkflowFolder(name, parentId, icon)
    setStore(next)
    const created = next.folders[next.folders.length - 1]
    if (!created) return
    setSelectedFolderId(created.id)
    setEditingFolderId(created.id)
    onOpenFolder(created.id)
    setExpandedFolders((prev) => {
      const copy = new Set(prev)
      if (parentId) copy.add(parentId)
      copy.add(created.id)
      return copy
    })
  }

  const toggleCollapsed = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={`shortcuts-overlay${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <aside
        ref={panelRef}
        className="shortcuts-drawer-panel"
        aria-label="İş akışları"
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="shortcuts-drawer-head">
          <div className="shortcuts-drawer-title-wrap">
            <span className="shortcuts-drawer-star" aria-hidden>
              <GitBranchIcon filled />
            </span>
            <span className="shortcuts-drawer-title">İş akışları</span>
          </div>
          <div className="shortcuts-drawer-head-actions">
            <button
              type="button"
              className={`sidebar-pin-btn shortcuts-drawer-pin${navPinned ? ' is-pinned' : ''}`}
              title={
                navPinned
                  ? 'Sabitlemeyi bırak'
                  : 'Paneli sabitle'
              }
              aria-pressed={navPinned}
              onClick={onTogglePin}
            >
              <PinIcon pinned={navPinned} />
            </button>
            <button
              type="button"
              className="shortcuts-drawer-close"
              aria-label="Kapat"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="shortcuts-drawer-search">
          <svg className="sc-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
            <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Servis veya süreç ara…"
            aria-label="Servis veya süreç ara"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="sc-search-clear"
              aria-label="Aramayı temizle"
              onClick={() => setQuery('')}
            >
              ×
            </button>
          ) : null}
        </div>

        {searchingMode ? (
          <div className="sc-search-hits" role="listbox" aria-label="Arama sonuçları">
            <p className="sc-search-status">
              {canEdit
                ? '+ köke ekler; sonra bir akışın üzerine bırakın'
                : 'Sonuçtan servisi açın'}
            </p>
            {searching ? (
              <p className="sc-search-status">Aranıyor…</p>
            ) : hits.length === 0 && processHits.length === 0 ? (
              <p className="sc-search-status">Sonuç yok</p>
            ) : (
              <>
                {processHits.length > 0 ? (
                  <>
                    <p className="sc-search-status">Süreçler</p>
                    {processHits.map((p) => (
                      <div key={p.no} className="sc-hit-row">
                        <button
                          type="button"
                          className="sc-hit-main"
                          title={p.descriptionTr || p.name || p.no}
                          onClick={() => onOpenProcess(p.no)}
                        >
                          <TreeKindIcon kind="process" size={13} />
                          <SearchHitLabel
                            name={p.descriptionTr || p.name || p.no}
                            query={query}
                            id={p.no}
                          />
                        </button>
                      </div>
                    ))}
                  </>
                ) : null}
                {hits.length > 0 ? (
                  <>
                    {processHits.length > 0 ? <p className="sc-search-status">Servisler</p> : null}
                    {hits.map((s) => (
                      <div key={s.id} className="sc-hit-row">
                        <button
                          type="button"
                          className="sc-hit-main"
                          title={s.name}
                          onClick={() => openService(s.id)}
                        >
                          <TreeKindIcon kind="service" size={13} />
                          <SearchHitLabel name={s.name} query={query} id={s.id} />
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            className="sc-fav-btn"
                            title="Köke ekle"
                            aria-label="Köke ekle"
                            onClick={() => addToRoot(s.id, s.name)}
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {canEdit ? (
        <div className="shortcuts-panel-toolbar">
          <button
            type="button"
            className="sc-toolbar-btn is-primary"
            disabled={!pivotId}
            title={pivotId ? 'Köke ekle' : 'Önce bir servis seçin'}
            onClick={() => {
              if (!pivotId || !pivotName) return
              addToRoot(pivotId, pivotName)
            }}
          >
            Servisi ekle
          </button>
          <button
            type="button"
            className="sc-toolbar-btn"
            onClick={() => createNode('flow')}
          >
            Yeni akış
          </button>
          <button
            type="button"
            className="sc-toolbar-btn"
            onClick={() => createNode('folder')}
          >
            Yeni klasör
          </button>
        </div>
        ) : (
          <p className="sc-readonly-note">Salt okuma — düzenleme yetkisi intranet oturumundan gelecek.</p>
        )}

        <div className="shortcuts-drawer-body">
          <div className="sc-process-block">
            <div className="sc-section-label">Süreçler</div>
            {pocProcesses.length === 0 ? (
              <p className="sc-process-hint">Liste yüklenemedi veya boş.</p>
            ) : (
              <ul className="sc-process-list">
                {pocProcesses.map((p) => (
                  <li key={p.no}>
                    <button
                      type="button"
                      className={`sc-process-item${processFlowNo === p.no ? ' is-active' : ''}`}
                      onClick={() => onOpenProcess(p.no)}
                    >
                      <TreeKindIcon kind="process" size={14} title="Süreç" />
                      <span className="sc-process-item-copy">
                        <span className="sc-process-item-name">
                          {p.descriptionTr || p.name || p.no}
                        </span>
                        <span className="sc-process-item-no">{p.no}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sc-process-block sc-process-routes-block">
            <div className="sc-section-label">Akış Rotaları</div>
            {processRoutes.length === 0 ? (
              <p className="sc-process-hint">Henüz kaydedilmiş rota yok.</p>
            ) : (
              <ul className="sc-process-list">
                {processRoutes.map((route) => (
                  <li key={route.id} className="sc-process-route-row">
                    <button
                      type="button"
                      className={`sc-process-item${activeRouteId === route.id ? ' is-active' : ''}`}
                      onClick={() => onOpenProcessRoute(route.id)}
                    >
                      <span className="sc-process-route-glyph" aria-hidden>
                        <GitBranchIcon />
                      </span>
                      <span className="sc-process-item-copy">
                        <span className="sc-process-item-name">{route.name}</span>
                        <span className="sc-process-item-no">
                          {route.processNo} · {route.status === 'completed' ? 'Tamamlandı' : 'Taslak'}
                        </span>
                      </span>
                    </button>
                    <span className="sc-process-route-actions">
                      <button
                        type="button"
                        className="sc-process-route-action is-rename"
                        title="Adı düzenle"
                        aria-label={`${route.name} rotasının adını düzenle`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingRename(route)
                          setRenameDraft(route.name)
                        }}
                      >
                        <RouteRenameIcon />
                      </button>
                      <button
                        type="button"
                        className="sc-process-route-action is-delete"
                        title="Rotayı sil"
                        aria-label={`${route.name} rotasını sil`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingDelete(route)
                        }}
                      >
                        <RouteDeleteIcon />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {store.steps.length === 0 && store.folders.length === 0 ? (
            <p className="shortcuts-panel-empty">
              {canEdit
                ? 'Yeni akış veya klasör oluşturun. Servisi + ile köke ekleyin, sonra bir akışın üzerine bırakın. Akışlar klasörlerin altına taşınabilir.'
                : 'Henüz akış yok.'}
            </p>
          ) : null}

          <DropZone
            locked={!canEdit}
            onDropStep={(id) => setStore(moveWorkflowStep(id, undefined))}
            onDropFolder={(id) => setStore(moveWorkflowFolder(id, undefined))}
          >
            <div className="sc-section-label">Akış Takibi</div>
          </DropZone>
          {rootSequence.length > 0 ? (
            <WorkflowStepReorder
              parentId={undefined}
              items={rootSequence}
              variant="drawer"
              onPlaceStep={(id, fid, index) => setStore(placeWorkflowStep(id, fid, index))}
              onPlaceFolder={(id, fid, index) => setStore(placeWorkflowFolder(id, fid, index))}
              onSelect={openService}
              onRemove={canEdit ? (id) => setStore(removeWorkflowStep(id)) : undefined}
              readOnly={!canEdit}
              renderFolder={(folder) => (
                <FolderBlock
                  key={folder.id}
                  folder={folder}
                  store={store}
                  selectedFolderId={highlightId}
                  expandedFolders={expandedFolders}
                  onSelectFolder={setSelectedFolderId}
                  onToggle={toggleCollapsed}
                  onRename={(id, name) => setStore(renameWorkflowFolder(id, name))}
                  onDelete={(id) => {
                    setStore(deleteWorkflowFolder(id))
                    if (selectedFolderId === id) setSelectedFolderId(undefined)
                    if (editingFolderId === id) setEditingFolderId(undefined)
                  }}
                  onAddChild={(parentId) => createNode('flow', parentId)}
                  onSelectService={openService}
                  onRemove={(id) => setStore(removeWorkflowStep(id))}
                  onMove={(id, folderId) => setStore(moveWorkflowStep(id, folderId))}
                  onMoveFolder={(id, folderId) => setStore(moveWorkflowFolder(id, folderId))}
                  onPlaceStep={(id, fid, index) => setStore(placeWorkflowStep(id, fid, index))}
                  onPlaceFolder={(id, fid, index) => setStore(placeWorkflowFolder(id, fid, index))}
                  onOpenInfo={onOpenFolder}
                  editingFolderId={editingFolderId}
                  onStartEdit={setEditingFolderId}
                  onStopEdit={() => setEditingFolderId(undefined)}
                  canEdit={canEdit}
                />
              )}
            />
          ) : null}

          {rootFolders.map((folder) => (
            <FolderBlock
              key={folder.id}
              folder={folder}
              store={store}
              selectedFolderId={highlightId}
              expandedFolders={expandedFolders}
              onSelectFolder={setSelectedFolderId}
              onToggle={toggleCollapsed}
              onRename={(id, name) => setStore(renameWorkflowFolder(id, name))}
              onDelete={(id) => {
                setStore(deleteWorkflowFolder(id))
                if (selectedFolderId === id) setSelectedFolderId(undefined)
                if (editingFolderId === id) setEditingFolderId(undefined)
              }}
              onAddChild={(parentId) => createNode('flow', parentId)}
              onSelectService={openService}
              onRemove={(id) => setStore(removeWorkflowStep(id))}
              onMove={(id, folderId) => setStore(moveWorkflowStep(id, folderId))}
              onMoveFolder={(id, folderId) => setStore(moveWorkflowFolder(id, folderId))}
              onPlaceStep={(id, fid, index) => setStore(placeWorkflowStep(id, fid, index))}
              onPlaceFolder={(id, fid, index) => setStore(placeWorkflowFolder(id, fid, index))}
              onOpenInfo={onOpenFolder}
              editingFolderId={editingFolderId}
              onStartEdit={setEditingFolderId}
              onStopEdit={() => setEditingFolderId(undefined)}
              canEdit={canEdit}
            />
          ))}
        </div>
      </aside>
      {pendingRename
        ? createPortal(
            <div
              className="sc-confirm-backdrop"
              role="presentation"
              onMouseDown={() => setPendingRename(undefined)}
            >
              <section
                className="sc-confirm-dialog sc-route-rename-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sc-route-rename-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="sc-route-rename-title">Rota adını düzenle</h2>
                <p className="sc-route-rename-meta">
                  {pendingRename.processNo}
                  {pendingRename.processTitle ? ` · ${pendingRename.processTitle}` : ''}
                  {' · '}
                  {pendingRename.status === 'completed' ? 'Tamamlandı' : 'Taslak'}
                </p>
                <label className="sc-route-rename-field">
                  <span>Rota adı</span>
                  <input
                    autoFocus
                    type="text"
                    value={renameDraft}
                    maxLength={140}
                    placeholder="Örn. Bölge onay rotası"
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      const trimmed = renameDraft.trim()
                      if (event.key === 'Enter' && trimmed && trimmed !== pendingRename.name) {
                        event.preventDefault()
                        setProcessRoutes(renameProcessRoute(pendingRename.id, trimmed).routes)
                        setPendingRename(undefined)
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setPendingRename(undefined)
                      }
                    }}
                  />
                </label>
                <div className="sc-confirm-actions">
                  <button type="button" onClick={() => setPendingRename(undefined)}>
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="is-primary"
                    disabled={
                      !renameDraft.trim() || renameDraft.trim() === pendingRename.name
                    }
                    onClick={() => {
                      const trimmed = renameDraft.trim()
                      if (!trimmed || trimmed === pendingRename.name) return
                      setProcessRoutes(renameProcessRoute(pendingRename.id, trimmed).routes)
                      setPendingRename(undefined)
                    }}
                  >
                    Kaydet
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
      {pendingDelete
        ? createPortal(
            <div
              className="sc-confirm-backdrop"
              role="presentation"
              onMouseDown={() => setPendingDelete(undefined)}
            >
              <section
                className="sc-confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sc-route-delete-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="sc-route-delete-title">Rotayı sil</h2>
                <p>
                  “{pendingDelete.name}” rotası kalıcı olarak silinecek. Bu işlem geri alınamaz.
                </p>
                <div className="sc-confirm-actions">
                  <button type="button" onClick={() => setPendingDelete(undefined)}>
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => {
                      setProcessRoutes(deleteProcessRoute(pendingDelete.id).routes)
                      setPendingDelete(undefined)
                    }}
                  >
                    Sil
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
