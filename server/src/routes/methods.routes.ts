import type { Express } from 'express'
import { services } from '../data.js'
import { buildMethodImpactGraph, getCalleeRefs, getCallerRefs, getMethod, listMethodRefsForService, listMethodsLinkedToPivot, methodImpact, searchMethods } from '../methods.js'
import { isInventoryCatalog } from '../inventory/config.js'
import { buildInventoryMethodImpactGraph, getCalleeRefs as getInventoryCalleeRefs, getCallerRefs as getInventoryCallerRefs, getMethodRef, listMethodRefsForService as listInventoryMethodRefsForService, methodImpactSummary, searchInventoryMethods } from '../inventory/methodService.js'
import { getCatalogService } from '../lib/catalogHelpers.js'

export function registerMethodsRoutes(app: Express) {
  app.get('/api/services/:id/methods', async (req, res) => {
    const id = req.params.id
    const svc = await getCatalogService(id)
    if (!svc) return res.status(404).json({ error: 'not_found' })
  
    if (isInventoryCatalog()) {
      try {
        res.json(await listInventoryMethodRefsForService(id))
      } catch (e) {
        console.error('[inventory] /api/services/:id/methods', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
  
    const linkedTo = String(req.query.linkedTo ?? '').trim()
    if (linkedTo) {
      if (!services[linkedTo]) return res.status(404).json({ error: 'pivot_not_found' })
      return res.json(listMethodsLinkedToPivot(req.params.id, linkedTo))
    }
    res.json(listMethodRefsForService(req.params.id))
  })
  
  app.get('/api/methods', async (req, res) => {
    const q = String(req.query.q ?? '')
    if (isInventoryCatalog()) {
      try {
        res.json(await searchInventoryMethods(q))
      } catch (e) {
        console.error('[inventory] /api/methods', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
    res.json(searchMethods(q))
  })
  
  app.get('/api/methods/:id', async (req, res) => {
    if (isInventoryCatalog()) {
      try {
        const ref = await getMethodRef(req.params.id)
        if (!ref) return res.status(404).json({ error: 'not_found' })
        res.json(ref)
      } catch (e) {
        console.error('[inventory] /api/methods/:id', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
    const method = getMethod(req.params.id)
    if (!method) return res.status(404).json({ error: 'not_found' })
    const refs = listMethodRefsForService(method.serviceId)
    const ref = refs.find((m) => m.id === method.id)
    res.json(ref ?? method)
  })
  
  app.get('/api/methods/:id/callers', async (req, res) => {
    if (isInventoryCatalog()) {
      try {
        const ref = await getMethodRef(req.params.id)
        if (!ref) return res.status(404).json({ error: 'not_found' })
        res.json(await getInventoryCallerRefs(req.params.id))
      } catch (e) {
        console.error('[inventory] callers', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
    if (!getMethod(req.params.id)) return res.status(404).json({ error: 'not_found' })
    res.json(getCallerRefs(req.params.id))
  })
  
  app.get('/api/methods/:id/callees', async (req, res) => {
    if (isInventoryCatalog()) {
      try {
        const ref = await getMethodRef(req.params.id)
        if (!ref) return res.status(404).json({ error: 'not_found' })
        res.json(await getInventoryCalleeRefs(req.params.id))
      } catch (e) {
        console.error('[inventory] callees', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
    if (!getMethod(req.params.id)) return res.status(404).json({ error: 'not_found' })
    res.json(getCalleeRefs(req.params.id))
  })
  
  app.get('/api/methods/:id/impact', async (req, res) => {
    if (isInventoryCatalog()) {
      try {
        const impact = await methodImpactSummary(req.params.id)
        if (!impact) return res.status(404).json({ error: 'not_found' })
        res.json(impact)
      } catch (e) {
        console.error('[inventory] method impact', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
    const impact = methodImpact(req.params.id)
    if (!impact) return res.status(404).json({ error: 'not_found' })
    res.json(impact)
  })
  
  app.get('/api/methods/:id/impact-graph', async (req, res) => {
    if (isInventoryCatalog()) {
      try {
        const graph = await buildInventoryMethodImpactGraph(req.params.id)
        if (!graph) return res.status(404).json({ error: 'not_found' })
        res.json(graph)
      } catch (e) {
        console.error('[inventory] method impact-graph', e)
        res.status(500).json({ error: 'inventory_error' })
      }
      return
    }
    const graph = buildMethodImpactGraph(req.params.id)
    if (!graph) return res.status(404).json({ error: 'not_found' })
    res.json(graph)
  })
}
