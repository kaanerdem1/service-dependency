# `impact/` — **Harita** sekmesinin yerleşim matematiği

**Ekranda:** Servis haritasındaki baloncukların **nereye konduğu** ve proje/jar **filtre etiketleri** — kullanıcı bunu “düzen” olarak görür; React bileşeni `components/service-map/` içinde.

| Dosya | Ekranda etkisi | Ne yapar |
|-------|----------------|----------|
| `mapLayout.ts` | Harita düğümlerinin x/y dizilimi | Büyük grafı okunaklı yerleştirir |
| `projectFilter.ts` | Tablo/haritada proje filtresi | Hangi jar’lar gösterilsin |

Veri sunucudan gelir (`api/client.ts`). BPM süreç haritası **burada değil** → [components/process/rehber.md](../components/process/rehber.md).

CSS: `styles/service-map.css`.
