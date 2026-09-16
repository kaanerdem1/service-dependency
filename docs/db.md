# Inventory DB — katalog rehberi

**inventory_db**, `env` şemasında servis, metod, call-graph ve süreç XML verisini tutar. UI’daki modül ağacı, etki haritası ve süreç akışı bu tablolardan beslenir.

**İlgili:** [Kurulum](../README.md) · [process-flow.md](./process-flow.md) · bağlantı: `server/.env` (`INVENTORY_PG`*)

### İçindekiler (okuma sırası)


| §                                                             | Konu                                 |
| ------------------------------------------------------------- | ------------------------------------ |
| [2](#2-tablolar)                                              | Tablolar ve hiyerarşi                |
| [3](#3-api--db)                                               | API ↔ DB eşlemesi                    |
| [4](#4-sol-ağaç-uygulama)                                     | Sol ağaç davranışı                   |
| [5](#5-kenarlar)                                              | Kenar / rollup kuralları             |
| [6](#6-ortam)                                                 | Postgres ortamı (inventory vs stage) |
| [7–12](#7-fazlar)                                             | Fazlar, SSS, SQL, ölçümler           |
| [13](#13-process-xml--db-eski-hale-döndü--tabloya-yazılmıyor) | **Acil:** süreç XML boş / ingest     |
| [14](#14-ortak-katalog--kalıcılık-localstorage-yerine-db)     | localStorage → DB kalıcılık planı    |


> §13 numarası tarihsel; sorun giderme için erken bölüme alınmıştır.

---



## 2. Tablolar



### 2.1 Hiyerarşi (sahiplik)


| Tablo                | Ne                                  | UI                                               |
| -------------------- | ----------------------------------- | ------------------------------------------------ |
| `project_group`      | Kök gruplar (CCS, ACC, …)           | Ağaç: **Grup** (`pg-{id}`)                       |
| `project`            | Gruba bağlı; pratikte jar kapsayıcı | Ağaçta **gösterilmez** (grup → jar)              |
| `artifact`           | Taranan **jar**                     | Ağaç: **Jar** (`art-{id}`)                       |
| `java_class`         | Sınıf; `artifact_id` → jar          | Ağaçta yok; join için                            |
| `java_method`        | Metod; `class_id` → class           | Servis altı entry metod / call-graph (`jm-{id}`) |
| `service_definition` | İş servisi (`status = 1`)           | Pivot / onay birimi (`sd-{id}`)                  |


**Önemli:** `service_definition` üzerinde `project_id` yok. Jar yolu:

```text
java_method.service_definition_id → java_class → artifact → project → project_group
```



### 2.2 Servis ↔ metod


| Kayıt                                           | Anlam                                                          |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `java_method` (tümü)                            | ~224k call-graph düğümü                                        |
| `java_method.service_definition_id IS NOT NULL` | Entry metod (~12k)                                             |
| `service_definition`                            | `service_name`, `method_name`, `package_name`, `class_name`, … |


Onay ve etki özeti **servis** (`service_definition.id`) bazında.

### 2.3 Call-graph

`env.call_edge`: `caller_id` / `callee_id` → `java_method.id`.

Cross-service: caller ve callee metodlarının `service_definition_id` farklıysa servis rollup’ına girer. `service_definition_id` NULL çağrılar rollup’a girmez (internal).

### 2.4 Ekran / process (kullanılmıyor)

`screen`, `screen_service`, `process`, `process_service` — keşif katmanı, onay kapısı değil. **F3.**

### 2.5 Diğer


| Tablo                                                                 | Rol                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| `service_owner`                                                       | IT / iş sahibi — **F4**, join kuralı ingest’te netleşecek |
| `service_process`, `screen_process`, `process_group`, `process_owner` | Süreç / sahiplik                                          |


---



## 3. API ↔ DB


| API                                         | Kaynak                                                                |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/modules`                          | `project_group` (kök) + `Konumsuz servisler`                          |
| `GET /api/modules/:id/children`             | Grup → jar; jar → servis (ilk 100); konumsuz liste                    |
| `GET /api/services?q=`                      | `service_definition` (`service_name` / `package_name` / `class_name`) |
| `GET /api/services/:id`                     | Servis + konum (entry join) + rollup sayaçları                        |
| `GET /api/services/:id/locations`           | Tüm jar yolları                                                       |
| `GET /api/services/:id/affected`, `/impact` | `call_edge` rollup + BFS                                              |
| `GET /api/methods`, callers/callees         | `java_method`, `call_edge`                                            |
| `GET /api/dwh/*`                            | Postgres `stage` — **değişmez**                                       |


Id: `pg-{id}`, `art-{id}`, `sd-{service_definition.id}`, `jm-{java_method.id}`.

---



## 4. Sol ağaç (uygulama)

```
Grup (project_group)
  └─ Jar (artifact)
       └─ Servis  → (chevron) entry metodlar
            └─ (checkbox) servis dışı metodlar — jar altında ayrı blok
Konumsuz servisler (N)
  └─ entry metodu olmayan aktif servisler (ilk 100)
```

Lazy: 37k servis + 224k metod tek seferde açılmaz.

**Ağaçta yok:** `call_edge`, remote servis child, `java_class`, `project` katmanı, screen/process.

**Arama:** servis + metod aynı listede rozetle. Konumsuz servis isimle bulunur.

**Çoklu jar:** dump’ta entry zinciriyle ölçülünce 0 (12.116 servis, tek jar). Kurallar: ağaçta tek canonical düğüm; `locations` tüm yollar; harita `sd-{id}` ile jar’dan bağımsız.

**Servis dışı metod:** `service_definition_id IS NULL`. Varsayılan kapalı; jar checkbox ile sayfalı (50).

---



## 13. Process XML — DB “eski hale döndü” / tabloya yazılmıyor

Süreç haritası açılmıyorsa veya isimler ham `.par` görünüyorsa önce bu bölüme bak.

### Belirtiler

- Süreç listesinde isimler yine `.par` / ham `name`; **Türkçe label** (`description_tr`) yok.
- Akış haritası açılmıyor veya çok az süreçte grafik var.
- `env.process.process_definition` **NULL** veya çok kısa; ingest “updated=0”.
- Dün düzgündü, bugün dump **restore** / yeni katalog import sonrası bozuldu.



### Neden (veri silinmedi — zenginleştirme gitti)


| Olay                                                                                             | Sonuç                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `inventory_db` **eski dump restore**                                                             | `description_tr` + `process_definition` üzerine yazılan PAR verisi gider |
| Şema **RENAME** (`name`→`no`, eski `description_tr`→`name`) migration sonrası ingest **atlandı** | Kolonlar var ama XML/label boş                                           |
| `process_definition` kolonu hiç yok                                                              | API yalnızca disk fallback (`PROCESS_PAR_ROOT`) veya akış yok            |
| `PROCESS_PAR_ROOT` yanlış / ingest çalıştırılmadı                                                | Tablo dolmaz; sadece API env ile açık süreçler diskten okunabilir        |


SQL migration dosyasını silmek veya repo’yu eski commit’e almak **Postgres’teki veriyi geri getirmez**.

### Teşhis (1 dakika)

API ayaktayken:

```bash
curl -s http://127.0.0.1:4000/api/meta/process-catalog-health | jq
# veya
cd server && npm run verify:process-catalog
```

Bakılacaklar: `ok`, `hasDefinitionColumn`, `withXml`, `withTurkishLabel`, `featured` (105801 / 105251 / 105116).

SQL ile örnek:

```sql
SELECT no, LEFT(name, 40) AS name, LEFT(description_tr, 50) AS label,
       LENGTH(process_definition) AS xml_len
FROM env.process
WHERE status = 1 AND no IN ('105801','105251','105116');
```

`xml_len` NULL veya 100’den küçükse tablo tarafı boş.

### Onarım sırası (tekrar yaşanırsa aynı adımlar)

1. **Doğru DB’ye bağlandığını doğrula** — `INVENTORY_PGDATABASE=inventory_db`, şema `env` (`server/.env`).
2. **Kolonlar yoksa** (health: `hasDefinitionColumn: false`):

```bash
psql -h 127.0.0.1 -U postgres -d inventory_db -f server/sql/process_par_migration.sql
```

1. **PAR → tablo ingest** (asıl doldurma adımı):

```bash
cd server
PROCESS_PAR_ROOT=/path/to/par npm run ingest:process-par
```

Script: `server/scripts/ingest-process-par.mjs` — klasör adındaki leading digits → `process.no`, `description_tr` ← XML label, `process_definition` ← tam XML.

1. **API’yi yeniden başlat** — ingest sonrası; uzun işlerde `npm start` tercih et (`tsx watch` takılabilir).
2. **Doğrula** — `npm run verify:process-catalog` veya health endpoint `ok: true`, `withXml` yüzlerce+.



### Geçici fallback (tablo boşken tek süreç denemek)

Sunucu env’inde `PROCESS_PAR_ROOT=/path/to/par` verilirse `getProcessFlow` diskten `processdefinition.xml` okuyabilir — **kalıcı çözüm değil**; tabloya ingest edin.

### İlgili dosyalar


| Dosya                                          | Rol                         |
| ---------------------------------------------- | --------------------------- |
| `server/sql/process_par_migration.sql`         | Kolon ekleme + şema notları |
| `server/scripts/ingest-process-par.mjs`        | XML → `env.process`         |
| `server/src/inventory/processCatalogHealth.ts` | Health + `repairCommand`    |
| `server/.env.example`                          | Kısa hatırlatma yorumları   |


---



## 5. Kenarlar



### 5.1 Metod

```sql
SELECT caller_id, callee_id FROM env.call_edge;
```

`MethodRef.id` = `jm-{id}`; pivot etrafında limit.

### 5.2 Servis rollup (`affectsEdges`)

Çağrı: `caller metod → callee metod`.  
Etki: **callee servisi değişince caller servisi etkilenir.**

```text
affectsEdges[callee_servis_id] += caller_servis_id
```

```sql
SELECT DISTINCT
  sd_callee.id AS callee_service_id,
  sd_caller.id AS caller_service_id
FROM env.call_edge ce
JOIN env.java_method jm_caller ON jm_caller.id = ce.caller_id
JOIN env.java_method jm_callee ON jm_callee.id = ce.callee_id
JOIN env.service_definition sd_caller ON sd_caller.id = jm_caller.service_definition_id
JOIN env.service_definition sd_callee ON sd_callee.id = jm_callee.service_definition_id
WHERE sd_caller.id <> sd_callee.id
  AND sd_caller.status = 1 AND sd_callee.status = 1;
```

Yanlış: `affects[caller] += callee` — onay ve harita ters döner.

Açılışta bellek `Map`; dump sonrası `REFRESH MATERIALIZED VIEW` (varsa) + API restart.

### 5.3 Ekran / process — F3

```sql
SELECT s.name AS screen, sd.service_name
FROM env.screen_service ss
JOIN env.screen s ON s.oid = ss.screen_oid
JOIN env.service_definition sd ON sd.id = ss.service_oid;
```

---



## 6. Ortam

DWH ve inventory **ayrı** DB:

```env
PGDATABASE=postgres
PGSCHEMA=stage

CATALOG_SOURCE=inventory
INVENTORY_PGDATABASE=inventory_db
INVENTORY_PGSCHEMA=env
INVENTORY_PGHOST=127.0.0.1
INVENTORY_PGPORT=5432
INVENTORY_PGUSER=postgres
INVENTORY_PGPASSWORD=
```

`tsx watch` uzun ingest/katalog yükünde kilitlenebilir; `npm start` (`server/`) daha stabil.

**Süreç XML (PAR):** Kolonlar `env.process.description_tr` (Türkçe label) ve `env.process.process_definition` (tam XML). Bunlar **dump/restore ile gelmez** — ayrı migration + ingest gerekir (aşağı §13).

---



## 7. Fazlar


| Faz      | Kapsam                                                            | Durum         |
| -------- | ----------------------------------------------------------------- | ------------- |
| **F1**   | Inventory pool, lazy Grup→jar→servis, arama, detay                | **Yapıldı**   |
| **F2**   | `call_edge` rollup, harita / Tablo / metod graph, hub +N / bubble | **Yapıldı**   |
| **F2.5** | Hop-1 bubble (6+2 / kalabalık hub), radial                        | **Yapıldı**   |
| **F3**   | `screen_service`, `process_service`; semantic zoom                | **Yapılmadı** |
| **F4**   | `service_owner`, gerçek onay / inbox                              | **Yapılmadı** |


---



## 8. Sık sorular

**Yalnız** `public` **görünüyor.** Restore veya PG sürümü; şema `env`.

**Servis vs metod.** Servis = iş / onay. Metod = bytecode. Entry = `java_method.service_definition_id IS NOT NULL`.

**Project vs** `package_name`**.** Project/jar organizasyonu; `package_name` Java paketi.

**Konumsuz.** `service_definition` var, hiçbir metod `service_definition_id` ile bakmıyor → jar join yok. Ağaçta ayrı kök; arama isimden bulur. Harita `sd-{id}` ile çalışır (kenar varsa).

---



## 9. Referans SQL

```sql
-- Aktif servis
SELECT COUNT(*) FROM env.service_definition WHERE status = 1;

-- Entry metod
SELECT COUNT(*) FROM env.java_method WHERE service_definition_id IS NOT NULL;

-- Konumsuz (ağaç sayacı ile aynı)
SELECT COUNT(*) AS konumsuz
FROM env.service_definition sd
WHERE sd.status = 1
  AND NOT EXISTS (
    SELECT 1 FROM env.java_method jm
    WHERE jm.service_definition_id = sd.id
  );

SELECT sd.id, sd.service_name
FROM env.service_definition sd
WHERE sd.status = 1
  AND NOT EXISTS (
    SELECT 1 FROM env.java_method jm
    WHERE jm.service_definition_id = sd.id
  )
ORDER BY sd.service_name
LIMIT 100;

-- Konumlu (karşılaştırma)
SELECT COUNT(DISTINCT sd.id) AS konumlu
FROM env.service_definition sd
JOIN env.java_method jm ON jm.service_definition_id = sd.id
WHERE sd.status = 1;

-- Hop-1 yoğunluğu
SELECT sd_callee.service_name, COUNT(DISTINCT sd_caller.id) AS caller_services
FROM env.call_edge ce
JOIN env.java_method mc ON mc.id = ce.caller_id
JOIN env.java_method md ON md.id = ce.callee_id
JOIN env.service_definition sd_caller ON sd_caller.id = mc.service_definition_id
JOIN env.service_definition sd_callee ON sd_callee.id = md.service_definition_id
WHERE sd_caller.id <> sd_callee.id
GROUP BY sd_callee.id, sd_callee.service_name
ORDER BY 2 DESC
LIMIT 20;

-- Ekranlar (F3)
SELECT s.name, s.page_type
FROM env.screen_service ss
JOIN env.screen s ON s.oid = ss.screen_oid
WHERE ss.service_oid = :service_definition_id;
```

---



## 10. Ölçümler (2026-09-01 dump)


| Metrik                      | Değer                                     |
| --------------------------- | ----------------------------------------- |
| Aktif servis                | 37.850                                    |
| Cross-service incoming olan | 3.215                                     |
| Hop-1 incoming max          | **249** (`PROPOSAL_MAIN_GET`, `sd-37504`) |
| Hop-1 p90 / p99             | 5 / ~25                                   |
| Cross-service outgoing max  | 36                                        |
| Entry metodu olmayan        | **25.734**                                |
| Metod in-degree max         | 7.534                                     |
| Metod in-degree p99         | 32                                        |
| Metod out-degree max        | 1.287                                     |


Smoke: `PROPOSAL_MAIN_GET` (249), `ss.md` hop-1 seti (3/5/7/10/15/20), izole servis.

**İzole servis:** haritada yalnız pivot; Tablo boş — hata değil. Internal çağrı metod haritasında.

**Hub UX (yapıldı):** kısmi hop-1 + bubble (`+N servis`) + banner + Tablo tam liste. Radial: hop halkaları ayrı yarıçap; 9–40 komşu → 6 servis + 2 bubble.

---



## 11. Bilinçli dışarıda

Screen/process UI, gerçek owner, otomatik ingest, Redis/graph DB, force-directed, edge bundling, Cmd+K.

---



## 12. Sıradaki işler

Kod tarafı F1/F2/F2.5 kapandı. Kalanlar:

### 1. DB — entry metod bağını netleştirmek

~25.734 aktif serviste `java_method.service_definition_id` boş. Jar / grup / kapsam filtresi bu yüzden kurulamıyor (filtre `unknown` veya liste dışı).

Ingest tarafında her iş servisi için en az bir entry metod FK’si beklenir. Uygulama yedek `class_name` eşlemesini boot’ta çalıştırmıyor.

İletilecek SQL: §9 konumsuz sorguları.

### 2. Jar / konumsuz sayfalama

Jar altı servis ve `Konumsuz servisler` ilk **100**; servis dışı metod ~50. Devamı yok. Offset / “daha fazla” eklenebilir.

### 3. F3 / F4


|        |                                                                         |
| ------ | ----------------------------------------------------------------------- |
| **F3** | `screen_service` / `process_service` keşif yüzeyi; radial semantic zoom |
| **F4** | `service_owner` → gerçek owner, CR / inbox                              |


Onay birimi servis id kalır; F3 onay listesine girmez.

---



## Jar başına servis sayısı (DB)

Şema: `env`. Servis ↔ jar: `java_method.service_definition_id` → `java_class.artifact_id`.

```sql
-- 1) Jar başına servis sayısı
SELECT a.id AS artifact_id,
       a.name AS jar_name,
       p.project_name,
       pg.project_group_name,
       COUNT(DISTINCT sd.id) AS service_count
FROM env.artifact a
JOIN env.project p ON p.id = a.project_id
JOIN env.project_group pg ON pg.id = p.project_group_id
JOIN env.java_class jc ON jc.artifact_id = a.id
JOIN env.java_method jm ON jm.class_id = jc.id AND jm.service_definition_id IS NOT NULL
JOIN env.service_definition sd ON sd.id = jm.service_definition_id AND sd.status = 1
GROUP BY a.id, a.name, p.project_name, pg.project_group_name
ORDER BY service_count DESC
LIMIT 50;
```

```sql
-- 3) Özet istatistik
SELECT COUNT(*) AS jar_with_services,
       MAX(n) AS max_per_jar,
       ROUND(AVG(n)) AS avg_per_jar,
       SUM(CASE WHEN n > 100 THEN 1 ELSE 0 END) AS jars_over_100
FROM (
  SELECT a.id, COUNT(DISTINCT sd.id) AS n
  FROM env.artifact a
  JOIN env.java_class jc ON jc.artifact_id = a.id
  JOIN env.java_method jm ON jm.class_id = jc.id AND jm.service_definition_id IS NOT NULL
  JOIN env.service_definition sd ON sd.id = jm.service_definition_id AND sd.status = 1
  GROUP BY a.id
) t;
```

```sql
-- 4) Tek jar detay (id yerine kendi artifact_id)
SELECT sd.id, sd.service_name
FROM env.service_definition sd
JOIN env.java_method jm ON jm.service_definition_id = sd.id
JOIN env.java_class jc ON jc.id = jm.class_id
WHERE jc.artifact_id = :artifact_id AND sd.status = 1
ORDER BY sd.service_name
LIMIT 120;  -- UI şu an 100 kesiyor
```

**Jar ağacında 100+ servis:** `treeService.listServicesForArtifact` → `LIMIT 100 OFFSET 0`, `ORDER BY service_name`. 101+ servis **görünmez** (sayfalama yok). Arama global; jar içi “devamını yükle” henüz yok.

---



## 14. Ortak katalog — kalıcılık (localStorage yerine DB)

> Özet tablo: [ss.md](../ss.md) — “Local vs global”.  
> Amaç: Ekip verisi (not, rota, akış takibi, servis günlüğü) **tarayıcıya değil inventory_db’ye** yazılsın; okuma API ile herkese aynı.



### 14.1 Kapsam üçlüsü


| Kapsam                   | Kim görür                          | Örnek                                                 |
| ------------------------ | ---------------------------------- | ----------------------------------------------------- |
| **Katalog (ortak)**      | Yetkili yazar, intranet okur       | Süreç overlay, servis change log, paylaşılan workflow |
| **Kullanıcı**            | Sadece o kullanıcı (SSO `user_id`) | Kişisel favori, MRU, tema                             |
| **Ekip / rol (ileride)** | Grup üyeleri                       | “Kredi ekibi” rotaları, ortak DWH favori klasörü      |


Şema önerilerinde `owner_user_id` NULL → **ortak katalog**; dolu → kişisel kayıt.

### 14.2 Süreç (`env.process` ve ilişkili)

**Mevcut (PAR ingest):** `no`, `name`, `description_tr`, `process_definition`, `process_type`, … — bkz. §13.

**Eklenecek kolon:**


| Kolon               | Tip     | Okuma                                                   | Yazma                                        | Not                                                                              |
| ------------------- | ------- | ------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `node_descriptions` | `jsonb` | `GET /api/processes/:no/flow` içinde `nodeDescriptions` | `PATCH /api/processes/:no/node-descriptions` | Karar/görev/… doğal dil notu. PAR ingest **güncellemez**. Key: XML düğüm `name`. |


**Yeni tablo — kullanıcı akış rotaları** (bugün: `sd-process-flow-routes:v1` localStorage):


| Tablo (öneri)            | Alanlar                                                                                                                                                                              | Okuma                                                 | Yazma                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------- |
| `env.process_user_route` | `id uuid PK`, `process_no`, `name`, `status` (`draft`/`completed`), `state jsonb` (visits+cursor), `graph_updated_at`, `owner_user_id`, `created_at`, `updated_at`, `last_opened_at` | `GET /api/process-routes?processNo=` veya `GET …/:id` | `POST` / `PATCH` / `DELETE` |


- `state`: `SavedProcessRoute.state` ile aynı (`web/src/processRouteStore.ts`).
- Paylaşımlı rota için ileride `visibility` veya `team_id` kolonu eklenebilir.

**Yeni tablo — süreç haritası notları** (bugün: `sd-process-flow-map:{no}` / canvas UI):


| Tablo (öneri)          | Alanlar                                                                                                            | Okuma                              | Yazma                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------ |
| `env.process_map_note` | `id`, `process_no`, `text`, `x`, `y`, `width`, `height`, `collapsed`, `sort_order`, `author_user_id`, `updated_at` | `GET /api/processes/:no/map-notes` | `PUT` (replace list) veya CRUD |


- Elle sürüklenen **düğüm koordinatları** (`sd-process-flow-v3:{no}`) isteğe bağlı: ya local kalır ya `process_layout jsonb` (düşük öncelik).



### 14.3 Servis katalogu

**Mevcut / F4:**


| Kaynak                                   | Alan             | Okuma                   | Yazma                                                        |
| ---------------------------------------- | ---------------- | ----------------------- | ------------------------------------------------------------ |
| `service_definition.service_description` | İşlev özeti (TR) | `GET /api/services/:id` | Ingest veya `PATCH` (editör) — bugün DB doluysa UI read-only |
| `service_owner`                          | IT / BU sahibi   | F4 join                 | Ingest                                                       |


**Eklenecek — servis değişiklik günlüğü** (bugün: localStorage `sd-service-changes:{serviceId}`):


| Tablo (öneri)            | Alanlar                                                                                                                  | Okuma                           | Yazma                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------- |
| `env.service_change_log` | `id`, `service_definition_id` FK, `commit` (metin), `kinds text[]`, `kind_details jsonb`, `author_user_id`, `created_at` | `GET /api/services/:id/changes` | `POST` / `PATCH` / `DELETE` (canEdit) |


**Eklenecek — servis serbest not** (ss.md “service_notes”, henüz UI yok):


| Tablo (öneri)      | Alanlar                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `env.service_note` | `id`, `service_definition_id`, `body`, `author_user_id`, `updated_at` |




### 14.4 Akış Takibi (WorkflowsPanel)

Bugün: `sd-service-workflows:v1` — klasörler, adımlar, girdi/çıkış alanları, dokümanlar (`workflowStore.ts`).


| Seçenek           | Tablo                                 | Alanlar                                                                               | API                      |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| **A — tek belge** | `env.catalog_workflow_doc`            | `id` (singleton veya `scope`), `payload jsonb`, `version`, `updated_at`, `updated_by` | `GET/PUT /api/workflows` |
| **B — normalize** | `workflow_folder`, `workflow_step`, … | İlişkisel                                                                             | Daha ağır; sonra         |


Öneri: **A** ile başla (mevcut store JSON’u olduğu gibi); ekip tek paylaşımlı belge.

### 14.5 Değişiklik talebi / inbox (onay)

Bugün: `server/src/changeRequests.ts` — **process bellek**, restart sıfırlar.


| Tablo (öneri)             | Rol                                    |
| ------------------------- | -------------------------------------- |
| `env.change_request`      | Talep başlığı, requester, batch, durum |
| `env.change_request_task` | Etkilenen servis başına task           |
| `env.change_request_flag` | Owner yanıtı (accepted/rejected/…)     |
| `env.inbox_notification`  | Kullanıcı bildirimi                    |


Okuma/yazma: mevcut CR/inbox UI → REST; F4/F5 + issue entegrasyonu ([entegrasyon.md](./entegrasyon.md)).

### 14.6 DWH lineage favorileri

Bugün: `sd-dwh-favorites:v1` localStorage.


| Tablo (öneri)             | Alanlar                                                                                      | API                          |
| ------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| `env.dwh_favorite_folder` | `id`, `name`, `owner_user_id` (NULL=?)                                                       | `GET/PUT /api/dwh/favorites` |
| `env.dwh_favorite_table`  | `id`, `table_id` (stage ref), `canonical_name`, `alias`, `folder_ids jsonb`, `owner_user_id` | aynı                         |


DWH **veri** katmanı (`stage`) değişmez; yalnızca kullanıcı/ekip **işaretleme** inventory_db’de.

### 14.7 Servis favorileri / kısayollar

Bugün: `sd-service-shortcuts:v1`.


| Tablo (öneri)               | Alanlar                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `env.user_service_shortcut` | `user_id`, `service_definition_id`, `alias`, `folder_id`, `sort_order` |
| `env.user_shortcut_folder`  | `id`, `user_id`, `name`, `tone`                                        |


Kişisel başlangıç; ileride `team_id` ile paylaşımlı klasör.

### 14.8 Bilinçli local kalabilir (DB şart değil)


| Veri                                 | Anahtar / kod                        |
| ------------------------------------ | ------------------------------------ |
| Tema                                 | `APP_THEME_KEY`                      |
| İlişki tablosu mod / sütun genişliği | `RelationshipTable` COL/MODE storage |
| Oturum içi ziyaret yolu (Cmd+K)      | `visitTrail` — bellek                |
| Kişisel MRU (opsiyonel DB)           | `sd-service-recents`                 |




### 14.9 Migration / ingest kuralları

1. `ALTER TABLE env.process ADD COLUMN IF NOT EXISTS node_descriptions jsonb;` — `server/sql/node_descriptions_migration.sql`
2. Yeni tablolar: [catalog-persistence.md](./catalog-persistence.md) (açıklama + DDL bölüm bölüm) · çalıştır: `server/sql/catalog_persistence.sql`.
3. **PAR ingest** ve servis dump import: yalnızca teknik kolonlar; `node_descriptions`**, change log, workflow doc, rotalar** güncellenmez.
4. İsteğe bağlı: localStorage → DB **bir kerelik import** script (kullanıcı bazlı).



### 14.10 API özeti (hedef)


| Veri                            | GET                                            | Yazma                       |
| ------------------------------- | ---------------------------------------------- | --------------------------- |
| Süreç akış + düğüm açıklamaları | `/api/processes/:no/flow` (`nodeDescriptions`) | `PATCH …/node-descriptions` |
| Akış rotaları                   | `/api/process-routes`                          | `POST`, `PATCH`, `DELETE`   |
| Harita notları                  | `/api/processes/:no/map-notes`                 | `PUT` veya CRUD             |
| Servis change log               | `/api/services/:id/changes`                    | `POST`, `PATCH`, `DELETE`   |
| Workflow belgesi                | `/api/workflows`                               | `PUT` (canEdit)             |
| CR / inbox                      | `/api/change-requests`, `/api/inbox`           | mevcut akış, DB-backed      |
| DWH favoriler                   | `/api/dwh/favorites`                           | `PUT`                       |
| Kısayollar                      | `/api/me/shortcuts`                            | `PUT`                       |


Tüm yazma uçları: `canEdit` / SSO; okuma intranet kullanıcıları.

### 14.11 Uygulama durumu (bugün)


| Özellik                                      | Kalıcılık                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Süreç XML, servis, call-graph                | DB — **var**                                                                                                               |
| `node_descriptions` (drawer adım açıklaması) | DB — **var** (`process.node_descriptions`, `PATCH /api/processes/:no/node-descriptions`)                                   |
| Akış rotaları                                | **localStorage** — `web/src/processRouteStore.ts` (`sd-process-flow-routes:v1`); §14.2 tablo hedefi                        |
| Akış Takibi (WorkflowsPanel)                 | **localStorage** — `web/src/workflowStore.ts` (`sd-service-workflows:v1`)                                                  |
| Süreç haritası yapışkan notları              | **localStorage** — `web/src/components/processFlowNotes.ts` (`sd-process-flow-map:{no}`)                                   |
| Tam akış canvas UI (not + elle konum)        | **localStorage** — `ProcessFlowCanvas` / `sd-process-flow-v3:{no}` (not metni DB’ye taşınabilir; konum isteğe bağlı local) |
| Servis değişiklik günlüğü                    | **localStorage** — `ServiceChangeLog.tsx` (`sd-service-changes:{id}`)                                                      |
| Değişiklik talebi / inbox                    | **bellek** — `server/src/changeRequests.ts` (restart sıfırlar)                                                             |
| DWH / servis favorileri, kısayollar          | **localStorage** — bkz. §14.6–14.7                                                                                         |
| Servis işlev özeti (DB boşken)               | **localStorage** yedek; `service_description` doluysa DB                                                                   |


**Karıştırılmasın:** Drawer’dan yazılan süreç **adım açıklaması** DB’de görünür; bu, rotalar veya workflow ile aynı katman değildir.

### 14.12 Ingest — `node_descriptions` korunur

PAR / süreç XML ingest (`ingest-process-par.mjs`, `processFlowService` güncellemeleri) yalnızca teknik kolonları yazar (`process_definition`, `description_tr`, …). `node_descriptions` **güncelleme listesinde yoktur** — XML yenilense bile ekip notları silinmez. Manuel SQL veya yanlışlıkla genişletilmiş UPDATE dışında ezilmemesi tasarım gereğidir.