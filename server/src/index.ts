import cors from 'cors'
import express from 'express'
import {
  affectsEdges,
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
import { assertCanCreateRequest } from './permissions.js'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/session-users', (_req, res) => {
  res.json(SESSION_USERS)
})

app.get('/api/modules', (_req, res) => {
  res.json(moduleTree)
})

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

app.get('/api/services/:id/affected', (req, res) => {
  const ids = affectsEdges[req.params.id] ?? []
  res.json(
    ids
      .map((id) => services[id])
      .filter(Boolean)
      .map((service) => ({ service, hop: 1 })),
  )
})

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
    res.status(201).json(created)
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
    const cr = setFlag({
      requestId: req.params.id,
      serviceId: req.params.serviceId,
      flag: req.body.flag,
      note: req.body.note,
      actorOwnerId: req.body.actorOwnerId,
    })
    if (!cr) return res.status(404).json({ error: 'not_found_or_forbidden' })
    res.json(cr)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'bad_request' })
  }
})

app.listen(PORT, () => {
  console.log(`API http://127.0.0.1:${PORT}`)
})
