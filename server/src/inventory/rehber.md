# `server/src/inventory`

`CATALOG_SOURCE=inventory` iken PostgreSQL **`env`** şeması üzerinden servis ağacı, call-edge, süreç PAR/XML ve katalog yazma.

## Çekirdek

| Dosya | Rol |
| --- | --- |
| `config.ts` | PG bağlantı env |
| `db.ts` | Pool, sorgu yardımcıları |
| `catalog.ts` | Katalog okuma girişi |
| `catalogEntityService.ts` | Grup / artifact / servis entity |
| `treeService.ts` | Modül ağacı |
| `serviceService.ts` | Servis detay, komşular |
| `methodService.ts` | Metodlar, call-graph kaynağı |
| `graphService.ts` | Graf rollup (inventory) |
| `contextService.ts` | Oturum / kullanıcı bağlamı |
| `location.ts` | Jar / proje konumu |
| `catalogWriteAccess.ts` | Yazma yetkisi kontrolü |

## Süreç (BPM) katmanı

| Dosya | Rol |
| --- | --- |
| `parProcessParser.ts` | PAR/XML → düğüm / geçiş modeli |
| `processDefinitionSource.ts` | Tanım kaynağı (DB / dosya) |
| `processFlowService.ts` | `GET …/flow`, düğüm açıklamaları |
| `processCatalogSchema.ts` / `processCatalogColumns.ts` | Süreç katalog tabloları |
| `processCatalogHealth.ts` | Parse / katalog sağlık metrikleri |
| `processParseAudit.ts` | Parse denetim kaydı |
| `processNodeDescriptions.ts` | Düğüm açıklama PATCH |

Ingest ve boş süreç listesi: [docs/db.md §13](../../docs/db.md) · `npm run ingest:process-par --prefix server`.

## Testler

Aynı klasörde `*.test.ts` — parser, rota store, geçiş servisleri, node descriptions. Çalıştırma: `npm run test --prefix server`.

HTTP uçları: [routes/rehber.md](../routes/rehber.md) (`processes.routes.ts`). UI sözleşmesi: `web/src/types.ts`, `web/src/api/client.ts`.
