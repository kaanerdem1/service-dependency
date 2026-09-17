/**
 * Süreç haritası hover / sürükleme vurgusu (Faz 3b).
 *
 * Ne yapar: Hover ve drag id’sini tutar; leave sırasında sürükleme varsa hover
 *   silinmez (titreme / rebuild yok).
 * Ne yapmaz: Kenar yeniden hesaplamaz, not kaydetmez — `onDragStop` çağıran
 *   bileşen persist/refresh yapar.
 */
import { useCallback, useRef, useState } from 'react'
import type { Node } from 'reactflow'

export function useProcessFlowHover(opts?: { skipNotes?: boolean; skipDummy?: boolean }) {
  const skipNotes = opts?.skipNotes ?? false
  const skipDummy = opts?.skipDummy ?? false
  const [hoverId, setHoverId] = useState<string>()
  const [dragId, setDragId] = useState<string>()
  const dragRef = useRef<string | undefined>(undefined)
  const dragMovedRef = useRef(false)

  const onNodeMouseEnter = useCallback(
    (_: unknown, node: Node) => {
      if (skipNotes && node.type === 'processNote') return
      if (skipDummy && (node.data as { kind?: string } | undefined)?.kind === 'dummy') return
      setHoverId(node.id)
    },
    [skipDummy, skipNotes],
  )

  const onNodeMouseLeave = useCallback(() => {
    if (!dragRef.current) setHoverId(undefined)
  }, [])

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragMovedRef.current = false
    dragRef.current = node.id
    setDragId(node.id)
    setHoverId(node.id)
  }, [])

  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    dragMovedRef.current = true
    dragRef.current = node.id
    setDragId(node.id)
  }, [])

  const clearDrag = useCallback(() => {
    dragRef.current = undefined
    setDragId(undefined)
    window.setTimeout(() => {
      dragMovedRef.current = false
    }, 0)
  }, [])

  return {
    hoverId,
    dragId,
    dragMovedRef,
    onNodeMouseEnter,
    onNodeMouseLeave,
    onNodeDragStart,
    onNodeDrag,
    clearDrag,
  }
}
