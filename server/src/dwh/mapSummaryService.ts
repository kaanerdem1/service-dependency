import { query, tableName } from './db.js'
import { fullTableName } from './format.js'
import type { DwhMapNodeSummary } from './types.js'

type TableIdentityRow = {
  table_id: number
  schema_adi: string | null
  tablo_adi: string
  katman: string | null
}

type ReportIdentityRow = {
  rapor_id: number
  rapor_adi: string
}

type CountRow = {
  direct_count: string | number
  indirect_count: string | number
  total_count: string | number
  max_depth: string | number | null
}

type ReportCountRow = {
  direct_count: string | number
  indirect_count: string | number
  total_count: string | number
}

const EMPTY_COUNTS = {
  direct: 0,
  indirect: 0,
  total: 0,
}

function toInt(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function toCounts(row?: CountRow) {
  return {
    direct: toInt(row?.direct_count),
    indirect: toInt(row?.indirect_count),
    total: toInt(row?.total_count),
  }
}

function toReportCounts(row?: ReportCountRow) {
  return {
    direct: toInt(row?.direct_count),
    indirect: toInt(row?.indirect_count),
    total: toInt(row?.total_count),
  }
}

async function getTableIdentity(tableId: number) {
  const result = await query<TableIdentityRow>(
    `
    SELECT table_id, schema_adi, tablo_adi, katman
    FROM ${tableName('katalog_tablo')}
    WHERE table_id = $1
    LIMIT 1
    `,
    [tableId],
  )
  return result.rows[0]
}

async function sourceCountsForTable(tableId: number) {
  const result = await query<CountRow>(
    `
    WITH RECURSIVE kaynak (seviye, table_id, yol) AS (
      SELECT 1, sk.kaynak_table_id, ARRAY[$1, sk.kaynak_table_id]
      FROM ${tableName('katalog_unit_statement')} us
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.statement_id = us.statement_id
      WHERE us.hedef_table_id = $1
      UNION ALL
      SELECT k.seviye + 1, sk.kaynak_table_id, k.yol || sk.kaynak_table_id
      FROM kaynak k
      JOIN ${tableName('katalog_unit_statement')} us ON us.hedef_table_id = k.table_id
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.statement_id = us.statement_id
      WHERE k.seviye < 10
        AND NOT (sk.kaynak_table_id = ANY(k.yol))
    ),
    tekil AS (
      SELECT table_id, MIN(seviye) AS seviye
      FROM kaynak
      GROUP BY table_id
    )
    SELECT
      COUNT(*) FILTER (WHERE seviye = 1) AS direct_count,
      COUNT(*) FILTER (WHERE seviye > 1) AS indirect_count,
      COUNT(*) AS total_count,
      COALESCE(MAX(seviye), 0) AS max_depth
    FROM tekil
    `,
    [tableId],
  )
  return result.rows[0]
}

async function targetCountsForTable(tableId: number) {
  const result = await query<CountRow>(
    `
    WITH RECURSIVE hedef (seviye, table_id, yol) AS (
      SELECT 1, us.hedef_table_id, ARRAY[$1, us.hedef_table_id]
      FROM ${tableName('katalog_statement_kaynak')} sk
      JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = sk.statement_id
      WHERE sk.kaynak_table_id = $1
        AND us.hedef_table_id IS NOT NULL
      UNION ALL
      SELECT h.seviye + 1, us.hedef_table_id, h.yol || us.hedef_table_id
      FROM hedef h
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.kaynak_table_id = h.table_id
      JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = sk.statement_id
      WHERE h.seviye < 10
        AND us.hedef_table_id IS NOT NULL
        AND NOT (us.hedef_table_id = ANY(h.yol))
    ),
    tekil AS (
      SELECT table_id, MIN(seviye) AS seviye
      FROM hedef
      GROUP BY table_id
    )
    SELECT
      COUNT(*) FILTER (WHERE seviye = 1) AS direct_count,
      COUNT(*) FILTER (WHERE seviye > 1) AS indirect_count,
      COUNT(*) AS total_count,
      COALESCE(MAX(seviye), 0) AS max_depth
    FROM tekil
    `,
    [tableId],
  )
  return result.rows[0]
}

async function affectedReportCountsForTable(tableId: number) {
  const result = await query<ReportCountRow>(
    `
    WITH RECURSIVE hedef (seviye, table_id, yol) AS (
      SELECT 0, $1::integer, ARRAY[$1::integer]
      UNION ALL
      SELECT h.seviye + 1, us.hedef_table_id, h.yol || us.hedef_table_id
      FROM hedef h
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.kaynak_table_id = h.table_id
      JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = sk.statement_id
      WHERE h.seviye < 10
        AND us.hedef_table_id IS NOT NULL
        AND NOT (us.hedef_table_id = ANY(h.yol))
    ),
    rapor AS (
      SELECT rk.rapor_id, MIN(h.seviye) AS seviye
      FROM hedef h
      JOIN ${tableName('katalog_rapor_kaynak')} rk ON rk.kaynak_table_id = h.table_id
      GROUP BY rk.rapor_id
    )
    SELECT
      COUNT(*) FILTER (WHERE seviye = 0) AS direct_count,
      COUNT(*) FILTER (WHERE seviye > 0) AS indirect_count,
      COUNT(*) AS total_count
    FROM rapor
    `,
    [tableId],
  )
  return result.rows[0]
}

async function sourceCountsForReport(reportId: number) {
  const result = await query<CountRow>(
    `
    WITH RECURSIVE kaynak (seviye, table_id, yol) AS (
      SELECT 1, rk.kaynak_table_id, ARRAY[rk.kaynak_table_id]
      FROM ${tableName('katalog_rapor_kaynak')} rk
      WHERE rk.rapor_id = $1
      UNION ALL
      SELECT k.seviye + 1, sk.kaynak_table_id, k.yol || sk.kaynak_table_id
      FROM kaynak k
      JOIN ${tableName('katalog_unit_statement')} us ON us.hedef_table_id = k.table_id
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.statement_id = us.statement_id
      WHERE k.seviye < 10
        AND NOT (sk.kaynak_table_id = ANY(k.yol))
    ),
    tekil AS (
      SELECT table_id, MIN(seviye) AS seviye
      FROM kaynak
      GROUP BY table_id
    )
    SELECT
      COUNT(*) FILTER (WHERE seviye = 1) AS direct_count,
      COUNT(*) FILTER (WHERE seviye > 1) AS indirect_count,
      COUNT(*) AS total_count,
      COALESCE(MAX(seviye), 0) AS max_depth
    FROM tekil
    `,
    [reportId],
  )
  return result.rows[0]
}

export async function getTableMapSummary(tableId: number): Promise<DwhMapNodeSummary | undefined> {
  const table = await getTableIdentity(tableId)
  if (!table) return undefined

  const [sourceRows, targetRows, reportRows] = await Promise.all([
    sourceCountsForTable(tableId),
    targetCountsForTable(tableId),
    affectedReportCountsForTable(tableId),
  ])

  return {
    entityKind: 'table',
    tableId,
    label: fullTableName(table.schema_adi, table.tablo_adi) ?? table.tablo_adi,
    schemaName: table.schema_adi,
    tableName: table.tablo_adi,
    layer: table.katman,
    sourceTables: toCounts(sourceRows),
    targetTables: toCounts(targetRows),
    affectedReports: toReportCounts(reportRows),
    maxSourceDepth: toInt(sourceRows?.max_depth),
    maxTargetDepth: toInt(targetRows?.max_depth),
  }
}

export async function getReportMapSummary(reportId: number): Promise<DwhMapNodeSummary | undefined> {
  const reportResult = await query<ReportIdentityRow>(
    `
    SELECT rapor_id, rapor_adi
    FROM ${tableName('katalog_rapor')}
    WHERE rapor_id = $1
    LIMIT 1
    `,
    [reportId],
  )
  const report = reportResult.rows[0]
  if (!report) return undefined

  const sourceRows = await sourceCountsForReport(reportId)

  return {
    entityKind: 'report',
    reportId,
    label: report.rapor_adi,
    reportName: report.rapor_adi,
    sourceTables: toCounts(sourceRows),
    targetTables: EMPTY_COUNTS,
    affectedReports: EMPTY_COUNTS,
    maxSourceDepth: toInt(sourceRows?.max_depth),
    maxTargetDepth: 0,
  }
}
