import type { ModuleChildrenResult, ModuleNode } from '../data.js'
import { query, tableName } from './db.js'

const SERVICE_PAGE_SIZE = 50
const UNLOCATED_NODE_ID = 'unlocated'

type NodePrefix = 'pg' | 'proj' | 'art' | 'sd'

export type ListChildrenOptions = {
  limit?: number
  offset?: number
  sort?: 'name' | 'degree'
  /** Ağaç yolu hydrate: sayfa bu servisi içerecek şekilde hizalanır. */
  anchorServiceId?: string
}

function parseNodeId(nodeId: string): { prefix: NodePrefix; id: number } | undefined {
  const m = /^(pg|proj|art|sd)-(\d+)$/.exec(nodeId)
  if (!m) return undefined
  return { prefix: m[1] as NodePrefix, id: Number(m[2]) }
}

function parseServiceDbId(serviceId: string): number | undefined {
  const m = /^sd-(\d+)$/.exec(serviceId)
  return m ? Number(m[1]) : undefined
}

function clampPage(limit?: number, offset?: number) {
  const lim = Math.min(Math.max(limit ?? SERVICE_PAGE_SIZE, 1), 500)
  const off = Math.max(offset ?? 0, 0)
  return { limit: lim, offset: off }
}

const DEGREE_SUBQUERY = `
  SELECT jm_callee.service_definition_id AS service_id,
         COUNT(DISTINCT sd_caller.id)::int AS degree
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
  GROUP BY jm_callee.service_definition_id
`

/** Kök: project_group düğümleri (lazy — children yok). */
export async function listModuleRoots(): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string; description: string | null; child_count: string }>(
    `SELECT pg.id::text AS id,
            pg.project_group_name AS name,
            pg.description,
            COUNT(a.id)::text AS child_count
     FROM ${tableName('project_group')} pg
     LEFT JOIN ${tableName('project')} p ON p.project_group_id = pg.id
     LEFT JOIN ${tableName('artifact')} a ON a.project_id = p.id
     GROUP BY pg.id, pg.project_group_name, pg.description
     ORDER BY pg.project_group_name`,
  )
  const roots: ModuleNode[] = rows.map((row) => ({
    id: `pg-${row.id}`,
    kind: 'group',
    name: row.name,
    description: row.description?.trim() || undefined,
    hasChildren: Number(row.child_count) > 0,
  }))

  const unlocated = await countUnlocatedServices()
  if (unlocated > 0) {
    roots.push({
      id: UNLOCATED_NODE_ID,
      kind: 'group',
      name: `Konumsuz servisler (${unlocated})`,
      hasChildren: true,
      childCount: unlocated,
    })
  }
  return roots
}

export async function listModuleChildren(
  nodeId: string,
  opts: ListChildrenOptions = {},
): Promise<ModuleChildrenResult> {
  const { limit, offset: rawOffset } = clampPage(opts.limit, opts.offset)
  const sort = opts.sort === 'degree' ? 'degree' : 'name'

  if (nodeId === UNLOCATED_NODE_ID) {
    const total = await countUnlocatedServices()
    const offset = await resolveAnchorOffset({
      sort,
      total,
      limit,
      offset: rawOffset,
      anchorServiceId: opts.anchorServiceId,
      scope: 'unlocated',
    })
    const items = await listUnlocatedServices(limit, offset, sort)
    return { items, total, limit, offset }
  }

  const parsed = parseNodeId(nodeId)
  if (!parsed) return { items: [], total: 0, limit, offset: rawOffset }

  if (parsed.prefix === 'pg') {
    const items = await listArtifactsForGroup(parsed.id)
    return { items, total: items.length, limit: items.length, offset: 0 }
  }

  if (parsed.prefix === 'art') {
    const total = await countServicesForArtifact(parsed.id)
    const offset = await resolveAnchorOffset({
      sort,
      total,
      limit,
      offset: rawOffset,
      anchorServiceId: opts.anchorServiceId,
      scope: 'artifact',
      artifactId: parsed.id,
    })
    const items = await listServicesForArtifact(parsed.id, limit, offset, sort)
    return { items, total, limit, offset }
  }

  return { items: [], total: 0, limit, offset: rawOffset }
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
  return rows.map((row) => {
    const count = Number(row.svc_count)
    return {
      id: `art-${row.id}`,
      kind: 'package',
      name: row.name,
      hasChildren: count > 0,
      childCount: count,
    }
  })
}

async function countServicesForArtifact(artifactId: number): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(DISTINCT sd.id)::text AS n
     FROM ${tableName('service_definition')} sd
     JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     WHERE jc.artifact_id = $1
       AND sd.status = 1`,
    [artifactId],
  )
  return Number(rows[0]?.n ?? 0)
}

async function resolveAnchorOffset(input: {
  sort: 'name' | 'degree'
  total: number
  limit: number
  offset: number
  anchorServiceId?: string
  scope: 'artifact' | 'unlocated'
  artifactId?: number
}): Promise<number> {
  if (!input.anchorServiceId) return input.offset
  const dbId = parseServiceDbId(input.anchorServiceId)
  if (!dbId) return input.offset

  if (input.sort === 'name') {
    let rank = 0
    if (input.scope === 'artifact' && input.artifactId != null) {
      const { rows } = await query<{ n: string }>(
        `SELECT COUNT(DISTINCT sd.id)::text AS n
         FROM ${tableName('service_definition')} sd
         JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
         JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
         WHERE jc.artifact_id = $1
           AND sd.status = 1
           AND sd.service_name < (
             SELECT service_name FROM ${tableName('service_definition')} WHERE id = $2
           )`,
        [input.artifactId, dbId],
      )
      rank = Number(rows[0]?.n ?? 0)
    } else {
      const { rows } = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM ${tableName('service_definition')} sd
         WHERE sd.status = 1
           AND NOT EXISTS (
             SELECT 1 FROM ${tableName('java_method')} jm
             WHERE jm.service_definition_id = sd.id
           )
           AND sd.service_name < (
             SELECT service_name FROM ${tableName('service_definition')} WHERE id = $1
           )`,
        [dbId],
      )
      rank = Number(rows[0]?.n ?? 0)
    }
    return Math.min(Math.floor(rank / input.limit) * input.limit, Math.max(0, input.total - 1))
  }

  const orderSql =
    input.scope === 'artifact' && input.artifactId != null
      ? `
        WITH svc AS (
          SELECT DISTINCT sd.id, sd.service_name
          FROM ${tableName('service_definition')} sd
          JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
          JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
          WHERE jc.artifact_id = $1 AND sd.status = 1
        ),
        ranked AS (
          SELECT svc.id,
                 ROW_NUMBER() OVER (
                   ORDER BY COALESCE(deg.degree, 0) DESC, svc.service_name ASC
                 ) - 1 AS zero_rank
          FROM svc
          LEFT JOIN (${DEGREE_SUBQUERY}) deg ON deg.service_id = svc.id
        )
        SELECT zero_rank::text AS n FROM ranked WHERE id = $2
      `
      : `
        WITH svc AS (
          SELECT sd.id, sd.service_name
          FROM ${tableName('service_definition')} sd
          WHERE sd.status = 1
            AND NOT EXISTS (
              SELECT 1 FROM ${tableName('java_method')} jm
              WHERE jm.service_definition_id = sd.id
            )
        ),
        ranked AS (
          SELECT svc.id,
                 ROW_NUMBER() OVER (
                   ORDER BY COALESCE(deg.degree, 0) DESC, svc.service_name ASC
                 ) - 1 AS zero_rank
          FROM svc
          LEFT JOIN (${DEGREE_SUBQUERY}) deg ON deg.service_id = svc.id
        )
        SELECT zero_rank::text AS n FROM ranked WHERE id = $1
      `

  const params =
    input.scope === 'artifact' && input.artifactId != null
      ? [input.artifactId, dbId]
      : [dbId]
  const { rows } = await query<{ n: string }>(orderSql, params)
  const rank = Number(rows[0]?.n ?? 0)
  return Math.min(Math.floor(rank / input.limit) * input.limit, Math.max(0, input.total - 1))
}

async function listServicesForArtifact(
  artifactId: number,
  limit: number,
  offset: number,
  sort: 'name' | 'degree',
): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string; degree: string }>(
    `WITH jar_svc AS (
       SELECT DISTINCT sd.id AS service_id, sd.service_name AS service_name
       FROM ${tableName('service_definition')} sd
       JOIN ${tableName('java_method')} jm ON jm.service_definition_id = sd.id
       JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
       WHERE jc.artifact_id = $1
         AND sd.status = 1
     )
     SELECT jar_svc.service_id::text AS id,
            jar_svc.service_name AS name,
            COALESCE(deg.degree, 0)::text AS degree
     FROM jar_svc
     LEFT JOIN (${DEGREE_SUBQUERY}) deg ON deg.service_id = jar_svc.service_id
     ORDER BY ${sort === 'degree' ? 'COALESCE(deg.degree, 0) DESC, jar_svc.service_name ASC' : 'jar_svc.service_name ASC'}
     LIMIT $2 OFFSET $3`,
    [artifactId, limit, offset],
  )
  return rows.map((row) => ({
    id: `sd-node-${row.id}`,
    kind: 'service',
    name: row.name,
    serviceId: `sd-${row.id}`,
    hasChildren: false,
    degree: Number(row.degree ?? 0),
  }))
}

export async function countUnlocatedServices(): Promise<number> {
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
  sort: 'name' | 'degree' = 'name',
): Promise<ModuleNode[]> {
  const { rows } = await query<{ id: string; name: string; degree: string }>(
    `WITH unloc AS (
       SELECT sd.id AS service_id, sd.service_name AS service_name
       FROM ${tableName('service_definition')} sd
       WHERE sd.status = 1
         AND NOT EXISTS (
           SELECT 1
           FROM ${tableName('java_method')} jm
           WHERE jm.service_definition_id = sd.id
         )
     )
     SELECT unloc.service_id::text AS id,
            unloc.service_name AS name,
            COALESCE(deg.degree, 0)::text AS degree
     FROM unloc
     LEFT JOIN (${DEGREE_SUBQUERY}) deg ON deg.service_id = unloc.service_id
     ORDER BY ${sort === 'degree' ? 'COALESCE(deg.degree, 0) DESC, unloc.service_name ASC' : 'unloc.service_name ASC'}
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return rows.map((row) => ({
    id: `sd-node-${row.id}`,
    kind: 'service',
    name: row.name,
    serviceId: `sd-${row.id}`,
    hasChildren: false,
    degree: Number(row.degree ?? 0),
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
