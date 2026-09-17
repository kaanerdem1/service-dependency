/**
 * Uygulama navigasyonunun localStorage’a yazılması.
 *
 * Ne yapar: Sekme, pivot, geçmiş, süreç/rota, drawer hafızası — `appNavPersist` anahtarı.
 * Ne yapmaz: Okuma (App mount’ta `readPersistedAppNav`).
 */

import { useEffect, type MutableRefObject } from 'react'
import {
  writePersistedAppNav,
  type PersistedAppNav,
  type PersistedSidebarDrawer,
} from '../appNavPersist'

type PersistedFields = Omit<PersistedAppNav, 'v' | 'sidebarDrawer' | 'treeQuery'> & {
  treeQuery: string
  sidebarDrawerRef: MutableRefObject<PersistedSidebarDrawer>
}

export function usePersistedAppNav({
  surface,
  tab,
  pivotId,
  selectedMethodId,
  catalogNode,
  processFlowNo,
  processRouteId,
  workflowInfoId,
  workflowResumeId,
  processFlowStack,
  history,
  historyIndex,
  treeQuery,
  sidebarDrawerRef,
}: PersistedFields): void {
  useEffect(() => {
    writePersistedAppNav({
      v: 1,
      surface,
      sidebarDrawer: sidebarDrawerRef.current,
      tab,
      pivotId,
      selectedMethodId,
      catalogNode,
      processFlowNo,
      processRouteId,
      workflowInfoId,
      workflowResumeId,
      processFlowStack,
      history,
      historyIndex,
      treeQuery: treeQuery.trim() || undefined,
    })
  }, [
    surface,
    tab,
    pivotId,
    selectedMethodId,
    catalogNode,
    processFlowNo,
    processRouteId,
    workflowInfoId,
    workflowResumeId,
    processFlowStack,
    history,
    historyIndex,
    treeQuery,
    sidebarDrawerRef,
  ])
}
