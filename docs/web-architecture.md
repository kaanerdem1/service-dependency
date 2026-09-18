# Web uygulaması — mimari özet

**UI giriş:** [web/src/components/rehber.md](../web/src/components/rehber.md)  
**Tüm** `web/src`**:** [web/src/rehber.md](../web/src/rehber.md)  
**Klasör düzeni:** [web-module-layout.md](./web-module-layout.md)

## Yüzeyler


| Yüzey           | Bileşen                                                                                               | Not                                       |
| --------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Servis kataloğu | `web/src/App.tsx` (ince) + `app/useServiceCatalogShell.ts` → `components/shell/ServicesWorkspace.tsx` | Sol ağaç + orta sahne                     |
| DWH katalog     | `web/src/dwh/DwhPage.tsx`                                                                             | [dwh/rehber.md](../web/src/dwh/rehber.md) |


Yüzey: `components/shell/SurfaceSwitch.tsx`. Navigasyon persist: `appNavPersist.ts` (`sessionStorage`).

## Bileşen grupları


| Alan               | Orchestrator                            | Klasör                   |
| ------------------ | --------------------------------------- | ------------------------ |
| Kabuk              | `ServicesWorkspace`, `AppShellOverlays` | `components/shell/`      |
| Sidebar + drawer   | `ModuleSidebar`, `WorkflowsPanel`       | `sidebar/`, `workflows/` |
| Hoş geldin         | `ServicesMainStage`                     | `welcome/`               |
| İş akışı tam sayfa | `WorkflowInfoPage`                      | `workflow-stage/`        |
| Servis haritası    | `ServiceStage` → `MapStage`             | `service-map/`           |
| Süreç haritası     | `ProcessFlowPage`                       | `process/`               |
| Katalog            | `ServiceStage`                          | `catalog/`               |
| ⌘K                 | `AppShellOverlays`                      | `search/`                |
| Modallar           | `AppShellOverlays`                      | `overlays/`              |
| Paylaşılan UI      | —                                       | `shared/`                |




## Store’lar

`web/src/stores/` — [stores/rehber.md](../web/src/stores/rehber.md): `workflowStore`, `processRouteStore`, `serviceRecents`, `useServiceFavorites`.

## Navigasyon

`web/src/navigation/` — [navigation/rehber.md](../web/src/navigation/rehber.md).

## Animasyon

`web/src/motion/` — Framer Motion sarmalayıcıları; [motion/rehber.md](../web/src/motion/rehber.md).

## CSS

`main.tsx` → `styles/index.css`. `App.tsx` → `styles/App.css` (yalnızca `@import`) + `styles/responsive.css`. Tur 2 dilimleri: `catalog-bento`, `stage-neighbors`, `snapshots-ui`, `cmdk-hit-tags`, `catalog-extras`, `tree-options-extras`, `service-map-dock`, `service-map-stage`; kalan `app-remainder`. Smoke: [refactor-visual-regression.md](./refactor-visual-regression.md).

## DWH veri / legacy (repo kökü)

Örnek dump, ER JSON, eski Python demo: [dwh/rehber.md](../dwh/rehber.md) (repo kökü `dwh/`, `web/src/dwh/` değil).