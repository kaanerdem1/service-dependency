import { memo, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  type Edge,
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

function edgeStyle(step: Pick<DwhColumnAncestryStep, 'transformationType' | 'confidence'>) {
  const derived = step.transformationType === 'TURETILMIS'
  return {
    color: derived ? '#9a6a16' : '#2f6f55',
    dash: step.confidence === 'TAHMIN' ? '7 5' : undefined,
  }
}

function buildAncestryGraph(
  target: DwhColumnLineageTarget | undefined,
  ancestry: DwhColumnAncestryResponse | undefined,
): { nodes: Node<ColumnNodeData>[]; edges: Edge[] } {
  if (!target) return { nodes: [], edges: [] }

  const steps = ancestry?.steps ?? []
  if (!target.targetColumnId || !steps.length) return buildDirectGraph(target)

  const levels = Array.from(new Set(steps.map((step) => step.level))).sort((a, b) => a - b)
  const columnIds = new Set<number>([target.targetColumnId])
  steps.forEach((step) => columnIds.add(step.sourceColumnId))

  const nodes: Node<ColumnNodeData>[] = [
    {
      id: nodeIdForColumn(target.targetColumnId),
      type: 'columnLineageNode',
      position: { x: levels.length * 280 + 34, y: 110 },
      data: {
        label: target.targetColumnName,
        sub: ancestry.tableName,
        kind: 'target',
      },
      style: { width: 250 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    },
  ]

  levels.forEach((level) => {
    const levelSteps = steps.filter((step) => step.level === level)
    levelSteps.forEach((step, rowIndex) => {
      const id = nodeIdForColumn(step.sourceColumnId)
      if (nodes.some((node) => node.id === id)) return
      nodes.push({
        id,
        type: 'columnLineageNode',
        position: {
          x: (levels.length - level) * 280 + 34,
          y: 34 + rowIndex * 86 + level * 18,
        },
        data: {
          label: step.sourceColumnName,
          sub: step.sourceTableName,
          kind: step.original ? 'original' : 'source',
          confidence: step.confidence,
        },
        style: { width: 250 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      })
    })
  })

  const seenEdges = new Set<string>()
  const edges: Edge[] = []
  steps.forEach((step, index) => {
    if (!columnIds.has(step.downstreamColumnId)) return
    const source = nodeIdForColumn(step.sourceColumnId)
    const targetId = nodeIdForColumn(step.downstreamColumnId)
    const edgeKey = `${source}->${targetId}`
    if (seenEdges.has(edgeKey)) return
    seenEdges.add(edgeKey)
    const style = edgeStyle(step)
    edges.push({
      id: `${edgeKey}:${index}`,
      source,
      target: targetId,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: style.color,
      },
      label: transformLabel(step.transformationType),
      className: `dwh-col-flow-edge${step.transformationType === 'TURETILMIS' ? ' is-derived' : ' is-direct'}${step.confidence === 'TAHMIN' ? ' is-estimated' : ''}`,
      style: {
        stroke: style.color,
        strokeWidth: 2.2,
        strokeDasharray: style.dash,
      },
    })
  })

  return { nodes, edges }
}

function buildDirectGraph(target: DwhColumnLineageTarget): { nodes: Node<ColumnNodeData>[]; edges: Edge[] } {
  const shownSources = target.sources
  const rowGap = 74
  const graphHeight = Math.max(1, shownSources.length) * rowGap
  const targetY = Math.max(0, graphHeight / 2 - 36)
  const nodes: Node<ColumnNodeData>[] = [
    {
      id: 'target',
      type: 'columnLineageNode',
      position: { x: 560, y: targetY },
      data: {
        label: target.targetColumnName,
        sub: `${target.sources.length} kaynak kolon`,
        kind: 'target',
      },
      style: { width: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    },
  ]

  shownSources.forEach((source, index) => {
    nodes.push({
      id: `source:${index}`,
      type: 'columnLineageNode',
      position: { x: 34, y: index * rowGap },
      data: {
        label: source.sourceColumnName ?? 'Kolon yok',
        sub: source.sourceTableName ?? 'Kaynak tablo yok',
        kind: 'source',
        confidence: source.confidence,
      },
      style: { width: 290 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    })
  })

  const edges: Edge[] = shownSources.map((source, index) => {
    const style = edgeStyle({
      transformationType: source.transformationType,
      confidence: source.confidence,
    })
    return {
      id: `edge:${index}`,
      source: `source:${index}`,
      target: 'target',
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: style.color,
      },
      label: transformLabel(source.transformationType),
      className: `dwh-col-flow-edge${source.transformationType === 'TURETILMIS' ? ' is-derived' : ' is-direct'}${source.confidence === 'TAHMIN' ? ' is-estimated' : ''}`,
      style: {
        stroke: style.color,
        strokeWidth: 2.2,
        strokeDasharray: style.dash,
      },
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
            {ancestryLoading && selectedTarget?.targetColumnId ? (
              <div className="dwh-col-map-status">Tam soykütük haritası yükleniyor...</div>
            ) : null}
            {ancestryError ? <div className="dwh-col-map-status is-error">{ancestryError}</div> : null}
            <ReactFlow
              key={`${selectedKey ?? 'empty-column-lineage'}:${lineageStepCount}`}
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.22, duration: 250 }}
              minZoom={0.25}
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
