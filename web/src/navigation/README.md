# Navigasyon hook’ları

`App.tsx` kabuktur; seçim, geçmiş, drawer ve süreç geçişleri burada toplanır.

| Dosya | Rol |
|-------|-----|
| `useNavDrawers.ts` | Favoriler / iş akışları drawer |
| `useVisitHistory.ts` | Servis ziyaret yığını, Geri/İleri |
| `useProcessFlowNav.ts` | Süreç / rota, servisten geri dönüş |
| `useServiceSelection.ts` | selectPivot, katalog, temizleme |
| `useServiceStageData.ts` | Pivot → API graf yüklemesi |
| `appShellHelpers.ts` | Drawer restore, klavye hedefi |
| `usePersistedAppNav.ts` | localStorage navigasyon yazma |
| `useSidebarLayout.ts` | Sidebar genişlik / sabitleme |
| `useInboxAndChangeRequests.ts` | Inbox + CR modal |
| `useCommandPaletteKeyboard.ts` | ⌘K / Esc |

İlgili: [web/ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/refactor-plan.md](../../../docs/refactor-plan.md)
