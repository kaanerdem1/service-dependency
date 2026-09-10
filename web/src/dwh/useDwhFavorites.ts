import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DWH_FAVORITES_CHANGED_EVENT,
  readDwhFavorites,
  toggleDwhFavorite,
  type DwhFavoritesStore,
} from './dwhFavorites'

export function useDwhFavorites() {
  const [store, setStore] = useState<DwhFavoritesStore>(() => readDwhFavorites())

  useEffect(() => {
    const sync = () => setStore(readDwhFavorites())
    window.addEventListener(DWH_FAVORITES_CHANGED_EVENT, sync)
    return () => window.removeEventListener(DWH_FAVORITES_CHANGED_EVENT, sync)
  }, [])

  const favoriteTableIds = useMemo(
    () => new Set(store.tables.map((table) => table.tableId)),
    [store.tables],
  )
  const isFavorite = useCallback(
    (tableId: number) => favoriteTableIds.has(tableId),
    [favoriteTableIds],
  )
  const toggleFavorite = useCallback((tableId: number, name: string) => {
    setStore(toggleDwhFavorite(tableId, name))
  }, [])

  return { store, favoriteTableIds, isFavorite, toggleFavorite, setStore }
}
