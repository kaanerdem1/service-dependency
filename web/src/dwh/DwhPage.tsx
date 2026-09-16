import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { MapStage } from '../components/MapStage'
import { DwhSearchHitsPortal } from './DwhSearchHitsPortal'
import { MotionListItem } from '../motion/MotionList'
import { MotionModalPanel } from '../motion/MotionModal'
import { StageTabPanels } from '../motion/StageTabPanels'
import { StageTabs, type StageTabDef } from '../motion/StageTabs'
import {
  getDwhReport,
  getDwhReportColumnLineage,
  getDwhReportLineageGraph,
  getDwhTable,
  getDwhTableColumnLineage,
  getDwhTableColumns,
  getDwhTableImpact,
  getDwhTableLineageGraph,
  getDwhTableStatements,
  listDwhReports,
  listDwhTables,
} from './api'
import { DwhColumnLineagePanel } from './DwhColumnLineagePanel'
import { DwhLineageMap } from './DwhLineageMap'
import { DwhLineageTree } from './DwhLineageTree'
import { DwhFavoritesPanel } from './DwhFavoritesPanel'
import { useDwhFavorites } from './useDwhFavorites'
import { DwhSqlCode } from './DwhSqlCode'
import { StarIcon } from '../components/FavoriteStarButton'
import { DwhKindIconBadge } from './DwhKindIconBadge'
import { type AppSurface } from '../components/SurfaceSwitch'
import type {
  DwhColumn,
  DwhColumnLineageResponse,
  DwhImpactTable,
  DwhLineageGraph,
  DwhReport,
  DwhReportDetail,
  DwhSqlStatement,
  DwhTable,
  DwhTableImpact,
} from './types'
import './DwhPage.css'

type DwhTab = 'tables' | 'reports'
type DwhStageTab = 'map' | 'lineage' | 'query' | 'columns' | 'impact'
type DetailKind = 'table' | 'report'
type DwhVisitEntry = {
  kind: DetailKind
  id: number
  name: string
}

const DWH_STAGE_TAB_ORDER: DwhStageTab[] = ['map', 'lineage', 'query', 'columns', 'impact']

const DWH_STAGE_TABS: StageTabDef<DwhStageTab>[] = [
  {
    id: 'map',
    label: 'Harita',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5.8 7.2 10.2 4.8M5.8 8.8l4.4 2.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'lineage',
    label: 'Lineage',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 4.5h4M3 8h6M3 11.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M9.5 4.5h3M10.5 8h2M9.5 11.5h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M7.5 4.5h1.4c.9 0 1.6.7 1.6 1.6V8M9 11.5h-.4c-.9 0-1.6-.7-1.6-1.6V8" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'query',
    label: 'Sorgu',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 3.5h10M3 6.5h7M3 9.5h10M3 12.5h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'columns',
    label: 'Kolonlar',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M6 2.8v10.4M10 2.8v10.4M2.8 6h10.4M2.8 10h10.4" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    id: 'impact',
    label: 'Etki',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h7.5M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 4h2.5M3 12h2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
]

function DwhStageVisitPath({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: DwhVisitEntry[]
  currentIndex: number
  onSelect: (index: number) => void
}) {
  if (steps.length === 0) return null

  return (
    <nav className="stage-visit-path dwh-stage-visit-path" aria-label="Ziyaret yolu">
      <span className="stage-visit-path-label">Ziyaret yolu</span>
      <ol className="stage-visit-path-list">
        {steps.map((step, index) => {
          const current = index === currentIndex
          return (
            <li key={`${step.kind}-${step.id}-${index}`} className="stage-visit-path-item">
              {index > 0 ? (
                <span className="stage-visit-path-sep" aria-hidden>
                  /
                </span>
              ) : null}
              <button
                type="button"
                className={`stage-visit-path-btn${current ? ' is-current' : ''}`}
                title={step.name}
                aria-current={current ? 'page' : undefined}
                onClick={() => onSelect(index)}
              >
                {step.name}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function fullTableName(table: Pick<DwhTable, 'schemaName' | 'tableName'>) {
  return table.schemaName ? `${table.schemaName}.${table.tableName}` : table.tableName
}

function dwhVisitKey(entry: Pick<DwhVisitEntry, 'kind' | 'id'>) {
  return `${entry.kind}:${entry.id}`
}

function sameDwhVisit(a: DwhVisitEntry | undefined, b: DwhVisitEntry) {
  return Boolean(a && a.kind === b.kind && a.id === b.id)
}

function compactSql(sql: string | null | undefined) {
  if (!sql) return 'SQL metni yok'
  return sql.replace(/\s+/g, ' ').trim()
}

function procedureLabel(statement: DwhSqlStatement) {
  const pkg = statement.packageName?.trim()
  const proc = statement.procedureName?.trim()
  if (pkg && proc) return `${pkg}.${proc}`
  return proc || pkg || 'Prosedür bilgisi yok'
}

function relationCellLabel(value: string) {
  const trimmed = value.trim()
  const separator = trimmed.lastIndexOf('.')
  return separator >= 0 ? trimmed.slice(separator + 1) : trimmed
}

function impactProcedureLabel(statement: DwhTableImpact['affectedTables'][number]['statements'][number]) {
  const pkg = statement.packageName?.trim()
  const proc = statement.procedureName?.trim()
  if (pkg && proc) return `${pkg}.${proc}`
  return proc || pkg || 'Prosedür bilgisi yok'
}

function dmlClass(dmlType: string | null | undefined) {
  const normalized = dmlType?.toLowerCase() ?? ''
  if (normalized.includes('insert')) return 'is-insert'
  if (normalized.includes('update')) return 'is-update'
  if (normalized.includes('delete')) return 'is-delete'
  if (normalized.includes('merge')) return 'is-merge'
  if (normalized.includes('truncate')) return 'is-truncate'
  return 'is-other'
}

function DmlBadge({ dmlType }: { dmlType?: string | null }) {
  return <span className={`dwh-dml-badge ${dmlClass(dmlType)}`}>{dmlType || 'SQL'}</span>
}

function DwhSidebarPinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="sidebar-pin-icon">
      <path
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03-1 1.03 1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={pinned ? 0 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ColumnsTable({ columns }: { columns: DwhColumn[] }) {
  if (!columns.length) return <p className="dwh-empty-line">Kolon metadata kaydı yok.</p>
  return (
    <div className="dwh-column-list">
      {columns.map((column) => (
        <div key={column.columnId} className="dwh-column-row">
          <span className="dwh-column-ordinal">{column.ordinal ?? ''}</span>
          <span className="dwh-column-name" title={column.columnName}>
            {column.columnName}
          </span>
          <span className="dwh-column-type">{column.dataType || '-'}</span>
        </div>
      ))}
    </div>
  )
}

function StatementTable({
  title,
  empty,
  statements,
  relationLabel,
  onOpen,
}: {
  title: string
  empty: string
  statements: DwhSqlStatement[]
  relationLabel: (statement: DwhSqlStatement) => string
  onOpen: (statement: DwhSqlStatement) => void
}) {
  return (
    <section className="dwh-query-table-card">
      <div className="dwh-query-table-head">
        <h4>{title}</h4>
        <span>{statements.length} sorgu</span>
      </div>
      {statements.length ? (
        <div className="dwh-query-table-wrap">
          <table className="dwh-query-table">
            <thead>
              <tr>
                <th>Prosedür</th>
                <th>İlişki</th>
                <th>DML</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => {
                const relation = relationLabel(statement)
                return (
                  <tr
                    key={`${statement.role ?? 'statement'}-${statement.id}`}
                    className="dwh-query-row"
                    role="button"
                    tabIndex={0}
                    title={`${procedureLabel(statement)} · ${relation}`}
                    onClick={() => onOpen(statement)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onOpen(statement)
                    }}
                  >
                    <td>
                      <span className="dwh-query-procedure-link">{procedureLabel(statement)}</span>
                    </td>
                    <td title={relation}>{relationCellLabel(relation)}</td>
                    <td><DmlBadge dmlType={statement.dmlType} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dwh-query-table-empty">{empty}</p>
      )}
    </section>
  )
}

function SqlDetailPanel({
  statement,
  focusTable,
  sourceTable,
}: {
  statement?: DwhSqlStatement
  focusTable?: string
  sourceTable?: string
}) {
  const [view, setView] = useState<'summary' | 'full'>('full')

  useEffect(() => {
    setView(statement?.simplifiedSql ? 'summary' : 'full')
  }, [statement?.statementId, statement?.simplifiedSql])

  if (!statement) {
    return <div className="dwh-query-empty">İncelemek için bir sorgu seçin.</div>
  }

  const hasSummary = Boolean(statement.simplifiedSql)
  const sqlText = hasSummary && view === 'summary' ? statement.simplifiedSql : statement.sqlText
  const tableLabel = focusTable ? `${focusTable} tablosu` : 'Bu tablo'
  const roleLabel = statement.role === 'reader' ? `${tableLabel} kaynak olarak kullanılıyor` : `${tableLabel} dolduruluyor`
  const targetTable = statement.role === 'reader' ? statement.relatedTable ?? statement.targetTable : statement.targetTable ?? focusTable

  return (
    <article className="dwh-sql-detail">
      <div className="dwh-sql-detail-head">
        <div>
          <span className="dwh-eyebrow">Prosedür</span>
          <h3>{procedureLabel(statement)}</h3>
          <p>{roleLabel}</p>
        </div>
        <DmlBadge dmlType={statement.dmlType} />
      </div>

      <div className="dwh-sql-meta-grid">
        <span>
          <strong>Satır</strong>
          {statement.lineNo ?? 'bilgi yok'}
        </span>
        <span>
          <strong>Hedef</strong>
          {targetTable ?? '-'}
        </span>
        <span>
          <strong>Kaynak</strong>
          {sourceTable ?? focusTable ?? '-'}
        </span>
      </div>

      {statement.sources.length ? (
        <details className="dwh-sql-source-details" open={statement.sources.length <= 5}>
          <summary>
            {statement.sources.length === 1 ? 'Prosedürün kullandığı kaynak tablo' : 'Prosedürün kullandığı kaynak tablolar'} ({statement.sources.length})
          </summary>
          <div className="dwh-sql-source-list">
            {statement.sources.map((source) => (
              <span key={source}>{source}</span>
            ))}
          </div>
        </details>
      ) : null}

      <div className="dwh-sql-view-head">
        <h4>SQL</h4>
        {hasSummary ? (
          <div className="dwh-sql-view-toggle" role="group" aria-label="SQL görünümü">
            <button
              type="button"
              className={view === 'summary' ? 'on' : undefined}
              onClick={() => setView('summary')}
            >
              Sade
            </button>
            <button
              type="button"
              className={view === 'full' ? 'on' : undefined}
              onClick={() => setView('full')}
            >
              Tam SQL
            </button>
          </div>
        ) : null}
      </div>
      <DwhSqlCode sql={sqlText || compactSql(sqlText)} highlightTable={focusTable ?? statement.targetTable} />
    </article>
  )
}

function DwhSqlModalBackdrop({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const backdrop = (
    <motion.div
      className="modal-backdrop dwh-sql-modal-backdrop"
      role="presentation"
      data-motion="dwh-sql-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      {children}
    </motion.div>
  )

  if (typeof document === 'undefined') return backdrop
  return createPortal(backdrop, document.body)
}

function StatementDetailModal({
  statement,
  focusTable,
  sourceTable,
  onClose,
}: {
  statement?: DwhSqlStatement
  focusTable?: string
  sourceTable?: string
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {statement ? (
        <DwhSqlModalBackdrop onClose={onClose}>
          <MotionModalPanel
            className="modal wide dwh-sql-modal"
            labelledBy="dwh-sql-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h2 id="dwh-sql-modal-title">Sorgu detayı</h2>
              <button type="button" className="btn ghost" onClick={onClose}>
                Kapat
              </button>
            </header>
            <SqlDetailPanel statement={statement} focusTable={focusTable} sourceTable={sourceTable} />
          </MotionModalPanel>
        </DwhSqlModalBackdrop>
      ) : null}
    </AnimatePresence>
  )
}

function ReportSqlDetailPanel({ report }: { report: DwhReportDetail }) {
  const [view, setView] = useState<'summary' | 'full'>('full')
  const hasSummary = Boolean(report.simplifiedSql)
  const sqlText = hasSummary && view === 'summary' ? report.simplifiedSql : report.sqlText

  useEffect(() => {
    setView(hasSummary ? 'summary' : 'full')
  }, [hasSummary, report.reportId, report.simplifiedSql])

  return (
    <article className="dwh-sql-detail">
      <div className="dwh-sql-detail-head">
        <div>
          <span className="dwh-eyebrow">Rapor</span>
          <h3>Rapor SQL</h3>
          <p>{report.reportName}</p>
        </div>
        <DmlBadge dmlType="SELECT" />
      </div>

      <div className="dwh-sql-meta-grid">
        <span>
          <strong>Dosya</strong>
          {report.fileName ?? 'bilgi yok'}
        </span>
        <span>
          <strong>Kaynak</strong>
          {report.sourceTables.length}
        </span>
        <span>
          <strong>Kolon</strong>
          {report.columns.length}
        </span>
      </div>

      <div className="dwh-sql-view-head">
        <h4>SQL</h4>
        {hasSummary ? (
          <div className="dwh-sql-view-toggle" role="group" aria-label="SQL görünümü">
            <button
              type="button"
              className={view === 'summary' ? 'on' : undefined}
              onClick={() => setView('summary')}
            >
              Sade
            </button>
            <button
              type="button"
              className={view === 'full' ? 'on' : undefined}
              onClick={() => setView('full')}
            >
              Tam SQL
            </button>
          </div>
        ) : null}
      </div>
      <DwhSqlCode sql={sqlText || 'SQL metni yok'} />
    </article>
  )
}

function ReportSqlDetailModal({
  report,
  open,
  onClose,
}: {
  report?: DwhReportDetail
  open: boolean
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && report ? (
        <DwhSqlModalBackdrop onClose={onClose}>
          <MotionModalPanel
            className="modal wide dwh-sql-modal"
            labelledBy="dwh-report-sql-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h2 id="dwh-report-sql-modal-title">Rapor sorgusu</h2>
              <button type="button" className="btn ghost" onClick={onClose}>
                Kapat
              </button>
            </header>
            <ReportSqlDetailPanel report={report} />
          </MotionModalPanel>
        </DwhSqlModalBackdrop>
      ) : null}
    </AnimatePresence>
  )
}

function TableQueryPanel({
  table,
  statements,
  loading,
}: {
  table?: DwhTable
  statements: DwhSqlStatement[]
  loading: boolean
}) {
  const [activeStatement, setActiveStatement] = useState<DwhSqlStatement>()

  useEffect(() => {
    setActiveStatement(undefined)
  }, [table?.tableId, statements])

  if (loading) return <div className="dwh-detail-empty">SQL kullanımları yükleniyor...</div>
  if (!table) return <div className="dwh-detail-empty">Bir tablo seçin.</div>
  if (!statements.length) return <div className="dwh-detail-empty">Bu tablo için kayıtlı bir SQL bulunamadı.</div>

  const writers = statements.filter((statement) => statement.role === 'writer')
  const readers = statements.filter((statement) => statement.role === 'reader')
  const tableName = fullTableName(table)

  return (
    <>
      <div className="dwh-tab-content dwh-query-layout">
        <StatementTable
          title={`${tableName} tablosunu kaynak olarak kullanan sorgular`}
          empty={`${tableName} tablosunu kaynak olarak kullanan sorgu yok.`}
          statements={readers}
          relationLabel={(statement) => statement.relatedTable ?? statement.targetTable ?? 'Hedef tablo yok'}
          onOpen={setActiveStatement}
        />
        <StatementTable
          title={`${tableName} tablosunu dolduran sorgular`}
          empty={`${tableName} tablosunu dolduran sorgu yok.`}
          statements={writers}
          relationLabel={(statement) => statement.targetTable ?? tableName}
          onOpen={setActiveStatement}
        />
      </div>
      <StatementDetailModal
        statement={activeStatement}
        focusTable={tableName}
        onClose={() => setActiveStatement(undefined)}
      />
    </>
  )
}

function ReportQueryPanel({ report, loading }: { report?: DwhReportDetail; loading: boolean }) {
  const [sqlOpen, setSqlOpen] = useState(false)

  useEffect(() => {
    setSqlOpen(false)
  }, [report?.reportId])

  if (loading) return <div className="dwh-detail-empty">Rapor sorgusu yükleniyor...</div>
  if (!report) return <div className="dwh-detail-empty">Bir rapor seçin.</div>
  return (
    <>
      <div className="dwh-tab-content dwh-query-layout dwh-report-query-layout">
        <section className="dwh-query-table-card dwh-report-source-table-card">
          <div className="dwh-query-table-head">
            <h4>Rapor kaynakları</h4>
            <span>{report.sourceTables.length} tablo</span>
          </div>
          {report.sourceTables.length ? (
            <div className="dwh-query-table-wrap">
              <table className="dwh-query-table">
                <thead>
                  <tr>
                    <th>Tablo</th>
                    <th>Katman</th>
                    <th>Tür</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sourceTables.map((table) => (
                    <tr key={table.id}>
                      <td title={fullTableName(table)}>{fullTableName(table)}</td>
                      <td>{table.layer ?? '-'}</td>
                      <td><span className="hit-tag hit-tag-table">Tablo</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="dwh-query-table-empty">Kaynak tablo kaydı yok.</p>
          )}
        </section>
        <section className="dwh-query-table-card dwh-report-source-table-card">
          <div className="dwh-query-table-head">
            <h4>Rapor bilgisi</h4>
            <span>{report.columns.length} kolon</span>
          </div>
          <div className="dwh-query-report-summary">
            <span>
              <strong>Rapor</strong>
              {report.reportName}
            </span>
            <button type="button" className="dwh-report-sql-open-btn" onClick={() => setSqlOpen(true)}>
              Rapor sorgusunu aç
            </button>
          </div>
        </section>
      </div>
      <ReportSqlDetailModal
        report={report}
        open={sqlOpen}
        onClose={() => setSqlOpen(false)}
      />
    </>
  )
}

function ReportColumnsTable({ report, loading }: { report?: DwhReportDetail; loading: boolean }) {
  if (loading) return <div className="dwh-detail-empty">Rapor kolonları yükleniyor...</div>
  if (!report) return <div className="dwh-detail-empty">Bir rapor seçin.</div>
  if (!report.columns.length) return <p className="dwh-empty-line">Rapor kolon lineage kaydı yok.</p>
  return (
    <div className="dwh-column-list">
      {report.columns.map((column, index) => (
        <div
          key={`${column.columnName}-${column.sourceTable ?? 'src'}-${column.sourceColumn ?? index}-${index}`}
          className="dwh-column-row"
        >
          <span className="dwh-column-ordinal">{index + 1}</span>
          <span className="dwh-column-name" title={column.columnName}>
            {column.columnName}
          </span>
          <span className="dwh-report-column-placeholder" aria-hidden />
        </div>
      ))}
    </div>
  )
}

function ImpactPanel({
  detailKind,
  table,
  impact,
  loading,
}: {
  detailKind: DetailKind
  table?: DwhTable
  impact?: DwhTableImpact
  loading: boolean
}) {
  const [activeImpactTable, setActiveImpactTable] = useState<DwhImpactTable>()
  const [activeImpactStatement, setActiveImpactStatement] = useState<DwhSqlStatement>()

  useEffect(() => {
    setActiveImpactTable(undefined)
    setActiveImpactStatement(undefined)
  }, [detailKind, table?.tableId, impact])

  useEffect(() => {
    if (!activeImpactTable) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveImpactTable(undefined)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeImpactTable])

  if (detailKind === 'report') {
    return (
      <div className="dwh-tab-content">
        <div className="dwh-detail-empty">
          Raporlar lineage zincirinin son noktasıdır. Etki analizi için ağaçtan bir tablo seçin.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="dwh-tab-content">
        <div className="dwh-detail-empty">Etki listesi yükleniyor...</div>
      </div>
    )
  }

  if (!table) {
    return (
      <div className="dwh-tab-content">
        <div className="dwh-detail-empty">Etki analizi için bir tablo seçin.</div>
      </div>
    )
  }

  const affectedTables = impact?.affectedTables ?? []
  const affectedReports = impact?.affectedReports ?? []
  const levelGroups = affectedTables.reduce<Map<number, typeof affectedTables>>((groups, item) => {
    const existing = groups.get(item.level) ?? []
    existing.push(item)
    groups.set(item.level, existing)
    return groups
  }, new Map())
  const levels = Array.from(levelGroups.keys()).sort((a, b) => a - b)

  const activeTableName = activeImpactTable ? fullTableName(activeImpactTable) : ''

  const openImpactStatement = (statement: DwhImpactTable['statements'][number]) => {
    if (!activeImpactTable) return
    setActiveImpactStatement({
      id: statement.id,
      statementId: statement.statementId,
      packageName: statement.packageName,
      procedureName: statement.procedureName,
      dmlType: statement.dmlType ?? 'SQL',
      lineNo: statement.lineNo,
      sqlText: statement.sqlText,
      simplifiedSql: statement.simplifiedSql,
      targetTable: activeTableName,
      role: 'writer',
      relatedTable: statement.sourceTableName,
      sources: statement.sourceTableName ? [statement.sourceTableName] : [],
    })
  }

  return (
    <div className="dwh-tab-content dwh-impact-content">
      <div className={`dwh-impact-workspace${activeImpactTable ? ' has-detail' : ''}`}>
        <aside className="dwh-impact-list-panel">
          <section className="dwh-impact-section">
            <div className="dwh-section-head">
              <div>
                <h3>Tablo Etkisi</h3>
                <p>{fullTableName(table)} değişirse aşağıdaki tablolar dolaylı olarak etkilenebilir.</p>
              </div>
            </div>

            {levels.length ? (
              <div className="dwh-impact-levels">
                {levels.map((level) => (
                  <section key={level} className="dwh-impact-level">
                    <h4>Seviye {level}</h4>
                    <div className="dwh-impact-table-list">
                      {(levelGroups.get(level) ?? []).map((affected) => {
                        const selected = activeImpactTable?.tableId === affected.tableId && activeImpactTable.level === affected.level
                        return (
                          <button
                            key={`${affected.id}-${affected.level}`}
                            type="button"
                            className={`dwh-impact-table-row${selected ? ' is-selected' : ''}`}
                            onClick={() => {
                              setActiveImpactStatement(undefined)
                              setActiveImpactTable(selected ? undefined : affected)
                            }}
                            title={fullTableName(affected)}
                          >
                            <span className="dwh-kind-badge is-dwh-table" aria-hidden>T</span>
                            <span className="dwh-impact-table-name">{fullTableName(affected)}</span>
                            <span className="dwh-impact-query-count">{affected.statements.length} sorgu</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="dwh-empty-line">Bu tabloyu kaynak olarak kullanan başka bir tablo bulunamadı.</p>
            )}
          </section>

          <section className="dwh-impact-section">
            <div className="dwh-section-head">
              <div>
                <h3>Etkilenen Raporlar</h3>
                <p>Seçili tablo veya ondan etkilenen tabloları kaynak alan raporlar.</p>
              </div>
            </div>

            {affectedReports.length ? (
              <div className="dwh-impact-report-list">
                {affectedReports.map((report) => (
                  <article key={report.id} className="dwh-impact-report">
                    <span className="dwh-kind-badge is-dwh-report" aria-hidden>R</span>
                    <span className="dwh-impact-report-main">
                      <strong title={report.reportName}>{report.reportName}</strong>
                      <small title={report.viaTableName}>{report.viaTableName} üzerinden</small>
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="dwh-empty-line">Bu etki zincirine bağlı rapor bulunamadı.</p>
            )}
          </section>
        </aside>

        {activeImpactTable ? (
          <article className="dwh-impact-detail-panel">
            <div className="dwh-impact-detail-head">
              <div>
                <span className="dwh-eyebrow">Prosedürler</span>
                <p className="dwh-impact-detail-title">
                  <strong>{activeTableName}</strong>
                  <span> tablosunu {fullTableName(table)} etki zincirinde değiştiren sorgular</span>
                </p>
              </div>
              <button
                type="button"
                className="dwh-impact-detail-close"
                onClick={() => {
                  setActiveImpactStatement(undefined)
                  setActiveImpactTable(undefined)
                }}
              >
                Kapat
              </button>
            </div>

            <div className="dwh-impact-statement-accordion">
              {activeImpactTable.statements.map((statement) => (
                <button
                  key={`${activeImpactTable.id}-${statement.id}`}
                  type="button"
                  className="dwh-impact-statement-detail"
                  onClick={() => openImpactStatement(statement)}
                >
                  <span className="dwh-impact-statement-summary">
                    <span>
                      <strong>{impactProcedureLabel(statement)}</strong>
                      <small>{statement.lineNo != null ? `Satır ${statement.lineNo}` : 'Satır bilgisi yok'}</small>
                    </span>
                    <DmlBadge dmlType={statement.dmlType} />
                  </span>
                  <span className="dwh-impact-statement-open">SQL göster</span>
                </button>
              ))}
            </div>
          </article>
        ) : null}
      </div>
      <StatementDetailModal
        statement={activeImpactStatement}
        focusTable={activeTableName}
        sourceTable={activeImpactStatement?.relatedTable ?? undefined}
        onClose={() => setActiveImpactStatement(undefined)}
      />
    </div>
  )
}

export function DwhPage({
  surface: _surface,
  onSurfaceChange: _onSurfaceChange,
}: {
  surface: AppSurface
  onSurfaceChange: (next: AppSurface) => void
}) {
  const [catalogTab, setCatalogTab] = useState<DwhTab>('tables')
  const [stageTab, setStageTab] = useState<DwhStageTab>('map')
  const [query, setQuery] = useState('')
  const [tables, setTables] = useState<DwhTable[]>([])
  const [reports, setReports] = useState<DwhReport[]>([])
  const [rootTableId, setRootTableId] = useState<number>()
  const [rootReportId, setRootReportId] = useState<number>()
  const [selectedTableId, setSelectedTableId] = useState<number>()
  const [selectedReportId, setSelectedReportId] = useState<number>()
  const [selectedTable, setSelectedTable] = useState<DwhTable>()
  const [columns, setColumns] = useState<DwhColumn[]>([])
  const [statements, setStatements] = useState<DwhSqlStatement[]>([])
  const [selectedReport, setSelectedReport] = useState<DwhReportDetail>()
  const [visitHistory, setVisitHistory] = useState<DwhVisitEntry[]>([])
  const [visitIndex, setVisitIndex] = useState(-1)
  const [impact, setImpact] = useState<DwhTableImpact>()
  const [detailKind, setDetailKind] = useState<DetailKind>('table')
  const [simpleTree, setSimpleTree] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [lineageGraph, setLineageGraph] = useState<DwhLineageGraph>()
  const [columnLineage, setColumnLineage] = useState<DwhColumnLineageResponse>()
  const [mapExpanded, setMapExpanded] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [loadingColumnLineage, setLoadingColumnLineage] = useState(false)
  const [error, setError] = useState<string>()
  const [sidebarPinned, setSidebarPinned] = useState(true)
  const [sidebarHover, setSidebarHover] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const sidebarWidthPreferredRef = useRef(320)
  const searchRef = useRef<HTMLLabelElement>(null)
  const sidebarExpanded = sidebarPinned || sidebarHover
  const pageStyle = {
    '--dwh-sidebar-panel-width': `${sidebarWidth}px`,
  } as CSSProperties

  useEffect(() => {
    const NARROW_MAX = 1100
    const rail = 76
    const minMapViewport = 340
    const clampSidebar = () => {
      const w = window.innerWidth
      if (w >= NARROW_MAX) {
        setSidebarWidth(sidebarWidthPreferredRef.current)
        return
      }
      const cap = Math.max(272, Math.min(460, w - rail - minMapViewport))
      setSidebarWidth((current) => (current > cap ? cap : current))
    }
    clampSidebar()
    window.addEventListener('resize', clampSidebar)
    return () => window.removeEventListener('resize', clampSidebar)
  }, [])

  const { store: dwhFavorites, setStore: setDwhFavorites } = useDwhFavorites()

  const entityNameByVisitKey = useMemo(() => {
    const names = new Map<string, string>()
    for (const table of tables) {
      names.set(dwhVisitKey({ kind: 'table', id: table.tableId }), fullTableName(table))
    }
    for (const report of reports) {
      names.set(dwhVisitKey({ kind: 'report', id: report.reportId }), report.reportName)
    }
    if (selectedTable) {
      names.set(dwhVisitKey({ kind: 'table', id: selectedTable.tableId }), fullTableName(selectedTable))
    }
    if (selectedReport) {
      names.set(dwhVisitKey({ kind: 'report', id: selectedReport.reportId }), selectedReport.reportName)
    }
    for (const node of lineageGraph?.nodes ?? []) {
      if (node.entityKind === 'table' && node.tableId) {
        names.set(dwhVisitKey({ kind: 'table', id: node.tableId }), node.label)
      }
      if (node.entityKind === 'report' && node.reportId) {
        names.set(dwhVisitKey({ kind: 'report', id: node.reportId }), node.label)
      }
    }
    return names
  }, [lineageGraph, reports, selectedReport, selectedTable, tables])

  const dwhVisitName = useCallback(
    (kind: DetailKind, id: number) =>
      entityNameByVisitKey.get(dwhVisitKey({ kind, id })) ??
      (kind === 'table' ? `Tablo ${id}` : `Rapor ${id}`),
    [entityNameByVisitKey],
  )

  const applyDwhVisit = useCallback(
    (entry: DwhVisitEntry, options?: { preserveStageTab?: boolean }) => {
      if (entry.kind === 'table') {
        setRootTableId(entry.id)
        setSelectedTableId(entry.id)
        setRootReportId(undefined)
        setSelectedReportId(undefined)
        setCatalogTab('tables')
        setDetailKind('table')
      } else {
        setRootReportId(entry.id)
        setSelectedReportId(entry.id)
        setRootTableId(undefined)
        setSelectedTableId(undefined)
        setCatalogTab('reports')
        setDetailKind('report')
      }
      if (!options?.preserveStageTab) setStageTab('map')
      setQuery('')
      setFavoritesOpen(false)
    }, [])

  const selectDwhVisit = useCallback(
    (entry: DwhVisitEntry, options?: { resetHistory?: boolean }) => {
      applyDwhVisit(entry)
      if (options?.resetHistory) {
        setVisitHistory([entry])
        setVisitIndex(0)
        return
      }
      setVisitHistory((current) => {
        const currentIndex = visitIndex >= 0 ? visitIndex : current.length - 1
        if (sameDwhVisit(current[currentIndex], entry)) {
          setVisitIndex(Math.max(0, currentIndex))
          return current
        }
        const next = [...current.slice(0, currentIndex + 1), entry]
        setVisitIndex(next.length - 1)
        return next
      })
    },
    [applyDwhVisit, visitIndex],
  )

  const selectDwhVisitIndex = useCallback(
    (index: number) => {
      const entry = visitHistory[index]
      if (!entry) return
      setVisitIndex(index)
      setMapExpanded(false)
      applyDwhVisit(entry, { preserveStageTab: true })
    },
    [applyDwhVisit, visitHistory],
  )

  const goDwhVisitBack = useCallback(() => {
    if (visitIndex <= 0) return
    const nextIndex = visitIndex - 1
    const entry = visitHistory[nextIndex]
    if (!entry) return
    setVisitIndex(nextIndex)
    setMapExpanded(false)
    applyDwhVisit(entry)
  }, [applyDwhVisit, visitHistory, visitIndex])

  const goDwhVisitForward = useCallback(() => {
    if (visitIndex < 0 || visitIndex >= visitHistory.length - 1) return
    const nextIndex = visitIndex + 1
    const entry = visitHistory[nextIndex]
    if (!entry) return
    setVisitIndex(nextIndex)
    setMapExpanded(false)
    applyDwhVisit(entry)
  }, [applyDwhVisit, visitHistory, visitIndex])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoadingList(true)
      const load = catalogTab === 'tables' ? listDwhTables(query) : listDwhReports(query)
      void load
        .then((rows) => {
          if (cancelled) return
          setError(undefined)
          if (catalogTab === 'tables') {
            const next = rows as DwhTable[]
            setTables(next)
          } else {
            const next = rows as DwhReport[]
            setReports(next)
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
        .finally(() => {
          if (!cancelled) setLoadingList(false)
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [catalogTab, query])

  useEffect(() => {
    if (!selectedTableId) {
      setSelectedTable(undefined)
      setColumns([])
      setStatements([])
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    void Promise.all([
      getDwhTable(selectedTableId),
      getDwhTableColumns(selectedTableId),
      getDwhTableStatements(selectedTableId),
    ])
      .then(([table, columnRes, statementRes]) => {
        if (cancelled) return
        setSelectedTable(table)
        setColumns(columnRes.columns)
        setStatements(statementRes.statements)
        setError(undefined)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTableId])

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(undefined)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    void getDwhReport(selectedReportId)
      .then((report) => {
        if (cancelled) return
        setSelectedReport(report)
        setError(undefined)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedReportId])

  useEffect(() => {
    const selectedId = detailKind === 'table' ? selectedTableId : selectedReportId
    if (!selectedId) {
      setLineageGraph(undefined)
      return
    }
    let cancelled = false
    setLoadingGraph(true)
    const load =
      detailKind === 'table'
        ? getDwhTableLineageGraph(selectedId, 25)
        : getDwhReportLineageGraph(selectedId, 25)
    void load
      .then((graph) => {
        if (cancelled) return
        setLineageGraph(graph)
        setError(undefined)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingGraph(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailKind, selectedTableId, selectedReportId])

  useEffect(() => {
    const selectedId = detailKind === 'table' ? selectedTableId : selectedReportId
    if (stageTab !== 'lineage' || !selectedId) {
      setColumnLineage(undefined)
      setLoadingColumnLineage(false)
      return
    }
    let cancelled = false
    setLoadingColumnLineage(true)
    const load =
      detailKind === 'table'
        ? getDwhTableColumnLineage(selectedId)
        : getDwhReportColumnLineage(selectedId)
    void load
      .then((response) => {
        if (cancelled) return
        setColumnLineage(response)
        setError(undefined)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingColumnLineage(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailKind, selectedTableId, selectedReportId, stageTab])

  useEffect(() => {
    if (detailKind !== 'table' || !selectedTableId) {
      setImpact(undefined)
      setLoadingImpact(false)
      return
    }
    let cancelled = false
    setLoadingImpact(true)
    void getDwhTableImpact(selectedTableId)
      .then((nextImpact) => {
        if (cancelled) return
        setImpact(nextImpact)
        setError(undefined)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingImpact(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailKind, selectedTableId])

  const visibleCount = catalogTab === 'tables' ? tables.length : reports.length
  const heading = useMemo(
    () => (catalogTab === 'tables' ? 'Tablo kataloğu' : 'Rapor kataloğu'),
    [catalogTab],
  )
  const treeRoot = useMemo(() => {
    const rootTable =
      tables.find((table) => table.tableId === rootTableId) ??
      (selectedTable?.tableId === rootTableId ? selectedTable : undefined)
    const rootReport =
      reports.find((report) => report.reportId === rootReportId) ??
      (selectedReport?.reportId === rootReportId ? selectedReport : undefined)
    if (catalogTab === 'tables' && rootTable) {
      return { kind: 'table' as const, table: rootTable }
    }
    if (catalogTab === 'reports' && rootReport) {
      return { kind: 'report' as const, report: rootReport }
    }
    return undefined
  }, [catalogTab, tables, reports, rootTableId, rootReportId, selectedTable, selectedReport])

  const stageHeading = useMemo(() => {
    if (detailKind === 'report' && selectedReport) return selectedReport.reportName
    if (detailKind === 'table' && selectedTable) return fullTableName(selectedTable)
    return heading
  }, [detailKind, heading, selectedReport, selectedTable])
  const visitSteps = useMemo(
    () =>
      visitIndex >= 0
        ? visitHistory.slice(0, visitIndex + 1).map((entry) => ({
            ...entry,
            name: entityNameByVisitKey.get(dwhVisitKey(entry)) ?? entry.name,
          }))
        : [],
    [entityNameByVisitKey, visitHistory, visitIndex],
  )
  const hasQuery = query.trim().length > 0
  const searchOpen = hasQuery

  const selectTableRoot = (table: DwhTable) => {
    selectDwhVisit(
      { kind: 'table', id: table.tableId, name: fullTableName(table) },
      { resetHistory: true },
    )
  }

  const selectReportRoot = (report: DwhReport) => {
    selectDwhVisit(
      { kind: 'report', id: report.reportId, name: report.reportName },
      { resetHistory: true },
    )
  }

  const toggleSidebarPinned = useCallback(() => {
    setSidebarPinned((pinned) => {
      const next = !pinned
      setSidebarHover(true)
      return next
    })
  }, [])

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = sidebarWidth
      let latestWidth = startWidth
      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(272, Math.min(460, startWidth + moveEvent.clientX - startX))
        latestWidth = nextWidth
        setSidebarWidth(nextWidth)
      }
      const handleUp = () => {
        sidebarWidthPreferredRef.current = latestWidth
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [sidebarWidth],
  )

  return (
    <main
      className={`main dwh-main${stageTab === 'map' ? ' main-map' : ''}${sidebarExpanded ? ' dwh-sidebar-open' : ' dwh-sidebar-closed'}${sidebarPinned ? ' dwh-sidebar-pinned' : ''}`}
      style={pageStyle}
    >
      <div className="stage-top dwh-stage-top">
        <div className="stage-head">
          <div className="main-heading-wrap">
            <span className="service-status-dot" aria-hidden />
            <h1 className="main-heading" title={stageHeading}>
              {stageHeading}
            </h1>
          </div>
        </div>
        <StageTabs<DwhStageTab>
          tab={stageTab}
          tabs={DWH_STAGE_TABS}
          ariaLabel="DWH detay görünümü"
          onSelect={(next) => {
            if (next !== 'map') setMapExpanded(false)
            setStageTab(next)
          }}
        />
        <DwhStageVisitPath
          steps={visitSteps}
          currentIndex={visitIndex}
          onSelect={selectDwhVisitIndex}
        />
      </div>

      {error ? <div className="dwh-error">{error}</div> : null}

      <div className="dwh-shell">
        <aside
          className={`dwh-lineage-sidebar dwh-tree-panel${sidebarExpanded ? ' is-expanded' : ''}${sidebarPinned ? ' is-pinned' : ''}`}
          data-expanded={sidebarExpanded ? 'true' : 'false'}
          data-pinned={sidebarPinned ? 'true' : 'false'}
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => {
            if (!sidebarPinned) setSidebarHover(false)
          }}
        >
          <div className="dwh-sidebar-rail" aria-hidden={sidebarExpanded}>
            <span className="dwh-sidebar-rail-label">DWH</span>
            <div className="dwh-sidebar-rail-kinds" aria-hidden>
              <DwhKindIconBadge kind="table" />
              <DwhKindIconBadge kind="report" />
              <DwhKindIconBadge kind="subquery" />
            </div>
            <span className="dwh-sidebar-rail-hint">Paneli Aç</span>
          </div>
          <div className={`dwh-sidebar-inner${favoritesOpen ? ' is-favorites' : ''}`}>
            <div className="dwh-sidebar-view dwh-sidebar-transition-view dwh-tree-view">
              <div className="dwh-sidebar-head">
                <h3>DWH Ağacı</h3>
                <div className="dwh-sidebar-head-actions">
                <button
                  type="button"
                  className={`dwh-sidebar-pin-btn${sidebarPinned ? ' is-pinned' : ''}`}
                  title={sidebarPinned ? 'Sabitlemeyi bırak' : 'Paneli sabitle'}
                  aria-label={sidebarPinned ? 'DWH paneli sabitli, sabitlemeyi bırak' : 'DWH panelini sabitle'}
                  aria-expanded={sidebarExpanded}
                  aria-pressed={sidebarPinned}
                  onClick={toggleSidebarPinned}
                >
                  <DwhSidebarPinIcon pinned={sidebarPinned} />
                </button>
                <button
                  type="button"
                  className="sidebar-star-btn dwh-favorites-toggle"
                  title="Favorileri aç"
                  aria-label="Favorileri aç"
                  aria-expanded={favoritesOpen}
                  onClick={() => setFavoritesOpen((open) => !open)}
                >
                  <StarIcon filled={false} size={15} />
                </button>
                </div>
              </div>

            <div className="dwh-catalog-switch" role="tablist" aria-label="DWH katalog görünümü">
              <button
                type="button"
                className={catalogTab === 'tables' ? 'on' : undefined}
                onClick={() => {
                  setFavoritesOpen(false)
                  setCatalogTab('tables')
                  setDetailKind('table')
                  setQuery('')
                }}
              >
                Tablolar
              </button>
              <button
                type="button"
                className={catalogTab === 'reports' ? 'on' : undefined}
                onClick={() => {
                  setFavoritesOpen(false)
                  setCatalogTab('reports')
                  setDetailKind('report')
                  setQuery('')
                }}
              >
                Raporlar
              </button>
            </div>

            <div className="dwh-sidebar-subhead">
              <span>{loadingList ? 'Yükleniyor' : `${visibleCount} kayıt`}</span>
            </div>

            <label className="search dwh-search dwh-catalog-search" ref={searchRef}>
              <span className="sr-only">DWH katalog ara</span>
              <input
                className={query ? 'has-clear' : undefined}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={catalogTab === 'tables' ? 'Tablo ara...' : 'Rapor ara...'}
              />
              {query ? (
                <button
                  type="button"
                  className="search-clear-btn"
                  aria-label="Aramayı temizle"
                  title="Aramayı temizle"
                  onClick={() => setQuery('')}
                >
                  ×
                </button>
              ) : null}
              {hasQuery ? (
                <>
                  <button
                    type="button"
                    className="search-backdrop"
                    aria-label="Aramayı kapat"
                    onClick={() => setQuery('')}
                  />
                  <DwhSearchHitsPortal open={searchOpen} anchorRef={searchRef} className="dwh-search-hits-portal">
                    <AnimatePresence initial={false}>
                      {catalogTab === 'tables'
                        ? tables.map((table, i) => (
                            <MotionListItem key={table.id} id={table.id} index={i}>
                              <button type="button" onClick={() => selectTableRoot(table)}>
                                <span className="search-hit-main">
                                  <span className="search-hit-text name-tip is-short" data-tip={fullTableName(table)}>
                                    <strong>{fullTableName(table)}</strong>
                                  </span>
                                  <span className="hit-tag hit-tag-table">Tablo</span>
                                </span>
                                <span className="method-hit-svc">
                                  {table.layer ?? 'Katman yok'} · {table.columnCount} kolon
                                </span>
                              </button>
                            </MotionListItem>
                          ))
                        : reports.map((report, i) => (
                            <MotionListItem key={report.id} id={report.id} index={i}>
                              <button type="button" onClick={() => selectReportRoot(report)}>
                                <span className="search-hit-main">
                                  <span className="search-hit-text name-tip is-short" data-tip={report.reportName}>
                                    <strong>{report.reportName}</strong>
                                  </span>
                                  <span className="hit-tag hit-tag-report">Rapor</span>
                                </span>
                                <span className="method-hit-svc">
                                  {report.fileName ?? 'Dosya bilgisi yok'} · {report.sourceCount} kaynak
                                </span>
                              </button>
                            </MotionListItem>
                          ))}
                      {!loadingList && visibleCount === 0 ? (
                        <MotionListItem id="dwh-empty-search" index={0}>
                          <button type="button" disabled>
                            <span className="search-hit-main">
                              <span className="search-hit-text">
                                <strong>Kayıt bulunamadı</strong>
                              </span>
                            </span>
                          </button>
                        </MotionListItem>
                      ) : null}
                    </AnimatePresence>
                  </DwhSearchHitsPortal>
                </>
              ) : null}
            </label>

            <div className="dwh-kind-legend" aria-label="DWH ağaç türleri">
              <span className="dwh-kind-key">
                <DwhKindIconBadge kind="table" />
                Tablo
              </span>
              <span className="dwh-kind-key">
                <DwhKindIconBadge kind="report" />
                Rapor
              </span>
              <span className="dwh-kind-key">
                <DwhKindIconBadge kind="subquery" />
                Alt Sorgu
              </span>
            </div>

            <div className="dwh-sidebar-body">
              <div className="dwh-tree-head">
                <label className="dwh-simple-toggle">
                  <input
                    type="checkbox"
                    checked={simpleTree}
                    onChange={(e) => setSimpleTree(e.target.checked)}
                  />
                  <span className="dwh-simple-toggle-track" aria-hidden>
                    <span className="dwh-simple-toggle-thumb" />
                  </span>
                  <span>Alt sorgusuz</span>
                </label>
              </div>
              <DwhLineageTree
                root={treeRoot}
                simple={simpleTree}
                selectedTableId={detailKind === 'table' ? selectedTableId : undefined}
                selectedReportId={detailKind === 'report' ? selectedReportId : undefined}
                onSelectTable={(tableId) => {
                  selectDwhVisit({
                    kind: 'table',
                    id: tableId,
                    name: dwhVisitName('table', tableId),
                  })
                }}
                onSelectReport={(reportId) => {
                  selectDwhVisit({
                    kind: 'report',
                    id: reportId,
                    name: dwhVisitName('report', reportId),
                  })
                }}
              />
            </div>
            </div>
            <div className={`dwh-favorites-overlay${favoritesOpen ? ' is-open' : ''}`} aria-hidden={!favoritesOpen}>
              <div className="dwh-sidebar-head is-favorites-head">
                <h3><StarIcon filled size={14} /> <span>Favorilerim</span></h3>
                <div className="dwh-sidebar-head-actions">
                  <button
                    type="button"
                    className={`dwh-sidebar-pin-btn${sidebarPinned ? ' is-pinned' : ''}`}
                    title={sidebarPinned ? 'Sabitlemeyi bırak' : 'Paneli sabitle'}
                    aria-label={sidebarPinned ? 'DWH paneli sabitli, sabitlemeyi bırak' : 'DWH panelini sabitle'}
                    aria-pressed={sidebarPinned}
                    onClick={toggleSidebarPinned}
                  >
                    <DwhSidebarPinIcon pinned={sidebarPinned} />
                  </button>
                  <button
                    type="button"
                    className="sidebar-star-btn dwh-favorites-toggle is-close"
                    title="Favorileri kapat"
                    aria-label="Favorileri kapat"
                    aria-expanded={favoritesOpen}
                    onClick={() => setFavoritesOpen(false)}
                  >
                    <span className="dwh-favorites-close-icon" aria-hidden>×</span>
                  </button>
                </div>
              </div>
              <div className="dwh-sidebar-body">
                <DwhFavoritesPanel
                  store={dwhFavorites}
                  onStoreChange={setDwhFavorites}
                  onSelectTable={(tableId) => selectDwhVisit({ kind: 'table', id: tableId, name: dwhVisitName('table', tableId) })}
                />
              </div>
            </div>
            <button
              type="button"
              className="dwh-sidebar-resize"
              aria-label="DWH panel genişliğini ayarla"
              title="Panel genişliğini ayarla"
              onPointerDown={startSidebarResize}
            />
          </div>
        </aside>

        <section className={`dwh-detail-panel stage-body${stageTab === 'map' ? ' is-map-view' : ''}`}>
          <StageTabPanels<DwhStageTab>
            tab={stageTab}
            tabOrder={DWH_STAGE_TAB_ORDER}
            mapOnly={stageTab === 'map'}
          >
            <section
              className="stage-panel stage-panel-map dwh-stage-panel dwh-stage-panel-map"
              aria-hidden={stageTab !== 'map'}
              aria-label="Harita"
            >
              <MapStage
                title={stageHeading}
                expanded={mapExpanded}
                onExpandedChange={setMapExpanded}
                active={stageTab === 'map'}
              >
                <DwhLineageMap
                  graph={lineageGraph}
                  loading={loadingGraph}
                  mapExpanded={mapExpanded}
                  active={stageTab === 'map'}
                  onVisitBack={goDwhVisitBack}
                  onVisitForward={goDwhVisitForward}
                  canVisitBack={visitIndex > 0}
                  canVisitForward={visitIndex >= 0 && visitIndex < visitHistory.length - 1}
                  onSelectTable={(tableId) => {
                    selectDwhVisit({
                      kind: 'table',
                      id: tableId,
                      name: dwhVisitName('table', tableId),
                    })
                  }}
                  onSelectReport={(reportId) => {
                    selectDwhVisit({
                      kind: 'report',
                      id: reportId,
                      name: dwhVisitName('report', reportId),
                    })
                  }}
                />
              </MapStage>
            </section>

            <section
              className="stage-panel dwh-stage-panel dwh-stage-panel-column-lineage"
              aria-hidden={stageTab !== 'lineage'}
              aria-label="Lineage"
            >
              <DwhColumnLineagePanel
                lineage={columnLineage}
                loading={loadingColumnLineage}
              />
            </section>

            <section
              className="stage-panel dwh-stage-panel dwh-stage-panel-query"
              aria-hidden={stageTab !== 'query'}
              aria-label="Sorgu"
            >
              {detailKind === 'table' ? (
                <TableQueryPanel
                  table={selectedTable}
                  statements={statements}
                  loading={loadingDetail}
                />
              ) : (
                <ReportQueryPanel report={selectedReport} loading={loadingDetail} />
              )}
            </section>

            <section
              className="stage-panel dwh-stage-panel dwh-stage-panel-columns"
              aria-hidden={stageTab !== 'columns'}
              aria-label="Kolonlar"
            >
              <div className="dwh-tab-content">
                <section className="dwh-section">
                  <h3>{detailKind === 'table' ? 'Tablo Kolonları' : 'Rapor Kolonları'}</h3>
                  {detailKind === 'table' ? (
                    loadingDetail ? (
                      <div className="dwh-detail-empty">Kolonlar yükleniyor...</div>
                    ) : (
                      <ColumnsTable columns={columns} />
                    )
                  ) : (
                    <ReportColumnsTable report={selectedReport} loading={loadingDetail} />
                  )}
                </section>
              </div>
            </section>

            <section
              className="stage-panel dwh-stage-panel dwh-stage-panel-impact"
              aria-hidden={stageTab !== 'impact'}
              aria-label="Etki"
            >
              <ImpactPanel
                detailKind={detailKind}
                table={selectedTable}
                impact={impact}
                loading={loadingImpact}
              />
            </section>
          </StageTabPanels>
        </section>
      </div>
    </main>
  )
}
