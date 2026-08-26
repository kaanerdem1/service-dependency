/**
 * Express API girişi (varsayılan :4000).
 *
 * Katmanlar:
 * - data.ts          → servis kataloğu + affectsEdges (servis bağımlılığı)
 * - methods.ts       → method kataloğu + callEdges (call-graph)
 * - impact.ts        → servis etki grafı (BFS hop)
 * - changeRequests.ts → talep / flag / inbox
 * - permissions.ts   → kim talep açabilir
 * - notes.ts         → servis notları (MVP)
 *
 * Vite UI `/api/*` isteklerini buraya proxy eder.
 */
import cors from 'cors'
import express from 'express'
import {
  affectsEdges,
  getDownstreamIds,
  getUpstreamIds,
  moduleTree,
  services,
  SESSION_USERS,
} from './data.js'
import {
  createChangeRequest,
  getChangeRequest,
  getInbox,
  listRequestsForService,
  markNotificationsRead,
  setFlag,
} from './changeRequests.js'
import { IMPACT_VIEW, buildImpactGraph } from './impact.js'
import {
  buildMethodImpactGraph,
  checkCallGraphConsistency,
  getCalleeRefs,
  getCallerRefs,
  getMethod,
  listMethodRefsForService,
  listMethodsLinkedToPivot,
  methodImpact,
  searchMethods,
} from './methods.js'
import { assertCanCreateRequest } from './permissions.js'
import {
  createNote,
  deleteNote,
  listNotesForService,
  noteCountsForServices,
} from './notes.js'
import {
  createSnapshot,
  getSnapshot,
  getSnapshotImage,
  listSnapshotsForRequest,
} from './snapshots.js'
import type { SnapshotClientPayload } from './snapshotTypes.js'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json({ limit: '15mb' }))

// —— Sağlık / oturum / ağaç ——
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/session-users', (_req, res) => {
  res.json(SESSION_USERS)
})

app.get('/api/modules', (_req, res) => {
  res.json(moduleTree)
})

// —— Servis kataloğu + komşular / etki ——
app.get('/api/services', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase()
  let list = Object.values(services)
  if (q) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.owner?.name.toLowerCase().includes(q) ||
        s.owner?.team?.toLowerCase().includes(q),
    )
  }
  res.json(list)
})

app.get('/api/services/:id', (req, res) => {
  const svc = services[req.params.id]
  if (!svc) return res.status(404).json({ error: 'not_found' })
  res.json(svc)
})

/** Onay listesi ve bağımlılık paneli: yalnız hop=1 (doğrudan komşu). */
function toAffected(ids: string[]) {
  return ids
    .map((id) => services[id])
    .filter(Boolean)
    .map((service) => ({ service, hop: 1 as const }))
}

/** Downstream = beni çağıranlar (etkilenenler / onay kümesi). */
app.get('/api/services/:id/affected', (req, res) => {
  res.json(toAffected(getDownstreamIds(req.params.id)))
})

/** Upstream + downstream tek cevapta. */
app.get('/api/services/:id/neighbors', (req, res) => {
  const id = req.params.id
  if (!services[id]) return res.status(404).json({ error: 'not_found' })
  res.json({
    upstream: toAffected(getUpstreamIds(id)),
    downstream: toAffected(getDownstreamIds(id)),
  })
})

/** Harita / etki yolu: BFS ile 2–3 hop (mode=simple|advanced düğüm bütçesi). */
app.get('/api/services/:id/impact', (req, res) => {
  const mode = req.query.mode === 'advanced' ? 'advanced' : 'simple'
  const maxNodes =
    mode === 'simple' ? IMPACT_VIEW.maxNodesSimple : IMPACT_VIEW.maxNodesAdvanced
  const graph = buildImpactGraph(req.params.id, maxNodes)
  if (!graph) return res.status(404).json({ error: 'not_found' })
  res.json(graph)
})

app.get('/api/services/:id/change-requests', (req, res) => {
  res.json(listRequestsForService(req.params.id))
})

/** Servis notları — viewerId query ile görünürlük filtresi */
app.get('/api/services/:id/notes', (req, res) => {
  const id = req.params.id
  if (!services[id]) return res.status(404).json({ error: 'not_found' })
  const viewerId = String(req.query.viewerId ?? '')
  if (!viewerId) return res.status(400).json({ error: 'viewerId_required' })
  res.json(listNotesForService(id, viewerId))
})

app.post('/api/services/:id/notes', (req, res) => {
  const id = req.params.id
  if (!services[id]) return res.status(404).json({ error: 'not_found' })
  const body = req.body ?? {}
  try {
    const note = createNote({
      serviceId: id,
      authorId: String(body.authorId ?? ''),
      body: String(body.body ?? ''),
      visibility: body.visibility === 'all' ? 'all' : 'team',
    })
    res.status(201).json(note)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bad_request'
    const status =
      msg === 'unknown_user' || msg === 'forbidden_not_author' ? 403 : 400
    res.status(status).json({ error: msg })
  }
})

app.delete('/api/notes/:noteId', (req, res) => {
  const actorId = String(req.query.actorId ?? req.body?.actorId ?? '')
  if (!actorId) return res.status(400).json({ error: 'actorId_required' })
  try {
    const ok = deleteNote(req.params.noteId, actorId)
    if (!ok) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bad_request'
    res.status(msg.startsWith('forbidden') ? 403 : 400).json({ error: msg })
  }
})

/** Harita rozetleri: ?ids=a,b,c&viewerId= */
app.get('/api/notes/counts', (req, res) => {
  const viewerId = String(req.query.viewerId ?? '')
  if (!viewerId) return res.status(400).json({ error: 'viewerId_required' })
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  res.json(noteCountsForServices(ids, viewerId))
})

// —— Method kataloğu + call-graph ——
app.get('/api/services/:id/methods', (req, res) => {
  if (!services[req.params.id]) return res.status(404).json({ error: 'not_found' })
  // ?linkedTo=pivotId → haritada “bağlı metodlar” filtresi
  const linkedTo = String(req.query.linkedTo ?? '').trim()
  if (linkedTo) {
    if (!services[linkedTo]) return res.status(404).json({ error: 'pivot_not_found' })
    return res.json(listMethodsLinkedToPivot(req.params.id, linkedTo))
  }
  res.json(listMethodRefsForService(req.params.id))
})

app.get('/api/methods', (req, res) => {
  const q = String(req.query.q ?? '')
  res.json(searchMethods(q))
})

app.get('/api/methods/:id', (req, res) => {
  const method = getMethod(req.params.id)
  if (!method) return res.status(404).json({ error: 'not_found' })
  const refs = listMethodRefsForService(method.serviceId)
  const ref = refs.find((m) => m.id === method.id)
  res.json(ref ?? method)
})

/** Lazy: bu metodu çağıranlar (1 hop). */
app.get('/api/methods/:id/callers', (req, res) => {
  if (!getMethod(req.params.id)) return res.status(404).json({ error: 'not_found' })
  res.json(getCallerRefs(req.params.id))
})

/** Lazy: bu metodun çağırdıkları (1 hop). */
app.get('/api/methods/:id/callees', (req, res) => {
  if (!getMethod(req.params.id)) return res.status(404).json({ error: 'not_found' })
  res.json(getCalleeRefs(req.params.id))
})

/** Özet blast: kaç method / kaç servis etkilenir. */
app.get('/api/methods/:id/impact', (req, res) => {
  const impact = methodImpact(req.params.id)
  if (!impact) return res.status(404).json({ error: 'not_found' })
  res.json(impact)
})

/** Method haritası için katmanlı çağıran grafı. */
app.get('/api/methods/:id/impact-graph', (req, res) => {
  const graph = buildMethodImpactGraph(req.params.id)
  if (!graph) return res.status(404).json({ error: 'not_found' })
  res.json(graph)
})

/** Geliştirici aracı: callEdges ↔ affectsEdges tutarlı mı? */
app.get('/api/meta/call-graph-consistency', (_req, res) => {
  const issues = checkCallGraphConsistency()
  res.json({ ok: issues.length === 0, issueCount: issues.length, issues })
})

// —— Değişiklik talebi / inbox / flag ——
app.post('/api/change-requests', (req, res) => {
  const body = req.body ?? {}
  if (!body.summary || !body.rationale || !body.personId) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  const kind = body.kind === 'new_service' ? 'new_service' : 'change'
  const affectedServiceIds = Array.isArray(body.affectedServiceIds)
    ? body.affectedServiceIds
    : kind === 'change' && body.targetServiceId
      ? (affectsEdges[body.targetServiceId] ?? [])
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

app.listen(PORT, () => {
  // Boot’ta tutarlılık uyarısı (zorunlu değil; mock bozulursa console’da görünür)
  const issues = checkCallGraphConsistency()
  if (issues.length) {
    console.warn(`[call-graph] ${issues.length} tutarlılık uyarısı — GET /api/meta/call-graph-consistency`)
  } else {
    console.log('[call-graph] metod ↔ affectsEdges tutarlı')
  }
  console.log(`API http://127.0.0.1:${PORT}`)
})
