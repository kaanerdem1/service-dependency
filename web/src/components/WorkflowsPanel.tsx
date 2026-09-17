/**
 * İş akışları drawer — composition root.
 *
 * Ne yapar: `workflows/*` parçalarını birleştirir (katalog, rotalar, klasör, arama).
 * Ne yapmaz: Store mantığı `workflowStore.ts` / `processRouteStore.ts`; süreç açma App’te.
 * İlgili: [workflows/rehber.md](./workflows/rehber.md), `ModuleSidebar.tsx`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { searchServices, listPocProcesses, searchProcesses } from '../api/client'
import { rankServiceHits } from './SearchHitLabel'
import { GitBranchIcon } from './WorkflowIcons'
import { WorkflowStepReorder } from './WorkflowStepReorder'
import { ProcessCatalogList } from './workflows/ProcessCatalogList'
import { ProcessRoutesPanel } from './workflows/ProcessRoutesPanel'
import { ProcessRouteDialogs } from './workflows/ProcessRouteDialogs'
import { DropZone } from './workflows/WorkflowDropZone'
import { FolderBlock } from './workflows/WorkflowFolderBlock'
import { WorkflowsSearch } from './workflows/WorkflowsSearch'
import {
  addWorkflowFolder,
  addWorkflowStep,
  deleteWorkflowFolder,
  moveWorkflowFolder,
  moveWorkflowStep,
  placeWorkflowFolder,
  placeWorkflowStep,
  pureOrganizerChildren,
  readWorkflows,
  removeWorkflowStep,
  renameWorkflowFolder,
  sequenceInFolder,
  WORKFLOWS_CHANGED_EVENT,
  type WorkflowFolderIcon,
  type WorkflowsStore,
} from '../workflowStore'
import {
  deleteProcessRoute,
  getProcessRoute,
  groupProcessRoutesByBpm,
  PROCESS_ROUTES_CHANGED_EVENT,
  renameProcessRoute,
  routeMatchesFilter,
  routesForPanel,
  type SavedProcessRoute,
} from '../processRouteStore'
import type { ProcessCatalogItem, Service } from '../types'

/**
 * İş akışları drawer'ı (sol panel, "İş akışları" başlığı).
 *
 * Bu drawer üç ayrı listeyi bir arada gösterir:
 *   1. Süreç kataloğu (öne çıkan / aranan BPM süreçleri) — `ProcessCatalogList`.
 *   2. Kaydedilmiş akış rotaları, süreç bazında gruplu — `ProcessRoutesPanel`.
 *   3. Kullanıcının kendi kurduğu servis akışları (klasör + adım ağacı) —
 *      `WorkflowFolderBlock` / `WorkflowStepReorder`.
 *
 * State neden burada merkezi: (1) ve (2) için "hangi öğe aktif" bilgisi
 * `processFlowNo` / `activeRouteId` prop'larından, (3) için ise `workflowStore`
 * (localStorage) okuma/yazmasından geliyor. Alt bileşenler (workflows/*) kendi
 * state'ini tutmaz; sadece prop alıp render eder — bu sayede "hangi grup açık",
 * "hangi rota siliniyor" gibi kararlar tek yerden okunabilir kalır.
 */
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
  const [routeFilter, setRouteFilter] = useState('')
  const [expandedRouteGroups, setExpandedRouteGroups] = useState<Set<string>>(() => new Set())
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
      setRouteFilter('')
      setExpandedRouteGroups(new Set())
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
    const refresh = () => setProcessRoutes(routesForPanel())
    refresh()
    window.addEventListener(PROCESS_ROUTES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PROCESS_ROUTES_CHANGED_EVENT, refresh)
  }, [])

  useEffect(() => {
    if (!open) return
    const activeProcess =
      processFlowNo ?? (activeRouteId ? getProcessRoute(activeRouteId)?.processNo : undefined)
    setExpandedRouteGroups(activeProcess ? new Set([activeProcess]) : new Set())
  }, [open, processFlowNo, activeRouteId])

  const routeFilterNeedle = routeFilter.trim()
  const routeBpmGroups = useMemo(() => {
    const groups = groupProcessRoutesByBpm(processRoutes)
    if (!routeFilterNeedle) return groups
    return groups
      .map((group) => ({
        ...group,
        routes: group.routes.filter((route) => routeMatchesFilter(route, routeFilterNeedle)),
      }))
      .filter((group) => group.routes.length > 0)
  }, [processRoutes, routeFilterNeedle])

  const activeProcessForRoutes =
    processFlowNo ?? (activeRouteId ? getProcessRoute(activeRouteId)?.processNo : undefined)

  const toggleRouteGroup = useCallback((processNo: string) => {
    setExpandedRouteGroups((prev) => {
      const next = new Set(prev)
      if (next.has(processNo)) next.delete(processNo)
      else next.add(processNo)
      return next
    })
  }, [])

  const isRouteGroupExpanded = useCallback(
    (processNo: string) => {
      if (routeFilterNeedle) return true
      return expandedRouteGroups.has(processNo)
    },
    [routeFilterNeedle, expandedRouteGroups],
  )

  useEffect(() => {
    if (!open || (!processFlowNo && !activeRouteId)) return
    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('.sc-process-item.is-active')
        ?.scrollIntoView({ block: 'nearest' })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [open, processFlowNo, activeRouteId, pocProcesses.length, processRoutes.length])

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
                  ? 'Sabitlemeyi bırak (panel rail\'e iner)'
                  : 'Modül panelini sabitle — açık kalsın'
              }
              aria-label={
                navPinned
                  ? 'Modül paneli sabitli — sabitlemeyi bırak'
                  : 'Modül panelini sabitle — açık kalsın'
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

        <WorkflowsSearch
          searchRef={searchRef}
          query={query}
          onQueryChange={setQuery}
          searching={searching}
          hits={hits}
          processHits={processHits}
          canEdit={canEdit}
          onOpenProcess={onOpenProcess}
          onOpenService={openService}
          onAddToRoot={addToRoot}
        />

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
          <ProcessCatalogList
            processes={pocProcesses}
            activeProcessNo={processFlowNo}
            onOpenProcess={onOpenProcess}
          />

          <ProcessRoutesPanel
            totalRouteCount={processRoutes.length}
            groups={routeBpmGroups}
            activeProcessNo={activeProcessForRoutes}
            activeRouteId={activeRouteId}
            filter={routeFilter}
            onFilterChange={setRouteFilter}
            isGroupExpanded={isRouteGroupExpanded}
            onToggleGroup={toggleRouteGroup}
            onOpenProcess={onOpenProcess}
            onOpenRoute={onOpenProcessRoute}
            onRequestRename={(route) => {
              setPendingRename(route)
              setRenameDraft(route.name)
            }}
            onRequestDelete={(route) => setPendingDelete(route)}
          />

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
      <ProcessRouteDialogs
        pendingRename={pendingRename}
        renameDraft={renameDraft}
        onRenameDraftChange={setRenameDraft}
        onCommitRename={() => {
          if (!pendingRename) return
          const trimmed = renameDraft.trim()
          if (!trimmed || trimmed === pendingRename.name) return
          setProcessRoutes(renameProcessRoute(pendingRename.id, trimmed).routes)
          setPendingRename(undefined)
        }}
        onCancelRename={() => setPendingRename(undefined)}
        pendingDelete={pendingDelete}
        onConfirmDelete={() => {
          if (!pendingDelete) return
          setProcessRoutes(deleteProcessRoute(pendingDelete.id).routes)
          setPendingDelete(undefined)
        }}
        onCancelDelete={() => setPendingDelete(undefined)}
      />
    </div>
  )
}
