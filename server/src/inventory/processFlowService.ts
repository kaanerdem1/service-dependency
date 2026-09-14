import { query, tableName } from './db.js'
import {
  sqlProcessDescriptionTr,
  sqlProcessSearchOr,
} from './processCatalogColumns.js'
import {
  getProcessCatalogSchema,
  hasProcessDefinitionColumn,
} from './processCatalogSchema.js'
import { readProcessDefinitionXml } from './processDefinitionSource.js'
import {
  layoutProcessFlow,
  parseProcessDefinitionXml,
  type ProcessFlowGraph,
} from './parProcessParser.js'

/** Drawer’da varsayılan üç süreç; kalanı aramadan. */
export const FEATURED_PROCESS_NOS = ['105801', '105251', '105116'] as const
export const POC_PROCESS_NOS = FEATURED_PROCESS_NOS

export type ProcessListItem = {
  oid: string
  no: string
  name: string | null
  descriptionTr: string | null
}

function mapProcessRow(r: {
  oid: string
  no: string
  name: string | null
  description_tr: string | null
}): ProcessListItem {
  return {
    oid: r.oid,
    no: r.no,
    name: r.name,
    descriptionTr: r.description_tr,
  }
}

async function flowReadySql(prefix = ''): Promise<string> {
  const p = prefix ? `${prefix}.` : ''
  if (!(await hasProcessDefinitionColumn())) return ''
  return `AND ${p}process_definition IS NOT NULL`
}

export async function listProcesses(q?: string): Promise<ProcessListItem[]> {
  const schema = await getProcessCatalogSchema()
  const needle = q?.trim() ?? ''
  if (needle.length >= 2) {
    const like = `%${needle}%`
    const prefix = `${needle}%`
    if (schema === 'extended') {
      const descTr = await sqlProcessDescriptionTr('')
      const searchOr = await sqlProcessSearchOr('')
      const { rows } = await query<{
        oid: string
        no: string
        name: string | null
        description_tr: string | null
      }>(
        `SELECT oid::text AS oid, no, name, ${descTr} AS description_tr
         FROM ${tableName('process')}
         WHERE status = 1
           AND (${searchOr})
         ORDER BY
           CASE
             WHEN no ILIKE $2 THEN 0
             WHEN no ILIKE $1 THEN 1
             WHEN name ILIKE $2 THEN 2
             ELSE 3
           END,
           no
         LIMIT 80`,
        [like, prefix],
      )
      return rows.map(mapProcessRow)
    }
    const { rows } = await query<{
      oid: string
      no: string
      name: string | null
      description_tr: string | null
    }>(
      `SELECT oid::text AS oid,
              name AS no,
              description_tr AS name,
              description_tr
       FROM ${tableName('process')}
       WHERE status = 1
         AND (
           name ILIKE $1
           OR COALESCE(description_tr, '') ILIKE $1
           OR COALESCE(description_en, '') ILIKE $1
         )
       ORDER BY
         CASE
           WHEN name ILIKE $2 THEN 0
           WHEN name ILIKE $1 THEN 1
           WHEN description_tr ILIKE $2 THEN 2
           ELSE 3
         END,
         name
       LIMIT 80`,
      [like, prefix],
    )
    return rows.map(mapProcessRow)
  }

  if (schema === 'extended') {
    const descTr = await sqlProcessDescriptionTr('')
    const { rows } = await query<{
      oid: string
      no: string
      name: string | null
      description_tr: string | null
    }>(
      `SELECT oid::text AS oid, no, name, ${descTr} AS description_tr
       FROM ${tableName('process')}
       WHERE status = 1
         AND no = ANY($1::varchar[])
       ORDER BY CASE no WHEN '105801' THEN 1 WHEN '105251' THEN 2 WHEN '105116' THEN 3 ELSE 9 END`,
      [FEATURED_PROCESS_NOS],
    )
    return rows.map(mapProcessRow)
  }

  const { rows } = await query<{
    oid: string
    no: string
    name: string | null
    description_tr: string | null
  }>(
    `SELECT oid::text AS oid,
            name AS no,
            description_tr AS name,
            description_tr
     FROM ${tableName('process')}
     WHERE status = 1
       AND name = ANY($1::varchar[])
     ORDER BY CASE name WHEN '105801' THEN 1 WHEN '105251' THEN 2 WHEN '105116' THEN 3 ELSE 9 END`,
    [FEATURED_PROCESS_NOS],
  )
  return rows.map(mapProcessRow)
}

export async function listPocProcesses(): Promise<ProcessListItem[]> {
  return listProcesses()
}

export type ProcessScreenLink = {
  oid: string
  name: string
  pageType: string
  descriptionTr: string | null
}

export type ProcessRefResolve = {
  no: string
  name: string | null
  descriptionTr: string | null
}

export async function resolveProcessRefs(nos: string[]): Promise<ProcessRefResolve[]> {
  const unique = [...new Set(nos.map((n) => n.trim()).filter(Boolean))]
  if (!unique.length) return []

  const schema = await getProcessCatalogSchema()
  const flowReady = await flowReadySql()
  const noCol = schema === 'extended' ? 'no' : 'name'

  const descTr = await sqlProcessDescriptionTr('')
  const { rows } = await query<{
    no: string
    name: string | null
    description_tr: string | null
  }>(
    `SELECT ${noCol} AS no, name, ${descTr} AS description_tr
     FROM ${tableName('process')}
     WHERE status = 1
       ${flowReady}
       AND ${noCol} = ANY($1::varchar[])`,
    [unique],
  )
  const byNo = new Map(rows.map((row) => [row.no, row]))
  return unique.map((no) => {
    const hit = byNo.get(no)
    return {
      no,
      name: hit?.name ?? null,
      descriptionTr: hit?.description_tr ?? null,
    }
  })
}

export async function listProcessScreens(processNo: string): Promise<ProcessScreenLink[]> {
  const schema = await getProcessCatalogSchema()
  const noMatch = schema === 'extended' ? 'p.no = $1' : 'p.name = $1'

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
     FROM ${tableName('screen_process')} sp
     JOIN ${tableName('process')} p ON p.oid = sp.process_oid
     JOIN ${tableName('screen')} s ON s.oid = sp.screen_oid
     WHERE ${noMatch}
       AND p.status = 1
       AND s.status = 1
     ORDER BY s.page_type, s.name`,
    [processNo],
  )
  return rows.map((row) => ({
    oid: row.oid,
    name: row.name,
    pageType: row.page_type,
    descriptionTr: row.description_tr,
  }))
}

export async function getProcessFlow(no: string): Promise<
  (ProcessFlowGraph & { positions: Record<string, { x: number; y: number }>; oid: string }) | undefined
> {
  const schema = await getProcessCatalogSchema()
  const hasDefCol = await hasProcessDefinitionColumn()

  type FlowRow = {
    oid: string
    no: string
    name: string | null
    description_tr: string | null
    process_type: string | null
    process_definition: string | null
    update_date: Date | string | null
    it_owner_name: string | null
    it_business_owner_name: string | null
  }

  let row: FlowRow | undefined

  if (schema === 'extended') {
    const defSelect = hasDefCol ? 'p.process_definition,' : 'NULL::text AS process_definition,'
    const descTr = await sqlProcessDescriptionTr('p')
    const { rows } = await query<FlowRow>(
      `SELECT p.oid::text AS oid,
              p.no,
              p.name,
              ${descTr} AS description_tr,
              p.process_type,
              ${defSelect}
              p.update_date,
              po.it_owner_name,
              po.it_business_owner_name
       FROM ${tableName('process')} p
       LEFT JOIN ${tableName('process_owner')} po
         ON po.oid = p.process_owner_oid AND po.status = 1
       WHERE p.status = 1 AND p.no = $1
       LIMIT 1`,
      [no],
    )
    row = rows[0]
  } else {
    const defSelect = hasDefCol ? 'p.process_definition,' : 'NULL::text AS process_definition,'
    const { rows } = await query<FlowRow>(
      `SELECT p.oid::text AS oid,
              p.name AS no,
              p.description_tr AS name,
              p.description_tr,
              NULL::varchar AS process_type,
              ${defSelect}
              p.update_date,
              po.it_owner_name,
              po.it_business_owner_name
       FROM ${tableName('process')} p
       LEFT JOIN ${tableName('process_owner')} po
         ON po.oid = p.process_owner_oid AND po.status = 1
       WHERE p.status = 1 AND p.name = $1
       LIMIT 1`,
      [no],
    )
    row = rows[0]
  }

  if (!row) return undefined

  const xml =
    row.process_definition?.trim() || readProcessDefinitionXml(no) || null
  if (!xml) return undefined

  const graph = parseProcessDefinitionXml(xml, row.no)
  const laid = layoutProcessFlow(graph)
  return {
    ...laid,
    oid: row.oid,
    catalogNo: row.no,
    parName: schema === 'extended' ? row.name : row.description_tr,
    descriptionTr: row.description_tr ?? laid.label,
    processType: row.process_type ?? 'BPM',
    processOwnerIt: row.it_owner_name,
    processOwnerBusiness: row.it_business_owner_name,
    updatedAt: row.update_date ? String(row.update_date) : null,
  }
}
