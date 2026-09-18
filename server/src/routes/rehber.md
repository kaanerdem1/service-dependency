# `server/src/routes` — **HTTP uçları** → ekran

**Ekranda:** Her satır, tarayıcının bir yerinde gördüğün veriyi taşır. (DWH uçları `dwh/routes.ts` — `/api/dwh`.)

| Dosya | Kullanıcı ne yapar | API (özet) |
|-------|-------------------|------------|
| `healthAndTree.routes.ts` | Uygulama açılır, sol ağaç yüklenir | `/api/health`, modül ağacı |
| `services.routes.ts` | Servis seçer, harita/komşular | servis detay, etki, notlar |
| `processes.routes.ts` | Süreç açar, düğüm notu kaydeder | `/api/processes/.../flow`, node-descriptions |
| `methods.routes.ts` | Metod / call-graph görünümü | metod listesi, metod impact |
| `meta.routes.ts` | (geliştirici) katalog sağlık | parse audit, call-graph meta |
| `changeRequests.routes.ts` | Inbox, CR, snapshot | change-requests, inbox |
| `registerCatalogRoutes.ts` | (görünmez) | Yukarıdakileri Express’e bağlar |

Mock mu gerçek DB mi: [lib/rehber.md](../lib/rehber.md). Test: `catalogRoutes.registry.test.ts`.
