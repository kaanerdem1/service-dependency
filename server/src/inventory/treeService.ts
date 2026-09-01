import type { ModuleNode } from '../data.js'
import { query, tableName } from './db.js'

const SERVICE_PAGE_SIZE = 100
const UNLOCATED_NODE_ID = 'unlocated'

type NodePrefix = 'pg' | 'proj' | 'art' | 'sd'

function parseNodeId(nodeId: string): { prefix: NodePrefix; id: number } | undefined {
  const m = /^(pg|proj|art|sd)-(\d+)$/.exec(nodeId)
  if (!m) return undefined
  return { prefix: m[1] as NodePrefix, id: Number(m[2]) }
}

/** Kök: project_group düğümleri (lazy — children yok). */
export async function listModuleRoots(): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string; child_count: string }>(
    `SELECT pg.id::text AS id,
            pg.project_group_name AS name,
            COUNT(a.id)::text AS child_count
     FROM ${tableName('project_group')} pg
     LEFT JOIN ${tableName('project')} p ON p.project_group_id = pg.id
     LEFT JOIN ${tableName('artifact')} a ON a.project_id = p.id
     GROUP BY pg.id, pg.project_group_name
     ORDER BY pg.project_group_name`,
  )
  const roots: ModuleNode[] = rows.map((row) => ({
    id: `pg-${row.id}`,
    kind: 'group',
    name: row.name,
    hasChildren: Number(row.child_count) > 0,
  }))

  const unlocated = await countUnlocatedServices()
  if (unlocated > 0) {
    roots.push({
      id: UNLOCATED_NODE_ID,
      kind: 'group',
      name: `Konumsuz servisler (${unlocated})`,
      hasChildren: true,
    })
  }
  return roots
}

export async function listModuleChildren(nodeId: string): Promise<ModuleNode[]> {
  if (nodeId === UNLOCATED_NODE_ID) {
    return listUnlocatedServices(SERVICE_PAGE_SIZE, 0)
  }
  const parsed = parseNodeId(nodeId)
  if (!parsed) return []

  if (parsed.prefix === 'pg') {
    return listArtifactsForGroup(parsed.id)
  }
  if (parsed.prefix === 'art') {
    return listServicesForArtifact(parsed.id, SERVICE_PAGE_SIZE, 0)
  }
  return []
}

/** Grup → jar (project katmanı atlanır: her projede pratikte tek jar). */
async function listArtifactsForGroup(groupId: number): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string; svc_count: string }>(
    `SELECT a.id::text AS id,
            a.name AS name,
            COUNT(DISTINCT sd.id)::text AS svc_count
     FROM ${tableName('artifact')} a
     JOIN ${tableName('project')} p ON p.id = a.project_id
     LEFT JOIN ${tableName('java_class')} jc ON jc.artifact_id = a.id
     LEFT JOIN ${tableName('java_method')} jm
       ON jm.class_id = jc.id AND jm.service_definition_id IS NOT NULL
     LEFT JOIN ${tableName('service_definition')} sd
       ON sd.id = jm.service_definition_id AND sd.status = 1
     WHERE p.project_group_id = $1
     GROUP BY a.id, a.name
     ORDER BY a.name`,
    [groupId],
  )
  return rows.map((row) => ({
    id: `art-${row.id}`,
    kind: 'package',
    name: row.name,
    hasChildren: Number(row.svc_count) > 0,
  }))
}

async function listServicesForArtifact(
  artifactId: number,
  limit: number,
  offset: number,
): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT DISTINCT sd.id::text AS id,
            sd.service_name AS name
     FROM ${tableName('service_definition')} sd
     JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     WHERE jc.artifact_id = $1
       AND sd.status = 1
     ORDER BY sd.service_name
     LIMIT $2 OFFSET $3`,
    [artifactId, limit, offset],
  )
  return rows.map((row) => ({
    id: `sd-node-${row.id}`,
    kind: 'service',
    name: row.name,
    serviceId: `sd-${row.id}`,
    hasChildren: false,
  }))
}

async function countUnlocatedServices(): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM ${tableName('service_definition')} sd
     WHERE sd.status = 1
       AND NOT EXISTS (
         SELECT 1
         FROM ${tableName('java_method')} jm
         WHERE jm.service_definition_id = sd.id
       )`,
  )
  return Number(rows[0]?.n ?? 0)
}

/** Entry metodu olmayan aktif servisler — jar zinciri kurulamaz. */
export async function listUnlocatedServices(
  limit: number,
  offset: number,
): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT sd.id::text AS id,
            sd.service_name AS name
     FROM ${tableName('service_definition')} sd
     WHERE sd.status = 1
       AND NOT EXISTS (
         SELECT 1
         FROM ${tableName('java_method')} jm
         WHERE jm.service_definition_id = sd.id
       )
     ORDER BY sd.service_name
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return rows.map((row) => ({
    id: `sd-node-${row.id}`,
    kind: 'service',
    name: row.name,
    serviceId: `sd-${row.id}`,
    hasChildren: false,
  }))
}

const NON_SERVICE_METHOD_PAGE = 50

/** Jar altında servis dışı metodlar (service_definition_id IS NULL). */
export async function listNonServiceMethodsForArtifact(
  artifactId: number,
  limit = NON_SERVICE_METHOD_PAGE,
  offset = 0,
): Promise<ModuleNode[]> {
  const { rows } = await query<{
    id: string
    class_name: string
    method_name: string
  }>(
    `SELECT jm.id::text AS id,
            COALESCE(jc.simple_name, jc.fqcn) AS class_name,
            jm.name AS method_name
     FROM ${tableName('java_method')} jm
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     WHERE jc.artifact_id = $1
       AND jm.service_definition_id IS NULL
     ORDER BY COALESCE(jc.simple_name, jc.fqcn), jm.name
     LIMIT $2 OFFSET $3`,
    [artifactId, limit, offset],
  )
  return rows.map((row) => ({
    id: `jm-node-${row.id}`,
    kind: 'method',
    name: `${row.class_name}.${row.method_name}`,
    methodId: `jm-${row.id}`,
    hasChildren: false,
  }))
}

export { SERVICE_PAGE_SIZE, NON_SERVICE_METHOD_PAGE, UNLOCATED_NODE_ID, parseNodeId }
