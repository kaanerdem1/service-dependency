# Yerel Postgres yedekleri

Tam `inventory_db` dump’ları buraya yazılır. **Git’e commit edilmez** (`.gitignore`).

```bash
cd server
npm run backup:inventory-db
```

Dosya adı: `inventory_db_YYYYMMDD_HHMMSS.dump` (sıkıştırılmış `-Fc` format).

Geri yükleme (dikkat: hedef DB’deki veriyi ezer — önce test DB veya yedek al):

```bash
pg_restore -h 127.0.0.1 -U postgres -d inventory_db --clean --if-exists \
  backups/postgres/inventory_db_YYYYMMDD_HHMMSS.dump
```

Bağlantı: `server/.env` içindeki `INVENTORY_PG*` değişkenleri.
