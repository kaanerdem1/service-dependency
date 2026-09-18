# `service-map/` — **Harita** sekmesi (servis etki grafiği)

**Ekranda:** Bir servis seçiliyken üst sekmelerden **Harita**’ya geçince gördüğün React Flow canvas — baloncuklar arası oklar, zoom dock, tam ekran, ziyaret yolu.

**BPM süreç haritası burada değil** (farklı ekran, farklı API) → [process/rehber.md](../process/rehber.md).

| Dosya | Ekranda nereye karşılık gelir | Ne işe yarar |
|-------|------------------------------|--------------|
| `MapStage.tsx` | Harita sekmesinin tamamı | Toolbar, tam ekran, haritayı stage’e yerleştirir |
| `ImpactMap.tsx` | Servis→servis graf | İnce sarmalayıcı; asıl çizim [impactMap/](./impactMap/rehber.md) |
| `MethodImpactMap.tsx` | Metod seviyesi graf (ilgili görünümde) | [methodImpactMap/](./methodImpactMap/rehber.md) |
| `ImpactChrome.tsx` | Harita üst/yan kontroller | Hop, filtre, legend benzeri chrome |
| `SimpleImpactPath.tsx` | Kısa “etki yolu” metni/şerit | Seçili düğüm yolu özeti |
| `MethodCallTree.tsx` | Metod çağrı ağacı paneli | Tablo/harita ile birlikte |
| `DockTooltipPortal.tsx` | Zoom dock üzerindeki tooltip | Fareyle üstüne gelince açıklama |

Veri: seçili servis değişince API’den gelen etki grafı (`navigation/useServiceStageData`). Düğüm konumu: [impact/mapLayout.ts](../../impact/mapLayout.ts).

Snapshot: harita görüntüsü değişiklik talebine eklenebilir → [snapshot/rehber.md](../../snapshot/rehber.md).

CSS: `service-map.css`, `service-map-dock.css`, `service-map-stage.css`.
