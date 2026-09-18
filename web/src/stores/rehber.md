# `stores/` — tarayıcıda **saklanan** kullanıcı verisi

**Ekranda:** Bunlar dosya değil; **Favoriler** listesi, **Akış Rotaları**, **İş akışları** klasörleri, ⌘K **son arananlar** gibi yerlerde gördüğün içeriğin kaynağı (çoğu `localStorage`).

| Dosya | Ekranda nerede görünür | Ne tutar |
|-------|------------------------|----------|
| `workflowStore.ts` | İş akışları drawer + tam sayfa editör | Klasörler, adımlar, kenarlar |
| `processRouteStore.ts` | Drawer → “Akış Rotaları” | Kaydettiğin BPM yolları |
| `useServiceFavorites.ts` | Ağaç yıldızı + Favoriler drawer | Favori servis id’leri |
| `serviceRecents.ts` | ⌘K / arama | Son açılan servisler |

Sunucuya kalıcı yazma planı: [docs/catalog-persistence.md](../../../docs/catalog-persistence.md).

Seçim state’i (şu an hangi servis açık) burada değil → `navigation/` + `appNavPersist.ts`.
