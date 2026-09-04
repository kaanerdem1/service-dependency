import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react'
import { searchServices } from '../api/client'
import { TreeKindIcon } from './TreeKindIcon'
import {
  addFolder,
  addShortcut,
  deleteFolder,
  displayShortcutName,
  moveShortcut,
  readShortcuts,
  removeShortcut,
  renameFolder,
  setShortcutAlias,
  syncCanonicalName,
  type ServiceShortcut,
  type ShortcutsStore,
} from '../serviceShortcuts'
import type { Service } from '../types'

type Props = {
  open: boolean
  pivotId?: string
  pivotName?: string
  navPinned: boolean
  mapExpanded?: boolean
  onTogglePin: () => void
  onClose: () => void
  /** Ağaç odağı uygulamadan servis aç (source: tree) */
  onSelectService: (serviceId: string) => void
}

const DRAG_MIME = 'application/x-sd-shortcut'

type NavTarget =
  | { kind: 'hit'; serviceId: string }
  | { kind: 'shortcut'; serviceId: string; shortcutId: string }

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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M12 2.5l2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 15.9l-5.1 2.68.97-5.67-4.12-4.02 5.7-.83L12 2.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12.8 6.7l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
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

function ShortcutRow({
  item,
  focused,
  onSelect,
  onRemove,
  onAliasChange,
}: {
  item: ServiceShortcut
  focused?: boolean
  onSelect: () => void
  onRemove: () => void
  onAliasChange: (alias: string) => void
}) {
  const [editingAlias, setEditingAlias] = useState(false)
  const label = displayShortcutName(item)
  const showCanonical = Boolean(item.alias?.trim())
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const onDragStart = (e: ReactDragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, item.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      ref={rowRef}
      className={`sc-row${focused ? ' is-kbd-focus' : ''}`}
      draggable={!editingAlias}
      onDragStart={onDragStart}
      data-sc-nav={item.serviceId}
    >
      <button
        type="button"
        className="sc-row-main"
        title={`${item.canonicalName}\n${item.serviceId}\nÇift tık: adı düzenle`}
        onClick={() => {
          if (!editingAlias) onSelect()
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setEditingAlias(true)
        }}
      >
        <span className="sc-drag-handle" aria-hidden>
          ⋮⋮
        </span>
        <TreeKindIcon kind="service" size={14} />
        {editingAlias ? (
          <InlineRename
            value={item.alias ?? item.canonicalName}
            ariaLabel="Kısayol adı"
            onCommit={(next) => {
              onAliasChange(next)
              setEditingAlias(false)
            }}
            onCancel={() => setEditingAlias(false)}
          />
        ) : (
          <span className="sc-row-label">
            <span className="sc-row-alias">{label}</span>
            {showCanonical ? (
              <span className="sc-row-canonical">{item.canonicalName}</span>
            ) : null}
          </span>
        )}
      </button>
      <div className="sc-row-actions">
        <button
          type="button"
          className="sc-icon-btn sc-icon-btn-edit"
          title="Görünen adı düzenle"
          aria-label="Görünen adı düzenle"
          onClick={() => setEditingAlias(true)}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="sc-icon-btn sc-icon-btn-danger"
          title="Kısayoldan kaldır"
          aria-label="Kısayoldan kaldır"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function DropZone({
  folderId,
  active,
  children,
  onDropShortcut,
}: {
  folderId?: string
  active?: boolean
  children: ReactNode
  onDropShortcut: (shortcutId: string, folderId?: string) => void
}) {
  const [over, setOver] = useState(false)

  return (
    <div
      className={`sc-drop-zone${over || active ? ' is-over' : ''}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes(DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData(DRAG_MIME)
        if (id) onDropShortcut(id, folderId)
      }}
    >
      {children}
    </div>
  )
}

function FolderBlock({
  folderId,
  folderName,
  items,
  collapsed,
  focusServiceId,
  onToggle,
  onRename,
  onDelete,
  onSelectService,
  onRemove,
  onAliasChange,
  onMove,
}: {
  folderId: string
  folderName: string
  items: ServiceShortcut[]
  collapsed: boolean
  focusServiceId?: string
  onToggle: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onSelectService: (id: string) => void
  onRemove: (id: string) => void
  onAliasChange: (id: string, alias: string) => void
  onMove: (id: string, folderId?: string) => void
}) {
  const [editingName, setEditingName] = useState(false)

  return (
    <DropZone folderId={folderId} onDropShortcut={onMove}>
      <section className="sc-folder">
        <div className="sc-folder-head">
          <button
            type="button"
            className="sc-folder-toggle"
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <span className="sc-folder-chev">{collapsed ? '▸' : '▾'}</span>
            <TreeKindIcon kind="group" size={14} title="Klasör" />
            {editingName ? (
              <InlineRename
                value={folderName}
                ariaLabel="Klasör adı"
                className="sc-inline-rename sc-inline-rename-folder"
                onCommit={(next) => {
                  onRename(next)
                  setEditingName(false)
                }}
                onCancel={() => setEditingName(false)}
              />
            ) : (
              <span className="sc-folder-name">{folderName}</span>
            )}
            <span className="sc-folder-count">{items.length}</span>
          </button>
          <div className="sc-folder-actions">
            <button
              type="button"
              className="sc-icon-btn sc-icon-btn-edit"
              title="Klasörü yeniden adlandır"
              aria-label="Klasörü yeniden adlandır"
              onClick={() => setEditingName(true)}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className="sc-icon-btn sc-icon-btn-danger"
              title="Klasörü sil"
              aria-label="Klasörü sil"
              onClick={onDelete}
            >
              ×
            </button>
          </div>
        </div>
        {!collapsed ? (
          <div className="sc-folder-body">
            {items.length === 0 ? (
              <p className="sc-empty-folder">Buraya sürükleyin</p>
            ) : (
              items.map((item) => (
                <ShortcutRow
                  key={item.id}
                  item={item}
                  focused={focusServiceId === item.serviceId}
                  onSelect={() => onSelectService(item.serviceId)}
                  onRemove={() => onRemove(item.id)}
                  onAliasChange={(alias) => onAliasChange(item.id, alias)}
                />
              ))
            )}
          </div>
        ) : null}
      </section>
    </DropZone>
  )
}

export function ShortcutsPanel({
  open,
  pivotId,
  pivotName,
  navPinned,
  mapExpanded = false,
  onTogglePin,
  onClose,
  onSelectService,
}: Props) {
  const [store, setStore] = useState<ShortcutsStore>(() => readShortcuts())
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [searching, setSearching] = useState(false)
  const [navIndex, setNavIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setNavIndex(-1)
      return
    }
    const data = readShortcuts()
    setStore(data)
    setCollapsedFolders(new Set(data.folders.map((f) => f.id)))
    const t = window.setTimeout(() => searchRef.current?.focus(), 180)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (pivotId && pivotName) {
      setStore(syncCanonicalName(pivotId, pivotName))
    }
  }, [pivotId, pivotName])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchServices(q)
        .then((rows) => {
          if (!cancelled) setHits(rows.slice(0, 12))
        })
        .catch(() => {
          if (!cancelled) setHits([])
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

  const rootItems = useMemo(
    () => store.shortcuts.filter((s) => !s.folderId),
    [store.shortcuts],
  )

  const byFolder = useMemo(() => {
    const map = new Map<string, ServiceShortcut[]>()
    for (const f of store.folders) map.set(f.id, [])
    for (const s of store.shortcuts) {
      if (!s.folderId) continue
      const list = map.get(s.folderId)
      if (list) list.push(s)
    }
    return map
  }, [store])

  const favoritedIds = useMemo(
    () => new Set(store.shortcuts.map((s) => s.serviceId)),
    [store.shortcuts],
  )

  const pivotInList = pivotId ? favoritedIds.has(pivotId) : false
  const searchingMode = query.trim().length >= 2

  const navTargets = useMemo((): NavTarget[] => {
    if (searchingMode) {
      return hits.map((h) => ({ kind: 'hit' as const, serviceId: h.id }))
    }
    const list: NavTarget[] = rootItems.map((s) => ({
      kind: 'shortcut' as const,
      serviceId: s.serviceId,
      shortcutId: s.id,
    }))
    for (const folder of store.folders) {
      if (collapsedFolders.has(folder.id)) continue
      for (const s of byFolder.get(folder.id) ?? []) {
        list.push({
          kind: 'shortcut',
          serviceId: s.serviceId,
          shortcutId: s.id,
        })
      }
    }
    return list
  }, [searchingMode, hits, rootItems, store.folders, collapsedFolders, byFolder])

  useEffect(() => {
    setNavIndex((i) => (navTargets.length === 0 ? -1 : Math.min(i, navTargets.length - 1)))
  }, [navTargets])

  const focusServiceId =
    navIndex >= 0 && navIndex < navTargets.length
      ? navTargets[navIndex]?.serviceId
      : undefined

  const openService = useCallback(
    (serviceId: string) => {
      setNavIndex(-1)
      onSelectService(serviceId)
    },
    [onSelectService],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const editing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable

      if (e.key === 'Escape') {
        if (mapExpanded) return
        if (editing && tag === 'INPUT' && target !== searchRef.current) return
        e.preventDefault()
        if (navIndex >= 0) {
          setNavIndex(-1)
          return
        }
        onClose()
        return
      }

      if (editing && target === searchRef.current) {
        if (e.key === 'ArrowDown' && navTargets.length > 0) {
          e.preventDefault()
          setNavIndex(0)
          panelRef.current?.focus()
        }
        return
      }

      if (editing) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (navTargets.length === 0) return
        setNavIndex((i) => (i < 0 ? 0 : Math.min(i + 1, navTargets.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (navTargets.length === 0) return
        setNavIndex((i) => {
          if (i <= 0) {
            searchRef.current?.focus()
            return -1
          }
          return i - 1
        })
        return
      }
      if (e.key === 'Enter' && navIndex >= 0) {
        const item = navTargets[navIndex]
        if (!item) return
        e.preventDefault()
        openService(item.serviceId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, navTargets, navIndex, openService, mapExpanded])

  const toggleFavorite = (serviceId: string, name: string) => {
    const existing = store.shortcuts.find((s) => s.serviceId === serviceId)
    if (existing) {
      setStore(removeShortcut(existing.id))
      return
    }
    setStore(addShortcut(serviceId, name))
  }

  return (
    <div
      className={`shortcuts-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      <aside
        ref={panelRef}
        className="shortcuts-drawer-panel"
        aria-label="Favorilerim"
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="shortcuts-drawer-head">
          <div className="shortcuts-drawer-title-wrap">
            <span className="shortcuts-drawer-star" aria-hidden>
              <StarIcon filled />
            </span>
            <span className="shortcuts-drawer-title">Favorilerim</span>
            <span className="shortcuts-drawer-meta">{store.shortcuts.length}</span>
          </div>
          <div className="shortcuts-drawer-head-actions">
            <button
              type="button"
              className={`sidebar-pin-btn shortcuts-drawer-pin${navPinned ? ' is-pinned' : ''}`}
              title={
                navPinned
                  ? 'Sabitlemeyi bırak (fare dışına çıkınca panel kapanır)'
                  : 'Paneli sabitle (açık kalsın)'
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

        <div className="shortcuts-drawer-search">
          <svg className="sc-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
            <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setNavIndex(-1)
            }}
            placeholder="Servis ara…"
            aria-label="Kısayol için servis ara"
            aria-controls="sc-nav-list"
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
          <div
            id="sc-nav-list"
            className="sc-search-hits"
            role="listbox"
            aria-label="Arama sonuçları"
          >
            {searching ? (
              <p className="sc-search-status">Aranıyor…</p>
            ) : hits.length === 0 ? (
              <p className="sc-search-status">Sonuç yok</p>
            ) : (
              hits.map((s, i) => {
                const fav = favoritedIds.has(s.id)
                const focused = navIndex === i
                return (
                  <div
                    key={s.id}
                    className={`sc-hit-row${focused ? ' is-kbd-focus' : ''}`}
                    role="option"
                    aria-selected={focused}
                  >
                    <button
                      type="button"
                      className="sc-hit-main"
                      title={s.name}
                      onClick={() => openService(s.id)}
                    >
                      <TreeKindIcon kind="service" size={13} />
                      <span className="sc-hit-name">{s.name}</span>
                    </button>
                    <button
                      type="button"
                      className={`sc-fav-btn${fav ? ' is-on' : ''}`}
                      title={fav ? 'Kısayollardan çıkar' : 'Kısayollara ekle'}
                      aria-label={fav ? 'Kısayollardan çıkar' : 'Kısayollara ekle'}
                      aria-pressed={fav}
                      onClick={() => toggleFavorite(s.id, s.name)}
                    >
                      <StarIcon filled={fav} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        ) : null}

        <div className="shortcuts-panel-toolbar">
          <button
            type="button"
            className="sc-toolbar-btn is-primary"
            disabled={!pivotId || pivotInList}
            title={
              pivotInList
                ? 'Bu servis zaten listede'
                : pivotId
                  ? 'Sağda seçili servisi ekle'
                  : 'Önce bir servis seçin'
            }
            onClick={() => {
              if (!pivotId || !pivotName) return
              setStore(addShortcut(pivotId, pivotName))
            }}
          >
            Servisi ekle
          </button>
          <button
            type="button"
            className="sc-toolbar-btn"
            disabled={store.folders.length >= 8}
            onClick={() => {
              const next = addFolder('Yeni klasör')
              setStore(next)
              const created = next.folders[next.folders.length - 1]
              if (created) {
                setCollapsedFolders((prev) => new Set(prev).add(created.id))
              }
            }}
          >
            Yeni klasör
          </button>
        </div>

        <div className="shortcuts-drawer-body" id={searchingMode ? undefined : 'sc-nav-list'}>
          {store.shortcuts.length === 0 && store.folders.length === 0 ? (
            <p className="shortcuts-panel-empty">
              Yukarıdan ara ve ★ ile ekle, veya sağda açık servisi “Servisi ekle” ile kaydet.
              Tek tık açar, çift tık adı düzenler.
            </p>
          ) : null}

          <DropZone onDropShortcut={(id) => setStore(moveShortcut(id, undefined))}>
            <div className="sc-section-label">Favoriler</div>
            {rootItems.length > 0 ? (
              <div className="sc-root-list">
                {rootItems.map((item) => (
                  <ShortcutRow
                    key={item.id}
                    item={item}
                    focused={!searchingMode && focusServiceId === item.serviceId}
                    onSelect={() => openService(item.serviceId)}
                    onRemove={() => setStore(removeShortcut(item.id))}
                    onAliasChange={(alias) => setStore(setShortcutAlias(item.id, alias))}
                  />
                ))}
              </div>
            ) : (
              <p className="sc-empty-folder">Boş — aramadan ★ ile ekleyin</p>
            )}
          </DropZone>

          {store.folders.map((folder) => (
            <FolderBlock
              key={folder.id}
              folderId={folder.id}
              folderName={folder.name}
              items={byFolder.get(folder.id) ?? []}
              collapsed={collapsedFolders.has(folder.id)}
              focusServiceId={searchingMode ? undefined : focusServiceId}
              onToggle={() =>
                setCollapsedFolders((prev) => {
                  const next = new Set(prev)
                  if (next.has(folder.id)) next.delete(folder.id)
                  else next.add(folder.id)
                  return next
                })
              }
              onRename={(name) => setStore(renameFolder(folder.id, name))}
              onDelete={() => setStore(deleteFolder(folder.id))}
              onSelectService={openService}
              onRemove={(id) => setStore(removeShortcut(id))}
              onAliasChange={(id, alias) => setStore(setShortcutAlias(id, alias))}
              onMove={(id, folderId) => setStore(moveShortcut(id, folderId))}
            />
          ))}
        </div>
      </aside>
    </div>
  )
}
