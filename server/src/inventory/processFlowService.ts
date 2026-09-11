import { query, tableName } from './db.js'
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

export async function listProcesses(q?: string): Promise<ProcessListItem[]> {
  const needle = q?.trim() ?? ''
  if (needle.length >= 2) {
    const like = `%${needle}%`
    const prefix = `${needle}%`
    const { rows } = await query<{
      oid: string
      no: string
      name: string | null
      description_tr: string | null
    }>(
      `SELECT oid::text AS oid, no, name, description_tr
       FROM ${tableName('process')}
       WHERE status = 1
         AND process_definition IS NOT NULL
         AND (
           no ILIKE $1
           OR name ILIKE $1
           OR COALESCE(description_tr, '') ILIKE $1
           OR COALESCE(description_en, '') ILIKE $1
         )
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
    `SELECT oid::text AS oid, no, name, description_tr
     FROM ${tableName('process')}
     WHERE status = 1
       AND process_definition IS NOT NULL
       AND no = ANY($1::varchar[])
     ORDER BY CASE no WHEN '105801' THEN 1 WHEN '105251' THEN 2 WHEN '105116' THEN 3 ELSE 9 END`,
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

  const { rows } = await query<{
    no: string
    name: string | null
    description_tr: string | null
  }>(
    `SELECT no, name, description_tr
     FROM ${tableName('process')}
     WHERE status = 1
       AND process_definition IS NOT NULL
       AND no = ANY($1::varchar[])`,
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
     WHERE p.no = $1
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
  const { rows } = await query<{
    oid: string
    no: string
    name: string | null
    description_tr: string | null
    process_type: string | null
    process_definition: string
    update_date: Date | string | null
    it_owner_name: string | null
    it_business_owner_name: string | null
  }>(
    `SELECT p.oid::text AS oid,
            p.no,
            p.name,
            p.description_tr,
            p.process_type,
            p.process_definition,
            p.update_date,
            po.it_owner_name,
            po.it_business_owner_name
     FROM ${tableName('process')} p
     LEFT JOIN ${tableName('process_owner')} po
       ON po.oid = p.process_owner_oid AND po.status = 1
     WHERE p.status = 1 AND p.no = $1 AND p.process_definition IS NOT NULL
     LIMIT 1`,
    [no],
  )
  const row = rows[0]
  if (!row) return undefined
  const graph = parseProcessDefinitionXml(row.process_definition, row.no)
  const laid = layoutProcessFlow(graph)
  return {
    ...laid,
    oid: row.oid,
    catalogNo: row.no,
    parName: row.name,
    descriptionTr: row.description_tr ?? laid.label,
    processType: row.process_type ?? 'BPM',
    processOwnerIt: row.it_owner_name,
    processOwnerBusiness: row.it_business_owner_name,
    updatedAt: row.update_date ? String(row.update_date) : null,
  }
}
