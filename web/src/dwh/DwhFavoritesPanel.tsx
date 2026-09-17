import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { listDwhTables } from './api'
import {
  addDwhFavoriteFolder,
  addDwhFavorite,
  addDwhFavoriteToRoot,
  deleteDwhFavoriteFolder,
  displayDwhFavoriteName,
  moveDwhFavorite,
  removeDwhFavoriteFromFolder,
  renameDwhFavoriteFolder,
  setDwhFavoriteAlias,
  isDwhFavoriteInFolder,
  isDwhFavoriteInRoot,
  removeDwhFavoriteFromRoot,
  type DwhFavoriteFolder,
  type DwhFavoriteTable,
  type DwhFavoritesStore,
} from './dwhFavorites'
import type { DwhTable } from './types'
import { DwhKindIconBadge } from './DwhKindIconBadge'

const DRAG_MIME = 'application/x-dwh-favorite'

type DropPayload =
  | { kind: 'favorite'; id: string }
  | { kind: 'table'; tableId: number; name: string }

function readDropPayload(value: string): DropPayload | undefined {
  try {
    const payload = JSON.parse(value) as DropPayload
    if (payload.kind === 'favorite' && typeof payload.id === 'string') return payload
    if (payload.kind === 'table' && typeof payload.tableId === 'number' && typeof payload.name === 'string') return payload
  } catch {
    return undefined
  }
  return undefined
}

function InlineRename({ value, onCommit, onCancel }: { value: string; onCommit: (value: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      autoFocus
      className="dwh-favorite-inline-input"
      value={draft}
      aria-label="Favori adını düzenle"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(draft)
        if (event.key === 'Escape') onCancel()
      }}
      onBlur={() => onCommit(draft)}
      onClick={(event) => event.stopPropagation()}
    />
  )
}

function FavoriteRow({
  item,
  onSelect,
  onRemove,
  onAliasChange,
}: {
  item: DwhFavoriteTable
  onSelect: () => void
  onRemove: () => void
  onAliasChange: (alias: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const label = displayDwhFavoriteName(item)
  return (
    <div
      className="dwh-favorite-row"
      data-favorite-id={item.id}
      draggable={!editing}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'favorite', id: item.id }))
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button type="button" className="dwh-favorite-main" onClick={onSelect} title={item.canonicalName}>
        <span className="dwh-favorite-drag" aria-hidden>⋮⋮</span>
        <DwhKindIconBadge kind="table" />
        {editing ? (
          <InlineRename value={item.alias ?? item.canonicalName} onCommit={(value) => { onAliasChange(value); setEditing(false) }} onCancel={() => setEditing(false)} />
        ) : (
          <span className="dwh-favorite-label">
            <span>{label}</span>
            {item.alias?.trim() ? <small>{item.canonicalName}</small> : null}
          </span>
        )}
      </button>
      <div className="dwh-favorite-actions">
        <button type="button" className="dwh-favorite-action" title="Görünen adı düzenle" aria-label="Görünen adı düzenle" onClick={() => setEditing(true)}>✎</button>
        <button type="button" className="dwh-favorite-action is-danger" title="Favoriden çıkar" aria-label="Favoriden çıkar" onClick={onRemove}>×</button>
      </div>
    </div>
  )
}

function DropZone({ folderId, children, onDrop }: { folderId?: string; children: ReactNode; onDrop: (payload: DropPayload, folderId?: string) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`dwh-favorite-drop-zone${over ? ' is-over' : ''}`}
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes(DRAG_MIME)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const payload = readDropPayload(event.dataTransfer.getData(DRAG_MIME))
        if (payload) onDrop(payload, folderId)
      }}
    >
      {children}
    </div>
  )
}

function FolderBlock({ folder, items, collapsed, autoEdit, onToggle, onStoreChange, onSelectTable }: {
  folder: DwhFavoriteFolder
  items: DwhFavoriteTable[]
  collapsed: boolean
  autoEdit?: boolean
  onToggle: () => void
  onStoreChange: (store: DwhFavoritesStore) => void
  onSelectTable: (tableId: number) => void
}) {
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (autoEdit) setEditing(true)
  }, [autoEdit])
  return (
    <DropZone folderId={folder.id} onDrop={(payload, folderId) => {
      if (payload.kind === 'favorite') {
        const existing = items.find((item) => item.id === payload.id)
        if (existing && folderId && isDwhFavoriteInFolder(existing, folderId)) {
          window.alert('Bu tablo klasörde zaten bulunuyor.')
          return
        }
        onStoreChange(moveDwhFavorite(payload.id, folderId))
        return
      }
      if (items.some((item) => item.tableId === payload.tableId)) {
        window.alert('Bu tablo klasörde zaten bulunuyor.')
        return
      }
      const added = addDwhFavorite(payload.tableId, payload.name)
      const favorite = added.tables.find((item) => item.tableId === payload.tableId)
      onStoreChange(folderId && favorite ? moveDwhFavorite(favorite.id, folderId) : added)
    }}>
      <section className="dwh-favorite-folder">
        <div className="dwh-favorite-folder-head">
          <button type="button" className="dwh-favorite-folder-toggle" onClick={onToggle} aria-expanded={!collapsed}>
            <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
            {editing ? <InlineRename value={folder.name} onCommit={(value) => { onStoreChange(renameDwhFavoriteFolder(folder.id, value)); setEditing(false) }} onCancel={() => setEditing(false)} /> : <strong>{folder.name}</strong>}
            <small>{items.length}</small>
          </button>
          <div className="dwh-favorite-actions">
            <button type="button" className="dwh-favorite-action" title="Klasörü yeniden adlandır" aria-label="Klasörü yeniden adlandır" onClick={() => setEditing(true)}>✎</button>
            <button
              type="button"
              className="dwh-favorite-action is-danger"
              title="Klasörü sil"
              aria-label="Klasörü sil"
              onClick={() => {
                if (window.confirm(`"${folder.name}" klasörünü ve içindeki tüm tabloları favorilerden kaldırmak istediğinize emin misiniz?`)) {
                  onStoreChange(deleteDwhFavoriteFolder(folder.id))
                }
              }}
            >×</button>
          </div>
        </div>
        {!collapsed ? <div className="dwh-favorite-folder-body">{items.map((item) => <FavoriteRow key={item.id} item={item} onSelect={() => onSelectTable(item.tableId)} onRemove={() => onStoreChange(removeDwhFavoriteFromFolder(item.id, folder.id))} onAliasChange={(alias) => onStoreChange(setDwhFavoriteAlias(item.id, alias))} />)}</div> : null}
      </section>
    </DropZone>
  )
}

export function DwhFavoritesPanel({ store, onStoreChange, onSelectTable }: { store: DwhFavoritesStore; onStoreChange: (store: DwhFavoritesStore) => void; onSelectTable: (tableId: number) => void }) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set(store.folders.map((folder) => folder.id)))
  const [filter, setFilter] = useState('')
  const [tableResults, setTableResults] = useState<DwhTable[]>([])
  const [searching, setSearching] = useState(false)
  const [placementTable, setPlacementTable] = useState<DwhTable>()
  const [newFolderId, setNewFolderId] = useState<string>()
  useEffect(() => {
    const query = filter.trim()
    if (query.length < 2) {
      setTableResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void listDwhTables(query).then((results) => {
        if (!cancelled) setTableResults(results)
      }).finally(() => {
        if (!cancelled) setSearching(false)
      })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filter])
  const filtered = store.tables
  const rootItems = filtered.filter(isDwhFavoriteInRoot)
  const placeTable = (table: DwhTable, folderId?: string) => {
    const name = table.schemaName ? `${table.schemaName}.${table.tableName}` : table.tableName
    const existing = store.tables.find((item) => item.tableId === table.tableId)
    if (existing) {
      if (folderId && isDwhFavoriteInFolder(existing, folderId)) {
        window.alert('Bu tablo klasörde zaten bulunuyor.')
      } else {
        onStoreChange(folderId ? moveDwhFavorite(existing.id, folderId) : addDwhFavoriteToRoot(existing.id))
      }
      setPlacementTable(undefined)
      return
    }
    const added = addDwhFavorite(table.tableId, name)
    const favorite = added.tables.find((item) => item.tableId === table.tableId)
    onStoreChange(folderId && favorite ? moveDwhFavorite(favorite.id, folderId) : added)
    setPlacementTable(undefined)
  }
  return (
    <div className="dwh-favorites-panel">
      <div className="dwh-favorites-toolbar">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Tablo ara..." aria-label="Tablo ara" />
        <button type="button" className="dwh-favorite-add-folder" onClick={() => {
          const next = addDwhFavoriteFolder('Yeni klasör')
          onStoreChange(next)
          const folder = next.folders[next.folders.length - 1]
          if (folder) {
            setCollapsedFolders((current) => {
              const updated = new Set(current)
              updated.delete(folder.id)
              return updated
            })
            setNewFolderId(folder.id)
          }
        }}>+ Klasör</button>
      </div>
      {filter.trim().length >= 2 ? (
        <div className="dwh-favorite-search-results">
          {searching ? <p className="dwh-favorites-empty">Tablolar aranıyor...</p> : tableResults.length ? tableResults.map((table) => {
            const name = table.schemaName ? `${table.schemaName}.${table.tableName}` : table.tableName
            return (
              <div key={table.id} className="dwh-favorite-search-row" draggable onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'table', tableId: table.tableId, name }))
                event.dataTransfer.effectAllowed = 'copy'
              }}>
                <button type="button" className="dwh-favorite-search-main" onClick={() => setPlacementTable(table)} title={name}>
                  <strong>{name}</strong>
                  <small>{table.layer ?? 'Katman yok'} · {table.columnCount} kolon</small>
                </button>
                <span className="dwh-favorite-search-hint">Yerleştir</span>
              </div>
            )
          }) : <p className="dwh-favorites-empty">{searching ? 'Tablolar aranıyor...' : 'Tablo bulunamadı.'}</p>}
        </div>
      ) : (
      <DropZone onDrop={(payload, folderId) => {
        if (payload.kind === 'favorite') onStoreChange(folderId ? moveDwhFavorite(payload.id, folderId) : addDwhFavoriteToRoot(payload.id))
        else placeTable({ tableId: payload.tableId, tableName: payload.name.split('.').pop() ?? payload.name, schemaName: payload.name.includes('.') ? payload.name.slice(0, payload.name.lastIndexOf('.')) : null } as DwhTable, folderId)
      }}>
        <div className="dwh-favorites-section-title">Favoriler</div>
        {rootItems.map((item) => <FavoriteRow key={item.id} item={item} onSelect={() => onSelectTable(item.tableId)} onRemove={() => onStoreChange(removeDwhFavoriteFromRoot(item.id))} onAliasChange={(alias) => onStoreChange(setDwhFavoriteAlias(item.id, alias))} />)}
      </DropZone>
      )}
      {store.folders.map((folder) => <FolderBlock key={folder.id} folder={folder} items={filtered.filter((item) => isDwhFavoriteInFolder(item, folder.id))} collapsed={collapsedFolders.has(folder.id)} autoEdit={newFolderId === folder.id} onToggle={() => setCollapsedFolders((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next })} onStoreChange={onStoreChange} onSelectTable={onSelectTable} />)}
      {!store.tables.length ? <p className="dwh-favorites-empty">Haritadaki bir tabloyu favorilere ekleyin.</p> : null}
      {placementTable ? (
        <div className="dwh-favorite-placement-backdrop" role="presentation" onClick={() => setPlacementTable(undefined)}>
          <div className="dwh-favorite-placement" role="dialog" aria-label="Favori klasörü seç" onClick={(event) => event.stopPropagation()}>
            <strong>{placementTable.schemaName ? `${placementTable.schemaName}.${placementTable.tableName}` : placementTable.tableName}</strong>
            <span>Tabloyu nereye eklemek istersiniz?</span>
            <button type="button" onClick={() => placeTable(placementTable)}>Favoriler</button>
            {store.folders.map((folder) => <button key={folder.id} type="button" onClick={() => placeTable(placementTable, folder.id)}>{folder.name}</button>)}
            <button type="button" className="is-cancel" onClick={() => setPlacementTable(undefined)}>Vazgeç</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
