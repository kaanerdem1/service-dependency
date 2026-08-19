/**
 * Oturum boyunca UI gezinme izi — snapshot paketine gider.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type {
  SnapshotClientPayload,
  SnapshotFocus,
  SnapshotViewState,
  TrailAction,
  TrailEntry,
  UiChromeState,
} from '../types'

type SnapshotTrailContextValue = {
  record: (action: TrailAction, target?: TrailEntry['target']) => void
  syncUi: (patch: Partial<UiChromeState>) => void
  syncView: (view: SnapshotViewState) => void
  syncFocus: (focus: SnapshotFocus) => void
  getClientPayload: () => Omit<SnapshotClientPayload, 'screenshots'>
}

const SnapshotTrailContext = createContext<SnapshotTrailContextValue | null>(null)

const defaultUi: UiChromeState = {
  activeTab: 'map',
  drawerOpen: true,
  sidebarOpen: true,
  searchOpen: false,
  selectedMethodId: null,
}

const defaultView: SnapshotViewState = {
  layout: 'ltr',
  visibleMaxHop: 1,
  maxHopAvailable: 1,
  showCascadeEdges: false,
}

export function SnapshotTrailProvider({ children }: { children: ReactNode }) {
  const trailRef = useRef<TrailEntry[]>([])
  const uiRef = useRef<UiChromeState>({ ...defaultUi })
  const viewRef = useRef<SnapshotViewState>({ ...defaultView })
  const focusRef = useRef<SnapshotFocus>({
    level: 'service',
    id: '',
    label: '',
    treePath: [],
    serviceId: '',
  })

  const record = useCallback(
    (action: TrailAction, target?: TrailEntry['target']) => {
      trailRef.current.push({
        at: new Date().toISOString(),
        action,
        target,
        uiAfter: { ...uiRef.current },
      })
    },
    [],
  )

  const syncUi = useCallback((patch: Partial<UiChromeState>) => {
    uiRef.current = { ...uiRef.current, ...patch }
  }, [])

  const syncView = useCallback((view: SnapshotViewState) => {
    viewRef.current = view
  }, [])

  const syncFocus = useCallback((focus: SnapshotFocus) => {
    focusRef.current = focus
  }, [])

  const getClientPayload = useCallback((): Omit<
    SnapshotClientPayload,
    'screenshots'
  > => {
    return {
      navigationTrail: [...trailRef.current],
      uiChrome: { ...uiRef.current },
      viewState: { ...viewRef.current },
      focus: { ...focusRef.current },
    }
  }, [])

  const value = useMemo(
    () => ({ record, syncUi, syncView, syncFocus, getClientPayload }),
    [record, syncUi, syncView, syncFocus, getClientPayload],
  )

  return (
    <SnapshotTrailContext.Provider value={value}>
      {children}
    </SnapshotTrailContext.Provider>
  )
}

export function useSnapshotTrail() {
  const ctx = useContext(SnapshotTrailContext)
  if (!ctx) {
    throw new Error('useSnapshotTrail: SnapshotTrailProvider gerekli')
  }
  return ctx
}

export function useSnapshotTrailOptional() {
  return useContext(SnapshotTrailContext)
}
