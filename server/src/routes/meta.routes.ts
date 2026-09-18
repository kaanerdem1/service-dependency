import type { Express } from 'express'
import { checkCallGraphConsistency } from '../methods.js'
import { isInventoryCatalog } from '../inventory/config.js'
import { checkInventoryCallGraphConsistency } from '../inventory/methodService.js'

export function registerMetaRoutes(app: Express) {
  /** XML ↔ parser tutarlılığı (tüm süreçler veya tek no). */
  app.get('/api/meta/process-parse-audit', async (req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const no = typeof req.query.no === 'string' ? req.query.no.trim() : ''
      const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 500)))
      if (no) {
        const { query, tableName } = await import('../inventory/db.js')
        const { getProcessCatalogSchema } = await import('../inventory/processCatalogSchema.js')
        const schema = await getProcessCatalogSchema()
        const noCol = schema === 'extended' ? 'no' : 'name'
        const { rows } = await query<{ process_definition: string }>(
          `SELECT process_definition FROM ${tableName('process')}
           WHERE status = 1 AND ${noCol} = $1 AND process_definition IS NOT NULL LIMIT 1`,
          [no],
        )
        const xml = rows[0]?.process_definition
        if (!xml) {
          res.status(404).json({ error: 'not_found' })
          return
        }
        const { auditProcessDefinitionXml } = await import('../inventory/parProcessParser.js')
        res.json(await auditProcessDefinitionXml(xml, no))
        return
      }
      const { auditAllStoredProcessDefinitions } = await import(
        '../inventory/processParseAudit.js'
      )
      res.json(await auditAllStoredProcessDefinitions(limit))
    } catch (e) {
      console.error('[inventory] /api/meta/process-parse-audit', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })

  /** Süreç kataloğu: PAR import / description_tr / process_definition dolu mu? */
  app.get('/api/meta/process-catalog-health', async (_req, res) => {
    if (!isInventoryCatalog()) {
      res.status(404).json({ error: 'not_available' })
      return
    }
    try {
      const { checkProcessCatalogHealth } = await import('../inventory/processCatalogHealth.js')
      res.json(await checkProcessCatalogHealth())
    } catch (e) {
      console.error('[inventory] /api/meta/process-catalog-health', e)
      res.status(500).json({ error: 'inventory_error' })
    }
  })

  /** Geliştirici aracı: callEdges ↔ affectsEdges tutarlı mı? */
  app.get('/api/meta/call-graph-consistency', async (_req, res) => {
    if (isInventoryCatalog()) {
      const issues = await checkInventoryCallGraphConsistency()
      res.json({ ok: issues.length === 0, issueCount: issues.length, issues })
      return
    }
    const issues = checkCallGraphConsistency()
    res.json({ ok: issues.length === 0, issueCount: issues.length, issues })
  })
}
