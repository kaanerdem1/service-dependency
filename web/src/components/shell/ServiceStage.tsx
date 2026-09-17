/**
 * Odak servis sahnesi — başlık, sekmeler, harita / tablo / katalog panelleri.
 *
 * Ne yapar: Bir servis seçiliyken orta alanı basar (StageTabs + harita + tablo
 *   + servis işlevi + ekranlar + process).
 * Ne yapmaz: Pivot/geçmiş state tutmaz; tüm aksiyonlar App’ten gelir.
 * İlgili: docs/refactor-plan.md — Faz 1 (kabuk JSX).
 */
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { FavoriteStarButton } from '../FavoriteStarButton'
import { ImpactMap } from '../ImpactMap'
import { MapStage } from '../MapStage'
import { MethodImpactMap } from '../MethodImpactMap'
import { RelationshipTable } from '../RelationshipTable'
import {
  ServiceProcessesStage,
  ServiceScreensStage,
} from '../ServiceCatalogPanels'
import { ServiceOverview } from '../ServiceOverview'
import { ServiceWorkflowChip } from '../ServiceWorkflowChip'
import { MapLoadingSkeleton, SkeletonShimmer } from '../../motion/SkeletonShimmer'
import { StageTabPanels } from '../../motion/StageTabPanels'
import { StageTabs, SERVICE_STAGE_TAB_ORDER, type StageTabDef, type StageTabId } from '../../motion/StageTabs'
import type { PackageOption, ProjectOption } from '../../impact/projectFilter'
import type { VisitEntry, VisitPathStep } from '../../navigation/useVisitHistory'
import type { SelectPivotFn } from '../../navigation/useProcessFlowNav'
import type { SessionUser } from '../../mock/session'
import type {
  AffectedService,
  ImpactGraph,
  MethodImpactGraph,
  Service,
  ServiceProcessLink,
  ServiceScreenLink,
  Snapshot,
  TrailAction,
  TrailEntry,
} from '../../types'
import { snapshotHasMapImage } from '../../snapshot/imageUrl'
import { StageVisitPath } from './StageVisitPath'

type TrailRecorder = {
  record: (action: TrailAction, target?: TrailEntry['target'], detail?: string) => void
}

type Props = {
  service?: Service
  pivotId?: string
  tab: StageTabId
  stageTabs: StageTabDef[]
  stageTopRef: RefObject<HTMLDivElement | null>
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string, name: string) => void
  onOpenWorkflowFolder: (folderId: string) => void
  onOpenWorkflowsRoot: () => void
  workflowResumeId?: string
  onReturnToWorkflow: () => void
  onClearSelection: () => void
  session?: SessionUser
  onOpenChangeRequest: () => void
  trail: TrailRecorder
  setTab: Dispatch<SetStateAction<StageTabId>>
  setMapExpanded: Dispatch<SetStateAction<boolean>>
  visitSteps: VisitPathStep[]
  historyIndex: number
  historyLength: number
  onSelectVisitIndex: (i: number) => void
  selectedMethodId?: string
  methodImpact?: MethodImpactGraph
  mapExpanded: boolean
  onSelectMethod: (serviceId: string, methodId: string) => void
  onClearMethod: () => void
  selectPivot: SelectPivotFn
  goBack: () => void
  goForward: () => void
  processFlowReturn?: unknown
  impact?: ImpactGraph
  mapForceLtrSignal: number
  impactProjectOptions: ProjectOption[]
  impactPackageOptions: PackageOption[]
  onBrowseMethods: (serviceId: string) => void
  onLeaveServiceSelection: () => void
  currentVisit?: VisitEntry
  onViewStateChange: (view: { visibleMaxHop: number; expandedLayers: number[] }) => void
  navDirection: 'back' | 'forward' | null
  onNavDirectionConsumed: () => void
  mapRootRef: RefObject<HTMLDivElement | null>
  onBeforeSnapshot: () => void
  onSnapshotToast: (message: string) => void
  loading: boolean
  affected: AffectedService[]
  callees: AffectedService[]
  tableProjectFilter?: string
  projectLabels: Map<string, string>
  packageLabels: Map<string, string>
  onClearProjectFilter: () => void
  setTableProjectFilter: Dispatch<SetStateAction<string | undefined>>
  screens: ServiceScreenLink[]
  processes: ServiceProcessLink[]
  catalogLinksLoading: boolean
  canEditCatalog: boolean
  onOpenProcessKeepService: (processNo: string) => void
}

export function ServiceStage({
  service,
  pivotId,
  tab,
  stageTabs,
  stageTopRef,
  isFavorite,
  onToggleFavorite,
  onOpenWorkflowFolder,
  onOpenWorkflowsRoot,
  workflowResumeId,
  onReturnToWorkflow,
  onClearSelection,
  session,
  onOpenChangeRequest,
  trail,
  setTab,
  setMapExpanded,
  visitSteps,
  historyIndex,
  historyLength,
  onSelectVisitIndex,
  selectedMethodId,
  methodImpact,
  mapExpanded,
  onSelectMethod,
  onClearMethod,
  selectPivot,
  goBack,
  goForward,
  processFlowReturn,
  impact,
  mapForceLtrSignal,
  impactProjectOptions,
  impactPackageOptions,
  onBrowseMethods,
  onLeaveServiceSelection,
  currentVisit,
  onViewStateChange,
  navDirection,
  onNavDirectionConsumed,
  mapRootRef,
  onBeforeSnapshot,
  onSnapshotToast,
  loading,
  affected,
  callees,
  tableProjectFilter,
  projectLabels,
  packageLabels,
  onClearProjectFilter,
  setTableProjectFilter,
  screens,
  processes,
  catalogLinksLoading,
  canEditCatalog,
  onOpenProcessKeepService,
}: Props) {
  return (
    <>
      <div ref={stageTopRef} className="stage-top">
        <div className="stage-head">
          <div className="main-heading-wrap">
            <span className="service-status-dot" aria-hidden />
            <div className="main-heading-title-row">
              <h1 className="main-heading" title={service?.name}>
                {service?.name}
              </h1>
              {pivotId && service ? (
                <>
                  <FavoriteStarButton
                    active={isFavorite(pivotId)}
                    className="fav-star-btn is-plain stage-heading-fav"
                    size={16}
                    onToggle={() => onToggleFavorite(pivotId, service.name)}
                  />
                  <ServiceWorkflowChip
                    serviceId={pivotId}
                    onOpenFlow={onOpenWorkflowFolder}
                    onOpenRoot={onOpenWorkflowsRoot}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="stage-actions">
            {workflowResumeId ? (
              <button type="button" className="btn ghost clear-sel" onClick={onReturnToWorkflow}>
                Geri
              </button>
            ) : (
              <button type="button" className="btn ghost clear-sel" onClick={onClearSelection}>
                Seçimi bırak
              </button>
            )}
            {session && service && (
              <button type="button" className="btn primary compact im-action" onClick={onOpenChangeRequest}>
                Değişiklik talebi
              </button>
            )}
          </div>
        </div>
        <StageTabs
          tab={tab}
          tabs={stageTabs}
          onSelect={(next) => {
            if (next === 'map') {
              trail.record('tab_change', undefined, 'Harita sekmesine geçildi')
              setTab('map')
              return
            }
            if (next === 'affected') {
              trail.record('tab_change', undefined, 'Tablo sekmesine geçildi')
              setMapExpanded(false)
              setTab('affected')
              return
            }
            if (next === 'screens') {
              trail.record('tab_change', undefined, 'Ekranlar sekmesine geçildi')
              setMapExpanded(false)
              setTab('screens')
              return
            }
            if (next === 'processes') {
              trail.record('tab_change', undefined, 'Process sekmesine geçildi')
              setMapExpanded(false)
              setTab('processes')
              return
            }
            trail.record('tab_change', undefined, 'Servis işlevi sekmesine geçildi')
            setMapExpanded(false)
            setTab('overview')
          }}
        />
        {tab === 'map' && (
          <StageVisitPath steps={visitSteps} currentIndex={historyIndex} onSelect={onSelectVisitIndex} />
        )}
      </div>

      <div className={`stage-body${tab === 'map' ? ' is-map-view' : ''}`}>
        <StageTabPanels tab={tab} tabOrder={SERVICE_STAGE_TAB_ORDER}>
          <section className="stage-panel stage-panel-map" aria-hidden={tab !== 'map'} aria-label="Harita">
            {selectedMethodId && methodImpact && (
              <MapStage
                title="Method haritası"
                expanded={mapExpanded}
                onExpandedChange={setMapExpanded}
                active={tab === 'map'}
              >
                <MethodImpactMap
                  key={`method-${selectedMethodId}`}
                  graph={methodImpact}
                  onSelectMethod={onSelectMethod}
                  onSelectService={(id) => {
                    onClearMethod()
                    if (id !== pivotId) selectPivot(id, { resetHistory: true })
                  }}
                  onClearMethod={onClearMethod}
                  onPivotBack={goBack}
                  onPivotForward={goForward}
                  canPivotBack={
                    historyIndex > 0 || Boolean(selectedMethodId) || Boolean(processFlowReturn)
                  }
                  canPivotForward={historyIndex >= 0 && historyIndex < historyLength - 1}
                />
              </MapStage>
            )}

            {!selectedMethodId && impact && (
              <MapStage
                title={service?.name ?? 'Harita'}
                expanded={mapExpanded}
                onExpandedChange={setMapExpanded}
                active={tab === 'map'}
              >
                <ImpactMap
                  graph={impact}
                  mapExpanded={mapExpanded}
                  forceLtrSignal={mapForceLtrSignal}
                  onOpenAffectedTab={(projectId) => {
                    trail.record(
                      'tab_change',
                      undefined,
                      projectId
                        ? 'Tablo sekmesine geçildi (proje filtresi)'
                        : 'Tablo sekmesine geçildi (hub banner)',
                    )
                    setTableProjectFilter(projectId)
                    setMapExpanded(false)
                    setTab('affected')
                  }}
                  projectOptions={impactProjectOptions}
                  packageOptions={impactPackageOptions}
                  onPivot={(id) => selectPivot(id, { source: 'map' })}
                  onSelectMethod={onSelectMethod}
                  onBrowseMethods={onBrowseMethods}
                  onClearCenter={onLeaveServiceSelection}
                  onPivotBack={goBack}
                  onPivotForward={goForward}
                  canPivotBack={historyIndex > 0 || Boolean(processFlowReturn)}
                  canPivotForward={historyIndex >= 0 && historyIndex < historyLength - 1}
                  restoredView={
                    currentVisit
                      ? {
                          visibleMaxHop: currentVisit.visibleMaxHop,
                          expandedLayers: currentVisit.expandedLayers,
                        }
                      : undefined
                  }
                  onViewStateChange={onViewStateChange}
                  navDirection={navDirection}
                  onNavDirectionConsumed={onNavDirectionConsumed}
                  sessionUserId={session?.id}
                  sessionUserName={session?.name}
                  onMapRoot={(el) => {
                    mapRootRef.current = el
                  }}
                  onBeforeSnapshot={onBeforeSnapshot}
                  onSnapshotSaved={(snap: Snapshot) => {
                    onSnapshotToast(
                      snapshotHasMapImage(snap)
                        ? `${snap.id} kaydedildi — PNG indirildi (İndirilenler)`
                        : `${snap.id} kaydedildi — harita görüntüsü alınamadı`,
                    )
                  }}
                />
              </MapStage>
            )}

            {selectedMethodId && !methodImpact && <MapLoadingSkeleton />}

            {loading && pivotId && !impact && !selectedMethodId && <MapLoadingSkeleton />}
          </section>

          <section
            className="stage-panel stage-panel-affected"
            aria-hidden={tab !== 'affected'}
            aria-label="Tablo"
          >
            <div className="relations-nav">
              <div className="list-scope-nav" role="group" aria-label="Gezinme geçmişi — Harita ile aynı">
                <button
                  type="button"
                  className="map-nav-btn"
                  onClick={goBack}
                  disabled={historyIndex <= 0 && !processFlowReturn}
                  title="Önceki servis (Harita ile aynı geçmiş)"
                >
                  ← Geri
                </button>
                <button
                  type="button"
                  className="map-nav-btn"
                  onClick={goForward}
                  disabled={historyIndex < 0 || historyIndex >= historyLength - 1}
                  title="Sonraki servis (Harita ile aynı geçmiş)"
                >
                  İleri →
                </button>
              </div>
            </div>
            {service ? (
              <RelationshipTable
                pivot={service}
                impact={impact}
                callers={affected}
                callees={callees}
                loading={loading}
                visibleMaxHop={currentVisit?.visibleMaxHop ?? 1}
                onVisibleMaxHopChange={(hop) =>
                  onViewStateChange({
                    visibleMaxHop: hop,
                    expandedLayers: currentVisit?.expandedLayers ?? [],
                  })
                }
                onPivot={(id) => selectPivot(id, { source: 'table' })}
                projectLabels={projectLabels}
                projectFilter={tableProjectFilter}
                projectFilterLabel={
                  tableProjectFilter
                    ? projectLabels.get(tableProjectFilter) ?? tableProjectFilter
                    : undefined
                }
                onClearProjectFilter={onClearProjectFilter}
              />
            ) : loading ? (
              <div className="rel-table-wrap" data-motion="rel-table-skeleton">
                <SkeletonShimmer lines={6} />
              </div>
            ) : null}
          </section>

          <section
            className="stage-panel stage-panel-overview"
            aria-hidden={tab !== 'overview'}
            aria-label="Servis işlevi"
          >
            {service && (
              <ServiceOverview
                service={service}
                projectLabel={
                  service.projectGroupLabel && service.projectLabel
                    ? `${service.projectGroupLabel} › ${service.projectLabel}`
                    : service.projectLabel ?? projectLabels.get(service.projectId)
                }
                packageLabel={service.packageLabel ?? packageLabels.get(service.packageId)}
                callerCount={affected.length}
                calleeCount={callees.length}
                loading={loading}
                canEdit={canEditCatalog}
              />
            )}
          </section>

          <section
            className="stage-panel stage-panel-catalog"
            aria-hidden={tab !== 'screens'}
            aria-label="Ekranlar"
          >
            <ServiceScreensStage screens={screens} loading={catalogLinksLoading} />
          </section>

          <section
            className="stage-panel stage-panel-catalog"
            aria-hidden={tab !== 'processes'}
            aria-label="Process"
          >
            <ServiceProcessesStage
              processes={processes}
              loading={catalogLinksLoading}
              onOpenProcess={onOpenProcessKeepService}
            />
          </section>
        </StageTabPanels>
      </div>
    </>
  )
}
