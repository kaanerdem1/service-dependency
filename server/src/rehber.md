# `server/src` — API giriş haritası

Node + Express katalog API (`:4000`). UI proxy: Vite → `/api`.

## Akış

```
index.ts → startServer.ts → createApp()
  ├─ /api/dwh/*     → dwh/routes.ts
  └─ /api/* (katalog) → routes/registerCatalogRoutes.ts
```

| Dosya | Rol |
| --- | --- |
| `index.ts` | Process giriş |
| `startServer.ts` | `createApp()`, port, env |
| `createApp.ts` | CORS, JSON, route mount (ince kabuk) |
| `data.ts` | Mock katalog verisi (`CATALOG_SOURCE=mock`) |
| `impactGraph.ts` | Call-graph BFS / hop rollup |
| `impact.ts` | Etki uçları için yardımcılar |
| `methods.ts` | Metod listesi / call-graph (mock dal) |
| `notes.ts` | Servis notları |
| `snapshots.ts` | Snapshot meta (bellek / persist) |
| `snapshotTypes.ts` | Snapshot TS tipleri |
| `changeRequests.ts` | CR / inbox iş mantığı |
| `permissions.ts` | Yetki sabitleri |

## Alt klasörler

| Klasör | Ne tutar | rehber |
| --- | --- | --- |
| `routes/` | Express handler kayıtları (`/api/*`) | [routes/rehber.md](./routes/rehber.md) |
| `inventory/` | Postgres env şeması, süreç parse, graf servisleri | [inventory/rehber.md](./inventory/rehber.md) |
| `dwh/` | Stage şeması, lineage SQL, `/api/dwh` | [dwh/rehber.md](./dwh/rehber.md) |
| `lib/` | Route ortak mock/inventory dallanması | [lib/rehber.md](./lib/rehber.md) |

## Testler

```bash
npm run test --prefix server
```

- `inventory/*.test.ts` — parse, rota, katalog sağlık
- `routes/catalogRoutes.registry.test.ts` — kayıtlı route envanteri
- `api.smoke.test.ts` — supertest `/api/health`, `/api/processes` (`CATALOG_SOURCE=mock`)

Kökten tüm suite: repo kökünde `npm test`.

## Scriptler (bakım)

Operasyonel CLI → [scripts/rehber.md](../scripts/rehber.md) (`ingest:process-par`, backup, audit).

Üst kurulum: [README.md](../../README.md) · Veri modeli: [docs/db.md](../../docs/db.md)
