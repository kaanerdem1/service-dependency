# `impact/` — servis etki haritası yardımcıları

Ana UI: `components/ImpactMap.tsx`, `MapStage.tsx`. CSS: `App.css` (harita kuralları).

| Dosya | Rol |
|-------|-----|
| `mapLayout.ts` | React Flow düğüm yerleşimi (servis/metod haritası) |
| `projectFilter.ts` | Etki grafında proje/jar filtre etiketleri → `App.tsx` tablo filtresi |

Veri: `GET` servis etki uçları (`api/client.ts`), tipler `types.ts` `ImpactGraph`.

Süreç BPM haritası **bu klasörde değil** → [components/process/rehber.md](../components/process/rehber.md).
