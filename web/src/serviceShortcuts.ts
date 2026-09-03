export const SHORTCUTS_CHANGED_EVENT = 'sd-shortcuts-changed'

const STORAGE_KEY = 'sd-service-shortcuts:v1'
const MAX_SHORTCUTS = 24
const MAX_FOLDERS = 8

export type FolderTone = 'none' | 'critical' | 'team' | 'temp'

export const FOLDER_TONES: { id: FolderTone; label: string }[] = [
  { id: 'none', label: 'Yok' },
  { id: 'critical', label: 'Kritik' },
  { id: 'team', label: 'Ekip' },
  { id: 'temp', label: 'Geçici' },
]

export type ShortcutFolder = {
  id: string
  name: string
  tone?: FolderTone
}

export type ServiceShortcut = {
  id: string
  serviceId: string
  /** DB servis adı — alias yoksa gösterilir */
  canonicalName: string
  alias?: string
  folderId?: string
}

export type ShortcutsStore = {
  folders: ShortcutFolder[]
  shortcuts: ServiceShortcut[]
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const EMPTY: ShortcutsStore = { folders: [], shortcuts: [] }

const TONES = new Set<FolderTone>(['none', 'critical', 'team', 'temp'])

function normalizeTone(raw: unknown): FolderTone | undefined {
  if (typeof raw !== 'string') return undefined
  if (!TONES.has(raw as FolderTone) || raw === 'none') return undefined
  return raw as FolderTone
}

function normalize(raw: unknown): ShortcutsStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const o = raw as Record<string, unknown>
  const folders = Array.isArray(o.folders)
    ? o.folders
        .filter(
          (f): f is ShortcutFolder =>
            typeof f === 'object' &&
            f != null &&
            typeof (f as ShortcutFolder).id === 'string' &&
            typeof (f as ShortcutFolder).name === 'string',
        )
        .map((f) => {
          const tone = normalizeTone((f as ShortcutFolder).tone)
          return tone ? { ...f, tone } : { id: f.id, name: f.name }
        })
        .slice(0, MAX_FOLDERS)
    : []
  const shortcuts = Array.isArray(o.shortcuts)
    ? o.shortcuts
        .filter(
          (s): s is ServiceShortcut =>
            typeof s === 'object' &&
            s != null &&
            typeof (s as ServiceShortcut).id === 'string' &&
            typeof (s as ServiceShortcut).serviceId === 'string' &&
            typeof (s as ServiceShortcut).canonicalName === 'string',
        )
        .slice(0, MAX_SHORTCUTS)
    : []
  return { folders, shortcuts }
}

export function readShortcuts(): ShortcutsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { folders: [], shortcuts: [] }
    return normalize(JSON.parse(raw))
  } catch {
    return { folders: [], shortcuts: [] }
  }
}

function writeShortcuts(store: ShortcutsStore): ShortcutsStore {
  const next = normalize(store)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT))
  return next
}

export function toggleFavorite(
  serviceId: string,
  canonicalName: string,
): ShortcutsStore {
  const store = readShortcuts()
  const existing = store.shortcuts.find((s) => s.serviceId === serviceId)
  if (existing) return removeShortcut(existing.id)
  return addShortcut(serviceId, canonicalName)
}

export function displayShortcutName(s: ServiceShortcut): string {
  const alias = s.alias?.trim()
  return alias || s.canonicalName
}

export function addShortcut(
  serviceId: string,
  canonicalName: string,
  folderId?: string,
): ShortcutsStore {
  const store = readShortcuts()
  if (!serviceId.startsWith('sd-')) return store
  if (store.shortcuts.some((s) => s.serviceId === serviceId)) return store
  if (store.shortcuts.length >= MAX_SHORTCUTS) return store
  const validFolder =
    folderId && store.folders.some((f) => f.id === folderId) ? folderId : undefined
  const entry: ServiceShortcut = {
    id: newId('sc'),
    serviceId,
    canonicalName: canonicalName.trim() || serviceId,
    folderId: validFolder,
  }
  return writeShortcuts({
    ...store,
    shortcuts: [...store.shortcuts, entry],
  })
}

export function removeShortcut(shortcutId: string): ShortcutsStore {
  const store = readShortcuts()
  return writeShortcuts({
    ...store,
    shortcuts: store.shortcuts.filter((s) => s.id !== shortcutId),
  })
}

export function setShortcutAlias(shortcutId: string, alias: string): ShortcutsStore {
  const store = readShortcuts()
  const trimmed = alias.trim()
  return writeShortcuts({
    ...store,
    shortcuts: store.shortcuts.map((s) =>
      s.id === shortcutId
        ? { ...s, alias: trimmed || undefined }
        : s,
    ),
  })
}

export function moveShortcut(shortcutId: string, folderId?: string): ShortcutsStore {
  const store = readShortcuts()
  const validFolder =
    folderId && store.folders.some((f) => f.id === folderId) ? folderId : undefined
  return writeShortcuts({
    ...store,
    shortcuts: store.shortcuts.map((s) =>
      s.id === shortcutId ? { ...s, folderId: validFolder } : s,
    ),
  })
}

export function addFolder(name: string, tone?: FolderTone): ShortcutsStore {
  const store = readShortcuts()
  if (store.folders.length >= MAX_FOLDERS) return store
  const trimmed = name.trim() || 'Yeni klasör'
  const nextTone = normalizeTone(tone)
  return writeShortcuts({
    ...store,
    folders: [
      ...store.folders,
      {
        id: newId('fd'),
        name: trimmed,
        ...(nextTone ? { tone: nextTone } : {}),
      },
    ],
  })
}

export function renameFolder(folderId: string, name: string): ShortcutsStore {
  const store = readShortcuts()
  const trimmed = name.trim()
  if (!trimmed) return store
  return writeShortcuts({
    ...store,
    folders: store.folders.map((f) =>
      f.id === folderId ? { ...f, name: trimmed } : f,
    ),
  })
}

export function setFolderTone(folderId: string, tone: FolderTone): ShortcutsStore {
  const store = readShortcuts()
  const nextTone = normalizeTone(tone)
  return writeShortcuts({
    ...store,
    folders: store.folders.map((f) => {
      if (f.id !== folderId) return f
      if (!nextTone) {
        const { tone: _drop, ...rest } = f
        return rest
      }
      return { ...f, tone: nextTone }
    }),
  })
}

export function deleteFolder(folderId: string): ShortcutsStore {
  const store = readShortcuts()
  return writeShortcuts({
    folders: store.folders.filter((f) => f.id !== folderId),
    shortcuts: store.shortcuts.map((s) =>
      s.folderId === folderId ? { ...s, folderId: undefined } : s,
    ),
  })
}

export function syncCanonicalName(serviceId: string, canonicalName: string): ShortcutsStore {
  const store = readShortcuts()
  const trimmed = canonicalName.trim()
  if (!trimmed) return store
  return writeShortcuts({
    ...store,
    shortcuts: store.shortcuts.map((s) =>
      s.serviceId === serviceId ? { ...s, canonicalName: trimmed } : s,
    ),
  })
}
