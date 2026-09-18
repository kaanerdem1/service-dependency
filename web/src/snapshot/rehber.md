# `snapshot/` — **ekran görüntüsü + iz** paketleri

**Ekranda:** Değişiklik talebi açarken “şu an ekranda ne vardı” kaydı; harita veya süreç yolundan **PDF**; talep detayında indirilebilir dosya listesi.

| Dosya | Kullanıcı ne görür / yapar | Ne işe yarar |
|-------|---------------------------|--------------|
| `trail.tsx` | (dolaylı) CR’de otomatik adım listesi | Tıkladığın ekranlar yığını |
| `useSnapshotPack.ts` | Talebe eklenen paket | İz + PNG birleştirme |
| `capture.ts` | (arkada) | DOM’dan görüntü alma |
| `processPathSnapshot.ts` | Süreçte “PDF” / snapshot | Seçili yol anlatımı |
| `formatTrail.ts` | Metin export | İz cümleleri |
| `sidebarState.ts` | Pakette sidebar açık mı | Layout tutarlılığı |

Çağıran yerler: [service-map](../components/service-map/rehber.md), [process](../components/process/rehber.md), [overlays](../components/overlays/rehber.md).

Sunucu: `/api/snapshots` (kalıcı DB planı → [catalog-persistence.md](../../../docs/catalog-persistence.md)).
