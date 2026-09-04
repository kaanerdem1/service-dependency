import { Router } from 'express'
import { DWH_SCHEMA, query } from './db.js'
import {
  getColumnAncestry,
  getReportColumnLineage,
  getTableColumnLineage,
} from './columnLineageService.js'
import { buildReportLineageGraph, buildTableLineageGraph } from './graphService.js'
import { getTableImpact } from './impactService.js'
import { getReportMapSummary, getTableMapSummary } from './mapSummaryService.js'
import { getReport, listReports } from './reportService.js'
import { getStatement } from './sqlService.js'
import { getTable, listColumns, listStatementsForTable, listTables } from './tableService.js'
import {
  listReportTreeChildren,
  listSubqueryTreeChildren,
  listTableTreeChildren,
} from './treeService.js'

export const dwhRouter = Router()

function parseId(raw: string | undefined) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

function parseDepth(raw: unknown) {
  const depth = Number(raw ?? 25)
  return Number.isInteger(depth) ? Math.min(Math.max(depth, 1), 25) : 25
}

dwhRouter.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1')
    res.json({ ok: true, schema: DWH_SCHEMA })
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables', async (req, res) => {
  try {
    res.json(await listTables(String(req.query.q ?? ''), Number(req.query.limit ?? 100)))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const table = await getTable(tableId)
    if (!table) return res.status(404).json({ error: 'not_found' })
    res.json(table)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/columns', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const table = await getTable(tableId)
    if (!table) return res.status(404).json({ error: 'not_found' })
    res.json({ table, columns: await listColumns(tableId) })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/column-lineage', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const lineage = await getTableColumnLineage(tableId)
    if (!lineage) return res.status(404).json({ error: 'not_found' })
    res.json(lineage)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/statements', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const table = await getTable(tableId)
    if (!table) return res.status(404).json({ error: 'not_found' })
    res.json({ table, statements: await listStatementsForTable(tableId) })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/columns/:columnId/ancestry', async (req, res) => {
  const columnId = parseId(req.params.columnId)
  if (!columnId) return res.status(400).json({ error: 'invalid_column_id' })
  try {
    const ancestry = await getColumnAncestry(columnId)
    if (!ancestry) return res.status(404).json({ error: 'not_found' })
    res.json(ancestry)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/tree-children', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const table = await getTable(tableId)
    if (!table) return res.status(404).json({ error: 'not_found' })
    res.json(await listTableTreeChildren(tableId, req.query.simple === '1'))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/lineage-graph', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const graph = await buildTableLineageGraph(tableId, {
      maxDepth: parseDepth(req.query.depth),
      simple: req.query.simple === '1',
    })
    if (!graph) return res.status(404).json({ error: 'not_found' })
    res.json(graph)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/impact', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const impact = await getTableImpact(tableId)
    if (!impact) return res.status(404).json({ error: 'not_found' })
    res.json(impact)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/tables/:tableId/map-summary', async (req, res) => {
  const tableId = parseId(req.params.tableId)
  if (!tableId) return res.status(400).json({ error: 'invalid_table_id' })
  try {
    const summary = await getTableMapSummary(tableId)
    if (!summary) return res.status(404).json({ error: 'not_found' })
    res.json(summary)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/subqueries/:subqueryId/children', async (req, res) => {
  const subqueryId = parseId(req.params.subqueryId)
  if (!subqueryId) return res.status(400).json({ error: 'invalid_subquery_id' })
  try {
    res.json(await listSubqueryTreeChildren(subqueryId))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/reports', async (req, res) => {
  try {
    res.json(await listReports(String(req.query.q ?? ''), Number(req.query.limit ?? 100)))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/reports/:reportId', async (req, res) => {
  const reportId = parseId(req.params.reportId)
  if (!reportId) return res.status(400).json({ error: 'invalid_report_id' })
  try {
    const report = await getReport(reportId)
    if (!report) return res.status(404).json({ error: 'not_found' })
    res.json(report)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/reports/:reportId/column-lineage', async (req, res) => {
  const reportId = parseId(req.params.reportId)
  if (!reportId) return res.status(400).json({ error: 'invalid_report_id' })
  try {
    const lineage = await getReportColumnLineage(reportId)
    if (!lineage) return res.status(404).json({ error: 'not_found' })
    res.json(lineage)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/reports/:reportId/tree-children', async (req, res) => {
  const reportId = parseId(req.params.reportId)
  if (!reportId) return res.status(400).json({ error: 'invalid_report_id' })
  try {
    const report = await getReport(reportId)
    if (!report) return res.status(404).json({ error: 'not_found' })
    res.json(await listReportTreeChildren(reportId))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/reports/:reportId/lineage-graph', async (req, res) => {
  const reportId = parseId(req.params.reportId)
  if (!reportId) return res.status(400).json({ error: 'invalid_report_id' })
  try {
    const graph = await buildReportLineageGraph(reportId, {
      maxDepth: parseDepth(req.query.depth),
      simple: req.query.simple === '1',
    })
    if (!graph) return res.status(404).json({ error: 'not_found' })
    res.json(graph)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/reports/:reportId/map-summary', async (req, res) => {
  const reportId = parseId(req.params.reportId)
  if (!reportId) return res.status(400).json({ error: 'invalid_report_id' })
  try {
    const summary = await getReportMapSummary(reportId)
    if (!summary) return res.status(404).json({ error: 'not_found' })
    res.json(summary)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})

dwhRouter.get('/statements/:statementId', async (req, res) => {
  const statementId = parseId(req.params.statementId)
  if (!statementId) return res.status(400).json({ error: 'invalid_statement_id' })
  try {
    const statement = await getStatement(statementId)
    if (!statement) return res.status(404).json({ error: 'not_found' })
    res.json(statement)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'db_error' })
  }
})
