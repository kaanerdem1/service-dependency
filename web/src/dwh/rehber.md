# `web/src/dwh/` — DWH katalog yüzeyi (React)

Servis kataloğundan ayrı sekme: tablo/kolon lineage, SQL, favoriler, harita.

| Dosya | Rol |
|-------|-----|
| `DwhPage.tsx` | Ana sayfa orchestrator |
| `DwhLineageMap.tsx`, `DwhLineageTree.tsx` | Lineage görünümleri |
| `DwhMapChrome.tsx`, `dwhMapLayout.ts` | Harita chrome (servis `service-map/` ile akraba) |
| `DwhColumnLineagePanel.tsx`, `DwhSqlCode.tsx` | Kolon detay / SQL |
| `DwhFavoritesPanel.tsx`, `dwhFavorites.ts`, `useDwhFavorites.ts` | Favoriler |
| `DwhSearchHitsPortal.tsx` | Arama portalı |
| `api.ts`, `types.ts`, `dwhNavPersist.ts` | API tipleri, persist |
| `DwhPage.css` | DWH’ye özel stiller |

**Repo kökü DWH verisi / legacy:** [dwh/rehber.md](../../../dwh/rehber.md) (`artifacts/`, `legacy/`).

Kabuk geçişi: `App.tsx` + `shell/SurfaceSwitch.tsx`.
