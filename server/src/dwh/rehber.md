# `server/src/dwh`

DWH lineage API — mount: `createApp.ts` → **`/api/dwh`**, router: `routes.ts`.

Stage PostgreSQL şeması (`PGHOST`, `PGDATABASE`, `PGSCHEMA=stage` vb., bkz. `server/.env.example`).

| Dosya | Rol |
| --- | --- |
| `routes.ts` | Express router, uç tanımları |
| `db.ts` | Stage PG pool |
| `types.ts` | API tipleri |
| `treeService.ts` | DWH modül / tablo ağacı |
| `tableService.ts` | Tablo meta |
| `columnLineageService.ts` | Kolon upstream/downstream |
| `graphService.ts` | Lineage graf |
| `impactService.ts` | Etki özeti |
| `mapSummaryService.ts` | Harita özet |
| `reportService.ts` | Rapor uçları |
| `sqlService.ts` / `sqlSimplify.ts` | SQL metni, sadeleştirme |
| `format.ts` | Format yardımcıları |

UI: [web/src/dwh/rehber.md](../../../web/src/dwh/rehber.md). Repo kökü örnek dump / legacy: [dwh/rehber.md](../../../dwh/rehber.md).

Servis katalog route’ları **bu klasörde değil** → [routes/rehber.md](../routes/rehber.md).
