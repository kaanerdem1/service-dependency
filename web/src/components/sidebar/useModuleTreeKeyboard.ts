import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

function isTextEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function navRows(scrollEl: HTMLElement): HTMLElement[] {
  return Array.from(
    scrollEl.querySelectorAll<HTMLElement>('[data-tree-nav]:not(.skeleton)'),
  )
}

function rowNavId(row: HTMLElement): string {
  return row.dataset.treeNav ?? ''
}

function findAnchorIndex(rows: HTMLElement[]): number {
  return rows.findIndex(
    (row) =>
      row.classList.contains('is-kbd-focus') ||
      row.classList.contains('selected') ||
      row.classList.contains('catalog-selected') ||
      Boolean(row.querySelector('.selected')),
  )
}

function applyFocusClass(scrollEl: HTMLElement, navId: string | null) {
  for (const row of scrollEl.querySelectorAll<HTMLElement>('[data-tree-nav]')) {
    row.classList.toggle('is-kbd-focus', navId != null && rowNavId(row) === navId)
  }
}

function blurTreeDomFocus(scrollEl: HTMLElement) {
  const active = document.activeElement
  if (active instanceof HTMLElement && scrollEl.contains(active) && active !== scrollEl) {
    active.blur()
  }
}

function keepTreeKeyFocus(scrollEl: HTMLElement) {
  blurTreeDomFocus(scrollEl)
  if (document.activeElement !== scrollEl) {
    scrollEl.focus({ preventScroll: true })
  }
}

type Options = {
  enabled: boolean
  scrollParentRef?: RefObject<HTMLElement | null>
  treeRef?: RefObject<HTMLElement | null>
}

export function useModuleTreeKeyboard({
  enabled,
  scrollParentRef,
  treeRef,
}: Options) {
  const [kbdNavId, setKbdNavId] = useState<string | null>(null)
  const kbdNavIdRef = useRef<string | null>(null)

  const syncFocusClass = useCallback(() => {
    const scrollEl = scrollParentRef?.current
    if (!scrollEl) return
    applyFocusClass(scrollEl, kbdNavIdRef.current)
  }, [scrollParentRef])

  const setFocus = useCallback(
    (id: string | null) => {
      kbdNavIdRef.current = id
      setKbdNavId(id)
      const scrollEl = scrollParentRef?.current
      if (scrollEl) {
        applyFocusClass(scrollEl, id)
        if (id) keepTreeKeyFocus(scrollEl)
      }
    },
    [scrollParentRef],
  )

  useEffect(() => {
    if (!enabled) setFocus(null)
  }, [enabled, setFocus])

  useEffect(() => {
    const scrollEl = scrollParentRef?.current
    const treeEl = treeRef?.current
    if (!enabled || !scrollEl) return

    const resolveAnchorRow = (): HTMLElement | null => {
      const rows = navRows(scrollEl)
      if (rows.length === 0) return null
      const id = kbdNavIdRef.current
      if (id) {
        const hit = scrollEl.querySelector<HTMLElement>(`[data-tree-nav="${CSS.escape(id)}"]`)
        if (hit) return hit
      }
      const idx = findAnchorIndex(rows)
      return idx >= 0 ? rows[idx]! : null
    }

    const focusRow = (id: string | null) => {
      setFocus(id)
      if (!id) return
      scrollEl
        .querySelector<HTMLElement>(`[data-tree-nav="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    const move = (delta: number) => {
      const rows = navRows(scrollEl)
      if (rows.length === 0) return
      const ids = rows.map(rowNavId)
      let idx = kbdNavIdRef.current ? ids.indexOf(kbdNavIdRef.current) : -1
      if (idx < 0) {
        idx = findAnchorIndex(rows)
        if (idx < 0) {
          if (delta <= 0) return
          idx = -1
        }
      }
      idx = Math.max(0, Math.min(rows.length - 1, idx + delta))
      focusRow(ids[idx] ?? null)
    }

    const focusedRow = (): HTMLElement | null => {
      const id = kbdNavIdRef.current
      if (!id) return null
      return scrollEl.querySelector<HTMLElement>(`[data-tree-nav="${CSS.escape(id)}"]`)
    }

    const toggleExpand = (row: HTMLElement) => {
      row.querySelector<HTMLButtonElement>('.chev-btn')?.click()
    }

    const activate = (row: HTMLElement) => {
      const label = row.querySelector<HTMLButtonElement>('.tree-label-btn')
      if (label) {
        label.click()
        return
      }
      if (row.matches('button.tree-row')) row.click()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabled) return
      if (isTextEditing(e.target)) return

      const inSidebar = Boolean((e.target as HTMLElement)?.closest?.('.module-sidebar'))
      const treeKeyActive =
        kbdNavIdRef.current != null ||
        document.activeElement === scrollEl ||
        scrollEl.contains(document.activeElement)
      if (!inSidebar && !treeKeyActive) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
        return
      }

      let row = focusedRow()
      if (!row) {
        row = resolveAnchorRow()
        if (!row) return
        if (['Enter', ' ', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
          e.preventDefault()
          focusRow(rowNavId(row))
        } else {
          return
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        activate(row)
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        toggleExpand(row)
        return
      }

      const chev = row.querySelector<HTMLButtonElement>('.chev-btn')
      if (e.key === 'ArrowRight') {
        if (chev?.getAttribute('aria-expanded') === 'false') {
          e.preventDefault()
          chev.click()
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        if (chev?.getAttribute('aria-expanded') === 'true') {
          e.preventDefault()
          chev.click()
        }
      }
    }

    const onTreeClick = (e: MouseEvent) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-tree-nav]')
      if (!row) return
      setFocus(rowNavId(row))
      requestAnimationFrame(() => keepTreeKeyFocus(scrollEl))
    }

    scrollEl.tabIndex = -1

    window.addEventListener('keydown', onKeyDown)
    treeEl?.addEventListener('click', onTreeClick)
    scrollEl.addEventListener('scroll', syncFocusClass, { passive: true })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      treeEl?.removeEventListener('click', onTreeClick)
      scrollEl.removeEventListener('scroll', syncFocusClass)
      applyFocusClass(scrollEl, null)
    }
  }, [enabled, scrollParentRef, treeRef, syncFocusClass, setFocus])

  const clearFocus = useCallback(() => {
    setFocus(null)
  }, [setFocus])

  const focusNavId = useCallback(
    (navId: string | null) => {
      setFocus(navId)
    },
    [setFocus],
  )

  return { kbdNavId, clearFocus, focusNavId }
}
