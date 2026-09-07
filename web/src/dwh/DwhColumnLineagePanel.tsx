import { memo, useEffect, useMemo, useState } from 'react'
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
import { getDwhColumnAncestry } from './api'
import type {
  DwhColumnAncestryResponse,
  DwhColumnAncestryStep,
  DwhColumnLineageResponse,
  DwhColumnLineageSource,
  DwhColumnLineageTarget,
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

function procedureLabel(source: DwhColumnLineageSource) {
  const pkg = source.packageName?.trim()
  const proc = source.procedureName?.trim()
  if (pkg && proc) return `${pkg}.${proc}`
  return proc || pkg || 'Prosedür bilgisi yok'
}

function transformLabel(type?: string | null) {
  if (type === 'TURETILMIS') return 'Türetilmiş'
  if (type === 'DIREKT_KOPYA') return 'Direkt'
  return type || 'Bilinmiyor'
}

function fullColumnName(source: DwhColumnLineageSource) {
  const tableName = source.sourceTableName ?? 'Kaynak tablo yok'
  const columnName = source.sourceColumnName ?? 'Kolon yok'
  return `${tableName}.${columnName}`
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
    <div className={`dwh-col-flow-node is-${data.kind}${data.confidence === 'TAHMIN' ? ' is-estimated' : ''}`}>
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
): ColumnLineageGraph {
  if (!target) return { nodes: [], edges: [] }

  const steps = ancestry?.steps ?? []
  if (!target.targetColumnId || !steps.length) return buildDirectGraph(target)

  const levels = Array.from(new Set(steps.map((step) => step.level))).sort((a, b) => a - b)
  const maxLevel = Math.max(...levels)
  const columnIds = new Set<number>([target.targetColumnId])
  steps.forEach((step) => columnIds.add(step.sourceColumnId))
  const targetId = nodeIdForColumn(target.targetColumnId)
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

function buildDirectGraph(target: DwhColumnLineageTarget): ColumnLineageGraph {
  const shownSources = target.sources
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

function SourceBadges({ source }: { source: DwhColumnLineageSource }) {
  return (
    <span className="dwh-col-source-badges">
      <span className={`dwh-transform-badge${source.transformationType === 'TURETILMIS' ? ' is-derived' : ' is-direct'}`}>
        {transformLabel(source.transformationType)}
      </span>
      {source.confidence ? (
        <span className={`dwh-confidence-badge ${source.confidence === 'TAHMIN' ? 'is-estimated' : 'is-exact'}`}>
          {source.confidence}
        </span>
      ) : null}
    </span>
  )
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

function AncestryTable({
  target,
  ancestry,
  loading,
  error,
}: {
  target?: DwhColumnLineageTarget
  ancestry?: DwhColumnAncestryResponse
  loading: boolean
  error?: string
}) {
  if (!target) return <div className="dwh-detail-empty">Detay için bir kolon seçin.</div>

  return (
    <div className="dwh-col-ancestry-view">
      <section className="dwh-col-direct-section">
        <h4>Doğrudan Kaynaklar</h4>
        {target.sources.length ? (
          <div className="dwh-col-source-list">
            {target.sources.map((source, index) => (
              <article key={`${source.id}-${index}`} className="dwh-col-source-card">
                <div>
                  <strong title={fullColumnName(source)}>{fullColumnName(source)}</strong>
                  <small>{procedureLabel(source)}</small>
                </div>
                <SourceBadges source={source} />
              </article>
            ))}
          </div>
        ) : (
          <p className="dwh-empty-line">Bu kolon için kayıtlı kaynak bulunamadı.</p>
        )}
      </section>

      <section className="dwh-col-ancestry">
        <h4>Tam Soykütük</h4>
        {loading ? <p className="dwh-empty-line">Soykütük yükleniyor...</p> : null}
        {error ? <p className="dwh-empty-line">{error}</p> : null}
        {!target.targetColumnId ? (
          <p className="dwh-empty-line">Rapor kolonları için hedef kolon katalog id’si yok; doğrudan kaynaklar gösteriliyor.</p>
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
                  <tr key={step.id} className={step.original ? 'is-original' : undefined}>
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
    () => buildAncestryGraph(selectedTarget, ancestry),
    [ancestry, selectedTarget],
  )
  const entityName =
    lineage?.entityKind === 'report'
      ? lineage.report?.reportName
      : lineage?.table
        ? lineage.table.schemaName
          ? `${lineage.table.schemaName}.${lineage.table.tableName}`
          : lineage.table.tableName
        : undefined
  const lineageStepCount = ancestry?.steps.length ?? selectedTarget?.sources.length ?? 0

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
            <p>
              {selectedTarget?.sources.length ?? 0} doğrudan kaynak
              {ancestry?.steps.length ? ` · ${ancestry.steps.length} soykütük adımı` : ''}
            </p>
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
          <div className="dwh-col-flow-canvas">
            <ColumnLineageLegend />
            {ancestryLoading && selectedTarget?.targetColumnId ? (
              <div className="dwh-col-map-status">Tam soykütük haritası yükleniyor...</div>
            ) : null}
            {ancestryError ? <div className="dwh-col-map-status is-error">{ancestryError}</div> : null}
            <ReactFlow
              key={`${selectedKey ?? 'empty-column-lineage'}:${lineageStepCount}`}
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.28, duration: 250 }}
              minZoom={0.2}
              maxZoom={1.25}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(106,116,140,.25)" />
            </ReactFlow>
          </div>
        ) : (
          <AncestryTable
            target={selectedTarget}
            ancestry={ancestry}
            loading={ancestryLoading}
            error={ancestryError}
          />
        )}
      </section>
    </div>
  )
}
