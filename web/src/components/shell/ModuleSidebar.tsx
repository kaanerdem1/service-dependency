/**
 * Sol “Modüller” kenar çubuğu — arama, ağaç, Favoriler / İş akışları drawer’ları.
 *
 * Ne yapar: Rail + geniş panel görünümünü, arama sonuç portalını ve iki
 *   drawer’ı (ShortcutsPanel, WorkflowsPanel) basar.
 * Ne yapmaz: Seçim / süreç açma iş kuralını yürütmez; tıklanınca App’ten
 *   gelen callback’leri çağırır.
 * İlgili: shell/rehber.md
 */
import { AnimatePresence } from 'motion/react'
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react'
import { CatalogHelp } from '../catalog/CatalogHelp'
import { ModuleTree } from '../sidebar/ModuleTree'
import { SearchHitContent } from '../search/SearchHitContent'
import { SearchHitsPortal } from '../search/SearchHitsPortal'
import { ShortcutsPanel } from '../sidebar/ShortcutsPanel'
import { SidebarHoverTip } from '../sidebar/SidebarHoverTip'
import { TreeKindIcon } from '../sidebar/TreeKindIcon'
import { TreeOptionsRadial } from '../sidebar/TreeOptionsRadial'
import { WorkflowsPanel } from '../workflows/WorkflowsPanel'
import { MorphHoverButton } from '../../motion/MorphHoverButton'
import { MotionListItem } from '../../motion/MotionList'
import { favoritesPanelShortcutLabel, workflowsPanelShortcutLabel } from '../../shortcuts/panelShortcuts'
import type { SelectPivotFn } from '../../navigation/useProcessFlowNav'
import type { AppTheme } from '../../theme'
import type { MethodRef, ModuleNode, Service } from '../../types'
import { SidebarFlowIcon, SidebarPinIcon, SidebarStarIcon } from './sidebarIcons'

type Props = {
  navExpanded: boolean
  navPinned: boolean
  allowNavCollapse: boolean
  onNavHoverChange: (hover: boolean) => void
  shortcutsOpen: boolean
  workflowsOpen: boolean
  onToggleShortcuts: () => void
  onToggleWorkflows: () => void
  onTogglePin: () => void
  onResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  searchRef: RefObject<HTMLLabelElement | null>
  query: string
  onQueryChange: (value: string) => void
  hits: Service[]
  methodHits: MethodRef[]
  appTheme: AppTheme
  onOpenCommandPalette: () => void
  onSelectServiceFromSearch: (id: string) => void
  onSelectMethod: (serviceId: string, methodId: string) => void
  tree: ModuleNode[]
  pivotId?: string
  pivotName?: string
  selectedMethodId?: string
  catalogNodeId?: string
  sidebarBodyRef: RefObject<HTMLDivElement | null>
  showNonServiceMethods: boolean
  onShowNonServiceMethodsChange: (value: boolean) => void
  treePinServiceId?: string
  onClearPin: () => void
  onSelectCatalogNode: (node: ModuleNode) => void
  onSelectServiceFromTree: (id: string) => void
  mapExpanded: boolean
  onCloseShortcuts: () => void
  onCloseWorkflows: () => void
  onOpenFolder: (id: string) => void
  onOpenProcess: (processNo: string) => void
  onOpenProcessRoute: (routeId: string) => void
  workflowInfoId?: string
  processFlowNo?: string
  processRouteId?: string
  canEditCatalog: boolean
  setTreePinServiceId: Dispatch<SetStateAction<string | undefined>>
  setQuery: Dispatch<SetStateAction<string>>
  selectPivot: SelectPivotFn
}

export function ModuleSidebar({
  navExpanded,
  navPinned,
  allowNavCollapse,
  onNavHoverChange,
  shortcutsOpen,
  workflowsOpen,
  onToggleShortcuts,
  onToggleWorkflows,
  onTogglePin,
  onResizePointerDown,
  searchRef,
  query,
  onQueryChange,
  hits,
  methodHits,
  appTheme,
  onOpenCommandPalette,
  onSelectServiceFromSearch,
  onSelectMethod,
  tree,
  pivotId,
  pivotName,
  selectedMethodId,
  catalogNodeId,
  sidebarBodyRef,
  showNonServiceMethods,
  onShowNonServiceMethodsChange,
  treePinServiceId,
  onClearPin,
  onSelectCatalogNode,
  onSelectServiceFromTree,
  mapExpanded,
  onCloseShortcuts,
  onCloseWorkflows,
  onOpenFolder,
  onOpenProcess,
  onOpenProcessRoute,
  workflowInfoId,
  processFlowNo,
  processRouteId,
  canEditCatalog,
  setTreePinServiceId,
  setQuery,
  selectPivot,
}: Props) {
  return (
    <aside
      className={`module-sidebar${navExpanded ? ' is-expanded' : ''}${navPinned ? ' is-pinned' : ''}`}
      data-motion="sidebar-overlay"
      data-expanded={navExpanded ? 'true' : 'false'}
      data-pinned={navPinned ? 'true' : 'false'}
      onMouseEnter={() => onNavHoverChange(true)}
      onMouseLeave={() => {
        if (allowNavCollapse && !navPinned) onNavHoverChange(false)
      }}
    >
      <div className="module-sidebar-rail" aria-hidden={navExpanded}>
        <span className="sidebar-rail-label">Modüller</span>
        <div className="sidebar-rail-kinds" aria-hidden>
          <TreeKindIcon kind="group" size={14} />
          <TreeKindIcon kind="package" size={14} />
          <TreeKindIcon kind="service" size={14} />
          <TreeKindIcon kind="method" size={14} />
        </div>
        <span className="sidebar-rail-hint">Paneli Aç</span>
        <div className="sidebar-rail-actions">
          <SidebarHoverTip label="Favoriler" sub={favoritesPanelShortcutLabel()} placement="rail">
            <MorphHoverButton
              type="button"
              className={`sidebar-star-btn sidebar-rail-action-btn${shortcutsOpen ? ' is-active' : ''}`}
              layoutId="sidebar-star-rail-hover"
              aria-label={shortcutsOpen ? 'Favoriler panelini kapat' : 'Favoriler panelini aç'}
              aria-expanded={shortcutsOpen}
              onClick={onToggleShortcuts}
            >
              <SidebarStarIcon active={shortcutsOpen} />
            </MorphHoverButton>
          </SidebarHoverTip>
          <SidebarHoverTip label="İş akışları" sub={workflowsPanelShortcutLabel()} placement="rail">
            <MorphHoverButton
              type="button"
              className={`sidebar-star-btn sidebar-flow-btn sidebar-rail-action-btn${workflowsOpen ? ' is-active' : ''}`}
              layoutId="sidebar-flow-rail-hover"
              aria-label={workflowsOpen ? 'İş akışları panelini kapat' : 'İş akışları panelini aç'}
              aria-expanded={workflowsOpen}
              onClick={onToggleWorkflows}
            >
              <SidebarFlowIcon active={workflowsOpen} />
            </MorphHoverButton>
          </SidebarHoverTip>
        </div>
      </div>
      <div className="module-sidebar-inner">
        <div className="module-sidebar-head">
          <h3>Modüller</h3>
          <div className="module-sidebar-head-actions">
            <MorphHoverButton
              type="button"
              className={`sidebar-pin-btn${navPinned ? ' is-pinned' : ''}`}
              layoutId="sidebar-pin-hover"
              title={
                navPinned
                  ? 'Sabitlemeyi bırak (fare dışına çıkınca panel kapanır)'
                  : 'Paneli sabitle (açık kalsın)'
              }
              aria-label={
                navPinned
                  ? 'Modül paneli sabitli — sabitlemeyi bırak'
                  : 'Modül panelini sabitle — açık kalsın'
              }
              aria-expanded={navExpanded}
              aria-pressed={navPinned}
              onClick={onTogglePin}
            >
              <SidebarPinIcon pinned={navPinned} />
            </MorphHoverButton>
            <SidebarHoverTip label="Favoriler" sub={favoritesPanelShortcutLabel()} placement="head">
              <MorphHoverButton
                type="button"
                className={`sidebar-star-btn${shortcutsOpen ? ' is-active' : ''}`}
                layoutId="sidebar-star-hover"
                aria-label={shortcutsOpen ? 'Favoriler panelini kapat' : 'Favoriler panelini aç'}
                aria-expanded={shortcutsOpen}
                onClick={onToggleShortcuts}
              >
                <SidebarStarIcon active={shortcutsOpen} />
              </MorphHoverButton>
            </SidebarHoverTip>
            <SidebarHoverTip label="İş akışları" sub={workflowsPanelShortcutLabel()} placement="head">
              <MorphHoverButton
                type="button"
                className={`sidebar-star-btn sidebar-flow-btn${workflowsOpen ? ' is-active' : ''}`}
                layoutId="sidebar-flow-hover"
                aria-label={workflowsOpen ? 'İş akışları panelini kapat' : 'İş akışları panelini aç'}
                aria-expanded={workflowsOpen}
                onClick={onToggleWorkflows}
              >
                <SidebarFlowIcon active={workflowsOpen} />
              </MorphHoverButton>
            </SidebarHoverTip>
          </div>
        </div>
        <label className="search" ref={searchRef}>
          <span className="sr-only">Servis veya metod ara</span>
          <svg className="search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
            <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          </svg>
          <input
            className={[query ? 'has-clear' : 'has-shortcut'].filter(Boolean).join(' ')}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Servis veya metod ara…"
          />
          {query ? (
            <button
              type="button"
              className="search-clear-btn"
              aria-label="Aramayı temizle"
              title="Aramayı temizle"
              onClick={() => onQueryChange('')}
            >
              ×
            </button>
          ) : (
            <button
              type="button"
              className="search-shortcut"
              aria-label="Komut paletini aç"
              title="Komut paleti (⌘K)"
              onClick={onOpenCommandPalette}
            >
              ⌘K
            </button>
          )}
          {query && (hits.length > 0 || methodHits.length > 0) && (
            <>
              <button
                type="button"
                className="search-backdrop"
                aria-label="Aramayı kapat"
                onClick={() => onQueryChange('')}
              />
              <SearchHitsPortal open theme={appTheme} anchorRef={searchRef}>
                <AnimatePresence initial={false}>
                  {hits.map((s, i) => (
                    <MotionListItem key={s.id} id={s.id} index={i}>
                      <button type="button" onClick={() => onSelectServiceFromSearch(s.id)}>
                        <SearchHitContent title={s.name} kind="service" metaId={s.id} tip={s.name} />
                      </button>
                    </MotionListItem>
                  ))}
                  {methodHits.map((m, i) => (
                    <MotionListItem key={m.id} id={m.id} index={hits.length + i}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectMethod(m.serviceId, m.id)
                          onQueryChange('')
                        }}
                      >
                        <SearchHitContent
                          title={`${m.className}.${m.name}`}
                          kind="method"
                          metaId={m.id}
                          subtitle={m.serviceName}
                          tip={`${m.className}.${m.name}`}
                        />
                      </button>
                    </MotionListItem>
                  ))}
                </AnimatePresence>
              </SearchHitsPortal>
            </>
          )}
        </label>
        <div className="module-kind-legend" aria-label="Ağaç türleri">
          <span className="module-kind-key">
            <TreeKindIcon kind="group" size={13} />
            Proje Grubu
          </span>
          <span className="module-kind-key">
            <TreeKindIcon kind="package" size={13} />
            Jar
          </span>
          <span className="module-kind-key">
            <TreeKindIcon kind="service" size={13} />
            Servis
          </span>
          <span className="module-kind-key">
            <TreeKindIcon kind="method" size={13} />
            Metod
          </span>
        </div>
        <div className="module-sidebar-body" ref={sidebarBodyRef} tabIndex={-1}>
          <ModuleTree
            nodes={tree}
            selectedServiceId={pivotId}
            selectedMethodId={selectedMethodId}
            selectedCatalogNodeId={catalogNodeId}
            scrollParentRef={sidebarBodyRef}
            showNonServiceMethods={showNonServiceMethods}
            pinServiceId={treePinServiceId}
            keyboardEnabled={!shortcutsOpen && !workflowsOpen}
            onClearPin={onClearPin}
            onSelectCatalogNode={onSelectCatalogNode}
            onSelectService={onSelectServiceFromTree}
            onSelectMethod={onSelectMethod}
          />
        </div>
        <div className="module-sidebar-foot">
          <CatalogHelp />
          <TreeOptionsRadial
            showNonServiceMethods={showNonServiceMethods}
            onShowNonServiceMethodsChange={onShowNonServiceMethodsChange}
          />
        </div>
        <ShortcutsPanel
          open={shortcutsOpen}
          pivotId={pivotId}
          pivotName={pivotName}
          navPinned={navPinned}
          mapExpanded={mapExpanded}
          onTogglePin={onTogglePin}
          onClose={onCloseShortcuts}
          onSelectService={(id) => {
            setTreePinServiceId(undefined)
            setQuery('')
            selectPivot(id, { resetHistory: true, source: 'tree' })
          }}
        />
        <WorkflowsPanel
          open={workflowsOpen}
          pivotId={pivotId}
          pivotName={pivotName}
          navPinned={navPinned}
          mapExpanded={mapExpanded}
          onTogglePin={onTogglePin}
          onClose={onCloseWorkflows}
          onSelectService={(id) => {
            setTreePinServiceId(undefined)
            setQuery('')
            selectPivot(id, { resetHistory: true, source: 'tree' })
          }}
          onOpenFolder={onOpenFolder}
          onOpenProcess={onOpenProcess}
          onOpenProcessRoute={onOpenProcessRoute}
          infoFolderId={workflowInfoId}
          processFlowNo={processFlowNo}
          activeRouteId={processRouteId}
          canEdit={canEditCatalog}
        />
      </div>
      <button
        type="button"
        className="module-sidebar-resize"
        aria-label="Modül panel genişliğini ayarla"
        title="Panel genişliğini ayarla"
        onPointerDown={onResizePointerDown}
      />
    </aside>
  )
}
