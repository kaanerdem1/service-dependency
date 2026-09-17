# `stores/` — istemci kalıcılığı (localStorage / bellek)

Domain state **App + navigation**’da; burada yalnızca **serialize edilen** veri modülleri.

| Dosya | Depo | Ne tutar |
|-------|------|----------|
| `workflowStore.ts` | localStorage | İş akışı klasörleri, adımlar, kenarlar |
| `processRouteStore.ts` | localStorage | BPM akış rotaları (`sd-process-flow-routes:v1`) |
| `serviceRecents.ts` | localStorage | ⌘K / arama sık kullanılan servisler |
| `useServiceFavorites.ts` | localStorage | Favori servis id’leri (hook) |

Sunucuya kalıcı yazma planı: [docs/catalog-persistence.md](../../../docs/catalog-persistence.md).
