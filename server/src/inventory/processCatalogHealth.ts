import { query, tableName } from './db.js'
import { hasDescriptionTrColumn } from './processCatalogColumns.js'
import { hasProcessDefinitionColumn } from './processCatalogSchema.js'
import { FEATURED_PROCESS_NOS } from './processFlowService.js'

export type ProcessCatalogHealth = {
  ok: boolean
  hasDefinitionColumn: boolean
  hasDescriptionTrColumn: boolean
  activeProcesses: number
  withXml: number
  withTurkishLabel: number
  featured: { no: string; hasXml: boolean; hasLabel: boolean }[]
  /** Katalog restore / şema değişikliği sonrası çalıştırılacak komut. */
  repairCommand: string
}

export async function checkProcessCatalogHealth(): Promise<ProcessCatalogHealth> {
  const hasDefinitionColumn = await hasProcessDefinitionColumn()
  const hasDescTr = await hasDescriptionTrColumn()

  const repairCommand =
    'cd server && PROCESS_PAR_ROOT=/path/to/par npm run ingest:process-par'

  if (!hasDefinitionColumn) {
    return {
      ok: false,
      hasDefinitionColumn: false,
      hasDescriptionTrColumn: hasDescTr,
      activeProcesses: 0,
      withXml: 0,
      withTurkishLabel: 0,
      featured: FEATURED_PROCESS_NOS.map((no) => ({
        no,
        hasXml: false,
        hasLabel: false,
      })),
      repairCommand:
        'psql ... -f server/sql/process_par_migration.sql && ' + repairCommand,
    }
  }

  const { rows: totals } = await query<{
    active: string
    with_xml: string
    with_label: string
  }>(
    `SELECT COUNT(*)::text AS active,
            COUNT(process_definition) FILTER (
              WHERE process_definition IS NOT NULL AND length(process_definition) > 100
            )::text AS with_xml,
            COUNT(description_tr) FILTER (
              WHERE description_tr IS NOT NULL AND description_tr NOT LIKE '%.par'
            )::text AS with_label
     FROM ${tableName('process')}
     WHERE status = 1`,
  )

  const { rows: featuredRows } = await query<{
    no: string
    has_xml: boolean
    has_label: boolean
  }>(
    `SELECT no,
            (process_definition IS NOT NULL AND length(process_definition) > 100) AS has_xml,
            (description_tr IS NOT NULL AND description_tr NOT LIKE '%.par') AS has_label
     FROM ${tableName('process')}
     WHERE status = 1 AND no = ANY($1::varchar[])`,
    [FEATURED_PROCESS_NOS],
  )
  const featuredByNo = new Map(featuredRows.map((r) => [r.no, r]))
  const featured = FEATURED_PROCESS_NOS.map((no) => {
    const hit = featuredByNo.get(no)
    return {
      no,
      hasXml: hit?.has_xml ?? false,
      hasLabel: hit?.has_label ?? false,
    }
  })

  const withXml = Number(totals[0]?.with_xml ?? 0)
  const activeProcesses = Number(totals[0]?.active ?? 0)
  const withTurkishLabel = Number(totals[0]?.with_label ?? 0)
  const ok = featured.every((f) => f.hasXml && f.hasLabel) && withXml >= 300

  return {
    ok,
    hasDefinitionColumn,
    hasDescriptionTrColumn: hasDescTr,
    activeProcesses,
    withXml,
    withTurkishLabel,
    featured,
    repairCommand,
  }
}
