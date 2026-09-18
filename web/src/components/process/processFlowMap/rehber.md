# `processFlowMap/` — süreç **canvas**ının motoru

**Ekranda:** Tam akış modunda gördüğün **React Flow alanı** — düğüm kutuları, ok etiketleri, hover vurgusu, tam ekran, “Not ekle”. `ProcessFlowMap.tsx` yalnızca provider; asıl UI burada (`ProcessFlowMapCore.tsx`).

| Dosya | Ekranda / davranış | Ne işe yarar |
|-------|-------------------|--------------|
| `ProcessFlowMapCore.tsx` | Tüm canvas + toolbar | State, drawer bağlantısı, snapshot |
| `buildGraph.ts` | Düğüm konumları ve ok tipleri | XML graf → layout (katmanlı) |
| `edgeGeometry.ts` | Ok şekilleri | Düz / zıplama / geri ok rayları |
| `nodes.tsx` | BPM adım kutuları | Start, görev, karar görünümü |
| `edges.tsx` | Oklar ve etiketler | Geçiş adları, servis ipuçları |
| `noteNodes.ts` | Sarı yapışkan notlar | Konum/metin localStorage |
| `constants.ts`, `types.ts` | (görünmez) | Boşluklar, TS tipleri |

CSS: `styles/process-flow.css` (+ chrome/canvas alt dosyaları) — [styles/rehber.md](../../../styles/rehber.md).
