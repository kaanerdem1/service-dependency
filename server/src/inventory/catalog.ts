import { isInventoryCatalog } from './config.js'
import { initGraphCatalog } from './graphService.js'
import { initMethodCatalog } from './methodService.js'

let initialized = false

export async function initInventoryCatalog(): Promise<void> {
  if (!isInventoryCatalog() || initialized) return
  await initGraphCatalog()
  await initMethodCatalog()
  initialized = true
}

export function isInventoryCatalogReady(): boolean {
  return initialized
}
