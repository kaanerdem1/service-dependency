import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  readShortcuts,
  SHORTCUTS_CHANGED_EVENT,
  toggleFavorite as toggleFavoriteStore,
  type ShortcutsStore,
} from './serviceShortcuts'

export function useServiceFavorites() {
  const [store, setStore] = useState<ShortcutsStore>(() => readShortcuts())

  useEffect(() => {
    const sync = () => setStore(readShortcuts())
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, sync)
  }, [])

  const favoritedIds = useMemo(
    () => new Set(store.shortcuts.map((s) => s.serviceId)),
    [store.shortcuts],
  )

  const isFavorite = useCallback(
    (serviceId: string) => favoritedIds.has(serviceId),
    [favoritedIds],
  )

  const toggleFavorite = useCallback((serviceId: string, canonicalName: string) => {
    setStore(toggleFavoriteStore(serviceId, canonicalName))
  }, [])

  return { store, favoritedIds, isFavorite, toggleFavorite }
}
