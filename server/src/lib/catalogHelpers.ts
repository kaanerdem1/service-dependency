import { getDownstreamIds, getUpstreamIds, services } from '../data.js'
import type { Service } from '../data.js'
import { getInventoryDownstreamIds, getInventoryService, getInventoryUpstreamIds } from '../inventory/graphService.js'
import { isInventoryCatalog } from '../inventory/config.js'
import { getServiceById } from '../inventory/serviceService.js'

export async function getCatalogService(id: string): Promise<Service | undefined> {
  if (isInventoryCatalog()) return getServiceById(id)
  return services[id]
}

export function catalogDownstreamIds(id: string): string[] {
  if (isInventoryCatalog()) return getInventoryDownstreamIds(id)
  return getDownstreamIds(id)
}

export function catalogUpstreamIds(id: string): string[] {
  if (isInventoryCatalog()) return getInventoryUpstreamIds(id)
  return getUpstreamIds(id)
}

export async function toAffectedList(ids: string[]) {
  const out: { service: Service; hop: 1 }[] = []
  for (const id of ids) {
    const service = isInventoryCatalog()
      ? getInventoryService(id) ?? (await getServiceById(id))
      : services[id]
    if (service) out.push({ service, hop: 1 })
  }
  return out
}

/** Onay listesi ve bağımlılık paneli: yalnız hop=1 (doğrudan komşu). */
export function toAffectedMock(ids: string[]) {
  return ids
    .map((id) => services[id])
    .filter(Boolean)
    .map((service) => ({ service, hop: 1 as const }))
}
