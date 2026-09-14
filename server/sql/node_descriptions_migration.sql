-- Süreç düğüm açıklamaları (doğal dil, XML dışı). PAR ingest bu kolonu güncellemez.
--   psql ... -f server/sql/node_descriptions_migration.sql

ALTER TABLE process ADD COLUMN IF NOT EXISTS node_descriptions jsonb;
