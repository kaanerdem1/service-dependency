import type { Express } from 'express'
import { getDownstreamIds, getUpstreamIds, services } from '../data.js'
import { IMPACT_VIEW, buildImpactGraph } from '../impact.js'
import { listRequestsForService } from '../changeRequests.js'
import { createNote, deleteNote, listNotesForService, noteCountsForServices } from '../notes.js'
import { isInventoryCatalog } from '../inventory/config.js'
import { buildInventoryImpactGraph, getInventoryDownstreamIds, getInventoryUpstreamIds } from '../inventory/graphService.js'
import { getServiceTreePath } from '../inventory/location.js'
import { listNonServiceMethodsForArtifact, parseNodeId } from '../inventory/treeService.js'
import { getServiceCatalogContext, listServiceScreens } from '../inventory/contextService.js'
import { getServiceById, listServiceLocations, resolveServiceNames, searchServices as searchInventoryServices } from '../inventory/serviceService.js'
import { getCatalogService, toAffectedList, toAffectedMock } from '../lib/catalogHelpers.js'

export function registerServicesRoutes(app: Express) {
  app.get('/api/services', async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    const limit = Number(req.query.limit ?? 50)
    const offset = Number(req.query.offset ?? 0)
  
    if (isInventoryCatalog()) {
      try {
        res.json(await searchInventoryServices(q, limit, offset))
        return
      } catch (e) {
        console.error('[inventory] /api/services', e)
        res.status(500).json({ error: 'inventory_error' })
        return
      }
    }
  
    const qLower = q.toLowerCase()
    let list = Object.values(services)
    if (qLower) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(qLower) ||
          s.owner?.name.toLowerCase().includes(qLower) ||
          s.owner?.team?.toLowerCase().includes(qLower),
      )
    }
    res.json(list)
  })
  
  app.post('/api/services/resolve-names', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const names = Array.isArray(req.body?.names)
        ? req.body.names.filter((n: unknown) => typeof n === 'string')
        : []
      res.json(await resolveServiceNames(names))
    } catch (e) {
      console.error('[inventory] /api/services/resolve-names', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/services/:id', async (req, res) => {
    if (isInventoryCatalog()) {
      try {
        const svc = await getServiceById(req.params.id)
        if (!svc) return res.status(404).json({ error: 'not_found' })
        res.json(svc)
        return
      } catch (e) {
        console.error('[inventory] /api/services/:id', e)
        res.status(500).json({ error: 'inventory_error' })
        return
      }
    }
  
    const svc = services[req.params.id]
    if (!svc) return res.status(404).json({ error: 'not_found' })
    res.json(svc)
  })
  
  app.get('/api/services/:id/tree-path', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    const svc = await getCatalogService(req.params.id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    try {
      const path = await getServiceTreePath(req.params.id)
      res.json({ path })
    } catch (e) {
      console.error('[inventory] /api/services/:id/tree-path', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/services/:id/locations', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    const svc = await getCatalogService(req.params.id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    try {
      res.json(await listServiceLocations(req.params.id))
    } catch (e) {
      console.error('[inventory] /api/services/:id/locations', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/services/:id/context', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    const svc = await getCatalogService(req.params.id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    try {
      const ctx = await getServiceCatalogContext(req.params.id)
      res.json(ctx ?? {})
    } catch (e) {
      console.error('[inventory] /api/services/:id/context', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/services/:id/screens', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    const svc = await getCatalogService(req.params.id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    try {
      res.json(await listServiceScreens(req.params.id))
    } catch (e) {
      console.error('[inventory] /api/services/:id/screens', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/modules/:nodeId/non-service-methods', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    const parsed = parseNodeId(req.params.nodeId)
    if (!parsed || parsed.prefix !== 'art') {
      return res.status(400).json({ error: 'artifact_required' })
    }
    const limit = Number(req.query.limit ?? 50)
    const offset = Number(req.query.offset ?? 0)
    try {
      res.json(await listNonServiceMethodsForArtifact(parsed.id, limit, offset))
    } catch (e) {
      console.error('[inventory] non-service-methods', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  /** Downstream = beni çağıranlar (etkilenenler / onay kümesi). */
  app.get('/api/services/:id/affected', async (req, res) => {
    const id = req.params.id
    const svc = await getCatalogService(id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    if (isInventoryCatalog()) {
      res.json(await toAffectedList(getInventoryDownstreamIds(id)))
      return
    }
    res.json(toAffectedMock(getDownstreamIds(id)))
  })
  
  /** Upstream + downstream tek cevapta. */
  app.get('/api/services/:id/neighbors', async (req, res) => {
    const id = req.params.id
    const svc = await getCatalogService(id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    if (isInventoryCatalog()) {
      res.json({
        upstream: await toAffectedList(getInventoryUpstreamIds(id)),
        downstream: await toAffectedList(getInventoryDownstreamIds(id)),
      })
      return
    }
    res.json({
      upstream: toAffectedMock(getUpstreamIds(id)),
      downstream: toAffectedMock(getDownstreamIds(id)),
    })
  })
  
  /** Harita / etki yolu: BFS ile 2–3 hop (mode=simple|advanced düğüm bütçesi). */
  app.get('/api/services/:id/impact', async (req, res) => {
    const id = req.params.id
    const svc = await getCatalogService(id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
  
    const mode = req.query.mode === 'advanced' ? 'advanced' : 'simple'
    const maxNodes =
      mode === 'simple' ? IMPACT_VIEW.maxNodesSimple : IMPACT_VIEW.maxNodesAdvanced
  
    if (isInventoryCatalog()) {
      const graph = buildInventoryImpactGraph(id, maxNodes)
      if (!graph) return res.status(404).json({ error: 'not_found' })
      res.json(graph)
      return
    }
  
    const graph = buildImpactGraph(id, maxNodes)
    if (!graph) return res.status(404).json({ error: 'not_found' })
    res.json(graph)
  })
  
  app.get('/api/services/:id/change-requests', (req, res) => {
    res.json(listRequestsForService(req.params.id))
  })
  
  /** Servis notları — viewerId query ile görünürlük filtresi */
  app.get('/api/services/:id/notes', async (req, res) => {
    const id = req.params.id
    const svc = await getCatalogService(id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    const viewerId = String(req.query.viewerId ?? '')
    if (!viewerId) return res.status(400).json({ error: 'viewerId_required' })
    res.json(listNotesForService(id, viewerId))
  })
  
  app.post('/api/services/:id/notes', async (req, res) => {
    const id = req.params.id
    const svc = await getCatalogService(id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
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
}
