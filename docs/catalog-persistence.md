# Ortak katalog kalıcılığı — tablolar, constraint’ler ve DDL

Favoriler, iş akışı belgesi, süreç rotaları, değişiklik günlüğü gibi veriler bugün çoğunlukla **tarayıcıda** (`localStorage`) veya **API belleğinde** tutuluyor. Bu belge, aynı veriyi **`inventory_db` / `env`** şemasında kalıcı hale getirmek için gereken tabloları, okuma/yazma uçlarını ve SQL’i toplar.

- **Özet bağlam:** [db.md §14](./db.md#14-ortak-katalog--kalıcılık-localstorage-yerine-db)
- **Tek seferde çalıştır:** [../server/sql/catalog_persistence.sql](../server/sql/catalog_persistence.sql)

**Migration sırası**

1. `server/sql/node_descriptions_migration.sql` — süreç düğüm açıklamaları (§0; zaten production’da olabilir).
2. `server/sql/catalog_persistence.sql` — §1–§9 tabloları.

**Genel kurallar**

- Tablolar `env` şemasında (`SET search_path TO env`).
- Kullanıcı kimliği kolonları SSO `personId` string’idir; ayrı `catalog_user` tablosu yok.
- PAR ingest ve servis dump import bu ekip tablolarına **dokunmaz**.
- `process_no` için Postgres FK yok (legacy şemada `no` kolonu / UNIQUE garantisi olmayabilir); API sürecin var olduğunu doğrular.
- DWH favori `table_id`, `stage` veritabanına referans verir; cross-DB FK tanımlanmaz.

---



## Okuma/yazma uçları — özet (API ↔ kalıcılık)

Sunucu **GET/PUT/POST** ile anlamlı ekip verisi ancak Postgres’te kayıt varken döndürür; `localStorage` HTTP ile okunamaz. Tablo yokken API boş döner veya UI eski veriyi tarayıcıdan gösterir — restart ve paylaşım güvenli değildir.


| Okuma/yazma ucu               | API durumu                                         | Kalıcılık için gerekli tablo/kolon                         | Tablo/kolon yokken                       |
| ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Süreç akış + düğüm notu okuma | **Var** — `GET …/flow`                             | `process.process_definition` + `process.node_descriptions` | Flow yine gelir; `nodeDescriptions` `{}` |
| Süreç düğüm notu yazma        | **Var** — `PATCH …/node-descriptions`              | `process.node_descriptions`                                | **503** veya patch yok                   |
| İş akışları belgesi           | **Yok** — hedef `GET/PUT /api/workflows`           | `catalog_workflow_doc`                                     | GET anlamsız; UI localStorage            |
| Servis favorileri             | **Yok** — hedef `GET/PUT /api/me/shortcuts`        | `user_shortcut_folder`, `user_service_shortcut`            | Kişisel; cihazlar arası yok              |
| DWH favorileri                | **Yok** — hedef `GET/PUT /api/dwh/favorites`       | `dwh_favorite_folder`, `dwh_favorite_table`                | Aynı                                     |
| Akış rotaları                 | **Yok** — hedef `/api/process-routes`              | `process_user_route`                                       | Rotalar sadece local                     |
| Harita yapışkan not           | **Yok** — hedef `GET/PUT …/map-notes`              | `process_map_note`                                         | Notlar sadece local                      |
| Servis değişiklik günlüğü     | **Yok** — hedef `…/services/:id/changes`           | `service_change_log`                                       | Günlük sadece local                      |
| Servis notları (harita)       | **Var (bellek)** — `GET/POST …/notes`              | `service_note` (hedef)                                     | Restart’ta notlar silinir                |
| Değişiklik talebi             | **Var (bellek)** — `POST/GET /api/change-requests` | `change_request`, `change_request_dependency`              | Restart’ta talepler silinir              |
| Gelen kutusu                  | **Var (bellek)** — `GET /api/inbox/:id`            | `inbox_notification` + `change_request`                    | Aynı                                     |
| Owner bayrağı                 | **Var (bellek)** — `PATCH …/flags/:serviceId`      | `change_request.flag_`* kolonları                          | Aynı                                     |
| Snapshot                      | **Var (bellek)** — `POST/GET /api/snapshots`       | `catalog_snapshot`, `catalog_snapshot_image`               | Restart’ta PNG/metadata gider            |


Aşağıdaki §0–§9 bölümlerinde her paket için **“Okuma/yazma — neden gerekli?”** alt başlığı uç bazında tekrarlanır.

---



## §0 — Süreç düğüm açıklamaları (zaten DB + API var)

**Uygulama yeri:** Süreç haritası → düğüme tıkla → sağ **Detay** çekmecesi (`ProcessFlowDetailDrawer`) — düğüm notu başlık/metin.

**Bugün:** `env.process.node_descriptions` jsonb + `GET /api/processes/:no/flow` + `PATCH …/node-descriptions`.

### Okuma/yazma — neden gerekli?

- `GET /api/processes/:no/flow` — Akış haritasını ve detay çekmecesini doldurmak için zaten `process.process_definition` (PAR) okunur. **Düğüm açıklamaları** için ek olarak `process.node_descriptions` kolonu gerekir; kolon yoksa API akışı yine döner, `nodeDescriptions` boş kalır.
- `PATCH /api/processes/:no/node-descriptions` — Detay çekmecesinde kaydetmek için **aynı kolona yazma** şarttır; kolon yoksa patch **503**. Okuma ucu tek başına yazmayı karşılamaz — overlay verisi PATCH ile güncellenir.

**Kolon:** `node_descriptions jsonb NULL` — key: XML düğüm `name`. PAR ingest dokunmaz.

**Migration DDL** (`server/sql/node_descriptions_migration.sql`):

```sql
ALTER TABLE process ADD COLUMN IF NOT EXISTS node_descriptions jsonb;
```

**API doğrulama (uygulama):** `nodeKey` max 200; `title` max 200; `text` max 12_000; yazma `assertCatalogWrite`.

---



## §1 — İş akışları (Akış Takibi)

**Uygulama yeri:** Servisler → yan panel **İş akışları** → bölüm **Akış Takibi** (Yeni akış / Yeni klasör / Servisi ekle, sürükle-bırak, adım girdi-çıktı).

**Bugün:** `localStorage` `sd-service-workflows:v1` — `web/src/workflowStore.ts`.

**Hedef API:** `GET /api/workflows`, `PUT /api/workflows` (`canEdit`, optimistic `version`).

**Kapsam:** Ortak katalog — tek paylaşımlı belge (`scope = 'global'`).

### Okuma/yazma — neden gerekli?

- `GET /api/workflows` (henüz yok) — Panel açılınca tüm **Akış Takibi** ağacını sunucudan almak için `catalog_workflow_doc.payload` okunmalıdır. Tablo boşsa GET `{}` / default `folders/steps/edges` dönebilir; **tablo yoksa** sunucu localStorage’a erişemez → UI ya hep boş görür ya local fallback kullanır (ekip paylaşımı olmaz).
- `PUT /api/workflows` (henüz yok) — Düzenleme kaydı için **aynı satıra yazma** gerekir (`payload`, `version`, `updated_by`). **Sadece GET + tablo** migration olmadan anlamlı ortak veri yok; ilk anlamlı içerik PUT veya import ile gelir.



### Tablo: `env.catalog_workflow_doc`


| Kolon        | Tip              | Açıklama                                                     |
| ------------ | ---------------- | ------------------------------------------------------------ |
| `id`         | uuid PK          | Satır kimliği                                                |
| `scope`      | text NOT NULL    | Belge kapsamı; şimdilik `'global'`                           |
| `payload`    | jsonb NOT NULL   | `folders`, `steps`, `edges` — `workflowStore` ile aynı şekil |
| `version`    | integer NOT NULL | Optimistic lock; PUT uyuşmazsa 409                           |
| `updated_at` | timestamptz      | Son yazım                                                    |
| `updated_by` | text             | SSO id                                                       |


**Constraint’ler**

- `UNIQUE (scope)` — tek ortak belge.
- `CHECK jsonb_typeof(payload) = 'object'`.
- `CHECK version >= 1`.

**Bağlantılar**

- `payload.steps[].serviceId` → mantıksal `env.service_definition(id)` (jsonb içi; API doğrular).
- **API limit:** klasör ≤ 40, adım ≤ 120, klasör derinliği ≤ 4.



### DDL

```sql
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
```

---



## §2 — Servis favorileri (Favorilerim)

**Uygulama yeri:** Servisler → yan panel **Favorilerim** (`ShortcutsPanel`) — klasörler, kısayol, görünen ad.

**Bugün:** `localStorage` `sd-service-shortcuts:v1` — `web/src/serviceShortcuts.ts`.

**Hedef API:** `GET /api/me/shortcuts`, `PUT /api/me/shortcuts` (tam belge replace).

**Kapsam:** Kişisel — `user_id` = oturum.

### Okuma/yazma — neden gerekli?

- `GET /api/me/shortcuts` (henüz yok) — **Favorilerim** panelini oturum kullanıcısı için yüklemek için `user_shortcut_folder` **+** `user_service_shortcut` (`user_id = session`) okunur. Tablo yoksa GET `[]` — UI localStorage fallback ile devam eder.
- `PUT /api/me/shortcuts` (henüz yok) — Klasör/kısayol değişikliğini kalıcı yapmak için iki tabloya **replace veya diff yazma** gerekir. Okuma ucu olmadan PUT da anlamsız; ikisi birlikte localStorage’ın yerini alır.



### Tablo: `env.user_shortcut_folder`


| Kolon        | Tip           | Açıklama                              |
| ------------ | ------------- | ------------------------------------- |
| `id`         | uuid PK       | Klasör id                             |
| `user_id`    | text NOT NULL | Sahip                                 |
| `name`       | text NOT NULL | Klasör adı                            |
| `tone`       | text          | `critical` / `team` / `temp` / `none` |
| `sort_order` | integer       | Sıra                                  |
| `created_at` | timestamptz   |                                       |


**Constraint:** ad 1–120 karakter; `tone` enum CHECK.

**Index:** `(user_id, sort_order)`.

### Tablo: `env.user_service_shortcut`


| Kolon                   | Tip              | Açıklama              |
| ----------------------- | ---------------- | --------------------- |
| `id`                    | uuid PK          | Kısayol id            |
| `user_id`               | text NOT NULL    | Sahip                 |
| `service_definition_id` | integer NOT NULL | FK → servis           |
| `canonical_name`        | text NOT NULL    | DB servis adı kopyası |
| `alias`                 | text             | Görünen ad            |
| `folder_id`             | uuid             | Opsiyonel klasör      |
| `sort_order`            | integer          | Sıra                  |


**Constraint’ler**

- `UNIQUE (user_id, service_definition_id)` — aynı servis iki kez favori olamaz.
- **FK** `service_definition_id` → `service_definition(id)` ON DELETE CASCADE.
- **FK** `folder_id` → `user_shortcut_folder(id)` ON DELETE SET NULL.

**API limit:** max 8 klasör, 24 kısayol (uygulama).

### DDL

```sql
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
```

---



## §3 — DWH favorileri

**Uygulama yeri:** DWH → **Favorilerim** paneli (`DwhFavoritesPanel`) — tablo yıldız, klasör, alias.

**Bugün:** `localStorage` `sd-dwh-favorites:v1` — `web/src/dwh/dwhFavorites.ts`.

**Hedef API:** `GET /api/dwh/favorites`, `PUT /api/dwh/favorites`.

**Kapsam:** Kişisel — `owner_user_id`.

### Okuma/yazma — neden gerekli?

- `GET /api/dwh/favorites` (henüz yok) — DWH **Favorilerim** paneli için `dwh_favorite_folder` + `dwh_favorite_table` (`owner_user_id`) okunur. Stage tabloları ayrı DB’de; favori **işareti** inventory_db’de tutulur.
- `PUT /api/dwh/favorites` (henüz yok) — Haritadan yıldız / klasör taşıma kalıcı olsun diye aynı tablolara yazma gerekir. `table_id` için stage’e FK yok; PUT sırasında API `table_id` geçerliliğini soft kontrol eder.



### Tablo: `env.dwh_favorite_folder`


| Kolon           | Tip           | Açıklama   |
| --------------- | ------------- | ---------- |
| `id`            | uuid PK       |            |
| `owner_user_id` | text NOT NULL |            |
| `name`          | text NOT NULL | Klasör adı |


**Index:** `(owner_user_id)`.

### Tablo: `env.dwh_favorite_table`


| Kolon                      | Tip              | Açıklama               |
| -------------------------- | ---------------- | ---------------------- |
| `id`                       | uuid PK          |                        |
| `owner_user_id`            | text NOT NULL    |                        |
| `table_id`                 | integer NOT NULL | Stage katalog tablo id |
| `canonical_name`           | text NOT NULL    |                        |
| `alias`                    | text             |                        |
| `root`                     | boolean          | Kök listede mi         |
| `folder_ids`               | jsonb            | Klasör uuid dizisi     |
| `created_at`, `updated_at` | timestamptz      |                        |


**Constraint’ler**

- `UNIQUE (owner_user_id, table_id)`.
- `folder_ids` jsonb dizi CHECK.

**Bağlantı:** `folder_ids` → aynı kullanıcının `dwh_favorite_folder.id` (API doğrular, FK yok).

**API limit:** 20 klasör, 100 favori tablo.

### DDL

```sql
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
```

---



## §4 — Akış rotaları

**Uygulama yeri:** **İş akışları** paneli → **Akış Rotaları**; süreç haritası **Akış Rotanı Oluştur** (`ProcessFlowMap` / `ProcessFlowRouteBuilder`).

**Bugün:** `localStorage` `sd-process-flow-routes:v1` — `web/src/processRouteStore.ts`.

**Hedef API:** `GET /api/process-routes?processNo=`, `GET …/:id`, `POST`, `PATCH`, `DELETE`.

**Kapsam:** `owner_user_id` NULL → ortak; dolu → kişisel.

### Okuma/yazma — neden gerekli?

- `GET /api/process-routes?processNo=` (henüz yok) — **Akış Rotaları** listesi ve sürece göre filtre için `process_user_route` okunur (ortak + kişisel politika API’de). Tablo yoksa liste boş; UI **localStorage** fallback.
- `GET /api/process-routes/:id` — Tek rotayı rota modunda açmak için `state` **jsonb** + metadata satırı gerekir.
- `POST /PATCH /DELETE` (henüz yok) — Kaydet, yeniden adlandır, sil, `last_opened_at` için satır yazma gerekir. **Okuma ucu tablo olmadan yazılamaz**; tablo boşken GET `[]`, ilk kayıt POST ile gelir.



### Tablo: `env.process_user_route`


| Kolon                                        | Tip            | Açıklama                                  |
| -------------------------------------------- | -------------- | ----------------------------------------- |
| `id`                                         | uuid PK        |                                           |
| `process_no`                                 | text NOT NULL  | Süreç no                                  |
| `name`                                       | text NOT NULL  | Liste adı (max 140)                       |
| `process_title`                              | text           | UI başlık                                 |
| `status`                                     | text           | `draft` | `completed`                     |
| `state`                                      | jsonb NOT NULL | `{ visits[], cursor }` — `UserRouteState` |
| `graph_updated_at`                           | timestamptz    | Graf revizyonu                            |
| `owner_user_id`                              | text           | NULL = paylaşımlı                         |
| `created_at`, `updated_at`, `last_opened_at` | timestamptz    |                                           |


**Constraint’ler**

- `status IN ('draft','completed')`.
- `state` jsonb object CHECK.
- **UNIQUE** `(COALESCE(owner_user_id,''), process_no, lower(trim(name)))`.

**Index:** `(process_no, updated_at DESC)`; kişisel `(owner_user_id, last_opened_at DESC)`; ortak `(process_no) WHERE owner_user_id IS NULL`.

**Bağlantı:** `process_no` → `env.process` (uygulama EXISTS; FK opsiyonel — §10).

**API limit:** 60 rota/kullanıcı; 300 visit/rota.

### DDL

```sql
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
```

---



## §5 — Süreç haritası yapışkan notları

**Uygulama yeri:** Süreç **Tam akış** canvas — **Not ekle** (`ProcessFlowCanvas` / `ProcessFlowMap`).

**Bugün:** `localStorage` `sd-process-flow-map:{processNo}` — `web/src/components/process/processFlowNotes.ts`.

**Hedef API:** `GET /api/processes/:no/map-notes`, `PUT` (liste replace) veya CRUD.

**Not:** Düğüm sürükleme layout’u (`sd-process-flow-v3`) bilinçli **DB dışı**.

### Okuma/yazma — neden gerekli?

- `GET /api/processes/:no/map-notes` (henüz yok) — **Not ekle** kutularını süreç haritasında göstermek için `process_map_note` (`process_no`) okunur.
- `PUT /api/processes/:no/map-notes` (veya CRUD) — Sürükle, metin, boyut, silme kalıcı olsun diye aynı tabloya yazma gerekir. Akış XML’i (`process_definition`) not metnini tutmaz — bu uç için **ayrı tablo şart**.



### Tablo: `env.process_map_note`


| Kolon                      | Tip              | Açıklama        |
| -------------------------- | ---------------- | --------------- |
| `id`                       | uuid PK          |                 |
| `process_no`               | text NOT NULL    |                 |
| `text`                     | text NOT NULL    | 1–8000 karakter |
| `x`, `y`                   | double precision | Konum           |
| `width`, `height`          | integer          | 64–480 / 40–360 |
| `collapsed`                | boolean          |                 |
| `sort_order`               | integer          |                 |
| `author_user_id`           | text NOT NULL    |                 |
| `created_at`, `updated_at` | timestamptz      |                 |


**Index:** `(process_no, sort_order)`.

### DDL

```sql
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
```

---



## §6 — Servis değişiklik günlüğü (Son değişiklikler)

**Uygulama yeri:** Servis → sekme **Servis işlevi** → karo **Son değişiklikler** (`ServiceChangeLog`).

**Bugün:** `localStorage` `sd-service-changes:{serviceId}`.

**Hedef API:** `GET/POST/PATCH/DELETE /api/services/:id/changes` (`canEdit`).

### Okuma/yazma — neden gerekli?

- `GET /api/services/:id/changes` (henüz yok) — **Son değişiklikler** karo listesi için `service_change_log` (`service_definition_id`) okunur.
- `POST/PATCH/DELETE` (henüz yok) — “+ Not ekle” / düzenle / sil için satır yazma gerekir (`canEdit`). Servis teknik alanları (`service_definition`) deploy günlüğünü tutmaz — **ayrı tablo gerekli**.



### Tablo: `env.service_change_log`


| Kolon                      | Tip              | Açıklama                                              |
| -------------------------- | ---------------- | ----------------------------------------------------- |
| `id`                       | uuid PK          |                                                       |
| `service_definition_id`    | integer NOT NULL | FK servis                                             |
| `commit`                   | text NOT NULL    | Hash / referans (max 500)                             |
| `kinds`                    | text[] NOT NULL  | `input`, `output`, `function`, `contract`, `behavior` |
| `kind_details`             | jsonb            | Tür → açıklama                                        |
| `note`                     | text             | Birleşik metin                                        |
| `author_user_id`           | text NOT NULL    |                                                       |
| `created_at`, `updated_at` | timestamptz      |                                                       |


**Constraint’ler**

- **FK** → `service_definition(id)` ON DELETE RESTRICT.
- `kinds` en az 1 eleman; alt küme enum CHECK.

**Index:** `(service_definition_id, created_at DESC)`.

### DDL

```sql
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
```

---



## §7 — Servis notları (harita MVP)

**Uygulama yeri:** Servis **Harita** — servis notları popup (`ImpactMap`; API `notes.ts` bellek).

**Hedef:** Aynı REST’in Postgres karşılığı.

### Okuma/yazma — neden gerekli?

- `GET /api/services/:id/notes` (**var**, bellek) — Harita not popup listesi; kalıcı olması için `service_note` okunmalı. Bugün bellek → restart silinir.
- `POST /api/services/:id/notes`, `DELETE /api/notes/:id` (**var**, bellek) — Yazma için `service_note` insert/delete gerekir. Okuma ucu DB’ye taşınmadan yazma da kalıcı olmaz.



### Tablo: `env.service_note`


| Kolon                                          | Tip         | Açıklama       |
| ---------------------------------------------- | ----------- | -------------- |
| `id`                                           | uuid PK     |                |
| `service_definition_id`                        | integer FK  |                |
| `author_user_id`, `author_name`, `author_team` | text        |                |
| `body`                                         | text        | 1–280 karakter |
| `visibility`                                   | text        | `team` | `all` |
| `created_at`                                   | timestamptz |                |


**FK:** `service_definition(id)` ON DELETE CASCADE.

### DDL

```sql
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
```

---



## §8 — Değişiklik talebi ve Gelen kutusu

**Uygulama yeri:** **Değişiklik Talebi** modalı; yan **Gelen kutusu** (`InboxPanel`); talep detayı owner bayrağı.

**Bugün:** `server/src/changeRequests.ts` bellek.

**Hedef:** Mevcut `/api/change-requests`, `/api/inbox/`* → Postgres.

**Model:** Her satır = UI’daki tek task (`T-546`); `batch_id` ile gruplanır.

### Okuma/yazma — neden gerekli?

- `POST /api/change-requests` (**var**, bellek) — Talep açmak için `change_request` (+ `new_service` ise `change_request_dependency`) insert gerekir; restart’ta kaybolmaması için DB şart.
- `GET /api/change-requests/:id`, `GET /api/services/:id/change-requests` — Detay ve servis geçmişi için aynı tablo(lar) okunur.
- `PATCH /api/change-requests/:id/flags/:serviceId` — Owner bayrağı için `change_request.flag_status`, `flag_note` güncellenir.
- `GET /api/inbox/:ownerId`, `POST …/read` — `inbox_notification` + join `change_request`; bildirim kalıcı değilse gelen kutusu restart’ta boşalır.



### Tablo: `env.change_request`


| Kolon                                 | Tip              | Açıklama                                         |
| ------------------------------------- | ---------------- | ------------------------------------------------ |
| `id`                                  | text PK          | Örn. `T-546`                                     |
| `batch_id`                            | text             | Çoklu task grubu                                 |
| `kind`                                | text             | `change` | `new_service`                         |
| `target_service_definition_id`        | integer          | Değişen servis                                   |
| `assignee_service_definition_id`      | integer NOT NULL | Onay muhatabı servis                             |
| `proposed_*`                          | text             | Yeni servis alanları                             |
| `summary`, `rationale`, `description` | text             | Form metinleri                                   |
| `service_impact`, `data_impact`       | text             | Sekme metinleri                                  |
| `requester_*`                         | text             | Talep eden                                       |
| `flag_status`                         | text             | `unseen`, `accepted`, `rejected`, `hold_editing` |
| `flag_note`                           | text             | Owner notu (red vb.)                             |
| `owner_*`                             | text             | Assignee servis owner                            |
| `created_at`, `updated_at`            | timestamptz      |                                                  |


**FK:** `target_`* ve `assignee_*` → `service_definition(id)`.

**Index:** assignee/target/batch/owner+flag.

### Tablo: `env.change_request_dependency`

**Amaç:** `new_service` — “çağıracağı servisler” (`dependsOnServiceIds`).

**PK:** `(change_request_id, service_definition_id)` — FK talep + servis.

### Tablo: `env.inbox_notification`

**Amaç:** Gelen kutusu bildirimleri (`approval_needed`, …).

**FK:** `change_request_id` → `change_request(id)` ON DELETE CASCADE.

**Index:** `(user_id, read, created_at DESC)`.

### DDL

```sql
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
```

---



## §9 — Snapshot paketi

**Uygulama yeri:** Değişiklik talebi / servis ekranı snapshot akışı (`snapshots.ts` bellek).

**Hedef:** `POST/GET /api/snapshots`, görüntü `…/image`.

### Okuma/yazma — neden gerekli?

- `POST /api/snapshots` (**var**, bellek) — Talep anında kanıt paketi için `catalog_snapshot.payload` + `catalog_snapshot_image.image_data` yazılır; bellekte PNG büyük ve geçici.
- `GET /api/snapshots/:id`, `GET …/image`, `GET /api/change-requests/:id/snapshots` — Geçmiş talepte harita görüntüsünü göstermek için aynı tablolar okunur. `change_request_id` opsiyonel FK talebe bağlar.



### Tablo: `env.catalog_snapshot`


| Kolon                   | Tip         | Açıklama            |
| ----------------------- | ----------- | ------------------- |
| `id`                    | text PK     |                     |
| `change_request_id`     | text        | Opsiyonel FK talep  |
| `service_definition_id` | integer     | Opsiyonel FK servis |
| `snapshot_type`         | text        |                     |
| `catalog_revision`      | text        |                     |
| `payload`               | jsonb       | Trail, etki özeti   |
| `created_at`            | timestamptz |                     |




### Tablo: `env.catalog_snapshot_image`

**PK:** `(snapshot_id, surface)` — PNG `bytea`, `sha256`, `content_type`.

**FK:** `snapshot_id` → `catalog_snapshot(id)` ON DELETE CASCADE.

### DDL

```sql
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
```

---



## §10 — İsteğe bağlı: `process_no` foreign key

Extended şemada `process(no)` gerçekten UNIQUE ise:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS process_no_key ON process (no);

ALTER TABLE process_user_route ADD CONSTRAINT process_user_route_process_fk
  FOREIGN KEY (process_no) REFERENCES process (no) ON DELETE RESTRICT;

ALTER TABLE process_map_note ADD CONSTRAINT process_map_note_process_fk
  FOREIGN KEY (process_no) REFERENCES process (no) ON DELETE CASCADE;
```

Legacy şemada (`no` kolonu yok) bu blok **uygulanmaz**.

---



## §11 — Bilinçli DB dışı (referans)


| Veri                                         | Yer                           |
| -------------------------------------------- | ----------------------------- |
| Tema, MRU, ziyaret yolu, ilişki tablosu UI   | localStorage / bellek         |
| Süreç düğüm canvas koordinatları             | `sd-process-flow-v3:{no}`     |
| Teknik katalog (servis, call-graph, PAR XML) | Mevcut env tabloları — ingest |


---



## Tablo özeti (sıra = migration sırası)

1. `catalog_workflow_doc`
2. `user_shortcut_folder` → `user_service_shortcut`
3. `dwh_favorite_folder` → `dwh_favorite_table`
4. `process_user_route`
5. `process_map_note`
6. `service_change_log`
7. `service_note`
8. `change_request` → `change_request_dependency` → `inbox_notification`
9. `catalog_snapshot` → `catalog_snapshot_image`

**Mevcut FK hub:** `env.service_definition(id)` — change log, kısayol, CR, servis notu, snapshot.