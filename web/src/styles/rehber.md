# `web/src/styles`

Global CSS — **feature dilimleri**. Kurallar mümkün olduğunca burada; bileşen dosyalarında inline stil yok (istisna: React Flow / dinamik).

## Giriş zinciri

```
main.tsx → index.css
App.tsx  → App.css (@import hub) + responsive.css
```

## `App.css` import sırası (özet)

İlk satırlar harita ağırlıklı; sonra kabuk, katalog, app chrome:

| Sıra | Dosya | UI alanı |
| --- | --- | --- |
| hub | `process-flow.css` | Süreç haritası (+ alt import) |
| | `service-map.css` | Servis etki haritası |
| | `service-map-dock.css`, `service-map-stage.css` | Harita dock / stage |
| | `shell.css`, `workflows-drawer.css` | Kabuk, iş akışları drawer |
| | `cmdk.css` | ⌘K |
| | `stage.css`, `catalog.css`, `welcome.css` | Servis sahnesi |
| | `overlays.css`, `workflow-stage.css` | Modallar, WF tam sayfa |
| | `app-chrome.css`, `map-misc.css` | Masthead, harita popup |
| | `catalog-detail.css`, `catalog-bento.css`, `catalog-extras.css` | Katalog detay |
| | `stage-neighbors.css`, `snapshots-ui.css`, `cmdk-hit-tags.css` | Komşu path, snapshot UI |
| | `tree-options-extras.css`, `process-route-ui.css` | Ağaç, rota modu |
| | `search.css`, `shared-ui.css`, `stage-extras.css`, `tree.css` | Arama, paylaşılan |
| | `welcome-extras.css`, `workflow-canvas.css`, `app-remainder.css` | Welcome, WF canvas, kalan |

## Süreç CSS hub

`process-flow.css` **içinden** (App.css’te tekrar import etme):

- `process-flow-chrome.css` — toolbar, arama, tam ekran
- `process-flow-canvas.css` — canvas, node/edge, hover highlight

## Bileşen → CSS eşlemesi

Detay tablo: [components/rehber.md](../components/rehber.md) § CSS.

CSS değişikliği sonrası: [docs/refactor-visual-regression.md](../../../docs/refactor-visual-regression.md).

Mimari özet: [docs/web-architecture.md](../../../docs/web-architecture.md).
