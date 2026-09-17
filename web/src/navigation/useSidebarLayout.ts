/**
 * Sol modül paneli: genişlik, sabitleme, hover ile aç/kapa, dar ekranda kısma.
 *
 * Ne yapmaz: Ağaç seçimi veya drawer içeriği (bunlar App / useNavDrawers).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { SnapshotTrailContextValue } from '../snapshot/trail'

export function useSidebarLayout(trail: SnapshotTrailContextValue) {
  const [navHover, setNavHover] = useState(true)
  const [navPinned, setNavPinned] = useState(true)
  const [navWidth, setNavWidth] = useState(300)
  const navWidthPreferredRef = useRef(300)
  const [allowNavCollapse, setAllowNavCollapse] = useState(false)
  const navExpanded = navPinned || navHover || !allowNavCollapse
  const appFrameStyle = {
    '--sidebar-panel-width': `${navWidth}px`,
  } as CSSProperties

  const toggleNavPinned = useCallback(() => {
    setNavPinned((pinned) => {
      const next = !pinned
      if (next) setNavHover(true)
      trail.record(
        'sidebar_toggle',
        undefined,
        next
          ? 'Modül paneli sabitlendi'
          : 'Modül paneli sabitlemesi kaldırıldı',
      )
      return next
    })
  }, [trail])

  const startNavResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = navWidth
      let latestWidth = startWidth
      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(
          272,
          Math.min(460, startWidth + moveEvent.clientX - startX),
        )
        latestWidth = nextWidth
        setNavWidth(nextWidth)
      }
      const handleUp = () => {
        navWidthPreferredRef.current = latestWidth
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [navWidth],
  )

  useEffect(() => {
    const NARROW_MAX = 1100
    const rail = 76
    const minMapViewport = 340
    const clampNav = () => {
      const w = window.innerWidth
      if (w >= NARROW_MAX) {
        setNavWidth(navWidthPreferredRef.current)
        return
      }
      const cap = Math.max(240, Math.min(460, w - rail - minMapViewport))
      setNavWidth((current) => (current > cap ? cap : current))
    }
    clampNav()
    window.addEventListener('resize', clampNav)
    return () => window.removeEventListener('resize', clampNav)
  }, [])

  return {
    navHover,
    setNavHover,
    navPinned,
    navExpanded,
    navWidth,
    allowNavCollapse,
    setAllowNavCollapse,
    appFrameStyle,
    toggleNavPinned,
    startNavResize,
  }
}
