import { query, tableName } from './db.js'
import { columnStableId, fullTableName } from './format.js'
import { getReport } from './reportService.js'
import { getTable } from './tableService.js'
import type {
  DwhColumnAncestryResponse,
  DwhColumnAncestryStep,
  DwhColumnLineageResponse,
  DwhColumnLineageSource,
  DwhColumnLineageTarget,
} from './types.js'

type TableColumnLineageRow = {
  hedef_column_id: number
  hedef_kolon: string
  kolon_sira: number | null
  kaynak_column_id: number
  kaynak_table_id: number
  kaynak_schema: string | null
  kaynak_tablo: string
  kaynak_kolon: string
  donusum_tipi: string | null
  guven_seviyesi: 'KESIN' | 'TAHMIN' | null
  statement_id: number
  paket_adi: string | null
  procedure_adi: string | null
}

type ReportColumnLineageRow = {
  rapor_kolon_adi: string
  kaynak_column_id: number | null
  kaynak_table_id: number | null
  kaynak_schema: string | null
  kaynak_tablo: string | null
  kaynak_kolon: string | null
  donusum_tipi: string | null
  guven_seviyesi: 'KESIN' | 'TAHMIN' | null
}

type AncestryRow = {
  seviye: number
  source_column_id: number
  source_table_id: number
  source_schema: string | null
  source_table: string
  source_column: string
  downstream_column_id: number
  downstream_schema: string | null
  downstream_table: string
  downstream_column: string
  donusum_tipi: string | null
  guven_seviyesi: 'KESIN' | 'TAHMIN' | null
  yol_metin: string
  orijinal_mi: boolean
}

function lineageSourceId(prefix: string, source: Pick<DwhColumnLineageSource, 'sourceColumnId' | 'statementId'>, index: number) {
  return `${prefix}:src:${source.sourceColumnId ?? 'unknown'}:${source.statementId ?? 'report'}:${index}`
}

function groupTargets(rows: TableColumnLineageRow[]): DwhColumnLineageTarget[] {
  const groups = new Map<number, DwhColumnLineageTarget>()
  rows.forEach((row, index) => {
    const target =
      groups.get(row.hedef_column_id) ??
      {
        id: columnStableId(null, `target:${row.hedef_column_id}`, row.hedef_kolon),
        targetColumnId: row.hedef_column_id,
        targetColumnName: row.hedef_kolon,
        ordinal: row.kolon_sira,
        sources: [],
      }
    const source: DwhColumnLineageSource = {
      id: lineageSourceId(target.id, {
        sourceColumnId: row.kaynak_column_id,
        statementId: row.statement_id,
      }, index),
      sourceColumnId: row.kaynak_column_id,
      sourceTableId: row.kaynak_table_id,
      sourceTableName: fullTableName(row.kaynak_schema, row.kaynak_tablo),
      sourceColumnName: row.kaynak_kolon,
      transformationType: row.donusum_tipi,
      confidence: row.guven_seviyesi,
      statementId: row.statement_id,
      packageName: row.paket_adi,
      procedureName: row.procedure_adi,
    }
    target.sources.push(source)
    groups.set(row.hedef_column_id, target)
  })

  return Array.from(groups.values()).sort((a, b) => {
    const ordinalDiff = Number(a.ordinal == null) - Number(b.ordinal == null)
    if (ordinalDiff) return ordinalDiff
    if (a.ordinal != null && b.ordinal != null && a.ordinal !== b.ordinal) return a.ordinal - b.ordinal
    return a.targetColumnName.localeCompare(b.targetColumnName, 'tr')
  })
}

export async function getTableColumnLineage(tableId: number): Promise<DwhColumnLineageResponse | undefined> {
  const table = await getTable(tableId)
  if (!table) return undefined

  const result = await query<TableColumnLineageRow>(
    `
    SELECT
      hk.column_id AS hedef_column_id,
      hk.kolon_adi AS hedef_kolon,
      hk.kolon_sira,
      kk.column_id AS kaynak_column_id,
      kt.table_id AS kaynak_table_id,
      kt.schema_adi AS kaynak_schema,
      kt.tablo_adi AS kaynak_tablo,
      kk.kolon_adi AS kaynak_kolon,
      kl.donusum_tipi,
      kl.guven_seviyesi,
      us.statement_id,
      u.paket_adi,
      u.procedure_adi
    FROM ${tableName('katalog_kolon_lineage')} kl
    JOIN ${tableName('katalog_kolon')} hk ON hk.column_id = kl.hedef_column_id
    JOIN ${tableName('katalog_kolon')} kk ON kk.column_id = kl.kaynak_column_id
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = kk.table_id
    JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = kl.statement_id
    JOIN ${tableName('katalog_unit')} u ON u.unit_id = us.unit_id
    WHERE hk.table_id = $1
    ORDER BY hk.kolon_sira NULLS LAST, hk.kolon_adi, kt.tablo_adi, kk.kolon_adi
    `,
    [tableId],
  )

  return {
    entityKind: 'table',
    table,
    targets: groupTargets(result.rows),
    totalColumns: table.columnCount,
  }
}

export async function getReportColumnLineage(reportId: number): Promise<DwhColumnLineageResponse | undefined> {
  const report = await getReport(reportId)
  if (!report) return undefined

  const result = await query<ReportColumnLineageRow>(
    `
    SELECT
      rkl.rapor_kolon_adi,
      kk.column_id AS kaynak_column_id,
      kt.table_id AS kaynak_table_id,
      kt.schema_adi AS kaynak_schema,
      kt.tablo_adi AS kaynak_tablo,
      kk.kolon_adi AS kaynak_kolon,
      rkl.donusum_tipi,
      rkl.guven_seviyesi
    FROM ${tableName('katalog_rapor_kolon_lineage')} rkl
    LEFT JOIN ${tableName('katalog_kolon')} kk ON kk.column_id = rkl.kaynak_column_id
    LEFT JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = kk.table_id
    WHERE rkl.rapor_id = $1
    ORDER BY rkl.rapor_kolon_adi, kt.tablo_adi, kk.kolon_adi
    `,
    [reportId],
  )

  const groups = new Map<string, DwhColumnLineageTarget>()
  result.rows.forEach((row, index) => {
    const target =
      groups.get(row.rapor_kolon_adi) ??
      {
        id: columnStableId(null, `report:${report.reportId}`, row.rapor_kolon_adi),
        targetColumnName: row.rapor_kolon_adi,
        sources: [],
      }
    const source: DwhColumnLineageSource = {
      id: lineageSourceId(target.id, {
        sourceColumnId: row.kaynak_column_id,
      }, index),
      sourceColumnId: row.kaynak_column_id,
      sourceTableId: row.kaynak_table_id,
      sourceTableName: fullTableName(row.kaynak_schema, row.kaynak_tablo),
      sourceColumnName: row.kaynak_kolon,
      transformationType: row.donusum_tipi,
      confidence: row.guven_seviyesi,
    }
    target.sources.push(source)
    groups.set(row.rapor_kolon_adi, target)
  })

  return {
    entityKind: 'report',
    report,
    targets: Array.from(groups.values()).sort((a, b) => a.targetColumnName.localeCompare(b.targetColumnName, 'tr')),
    totalColumns: report.columnCount,
  }
}

export async function getColumnAncestry(columnId: number): Promise<DwhColumnAncestryResponse | undefined> {
  const columnResult = await query<{
    column_id: number
    kolon_adi: string
    schema_adi: string | null
    tablo_adi: string
  }>(
    `
    SELECT kk.column_id, kk.kolon_adi, kt.schema_adi, kt.tablo_adi
    FROM ${tableName('katalog_kolon')} kk
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = kk.table_id
    WHERE kk.column_id = $1
    LIMIT 1
    `,
    [columnId],
  )
  const column = columnResult.rows[0]
  if (!column) return undefined

  const ancestryResult = await query<AncestryRow>(
    `
    WITH RECURSIVE soykutuk (
      kaynak_column_id,
      source_table_id,
      source_schema,
      source_table,
      source_column,
      downstream_column_id,
      downstream_schema,
      downstream_table,
      downstream_column,
      donusum_tipi,
      guven_seviyesi,
      seviye,
      yol,
      yol_metin
    ) AS (
      SELECT
        cl.kaynak_column_id,
        st.table_id,
        st.schema_adi,
        st.tablo_adi,
        sc.kolon_adi,
        dc.column_id,
        dt.schema_adi,
        dt.tablo_adi,
        dc.kolon_adi,
        cl.donusum_tipi,
        cl.guven_seviyesi,
        1,
        ARRAY[cl.hedef_column_id, cl.kaynak_column_id],
        (COALESCE(st.schema_adi || '.', '') || st.tablo_adi || '.' || sc.kolon_adi)::text
      FROM ${tableName('katalog_kolon_lineage')} cl
      JOIN ${tableName('katalog_kolon')} sc ON sc.column_id = cl.kaynak_column_id
      JOIN ${tableName('katalog_tablo')} st ON st.table_id = sc.table_id
      JOIN ${tableName('katalog_kolon')} dc ON dc.column_id = cl.hedef_column_id
      JOIN ${tableName('katalog_tablo')} dt ON dt.table_id = dc.table_id
      WHERE cl.hedef_column_id = $1
      UNION ALL
      SELECT
        cl2.kaynak_column_id,
        st2.table_id,
        st2.schema_adi,
        st2.tablo_adi,
        sc2.kolon_adi,
        dc2.column_id,
        dt2.schema_adi,
        dt2.tablo_adi,
        dc2.kolon_adi,
        cl2.donusum_tipi,
        cl2.guven_seviyesi,
        s.seviye + 1,
        s.yol || cl2.kaynak_column_id,
        s.yol_metin || ' <- ' || COALESCE(st2.schema_adi || '.', '') || st2.tablo_adi || '.' || sc2.kolon_adi
      FROM soykutuk s
      JOIN ${tableName('katalog_kolon_lineage')} cl2 ON cl2.hedef_column_id = s.kaynak_column_id
      JOIN ${tableName('katalog_kolon')} sc2 ON sc2.column_id = cl2.kaynak_column_id
      JOIN ${tableName('katalog_tablo')} st2 ON st2.table_id = sc2.table_id
      JOIN ${tableName('katalog_kolon')} dc2 ON dc2.column_id = cl2.hedef_column_id
      JOIN ${tableName('katalog_tablo')} dt2 ON dt2.table_id = dc2.table_id
      WHERE s.seviye < 20 AND NOT (cl2.kaynak_column_id = ANY(s.yol))
    )
    SELECT DISTINCT
      s.seviye,
      s.kaynak_column_id AS source_column_id,
      s.source_table_id,
      s.source_schema,
      s.source_table,
      s.source_column,
      s.downstream_column_id,
      s.downstream_schema,
      s.downstream_table,
      s.downstream_column,
      s.donusum_tipi,
      s.guven_seviyesi,
      s.yol_metin,
      NOT EXISTS (
        SELECT 1
        FROM ${tableName('katalog_kolon_lineage')} cl3
        WHERE cl3.hedef_column_id = s.kaynak_column_id
      ) AS orijinal_mi
    FROM soykutuk s
    ORDER BY s.seviye, s.source_table, s.source_column
    `,
    [columnId],
  )

  const steps: DwhColumnAncestryStep[] = ancestryResult.rows.map((row, index) => {
    const sourceTableName = fullTableName(row.source_schema, row.source_table) ?? row.source_table
    const downstreamTableName = fullTableName(row.downstream_schema, row.downstream_table) ?? row.downstream_table
    return {
      id: `ancestor:${row.source_column_id}:${row.seviye}:${index}`,
      level: row.seviye,
      sourceColumnId: row.source_column_id,
      sourceTableId: row.source_table_id,
      sourceTableName,
      sourceColumnName: row.source_column,
      downstreamColumnId: row.downstream_column_id,
      downstreamTableName,
      downstreamColumnName: row.downstream_column,
      transformationType: row.donusum_tipi,
      confidence: row.guven_seviyesi,
      pathText: row.yol_metin,
      original: row.orijinal_mi,
    }
  })

  return {
    columnId,
    columnName: column.kolon_adi,
    tableName: fullTableName(column.schema_adi, column.tablo_adi) ?? column.tablo_adi,
    steps,
  }
}
