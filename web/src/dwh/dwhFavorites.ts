export const DWH_FAVORITES_CHANGED_EVENT = 'sd-dwh-favorites-changed'

const STORAGE_KEY = 'sd-dwh-favorites:v1'
const MAX_FAVORITES = 100
const MAX_FOLDERS = 20

export type DwhFavoriteFolder = {
  id: string
  name: string
}

export type DwhFavoriteTable = {
  id: string
  tableId: number
  canonicalName: string
  alias?: string
  root?: boolean
  folderIds?: string[]
}

export type DwhFavoritesStore = {
  folders: DwhFavoriteFolder[]
  tables: DwhFavoriteTable[]
}

const EMPTY: DwhFavoritesStore = { folders: [], tables: [] }

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function normalize(raw: unknown): DwhFavoritesStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const value = raw as Record<string, unknown>
  const folders = Array.isArray(value.folders)
    ? value.folders
        .filter((folder): folder is DwhFavoriteFolder =>
          typeof folder === 'object' && folder !== null &&
          typeof (folder as DwhFavoriteFolder).id === 'string' &&
          typeof (folder as DwhFavoriteFolder).name === 'string',
        )
        .slice(0, MAX_FOLDERS)
    : []
  const tables = Array.isArray(value.tables)
    ? value.tables
        .filter((table): table is DwhFavoriteTable =>
          typeof table === 'object' && table !== null &&
          typeof (table as DwhFavoriteTable).id === 'string' &&
          typeof (table as DwhFavoriteTable).tableId === 'number' &&
          typeof (table as DwhFavoriteTable).canonicalName === 'string',
        )
        .map((table) => {
          const rawTable = table as DwhFavoriteTable & { folderId?: unknown }
          const legacyFolderIds = typeof rawTable.folderId === 'string' ? [rawTable.folderId] : []
          const folderIds = Array.isArray(rawTable.folderIds)
            ? rawTable.folderIds.filter((id): id is string => typeof id === 'string' && folders.some((folder) => folder.id === id))
            : legacyFolderIds.filter((id) => folders.some((folder) => folder.id === id))
          return {
            ...table,
            root: typeof (table as DwhFavoriteTable).root === 'boolean' ? (table as DwhFavoriteTable).root : folderIds.length === 0,
            folderIds: folderIds.length ? folderIds : undefined,
          }
        })
        .slice(0, MAX_FAVORITES)
    : []
  return { folders, tables }
}

export function readDwhFavorites(): DwhFavoritesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalize(JSON.parse(raw)) : { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}

function writeDwhFavorites(store: DwhFavoritesStore) {
  const next = normalize(store)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* local storage may be unavailable or full */
  }
  window.dispatchEvent(new Event(DWH_FAVORITES_CHANGED_EVENT))
  return next
}

export function addDwhFavorite(tableId: number, canonicalName: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  if (store.tables.some((table) => table.tableId === tableId) || store.tables.length >= MAX_FAVORITES) return store
  return writeDwhFavorites({
    ...store,
    tables: [...store.tables, { id: newId('dwh-fav'), tableId, canonicalName: canonicalName.trim() || `Tablo ${tableId}`, root: true }],
  })
}

export function removeDwhFavorite(favoriteId: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  return writeDwhFavorites({ ...store, tables: store.tables.filter((table) => table.id !== favoriteId) })
}

export function removeDwhFavoriteFromFolder(favoriteId: string, folderId: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  return writeDwhFavorites({
    ...store,
    tables: store.tables.flatMap((table) => {
      if (table.id !== favoriteId) return [table]
      const folderIds = (table.folderIds ?? []).filter((id) => id !== folderId)
      return folderIds.length || table.root ? [{ ...table, folderIds: folderIds.length ? folderIds : undefined }] : []
    }),
  })
}

export function toggleDwhFavorite(tableId: number, canonicalName: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  const existing = store.tables.find((table) => table.tableId === tableId)
  return existing ? removeDwhFavorite(existing.id) : addDwhFavorite(tableId, canonicalName)
}

export function setDwhFavoriteAlias(favoriteId: string, alias: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  const trimmed = alias.trim()
  return writeDwhFavorites({
    ...store,
    tables: store.tables.map((table) => table.id === favoriteId ? { ...table, alias: trimmed || undefined } : table),
  })
}

export function moveDwhFavorite(favoriteId: string, folderId?: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  const validFolder = folderId && store.folders.some((folder) => folder.id === folderId) ? folderId : undefined
  return writeDwhFavorites({
    ...store,
    tables: store.tables.map((table) => {
      if (table.id !== favoriteId) return table
      if (!validFolder) return table
      const folderIds = table.folderIds ?? []
      return { ...table, folderIds: folderIds.includes(validFolder) ? folderIds : [...folderIds, validFolder] }
    }),
  })
}

export function isDwhFavoriteInFolder(table: DwhFavoriteTable, folderId: string) {
  return table.folderIds?.includes(folderId) ?? false
}

export function isDwhFavoriteInRoot(table: DwhFavoriteTable) {
  return table.root ?? !table.folderIds?.length
}

export function addDwhFavoriteToRoot(favoriteId: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  return writeDwhFavorites({
    ...store,
    tables: store.tables.map((table) => table.id === favoriteId ? { ...table, root: true } : table),
  })
}

export function removeDwhFavoriteFromRoot(favoriteId: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  return writeDwhFavorites({
    ...store,
    tables: store.tables.flatMap((table) => {
      if (table.id !== favoriteId) return [table]
      return table.folderIds?.length ? [{ ...table, root: false }] : []
    }),
  })
}

export function addDwhFavoriteFolder(name: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  if (store.folders.length >= MAX_FOLDERS) return store
  const baseName = name.trim() || 'Yeni klasör'
  const names = new Set(store.folders.map((folder) => folder.name.trim().toLocaleLowerCase('tr-TR')))
  let uniqueName = baseName
  let suffix = 1
  while (names.has(uniqueName.toLocaleLowerCase('tr-TR'))) {
    uniqueName = `${baseName} (${suffix})`
    suffix += 1
  }
  return writeDwhFavorites({
    ...store,
    folders: [...store.folders, { id: newId('dwh-folder'), name: uniqueName }],
  })
}

export function renameDwhFavoriteFolder(folderId: string, name: string): DwhFavoritesStore {
  const trimmed = name.trim()
  if (!trimmed) return readDwhFavorites()
  const store = readDwhFavorites()
  return writeDwhFavorites({
    ...store,
    folders: store.folders.map((folder) => folder.id === folderId ? { ...folder, name: trimmed } : folder),
  })
}

export function deleteDwhFavoriteFolder(folderId: string): DwhFavoritesStore {
  const store = readDwhFavorites()
  return writeDwhFavorites({
    folders: store.folders.filter((folder) => folder.id !== folderId),
    tables: store.tables.filter((table) => !isDwhFavoriteInFolder(table, folderId)),
  })
}

export function displayDwhFavoriteName(table: DwhFavoriteTable) {
  return table.alias?.trim() || table.canonicalName
}
