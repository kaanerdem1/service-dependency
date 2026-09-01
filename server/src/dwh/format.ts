export function tableStableId(schemaName: string | null | undefined, tableName: string) {
  return `tbl:${schemaName ? `${schemaName}.` : ''}${tableName}`.toUpperCase()
}

export function columnStableId(
  schemaName: string | null | undefined,
  tableName: string,
  columnName: string,
) {
  return `col:${schemaName ? `${schemaName}.` : ''}${tableName}.${columnName}`.toUpperCase()
}

export function reportStableId(reportName: string) {
  return `rpt:${reportName}`.toUpperCase()
}

export function statementStableId(statementId: number) {
  return `stmt:${statementId}`
}

export function fullTableName(schemaName: string | null | undefined, tableName: string | null | undefined) {
  if (!tableName) return null
  return schemaName ? `${schemaName}.${tableName}` : tableName
}

