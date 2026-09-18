# `components/` — giriş (modül haritası)

Servis kataloğu arayüzünün React bileşenleri. **State çoğunlukla `App.tsx` + `navigation/`**; bu ağaç **sunum + domain UI** içerir.

**Projeye yeni giren biri:** önce aşağıdaki **ağaç** ve **ekran → klasör** tablosu; sonra ilgili alt klasördeki `rehber.md`. Kısa yönlendirme: [README.md](./README.md). Özet tablo: [docs/web-module-layout.md](../../../docs/web-module-layout.md).

## Klasör ağacı (hepsi alt dizin)

```
components/
├── shell/           Uygulama kabuğu (masthead, workspace, stage iskeleti)
├── sidebar/         Sol panel içeriği (ağaç, favoriler)
├── workflows/       İş akışları drawer (+ WorkflowsPanel)
├── welcome/         Hiç seçim yokken orta sahne
├── workflow-stage/  Seçili iş akışı tam sayfa editörü
├── process/         BPM süreç haritası (tam akış + rota)
├── service-map/     Servis / metod etki haritası (React Flow)
├── catalog/         Servis detay sekmeleri, tablo, overview
├── search/          ⌘K komut paleti
├── overlays/        CR, inbox, talep modalları
└── shared/          EmptyState, SnapshotList (çapraz)
```

## Ekranda ne görüyorsan → hangi klasör?

| Kullanıcı gördüğü | Orchestrator | Klasör(ler) |
|-------------------|--------------|-------------|
| Üst bar, tema, Servis/DWH | `shell/AppMasthead` | `shell/` |
| Sol modül ağacı, pin, drawer | `shell/ModuleSidebar` | `shell/` + `sidebar/` + `workflows/` |
| Hoş geldin / tur | `shell/ServicesMainStage` | `welcome/` |
| Süreç akış canvas | `process/ProcessFlowPage` | `process/` |
| İş akışı tam sayfa | `workflow-stage/WorkflowInfoPage` | `workflow-stage/` |
| Servis sekmeleri, harita | `shell/ServiceStage` | `service-map/`, `catalog/` |
| ⌘K | `shell/AppShellOverlays` | `search/` |
| Inbox / CR modal | `shell/AppShellOverlays` | `overlays/` |

## Veri akışı (kısa)

```
api/client
  → navigation/* (seçim, geçmiş, drawer, süreç açma)
  → shell/* (layout)
  → domain klasörleri (process, service-map, catalog, …)
```

Store’lar: [stores/rehber.md](../stores/rehber.md). Navigasyon persist: `appNavPersist.ts` (src kökü).

## Alt rehberler

| Klasör | rehber |
|--------|--------|
| `shell/` | [shell/rehber.md](./shell/rehber.md) |
| `sidebar/` | [sidebar/rehber.md](./sidebar/rehber.md) |
| `workflows/` | [workflows/rehber.md](./workflows/rehber.md) |
| `welcome/` | [welcome/rehber.md](./welcome/rehber.md) |
| `workflow-stage/` | [workflow-stage/rehber.md](./workflow-stage/rehber.md) |
| `process/` | [process/rehber.md](./process/rehber.md) |
| `service-map/` | [service-map/rehber.md](./service-map/rehber.md) |
| `catalog/` | [catalog/rehber.md](./catalog/rehber.md) |
| `search/` | [search/rehber.md](./search/rehber.md) |
| `overlays/` | [overlays/rehber.md](./overlays/rehber.md) |
| `shared/` | [shared/rehber.md](./shared/rehber.md) |

## CSS

| UI alanı | Dosya |
|----------|--------|
| Kabuk, sidebar | `styles/shell.css` |
| Drawer | `styles/workflows-drawer.css` |
| Servis haritası | `styles/service-map.css` |
| Süreç haritası | `styles/process-flow.css` |
| ⌘K | `styles/cmdk.css` |
| Servis sahnesi / sekmeler | `styles/stage.css` |
| Katalog, tablo | `styles/catalog.css` |
| Welcome | `styles/welcome.css` |
| CR / inbox modalları | `styles/overlays.css` |
| İş akışı tam sayfa | `styles/workflow-stage.css` |
| Harita popup (dd-*) | `styles/map-misc.css` |
| App kabuğu parçaları | `styles/app-chrome.css` + `styles/app-remainder.css` |

Manuel smoke: [docs/refactor-visual-regression.md](../../../docs/refactor-visual-regression.md).
