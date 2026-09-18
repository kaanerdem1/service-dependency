import type { Express } from 'express'
import { moduleTree, SESSION_USERS } from '../data.js'
import { getCatalogSource, isInventoryCatalog } from '../inventory/config.js'
import { pingInventory } from '../inventory/db.js'
import { getArtifactDetail, getGroupDetail } from '../inventory/catalogEntityService.js'
import { listModuleChildren, listModuleRoots } from '../inventory/treeService.js'

export function registerHealthAndTreeRoutes(app: Express) {
  app.get('/api/health', async (_req, res) => {
    const catalog = getCatalogSource()
    const payload: {
      ok: boolean
      catalog: string
      inventory?: { ok: boolean; error?: string }
    } = { ok: true, catalog }
  
    if (isInventoryCatalog()) {
      try {
        await pingInventory()
        payload.inventory = { ok: true }
      } catch (e) {
        payload.ok = false
        payload.inventory = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }
  
    res.status(payload.ok ? 200 : 503).json(payload)
  })
  
  app.get('/api/session-users', (_req, res) => {
    res.json(SESSION_USERS)
  })
  
  app.get('/api/modules', async (_req, res) => {
    if (isInventoryCatalog()) {
      try {
        res.json(await listModuleRoots())
        return
      } catch (e) {
        console.error('[inventory] /api/modules', e)
        res.status(500).json({ error: 'inventory_error' })
        return
      }
    }
    res.json(moduleTree)
  })
  
  app.get('/api/modules/:nodeId/children', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const limit = Number(req.query.limit ?? 50)
      const offset = Number(req.query.offset ?? 0)
      const sort = req.query.sort === 'degree' ? 'degree' : 'name'
      const anchorServiceId =
        typeof req.query.anchorServiceId === 'string' ? req.query.anchorServiceId : undefined
      res.json(
        await listModuleChildren(req.params.nodeId, {
          limit,
          offset,
          sort,
          anchorServiceId,
        }),
      )
    } catch (e) {
      console.error('[inventory] /api/modules/:nodeId/children', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/catalog/group/:nodeId', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const detail = await getGroupDetail(req.params.nodeId)
      if (!detail) return res.status(404).json({ error: 'not_found' })
      res.json(detail)
    } catch (e) {
      console.error('[inventory] /api/catalog/group/:nodeId', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
  
  app.get('/api/catalog/artifact/:nodeId', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const detail = await getArtifactDetail(req.params.nodeId)
      if (!detail) return res.status(404).json({ error: 'not_found' })
      res.json(detail)
    } catch (e) {
      console.error('[inventory] /api/catalog/artifact/:nodeId', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })
}
