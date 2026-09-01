import { query, tableName } from './db.js'
import { fullTableName } from './format.js'
import type { DwhTreeChildrenResponse, DwhTreeNode } from './types.js'

type SourceTableRow = {
  table_id: number
  schema_adi: string | null
  tablo_adi: string
  katman: string | null
  source_count: string | number | null
  statement_ids: number[] | null
}

type SubqueryRow = {
  alt_sorgu_id: number
  ust_alt_sorgu_id: number | null
  alias: string | null
  tip: string | null
}

function tableNode(row: SourceTableRow, targetTableId?: number): DwhTreeNode {
  const sourceCount = Number(row.source_count ?? 0)
  return {
    kind: 'table',
    label: fullTableName(row.schema_adi, row.tablo_adi) ?? row.tablo_adi,
    tableId: row.table_id,
    schemaName: row.schema_adi,
    tableName: row.tablo_adi,
    layer: row.katman,
    sourceCount,
    hasChildren: sourceCount > 0,
    connection:
      targetTableId && row.statement_ids
        ? {
            type: 'statement',
            targetTableId,
            sourceTableId: row.table_id,
            statementIds: row.statement_ids.map(Number),
          }
        : undefined,
  }
}

function subqueryNode(row: SubqueryRow): DwhTreeNode {
  const labelByType: Record<string, string> = {
    FROM_ALT_SORGU: 'Alt sorgu',
    WHERE_ALT_SORGU: 'Alt sorgu',
    CTE: 'CTE',
    UNION_DALI: 'UNION dalı',
    TABLO_FONKSIYONU: 'Tablo fonksiyonu',
  }
  return {
    kind: 'subquery',
    label: labelByType[row.tip ?? ''] ?? 'Alt sorgu',
    subqueryId: row.alt_sorgu_id,
    subqueryType: row.tip,
    alias: row.alias,
    hasChildren: true,
  }
}

function emptyNode(label: string): DwhTreeNode {
  return {
    kind: 'empty',
    label,
    hasChildren: false,
  }
}

async function filledSubqueryIds() {
  const [subqueryResult, ownSourceResult] = await Promise.all([
    query<{
      alt_sorgu_id: number
      ust_alt_sorgu_id: number | null
    }>(
      `
      SELECT alt_sorgu_id, ust_alt_sorgu_id
      FROM ${tableName('katalog_statement_alt_sorgu')}
      `,
    ),
    query<{ alt_sorgu_id: number }>(
      `
      SELECT DISTINCT alt_sorgu_id
      FROM ${tableName('katalog_statement_kaynak')}
      WHERE alt_sorgu_id IS NOT NULL
      `,
    ),
  ])

  const ownFilled = new Set(ownSourceResult.rows.map((row) => row.alt_sorgu_id))
  const children = new Map<number, number[]>()
  for (const row of subqueryResult.rows) {
    if (row.ust_alt_sorgu_id == null) continue
    const list = children.get(row.ust_alt_sorgu_id) ?? []
    list.push(row.alt_sorgu_id)
    children.set(row.ust_alt_sorgu_id, list)
  }

  const memo = new Map<number, boolean>()
  const isFilled = (id: number): boolean => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    memo.set(id, false)
    const value = ownFilled.has(id) || (children.get(id) ?? []).some(isFilled)
    memo.set(id, value)
    return value
  }

  return new Set(subqueryResult.rows.filter((row) => isFilled(row.alt_sorgu_id)).map((row) => row.alt_sorgu_id))
}

export async function listTableTreeChildren(
  tableId: number,
  simple = false,
): Promise<DwhTreeChildrenResponse> {
  if (simple) {
    const result = await query<SourceTableRow>(
      `
      SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
             (
               SELECT COUNT(DISTINCT sk2.kaynak_table_id)
               FROM ${tableName('katalog_unit_statement')} us2
               JOIN ${tableName('katalog_statement_kaynak')} sk2 ON sk2.statement_id = us2.statement_id
               WHERE us2.hedef_table_id = kt.table_id
             ) AS source_count,
             ARRAY_AGG(DISTINCT us.statement_id ORDER BY us.statement_id) AS statement_ids
      FROM ${tableName('katalog_unit_statement')} us
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.statement_id = us.statement_id
      JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = sk.kaynak_table_id
      WHERE us.hedef_table_id = $1
      GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
      ORDER BY kt.tablo_adi
      `,
      [tableId],
    )
    const children = result.rows.map((row) => tableNode(row, tableId))
    return { children: children.length ? children : [emptyNode('kaynak yok - zincirin başlangıcı')] }
  }

  const [directResult, subqueryResult, filledIds] = await Promise.all([
    query<SourceTableRow>(
      `
      SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
             (
               SELECT COUNT(DISTINCT sk2.kaynak_table_id)
               FROM ${tableName('katalog_unit_statement')} us2
               JOIN ${tableName('katalog_statement_kaynak')} sk2 ON sk2.statement_id = us2.statement_id
               WHERE us2.hedef_table_id = kt.table_id
             ) AS source_count,
             ARRAY_AGG(DISTINCT us.statement_id ORDER BY us.statement_id) AS statement_ids
      FROM ${tableName('katalog_unit_statement')} us
      JOIN ${tableName('katalog_statement_alt_sorgu')} als
           ON als.statement_id = us.statement_id AND als.ust_alt_sorgu_id IS NULL
      JOIN ${tableName('katalog_statement_kaynak')} sk ON sk.alt_sorgu_id = als.alt_sorgu_id
      JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = sk.kaynak_table_id
      WHERE us.hedef_table_id = $1
      GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
      ORDER BY kt.tablo_adi
      `,
      [tableId],
    ),
    query<SubqueryRow>(
      `
      SELECT DISTINCT child.alt_sorgu_id, child.ust_alt_sorgu_id, child.alias, child.tip
      FROM ${tableName('katalog_unit_statement')} us
      JOIN ${tableName('katalog_statement_alt_sorgu')} root_als
           ON root_als.statement_id = us.statement_id AND root_als.ust_alt_sorgu_id IS NULL
      JOIN ${tableName('katalog_statement_alt_sorgu')} child ON child.ust_alt_sorgu_id = root_als.alt_sorgu_id
      WHERE us.hedef_table_id = $1
      ORDER BY child.alt_sorgu_id
      `,
      [tableId],
    ),
    filledSubqueryIds(),
  ])

  const children = [
    ...subqueryResult.rows.filter((row) => filledIds.has(row.alt_sorgu_id)).map(subqueryNode),
    ...directResult.rows.map((row) => tableNode(row, tableId)),
  ]
  return { children: children.length ? children : [emptyNode('kaynak yok - zincirin başlangıcı')] }
}

export async function listSubqueryTreeChildren(subqueryId: number): Promise<DwhTreeChildrenResponse> {
  const [directResult, subqueryResult, filledIds] = await Promise.all([
    query<SourceTableRow>(
      `
      SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
             (
               SELECT COUNT(DISTINCT sk2.kaynak_table_id)
               FROM ${tableName('katalog_unit_statement')} us2
               JOIN ${tableName('katalog_statement_kaynak')} sk2 ON sk2.statement_id = us2.statement_id
               WHERE us2.hedef_table_id = kt.table_id
             ) AS source_count,
             ARRAY_AGG(DISTINCT sk.statement_id ORDER BY sk.statement_id) AS statement_ids
      FROM ${tableName('katalog_statement_kaynak')} sk
      JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = sk.kaynak_table_id
      WHERE sk.alt_sorgu_id = $1
      GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
      ORDER BY kt.tablo_adi
      `,
      [subqueryId],
    ),
    query<SubqueryRow>(
      `
      SELECT alt_sorgu_id, ust_alt_sorgu_id, alias, tip
      FROM ${tableName('katalog_statement_alt_sorgu')}
      WHERE ust_alt_sorgu_id = $1
      ORDER BY alt_sorgu_id
      `,
      [subqueryId],
    ),
    filledSubqueryIds(),
  ])

  const children = [
    ...subqueryResult.rows.filter((row) => filledIds.has(row.alt_sorgu_id)).map(subqueryNode),
    ...directResult.rows.map((row) => tableNode(row)),
  ]
  return { children: children.length ? children : [emptyNode('bu SQL grubunda tablo bulunamadı')] }
}

export async function listReportTreeChildren(reportId: number): Promise<DwhTreeChildrenResponse> {
  const result = await query<{
    table_id: number
    schema_adi: string | null
    tablo_adi: string
    katman: string | null
    source_count: string | number | null
  }>(
    `
    SELECT DISTINCT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
           (
             SELECT COUNT(DISTINCT sk2.kaynak_table_id)
             FROM ${tableName('katalog_unit_statement')} us2
             JOIN ${tableName('katalog_statement_kaynak')} sk2 ON sk2.statement_id = us2.statement_id
             WHERE us2.hedef_table_id = kt.table_id
           ) AS source_count
    FROM ${tableName('katalog_rapor_kaynak')} rk
    JOIN ${tableName('katalog_tablo')} kt ON kt.table_id = rk.kaynak_table_id
    WHERE rk.rapor_id = $1
    ORDER BY kt.tablo_adi
    `,
    [reportId],
  )

  const children = result.rows.map((row) => ({
    kind: 'table' as const,
    label: fullTableName(row.schema_adi, row.tablo_adi) ?? row.tablo_adi,
    tableId: row.table_id,
    schemaName: row.schema_adi,
    tableName: row.tablo_adi,
    layer: row.katman,
    sourceCount: Number(row.source_count ?? 0),
    hasChildren: Number(row.source_count ?? 0) > 0,
    connection: {
      type: 'reportSql' as const,
      reportId,
      sourceTableId: row.table_id,
    },
  }))

  return { children: children.length ? children : [emptyNode('bu rapor için kayıtlı kaynak tablo yok')] }
}
