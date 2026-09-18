# `server/src/routes`

Katalog API route kayıtları (`/api/*`, `/api/dwh` hariç — DWH → `dwh/routes.ts`).

| Dosya | Uçlar |
| --- | --- |
| `registerCatalogRoutes.ts` | Tüm register* çağrıları |
| `healthAndTree.routes.ts` | health, session-users, modules, catalog group/artifact |
| `services.routes.ts` | services, processes, neighbors, impact, notes |
| `methods.routes.ts` | methods, method impact |
| `meta.routes.ts` | meta/* (parse audit, catalog health, call-graph) |
| `changeRequests.routes.ts` | change-requests, inbox, snapshots |

Ortak mock/inventory dallanması: `lib/catalogHelpers.ts`.
