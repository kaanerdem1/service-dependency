# `server/scripts`

Bakım ve doğrulama — `server/package.json` script adlarıyla eşleşir.

| Script / dosya | Ne yapar |
| --- | --- |
| `ingest-process-par.mjs` | `npm run ingest:process-par` — PAR süreç XML → inventory tabloları |
| `verify-process-catalog.mjs` | `npm run verify:process-catalog` — katalog tutarlılık |
| `audit-process-parse.mjs` | `npm run audit:process-parse` — parse denetimi |
| `backup-inventory-db.sh` | `npm run backup:inventory-db` — yerel PG yedek → `backups/postgres/` |
| `smoke-inventory.mjs` / `smoke-sprint-3-5.mjs` | Manuel / dönemsel smoke (geliştirici) |

Otomatik regresyon: `npm run test --prefix server` (tsx test). Kurulum: [README.md](../../README.md).
