/**
 * Inventory servis rollup (call_edge → servis affectsEdges) + etki grafı.
 */
import type { Service } from '../data.js'
import { buildImpactGraphFrom, IMPACT_VIEW } from '../impactGraph.js'
import { query, tableName } from './db.js'
import { loadAllServiceLocations } from './location.js'
import { serviceIdFromDb } from './serviceService.js'

const ROLLUP_SQL = `
  SELECT DISTINCT
    sd_callee.id::text AS callee_id,
    sd_caller.id::text AS caller_id
  FROM ${tableName('call_edge')} ce
  JOIN ${tableName('java_method')} jm_caller ON jm_caller.id = ce.caller_id
  JOIN ${tableName('java_method')} jm_callee ON jm_callee.id = ce.callee_id
  JOIN ${tableName('service_definition')} sd_caller
    ON sd_caller.id = jm_caller.service_definition_id
  JOIN ${tableName('service_definition')} sd_callee
    ON sd_callee.id = jm_callee.service_definition_id
  WHERE sd_caller.id <> sd_callee.id
    AND sd_caller.status = 1
    AND sd_callee.status = 1
`

type ServiceRow = {
  id: string
  service_name: string
}

let ready = false
/** callee değişince etkilenen caller servisler */
const downstream = new Map<string, string[]>()
/** bu servisin çağırdığı servisler */
const upstream = new Map<string, string[]>()
const serviceById = new Map<string, Service>()

function pushMap(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key)
  if (list) {
    if (!list.includes(value)) list.push(value)
  } else {
    map.set(key, [value])
  }
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const an = serviceById.get(a)?.name ?? a
    const bn = serviceById.get(b)?.name ?? b
    return an.localeCompare(bn, 'tr')
  })
}

export async function initGraphCatalog(): Promise<void> {
  if (ready) return

  const { rows: services } = await query<ServiceRow>(
    `SELECT id::text AS id, service_name
     FROM ${tableName('service_definition')}
     WHERE status = 1`,
  )

  for (const row of services) {
    const id = serviceIdFromDb(row.id)
    serviceById.set(id, {
      id,
      name: row.service_name,
      projectId: 'unknown',
      packageId: 'unknown',
      affectedCount: 0,
      dependsOnCount: 0,
    })
  }

  const { rows: pairs } = await query<{ callee_id: string; caller_id: string }>(ROLLUP_SQL)

  for (const row of pairs) {
    const callee = serviceIdFromDb(row.callee_id)
    const caller = serviceIdFromDb(row.caller_id)
    pushMap(downstream, callee, caller)
    pushMap(upstream, caller, callee)
  }

  const locs = await loadAllServiceLocations()
  let located = 0
  for (const [id, svc] of serviceById) {
    const loc = locs.get(id)
    serviceById.set(id, {
      ...svc,
      affectedCount: downstream.get(id)?.length ?? 0,
      dependsOnCount: upstream.get(id)?.length ?? 0,
      ...(loc
        ? {
            projectId: `proj-${loc.project_id}`,
            packageId: `art-${loc.artifact_id}`,
            projectGroupId: `pg-${loc.project_group_id}`,
            projectGroupLabel: loc.project_group_name,
            projectLabel: loc.project_name,
            packageLabel: loc.artifact_name,
          }
        : {}),
    })
    if (loc) located++
  }

  for (const list of downstream.values()) sortIds(list)
  for (const list of upstream.values()) sortIds(list)

  ready = true
  console.log(
    `[inventory-graph] ${serviceById.size} servis (${located} konumlu), ${pairs.length} cross-service çifti yüklendi`,
  )
}

export function isGraphCatalogReady(): boolean {
  return ready
}

export function getInventoryService(id: string): Service | undefined {
  return serviceById.get(id)
}

export function getInventoryDownstreamIds(id: string): string[] {
  return downstream.get(id) ?? []
}

export function getInventoryUpstreamIds(id: string): string[] {
  return upstream.get(id) ?? []
}

export function applyServiceMeta(id: string, patch: Partial<Service>): Service | undefined {
  const base = serviceById.get(id)
  if (!base) return undefined
  const merged = { ...base, ...patch }
  serviceById.set(id, merged)
  return merged
}

export function buildInventoryImpactGraph(
  centerId: string,
  maxNodes: number,
  maxHops: number = IMPACT_VIEW.maxHops,
) {
  return buildImpactGraphFrom(
    centerId,
    maxNodes,
    {
      getService: getInventoryService,
      getDownstream: getInventoryDownstreamIds,
    },
    maxHops,
  )
}

export function inventoryAffectsEdgesRecord(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of downstream) out[k] = v
  return out
}

/** Test / smoke: verilen hop-1 derecelerine en yakın servis adları. */
export function sampleServicesByDownstreamDegree(
  targets: number[],
): { target: number; degree: number; id: string; name: string }[] {
  const ranked = [...serviceById.values()]
    .map((svc) => ({
      id: svc.id,
      name: svc.name,
      degree: downstream.get(svc.id)?.length ?? 0,
    }))
    .filter((row) => row.degree > 0)

  return targets.map((target) => {
    let best = ranked[0]!
    let bestDelta = Math.abs(best.degree - target)
    for (const row of ranked) {
      const delta = Math.abs(row.degree - target)
      if (delta < bestDelta || (delta === bestDelta && row.degree >= target && best.degree < target)) {
        best = row
        bestDelta = delta
      }
    }
    return { target, degree: best.degree, id: best.id, name: best.name }
  })
}
