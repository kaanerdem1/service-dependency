# Servis etki haritası — modül grubu

**Servis ↔ servis / metod** etki grafiği (React Flow). Süreç BPM haritası **bu grupta değil** → [process/rehber.md](../process/rehber.md).

Kaynak dosyalar bu klasörde. Layout yardımcıları: [impact/rehber.md](../../impact/rehber.md).

## Dosya → rol

| Dosya | Rol |
|-------|-----|
| `MapStage.tsx` | Harita sekmesi sarmalayıcı (toolbar, tam ekran) |
| `ImpactMap.tsx` | Re-export; gövde `impactMap/ImpactMapCore.tsx` |
| `MethodImpactMap.tsx` | Metod seviyesi alt harita |
| `ImpactChrome.tsx` | Harita üst/yan chrome |
| `SimpleImpactPath.tsx` | Kısa etki yolu gösterimi |
| `MethodCallTree.tsx` | Metod çağrı ağacı (tablo/harita ile ilişkili) |
| `DockTooltipPortal.tsx` | Harita dock tooltip (portal) |

## Veri ve filtre

- API: `useServiceStageData` → etki grafı (`api/client.ts`)
- Proje/jar filtresi: `impact/projectFilter.ts` → `App.tsx` tablo filtresi
- Yerleşim: `impact/mapLayout.ts`

## Snapshot

Harita anlık görüntüsü: `snapshot/trail.tsx`, `useSnapshotPack.ts` — `ServiceStage` üzerinden.

CSS: `styles/service-map.css`. Smoke: harita sekmesi, tam ekran, ziyaret yolu (`shell/StageVisitPath`).

Paylaşılan chrome: DWH `DwhMapChrome` yalnızca `DockTooltipPortal` import eder; servis haritası `ImpactChrome` kullanır.
