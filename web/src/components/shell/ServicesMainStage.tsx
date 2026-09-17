/**
 * Servis yüzeyi orta sahne — süreç / klasör / katalog / servis dallanması.
 *
 * Ne yapar: `main` sınıfını ve Welcome → ProcessFlow → Workflow → Katalog →
 *   ServiceStage sırasını basar.
 * Ne yapmaz: State tutmaz; callback’ler App / navigation hook’larından gelir.
 */
import type { ComponentProps, RefObject } from 'react'
import { WelcomeScreen } from '../welcome/WelcomeScreen'
import { ProcessFlowPage } from '../process/ProcessFlowPage'
import { WorkflowInfoPage } from '../workflow-stage/WorkflowInfoPage'
import { CatalogEntityOverview } from '../catalog/CatalogEntityOverview'
import { ServiceStage } from './ServiceStage'
import type { SelectPivotFn } from '../../navigation/useProcessFlowNav'
import type { StageTabId } from '../../motion/StageTabs'

type CatalogNode = { id: string; kind: 'group' | 'package'; name: string }

type ProcessFlowStageProps = {
  processNo: string
  routeId?: string
  restoreNodeId?: string
  stackDepth: number
  onRouteSaved: (routeId?: string) => void
  onRestoreConsumed: () => void
  onOpenService: ComponentProps<typeof ProcessFlowPage>['onOpenService']
  onOpenSubProcess: ComponentProps<typeof ProcessFlowPage>['onOpenSubProcess']
  onBackToParent: () => void
  onDismiss: () => void
}

type Props = {
  mainRef: RefObject<HTMLElement | null>
  hasSelection: boolean
  hasServiceSelection: boolean
  tab: StageTabId
  pivotId?: string
  isCatalogTab: boolean
  catalogNode: CatalogNode | null
  workflowInfoId?: string
  processFlow: ProcessFlowStageProps | null
  canEditCatalog: boolean
  selectPivot: SelectPivotFn
  selectCatalogNode: (node: CatalogNode) => void
  clearSelection: () => void
  openWorkflowFolder: (id: string) => void
  onWorkflowSelectService: (serviceId: string) => void
  onDismissWorkflow: () => void
  serviceStage: ComponentProps<typeof ServiceStage> | null
}

export function ServicesMainStage({
  mainRef,
  hasSelection,
  hasServiceSelection,
  tab,
  pivotId,
  isCatalogTab,
  catalogNode,
  workflowInfoId,
  processFlow,
  canEditCatalog,
  selectPivot,
  selectCatalogNode,
  clearSelection,
  openWorkflowFolder,
  onWorkflowSelectService,
  onDismissWorkflow,
  serviceStage,
}: Props) {
  const mainClassName = [
    'main',
    hasServiceSelection && tab === 'map' ? ' main-map' : '',
    hasServiceSelection && isCatalogTab ? ' main-overview' : '',
    catalogNode && !pivotId ? ' main-catalog-entity' : '',
    workflowInfoId && !processFlow ? ' main-catalog-entity main-overview' : '',
    processFlow ? ' main-process-flow' : '',
    !hasSelection ? ' is-empty' : '',
  ].join('')

  return (
    <main className={mainClassName} ref={mainRef}>
      {!hasSelection ? <WelcomeScreen /> : null}

      {processFlow ? (
        <div className="stage-body pf-map-stage">
          <ProcessFlowPage
            processNo={processFlow.processNo}
            routeId={processFlow.routeId}
            onRouteSaved={processFlow.onRouteSaved}
            initialSelectedNodeId={processFlow.restoreNodeId}
            onRestoreConsumed={processFlow.onRestoreConsumed}
            onOpenService={processFlow.onOpenService}
            onOpenSubProcess={processFlow.onOpenSubProcess}
            canGoBack={processFlow.stackDepth > 0}
            onBackToParent={processFlow.onBackToParent}
            onDismiss={processFlow.onDismiss}
          />
        </div>
      ) : null}

      {workflowInfoId && !processFlow ? (
        <div className="stage-body wf-info-stage">
          <WorkflowInfoPage
            folderId={workflowInfoId}
            onOpenFolder={openWorkflowFolder}
            onSelectService={onWorkflowSelectService}
            onDismiss={onDismissWorkflow}
            canEdit={canEditCatalog}
          />
        </div>
      ) : null}

      {catalogNode && !pivotId && !workflowInfoId && !processFlow ? (
        <div className="stage-body">
          <CatalogEntityOverview
            nodeId={catalogNode.id}
            kind={catalogNode.kind}
            onSelectGroup={(id, name) => selectCatalogNode({ id, kind: 'group', name })}
            onSelectJar={(id, name) => selectCatalogNode({ id, kind: 'package', name })}
            onSelectService={(id) => selectPivot(id, { resetHistory: true, source: 'tree' })}
            onDismiss={clearSelection}
          />
        </div>
      ) : null}

      {hasServiceSelection && serviceStage ? <ServiceStage {...serviceStage} /> : null}
    </main>
  )
}
