# `methodImpactMap/` — **metod** seviyesi etki haritası

**Ekranda:** Servis haritasının metod odaklı varyantında (veya ilgili panelde) gördüğün **metod düğümleri** ve çağrı okları. Dış export: `MethodImpactMap.tsx`.

| Dosya | Ekranda / davranış | Ne işe yarar |
|-------|-------------------|--------------|
| `MethodImpactMapCore.tsx` | Metod graf canvas | Seçim, layout, React Flow |
| `buildGraph.ts` | (arkada) | Metod call-graph → node/edge |
| `nodes.tsx`, `edges.tsx` | Kutular ve oklar | Metod adları, hop |
| `types.ts`, `constants.ts` | (görünmez) | Tipler ve sabitler |

Servis haritası ile aynı aileden; veri kaynağı metod impact API uçları.
