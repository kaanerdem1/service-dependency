/**
 * Gelen kutusu ve değişiklik talebi (CR) modal akışı.
 *
 * Veri: mock/API `getInbox`, `getChangeRequest`, `markInboxRead`.
 */

import { useCallback, useEffect, useState } from 'react'
import { getChangeRequest, getInbox, markInboxRead } from '../api/client'
import type { ChangeRequest, ImpactedFlag, InboxNotification } from '../types'
import type { SessionUser } from '../mock/session'

export function useInboxAndChangeRequests(
  session: SessionUser | undefined,
  onRequestLoadError?: (message: string) => void,
) {
  const [crOpen, setCrOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inbox, setInbox] = useState<{
    actions: { request: ChangeRequest; row: ImpactedFlag }[]
    updates: InboxNotification[]
    pending: number
  }>()
  const [requestDetail, setRequestDetail] = useState<ChangeRequest>()
  const [returnToInbox, setReturnToInbox] = useState(false)

  const refreshInbox = useCallback(async () => {
    if (!session) return
    try {
      const data = await getInbox(session.id)
      setInbox(data)
    } catch {
      /* mock */
    }
  }, [session])

  useEffect(() => {
    void refreshInbox()
  }, [refreshInbox])

  const openRequestDetail = useCallback(
    async (requestId: string, fromInbox = false) => {
      try {
        const req = await getChangeRequest(requestId)
        setRequestDetail(req)
        if (fromInbox) {
          setReturnToInbox(true)
          setInboxOpen(false)
        } else {
          setReturnToInbox(false)
        }
      } catch {
        onRequestLoadError?.('Talep yüklenemedi')
      }
    },
    [onRequestLoadError],
  )

  const backToInbox = useCallback(() => {
    setRequestDetail(undefined)
    setReturnToInbox(false)
    setInboxOpen(true)
    void refreshInbox()
  }, [refreshInbox])

  const markAllInboxRead = useCallback(() => {
    if (!session) return
    void markInboxRead(session.id).then(() => refreshInbox())
  }, [session, refreshInbox])

  const closeRequestDetail = useCallback(() => {
    if (returnToInbox) backToInbox()
    else setRequestDetail(undefined)
  }, [returnToInbox, backToInbox])

  return {
    crOpen,
    setCrOpen,
    inboxOpen,
    setInboxOpen,
    inbox,
    requestDetail,
    setRequestDetail,
    returnToInbox,
    refreshInbox,
    openRequestDetail,
    backToInbox,
    markAllInboxRead,
    closeRequestDetail,
  }
}
