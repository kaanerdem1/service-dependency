import { query, tableName } from './db.js'
import { fullTableName, reportStableId, statementStableId, tableStableId } from './format.js'
import { simplifySql } from './sqlSimplify.js'
import type { DwhImpactTable, DwhTableImpact } from './types.js'

type ImpactTableRow = {
  seviye: number
  hedef_table_id: number
  hedef_schema: string | null
  hedef_tablo: string
  kaynak_table_id: number
  kaynak_schema: string | null
  kaynak_tablo: string
  statement_id: number
  paket_adi: string | null
  procedure_adi: string | null
  dml_tipi: string | null
  satir_no: number | null
  sql_metni: string | null
}

type ImpactReportRow = {
  rapor_adi: string
  schema_adi: string | null
  tablo_adi: string
}

export async function getTableImpact(tableId: number): Promise<DwhTableImpact | undefined> {
  const tableResult = await query<{ tablo_adi: string; schema_adi: string | null }>(
    `
    SELECT tablo_adi, schema_adi
    FROM ${tableName('katalog_tablo')}
    WHERE table_id = $1
    LIMIT 1
    `,
    [tableId],
  )
  const table = tableResult.rows[0]
  if (!table) return undefined

  const impactResult = await query<ImpactTableRow>(
    `
    WITH RECURSIVE etki (seviye, kaynak_table_id, hedef_table_id, statement_id, yol) AS (
      SELECT 1, sk.kaynak_table_id, us.hedef_table_id, us.statement_id,
             ARRAY[$1, us.hedef_table_id]
      FROM ${tableName('katalog_statement_kaynak')} sk
      JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = sk.statement_id
      WHERE sk.kaynak_table_id = $1 AND us.hedef_table_id IS NOT NULL
      UNION ALL
      SELECT e.seviye + 1, sk.kaynak_table_id, us.hedef_table_id, us.statement_id,
             e.yol || us.hedef_table_id
      FROM etki e
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.kaynak_table_id = e.hedef_table_id
      JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = sk.statement_id
      WHERE e.seviye < 10
        AND us.hedef_table_id IS NOT NULL
        AND NOT (us.hedef_table_id = ANY(e.yol))
    )
    SELECT DISTINCT
      e.seviye,
      hedef.table_id AS hedef_table_id,
      hedef.schema_adi AS hedef_schema,
      hedef.tablo_adi AS hedef_tablo,
      kaynak.table_id AS kaynak_table_id,
      kaynak.schema_adi AS kaynak_schema,
      kaynak.tablo_adi AS kaynak_tablo,
      us.statement_id,
      u.paket_adi,
      u.procedure_adi,
      us.dml_tipi,
      us.satir_no,
      us.sql_metni
    FROM etki e
    JOIN ${tableName('katalog_tablo')} hedef ON hedef.table_id = e.hedef_table_id
    JOIN ${tableName('katalog_tablo')} kaynak ON kaynak.table_id = e.kaynak_table_id
    JOIN ${tableName('katalog_unit_statement')} us ON us.statement_id = e.statement_id
    JOIN ${tableName('katalog_unit')} u ON u.unit_id = us.unit_id
    ORDER BY e.seviye, hedef.tablo_adi, u.procedure_adi, us.satir_no
    `,
    [tableId],
  )

  const affectedTableIds = new Set<number>([tableId])
  for (const row of impactResult.rows) affectedTableIds.add(row.hedef_table_id)

  const reportResult = await query<ImpactReportRow>(
    `
    SELECT DISTINCT r.rapor_adi, kt.schema_adi, kt.tablo_adi
    FROM ${tableName('katalog_rapor_kaynak')} rk
    JOIN ${tableName('katalog_rapor')} r ON r.rapor_id = rk.rapor_id
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = rk.kaynak_table_id
    WHERE rk.kaynak_table_id = ANY($1)
    ORDER BY r.rapor_adi
    `,
    [Array.from(affectedTableIds)],
  )

  return {
    tableName: table.tablo_adi,
    schemaName: table.schema_adi,
    affectedTables: groupImpactTables(impactResult.rows),
    affectedReports: reportResult.rows.map((row) => {
      const viaTableName = fullTableName(row.schema_adi, row.tablo_adi) ?? row.tablo_adi
      return {
        id: reportStableId(`${row.rapor_adi}:${viaTableName}`),
        reportName: row.rapor_adi,
        viaTableName,
      }
    }),
  }
}

function groupImpactTables(rows: ImpactTableRow[]): DwhImpactTable[] {
  const tables = new Map<string, DwhImpactTable>()
  for (const row of rows) {
    const tableKey = `${row.seviye}:${row.hedef_table_id}`
    const existing = tables.get(tableKey)
    const table =
      existing ??
      {
        id: tableStableId(row.hedef_schema, row.hedef_tablo),
        tableId: row.hedef_table_id,
        level: row.seviye,
        schemaName: row.hedef_schema,
        tableName: row.hedef_tablo,
        statements: [],
      }
    table.statements.push({
      id: statementStableId(row.statement_id),
      statementId: row.statement_id,
      sourceTableId: row.kaynak_table_id,
      sourceTableName: fullTableName(row.kaynak_schema, row.kaynak_tablo) ?? row.kaynak_tablo,
      packageName: row.paket_adi,
      procedureName: row.procedure_adi,
      dmlType: row.dml_tipi,
      lineNo: row.satir_no,
      sqlText: row.sql_metni,
      simplifiedSql: simplifySql(row.sql_metni),
    })
    tables.set(tableKey, table)
  }
  return Array.from(tables.values())
}
