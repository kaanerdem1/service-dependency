# `navigation/` — App kabuğu iş kuralları

`App.tsx` ince kalır; seçim, geçiş, drawer ve süreç açma burada. UI grupları: [components/rehber.md](../components/rehber.md).

## Gruplar

### Layout ve drawer

| Hook / dosya | Davranış | Tüketici |
|--------------|----------|----------|
| `useSidebarLayout.ts` | Panel genişlik, pin, hover collapse | `ModuleSidebar` |
| `useNavDrawers.ts` | Favoriler / İş akışları açık, kısayol tuşları | `App` → sidebar |

### Seçim ve geçmiş

| Hook / dosya | Davranış | Tüketici |
|--------------|----------|----------|
| `useServiceSelection.ts` | `selectPivot`, katalog, temizle, Harita sekmesi | App, sidebar, harita |
| `useVisitHistory.ts` | Geri/ileri, breadcrumb, harita view kaydı | App, `ServiceStage`, ⌘K |

### Süreç ve rota

| Hook / dosya | Davranış | Tüketici |
|--------------|----------|----------|
| `useProcessFlowNav.ts` | Süreç/rota aç, servisten geri dön | App, sidebar, `ProcessFlowPage` |

### Veri yükleme

| Hook / dosya | Davranış | Tüketici |
|--------------|----------|----------|
| `useServiceStageData.ts` | Pivot değişince API: servis, etki, metod grafı | `App.tsx` (effect) |

### Overlays ve klavye

| Hook / dosya | Davranış | Tüketici |
|--------------|----------|----------|
| `useInboxAndChangeRequests.ts` | Inbox + CR modal | App → overlays |
| `useCommandPaletteKeyboard.ts` | ⌘K / Esc | App |

### Persist ve yardımcılar

| Hook / dosya | Davranış | Tüketici |
|--------------|----------|----------|
| `usePersistedAppNav.ts` | `appNavPersist` yazma | App mount |
| `appShellHelpers.ts` | Drawer restore, klavye hedefi filtresi | Nav hook’ları |

Persist okuma: `appNavPersist.ts` (App mount).

İlgili: [docs/web-architecture.md](../../../docs/web-architecture.md), [components/shell/rehber.md](../components/shell/rehber.md).
