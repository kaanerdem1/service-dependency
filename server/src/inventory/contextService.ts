import { query, tableName } from './db.js'
import { parseServiceId } from './serviceService.js'

export type ServiceScreenLink = {
  oid: string
  name: string
  pageType: 'region' | 'page' | string
  descriptionTr: string | null
}

export type ServiceProcessLink = {
  oid: string
  name: string
  descriptionTr: string | null
}

export type ServiceCatalogContext = {
  serviceDescription: string | null
  projectGroupDescription: string | null
  responsibleItTeam: string | null
  responsibleBusinessUnit: string | null
}

export async function listServiceScreens(
  serviceId: string,
): Promise<ServiceScreenLink[]> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return []

  const { rows } = await query<{
    oid: string
    name: string
    page_type: string
    description_tr: string | null
  }>(
    `SELECT s.oid::text AS oid,
            s.name,
            s.page_type,
            s.description_tr
     FROM ${tableName('screen_service')} ss
     JOIN ${tableName('screen')} s ON s.oid = ss.screen_oid
     WHERE ss.service_oid = $1
       AND s.status = 1
     ORDER BY s.page_type, s.name`,
    [dbId],
  )

  return rows.map((row) => ({
    oid: row.oid,
    name: row.name,
    pageType: row.page_type,
    descriptionTr: row.description_tr,
  }))
}

export async function listServiceProcesses(
  serviceId: string,
): Promise<ServiceProcessLink[]> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return []

  const { rows } = await query<{
    oid: string
    name: string
    description_tr: string | null
  }>(
    `SELECT p.oid::text AS oid,
            p.name,
            p.description_tr
     FROM ${tableName('process_service')} ps
     JOIN ${tableName('process')} p ON p.oid = ps.process_oid
     WHERE ps.service_oid = $1
       AND p.status = 1
     ORDER BY p.name`,
    [dbId],
  )

  return rows.map((row) => ({
    oid: row.oid,
    name: row.name,
    descriptionTr: row.description_tr,
  }))
}

export async function getServiceCatalogContext(
  serviceId: string,
): Promise<ServiceCatalogContext | undefined> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return undefined

  const { rows } = await query<{
    service_description: string | null
    project_group_description: string | null
    responsible_it_team: string | null
    responsible_business_unit: string | null
  }>(
    `SELECT sd.service_description,
            pg.description AS project_group_description,
            p.responsible_it_team,
            p.responsible_business_unit
     FROM ${tableName('service_definition')} sd
     LEFT JOIN LATERAL (
       SELECT jc.artifact_id
       FROM ${tableName('java_method')} jm
       JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
       WHERE jm.service_definition_id = sd.id
       ORDER BY jc.artifact_id
       LIMIT 1
     ) entry ON true
     LEFT JOIN ${tableName('artifact')} a ON a.id = entry.artifact_id
     LEFT JOIN ${tableName('project')} p ON p.id = a.project_id
     LEFT JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
     WHERE sd.id = $1 AND sd.status = 1`,
    [dbId],
  )

  const row = rows[0]
  if (!row) return undefined

  return {
    serviceDescription: row.service_description?.trim() || null,
    projectGroupDescription: row.project_group_description?.trim() || null,
    responsibleItTeam: row.responsible_it_team?.trim() || null,
    responsibleBusinessUnit: row.responsible_business_unit?.trim() || null,
  }
}
