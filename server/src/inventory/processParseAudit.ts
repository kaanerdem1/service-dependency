import { query, tableName } from './db.js'
import { getProcessCatalogSchema } from './processCatalogSchema.js'
import { auditProcessDefinitionXml, type ProcessParseAudit } from './parProcessParser.js'

export type ProcessParseAuditSummary = {
  ok: boolean
  scanned: number
  passed: number
  failed: number
  failures: (ProcessParseAudit & { catalogNo: string })[]
}

/** env.process.process_definition kolonundaki tüm süreçleri parse audit eder. */
export async function auditAllStoredProcessDefinitions(
  limit = 500,
): Promise<ProcessParseAuditSummary> {
  const schema = await getProcessCatalogSchema()
  const noCol = schema === 'extended' ? 'no' : 'name'
  const { rows } = await query<{
    catalog_no: string
    process_definition: string
  }>(
    `SELECT ${noCol} AS catalog_no, process_definition
     FROM ${tableName('process')}
     WHERE status = 1
       AND process_definition IS NOT NULL
       AND length(process_definition) > 100
     ORDER BY ${noCol}
     LIMIT $1`,
    [limit],
  )

  const failures: ProcessParseAuditSummary['failures'] = []
  let passed = 0
  for (const row of rows) {
    const audit = auditProcessDefinitionXml(row.process_definition, row.catalog_no)
    if (audit.ok) passed += 1
    else failures.push({ ...audit, catalogNo: row.catalog_no })
  }

  return {
    ok: failures.length === 0,
    scanned: rows.length,
    passed,
    failed: failures.length,
    failures,
  }
}
