# `snapshot/` — oturum izi ve PNG/PDF paketi

Değişiklik talebi ve servis haritası snapshot’ları için istemci tarafı paket.

| Dosya | Rol | Çağıran |
|-------|-----|---------|
| `trail.tsx` | `SnapshotTrailProvider`, `useSnapshotTrail` — UI olayları yığını | `App.tsx`, `ServiceStage` |
| `useSnapshotPack.ts` | Trail + ekran görüntüsü payload birleştirme | App, CR modal |
| `capture.ts` | DOM → canvas/png | `useSnapshotPack` |
| `formatTrail.ts` | İz metni formatı | Snapshot export |
| `processPathSnapshot.ts` | Süreç yolu PDF | `ProcessFlowMap`, rota kaydet |
| `sidebarState.ts` | Snapshot anında sidebar açık mı | App |
| `imageUrl.ts` | Blob URL yardımcıları | Liste UI |

Sunucu bellek API: `POST/GET /api/snapshots` (kalıcı DB — Faz 7, [catalog-persistence.md](../../../docs/catalog-persistence.md)).
