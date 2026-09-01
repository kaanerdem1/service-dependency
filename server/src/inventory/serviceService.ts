import type { Service } from '../data.js'
import { query, tableName } from './db.js'
import { fetchServiceLocation, fetchAllServiceLocations, SEARCH_WITH_LOCATION_SQL } from './location.js'
import { getInventoryService } from './graphService.js'

const DEFAULT_SEARCH_LIMIT = 50
const MAX_SEARCH_LIMIT = 200

function serviceIdFromDb(id: string | number): string {
  return `sd-${id}`
}

function parseServiceId(serviceId: string): number | undefined {
  const m = /^sd-(\d+)$/.exec(serviceId)
  if (!m) return undefined
  return Number(m[1])
}

type LocationFields = {
  project_group_id?: string | null
  project_group_name?: string | null
  project_id?: string | null
  project_name?: string | null
  artifact_id?: string | null
  artifact_name?: string | null
}

function toService(
  row: { id: string; service_name: string } & LocationFields & {
    affectedCount?: number
    dependsOnCount?: number
  },
): Service {
  return {
    id: serviceIdFromDb(row.id),
    name: row.service_name,
    projectId: row.project_id ? `proj-${row.project_id}` : 'unknown',
    packageId: row.artifact_id ? `art-${row.artifact_id}` : 'unknown',
    projectGroupId: row.project_group_id ? `pg-${row.project_group_id}` : undefined,
    projectGroupLabel: row.project_group_name ?? undefined,
    projectLabel: row.project_name ?? undefined,
    packageLabel: row.artifact_name ?? undefined,
    affectedCount: row.affectedCount ?? 0,
    dependsOnCount: row.dependsOnCount ?? 0,
  }
}

export async function searchServices(
  q: string,
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
): Promise<Service[]> {
  const trimmed = q.trim()
  const safeLimit = Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT)

  if (!trimmed) {
    return []
  }

  const pattern = `%${trimmed}%`
  const { rows } = await query<
    { id: string; service_name: string } & LocationFields
  >(SEARCH_WITH_LOCATION_SQL, [pattern, safeLimit, offset])

  return rows.map((row) => {
    const svc = toService(row)
    const counts = getInventoryService(svc.id)
    if (!counts) return svc
    return {
      ...svc,
      affectedCount: counts.affectedCount,
      dependsOnCount: counts.dependsOnCount,
    }
  })
}

export async function getServiceById(serviceId: string): Promise<Service | undefined> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return undefined

  const { rows } = await query<{ id: string; service_name: string }>(
    `SELECT id::text AS id, service_name
     FROM ${tableName('service_definition')}
     WHERE id = $1 AND status = 1`,
    [dbId],
  )
  const row = rows[0]
  if (!row) return undefined

  const loc = await fetchServiceLocation(dbId)
  return toService({
    ...row,
    project_group_id: loc?.project_group_id,
    project_group_name: loc?.project_group_name,
    project_id: loc?.project_id,
    project_name: loc?.project_name,
    artifact_id: loc?.artifact_id,
    artifact_name: loc?.artifact_name,
    affectedCount: getInventoryService(serviceId)?.affectedCount ?? 0,
    dependsOnCount: getInventoryService(serviceId)?.dependsOnCount ?? 0,
  })
}

export type ServiceLocation = {
  projectGroupId: string
  projectGroupLabel: string
  projectId: string
  projectLabel: string
  artifactId: string
  artifactLabel: string
}

export async function listServiceLocations(
  serviceId: string,
): Promise<ServiceLocation[]> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return []
  const rows = await fetchAllServiceLocations(dbId)
  return rows.map((row) => ({
    projectGroupId: `pg-${row.project_group_id}`,
    projectGroupLabel: row.project_group_name,
    projectId: `proj-${row.project_id}`,
    projectLabel: row.project_name,
    artifactId: `art-${row.artifact_id}`,
    artifactLabel: row.artifact_name,
  }))
}

export { parseServiceId, serviceIdFromDb }
