# `navigation/` — App kabuğu iş kuralları

`App.tsx` ince kalır; seçim, geçmiş, drawer ve süreç geçişleri burada.

| Hook / dosya | State / davranış | Kim tüketir |
|--------------|-------------------|-------------|
| `useNavDrawers.ts` | Favoriler / İş akışları açık, kısayol tuşları | `App.tsx` → sidebar |
| `useVisitHistory.ts` | Geri/ileri yığını, breadcrumb, harita view kaydı | `App`, `ServiceStage`, ⌘K |
| `useServiceSelection.ts` | `selectPivot`, katalog, temizle, Harita sekmesi | App, sidebar, harita |
| `useProcessFlowNav.ts` | Süreç/rota aç, servisten geri dön | App, sidebar, ProcessFlowPage |
| `useServiceStageData.ts` | Pivot değişince API: servis, etki, metod grafı | `App.tsx` (effect) |
| `useSidebarLayout.ts` | Panel genişlik, pin, hover collapse | App → `ModuleSidebar` |
| `usePersistedAppNav.ts` | `appNavPersist` yazma | App mount |
| `useInboxAndChangeRequests.ts` | Inbox + CR modal akışı | App → overlays |
| `useCommandPaletteKeyboard.ts` | ⌘K / Esc | App |
| `appShellHelpers.ts` | Drawer restore, klavye hedefi filtresi | Nav hook’ları |

Persist okuma: `appNavPersist.ts` (App mount).

İlgili: [web/ARCHITECTURE.md](../../ARCHITECTURE.md), [components/shell/rehber.md](../components/shell/rehber.md).
