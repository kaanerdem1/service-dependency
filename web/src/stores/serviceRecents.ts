const STORAGE_KEY = 'sd-service-recents'
const MAX_RECENTS = 10

export type ServiceRecent = {
  id: string
  name: string
  at: number
}

export function readServiceRecents(): ServiceRecent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (row): row is ServiceRecent =>
          typeof row === 'object' &&
          row != null &&
          typeof (row as ServiceRecent).id === 'string' &&
          typeof (row as ServiceRecent).name === 'string',
      )
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

/** Servis açıldığında çağır — MRU listesi (gezinme yolundan bağımsız). */
export function pushServiceRecent(id: string, name: string): ServiceRecent[] {
  if (!id.startsWith('sd-')) return readServiceRecents()
  const now = Date.now()
  const trimmed = name.trim() || id
  const prev = readServiceRecents().filter((r) => r.id !== id)
  const next: ServiceRecent[] = [{ id, name: trimmed, at: now }, ...prev].slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return next
}

export function renameServiceRecent(id: string, name: string): ServiceRecent[] {
  const list = readServiceRecents()
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return list
  const next = [...list]
  next[idx] = { ...next[idx]!, name: name.trim() || next[idx]!.name }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
