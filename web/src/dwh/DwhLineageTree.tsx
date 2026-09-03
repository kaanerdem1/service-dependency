import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TreeAccordion } from '../motion/TreeAccordion'
import {
  getDwhReportTreeChildren,
  getDwhSubqueryChildren,
  getDwhTableTreeChildren,
} from './api'
import type { DwhReport, DwhTable, DwhTreeNode } from './types'

type Root =
  | { kind: 'table'; table: DwhTable }
  | { kind: 'report'; report: DwhReport }

type TreeNodeState = DwhTreeNode & {
  nodeId: string
  children?: TreeNodeState[]
  loaded?: boolean
  loading?: boolean
  open?: boolean
  cycle?: boolean
  pathTableIds: number[]
}

type Props = {
  root?: Root
  simple: boolean
  selectedTableId?: number
  selectedReportId?: number
  onSelectTable: (tableId: number) => void
  onSelectReport: (reportId: number) => void
}

const KIND_INITIAL: Record<DwhTreeNode['kind'] | 'cycle', string> = {
  table: 'T',
  report: 'R',
  subquery: 'Q',
  empty: '-',
  cycle: '!',
}

const KIND_ICON_SRC: Partial<Record<DwhTreeNode['kind'], string>> = {
  table: new URL('../assets/table.png', import.meta.url).href,
  report: new URL('../assets/file.png', import.meta.url).href,
  subquery: new URL('../assets/sql-server.png', import.meta.url).href,
}

function tableFullName(table: Pick<DwhTable, 'schemaName' | 'tableName'>) {
  return table.schemaName ? `${table.schemaName}.${table.tableName}` : table.tableName
}

function rootToNode(root: Root): TreeNodeState {
  if (root.kind === 'report') {
    return {
      kind: 'report',
      nodeId: `report:${root.report.reportId}`,
      label: root.report.reportName,
      reportId: root.report.reportId,
      hasChildren: root.report.sourceCount > 0,
      open: true,
      pathTableIds: [],
    }
  }
  return {
    kind: 'table',
    nodeId: `table:${root.table.tableId}`,
    label: tableFullName(root.table),
    tableId: root.table.tableId,
    schemaName: root.table.schemaName,
    tableName: root.table.tableName,
    layer: root.table.layer,
    hasChildren: root.table.sourceCount > 0,
    open: true,
    pathTableIds: [root.table.tableId],
  }
}

function mapChildren(parent: TreeNodeState, children: DwhTreeNode[]): TreeNodeState[] {
  return children.map((child, index) => {
    const tableId = child.tableId
    const cycle = child.kind === 'table' && tableId !== undefined && parent.pathTableIds.includes(tableId)
    const pathTableIds =
      child.kind === 'table' && tableId !== undefined && !cycle
        ? [...parent.pathTableIds, tableId]
        : parent.pathTableIds
    return {
      ...child,
      nodeId: `${parent.nodeId}/${child.kind}:${child.tableId ?? child.reportId ?? child.subqueryId ?? index}:${index}`,
      pathTableIds,
      hasChildren: cycle ? false : child.hasChildren,
      cycle,
    }
  })
}

function updateNode(
  node: TreeNodeState,
  nodeId: string,
  updater: (node: TreeNodeState) => TreeNodeState,
): TreeNodeState {
  if (node.nodeId === nodeId) return updater(node)
  if (!node.children) return node
  return {
    ...node,
    children: node.children.map((child) => updateNode(child, nodeId, updater)),
  }
}

function nodeKindLabel(node: TreeNodeState) {
  if (node.cycle) return 'Döngü'
  if (node.kind === 'table') return node.layer ?? 'Tablo'
  if (node.kind === 'report') return 'Rapor'
  if (node.kind === 'subquery') return node.alias ? `${node.label} · ${node.alias}` : node.label
  return node.label
}

function TreeItem({
  node,
  depth,
  selectedTableId,
  selectedReportId,
  onSelectTable,
  onSelectReport,
  onToggle,
}: {
  node: TreeNodeState
  depth: number
  selectedTableId?: number
  selectedReportId?: number
  onSelectTable: (tableId: number) => void
  onSelectReport: (reportId: number) => void
  onToggle: (node: TreeNodeState) => void
}) {
  const selected =
    (node.kind === 'table' && node.tableId === selectedTableId) ||
    (node.kind === 'report' && node.reportId === selectedReportId)
  const expandable = node.hasChildren && !node.cycle && node.kind !== 'empty'
  const kind = node.cycle ? 'cycle' : node.kind
  const rowRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!selected) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="dwh-tree-item">
      <div
        ref={rowRef}
        className={`dwh-tree-row dwh-kind-${kind}${selected ? ' selected' : ''}${node.cycle ? ' is-cycle' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {expandable ? (
          <button
            type="button"
            className="dwh-chev-btn"
            aria-label={node.open ? 'Kapat' : 'Aç'}
            aria-expanded={node.open}
            onClick={() => onToggle(node)}
          >
            {node.loading ? '…' : node.open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="dwh-chev-spacer" />
        )}
        <span className={`dwh-tree-kind is-dwh-${kind}`} title={nodeKindLabel(node)}>
          {node.kind !== 'empty' && !node.cycle && KIND_ICON_SRC[node.kind] ? (
            <img src={KIND_ICON_SRC[node.kind]} alt="" aria-hidden />
          ) : (
            KIND_INITIAL[kind]
          )}
        </span>
        <button
          type="button"
          className="dwh-tree-label-btn"
          disabled={node.kind === 'empty'}
          onClick={() => {
            if (node.kind === 'table' && node.tableId) onSelectTable(node.tableId)
            if (node.kind === 'report' && node.reportId) onSelectReport(node.reportId)
          }}
        >
          <span className="dwh-tree-label" title={node.label}>
            {node.label}
          </span>
        </button>
      </div>
      <TreeAccordion open={Boolean(node.open && node.children?.length)}>
        <div className="dwh-tree-children">
          {node.children?.map((child) => (
            <TreeItem
              key={child.nodeId}
              node={child}
              depth={depth + 1}
              selectedTableId={selectedTableId}
              selectedReportId={selectedReportId}
              onSelectTable={onSelectTable}
              onSelectReport={onSelectReport}
              onToggle={onToggle}
            />
          ))}
        </div>
      </TreeAccordion>
    </div>
  )
}

export function DwhLineageTree({
  root,
  simple,
  selectedTableId,
  selectedReportId,
  onSelectTable,
  onSelectReport,
}: Props) {
  const rootKey = root
    ? root.kind === 'table'
      ? `table:${root.table.tableId}`
      : `report:${root.report.reportId}`
    : ''
  const initialRoot = useMemo(() => (root ? rootToNode(root) : undefined), [rootKey])
  const [treeRoot, setTreeRoot] = useState<TreeNodeState | undefined>(initialRoot)

  useEffect(() => {
    setTreeRoot(initialRoot)
  }, [initialRoot, simple])

  const loadChildren = useCallback(
    async (node: TreeNodeState) => {
      if (!node.hasChildren || node.cycle || node.kind === 'empty') return
      setTreeRoot((current) =>
        current
          ? updateNode(current, node.nodeId, (n) => ({
              ...n,
              loading: true,
              open: true,
            }))
          : current,
      )
      try {
        const response =
          node.kind === 'table' && node.tableId
            ? await getDwhTableTreeChildren(node.tableId, simple)
            : node.kind === 'report' && node.reportId
              ? await getDwhReportTreeChildren(node.reportId)
              : node.kind === 'subquery' && node.subqueryId
                ? await getDwhSubqueryChildren(node.subqueryId)
                : { children: [] }
        setTreeRoot((current) =>
          current
            ? updateNode(current, node.nodeId, (n) => ({
                ...n,
                children: mapChildren(n, response.children),
                loaded: true,
                loading: false,
                open: true,
              }))
            : current,
        )
      } catch {
        setTreeRoot((current) =>
          current
            ? updateNode(current, node.nodeId, (n) => ({
                ...n,
                children: [
                  {
                    kind: 'empty',
                    nodeId: `${n.nodeId}/error`,
                    label: 'çocuklar yüklenemedi',
                    hasChildren: false,
                    pathTableIds: n.pathTableIds,
                  },
                ],
                loaded: true,
                loading: false,
                open: true,
              }))
            : current,
        )
      }
    },
    [simple],
  )

  useEffect(() => {
    if (!treeRoot || treeRoot.loaded || treeRoot.loading) return
    void loadChildren(treeRoot)
  }, [treeRoot, loadChildren])

  const toggle = useCallback(
    (node: TreeNodeState) => {
      if (!node.loaded) {
        void loadChildren(node)
        return
      }
      setTreeRoot((current) =>
        current
          ? updateNode(current, node.nodeId, (n) => ({
              ...n,
              open: !n.open,
            }))
          : current,
      )
    },
    [loadChildren],
  )

  if (!treeRoot) return <p className="dwh-empty-line">Aramadan tablo veya rapor seçin.</p>

  return (
    <nav className="dwh-module-tree dwh-tree" aria-label="DWH lineage ağacı">
      <TreeItem
        node={treeRoot}
        depth={0}
        selectedTableId={selectedTableId}
        selectedReportId={selectedReportId}
        onSelectTable={onSelectTable}
        onSelectReport={onSelectReport}
        onToggle={toggle}
      />
    </nav>
  )
}
