import { query, tableName } from './db.js'
import { columnStableId, fullTableName, statementStableId, tableStableId } from './format.js'
import type { DwhColumn, DwhSqlStatement, DwhTable } from './types.js'

type TableRow = {
  table_id: number
  schema_adi: string | null
  tablo_adi: string
  katman: string | null
  column_count: string | number
  source_count: string | number
  target_count: string | number
}

function toInt(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function toTable(row: TableRow): DwhTable {
  return {
    id: tableStableId(row.schema_adi, row.tablo_adi),
    tableId: row.table_id,
    schemaName: row.schema_adi,
    tableName: row.tablo_adi,
    layer: row.katman,
    columnCount: toInt(row.column_count),
    sourceCount: toInt(row.source_count),
    targetCount: toInt(row.target_count),
  }
}

const tableSelect = `
  SELECT
    kt.table_id,
    kt.schema_adi,
    kt.tablo_adi,
    kt.katman,
    (
      SELECT COUNT(*)
      FROM ${tableName('katalog_kolon')} kk
      WHERE kk.table_id = kt.table_id
    ) AS column_count,
    (
      SELECT COUNT(DISTINCT sk.kaynak_table_id)
      FROM ${tableName('katalog_unit_statement')} us
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.statement_id = us.statement_id
      WHERE us.hedef_table_id = kt.table_id
    ) AS source_count,
    (
      SELECT COUNT(DISTINCT hedef_id)
      FROM (
        SELECT us2.hedef_table_id AS hedef_id
        FROM ${tableName('katalog_statement_kaynak')} sk2
        JOIN ${tableName('katalog_unit_statement')} us2 ON us2.statement_id = sk2.statement_id
        WHERE sk2.kaynak_table_id = kt.table_id AND us2.hedef_table_id IS NOT NULL
        UNION
        SELECT -rk.rapor_id AS hedef_id
        FROM ${tableName('katalog_rapor_kaynak')} rk
        WHERE rk.kaynak_table_id = kt.table_id
      ) downstream
    ) AS target_count
  FROM ${tableName('katalog_tablo')} kt
`

export async function listTables(search = '', limit = 100): Promise<DwhTable[]> {
  const q = search.trim()
  const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
  const params: unknown[] = []
  let where = ''
  if (q) {
    params.push(`%${q}%`)
    where = `WHERE kt.tablo_adi ILIKE $1 OR kt.schema_adi ILIKE $1 OR kt.katman ILIKE $1`
  }
  params.push(boundedLimit)
  const limitParam = params.length
  const result = await query<TableRow>(
    `${tableSelect}
     ${where}
     ORDER BY kt.katman NULLS LAST, kt.schema_adi NULLS LAST, kt.tablo_adi
     LIMIT $${limitParam}`,
    params,
  )
  return result.rows.map(toTable)
}

export async function getTable(tableId: number): Promise<DwhTable | undefined> {
  const result = await query<TableRow>(
    `${tableSelect}
     WHERE kt.table_id = $1
     LIMIT 1`,
    [tableId],
  )
  return result.rows[0] ? toTable(result.rows[0]) : undefined
}

export async function listColumns(tableId: number): Promise<DwhColumn[]> {
  const result = await query<{
    column_id: number
    table_id: number
    kolon_adi: string
    kolon_sira: number | null
    veri_tipi: string | null
    schema_adi: string | null
    tablo_adi: string
  }>(
    `
    SELECT kk.column_id, kk.table_id, kk.kolon_adi, kk.kolon_sira, kk.veri_tipi,
           kt.schema_adi, kt.tablo_adi
    FROM ${tableName('katalog_kolon')} kk
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = kk.table_id
    WHERE kk.table_id = $1
    ORDER BY kk.kolon_sira NULLS LAST, kk.kolon_adi
    `,
    [tableId],
  )

  return result.rows.map((row) => ({
    id: columnStableId(row.schema_adi, row.tablo_adi, row.kolon_adi),
    columnId: row.column_id,
    tableId: row.table_id,
    columnName: row.kolon_adi,
    ordinal: row.kolon_sira,
    dataType: row.veri_tipi,
  }))
}

async function sourcesForStatement(statementId: number) {
  const result = await query<{ schema_adi: string | null; tablo_adi: string }>(
    `
    SELECT DISTINCT kt.schema_adi, kt.tablo_adi
    FROM ${tableName('katalog_statement_kaynak')} sk
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = sk.kaynak_table_id
    WHERE sk.statement_id = $1
    ORDER BY kt.tablo_adi
    `,
    [statementId],
  )
  return result.rows.map((row) => fullTableName(row.schema_adi, row.tablo_adi) ?? row.tablo_adi)
}

export async function listStatementsForTable(tableId: number): Promise<DwhSqlStatement[]> {
  const writers = await query<{
    statement_id: number
    paket_adi: string | null
    procedure_adi: string | null
    dml_tipi: string
    satir_no: number | null
    sql_metni: string | null
    hedef_schema: string | null
    hedef_tablo: string | null
  }>(
    `
    SELECT us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no,
           us.sql_metni, ht.schema_adi AS hedef_schema, ht.tablo_adi AS hedef_tablo
    FROM ${tableName('katalog_unit_statement')} us
    JOIN ${tableName('katalog_unit')} u ON u.unit_id = us.unit_id
    LEFT JOIN ${tableName('katalog_tablo')} ht ON ht.table_id = us.hedef_table_id
    WHERE us.hedef_table_id = $1
    ORDER BY u.procedure_adi, us.satir_no, us.statement_id
    `,
    [tableId],
  )

  const readers = await query<{
    statement_id: number
    paket_adi: string | null
    procedure_adi: string | null
    dml_tipi: string
    satir_no: number | null
    sql_metni: string | null
    hedef_schema: string | null
    hedef_tablo: string | null
  }>(
    `
    SELECT DISTINCT us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no,
           us.sql_metni, ht.schema_adi AS hedef_schema, ht.tablo_adi AS hedef_tablo
    FROM ${tableName('katalog_unit_statement')} us
    JOIN ${tableName('katalog_unit')} u ON u.unit_id = us.unit_id
    JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.statement_id = us.statement_id
    LEFT JOIN ${tableName('katalog_tablo')} ht ON ht.table_id = us.hedef_table_id
    WHERE sk.kaynak_table_id = $1
    ORDER BY u.procedure_adi, us.satir_no, us.statement_id
    `,
    [tableId],
  )

  const rows = [
    ...writers.rows.map((row) => ({ ...row, role: 'writer' as const, relatedTable: null })),
    ...readers.rows.map((row) => ({
      ...row,
      role: 'reader' as const,
      relatedTable: fullTableName(row.hedef_schema, row.hedef_tablo),
    })),
  ]

  return Promise.all(
    rows.map(async (row) => ({
      id: statementStableId(row.statement_id),
      statementId: row.statement_id,
      packageName: row.paket_adi,
      procedureName: row.procedure_adi,
      dmlType: row.dml_tipi,
      lineNo: row.satir_no,
      sqlText: row.sql_metni,
      simplifiedSql: null,
      targetTable: fullTableName(row.hedef_schema, row.hedef_tablo),
      role: row.role,
      relatedTable: row.relatedTable,
      sources: await sourcesForStatement(row.statement_id),
    })),
  )
}

