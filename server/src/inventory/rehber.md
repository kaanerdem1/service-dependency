# `server/src/inventory` — **gerçek katalog** veritabanı

**Ekranda:** `CATALOG_SOURCE=inventory` iken sol **~37k servis ağacı**, **harita** call-edge’leri, **süreç listesi** ve BPM **XML parse** sonucu — hepsi PostgreSQL `env` şemasından buradan okunur/yazılır.

| Alan | Kullanıcı ne görür | Ana dosyalar |
|------|-------------------|--------------|
| Modül ağacı | Sol proje→jar→servis | `treeService.ts`, `catalogEntityService.ts` |
| Servis detay / komşular | Katalog sekmeleri | `serviceService.ts` |
| Harita grafı | Harita sekmesi okları | `graphService.ts`, `methodService.ts` |
| BPM süreç | Süreç canvas düğümleri | `processFlowService.ts`, `parProcessParser.ts` |
| Süreç boşsa | Drawer’da `.par` isimli süreçler | ingest → [docs/db.md §13](../../docs/db.md) |

Bağlantı: `config.ts`, `db.ts`. HTTP: [routes/rehber.md](../routes/rehber.md) `processes.routes.ts`.

Testler: aynı klasörde `*.test.ts`.
