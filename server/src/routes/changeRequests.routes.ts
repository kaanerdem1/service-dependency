import type { Express } from 'express'
import { createChangeRequest, getChangeRequest, getInbox, markNotificationsRead, setFlag } from '../changeRequests.js'
import { assertCanCreateRequest } from '../permissions.js'
import { createSnapshot, getSnapshot, getSnapshotImage, listSnapshotsForRequest } from '../snapshots.js'
import type { SnapshotClientPayload } from '../snapshotTypes.js'
import { catalogDownstreamIds } from '../lib/catalogHelpers.js'

export function registerChangeRequestRoutes(app: Express) {
  app.post('/api/change-requests', (req, res) => {
    const body = req.body ?? {}
    if (!body.summary || !body.rationale || !body.personId) {
      return res.status(400).json({ error: 'missing_fields' })
    }
    const kind = body.kind === 'new_service' ? 'new_service' : 'change'
    const affectedServiceIds = Array.isArray(body.affectedServiceIds)
      ? body.affectedServiceIds
      : kind === 'change' && body.targetServiceId
        ? catalogDownstreamIds(body.targetServiceId)
        : []
    if (kind === 'change' && affectedServiceIds.length === 0) {
      return res.status(400).json({ error: 'no_affected' })
    }
    if (kind === 'change' && !body.targetServiceId) {
      return res.status(400).json({ error: 'target_required' })
    }
    if (kind === 'new_service' && !String(body.proposedServiceName ?? '').trim()) {
      return res.status(400).json({ error: 'proposed_name_required' })
    }
    try {
      assertCanCreateRequest({
        kind,
        personId: body.personId,
        targetServiceId: body.targetServiceId,
        proposedPackageId: body.proposedPackageId,
      })
      const created = createChangeRequest({
        kind,
        targetServiceId: body.targetServiceId,
        proposedServiceName: body.proposedServiceName,
        proposedProjectId: body.proposedProjectId,
        proposedPackageId: body.proposedPackageId,
        summary: body.summary,
        rationale: body.rationale,
        description: body.description,
        serviceImpact: body.serviceImpact,
        dataImpact: body.dataImpact,
        personId: body.personId,
        personName: body.personName ?? body.personId,
        team: body.team,
        department: body.department,
        affectedServiceIds,
      })
      const snapshotContext = body.snapshotContext as SnapshotClientPayload | undefined
      let snapshots: ReturnType<typeof createSnapshot>[] = []
      if (snapshotContext && created.length > 0) {
        const changeSummary = {
          title: body.summary,
          reason: body.rationale,
        }
        for (const cr of created) {
          try {
            snapshots.push(
              createSnapshot({
                type: 'cr_open',
                actor: {
                  userId: body.personId,
                  displayName: body.personName ?? body.personId,
                },
                changeRequestId: cr.id,
                relatedRequestIds: created.map((c) => c.id),
                batchId: cr.batchId,
                client: {
                  ...snapshotContext,
                  changeSummary,
                },
              }),
            )
          } catch (e) {
            console.warn('[snapshot] cr_open failed', cr.id, e)
          }
        }
      }
      res.status(201).json({ requests: created, snapshots })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'bad_request'
      const status =
        msg.startsWith('forbidden') || msg === 'unknown_user' ? 403 : 400
      res.status(status).json({ error: msg })
    }
  })
  
  app.get('/api/change-requests/:id', (req, res) => {
    const cr = getChangeRequest(req.params.id)
    if (!cr) return res.status(404).json({ error: 'not_found' })
    res.json(cr)
  })
  
  app.get('/api/inbox/:ownerId', (req, res) => {
    res.json(getInbox(req.params.ownerId))
  })
  
  app.post('/api/inbox/:ownerId/read', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined
    res.json({ updates: markNotificationsRead(req.params.ownerId, ids) })
  })
  
  app.patch('/api/change-requests/:id/flags/:serviceId', (req, res) => {
    try {
      const wasOpen = (() => {
        const prev = getChangeRequest(req.params.id)
        return prev ? prev.impacted.every((i) => i.flag === 'accepted') : false
      })()
      const cr = setFlag({
        requestId: req.params.id,
        serviceId: req.params.serviceId,
        flag: req.body.flag,
        note: req.body.note,
        actorOwnerId: req.body.actorOwnerId,
      })
      if (!cr) return res.status(404).json({ error: 'not_found_or_forbidden' })
      const snapshotContext = req.body.snapshotContext as SnapshotClientPayload | undefined
      const snapshots: ReturnType<typeof createSnapshot>[] = []
      if (snapshotContext) {
        try {
          const row = cr.impacted.find((i) => i.serviceId === req.params.serviceId)
          snapshots.push(
            createSnapshot({
              type: 'approval',
              actor: {
                userId: req.body.actorOwnerId,
                displayName: row?.ownerName,
              },
              changeRequestId: cr.id,
              client: snapshotContext,
              approvals: [
                {
                  ownerId: req.body.actorOwnerId,
                  serviceId: req.params.serviceId,
                  flag: req.body.flag,
                  note: req.body.note?.trim() || undefined,
                  at: new Date().toISOString(),
                },
              ],
            }),
          )
          const nowOpen = cr.impacted.every((i) => i.flag === 'accepted')
          if (nowOpen && !wasOpen) {
            snapshots.push(
              createSnapshot({
                type: 'gate_open',
                actor: {
                  userId: req.body.actorOwnerId,
                  displayName: row?.ownerName,
                },
                changeRequestId: cr.id,
                client: snapshotContext,
                approvals: cr.impacted.map((i) => ({
                  ownerId: i.ownerId ?? '',
                  serviceId: i.serviceId,
                  flag: i.flag,
                  note: i.note,
                  at: cr.updatedAt,
                })),
              }),
            )
          }
        } catch (e) {
          console.warn('[snapshot] approval failed', e)
        }
      }
      res.json({ request: cr, snapshots })
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'bad_request' })
    }
  })
  
  app.post('/api/snapshots', (req, res) => {
    const body = req.body ?? {}
    if (!body.personId || !body.client) {
      return res.status(400).json({ error: 'missing_fields' })
    }
    try {
      const snapshot = createSnapshot({
        type: 'explore',
        actor: {
          userId: body.personId,
          displayName: body.personName ?? body.personId,
        },
        changeRequestId: body.changeRequestId,
        client: body.client as SnapshotClientPayload,
      })
      res.status(201).json(snapshot)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'bad_request'
      res.status(400).json({ error: msg })
    }
  })
  
  app.get('/api/snapshots/:id', (req, res) => {
    const snap = getSnapshot(req.params.id)
    if (!snap) return res.status(404).json({ error: 'not_found' })
    res.json(snap)
  })
  
  app.get('/api/snapshots/:id/image', (req, res) => {
    const surface = String(req.query.surface ?? 'map')
    const image = getSnapshotImage(req.params.id, surface)
    if (!image) return res.status(404).json({ error: 'image_not_found' })
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'private, immutable')
    res.send(image.buffer)
  })
  
    app.get('/api/change-requests/:id/snapshots', (req, res) => {
      res.json(listSnapshotsForRequest(req.params.id))
    })
}
