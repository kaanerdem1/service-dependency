/**
 * Kabuk overlay’leri — komut paleti, talep/gelen kutusu modalları, toast.
 */
import { AnimatePresence } from 'motion/react'
import { MotionToast } from '../../motion/MotionToast'
import { ChangeRequestModal } from '../ChangeRequestModal'
import { CommandPalette } from '../CommandPalette'
import { InboxPanel } from '../InboxPanel'
import { RequestDetailModal } from '../RequestDetailModal'
import type { AppTheme } from '../../theme'
import type { SessionUser } from '../../mock/session'
import type {
  AffectedService,
  ChangeRequest,
  Service,
  SnapshotClientPayload,
} from '../../types'

type Props = {
  snapshotToast?: string
  onDismissSnapshotToast: () => void
  cmdkOpen: boolean
  onCmdkOpenChange: (open: boolean) => void
  appTheme: AppTheme
  frequentRecents: { id: string; name: string }[]
  visitTrailForCmdk: { id: string; name: string }[]
  onSelectServiceFromCmdk: (id: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
  onOpenInbox: () => void
  onToggleFavoritesDrawer: () => void
  onToggleWorkflowsDrawer: () => void
  crOpen: boolean
  service?: Service
  session?: SessionUser
  affected: AffectedService[]
  buildSnapshotContext: () => Promise<SnapshotClientPayload | undefined>
  onCloseCr: () => void
  onCrCreated: () => void
  inboxOpen: boolean
  inbox?: {
    actions: { request: ChangeRequest; row: import('../../types').ImpactedFlag }[]
    updates: import('../../types').InboxNotification[]
  }
  onOpenRequest: (id: string) => void
  onCloseInbox: () => void
  onMarkInboxRead: () => void
  requestDetail?: ChangeRequest
  returnToInbox: boolean
  onBackToInbox?: () => void
  onCloseRequestDetail: () => void
  onRequestUpdated: (req: ChangeRequest) => void
}

export function AppShellOverlays({
  snapshotToast,
  onDismissSnapshotToast,
  cmdkOpen,
  onCmdkOpenChange,
  appTheme,
  frequentRecents,
  visitTrailForCmdk,
  onSelectServiceFromCmdk,
  onSelectMethod,
  onOpenInbox,
  onToggleFavoritesDrawer,
  onToggleWorkflowsDrawer,
  crOpen,
  service,
  session,
  affected,
  buildSnapshotContext,
  onCloseCr,
  onCrCreated,
  inboxOpen,
  inbox,
  onOpenRequest,
  onCloseInbox,
  onMarkInboxRead,
  requestDetail,
  returnToInbox,
  onBackToInbox,
  onCloseRequestDetail,
  onRequestUpdated,
}: Props) {
  return (
    <>
      <MotionToast open={!!snapshotToast}>
        {snapshotToast}
        <button type="button" onClick={onDismissSnapshotToast}>
          ×
        </button>
      </MotionToast>

      <CommandPalette
        open={cmdkOpen}
        theme={appTheme}
        onOpenChange={onCmdkOpenChange}
        frequent={frequentRecents}
        visitTrail={visitTrailForCmdk}
        onSelectService={onSelectServiceFromCmdk}
        onSelectMethod={onSelectMethod}
        onOpenInbox={onOpenInbox}
        onOpenFavorites={onToggleFavoritesDrawer}
        onOpenWorkflows={onToggleWorkflowsDrawer}
      />

      <AnimatePresence>
        {crOpen && service && session ? (
          <ChangeRequestModal
            key="cr-modal"
            service={service}
            affected={affected}
            session={session}
            buildSnapshotContext={buildSnapshotContext}
            onClose={onCloseCr}
            onCreated={onCrCreated}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {inboxOpen && session && inbox ? (
          <InboxPanel
            key="inbox-panel"
            actions={inbox.actions}
            updates={inbox.updates}
            onOpen={onOpenRequest}
            onClose={onCloseInbox}
            onMarkRead={onMarkInboxRead}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {requestDetail && session ? (
          <RequestDetailModal
            key={`request-${requestDetail.id}`}
            request={requestDetail}
            session={session}
            buildSnapshotContext={buildSnapshotContext}
            onBackToInbox={returnToInbox ? onBackToInbox : undefined}
            onClose={onCloseRequestDetail}
            onUpdated={onRequestUpdated}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
