# `web/src/styles` — **görünüm** (CSS)

**Ekranda:** Renkler, boşluklar, sekme şeridi, harita ok kalınlığı — kod `components/` içinde sınıf adı kullanır, kurallar burada.

## Nasıl yüklenir

```
main.tsx → index.css
App.tsx  → App.css (tüm parça dosyalarını @import eder) + responsive.css
```

## Hangi ekran hangi dosyayı etkiler?

| Ekran parçası | CSS dosyası |
|---------------|-------------|
| Üst bar, sol panel iskeleti | `shell.css` |
| İş akışları drawer | `workflows-drawer.css` |
| Servis haritası + dock | `service-map.css`, `service-map-dock.css`, `service-map-stage.css` |
| BPM süreç haritası | `process-flow.css` → `process-flow-chrome.css`, `process-flow-canvas.css` |
| ⌘K paleti | `cmdk.css`, `cmdk-hit-tags.css` |
| Servis sekmeleri, bento kartlar | `stage.css`, `catalog.css`, `catalog-detail.css`, `catalog-bento.css` |
| Hoş geldin | `welcome.css` |
| CR / inbox modalları | `overlays.css` |
| İş akışı tam sayfa | `workflow-stage.css`, `workflow-canvas.css` |
| Ağaç satırları | `tree.css`, `tree-options-extras.css` |

Tam `@import` sırası: `App.css` dosyasının kendisi.

CSS değişince smoke: [docs/refactor-visual-regression.md](../../../docs/refactor-visual-regression.md).
