# `impactMap/` — servis haritasının **canvas gövdesi**

**Ekranda:** Harita sekmesindeki **servis baloncukları**, oklar, tıklayınca açılan popup’lar. Dışarıdan `ImpactMap.tsx` import edilir; bu klasör asıl React Flow mantığı.

| Dosya | Ekranda / davranış | Ne işe yarar |
|-------|-------------------|--------------|
| `ImpactMapCore.tsx` | Tüm harita etkileşimi | Seçim, zoom, snapshot, filtre state |
| `buildGraph.ts` | (arkada) | API grafını React Flow node/edge’e çevirir |
| `nodes.tsx` | Her servis kutusu | Renk, etiket, tıklama |
| `edges.tsx` | Oklar arası | Hop etiketi, vurgu |
| `popovers.tsx` | Düğüme tıklayınca küçük pencere | Metod / not özeti |
| `types.ts`, `constants.ts` | (görünmez) | Prop ve layout sabitleri |

Veri üstten prop ile gelir; lazy detay için `api/client.ts`.
