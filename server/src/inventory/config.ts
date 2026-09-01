export type CatalogSource = 'mock' | 'inventory'

export function getCatalogSource(): CatalogSource {
  const raw = (process.env.CATALOG_SOURCE ?? 'mock').trim().toLowerCase()
  return raw === 'inventory' ? 'inventory' : 'mock'
}

export function isInventoryCatalog(): boolean {
  return getCatalogSource() === 'inventory'
}
