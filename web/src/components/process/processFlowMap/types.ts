import type {
  ProcessDecisionInfo,
  ProcessFlowNodeKind,
  ProcessNodeDetails,
} from '../../../types'

export type ProcessNodeData = {
  label: string
  kind: ProcessFlowNodeKind
  services: string[]
  subProcessNo?: string
  decisionInfo?: ProcessDecisionInfo
  details?: ProcessNodeDetails
}

export type RouteKind = 'direct' | 'jump' | 'back'

export type ProcessEdgeData = {
  originalId?: string
  labels?: string[]
  route?: RouteKind
  lane?: number
  railY?: number
  /** Aynı kaynaktan (jump) veya aynı hedefe (back) birden fazla ok varsa,
   * her birinin ray içindeki sırası — çıkışta hemen ayrışsınlar diye
   * kancanın yatay uzunluğu bu değere göre kademelenir (bkz. kitEdgePath). */
  slot?: number
  bandMinY?: number
  bandMaxY?: number
  active?: boolean
  dim?: boolean
  transitionServices?: string[]
}

export type PathHighlight = {
  nodeIds: Set<string>
  edgeIds: Set<string>
  orderedIds: string[]
}

export type ProcessFlowMapProps = {
  graph: import('../../../types').ProcessFlowGraph
  processScreens?: import('../../../types').ServiceScreenLink[]
  onDismiss?: () => void
  canGoBack?: boolean
  onBackToParent?: () => void
  initialSelectedNodeId?: string
  onRestoreConsumed?: () => void
  onOpenService?: (serviceName: string, nodeId: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string, nodeId: string) => void
  onCreateRoute?: () => void
  canEditCatalog?: boolean
  onNodeDescriptionsChange?: (doc: import('../../../types').ProcessNodeDescriptionsDoc) => void
}
