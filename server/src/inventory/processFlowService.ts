import { query, tableName } from './db.js'
import {
  layoutProcessFlow,
  parseProcessDefinitionXml,
  type ProcessFlowGraph,
} from './parProcessParser.js'

/** İlk turda drawer’da yalnızca bu iki süreç — basit + dallı. */
export const POC_PROCESS_NOS = ['105199', '105251'] as const

export type ProcessListItem = {
  oid: string
  no: string
  name: string | null
  descriptionTr: string | null
}

export async function listPocProcesses(): Promise<ProcessListItem[]> {
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
     ORDER BY CASE no WHEN '105199' THEN 1 WHEN '105251' THEN 2 ELSE 9 END`,
    [POC_PROCESS_NOS],
  )
  return rows.map((r) => ({
    oid: r.oid,
    no: r.no,
    name: r.name,
    descriptionTr: r.description_tr,
  }))
}

export async function getProcessFlow(no: string): Promise<
  (ProcessFlowGraph & { positions: Record<string, { x: number; y: number }>; oid: string }) | undefined
> {
  const { rows } = await query<{
    oid: string
    no: string
    process_definition: string
  }>(
    `SELECT oid::text AS oid, no, process_definition
     FROM ${tableName('process')}
     WHERE status = 1 AND no = $1 AND process_definition IS NOT NULL
     LIMIT 1`,
    [no],
  )
  const row = rows[0]
  if (!row) return undefined
  const graph = parseProcessDefinitionXml(row.process_definition, row.no)
  const laid = layoutProcessFlow(graph)
  return { ...laid, oid: row.oid }
}
