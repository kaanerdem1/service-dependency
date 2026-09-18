# Dokümantasyon

Kurulum ve günlük geliştirme özeti repo kökünde: **[../README.md](../README.md)**.

Aşağıdaki dosyalar ürün ve veri modelini anlatır. İlk okuma için önerilen sıra:

1. **[PRODUCT.md](./PRODUCT.md)** — Ne yapıyoruz, nerede biter.
2. **[db.md](./db.md)** — `inventory_db` tabloları, API eşlemesi, süreç XML ingest (§13), kalıcılık özeti (§14).
3. **[catalog-persistence.md](./catalog-persistence.md)** — localStorage/bellek verisinin Postgres’e taşınması: tablolar, okuma/yazma uçları, DDL (§14 detayı).
4. **[process-flow.md](./process-flow.md)** — Süreç haritası: tam akış vs kayıtlı rota.
5. **[refactor-visual-regression.md](./refactor-visual-regression.md)** — CSS değişikliği sonrası isteğe bağlı manuel smoke.
6. **[web-module-layout.md](./web-module-layout.md)** — `web/src/components` alt klasörleri (ekran alanına göre).
7. **[web-architecture.md](./web-architecture.md)** — Web store’lar, CSS, yüzeyler, motion, testler.
8. **[dwh/rehber.md](../dwh/rehber.md)** — Repo kökü DWH örnek veri / legacy (UI: `web/src/dwh/`).

**Kod içi rehberler:** [web/src/rehber.md](../web/src/rehber.md) (UI) · [server/src/rehber.md](../server/src/rehber.md) (API). `components/` ve çoğu alt klasörde **`rehber.md`** — projede gezinmek için dosya adına göre arama yerine klasör rehberine bak.

**Otomatik test:** repo kökünde `npm test` — [web/tests/rehber.md](../web/tests/rehber.md), [server/src/rehber.md](../server/src/rehber.md) § Testler.

**Manuel smoke:** Ekip içi test servis listesi kökte `ss.md` dosyasında tutulabilir (`.gitignore` — repoda yok). Dokümanlarda geçen “ss.md smoke” buna işaret eder.