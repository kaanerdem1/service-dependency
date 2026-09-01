import { query, tableName } from './db.js'
import { columnStableId, fullTableName, reportStableId, tableStableId } from './format.js'
import { simplifySql } from './sqlSimplify.js'
import type { DwhReport, DwhReportColumn, DwhTableRef } from './types.js'

type ReportRow = {
  rapor_id: number
  rapor_adi: string
  dosya_adi: string | null
  sql_metni: string | null
  source_count: string | number
  column_count: string | number
}

function toInt(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function toReport(row: ReportRow): DwhReport {
  return {
    id: reportStableId(row.rapor_adi),
    reportId: row.rapor_id,
    reportName: row.rapor_adi,
    fileName: row.dosya_adi,
    sourceCount: toInt(row.source_count),
    columnCount: toInt(row.column_count),
  }
}

const reportSelect = `
  SELECT
    r.rapor_id,
    r.rapor_adi,
    r.dosya_adi,
    r.sql_metni,
    (
      SELECT COUNT(DISTINCT rk.kaynak_table_id)
      FROM ${tableName('katalog_rapor_kaynak')} rk
      WHERE rk.rapor_id = r.rapor_id
    ) AS source_count,
    (
      SELECT COUNT(DISTINCT rkl.rapor_kolon_adi)
      FROM ${tableName('katalog_rapor_kolon_lineage')} rkl
      WHERE rkl.rapor_id = r.rapor_id
    ) AS column_count
  FROM ${tableName('katalog_rapor')} r
`

export async function listReports(search = '', limit = 100): Promise<DwhReport[]> {
  const q = search.trim()
  const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
  const params: unknown[] = []
  let where = ''
  if (q) {
    params.push(`%${q}%`)
    where = `WHERE r.rapor_adi ILIKE $1 OR r.dosya_adi ILIKE $1`
  }
  params.push(boundedLimit)
  const limitParam = params.length
  const result = await query<ReportRow>(
    `${reportSelect}
     ${where}
     ORDER BY r.rapor_adi
     LIMIT $${limitParam}`,
    params,
  )
  return result.rows.map(toReport)
}

export async function getReport(reportId: number) {
  const reportResult = await query<ReportRow>(
    `${reportSelect}
     WHERE r.rapor_id = $1
     LIMIT 1`,
    [reportId],
  )
  const report = reportResult.rows[0]
  if (!report) return undefined

  const sourceResult = await query<{
    table_id: number
    schema_adi: string | null
    tablo_adi: string
    katman: string | null
  }>(
    `
    SELECT DISTINCT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
    FROM ${tableName('katalog_rapor_kaynak')} rk
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = rk.kaynak_table_id
    WHERE rk.rapor_id = $1
    ORDER BY kt.tablo_adi
    `,
    [reportId],
  )

  const columnResult = await query<{
    rapor_kolon_adi: string
    kaynak_schema: string | null
    kaynak_tablo: string | null
    kaynak_kolon: string | null
    kaynak_column_id: number | null
    donusum_tipi: string | null
    guven_seviyesi: 'KESIN' | 'TAHMIN' | null
  }>(
    `
    SELECT rkl.rapor_kolon_adi, kt.schema_adi AS kaynak_schema, kt.tablo_adi AS kaynak_tablo,
           kk.kolon_adi AS kaynak_kolon, rkl.kaynak_column_id, rkl.donusum_tipi, rkl.guven_seviyesi
    FROM ${tableName('katalog_rapor_kolon_lineage')} rkl
    LEFT JOIN ${tableName('katalog_kolon')} kk ON kk.column_id = rkl.kaynak_column_id
    LEFT JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = kk.table_id
    WHERE rkl.rapor_id = $1
    ORDER BY rkl.rapor_kolon_adi, kt.tablo_adi, kk.kolon_adi
    `,
    [reportId],
  )

  const sourceTables: DwhTableRef[] = sourceResult.rows.map((row) => ({
    id: tableStableId(row.schema_adi, row.tablo_adi),
    tableId: row.table_id,
    schemaName: row.schema_adi,
    tableName: row.tablo_adi,
    layer: row.katman,
  }))

  const columns: DwhReportColumn[] = columnResult.rows.map((row) => ({
    columnName: row.rapor_kolon_adi,
    sourceTable: fullTableName(row.kaynak_schema, row.kaynak_tablo),
    sourceColumn: row.kaynak_kolon,
    transformationType: row.donusum_tipi,
    confidence: row.guven_seviyesi,
  }))

  return {
    ...toReport(report),
    sqlText: report.sql_metni,
    simplifiedSql: simplifySql(report.sql_metni),
    sourceTables,
    columns,
  }
}

export function reportColumnStableId(reportName: string, columnName: string) {
  return columnStableId(null, reportStableId(reportName), columnName)
}
