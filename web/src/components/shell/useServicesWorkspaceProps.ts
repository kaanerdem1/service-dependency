/**
 * `ServicesWorkspace` sidebar + stage prop’larını App state’inden türetir.
 *
 * Ne yapmaz: State tutmaz; yalnızca useMemo ile prop nesneleri üretir.
 */

import { useCallback, useMemo, type ComponentProps, type RefObject } from 'react'
import type { ModuleSidebar } from './ModuleSidebar'
import type { ServicesMainStage } from './ServicesMainStage'
import type { ServiceStage } from './ServiceStage'
import type { ProcessFlowPage } from '../process/ProcessFlowPage'
import type { SelectPivotFn } from '../../navigation/useProcessFlowNav'
import type { buildServiceStageTabs, StageTabId } from '../../motion/StageTabs'
import type { AppTheme } from '../../theme'
import type { SnapshotTrailContextValue } from '../../snapshot/trail'
import type { VisitPathStep } from '../../navigation/useVisitHistory'
import type {
  AffectedService,
  ImpactGraph,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Service,
} from '../../types'
import type { SessionUser } from '../../mock/session'

type CatalogNode = { id: string; kind: 'group' | 'package'; name: string }
type StageTabs = ReturnType<typeof buildServiceStageTabs>
type PfPageProps = ComponentProps<typeof ProcessFlowPage>
type ServiceStageProps = ComponentProps<typeof ServiceStage>

export type ServicesWorkspacePropsInput = {
  layout: {
    navExpanded: boolean
    navPinned: boolean
    allowNavCollapse: boolean
    onNavHoverChange: (hover: boolean) => void
    onTogglePin: () => void
    onResizePointerDown: ComponentProps<typeof ModuleSidebar>['onResizePointerDown']
  }
  drawers: {
    shortcutsOpen: boolean
    workflowsOpen: boolean
    setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>
    setWorkflowsOpen: React.Dispatch<React.SetStateAction<boolean>>
  }
  search: {
    searchRef: RefObject<HTMLLabelElement | null>
    query: string
    setQuery: React.Dispatch<React.SetStateAction<string>>
    hits: Service[]
    methodHits: MethodRef[]
    appTheme: AppTheme
    onOpenCommandPalette: () => void
  }
  tree: {
    tree: ModuleNode[]
    pivotId?: string
    pivotName?: string
    selectedMethodId?: string
    catalogNodeId?: string
    sidebarBodyRef: RefObject<HTMLDivElement | null>
    showNonServiceMethods: boolean
    setShowNonServiceMethods: React.Dispatch<React.SetStateAction<boolean>>
    treePinServiceId?: string
    setTreePinServiceId: React.Dispatch<React.SetStateAction<string | undefined>>
    mapExpanded: boolean
    canEditCatalog: boolean
  }
  nav: {
    selectPivot: SelectPivotFn
    selectMethod: (serviceId: string, methodId: string) => void
    selectCatalogNode: (node: ModuleNode) => void
    openWorkflowFolder: (id: string) => void
    openProcessFlow: (processNo: string, opts?: { keepService?: boolean }) => void
    openProcessRoute: (routeId: string) => void
  }
  workflow: {
    workflowInfoId?: string
    workflowResumeId?: string
    setWorkflowInfoId: React.Dispatch<React.SetStateAction<string | undefined>>
    setWorkflowResumeId: React.Dispatch<React.SetStateAction<string | undefined>>
    returnToWorkflow: () => void
  }
  processFlow: {
    processFlowNo?: string
    processRouteId?: string
    processFlowRestoreNodeId?: string
    processFlowStackLength: number
    setProcessRouteId: React.Dispatch<React.SetStateAction<string | undefined>>
    consumeRestoreNode: () => void
    openServiceFromProcessFlow: PfPageProps['onOpenService']
    openSubProcessFromFlow: PfPageProps['onOpenSubProcess']
    backToParentProcessFlow: () => void
    dismissProcessFlow: () => void
  }
  stage: {
    mainRef: RefObject<HTMLElement | null>
    tab: StageTabId
    isCatalogTab: boolean
    catalogNode: CatalogNode | null
    hasSelection: boolean
    hasServiceSelection: boolean
    clearSelection: () => void
    service?: Service
    stageTabs: StageTabs
    stageTopRef: RefObject<HTMLDivElement | null>
    isFavorite: ServiceStageProps['isFavorite']
    toggleFavorite: ServiceStageProps['onToggleFavorite']
    session?: SessionUser
    setCrOpen: React.Dispatch<React.SetStateAction<boolean>>
    trail: SnapshotTrailContextValue
    setTab: ServiceStageProps['setTab']
    setMapExpanded: ServiceStageProps['setMapExpanded']
    visitSteps: VisitPathStep[]
    historyIndex: number
    historyLength: number
    selectVisitIndex: ServiceStageProps['onSelectVisitIndex']
    methodImpact?: MethodImpactGraph
    processFlowReturn?: ServiceStageProps['processFlowReturn']
    impact?: ImpactGraph
    mapForceLtrSignal: number
    impactProjectOptions: ServiceStageProps['impactProjectOptions']
    impactPackageOptions: ServiceStageProps['impactPackageOptions']
    browseServiceMethods: ServiceStageProps['onBrowseMethods']
    leaveServiceSelection: () => void
    currentVisit: ServiceStageProps['currentVisit']
    saveMapViewState: ServiceStageProps['onViewStateChange']
    navDirection: ServiceStageProps['navDirection']
    setNavDirection: React.Dispatch<
      React.SetStateAction<ServiceStageProps['navDirection']>
    >
    mapRootRef: RefObject<HTMLDivElement | null>
    flushSnapshotChrome: () => void
    setSnapshotToast: React.Dispatch<React.SetStateAction<string | undefined>>
    loading: boolean
    affected: AffectedService[]
    callees: AffectedService[]
    tableProjectFilter?: string
    projectLabels: Map<string, string>
    packageLabels: Map<string, string>
    setTableProjectFilter: React.Dispatch<
      React.SetStateAction<string | undefined>
    >
    screens: ServiceStageProps['screens']
    processes: ServiceStageProps['processes']
    catalogLinksLoading: boolean
    goBack: () => void
    goForward: () => void
    clearMethodKeepService: () => void
  }
}

export function useServicesWorkspaceProps(
  input: ServicesWorkspacePropsInput,
): {
  sidebar: ComponentProps<typeof ModuleSidebar>
  stage: ComponentProps<typeof ServicesMainStage>
} {
  const { layout, drawers, search, tree, nav, workflow, processFlow, stage } =
    input

  const onToggleShortcuts = useCallback(() => {
    drawers.setWorkflowsOpen(false)
    drawers.setShortcutsOpen((v) => !v)
  }, [drawers.setShortcutsOpen, drawers.setWorkflowsOpen])

  const onToggleWorkflows = useCallback(() => {
    drawers.setShortcutsOpen(false)
    drawers.setWorkflowsOpen((v) => !v)
  }, [drawers.setShortcutsOpen, drawers.setWorkflowsOpen])

  const sidebar = useMemo((): ComponentProps<typeof ModuleSidebar> => {
    return {
      navExpanded: layout.navExpanded,
      navPinned: layout.navPinned,
      allowNavCollapse: layout.allowNavCollapse,
      onNavHoverChange: layout.onNavHoverChange,
      shortcutsOpen: drawers.shortcutsOpen,
      workflowsOpen: drawers.workflowsOpen,
      onToggleShortcuts,
      onToggleWorkflows,
      onTogglePin: layout.onTogglePin,
      onResizePointerDown: layout.onResizePointerDown,
      searchRef: search.searchRef,
      query: search.query,
      onQueryChange: search.setQuery,
      hits: search.hits,
      methodHits: search.methodHits,
      appTheme: search.appTheme,
      onOpenCommandPalette: search.onOpenCommandPalette,
      onSelectServiceFromSearch: (id) => {
        nav.selectPivot(id, { resetHistory: true, source: 'search' })
        search.setQuery('')
      },
      onSelectMethod: nav.selectMethod,
      tree: tree.tree,
      pivotId: tree.pivotId,
      pivotName: tree.pivotName,
      selectedMethodId: tree.selectedMethodId,
      catalogNodeId: tree.catalogNodeId,
      sidebarBodyRef: tree.sidebarBodyRef,
      showNonServiceMethods: tree.showNonServiceMethods,
      onShowNonServiceMethodsChange: tree.setShowNonServiceMethods,
      treePinServiceId: tree.treePinServiceId,
      onClearPin: () => tree.setTreePinServiceId(undefined),
      onSelectCatalogNode: nav.selectCatalogNode,
      onSelectServiceFromTree: (id) =>
        nav.selectPivot(id, { resetHistory: true, source: 'tree' }),
      mapExpanded: tree.mapExpanded,
      onCloseShortcuts: () => drawers.setShortcutsOpen(false),
      onCloseWorkflows: () => drawers.setWorkflowsOpen(false),
      onOpenFolder: nav.openWorkflowFolder,
      onOpenProcess: (no) => nav.openProcessFlow(no),
      onOpenProcessRoute: nav.openProcessRoute,
      workflowInfoId: workflow.workflowInfoId,
      processFlowNo: processFlow.processFlowNo,
      processRouteId: processFlow.processRouteId,
      canEditCatalog: tree.canEditCatalog,
      setTreePinServiceId: tree.setTreePinServiceId,
      setQuery: search.setQuery,
      selectPivot: nav.selectPivot,
    }
  }, [
    layout,
    drawers.shortcutsOpen,
    drawers.workflowsOpen,
    drawers.setShortcutsOpen,
    drawers.setWorkflowsOpen,
    onToggleShortcuts,
    onToggleWorkflows,
    search,
    tree,
    nav,
    workflow.workflowInfoId,
    processFlow.processFlowNo,
    processFlow.processRouteId,
  ])

  const stageProps = useMemo((): ComponentProps<typeof ServicesMainStage> => {
    const processFlowStage = processFlow.processFlowNo
      ? {
          processNo: processFlow.processFlowNo,
          routeId: processFlow.processRouteId,
          restoreNodeId: processFlow.processFlowRestoreNodeId,
          stackDepth: processFlow.processFlowStackLength,
          onRouteSaved: processFlow.setProcessRouteId,
          onRestoreConsumed: processFlow.consumeRestoreNode,
          onOpenService: processFlow.openServiceFromProcessFlow,
          onOpenSubProcess: processFlow.openSubProcessFromFlow,
          onBackToParent: processFlow.backToParentProcessFlow,
          onDismiss: processFlow.dismissProcessFlow,
        }
      : null

    const serviceStage = stage.hasServiceSelection
      ? {
          service: stage.service,
          pivotId: tree.pivotId,
          tab: stage.tab,
          stageTabs: stage.stageTabs,
          stageTopRef: stage.stageTopRef,
          isFavorite: stage.isFavorite,
          onToggleFavorite: stage.toggleFavorite,
          onOpenWorkflowFolder: (folderId: string) => {
            drawers.setShortcutsOpen(false)
            drawers.setWorkflowsOpen(false)
            nav.openWorkflowFolder(folderId)
          },
          onOpenWorkflowsRoot: () => {
            drawers.setShortcutsOpen(false)
            workflow.setWorkflowInfoId(undefined)
            drawers.setWorkflowsOpen(true)
          },
          workflowResumeId: workflow.workflowResumeId,
          onReturnToWorkflow: workflow.returnToWorkflow,
          onClearSelection: stage.clearSelection,
          session: stage.session,
          onOpenChangeRequest: () => stage.setCrOpen(true),
          trail: stage.trail,
          setTab: stage.setTab,
          setMapExpanded: stage.setMapExpanded,
          visitSteps: stage.visitSteps,
          historyIndex: stage.historyIndex,
          historyLength: stage.historyLength,
          onSelectVisitIndex: stage.selectVisitIndex,
          selectedMethodId: tree.selectedMethodId,
          methodImpact: stage.methodImpact,
          mapExpanded: tree.mapExpanded,
          onSelectMethod: nav.selectMethod,
          onClearMethod: stage.clearMethodKeepService,
          selectPivot: nav.selectPivot,
          goBack: stage.goBack,
          goForward: stage.goForward,
          processFlowReturn: stage.processFlowReturn,
          impact: stage.impact,
          mapForceLtrSignal: stage.mapForceLtrSignal,
          impactProjectOptions: stage.impactProjectOptions,
          impactPackageOptions: stage.impactPackageOptions,
          onBrowseMethods: stage.browseServiceMethods,
          onLeaveServiceSelection: stage.leaveServiceSelection,
          currentVisit: stage.currentVisit,
          onViewStateChange: stage.saveMapViewState,
          navDirection: stage.navDirection,
          onNavDirectionConsumed: () => stage.setNavDirection(null),
          mapRootRef: stage.mapRootRef,
          onBeforeSnapshot: stage.flushSnapshotChrome,
          onSnapshotToast: stage.setSnapshotToast,
          loading: stage.loading,
          affected: stage.affected,
          callees: stage.callees,
          tableProjectFilter: stage.tableProjectFilter,
          projectLabels: stage.projectLabels,
          packageLabels: stage.packageLabels,
          onClearProjectFilter: () => stage.setTableProjectFilter(undefined),
          setTableProjectFilter: stage.setTableProjectFilter,
          screens: stage.screens,
          processes: stage.processes,
          catalogLinksLoading: stage.catalogLinksLoading,
          canEditCatalog: tree.canEditCatalog,
          onOpenProcessKeepService: (no: string) =>
            nav.openProcessFlow(no, { keepService: true }),
        }
      : null

    return {
      mainRef: stage.mainRef,
      hasSelection: stage.hasSelection,
      hasServiceSelection: stage.hasServiceSelection,
      tab: stage.tab,
      pivotId: tree.pivotId,
      isCatalogTab: stage.isCatalogTab,
      catalogNode: stage.catalogNode,
      workflowInfoId: workflow.workflowInfoId,
      processFlow: processFlowStage,
      canEditCatalog: tree.canEditCatalog,
      selectPivot: nav.selectPivot,
      selectCatalogNode: nav.selectCatalogNode,
      clearSelection: stage.clearSelection,
      openWorkflowFolder: nav.openWorkflowFolder,
      onWorkflowSelectService: (id: string) => {
        workflow.setWorkflowResumeId(workflow.workflowInfoId)
        tree.setTreePinServiceId(undefined)
        search.setQuery('')
        nav.selectPivot(id, { resetHistory: true, source: 'workflow' })
      },
      onDismissWorkflow: () => workflow.setWorkflowInfoId(undefined),
      serviceStage,
    }
  }, [
    processFlow,
    stage,
    tree,
    nav,
    workflow,
    drawers.setShortcutsOpen,
    drawers.setWorkflowsOpen,
    search.setQuery,
  ])

  return { sidebar, stage: stageProps }
}
