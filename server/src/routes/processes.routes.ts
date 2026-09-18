import type { Express } from 'express'
import { isInventoryCatalog } from '../inventory/config.js'
import { assertCatalogWrite } from '../inventory/catalogWriteAccess.js'
import { patchProcessNodeDescriptions, type NodeDescriptionPatch } from '../inventory/processNodeDescriptions.js'
import { getProcessFlow, listProcesses, listProcessScreens, resolveProcessRefs } from '../inventory/processFlowService.js'
import { listServiceProcesses } from '../inventory/contextService.js'
import { getCatalogService } from '../lib/catalogHelpers.js'

/** Süreç kataloğu API (`/api/processes/*`, servise bağlı süreç listesi). */
export function registerProcessRoutes(app: Express) {
  app.get('/api/processes', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined
      res.json(await listProcesses(q))
    } catch (e) {
      console.error('[inventory] /api/processes', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })

  app.get('/api/processes/:no/flow', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const flow = await getProcessFlow(req.params.no)
      if (!flow) return res.status(404).json({ error: 'not_found' })
      res.json(flow)
    } catch (e) {
      console.error('[inventory] /api/processes/:no/flow', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })

  app.patch('/api/processes/:no/node-descriptions', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      assertCatalogWrite(req)
      const nodeKey = typeof req.body?.nodeKey === 'string' ? req.body.nodeKey : ''
      const patch: NodeDescriptionPatch = {
        nodeKey,
        delete: req.body?.delete === true,
      }
      if (req.body?.title !== undefined) {
        patch.title = typeof req.body.title === 'string' ? req.body.title : null
      }
      if (req.body?.text !== undefined) {
        patch.text = typeof req.body.text === 'string' ? req.body.text : null
      }
      const doc = await patchProcessNodeDescriptions(req.params.no, patch)
      if (!doc) return res.status(404).json({ error: 'not_found' })
      res.json({ nodeDescriptions: doc })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'patch_failed'
      if (msg === 'forbidden_catalog_edit') {
        res.status(403).json({ error: msg })
        return
      }
      if (msg === 'node_descriptions_unavailable') {
        res.status(503).json({ error: msg })
        return
      }
      console.error('[inventory] PATCH /api/processes/:no/node-descriptions', e)
      res.status(400).json({ error: msg })
    }
  })

  app.post('/api/processes/resolve-refs', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const nos = Array.isArray(req.body?.nos)
        ? req.body.nos.filter((n: unknown) => typeof n === 'string')
        : []
      res.json(await resolveProcessRefs(nos))
    } catch (e) {
      console.error('[inventory] /api/processes/resolve-refs', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })

  app.get('/api/processes/:no/screens', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      res.json(await listProcessScreens(req.params.no))
    } catch (e) {
      console.error('[inventory] /api/processes/:no/screens', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })

  app.get('/api/services/:id/processes', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    const svc = await getCatalogService(req.params.id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
    try {
      res.json(await listServiceProcesses(req.params.id))
    } catch (e) {
      console.error('[inventory] /api/services/:id/processes', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
}
