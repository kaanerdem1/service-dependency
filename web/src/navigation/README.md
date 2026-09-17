# Navigasyon hook’ları

`App.tsx` kabuktur; seçim, geçmiş, drawer ve süreç geçişleri burada toplanır. Türkçe gruplu liste: [rehber.md](./rehber.md).

| Grup | Dosyalar |
|------|----------|
| Layout / drawer | `useSidebarLayout.ts`, `useNavDrawers.ts` |
| Seçim / geçmiş | `useServiceSelection.ts`, `useVisitHistory.ts` |
| Süreç | `useProcessFlowNav.ts` |
| API veri | `useServiceStageData.ts` |
| Overlays / ⌘K | `useInboxAndChangeRequests.ts`, `useCommandPaletteKeyboard.ts` |
| Persist | `usePersistedAppNav.ts`, `appShellHelpers.ts` |

İlgili: [docs/web-architecture.md](../../../docs/web-architecture.md), [docs/web-module-layout.md](../../../docs/web-module-layout.md)
