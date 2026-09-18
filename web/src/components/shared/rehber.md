# `shared/` — birçok ekranda tekrar eden **küçük parçalar**

**Ekranda:** Tek başına sayfa değil; katalog sekmesinde “veri yok”, talep detayında **snapshot listesi** gibi ortak bloklar.

| Dosya | Nerede görürsün | Ne gösterir |
|-------|-----------------|-------------|
| `EmptyState.tsx` | Boş tablo/liste | “Henüz kayıt yok” / hata / yükleniyor üçlüsü |
| `SnapshotList.tsx` | Talep detay modalında | Eklenmiş PNG/PDF snapshot’ları, indir |

Domain mantığı burada tutulmaz. Snapshot formatı: [snapshot/rehber.md](../../snapshot/rehber.md).

Yeni parça: gerçekten **iki farklı ekran alanı** kullanacaksa `shared/`; yoksa ilgili domain klasöründe kalsın.
