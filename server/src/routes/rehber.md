# `server/src/routes`

Katalog API route kayıtları (`/api/*`, `/api/dwh` hariç — DWH → `dwh/routes.ts`).

| Dosya | Uçlar |
| --- | --- |
| `registerCatalogRoutes.ts` | Tüm register* çağrıları |
| `healthAndTree.routes.ts` | health, session-users, modules, catalog group/artifact |
| `services.routes.ts` | services, neighbors, impact, notes |
| `processes.routes.ts` | `/api/processes/*`, `services/:id/processes` |
| `methods.routes.ts` | methods, method impact |
| `meta.routes.ts` | meta/* (parse audit, catalog health, call-graph) |
| `changeRequests.routes.ts` | change-requests, inbox, snapshots |

Ortak mock/inventory dallanması: [lib/catalogHelpers.ts](../lib/catalogHelpers.ts) — [lib/rehber.md](../lib/rehber.md).

Mount sırası: `registerCatalogRoutes.ts` → health/tree → services → processes → methods → meta → change-requests. DWH ayrı: [dwh/routes.ts](../dwh/routes.ts) (`/api/dwh`).

Test: `routes/catalogRoutes.registry.test.ts` (kayıtlı uç envanteri). Üst harita: [server/src/rehber.md](../rehber.md).
