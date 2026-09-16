-- Ortak katalog kalıcılığı — localStorage / bellek verisi için tablolar.
-- Hedef API: docs/db.md §14.10
--
-- Uygulama:
--   psql -h ... -U postgres -d inventory_db -f server/sql/catalog_persistence.sql
--
-- Notlar:
--   - PAR ingest bu tabloları güncellemez.
--   - process_no → env.process(no) için FK yok: legacy şemada no yok / UNIQUE garantisi yok.
--     API katmanında status = 1 AND no = $1 EXISTS kontrolü yapılır.
--   - dwh_favorite_table.table_id stage DB referansıdır; cross-DB FK yok.
--   - owner_user_id / user_id: SSO personId (ayrı catalog_user tablosu yok).

SET search_path TO env;

-- ---------------------------------------------------------------------------
-- 1) İş akışları — GET/PUT /api/workflows (sd-service-workflows:v1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS catalog_workflow_doc (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL DEFAULT 'global',
  payload       jsonb NOT NULL DEFAULT '{"folders":[],"steps":[],"edges":[]}'::jsonb,
  version       integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text NOT NULL DEFAULT '',
  CONSTRAINT catalog_workflow_doc_scope_key UNIQUE (scope),
  CONSTRAINT catalog_workflow_doc_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT catalog_workflow_doc_version_positive CHECK (version >= 1)
);

COMMENT ON TABLE catalog_workflow_doc IS 'Akış Takibi paneli — tek paylaşımlı JSON belge (workflowStore).';

-- ---------------------------------------------------------------------------
-- 2) Servis favorileri — GET/PUT /api/me/shortcuts (sd-service-shortcuts:v1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_shortcut_folder (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  name        text NOT NULL,
  tone        text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_shortcut_folder_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT user_shortcut_folder_tone CHECK (
    tone IS NULL OR tone IN ('none', 'critical', 'team', 'temp')
  )
);

CREATE INDEX IF NOT EXISTS user_shortcut_folder_user_sort_idx
  ON user_shortcut_folder (user_id, sort_order);

CREATE TABLE IF NOT EXISTS user_service_shortcut (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 text NOT NULL,
  service_definition_id   integer NOT NULL,
  canonical_name          text NOT NULL,
  alias                   text,
  folder_id               uuid,
  sort_order              integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_service_shortcut_user_service_key UNIQUE (user_id, service_definition_id),
  CONSTRAINT user_service_shortcut_canonical_len CHECK (char_length(trim(canonical_name)) >= 1),
  CONSTRAINT user_service_shortcut_alias_len CHECK (alias IS NULL OR char_length(trim(alias)) <= 140),
  CONSTRAINT user_service_shortcut_folder_fk FOREIGN KEY (folder_id)
    REFERENCES user_shortcut_folder (id) ON DELETE SET NULL,
  CONSTRAINT user_service_shortcut_service_fk FOREIGN KEY (service_definition_id)
    REFERENCES service_definition (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_service_shortcut_user_sort_idx
  ON user_service_shortcut (user_id, sort_order);

CREATE INDEX IF NOT EXISTS user_service_shortcut_folder_idx
  ON user_service_shortcut (folder_id)
  WHERE folder_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) DWH favorileri — GET/PUT /api/dwh/favorites (sd-dwh-favorites:v1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dwh_favorite_folder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   text NOT NULL,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dwh_favorite_folder_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS dwh_favorite_folder_owner_idx
  ON dwh_favorite_folder (owner_user_id);

CREATE TABLE IF NOT EXISTS dwh_favorite_table (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   text NOT NULL,
  table_id        integer NOT NULL,
  canonical_name  text NOT NULL,
  alias           text,
  root            boolean NOT NULL DEFAULT true,
  folder_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dwh_favorite_table_owner_table_key UNIQUE (owner_user_id, table_id),
  CONSTRAINT dwh_favorite_table_canonical_len CHECK (char_length(trim(canonical_name)) >= 1),
  CONSTRAINT dwh_favorite_table_folder_ids_array CHECK (jsonb_typeof(folder_ids) = 'array')
);

CREATE INDEX IF NOT EXISTS dwh_favorite_table_owner_idx
  ON dwh_favorite_table (owner_user_id);

-- ---------------------------------------------------------------------------
-- 4) Akış rotaları — /api/process-routes (sd-process-flow-routes:v1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS process_user_route (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_no        text NOT NULL,
  name              text NOT NULL,
  process_title     text,
  status            text NOT NULL DEFAULT 'draft',
  state             jsonb NOT NULL,
  graph_updated_at  timestamptz,
  owner_user_id     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_opened_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_user_route_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 140),
  CONSTRAINT process_user_route_status CHECK (status IN ('draft', 'completed')),
  CONSTRAINT process_user_route_state_object CHECK (jsonb_typeof(state) = 'object'),
  CONSTRAINT process_user_route_title_len CHECK (
    process_title IS NULL OR char_length(trim(process_title)) <= 140
  )
);

CREATE INDEX IF NOT EXISTS process_user_route_process_updated_idx
  ON process_user_route (process_no, updated_at DESC);

CREATE INDEX IF NOT EXISTS process_user_route_owner_opened_idx
  ON process_user_route (owner_user_id, last_opened_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS process_user_route_shared_process_idx
  ON process_user_route (process_no)
  WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS process_user_route_owner_name_key
  ON process_user_route (
    COALESCE(owner_user_id, ''),
    process_no,
    lower(trim(name))
  );

COMMENT ON TABLE process_user_route IS 'İş akışları paneli — Akış Rotaları; state = visits + cursor (processRouteStore).';

-- ---------------------------------------------------------------------------
-- 5) Süreç haritası yapışkan notları — /api/processes/:no/map-notes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS process_map_note (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_no      text NOT NULL,
  text            text NOT NULL,
  x               double precision NOT NULL,
  y               double precision NOT NULL,
  width           integer,
  height          integer,
  collapsed       boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  author_user_id  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_map_note_text_len CHECK (char_length(trim(text)) BETWEEN 1 AND 8000),
  CONSTRAINT process_map_note_width_range CHECK (width IS NULL OR width BETWEEN 64 AND 480),
  CONSTRAINT process_map_note_height_range CHECK (height IS NULL OR height BETWEEN 40 AND 360)
);

CREATE INDEX IF NOT EXISTS process_map_note_process_sort_idx
  ON process_map_note (process_no, sort_order);

-- ---------------------------------------------------------------------------
-- 6) Servis değişiklik günlüğü — /api/services/:id/changes (sd-service-changes)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_change_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_definition_id   integer NOT NULL,
  commit                  text NOT NULL,
  kinds                   text[] NOT NULL,
  kind_details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  note                    text NOT NULL DEFAULT '',
  author_user_id          text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_change_log_commit_len CHECK (char_length(trim(commit)) BETWEEN 1 AND 500),
  CONSTRAINT service_change_log_kinds_nonempty CHECK (cardinality(kinds) >= 1),
  CONSTRAINT service_change_log_kinds_allowed CHECK (
    kinds <@ ARRAY['input', 'output', 'function', 'contract', 'behavior']::text[]
  ),
  CONSTRAINT service_change_log_kind_details_object CHECK (jsonb_typeof(kind_details) = 'object'),
  CONSTRAINT service_change_log_service_fk FOREIGN KEY (service_definition_id)
    REFERENCES service_definition (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS service_change_log_service_created_idx
  ON service_change_log (service_definition_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7) Servis notları (MVP API → DB) — notes.ts bellek
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_note (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_definition_id   integer NOT NULL,
  author_user_id          text NOT NULL,
  author_name             text NOT NULL,
  author_team             text,
  body                    text NOT NULL,
  visibility              text NOT NULL DEFAULT 'team',
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_note_body_len CHECK (char_length(body) BETWEEN 1 AND 280),
  CONSTRAINT service_note_visibility CHECK (visibility IN ('team', 'all')),
  CONSTRAINT service_note_service_fk FOREIGN KEY (service_definition_id)
    REFERENCES service_definition (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS service_note_service_created_idx
  ON service_note (service_definition_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8) Değişiklik talebi + gelen kutusu — changeRequests.ts bellek
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS change_request (
  id                              text PRIMARY KEY,
  batch_id                        text,
  kind                            text NOT NULL,
  target_service_definition_id    integer,
  assignee_service_definition_id  integer NOT NULL,
  proposed_service_name           text,
  proposed_project_id             text,
  proposed_package_id             text,
  summary                         text NOT NULL,
  rationale                       text NOT NULL,
  description                     text,
  service_impact                  text,
  data_impact                     text,
  requester_user_id               text NOT NULL,
  requester_name                  text NOT NULL,
  requester_team                  text,
  requester_department            text,
  flag_status                     text NOT NULL DEFAULT 'unseen',
  flag_note                       text,
  owner_user_id                   text,
  owner_name                      text,
  owner_team                      text,
  created_at                      timestamptz NOT NULL,
  updated_at                      timestamptz NOT NULL,
  CONSTRAINT change_request_kind CHECK (kind IN ('change', 'new_service')),
  CONSTRAINT change_request_flag_status CHECK (
    flag_status IN ('unseen', 'accepted', 'rejected', 'hold_editing')
  ),
  CONSTRAINT change_request_summary_len CHECK (char_length(trim(summary)) >= 1),
  CONSTRAINT change_request_target_fk FOREIGN KEY (target_service_definition_id)
    REFERENCES service_definition (id) ON DELETE RESTRICT,
  CONSTRAINT change_request_assignee_fk FOREIGN KEY (assignee_service_definition_id)
    REFERENCES service_definition (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS change_request_assignee_updated_idx
  ON change_request (assignee_service_definition_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS change_request_target_updated_idx
  ON change_request (target_service_definition_id, updated_at DESC)
  WHERE target_service_definition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS change_request_batch_idx
  ON change_request (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS change_request_owner_flag_idx
  ON change_request (owner_user_id, flag_status);

CREATE TABLE IF NOT EXISTS change_request_dependency (
  change_request_id         text NOT NULL,
  service_definition_id   integer NOT NULL,
  sort_order              integer NOT NULL DEFAULT 0,
  PRIMARY KEY (change_request_id, service_definition_id),
  CONSTRAINT change_request_dependency_request_fk FOREIGN KEY (change_request_id)
    REFERENCES change_request (id) ON DELETE CASCADE,
  CONSTRAINT change_request_dependency_service_fk FOREIGN KEY (service_definition_id)
    REFERENCES service_definition (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inbox_notification (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL,
  kind                text NOT NULL,
  change_request_id   text NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  flag_status         text,
  service_name        text,
  batch_id            text,
  related_tasks       jsonb,
  read                boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL,
  CONSTRAINT inbox_notification_kind CHECK (
    kind IN ('approval_needed', 'flag_update', 'approval_open', 'approval_blocked')
  ),
  CONSTRAINT inbox_notification_flag_status CHECK (
    flag_status IS NULL OR flag_status IN ('unseen', 'accepted', 'rejected', 'hold_editing')
  ),
  CONSTRAINT inbox_notification_related_tasks_array CHECK (
    related_tasks IS NULL OR jsonb_typeof(related_tasks) = 'array'
  ),
  CONSTRAINT inbox_notification_request_fk FOREIGN KEY (change_request_id)
    REFERENCES change_request (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS inbox_notification_user_read_created_idx
  ON inbox_notification (user_id, read, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9) Snapshot kanıt paketi — snapshots.ts bellek
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS catalog_snapshot (
  id                      text PRIMARY KEY,
  change_request_id       text,
  service_definition_id   integer,
  snapshot_type           text NOT NULL,
  catalog_revision        text NOT NULL,
  payload                 jsonb NOT NULL,
  created_at              timestamptz NOT NULL,
  CONSTRAINT catalog_snapshot_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT catalog_snapshot_request_fk FOREIGN KEY (change_request_id)
    REFERENCES change_request (id) ON DELETE SET NULL,
  CONSTRAINT catalog_snapshot_service_fk FOREIGN KEY (service_definition_id)
    REFERENCES service_definition (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS catalog_snapshot_request_idx
  ON catalog_snapshot (change_request_id)
  WHERE change_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_snapshot_image (
  snapshot_id     text NOT NULL,
  surface         text NOT NULL,
  content_type    text NOT NULL,
  sha256          text NOT NULL,
  image_data      bytea NOT NULL,
  PRIMARY KEY (snapshot_id, surface),
  CONSTRAINT catalog_snapshot_image_request_fk FOREIGN KEY (snapshot_id)
    REFERENCES catalog_snapshot (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- İsteğe bağlı: extended süreç şemasında process(no) UNIQUE ise FK eklenebilir:
--
--   CREATE UNIQUE INDEX IF NOT EXISTS process_no_key ON process (no);
--   ALTER TABLE process_user_route ADD CONSTRAINT process_user_route_process_fk
--     FOREIGN KEY (process_no) REFERENCES process (no) ON DELETE RESTRICT;
--   ALTER TABLE process_map_note ADD CONSTRAINT process_map_note_process_fk
--     FOREIGN KEY (process_no) REFERENCES process (no) ON DELETE CASCADE;
-- ---------------------------------------------------------------------------
