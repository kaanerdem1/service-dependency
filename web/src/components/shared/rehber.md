# `shared/` — çapraz UI parçaları

Birden fazla domain klasörünün kullandığı **küçük, state’siz** bileşenler. Domain mantığı burada tutulmaz.

| Dosya | Rol | Tüketiciler |
|-------|-----|-------------|
| `EmptyState.tsx` | “Veri yok / hata / yükleme” üçlü metin bloğu | `catalog/*`, `overlays/InboxPanel` |
| `SnapshotList.tsx` | Talebe bağlı snapshot listesi + indirme | `overlays/RequestDetailModal` |

Snapshot API / format: [snapshot/rehber.md](../../snapshot/rehber.md).

Yeni paylaşılan parça eklerken: gerçekten **2+ domain** kullanıyorsa `shared/`; tek domain’e özel ise o domain klasöründe kal.
