# Service Dependency

Servis bağımlılığı + değişiklik onay (gate) ürünü.

## Ne bu?

Büyük codebase’de:

- Sol: `project → jar/package → service` modül ağacı
- Servis seçilince: **bu servisi çağıranlar** (liste / grafik)
- Değişiklik veya yeni servis: etkilenen owner’lara bildirim + onay flag’leri (🟢🔴🟡⬜)
- Tüm onaylar olmadan değişiklik yok

Detaylı gereklilikler ve referans UI’lar: [`docs/ServiceDependency.md`](docs/ServiceDependency.md)

## Durum

Taslak / şekillenme aşaması. Dependency DB gelince entegre edilecek; UI mock ile geliştirilebilir.

## Katalog lineage ile ilişki

Veri lineage (tablo/ETL) ayrı repo: `katalog pg_v12`.  
Bu repo **servis / metod / onay** yüzeyi için bağımsız ilerler.
