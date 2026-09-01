export type DwhConfidence = 'KESIN' | 'TAHMIN'

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

export type DwhReport = {
  id: string
  reportId: number
  reportName: string
  fileName?: string | null
  sourceCount: number
  columnCount: number
}

export type DwhTableRef = {
  id: string
  tableId: number
  schemaName?: string | null
  tableName: string
  layer?: string | null
}

export type DwhReportColumn = {
  columnName: string
  sourceTable?: string | null
  sourceColumn?: string | null
  transformationType?: string | null
  confidence?: DwhConfidence | null
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
