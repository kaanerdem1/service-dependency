export type DwhTable = {
  id: string
  tableId: number
  schemaName?: string | null
  tableName: string
  layer?: string | null
  columnCount: number
  sourceCount: number
  targetCount: number
}

export type DwhColumn = {
  id: string
  columnId: number
  tableId: number
  columnName: string
  ordinal?: number | null
  dataType?: string | null
}

export type DwhTableRef = {
  id: string
  tableId: number
  schemaName?: string | null
  tableName: string
  layer?: string | null
}

export type DwhReport = {
  id: string
  reportId: number
  reportName: string
  fileName?: string | null
  sourceCount: number
  columnCount: number
}

export type DwhReportColumn = {
  columnName: string
  sourceTable?: string | null
  sourceColumn?: string | null
  transformationType?: string | null
  confidence?: 'KESIN' | 'TAHMIN' | null
}

export type DwhColumnLineageSource = {
  id: string
  sourceColumnId?: number | null
  sourceTableId?: number | null
  sourceTableName?: string | null
  sourceColumnName?: string | null
  transformationType?: string | null
  confidence?: 'KESIN' | 'TAHMIN' | null
  statementId?: number | null
  packageName?: string | null
  procedureName?: string | null
}

export type DwhColumnLineageTarget = {
  id: string
  targetColumnId?: number | null
  targetColumnName: string
  ordinal?: number | null
  sources: DwhColumnLineageSource[]
}

export type DwhColumnLineageResponse = {
  entityKind: 'table' | 'report'
  table?: DwhTable
  report?: DwhReport
  targets: DwhColumnLineageTarget[]
  totalColumns: number
}

export type DwhColumnAncestryStep = {
  id: string
  level: number
  sourceColumnId: number
  sourceTableId: number
  sourceTableName: string
  sourceColumnName: string
  downstreamColumnId: number
  downstreamTableName: string
  downstreamColumnName: string
  transformationType?: string | null
  confidence?: 'KESIN' | 'TAHMIN' | null
  pathText: string
  original: boolean
}

export type DwhColumnAncestryResponse = {
  columnId: number
  columnName: string
  tableName: string
  steps: DwhColumnAncestryStep[]
}

export type DwhSqlStatement = {
  id: string
  statementId: number
  packageName?: string | null
  procedureName?: string | null
  dmlType: string
  lineNo?: number | null
  sqlText?: string | null
  simplifiedSql?: string | null
  targetTable?: string | null
  role?: 'writer' | 'reader'
  relatedTable?: string | null
  sources: string[]
}

export type DwhTableColumnsResponse = {
  table: DwhTable
  columns: DwhColumn[]
}

export type DwhTableStatementsResponse = {
  table: DwhTable
  statements: DwhSqlStatement[]
}

export type DwhReportDetail = DwhReport & {
  sqlText?: string | null
  simplifiedSql?: string | null
  sourceTables: DwhTableRef[]
  columns: DwhReportColumn[]
}

export type DwhTreeConnection =
  | {
      type: 'statement'
      targetTableId: number
      sourceTableId: number
      statementIds: number[]
    }
  | {
      type: 'reportSql'
      reportId: number
      sourceTableId: number
    }

export type DwhTreeNodeKind = 'table' | 'report' | 'subquery' | 'empty'

export type DwhTreeNode = {
  kind: DwhTreeNodeKind
  label: string
  tableId?: number
  reportId?: number
  subqueryId?: number
  schemaName?: string | null
  tableName?: string
  layer?: string | null
  sourceCount?: number
  subqueryType?: string | null
  alias?: string | null
  hasChildren: boolean
  connection?: DwhTreeConnection
}

export type DwhTreeChildrenResponse = {
  children: DwhTreeNode[]
}

export type DwhLineageEntityKind = 'table' | 'report' | 'subquery'

export type DwhLineageNodeKind = DwhLineageEntityKind | 'reference' | 'cycle'

export type DwhLineageNode = {
  id: string
  kind: DwhLineageNodeKind
  entityKind: DwhLineageEntityKind
  entityKey: string
  label: string
  subtitle?: string | null
  tableId?: number
  reportId?: number
  subqueryId?: number
  layer?: string | null
  depth: number
}

export type DwhLineageEdgeKind = 'statement' | 'reportSql' | 'subquery'

export type DwhLineageEdge = {
  id: string
  kind: DwhLineageEdgeKind
  source: string
  target: string
  label?: string
  statementIds?: number[]
}

export type DwhLineageGraph = {
  rootId: string
  rootKind: 'table' | 'report'
  nodes: DwhLineageNode[]
  edges: DwhLineageEdge[]
  truncated: boolean
  maxDepth: number
}

export type DwhImpactTable = {
  id: string
  tableId: number
  level: number
  schemaName?: string | null
  tableName: string
  statements: DwhImpactStatement[]
}

export type DwhImpactStatement = {
  id: string
  statementId: number
  sourceTableId: number
  sourceTableName: string
  packageName?: string | null
  procedureName?: string | null
  dmlType?: string | null
  lineNo?: number | null
  sqlText?: string | null
  simplifiedSql?: string | null
}

export type DwhImpactReport = {
  id: string
  reportName: string
  viaTableName: string
}

export type DwhTableImpact = {
  tableName: string
  schemaName?: string | null
  affectedTables: DwhImpactTable[]
  affectedReports: DwhImpactReport[]
}

export type DwhMapNodeSummary = {
  entityKind: 'table' | 'report'
  tableId?: number
  reportId?: number
  label: string
  schemaName?: string | null
  tableName?: string
  reportName?: string
  layer?: string | null
  sourceTables: {
    direct: number
    indirect: number
    total: number
  }
  targetTables: {
    direct: number
    indirect: number
    total: number
  }
  affectedReports: {
    direct: number
    indirect: number
    total: number
  }
  maxSourceDepth: number
  maxTargetDepth: number
}
