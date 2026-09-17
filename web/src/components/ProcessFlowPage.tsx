/**
 * Süreç sayfası — tam akış / rota orchestrator (Faz 3d).
 *
 * Ne yapar: Yükleme ve mod geçişini `useProcessFlowPage`’e bırakır; Map veya
 *   RouteBuilder’ı basar.
 * Ne yapmaz: Graf çizmez. Map `key` = `graph.no` (restore node id key’de yok).
 */
import { ProcessFlowMap } from './ProcessFlowMap'
import { ProcessFlowRouteBuilder } from './ProcessFlowRouteBuilder'
import { useProcessFlowPage, type ProcessFlowPageProps } from './useProcessFlowPage'

export function ProcessFlowPage(props: ProcessFlowPageProps) {
  const {
    graph,
    screens,
    error,
    routeMode,
    routeNonce,
    focusAfterRoute,
    savedRoute,
    canEditCatalog,
    onNodeDescriptionsChange,
    exitRoute,
    leaveRouteForNode,
    handleRouteSaved,
    restoreConsumed,
    createRoute,
  } = useProcessFlowPage(props)
  const {
    onDismiss,
    canGoBack,
    onBackToParent,
    initialSelectedNodeId,
    onOpenService,
    onOpenSubProcess,
  } = props

  return (
    <article className="pf-map-page">
      {!graph ? (
        <button type="button" className="pf-map-close" onClick={onDismiss}>
          Kapat
        </button>
      ) : null}
      {error ? <p className="pf-map-status">{error}</p> : null}
      {!error && !graph ? <p className="pf-map-status">Yükleniyor…</p> : null}
      {graph && routeMode ? (
        <ProcessFlowRouteBuilder
          key={`${graph.no}:route:${savedRoute?.id ?? 'new'}:${routeNonce}`}
          graph={graph}
          processScreens={screens}
          savedRoute={savedRoute}
          onExitRoute={exitRoute}
          onLeaveRouteForNode={leaveRouteForNode}
          onDismiss={onDismiss}
          onOpenService={onOpenService}
          onOpenSubProcess={onOpenSubProcess}
          onRouteSaved={handleRouteSaved}
          canEditCatalog={canEditCatalog}
          onNodeDescriptionsChange={onNodeDescriptionsChange}
        />
      ) : null}
      {graph && !routeMode ? (
        <ProcessFlowMap
          // Not: key'de `initialSelectedNodeId` KULLANILMAZ. `ProcessFlowMap`
          // seçili node'u prop değiştiğinde kendi içindeki effect ile
          // reaktif olarak günceller (bkz. ProcessFlowMap.tsx). Eskiden
          // burada nodeId de key'e giriyordu; bu, "servisten sürece geri
          // dön" akışında kendini bozan bir döngüye yol açıyordu: node
          // seçilip drawer açılıyor → effect bunu "tükettiğini" App'e
          // bildiriyor (`onRestoreConsumed`) → App `processFlowRestoreNodeId`'yi
          // temizliyor → bu prop key'i değiştirdiği için component ANINDA
          // yeniden mount oluyor, bu sefer seçili node olmadan → drawer
          // hemen kapanıyordu.
          key={graph.no}
          graph={graph}
          processScreens={screens}
          onDismiss={onDismiss}
          canGoBack={canGoBack}
          onBackToParent={onBackToParent}
          initialSelectedNodeId={focusAfterRoute ?? initialSelectedNodeId}
          onRestoreConsumed={restoreConsumed}
          onOpenService={onOpenService}
          onOpenSubProcess={onOpenSubProcess}
          onCreateRoute={createRoute}
          canEditCatalog={canEditCatalog}
          onNodeDescriptionsChange={onNodeDescriptionsChange}
        />
      ) : null}
    </article>
  )
}
