/**
 * Komut paleti (⌘K / Ctrl+K) ve Esc ile kapatma.
 *
 * Favoriler / iş akışları kısayolları `useNavDrawers` içindedir.
 */

import { useEffect } from 'react'
import { isTextEditingTarget } from './appShellHelpers'

export function useCommandPaletteKeyboard(
  cmdkOpen: boolean,
  setCmdkOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdkOpen(true)
        return
      }

      if (e.key === 'Escape' && cmdkOpen) {
        e.preventDefault()
        setCmdkOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [cmdkOpen, setCmdkOpen])
}
