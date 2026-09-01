import type {
  DwhReport,
  DwhReportDetail,
  DwhLineageGraph,
  DwhMapNodeSummary,
  DwhTableImpact,
  DwhSqlStatement,
  DwhTable,
  DwhTableColumnsResponse,
  DwhTableStatementsResponse,
  DwhTreeChildrenResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/dwh${path}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

function queryPath(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const q = search.toString()
  return q ? `${path}?${q}` : path
}

export function listDwhTables(q = '', limit = 100) {
  return request<DwhTable[]>(queryPath('/tables', { q, limit }))
}

export function getDwhTable(tableId: number) {
  return request<DwhTable>(`/tables/${tableId}`)
}

export function getDwhTableColumns(tableId: number) {
  return request<DwhTableColumnsResponse>(`/tables/${tableId}/columns`)
}

export function getDwhTableStatements(tableId: number) {
  return request<DwhTableStatementsResponse>(`/tables/${tableId}/statements`)
}

export function getDwhTableTreeChildren(tableId: number, simple = false) {
  return request<DwhTreeChildrenResponse>(
    `/tables/${tableId}/tree-children${simple ? '?simple=1' : ''}`,
  )
}

export function getDwhTableLineageGraph(tableId: number, depth = 3, simple = false) {
  return request<DwhLineageGraph>(
    queryPath(`/tables/${tableId}/lineage-graph`, { depth, simple: simple ? 1 : undefined }),
  )
}

export function getDwhTableImpact(tableId: number) {
  return request<DwhTableImpact>(`/tables/${tableId}/impact`)
}

export function getDwhTableMapSummary(tableId: number) {
  return request<DwhMapNodeSummary>(`/tables/${tableId}/map-summary`)
}

export function listDwhReports(q = '', limit = 100) {
  return request<DwhReport[]>(queryPath('/reports', { q, limit }))
}

export function getDwhReport(reportId: number) {
  return request<DwhReportDetail>(`/reports/${reportId}`)
}

export function getDwhReportTreeChildren(reportId: number) {
  return request<DwhTreeChildrenResponse>(`/reports/${reportId}/tree-children`)
}

export function getDwhReportLineageGraph(reportId: number, depth = 3, simple = false) {
  return request<DwhLineageGraph>(
    queryPath(`/reports/${reportId}/lineage-graph`, { depth, simple: simple ? 1 : undefined }),
  )
}

export function getDwhReportMapSummary(reportId: number) {
  return request<DwhMapNodeSummary>(`/reports/${reportId}/map-summary`)
}

export function getDwhSubqueryChildren(subqueryId: number) {
  return request<DwhTreeChildrenResponse>(`/subqueries/${subqueryId}/children`)
}

export function getDwhStatement(statementId: number) {
  return request<DwhSqlStatement>(`/statements/${statementId}`)
}
