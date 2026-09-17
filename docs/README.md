# Dokümantasyon

Kurulum ve günlük geliştirme özeti repo kökünde: **[../README.md](../README.md)**.

Aşağıdaki dosyalar ürün ve veri modelini anlatır. İlk okuma için önerilen sıra:

1. **[PRODUCT.md](./PRODUCT.md)** — Ne yapıyoruz, nerede biter (SD vs issue aracı).
2. **[db.md](./db.md)** — `inventory_db` tabloları, API eşlemesi, süreç XML ingest (§13), kalıcılık özeti (§14).
3. **[catalog-persistence.md](./catalog-persistence.md)** — localStorage/bellek verisinin Postgres’e taşınması: tablolar, okuma/yazma uçları, DDL (§14 detayı).
4. **[process-flow.md](./process-flow.md)** — Süreç haritası: tam akış vs kayıtlı rota.
5. **[refactor-plan.md](./refactor-plan.md)** — Kod okunabilirliği, modül bölme ve Türkçe yorum rehberi (refactor yol haritası).

**Manuel smoke:** Ekip içi test servis listesi kökte `ss.md` dosyasında tutulabilir (`.gitignore` — repoda yok). Dokümanlarda geçen “ss.md smoke” buna işaret eder.
