# CR, inbox ve talep modalları — modül grubu

Issue management **dış sistem**; bu modallar SD içinde snapshot / talep akışını destekler. Composition: `shell/AppShellOverlays.tsx`.

## Dosya → rol

| Dosya | Rol |
|-------|-----|
| `ChangeRequestModal.tsx` | Değişiklik talebi + snapshot paketi |
| `InboxPanel.tsx` | Gelen kutusu listesi |
| `RequestDetailModal.tsx` | Talep detayı |
| `NewServiceRequestModal.tsx` | Yeni servis talebi |

## State

`navigation/useInboxAndChangeRequests.ts` — App → overlay prop’ları (`useAppShellOverlaysProps.ts`).

Snapshot: [snapshot/rehber.md](../../snapshot/rehber.md).

Paylaşılan: [shared/rehber.md](../shared/rehber.md) (`EmptyState`, `SnapshotList`).
