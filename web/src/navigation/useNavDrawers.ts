/**
 * Sol kenar çubuğundaki "Favoriler" ve "İş akışları" drawer'larının
 * açık/kapalı state'i ve klavye kısayolları.
 *
 * Ne yapar:
 *   - `shortcutsOpen` (Favoriler) ve `workflowsOpen` (İş akışları) state'ini
 *     tutar; ikisi aynı anda açık olamaz (birini açan diğerini kapatır —
 *     bu kural burada değil, çağıran taraftaki `set...` çağrılarında
 *     korunuyor, hook sadece ham state'i sağlıyor).
 *   - Yüzey (`surface`) "services" dışına çıkınca (örn. DWH'ye geçilince)
 *     iki drawer'ı da kapatır.
 *   - Servis yüzeyindeyken hangi drawer'ın açık olduğunu `lastServicesDrawerRef`
 *     içinde tutar — bu, `appNavPersist.ts` ile sayfa yenilemesinde "kaldığın
 *     yerden devam" için kullanılır.
 *   - `Alt/Cmd` tuş kısayollarını (bkz. `panelShortcuts.ts`) dinler.
 *
 * Ne yapmaz:
 *   - Komut paletini (⌘K) yönetmez — sadece açıksa kapatması için
 *     `onCloseCommandPalette` callback'i çağrılır.
 *   - Persisted nav'a yazma yapmaz — `lastServicesDrawerRef.current`'ı okuyup
 *     yazan yer hâlâ `App.tsx`'teki genel "nav'ı localStorage'a yaz" efekti.
 *
 * İlgili: docs/refactor-plan.md — Faz 1.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { matchPanelShortcut } from '../panelShortcuts'
import type { AppSurface } from '../components/SurfaceSwitch'
import type { PersistedSidebarDrawer } from '../appNavPersist'

type Params = {
  surface: AppSurface
  initialShortcutsOpen: boolean
  initialWorkflowsOpen: boolean
  /** Sayfa yenilemesinde geri yüklenen son drawer bilgisi (varsa). */
  restoredDrawer?: PersistedSidebarDrawer
  /** Favoriler/İş akışları kısayolu basıldığında komut paletini kapatmak için. */
  onCloseCommandPalette: () => void
}

type Result = {
  shortcutsOpen: boolean
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>
  workflowsOpen: boolean
  setWorkflowsOpen: Dispatch<SetStateAction<boolean>>
  /** Persisted nav yazımı için: son açık olan drawer ('shortcuts' | 'workflows' | 'none'). */
  lastServicesDrawerRef: React.RefObject<PersistedSidebarDrawer>
}

export function useNavDrawers({
  surface,
  initialShortcutsOpen,
  initialWorkflowsOpen,
  restoredDrawer,
  onCloseCommandPalette,
}: Params): Result {
  const [shortcutsOpen, setShortcutsOpen] = useState(initialShortcutsOpen)
  const [workflowsOpen, setWorkflowsOpen] = useState(initialWorkflowsOpen)
  const lastServicesDrawerRef = useRef<PersistedSidebarDrawer>(
    restoredDrawer ??
      (initialWorkflowsOpen ? 'workflows' : initialShortcutsOpen ? 'shortcuts' : 'none'),
  )

  // Servis dışı bir yüzeye geçilince (örn. DWH) iki drawer'ı da kapat;
  // servis yüzeyindeyken hangi drawer açık, hafızada tut.
  useEffect(() => {
    if (surface !== 'services') {
      setShortcutsOpen(false)
      setWorkflowsOpen(false)
      return
    }
    lastServicesDrawerRef.current = shortcutsOpen
      ? 'shortcuts'
      : workflowsOpen
        ? 'workflows'
        : 'none'
  }, [surface, shortcutsOpen, workflowsOpen])

  // Klavye kısayolları: yalnızca servis yüzeyinde çalışır. Not: burada
  // metin kutusuna yazarken de kısayol tetiklenir (App.tsx'teki genel ⌘K
  // dinleyicisinin aksine) — mevcut davranış korundu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (surface !== 'services') return
      if (matchPanelShortcut(e, 'favorites')) {
        e.preventDefault()
        e.stopPropagation()
        onCloseCommandPalette()
        setWorkflowsOpen(false)
        setShortcutsOpen((v) => !v)
        return
      }
      if (matchPanelShortcut(e, 'workflows')) {
        e.preventDefault()
        e.stopPropagation()
        onCloseCommandPalette()
        setShortcutsOpen(false)
        setWorkflowsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [surface, onCloseCommandPalette])

  return {
    shortcutsOpen,
    setShortcutsOpen,
    workflowsOpen,
    setWorkflowsOpen,
    lastServicesDrawerRef,
  }
}
