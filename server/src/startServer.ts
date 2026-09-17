import { createApp } from './createApp.js'
import { initInventoryCatalog } from './inventory/catalog.js'
import { checkInventoryCallGraphConsistency } from './inventory/methodService.js'
import { pingInventory } from './inventory/db.js'
import { getCatalogSource, isInventoryCatalog } from './inventory/config.js'
import { checkCallGraphConsistency } from './methods.js'

const PORT = Number(process.env.PORT ?? 4000)

export async function startServer() {
  const app = createApp()

  if (isInventoryCatalog()) {
    try {
      await pingInventory()
      await initInventoryCatalog()
      const issues = await checkInventoryCallGraphConsistency(20)
      if (issues.length) {
        console.warn(
          `[call-graph] ${issues.length} inventory tutarlılık uyarısı — GET /api/meta/call-graph-consistency`,
        )
      } else {
        console.log('[call-graph] inventory rollup tutarlı (örneklem)')
      }
      const { checkProcessCatalogHealth } = await import('./inventory/processCatalogHealth.js')
      const processHealth = await checkProcessCatalogHealth()
      if (!processHealth.ok) {
        console.warn(
          `[process-catalog] eksik süreç verisi (xml=${processHealth.withXml}, label=${processHealth.withTurkishLabel}) — ` +
            `GET /api/meta/process-catalog-health | onarım: ${processHealth.repairCommand}`,
        )
      } else {
        console.log(
          `[process-catalog] ${processHealth.withXml} süreç XML, ${processHealth.withTurkishLabel} Türkçe label`,
        )
      }
    } catch (e) {
      console.error('[inventory] startup failed:', e)
      process.exit(1)
    }
  }

  app.listen(PORT, () => {
    console.log(`[catalog] source=${getCatalogSource()}`)
    if (!isInventoryCatalog()) {
      const issues = checkCallGraphConsistency()
      if (issues.length) {
        console.warn(
          `[call-graph] ${issues.length} tutarlılık uyarısı — GET /api/meta/call-graph-consistency`,
        )
      } else {
        console.log('[call-graph] metod ↔ affectsEdges tutarlı')
      }
    }
    console.log(`API http://127.0.0.1:${PORT}`)
  })
}
