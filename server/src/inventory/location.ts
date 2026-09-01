import type { ModuleNode } from '../data.js'
import { query, tableName } from './db.js'
import { parseServiceId, serviceIdFromDb } from './serviceService.js'
import { UNLOCATED_NODE_ID } from './treeService.js'

export type ServiceLocationRow = {
  service_id: string
  service_name: string
  project_group_id: string
  project_group_name: string
  project_id: string
  project_name: string
  artifact_id: string
  artifact_name: string
}

const LOCATION_SQL = `
  SELECT sd.id::text AS service_id,
         sd.service_name,
         pg.id::text AS project_group_id,
         pg.project_group_name,
         p.id::text AS project_id,
         p.project_name,
         a.id::text AS artifact_id,
         a.name AS artifact_name
  FROM ${tableName('service_definition')} sd
  JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
  JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
  JOIN ${tableName('artifact')} a ON a.id = jc.artifact_id
  JOIN ${tableName('project')} p ON p.id = a.project_id
  JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
  WHERE sd.id = $1 AND sd.status = 1
  ORDER BY jc.artifact_id ASC
  LIMIT 1
`

export async function fetchServiceLocation(
  serviceDbId: number,
): Promise<ServiceLocationRow | undefined> {
  const { rows } = await query<ServiceLocationRow>(LOCATION_SQL, [serviceDbId])
  return rows[0]
}

/** Servisin geçtiği tüm (group → project → jar) yolları — çoklu jar rozeti için. */
export async function fetchAllServiceLocations(
  serviceDbId: number,
): Promise<ServiceLocationRow[]> {
  const { rows } = await query<ServiceLocationRow>(
    `SELECT DISTINCT ON (a.id)
            sd.id::text AS service_id,
            sd.service_name,
            pg.id::text AS project_group_id,
            pg.project_group_name,
            p.id::text AS project_id,
            p.project_name,
            a.id::text AS artifact_id,
            a.name AS artifact_name
     FROM ${tableName('service_definition')} sd
     JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     JOIN ${tableName('artifact')} a ON a.id = jc.artifact_id
     JOIN ${tableName('project')} p ON p.id = a.project_id
     JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
     WHERE sd.id = $1 AND sd.status = 1
     ORDER BY a.id, pg.project_group_name, p.project_name, a.name`,
    [serviceDbId],
  )
  return rows
}

/** Sol ağaçta arama sonrası açılacak yol (group → project → jar → servis). */
export async function getServiceTreePath(serviceId: string): Promise<ModuleNode[]> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return []

  const loc = await fetchServiceLocation(dbId)
  if (!loc) {
    const { rows } = await query<{ id: string; name: string }>(
      `SELECT id::text AS id, service_name AS name
       FROM ${tableName('service_definition')}
       WHERE id = $1 AND status = 1`,
      [dbId],
    )
    const row = rows[0]
    if (!row) return []
    return [
      {
        id: UNLOCATED_NODE_ID,
        kind: 'group',
        name: 'Konumsuz servisler',
        hasChildren: true,
      },
      {
        id: `sd-node-${row.id}`,
        kind: 'service',
        name: row.name,
        serviceId: serviceIdFromDb(row.id),
        hasChildren: false,
      },
    ]
  }

  return [
    {
      id: `pg-${loc.project_group_id}`,
      kind: 'group',
      name: loc.project_group_name,
      hasChildren: true,
    },
    {
      id: `art-${loc.artifact_id}`,
      kind: 'package',
      name: loc.artifact_name,
      hasChildren: true,
    },
    {
      id: `sd-node-${loc.service_id}`,
      kind: 'service',
      name: loc.service_name,
      serviceId: serviceIdFromDb(loc.service_id),
      hasChildren: false,
    },
  ]
}

export type CatalogLocation = {
  project_group_id: string
  project_group_name: string
  project_id: string
  project_name: string
  artifact_id: string
  artifact_name: string
}

const LOCATION_SELECT = `
  pg.id::text AS project_group_id,
  pg.project_group_name,
  p.id::text AS project_id,
  p.project_name,
  a.id::text AS artifact_id,
  a.name AS artifact_name
`

/** Entry metodu olan servisler: method → class → jar → proje. */
const LOCATIONS_BY_ENTRY_SQL = `
  SELECT DISTINCT ON (sd.id)
         sd.id::text AS service_id,
         ${LOCATION_SELECT}
  FROM ${tableName('service_definition')} sd
  JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
  JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
  JOIN ${tableName('artifact')} a ON a.id = jc.artifact_id
  JOIN ${tableName('project')} p ON p.id = a.project_id
  JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
  WHERE sd.status = 1
  ORDER BY sd.id, a.id
`

/**
 * Entry metodu yoksa class_name / package_name → java_class.
 * Birebir fqcn, sonra simple_name.
 */
const LOCATIONS_BY_CLASS_SQL = `
  SELECT DISTINCT ON (sd.id)
         sd.id::text AS service_id,
         ${LOCATION_SELECT}
  FROM ${tableName('service_definition')} sd
  JOIN ${tableName('java_class')} jc
    ON (
      jc.fqcn = NULLIF(btrim(sd.package_name), '') || '.' || btrim(sd.class_name)
      OR jc.fqcn = btrim(sd.class_name)
      OR jc.simple_name = btrim(sd.class_name)
    )
  JOIN ${tableName('artifact')} a ON a.id = jc.artifact_id
  JOIN ${tableName('project')} p ON p.id = a.project_id
  JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
  WHERE sd.status = 1
    AND sd.class_name IS NOT NULL
    AND btrim(sd.class_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM ${tableName('java_method')} jm
      WHERE jm.service_definition_id = sd.id
    )
  ORDER BY sd.id,
           CASE
             WHEN jc.fqcn = NULLIF(btrim(sd.package_name), '') || '.' || btrim(sd.class_name) THEN 0
             WHEN jc.fqcn = btrim(sd.class_name) THEN 1
             ELSE 2
           END,
           a.id
`

export async function loadAllServiceLocations(): Promise<Map<string, CatalogLocation>> {
  const map = new Map<string, CatalogLocation>()
  const { rows: byEntry } = await query<CatalogLocation & { service_id: string }>(
    LOCATIONS_BY_ENTRY_SQL,
  )
  for (const row of byEntry) {
    map.set(serviceIdFromDb(row.service_id), row)
  }
  return map
}

export const SEARCH_WITH_LOCATION_SQL = `
  SELECT sd.id::text AS id,
         sd.service_name,
         loc.project_group_id,
         loc.project_group_name,
         loc.project_id,
         loc.project_name,
         loc.artifact_id,
         loc.artifact_name
  FROM ${tableName('service_definition')} sd
  LEFT JOIN LATERAL (
    SELECT pg.id::text AS project_group_id,
           pg.project_group_name,
           p.id::text AS project_id,
           p.project_name,
           a.id::text AS artifact_id,
           a.name AS artifact_name
    FROM ${tableName('java_method')} jm
    JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
    JOIN ${tableName('artifact')} a ON a.id = jc.artifact_id
    JOIN ${tableName('project')} p ON p.id = a.project_id
    JOIN ${tableName('project_group')} pg ON pg.id = p.project_group_id
    WHERE jm.service_definition_id = sd.id
    ORDER BY jc.artifact_id ASC
    LIMIT 1
  ) loc ON true
  WHERE sd.status = 1
    AND (
      sd.service_name ILIKE $1
      OR sd.package_name ILIKE $1
      OR sd.class_name ILIKE $1
    )
  ORDER BY sd.service_name
  LIMIT $2 OFFSET $3
`
