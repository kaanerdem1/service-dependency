import { query, tableName } from './db.js'
import { fullTableName, statementStableId } from './format.js'
import type { DwhSqlStatement } from './types.js'

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

export async function getStatement(statementId: number): Promise<DwhSqlStatement | undefined> {
  const result = await query<{
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
    WHERE us.statement_id = $1
    LIMIT 1
    `,
    [statementId],
  )
  const row = result.rows[0]
  if (!row) return undefined

  return {
    id: statementStableId(row.statement_id),
    statementId: row.statement_id,
    packageName: row.paket_adi,
    procedureName: row.procedure_adi,
    dmlType: row.dml_tipi,
    lineNo: row.satir_no,
    sqlText: row.sql_metni,
    simplifiedSql: null,
    targetTable: fullTableName(row.hedef_schema, row.hedef_tablo),
    sources: await sourcesForStatement(row.statement_id),
  }
}

