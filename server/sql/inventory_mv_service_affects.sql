-- Inventory servis rollup (import sonrası bir kez)
-- psql -U postgres -d inventory_db -f server/sql/inventory_mv_service_affects.sql

CREATE MATERIALIZED VIEW IF NOT EXISTS env.mv_service_affects AS
SELECT DISTINCT
  sd_callee.id AS callee_service_id,
  sd_caller.id AS caller_service_id
FROM env.call_edge ce
JOIN env.java_method jm_caller ON jm_caller.id = ce.caller_id
JOIN env.java_method jm_callee ON jm_callee.id = ce.callee_id
JOIN env.service_definition sd_caller ON sd_caller.id = jm_caller.service_definition_id
JOIN env.service_definition sd_callee ON sd_callee.id = jm_callee.service_definition_id
WHERE sd_caller.id <> sd_callee.id
  AND sd_caller.status = 1
  AND sd_callee.status = 1;

CREATE INDEX IF NOT EXISTS idx_mv_service_affects_callee
  ON env.mv_service_affects (callee_service_id);

-- Yeni dump sonrası:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY env.mv_service_affects;
