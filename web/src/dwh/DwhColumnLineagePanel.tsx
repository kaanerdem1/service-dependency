import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactFlow, {
  BaseEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { getDwhColumnAncestry, getDwhStatement } from './api'
import type {
  DwhColumnAncestryResponse,
  DwhColumnAncestryStep,
  DwhColumnLineageResponse,
  DwhColumnLineageSource,
  DwhColumnLineageTarget,
  DwhSqlStatement,
} from './types'

type Props = {
  lineage?: DwhColumnLineageResponse
  loading: boolean
}

type ViewMode = 'map' | 'ancestry'

type ColumnNodeData = {
  label: string
  sub: string
  kind: 'source' | 'target' | 'original'
  confidence?: string | null
  columnId?: number | null
  tableName?: string | null
  statementRefs?: ColumnNodeStatementRef[]
}

type ColumnNodeStatementRef = {
  statementId: number
  relation: string
  direction: 'fills' | 'source'
  relatedColumnName: string
  transformationType?: string | null
  confidence?: string | null
  packageName?: string | null
  procedureName?: string | null
}

type ColumnEdgeData = {
  fanIndex: number
  fanCount: number
  transformationType?: string | null
  confidence?: string | null
}

type ColumnLineageGraph = {
  nodes: Node<ColumnNodeData>[]
  edges: Edge<ColumnEdgeData>[]
}

type ColumnEdgeSemantic = {
  transformationType?: string | null
  confidence?: string | null
}

const COLUMN_FLOW_LEFT_X = 42
const COLUMN_FLOW_TOP_Y = 54
const COLUMN_FLOW_NODE_W = 260
const COLUMN_FLOW_SOURCE_W = 284
const COLUMN_FLOW_COL_PITCH = 398
const COLUMN_FLOW_ROW_GAP = 88

function transformLabel(type?: string | null) {
  if (type === 'TURETILMIS') return 'Türetilmiş'
  if (type === 'DIREKT_KOPYA') return 'Direkt'
  return type || 'Bilinmiyor'
}

function compactSql(sql: string | null | undefined) {
  if (!sql) return 'SQL metni yok'
  return sql.replace(/\s+/g, ' ').trim()
}

function statementProcedureLabel(statement: DwhSqlStatement | ColumnNodeStatementRef) {
  const pkg = statement.packageName?.trim()
  const proc = statement.procedureName?.trim()
  if (pkg && proc) return `${pkg}.${proc}`
  return proc || pkg || 'Prosedür bilgisi yok'
}

function qualifiedColumnName(tableName: string | null | undefined, columnName: string) {
  const table = tableName?.trim()
  const column = columnName.trim()
  return table ? `${table}.${column}` : column
}

function splitQualifiedColumnName(value: string) {
  if (value.includes(' · ')) return { tableName: undefined, columnName: value }
  const separator = value.lastIndexOf('.')
  if (separator < 0) return { tableName: undefined, columnName: value }
  return {
    tableName: value.slice(0, separator),
    columnName: value.slice(separator + 1),
  }
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

function refsFromSources(
  sources: DwhColumnLineageSource[],
  relation: string,
  direction: ColumnNodeStatementRef['direction'],
  relatedColumnName: string,
  relatedTableName?: string | null,
  relatedColumnNameForSource?: (source: DwhColumnLineageSource) => string,
): ColumnNodeStatementRef[] {
  const refsByKey = new Map<string, ColumnNodeStatementRef>()
  for (const source of sources) {
    if (typeof source.statementId !== 'number') continue
    const columnName = relatedColumnNameForSource
      ? relatedColumnNameForSource(source)
      : qualifiedColumnName(relatedTableName, relatedColumnName)
    const key = `${source.statementId}:${columnName}`
    const existing = refsByKey.get(key)
    if (existing) {
      continue
    }
    refsByKey.set(key, {
      statementId: source.statementId,
      relation,
      direction,
      relatedColumnName: columnName,
      transformationType: source.transformationType,
      confidence: source.confidence,
      packageName: source.packageName,
      procedureName: source.procedureName,
    })
  }
  return Array.from(refsByKey.values())
}

function addStatementRef(
  refsByColumnId: Map<number, ColumnNodeStatementRef[]>,
  columnId: number,
  ref: ColumnNodeStatementRef,
) {
  const refs = refsByColumnId.get(columnId) ?? []
  if (!refs.some((item) =>
    item.statementId === ref.statementId &&
    item.relation === ref.relation &&
    item.relatedColumnName === ref.relatedColumnName
  )) {
    refs.push(ref)
  }
  refsByColumnId.set(columnId, refs)
}

function targetKey(target: DwhColumnLineageTarget) {
  return target.targetColumnId != null ? `column:${target.targetColumnId}` : target.id
}

function nodeIdForColumn(columnId: number) {
  return `column:${columnId}`
}

function ColumnLineageNode({ data }: NodeProps<ColumnNodeData>) {
  const label =
    data.kind === 'target'
      ? 'Hedef'
      : data.kind === 'original'
        ? 'Orijinal'
        : 'Kaynak'
  return (
    <div
      className={`dwh-col-flow-node is-${data.kind}${data.confidence === 'TAHMIN' ? ' is-estimated' : ''}${data.statementRefs?.length ? ' has-sql' : ''}`}
      title={data.statementRefs?.length ? 'SQL detayını aç' : undefined}
    >
      <Handle type="target" position={Position.Left} className="dwh-col-flow-handle" />
      <span className="dwh-col-flow-kicker">{label}</span>
      <strong title={data.label}>{data.label}</strong>
      <small title={data.sub}>{data.sub}</small>
      <Handle type="source" position={Position.Right} className="dwh-col-flow-handle" />
    </div>
  )
}

const ColumnLineageNodeMemo = memo(ColumnLineageNode)
const NODE_TYPES: NodeTypes = { columnLineageNode: ColumnLineageNodeMemo }

function ColumnLineageFanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps<ColumnEdgeData>) {
  const fanIndex = data?.fanIndex ?? 0
  const fanCount = Math.max(1, data?.fanCount ?? 1)
  const mid = (fanCount - 1) / 2
  const spread = Math.max(-76, Math.min(76, (fanIndex - mid) * 14))
  const dx = Math.max(120, Math.abs(targetX - sourceX) * 0.42)
  const path = `M ${sourceX},${sourceY} C ${sourceX + dx},${sourceY + spread} ${targetX - dx},${targetY + spread} ${targetX},${targetY}`

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
      interactionWidth={24}
    />
  )
}

const ColumnLineageFanEdgeMemo = memo(ColumnLineageFanEdge)
const EDGE_TYPES: EdgeTypes = { columnFan: ColumnLineageFanEdgeMemo }

function FullscreenGlyph({ expanded }: { expanded: boolean }) {
  return (
    <span className="tl-zoom-glyph" aria-hidden>
      {expanded ? (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path
            d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M1.5 1.5l3 3M10.5 1.5l-3 3M1.5 10.5l3-3M10.5 10.5l-3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path
            d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.5 1.5L1.5 4.5M7.5 1.5l3 3M4.5 10.5L1.5 7.5M7.5 10.5l3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  )
}

function edgeStyle(step: ColumnEdgeSemantic) {
  const derived = step.transformationType === 'TURETILMIS'
  return {
    color: derived ? '#9a6a16' : '#2f6f55',
    dash: step.confidence === 'TAHMIN' ? '7 5' : undefined,
  }
}

function edgeClassName(step: ColumnEdgeSemantic) {
  return `dwh-col-flow-edge${step.transformationType === 'TURETILMIS' ? ' is-derived' : ' is-direct'}${step.confidence === 'TAHMIN' ? ' is-estimated' : ''}`
}

function edgeDataForGroup(
  edge: ColumnEdgeSemantic,
  fanIndex: number,
  fanCount: number,
): ColumnEdgeData {
  return {
    fanIndex,
    fanCount,
    transformationType: edge.transformationType,
    confidence: edge.confidence,
  }
}

function buildAncestryGraph(
  target: DwhColumnLineageTarget | undefined,
  ancestry: DwhColumnAncestryResponse | undefined,
  targetTableName?: string | null,
): ColumnLineageGraph {
  if (!target) return { nodes: [], edges: [] }

  const steps = ancestry?.steps ?? []
  if (!target.targetColumnId || !steps.length) return buildDirectGraph(target, ancestry?.tableName ?? targetTableName)

  const levels = Array.from(new Set(steps.map((step) => step.level))).sort((a, b) => a - b)
  const maxLevel = Math.max(...levels)
  const columnIds = new Set<number>([target.targetColumnId])
  steps.forEach((step) => columnIds.add(step.sourceColumnId))
  const targetId = nodeIdForColumn(target.targetColumnId)
  const targetStatementRefs = refsFromSources(
    target.sources,
    'Hedef kolonu dolduruyor',
    'fills',
    target.targetColumnName,
    ancestry.tableName,
    (source) => qualifiedColumnName(source.sourceTableName, source.sourceColumnName ?? 'Kaynak kolon yok'),
  )
  const statementRefsByColumnId = new Map<number, ColumnNodeStatementRef[]>()
  for (const source of target.sources) {
    if (typeof source.sourceColumnId !== 'number' || typeof source.statementId !== 'number') continue
    addStatementRef(statementRefsByColumnId, source.sourceColumnId, {
      statementId: source.statementId,
      relation: `${target.targetColumnName} kolonuna kaynak oluyor`,
      direction: 'source',
      relatedColumnName: qualifiedColumnName(ancestry.tableName, target.targetColumnName),
      transformationType: source.transformationType,
      confidence: source.confidence,
      packageName: source.packageName,
      procedureName: source.procedureName,
    })
  }

  for (const step of steps) {
    if (typeof step.statementId !== 'number') continue
    const refBase = {
      statementId: step.statementId,
      transformationType: step.transformationType,
      confidence: step.confidence,
      packageName: step.packageName,
      procedureName: step.procedureName,
    }
    addStatementRef(statementRefsByColumnId, step.sourceColumnId, {
      ...refBase,
      relation: `${step.downstreamColumnName} kolonuna kaynak oluyor`,
      direction: 'source',
      relatedColumnName: qualifiedColumnName(step.downstreamTableName, step.downstreamColumnName),
    })
    addStatementRef(statementRefsByColumnId, step.downstreamColumnId, {
      ...refBase,
      relation: 'Kolonu dolduruyor',
      direction: 'fills',
      relatedColumnName: qualifiedColumnName(step.sourceTableName, step.sourceColumnName),
    })
  }
  const metaByColumnId = new Map<number, ColumnNodeData>()
  const visualColumnById = new Map<string, number>([[targetId, maxLevel]])
  const idsByVisualColumn = new Map<number, string[]>()
  const downstreamBySourceId = new Map<string, string[]>()

  for (const step of steps) {
    const sourceId = nodeIdForColumn(step.sourceColumnId)
    const currentColumn = visualColumnById.get(sourceId)
    const visualColumn = maxLevel - step.level
    visualColumnById.set(
      sourceId,
      currentColumn === undefined ? visualColumn : Math.min(currentColumn, visualColumn),
    )
    metaByColumnId.set(step.sourceColumnId, {
      label: step.sourceColumnName,
      sub: step.sourceTableName,
      kind: step.original ? 'original' : 'source',
      confidence: step.confidence,
      columnId: step.sourceColumnId,
      tableName: step.sourceTableName,
      statementRefs: statementRefsByColumnId.get(step.sourceColumnId),
    })
    const downstream = downstreamBySourceId.get(sourceId) ?? []
    downstream.push(nodeIdForColumn(step.downstreamColumnId))
    downstreamBySourceId.set(sourceId, downstream)
  }

  for (const [id, visualColumn] of visualColumnById) {
    if (id === targetId) continue
    const list = idsByVisualColumn.get(visualColumn) ?? []
    list.push(id)
    idsByVisualColumn.set(visualColumn, list)
  }

  const maxRows = Math.max(1, ...Array.from(idsByVisualColumn.values()).map((ids) => ids.length))
  const targetY = COLUMN_FLOW_TOP_Y + ((maxRows - 1) * COLUMN_FLOW_ROW_GAP) / 2
  const yById = new Map<string, number>([[targetId, targetY]])

  const nodes: Node<ColumnNodeData>[] = [
    {
      id: targetId,
      type: 'columnLineageNode',
      position: { x: COLUMN_FLOW_LEFT_X + maxLevel * COLUMN_FLOW_COL_PITCH, y: targetY },
      data: {
        label: target.targetColumnName,
        sub: ancestry.tableName,
        kind: 'target',
        columnId: target.targetColumnId,
        tableName: ancestry.tableName,
        statementRefs: targetStatementRefs,
      },
      style: { width: COLUMN_FLOW_NODE_W },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    },
  ]

  for (let visualColumn = maxLevel - 1; visualColumn >= 0; visualColumn -= 1) {
    const ids = idsByVisualColumn.get(visualColumn) ?? []
    const score = (id: string) => {
      const yValues = (downstreamBySourceId.get(id) ?? [])
        .map((downstreamId) => yById.get(downstreamId))
        .filter((value): value is number => typeof value === 'number')
      return yValues.length
        ? yValues.reduce((sum, value) => sum + value, 0) / yValues.length
        : Number.POSITIVE_INFINITY
    }
    const sorted = [...ids].sort((a, b) => {
      const aScore = score(a)
      const bScore = score(b)
      if (Number.isFinite(aScore) || Number.isFinite(bScore)) {
        if (!Number.isFinite(aScore)) return 1
        if (!Number.isFinite(bScore)) return -1
        if (aScore !== bScore) return aScore - bScore
      }
      const aMeta = metaByColumnId.get(Number(a.replace('column:', '')))
      const bMeta = metaByColumnId.get(Number(b.replace('column:', '')))
      return `${aMeta?.sub ?? ''}.${aMeta?.label ?? a}`.localeCompare(`${bMeta?.sub ?? ''}.${bMeta?.label ?? b}`, 'tr')
    })
    const columnTop = COLUMN_FLOW_TOP_Y + ((maxRows - sorted.length) * COLUMN_FLOW_ROW_GAP) / 2

    sorted.forEach((id, rowIndex) => {
      const columnId = Number(id.replace('column:', ''))
      const meta = metaByColumnId.get(columnId)
      if (!meta) return
      const y = columnTop + rowIndex * COLUMN_FLOW_ROW_GAP
      yById.set(id, y)
      nodes.push({
        id,
        type: 'columnLineageNode',
        position: {
          x: COLUMN_FLOW_LEFT_X + visualColumn * COLUMN_FLOW_COL_PITCH,
          y,
        },
        data: meta,
        style: { width: COLUMN_FLOW_NODE_W },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      })
    })
  }

  const seenEdges = new Set<string>()
  const rawEdges: Array<{ id: string; source: string; target: string; step: DwhColumnAncestryStep }> = []
  steps.forEach((step, index) => {
    if (!columnIds.has(step.downstreamColumnId)) return
    const source = nodeIdForColumn(step.sourceColumnId)
    const downstreamId = nodeIdForColumn(step.downstreamColumnId)
    const edgeKey = `${source}->${downstreamId}`
    if (seenEdges.has(edgeKey)) return
    seenEdges.add(edgeKey)
    rawEdges.push({ id: `${edgeKey}:${index}`, source, target: downstreamId, step })
  })

  const incomingByTarget = new Map<string, typeof rawEdges>()
  for (const edge of rawEdges) {
    const group = incomingByTarget.get(edge.target) ?? []
    group.push(edge)
    incomingByTarget.set(edge.target, group)
  }

  const edges: Edge<ColumnEdgeData>[] = rawEdges.map((edge) => {
    const group = incomingByTarget.get(edge.target) ?? [edge]
    const style = edgeStyle(edge.step)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'columnFan',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: style.color,
      },
      className: edgeClassName(edge.step),
      style: {
        stroke: style.color,
        strokeWidth: 2.15,
        strokeDasharray: style.dash,
      },
      data: edgeDataForGroup(edge.step, group.indexOf(edge), group.length),
    }
  })

  return { nodes, edges }
}

function buildDirectGraph(target: DwhColumnLineageTarget, targetTableName?: string | null): ColumnLineageGraph {
  const shownSources = target.sources
  const targetStatementRefs = refsFromSources(
    shownSources,
    'Hedef kolonu dolduruyor',
    'fills',
    target.targetColumnName,
    targetTableName,
    (source) => qualifiedColumnName(source.sourceTableName, source.sourceColumnName ?? 'Kaynak kolon yok'),
  )
  const targetY = COLUMN_FLOW_TOP_Y + ((Math.max(1, shownSources.length) - 1) * COLUMN_FLOW_ROW_GAP) / 2
  const nodes: Node<ColumnNodeData>[] = [
    {
      id: 'target',
      type: 'columnLineageNode',
      position: { x: COLUMN_FLOW_LEFT_X + COLUMN_FLOW_COL_PITCH, y: targetY },
      data: {
        label: target.targetColumnName,
        sub: `${target.sources.length} kaynak kolon`,
        kind: 'target',
        columnId: target.targetColumnId,
        statementRefs: targetStatementRefs,
      },
      style: { width: COLUMN_FLOW_NODE_W },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    },
  ]

  shownSources.forEach((source, index) => {
    nodes.push({
      id: `source:${index}`,
      type: 'columnLineageNode',
      position: { x: COLUMN_FLOW_LEFT_X, y: COLUMN_FLOW_TOP_Y + index * COLUMN_FLOW_ROW_GAP },
      data: {
        label: source.sourceColumnName ?? 'Kolon yok',
        sub: source.sourceTableName ?? 'Kaynak tablo yok',
        kind: 'source',
        confidence: source.confidence,
        columnId: source.sourceColumnId,
        tableName: source.sourceTableName,
        statementRefs: refsFromSources(
          [source],
          `${target.targetColumnName} kolonuna kaynak oluyor`,
          'source',
          target.targetColumnName,
          targetTableName,
        ),
      },
      style: { width: COLUMN_FLOW_SOURCE_W },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    })
  })

  const edges: Edge<ColumnEdgeData>[] = shownSources.map((source, index) => {
    const style = edgeStyle(source)
    return {
      id: `edge:${index}`,
      source: `source:${index}`,
      target: 'target',
      type: 'columnFan',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: style.color,
      },
      className: edgeClassName(source),
      style: {
        stroke: style.color,
        strokeWidth: 2.15,
        strokeDasharray: style.dash,
      },
      data: edgeDataForGroup(source, index, shownSources.length),
    }
  })

  return { nodes, edges }
}

function ColumnLineageLegend() {
  return (
    <div className="dwh-col-flow-legend" aria-label="Kolon lineage çizgi anlamları">
      <span>
        <i className="is-direct" aria-hidden />
        Direkt
      </span>
      <span>
        <i className="is-derived" aria-hidden />
        Türetilmiş
      </span>
      <span>
        <i className="is-estimated" aria-hidden />
        Tahmin
      </span>
    </div>
  )
}

function DmlBadge({ dmlType }: { dmlType?: string | null }) {
  return <span className={`dwh-dml-badge ${dmlClass(dmlType)}`}>{dmlType || 'SQL'}</span>
}

function ColumnSqlBlock({
  statement,
  columnName,
  columnTableName,
}: {
  statement: DwhSqlStatement
  columnName: string
  columnTableName?: string | null
}) {
  const [view, setView] = useState<'summary' | 'full'>('full')
  const hasSummary = Boolean(statement.simplifiedSql)
  const sqlText = hasSummary && view === 'summary' ? statement.simplifiedSql : statement.sqlText

  useEffect(() => {
    setView(hasSummary ? 'summary' : 'full')
  }, [hasSummary, statement.statementId, statement.simplifiedSql])

  return (
    <div className="dwh-col-sql-detail">
      <div className="dwh-col-sql-detail-head">
        <div>
          <span className="dwh-eyebrow">Kolon</span>
          <h3>{qualifiedColumnName(columnTableName, columnName)}</h3>
          <p>{statementProcedureLabel(statement)}</p>
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
          {statement.targetTable ?? '-'}
        </span>
      </div>
      {statement.sources.length ? (
        <details className="dwh-sql-source-details" open={statement.sources.length <= 5}>
          <summary>Prosedürün kullandığı kaynak tablolar ({statement.sources.length})</summary>
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
      <pre className="dwh-sql-block">{sqlText || compactSql(sqlText)}</pre>
    </div>
  )
}

function ColumnSqlModal({
  node,
  statements,
  selectedStatementId,
  loading,
  error,
  onSelectStatement,
  onClose,
}: {
  node?: ColumnNodeData
  statements: DwhSqlStatement[]
  selectedStatementId?: number
  loading: boolean
  error?: string
  onSelectStatement: (statementId: number) => void
  onClose: () => void
}) {
  const [selectedRefKey, setSelectedRefKey] = useState<string>()

  useEffect(() => {
    if (!node) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [node, onClose])

  useEffect(() => {
    setSelectedRefKey(undefined)
  }, [node])

  if (!node) return null

  const refs = node.statementRefs ?? []
  const refKey = (ref: ColumnNodeStatementRef) =>
    `${ref.statementId}:${ref.direction}:${ref.relatedColumnName}`
  const selectedStatement =
    statements.find((statement) => statement.statementId === selectedStatementId) ?? statements[0]
  const fillingRefs = refs.filter((ref) => ref.direction === 'fills')
  const downstreamRefs = refs.filter((ref) => ref.direction === 'source')
  const selectedRef = refs.find((ref) => refKey(ref) === selectedRefKey)
    ?? refs.find((ref) => ref.statementId === selectedStatementId)
    ?? refs[0]
  const selectedColumn = selectedRef
    ? splitQualifiedColumnName(selectedRef.relatedColumnName)
    : { tableName: node.tableName, columnName: node.label }
  const renderStatementRefs = (items: ColumnNodeStatementRef[]) =>
    items.map((ref) => {
      const statement = statements.find((item) => item.statementId === ref.statementId)
      const key = refKey(ref)
      return (
        <button
          key={key}
          type="button"
          className={selectedRef === ref ? 'is-selected' : undefined}
          onClick={() => {
            setSelectedRefKey(key)
            onSelectStatement(ref.statementId)
          }}
        >
          <strong>{ref.relatedColumnName}</strong>
          <small>{statement ? statementProcedureLabel(statement) : statementProcedureLabel(ref)}</small>
          <span>
            {statement ? <DmlBadge dmlType={statement.dmlType} /> : null}
            {ref.transformationType ? (
              <span className={`dwh-transform-badge${ref.transformationType === 'TURETILMIS' ? ' is-derived' : ' is-direct'}`}>
                {transformLabel(ref.transformationType)}
              </span>
            ) : null}
          </span>
        </button>
      )
    })
  const body = (
    <div className="dwh-col-sql-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dwh-col-sql-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dwh-col-sql-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dwh-col-sql-modal-head">
          <div>
            <span className="dwh-eyebrow">Kolon SQL Detayı</span>
            <h2 id="dwh-col-sql-modal-title">{node.label}</h2>
            <p>{node.tableName ?? node.sub}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>

        {loading ? <div className="dwh-col-sql-state">SQL bilgisi yükleniyor...</div> : null}
        {error ? <div className="dwh-col-sql-state is-error">{error}</div> : null}

        {!loading && !error ? (
          refs.length && statements.length ? (
            <div className="dwh-col-sql-layout">
              <aside className="dwh-col-sql-list">
                <h3>Bu kolonu dolduranlar</h3>
                {renderStatementRefs(fillingRefs)}
                <h3>Bu kolonun doldurdukları</h3>
                {renderStatementRefs(downstreamRefs)}
              </aside>
              {selectedStatement ? (
                <ColumnSqlBlock
                  statement={selectedStatement}
                  columnName={selectedColumn.columnName}
                  columnTableName={selectedColumn.tableName}
                />
              ) : (
                <div className="dwh-col-sql-state">Seçili sorgu bulunamadı.</div>
              )}
            </div>
          ) : (
            <div className="dwh-col-sql-state">
              Bu kolon için doğrudan bağlı SQL kaydı bulunamadı.
            </div>
          )
        ) : null}
      </section>
    </div>
  )

  if (typeof document === 'undefined') return body
  return createPortal(body, document.body)
}

function AncestryTable({
  target,
  ancestry,
  loading,
  error,
  onSelectStep,
}: {
  target?: DwhColumnLineageTarget
  ancestry?: DwhColumnAncestryResponse
  loading: boolean
  error?: string
  onSelectStep: (step: DwhColumnAncestryStep) => void
}) {
  if (!target) return <div className="dwh-detail-empty">Detay için bir kolon seçin.</div>

  return (
    <div className="dwh-col-ancestry-view">
      <section className="dwh-col-ancestry">
        <h4>Tam Soykütük</h4>
        {loading ? <p className="dwh-empty-line">Soykütük yükleniyor...</p> : null}
        {error ? <p className="dwh-empty-line">{error}</p> : null}
        {!target.targetColumnId ? (
          <p className="dwh-empty-line">Rapor kolonu için tam soykütük adımları bulunmuyor.</p>
        ) : null}
        {!loading && !error && target.targetColumnId && ancestry?.steps.length === 0 ? (
          <p className="dwh-empty-line">Bu kolon için kayıtlı bir üst kaynak bulunamadı.</p>
        ) : null}
        {ancestry?.steps.length ? (
          <div className="dwh-col-ancestry-table-wrap">
            <table className="dwh-col-ancestry-table">
              <thead>
                <tr>
                  <th>Seviye</th>
                  <th>Kaynak kolon</th>
                  <th>Bağlandığı kolon</th>
                  <th>Tip</th>
                  <th>Güven</th>
                </tr>
              </thead>
              <tbody>
                {ancestry.steps.map((step) => (
                  <tr
                    key={step.id}
                    className={step.original ? 'is-original' : undefined}
                    onClick={() => onSelectStep(step)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectStep(step)
                      }
                    }}
                    tabIndex={0}
                    title="SQL detayını aç"
                  >
                    <td>{step.level}</td>
                    <td title={`${step.sourceTableName}.${step.sourceColumnName}`}>
                      {step.sourceTableName}.{step.sourceColumnName}
                    </td>
                    <td title={`${step.downstreamTableName}.${step.downstreamColumnName}`}>
                      {step.downstreamTableName}.{step.downstreamColumnName}
                    </td>
                    <td>{transformLabel(step.transformationType)}</td>
                    <td>{step.original ? 'Orijinal kaynak' : step.confidence ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export function DwhColumnLineagePanel({ lineage, loading }: Props) {
  const [filter, setFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string>()
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const focusClearTimer = useRef<number | undefined>(undefined)
  const [sqlNode, setSqlNode] = useState<ColumnNodeData>()
  const [sqlStatements, setSqlStatements] = useState<DwhSqlStatement[]>([])
  const [selectedSqlStatementId, setSelectedSqlStatementId] = useState<number>()
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sqlError, setSqlError] = useState<string>()
  const [ancestry, setAncestry] = useState<DwhColumnAncestryResponse>()
  const [ancestryLoading, setAncestryLoading] = useState(false)
  const [ancestryError, setAncestryError] = useState<string>()
  const targets = lineage?.targets ?? []

  const filteredTargets = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('tr-TR')
    if (!q) return targets
    return targets.filter((target) => {
      if (target.targetColumnName.toLocaleLowerCase('tr-TR').includes(q)) return true
      return target.sources.some((source) =>
        `${source.sourceTableName ?? ''}.${source.sourceColumnName ?? ''}`.toLocaleLowerCase('tr-TR').includes(q),
      )
    })
  }, [filter, targets])

  useEffect(() => {
    setSelectedKey((current) => {
      if (current && targets.some((target) => targetKey(target) === current)) return current
      return targets[0] ? targetKey(targets[0]) : undefined
    })
  }, [targets])

  const selectedTarget = useMemo(
    () => targets.find((target) => targetKey(target) === selectedKey) ?? filteredTargets[0],
    [filteredTargets, selectedKey, targets],
  )

  useEffect(() => {
    setAncestry(undefined)
    setAncestryError(undefined)
    if (!selectedTarget?.targetColumnId) {
      setAncestryLoading(false)
      return undefined
    }
    let alive = true
    setAncestryLoading(true)
    void getDwhColumnAncestry(selectedTarget.targetColumnId)
      .then((response) => {
        if (!alive) return
        setAncestry(response)
      })
      .catch((e: Error) => {
        if (!alive) return
        setAncestryError(e.message)
      })
      .finally(() => {
        if (!alive) return
        setAncestryLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selectedTarget?.targetColumnId])

  const graph = useMemo(
    () => buildAncestryGraph(
      selectedTarget,
      ancestry,
      lineage?.table
        ? `${lineage.table.schemaName ? `${lineage.table.schemaName}.` : ''}${lineage.table.tableName}`
        : undefined,
    ),
    [ancestry, lineage?.table, selectedTarget],
  )

  useEffect(() => {
    setFocusNodeId(null)
    setSqlNode(undefined)
    setMapExpanded(false)
  }, [selectedKey, viewMode])

  useEffect(() => {
    if (!mapExpanded) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMapExpanded(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [mapExpanded])

  useEffect(() => {
    return () => {
      window.clearTimeout(focusClearTimer.current)
    }
  }, [])

  const focusNode = (nodeId: string) => {
    window.clearTimeout(focusClearTimer.current)
    setFocusNodeId((current) => (current === nodeId ? current : nodeId))
  }

  const clearFocusSoon = () => {
    window.clearTimeout(focusClearTimer.current)
    focusClearTimer.current = window.setTimeout(() => {
      setFocusNodeId(null)
    }, 80)
  }

  useEffect(() => {
    setSqlStatements([])
    setSqlError(undefined)
    const ids = Array.from(new Set(sqlNode?.statementRefs?.map((ref) => ref.statementId) ?? []))
    setSelectedSqlStatementId(ids[0])

    if (!sqlNode || !ids.length) {
      setSqlLoading(false)
      return undefined
    }

    let alive = true
    setSqlLoading(true)
    void Promise.all(ids.map((id) => getDwhStatement(id)))
      .then((statements) => {
        if (!alive) return
        setSqlStatements(statements)
      })
      .catch((e: Error) => {
        if (!alive) return
        setSqlError(e.message)
      })
      .finally(() => {
        if (!alive) return
        setSqlLoading(false)
      })

    return () => {
      alive = false
    }
  }, [sqlNode])

  const focusSet = useMemo(() => {
    if (!focusNodeId) return { nodeIds: new Set<string>(), edgeIds: new Set<string>() }

    const nodeIds = new Set<string>([focusNodeId])
    const edgeIds = new Set<string>()
    const queue = [focusNodeId]

    while (queue.length) {
      const currentId = queue.shift()
      if (!currentId) continue
      for (const edge of graph.edges) {
        if (edge.target !== currentId || edgeIds.has(edge.id)) continue
        edgeIds.add(edge.id)
        if (!nodeIds.has(edge.source)) {
          nodeIds.add(edge.source)
          queue.push(edge.source)
        }
      }
    }

    for (const edge of graph.edges) {
      if (edge.source !== focusNodeId) continue
      edgeIds.add(edge.id)
      nodeIds.add(edge.target)
    }

    return { nodeIds, edgeIds }
  }, [focusNodeId, graph.edges])

  const flowNodes = useMemo(() => {
    if (!focusNodeId) return graph.nodes
    return graph.nodes.map((node) => ({
      ...node,
      className: [
        node.className,
        focusSet.nodeIds.has(node.id) ? 'rf-path-on' : 'rf-path-off',
        node.id === focusNodeId ? 'rf-path-focus' : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    }))
  }, [focusNodeId, focusSet.nodeIds, graph.nodes])

  const flowEdges = useMemo(() => {
    if (!focusNodeId) return graph.edges
    return graph.edges.map((edge) => ({
      ...edge,
      className: [
        edge.className,
        focusSet.edgeIds.has(edge.id) ? 'dd-edge-on' : 'dd-edge-off',
      ]
        .filter(Boolean)
        .join(' '),
    }))
  }, [focusNodeId, focusSet.edgeIds, graph.edges])

  const entityName =
    lineage?.entityKind === 'report'
      ? lineage.report?.reportName
      : lineage?.table
        ? lineage.table.schemaName
          ? `${lineage.table.schemaName}.${lineage.table.tableName}`
          : lineage.table.tableName
        : undefined
  const lineageStepCount = ancestry?.steps.length ?? selectedTarget?.sources.length ?? 0
  const renderMapCanvas = (expanded = false) => (
    <div
      className={`dwh-col-flow-canvas${focusNodeId ? ' is-focusing' : ''}${expanded ? ' is-expanded' : ''}`}
      onMouseLeave={() => setFocusNodeId(null)}
    >
      <div className="dwh-col-map-chrome">
        <button
          type="button"
          className="tl-zoom"
          title={expanded ? 'Küçült (Esc)' : 'Haritayı tam ekran aç'}
          aria-label={expanded ? 'Haritayı küçült' : 'Haritayı tam ekran aç'}
          onClick={() => setMapExpanded(!expanded)}
        >
          <FullscreenGlyph expanded={expanded} />
        </button>
        <span className="tl-zoom-label">{expanded ? `${selectedTarget?.targetColumnName ?? 'Kolon'} lineage` : 'Tam ekran'}</span>
      </div>
      <ColumnLineageLegend />
      {ancestryLoading && selectedTarget?.targetColumnId ? (
        <div className="dwh-col-map-status">Tam soykütük haritası yükleniyor...</div>
      ) : null}
      {ancestryError ? <div className="dwh-col-map-status is-error">{ancestryError}</div> : null}
      <ReactFlow
        key={`${selectedKey ?? 'empty-column-lineage'}:${lineageStepCount}:${expanded ? 'expanded' : 'inline'}`}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: expanded ? 0.12 : 0.28, duration: 250, maxZoom: expanded ? 0.9 : 1.25 }}
        minZoom={0.2}
        maxZoom={1.25}
        onInit={(instance) => {
          window.requestAnimationFrame(() => {
            instance.fitView({
              padding: expanded ? 0.12 : 0.28,
              duration: 0,
              maxZoom: expanded ? 0.9 : 1.25,
            })
          })
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeMouseEnter={(_, node) => focusNode(node.id)}
        onNodeMouseMove={(_, node) => focusNode(node.id)}
        onNodeMouseLeave={clearFocusSoon}
        onNodeClick={(_, node) => setSqlNode(node.data)}
        onPaneClick={() => setFocusNodeId(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(106,116,140,.25)" />
      </ReactFlow>
    </div>
  )
  const expandedMap =
    mapExpanded && typeof document !== 'undefined'
      ? createPortal(
          <div className="dwh-col-map-fullscreen">
            {renderMapCanvas(true)}
          </div>,
          document.body,
        )
      : null

  if (loading) {
    return (
      <div className="dwh-tab-content dwh-column-lineage-content is-empty">
        <div className="dwh-detail-empty">Kolon lineage yükleniyor...</div>
      </div>
    )
  }

  if (!lineage) {
    return (
      <div className="dwh-tab-content dwh-column-lineage-content is-empty">
        <div className="dwh-detail-empty">Lineage için tablo veya rapor seçin.</div>
      </div>
    )
  }

  if (!targets.length) {
    return (
      <div className="dwh-tab-content dwh-column-lineage-content is-empty">
        <div className="dwh-detail-empty">Bu kayıt için kolon lineage bilgisi yok.</div>
      </div>
    )
  }

  return (
    <div className="dwh-tab-content dwh-column-lineage-content">
      <aside className="dwh-col-lineage-list-panel">
        <div className="dwh-section-head">
          <div>
            <h3>Kolon Lineage</h3>
            <p>{entityName ?? 'Seçili kayıt'} için {targets.length} kolon eşleşmesi.</p>
          </div>
        </div>
        <label className="dwh-col-lineage-filter">
          <span className="sr-only">Kolon lineage filtrele</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Kolon veya kaynak ara..."
          />
        </label>
        <div className="dwh-col-lineage-count">
          {filteredTargets.length} / {targets.length} lineage kolonu
          {lineage.totalColumns ? ` · ${lineage.totalColumns} toplam kolon` : ''}
        </div>
        <div className="dwh-col-target-list">
          {filteredTargets.map((target) => {
            const key = targetKey(target)
            const selected = selectedTarget && targetKey(selectedTarget) === key
            const derived = target.sources.some((source) => source.transformationType === 'TURETILMIS')
            const estimated = target.sources.some((source) => source.confidence === 'TAHMIN')
            return (
              <button
                key={key}
                type="button"
                className={`dwh-col-target-row${selected ? ' is-selected' : ''}`}
                onClick={() => setSelectedKey(key)}
                title={target.targetColumnName}
              >
                <span className="dwh-col-target-main">
                  <strong>{target.targetColumnName}</strong>
                  <small>{target.sources.length} doğrudan kaynak</small>
                </span>
                <span className="dwh-col-target-flags">
                  {derived ? <span className="dwh-transform-badge is-derived">Türetilmiş</span> : null}
                  {estimated ? <span className="dwh-confidence-badge is-estimated">TAHMIN</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="dwh-col-lineage-workspace">
        <div className="dwh-col-lineage-toolbar">
          <div>
            <span className="dwh-eyebrow">Seçili Kolon</span>
            <h3>{selectedTarget?.targetColumnName ?? 'Kolon seçin'}</h3>
            <p>{selectedTarget?.sources.length ?? 0} doğrudan kaynak</p>
          </div>
          <div className="dwh-col-view-toggle" role="group" aria-label="Lineage görünümü">
            <button
              type="button"
              className={viewMode === 'map' ? 'on' : undefined}
              onClick={() => setViewMode('map')}
            >
              Harita
            </button>
            <button
              type="button"
              className={viewMode === 'ancestry' ? 'on' : undefined}
              onClick={() => setViewMode('ancestry')}
            >
              Soykütüğü
            </button>
          </div>
        </div>

        {viewMode === 'map' ? (
          <>
            {mapExpanded ? <div className="dwh-col-flow-placeholder" /> : renderMapCanvas()}
            {expandedMap}
          </>
        ) : (
          <AncestryTable
            target={selectedTarget}
            ancestry={ancestry}
            loading={ancestryLoading}
            error={ancestryError}
            onSelectStep={(step) => {
              setSqlNode({
                label: step.sourceColumnName,
                sub: step.sourceTableName,
                kind: step.original ? 'original' : 'source',
                confidence: step.confidence,
                columnId: step.sourceColumnId,
                tableName: step.sourceTableName,
                statementRefs:
                  typeof step.statementId === 'number'
                    ? [
                        {
                          statementId: step.statementId,
                          relation: `${step.downstreamTableName}.${step.downstreamColumnName} kolonuna kaynak oluyor`,
                          direction: 'source',
                          relatedColumnName: qualifiedColumnName(step.downstreamTableName, step.downstreamColumnName),
                          transformationType: step.transformationType,
                          confidence: step.confidence,
                          packageName: step.packageName,
                          procedureName: step.procedureName,
                        },
                      ]
                    : [],
              })
            }}
          />
        )}
      </section>
      <ColumnSqlModal
        node={sqlNode}
        statements={sqlStatements}
        selectedStatementId={selectedSqlStatementId}
        loading={sqlLoading}
        error={sqlError}
        onSelectStatement={setSelectedSqlStatementId}
        onClose={() => setSqlNode(undefined)}
      />
    </div>
  )
}
