# Web uygulaması — mimari özet

Davranış değiştirmeden refactor için “nereye dokunurum?” haritası. Ayrıntı: [docs/refactor-plan.md](../docs/refactor-plan.md).

## Yüzeyler

| Yüzey | Bileşen | Not |
|--------|---------|-----|
| Servis kataloğu | `App.tsx` → `components/shell/ServicesWorkspace.tsx` | Sol ağaç + orta sahne |
| DWH katalog | `dwh/DwhPage.tsx` | **Refactor kapsam dışı** (ayrı ekip) |

Yüzey seçimi: `components/SurfaceSwitch.tsx`, kalıcılık: `appNavPersist.ts` (`sessionStorage`, key `sd-app-navigation-v1`).

## Store’lar ve event’ler (client)

| Modül | Depo | Event / not |
|--------|------|-------------|
| `processRouteStore.ts` | `localStorage` `sd-process-flow-routes:v1` | `sd-process-routes-changed` — drawer rotaları, `ProcessFlowPage` |
| `workflowStore.ts` | `localStorage` | İş akışı klasör + adımlar |
| `serviceRecents.ts` | `localStorage` | Komut paleti sık kullanılanlar |
| `appNavPersist.ts` | `sessionStorage` | Sekme, pivot, geçmiş, süreç no, drawer |
| `useServiceFavorites.ts` | `localStorage` | Favori servisler |

## Navigasyon hook’ları

Tümü `web/src/navigation/` — bkz. [navigation/README.md](src/navigation/README.md).

## Süreç akışı

Domain: `components/processUserRoute.ts`, UI: `ProcessFlowMap`, `ProcessFlowRouteBuilder`, orchestrator `ProcessFlowPage` + `useProcessFlowPage`. Harita: [components/process/README.md](src/components/process/README.md).

## Sunucu

Servis envanteri ve süreç XML: `server/src/inventory/` (Faz 6 refactor hedefi). DWH API: `server/src/dwh/` — web refactor planına dahil değil.

## CSS

`App.css` → `@import` `process-flow`, `service-map`, `shell`, `workflows-drawer`, `cmdk` + katalog/tablo. `responsive.css`. Smoke: [refactor-visual-regression.md](../docs/refactor-visual-regression.md).
