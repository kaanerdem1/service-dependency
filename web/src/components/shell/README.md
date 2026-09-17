/**
 * Uygulama kabuğu parçaları — `App.tsx` JSX’inin sunum katmanı.
 *
 * State: `App.tsx` + `navigation/*` (`useNavDrawers`, `useVisitHistory`,
 *   `useProcessFlowNav`, `useServiceSelection`, `useServiceStageData`).
 * Bu klasör yalnızca layout’u render eder.
 *
 * | Dosya | Ne gösterir |
 * |-------|-------------|
 * | `sidebarIcons.tsx` | Favoriler / iş akışı / pin / inbox ikonları |
 * | `ModuleSidebar.tsx` | Sol modül paneli + arama + drawer’lar |
 * | `StageVisitPath.tsx` | Harita üstü ziyaret yolu |
 * | `ServiceStage.tsx` | Seçili servisin sekmeli sahnesi |
 * | `ServicesMainStage.tsx` | Orta sahne dallanması (süreç / klasör / servis) |
 * | `ServicesWorkspace.tsx` | Sidebar + workspace sütunu |
 * | `useServicesWorkspaceProps.ts` | Workspace sidebar/stage prop üretimi |
 * | `useAppShellOverlaysProps.ts` | Overlay prop üretimi |
 *
 * İlgili: [rehber.md](./rehber.md), docs/refactor-plan.md — Faz 1.
 */
