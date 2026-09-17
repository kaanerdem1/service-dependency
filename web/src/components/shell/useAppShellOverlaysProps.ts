/**
 * `AppShellOverlays` prop nesnesi — App kabuğundan ayrıştırılmış.
 */

import { useCallback, useMemo, type ComponentProps } from 'react'
import type { AppShellOverlays } from './AppShellOverlays'
import type { SelectPivotFn } from '../../navigation/useProcessFlowNav'

type OverlaysInput = {
  snapshotToast?: string
  setSnapshotToast: React.Dispatch<React.SetStateAction<string | undefined>>
  cmdkOpen: boolean
  setCmdkOpen: React.Dispatch<React.SetStateAction<boolean>>
  appTheme: ComponentProps<typeof AppShellOverlays>['appTheme']
  frequentRecents: ComponentProps<typeof AppShellOverlays>['frequentRecents']
  visitTrailForCmdk: ComponentProps<typeof AppShellOverlays>['visitTrailForCmdk']
  selectPivot: SelectPivotFn
  selectMethod: ComponentProps<typeof AppShellOverlays>['onSelectMethod']
  setInboxOpen: React.Dispatch<React.SetStateAction<boolean>>
  drawers: {
    setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>
    setWorkflowsOpen: React.Dispatch<React.SetStateAction<boolean>>
  }
  cr: {
    crOpen: boolean
    setCrOpen: React.Dispatch<React.SetStateAction<boolean>>
    service?: ComponentProps<typeof AppShellOverlays>['service']
    session?: ComponentProps<typeof AppShellOverlays>['session']
    affected: ComponentProps<typeof AppShellOverlays>['affected']
    buildSnapshotContext: ComponentProps<
      typeof AppShellOverlays
    >['buildSnapshotContext']
    refreshInbox: () => void
  }
  inbox: {
    inboxOpen: boolean
    inbox?: ComponentProps<typeof AppShellOverlays>['inbox']
    openRequestDetail: (id: string, fromInbox?: boolean) => void
    setInboxOpen: React.Dispatch<React.SetStateAction<boolean>>
    markAllInboxRead: () => void
    requestDetail?: ComponentProps<typeof AppShellOverlays>['requestDetail']
    returnToInbox: boolean
    backToInbox: () => void
    closeRequestDetail: () => void
    setRequestDetail: React.Dispatch<
      React.SetStateAction<
        ComponentProps<typeof AppShellOverlays>['requestDetail']
      >
    >
  }
}

export function useAppShellOverlaysProps(
  input: OverlaysInput,
): ComponentProps<typeof AppShellOverlays> {
  const onToggleFavoritesDrawer = useCallback(() => {
    input.drawers.setWorkflowsOpen(false)
    input.drawers.setShortcutsOpen((v) => !v)
  }, [input.drawers])

  const onToggleWorkflowsDrawer = useCallback(() => {
    input.drawers.setShortcutsOpen(false)
    input.drawers.setWorkflowsOpen((v) => !v)
  }, [input.drawers])

  return useMemo(
    (): ComponentProps<typeof AppShellOverlays> => ({
      snapshotToast: input.snapshotToast,
      onDismissSnapshotToast: () => input.setSnapshotToast(undefined),
      cmdkOpen: input.cmdkOpen,
      onCmdkOpenChange: input.setCmdkOpen,
      appTheme: input.appTheme,
      frequentRecents: input.frequentRecents,
      visitTrailForCmdk: input.visitTrailForCmdk,
      onSelectServiceFromCmdk: (id) =>
        input.selectPivot(id, { resetHistory: true, source: 'search' }),
      onSelectMethod: input.selectMethod,
      onOpenInbox: () => input.setInboxOpen(true),
      onToggleFavoritesDrawer,
      onToggleWorkflowsDrawer,
      crOpen: input.cr.crOpen,
      service: input.cr.service,
      session: input.cr.session,
      affected: input.cr.affected,
      buildSnapshotContext: input.cr.buildSnapshotContext,
      onCloseCr: () => input.cr.setCrOpen(false),
      onCrCreated: () => {
        input.cr.setCrOpen(false)
        input.setSnapshotToast(
          'Talep açıldı — Snapshot sekmesinden PNG indirebilirsiniz',
        )
        void input.cr.refreshInbox()
      },
      inboxOpen: input.inbox.inboxOpen,
      inbox: input.inbox.inbox,
      onOpenRequest: (id) => void input.inbox.openRequestDetail(id, true),
      onCloseInbox: () => input.inbox.setInboxOpen(false),
      onMarkInboxRead: input.inbox.markAllInboxRead,
      requestDetail: input.inbox.requestDetail,
      returnToInbox: input.inbox.returnToInbox,
      onBackToInbox: input.inbox.backToInbox,
      onCloseRequestDetail: input.inbox.closeRequestDetail,
      onRequestUpdated: (req) => {
        input.inbox.setRequestDetail(req)
        input.setSnapshotToast('Onay kaydedildi — snapshot alındı')
        void input.cr.refreshInbox()
      },
    }),
    [
      input,
      onToggleFavoritesDrawer,
      onToggleWorkflowsDrawer,
    ],
  )
}
